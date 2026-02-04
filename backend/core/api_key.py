"""
APIキー認証モジュール

外部システム連携用のAPIキー認証を提供
"""
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.orm import Session
from fastapi import HTTPException, Security, Depends
from fastapi.security import APIKeyHeader

from backend.core.database import Base, get_db
from backend.core.audit import audit_action, AuditAction


class APIKey(Base):
    """APIキーテーブル"""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)  # キーの名前（識別用）
    key_hash = Column(String(64), nullable=False, unique=True)  # SHA-256ハッシュ
    key_prefix = Column(String(8), nullable=False)  # キーの先頭8文字（識別用）
    user_id = Column(Integer, nullable=True)  # 紐づくユーザーID（オプション）
    scopes = Column(Text, nullable=True)  # カンマ区切りのスコープ
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # 有効期限
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


# APIキーヘッダー
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def generate_api_key() -> tuple[str, str]:
    """
    新しいAPIキーを生成

    Returns:
        (平文キー, ハッシュ済みキー)
    """
    # 32バイトのランダムキーを生成
    raw_key = secrets.token_urlsafe(32)
    # プレフィックスを追加（識別用）
    api_key = f"ragt_{raw_key}"
    # ハッシュ化
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    return api_key, key_hash


def hash_api_key(api_key: str) -> str:
    """APIキーをハッシュ化"""
    return hashlib.sha256(api_key.encode()).hexdigest()


def create_api_key(
    db: Session,
    name: str,
    user_id: Optional[int] = None,
    scopes: Optional[list[str]] = None,
    expires_in_days: Optional[int] = None
) -> tuple[str, APIKey]:
    """
    新しいAPIキーを作成

    Args:
        db: データベースセッション
        name: キーの名前
        user_id: 紐づくユーザーID
        scopes: 許可するスコープのリスト
        expires_in_days: 有効期限（日数）

    Returns:
        (平文キー, APIKeyオブジェクト)
        ※平文キーは一度しか表示されない
    """
    api_key, key_hash = generate_api_key()

    expires_at = None
    if expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

    db_key = APIKey(
        name=name,
        key_hash=key_hash,
        key_prefix=api_key[:12],  # "ragt_" + 7文字
        user_id=user_id,
        scopes=",".join(scopes) if scopes else None,
        expires_at=expires_at,
    )

    db.add(db_key)
    db.commit()
    db.refresh(db_key)

    return api_key, db_key


def verify_api_key(
    db: Session,
    api_key: str,
    required_scope: Optional[str] = None
) -> Optional[APIKey]:
    """
    APIキーを検証

    Args:
        db: データベースセッション
        api_key: 検証するAPIキー
        required_scope: 必要なスコープ

    Returns:
        有効なAPIKeyオブジェクト、無効な場合はNone
    """
    key_hash = hash_api_key(api_key)

    db_key = db.query(APIKey).filter(
        APIKey.key_hash == key_hash,
        APIKey.is_active == True
    ).first()

    if not db_key:
        return None

    # 有効期限チェック
    if db_key.expires_at and db_key.expires_at < datetime.utcnow():
        return None

    # スコープチェック
    if required_scope and db_key.scopes:
        allowed_scopes = db_key.scopes.split(",")
        if required_scope not in allowed_scopes and "*" not in allowed_scopes:
            return None

    # 最終使用日時を更新
    db_key.last_used_at = datetime.utcnow()
    db.commit()

    return db_key


def get_api_key_auth(
    api_key: str = Security(api_key_header),
    db: Session = Depends(get_db)
) -> Optional[APIKey]:
    """
    FastAPI依存性注入用のAPIキー認証

    Usage:
        @router.get("/protected")
        def protected_endpoint(api_key: APIKey = Depends(get_api_key_auth)):
            ...
    """
    if not api_key:
        return None

    db_key = verify_api_key(db, api_key)
    return db_key


def require_api_key(scope: Optional[str] = None):
    """
    APIキー必須のエンドポイント用デコレータ

    Usage:
        @router.get("/protected")
        def protected_endpoint(api_key: APIKey = Depends(require_api_key("read"))):
            ...
    """
    def dependency(
        api_key: str = Security(api_key_header),
        db: Session = Depends(get_db)
    ) -> APIKey:
        if not api_key:
            raise HTTPException(
                status_code=401,
                detail="APIキーが必要です",
                headers={"WWW-Authenticate": "ApiKey"}
            )

        db_key = verify_api_key(db, api_key, required_scope=scope)

        if not db_key:
            raise HTTPException(
                status_code=401,
                detail="無効なAPIキーまたは権限がありません",
                headers={"WWW-Authenticate": "ApiKey"}
            )

        return db_key

    return dependency


def revoke_api_key(db: Session, key_id: int) -> bool:
    """APIキーを無効化"""
    db_key = db.query(APIKey).filter(APIKey.id == key_id).first()
    if db_key:
        db_key.is_active = False
        db.commit()
        return True
    return False


def list_api_keys(db: Session, user_id: Optional[int] = None) -> list[APIKey]:
    """APIキー一覧を取得"""
    query = db.query(APIKey)
    if user_id:
        query = query.filter(APIKey.user_id == user_id)
    return query.order_by(APIKey.created_at.desc()).all()
