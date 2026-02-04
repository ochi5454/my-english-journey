"""
APIキー管理エンドポイント

管理者がAPIキーを作成・管理するためのAPI
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.api_key import (
    APIKey,
    create_api_key,
    revoke_api_key,
    list_api_keys,
)
from backend.core.audit import audit_action, AuditAction
from backend.utils.crypto import decrypt_json
from backend.core.config import Settings


router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def get_settings() -> Settings:
    return Settings()


def get_current_user(request: Request, settings: Settings = Depends(get_settings)):
    """現在のユーザーを取得（管理者チェック用）"""
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=401, detail="認証が必要です")
    try:
        session_data = decrypt_json(token)
    except Exception:
        raise HTTPException(status_code=401, detail="無効なセッション")

    if not session_data.get("is_admin"):
        raise HTTPException(status_code=403, detail="管理者権限が必要です")

    return session_data


class CreateAPIKeyRequest(BaseModel):
    """APIキー作成リクエスト"""
    name: str
    scopes: Optional[List[str]] = None
    expires_in_days: Optional[int] = None


class CreateAPIKeyResponse(BaseModel):
    """APIキー作成レスポンス"""
    id: int
    name: str
    api_key: str  # 一度だけ表示される平文キー
    key_prefix: str
    scopes: Optional[str]
    expires_at: Optional[str]
    message: str


class APIKeyInfo(BaseModel):
    """APIキー情報"""
    id: int
    name: str
    key_prefix: str
    scopes: Optional[str]
    is_active: bool
    expires_at: Optional[str]
    last_used_at: Optional[str]
    created_at: str


class APIKeyListResponse(BaseModel):
    """APIキー一覧レスポンス"""
    keys: List[APIKeyInfo]
    total: int


@router.post("/", response_model=CreateAPIKeyResponse)
def create_new_api_key(
    request: Request,
    payload: CreateAPIKeyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    新しいAPIキーを作成（管理者のみ）

    注意: 返されるapi_keyは一度しか表示されません。安全に保管してください。
    """
    user_id = int(current_user.get("sub", 0))

    api_key, db_key = create_api_key(
        db=db,
        name=payload.name,
        user_id=user_id,
        scopes=payload.scopes,
        expires_in_days=payload.expires_in_days
    )

    # 監査ログ
    audit_action(
        db=db,
        action=AuditAction.SETTINGS_CHANGE,
        request=request,
        resource_type="api_key",
        resource_id=str(db_key.id),
        details={
            "action": "create",
            "name": payload.name,
            "scopes": payload.scopes,
        }
    )

    return CreateAPIKeyResponse(
        id=db_key.id,
        name=db_key.name,
        api_key=api_key,
        key_prefix=db_key.key_prefix,
        scopes=db_key.scopes,
        expires_at=db_key.expires_at.isoformat() if db_key.expires_at else None,
        message="APIキーが作成されました。このキーは一度しか表示されません。安全に保管してください。"
    )


@router.get("/", response_model=APIKeyListResponse)
def list_all_api_keys(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    APIキー一覧を取得（管理者のみ）
    """
    keys = list_api_keys(db)

    return APIKeyListResponse(
        keys=[
            APIKeyInfo(
                id=k.id,
                name=k.name,
                key_prefix=k.key_prefix,
                scopes=k.scopes,
                is_active=k.is_active,
                expires_at=k.expires_at.isoformat() if k.expires_at else None,
                last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
                created_at=k.created_at.isoformat()
            )
            for k in keys
        ],
        total=len(keys)
    )


@router.delete("/{key_id}")
def delete_api_key(
    key_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    APIキーを無効化（管理者のみ）
    """
    success = revoke_api_key(db, key_id)

    if not success:
        raise HTTPException(status_code=404, detail="APIキーが見つかりません")

    # 監査ログ
    audit_action(
        db=db,
        action=AuditAction.SETTINGS_CHANGE,
        request=request,
        resource_type="api_key",
        resource_id=str(key_id),
        details={"action": "revoke"}
    )

    return {"message": "APIキーを無効化しました", "key_id": key_id}
