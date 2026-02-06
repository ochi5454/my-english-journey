"""
共通の依存性（FastAPI Depends用）
"""
import time
from typing import Optional
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.config import Settings, get_settings
from backend.core.database import get_db
from backend.utils.crypto import decrypt_json


class CurrentUser(BaseModel):
    """現在のログインユーザー情報"""
    sub: str
    name: str
    email: str
    is_admin: bool = False
    # Entra IDトークン（メール送信用、Basic認証の場合はNone）
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expires_at: Optional[int] = None

    def has_valid_token(self) -> bool:
        """有効なアクセストークンがあるか"""
        if not self.access_token:
            return False
        if self.token_expires_at and self.token_expires_at < int(time.time()):
            return False
        return True


def _load_tokens_from_db(db: Session, user_sub: str) -> dict:
    """データベースからトークンを読み込む"""
    from backend.models.token_store import TokenStore
    token_store = db.query(TokenStore).filter(TokenStore.user_sub == user_sub).first()
    if token_store:
        return {
            "access_token": token_store.access_token,
            "refresh_token": token_store.refresh_token,
            "token_expires_at": token_store.token_expires_at,
        }
    return {}


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
) -> CurrentUser:
    """
    セッションCookieから現在のユーザーを取得
    認証されていない場合は401エラー
    """
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=401, detail="認証が必要です")

    try:
        session_data = decrypt_json(token)
    except Exception:
        raise HTTPException(status_code=401, detail="無効なセッション")

    # セッション有効期限チェック
    exp = session_data.get("exp")
    if not exp or exp < int(time.time()):
        raise HTTPException(status_code=401, detail="セッションの有効期限が切れています")

    user_sub = str(session_data.get("sub", ""))

    # Entraトークンがある場合はDBから読み込む
    tokens = {}
    if session_data.get("has_entra_tokens"):
        tokens = _load_tokens_from_db(db, user_sub)

    return CurrentUser(
        sub=user_sub,
        name=session_data.get("name", ""),
        email=session_data.get("email", ""),
        is_admin=session_data.get("is_admin", False),
        access_token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_expires_at=tokens.get("token_expires_at"),
    )


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
) -> Optional[CurrentUser]:
    """
    セッションCookieから現在のユーザーを取得（任意）
    認証されていない場合はNoneを返す
    """
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None

    try:
        session_data = decrypt_json(token)
    except Exception:
        return None

    exp = session_data.get("exp")
    if not exp or exp < int(time.time()):
        return None

    user_sub = str(session_data.get("sub", ""))

    # Entraトークンがある場合はDBから読み込む
    tokens = {}
    if session_data.get("has_entra_tokens"):
        tokens = _load_tokens_from_db(db, user_sub)

    return CurrentUser(
        sub=user_sub,
        name=session_data.get("name", ""),
        email=session_data.get("email", ""),
        is_admin=session_data.get("is_admin", False),
        access_token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_expires_at=tokens.get("token_expires_at"),
    )


def require_admin(
    current_user: CurrentUser = Depends(get_current_user)
) -> CurrentUser:
    """
    管理者権限を要求する依存性
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="管理者権限が必要です")
    return current_user
