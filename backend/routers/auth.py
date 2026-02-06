import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.config import Settings
from backend.core.audit import audit_action, AuditAction
from backend.models.user import User
from backend.models.token_store import TokenStore
from backend.utils.security import verify_password
from backend.utils.crypto import encrypt_json, decrypt_json


router = APIRouter(prefix="/auth", tags=["auth"])


def get_settings() -> Settings:
    return Settings()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_payload(payload: dict, secret: str) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).digest()
    return f"{_b64url(raw)}.{_b64url(sig)}"


def verify_payload(token: str, secret: str) -> dict:
    try:
        raw_part, sig_part = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid state") from exc
    raw = _b64url_decode(raw_part)
    expected_sig = hmac.new(secret.encode(), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_sig, _b64url_decode(sig_part)):
        raise HTTPException(status_code=400, detail="State signature mismatch")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid state payload") from exc


def build_authorize_url(
    settings: Settings,
    redirect_uri: str,
    state_token: str,
    code_challenge: str,
) -> str:
    authority = f"https://login.microsoftonline.com/{settings.entra_tenant_id}"
    params = {
        "client_id": settings.entra_client_id,
        "response_type": "code",
        "response_mode": "query",
        "redirect_uri": redirect_uri,
        "scope": settings.entra_scope,
        "state": state_token,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    query = httpx.QueryParams(params)
    return f"{authority}/oauth2/v2.0/authorize?{query}"


def _session_payload_from_user(
    user: dict, settings: Settings, has_entra_tokens: bool = False
) -> dict:
    payload = {
        "sub": str(user.get("id")),
        "name": user.get("name") or "",
        "email": user.get("email") or "",
        "is_admin": bool(user.get("is_admin", False)),
        "exp": int(time.time()) + settings.session_max_age,
        "has_entra_tokens": has_entra_tokens,
    }
    return payload


def save_tokens_to_db(db: Session, user_sub: str, tokens: dict) -> None:
    """トークンをデータベースに保存（Cookieサイズ制限回避）"""
    existing = db.query(TokenStore).filter(TokenStore.user_sub == user_sub).first()
    if existing:
        existing.access_token = tokens.get("access_token")
        existing.refresh_token = tokens.get("refresh_token")
        existing.token_expires_at = int(time.time()) + tokens.get("expires_in", 3600)
    else:
        token_store = TokenStore(
            user_sub=user_sub,
            access_token=tokens.get("access_token"),
            refresh_token=tokens.get("refresh_token"),
            token_expires_at=int(time.time()) + tokens.get("expires_in", 3600),
        )
        db.add(token_store)
    db.commit()


def _issue_session_response(
    user_payload: dict, settings: Settings, has_entra_tokens: bool = False
) -> JSONResponse:
    session_payload = _session_payload_from_user(user_payload, settings, has_entra_tokens)
    # Encrypt session payload for confidentiality in transit/storage
    session_token = encrypt_json(session_payload)
    # クライアントに返すレスポンスにはトークンを含めない（セキュリティ）
    user_response = {
        "sub": session_payload.get("sub"),
        "name": session_payload.get("name"),
        "email": session_payload.get("email"),
        "is_admin": session_payload.get("is_admin"),
    }
    resp = JSONResponse({"ok": True, "user": user_response})
    resp.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        max_age=settings.session_max_age,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return resp


class CallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: Optional[str] = None


class BasicLoginRequest(BaseModel):
    email: str
    password: str


class WhoAmIResponse(BaseModel):
    id: str
    name: str
    email: str
    is_admin: bool


@router.get("/entra/login")
async def entra_login(request: Request, redirect_uri: Optional[str] = None, settings: Settings = Depends(get_settings)):
    if not (settings.entra_tenant_id and settings.entra_client_id):
        raise HTTPException(status_code=500, detail="Entra settings are not configured")

    effective_redirect = redirect_uri or settings.entra_redirect_uri
    if not effective_redirect:
        # fallback to current origin
        effective_redirect = str(request.url_for("auth_callback")).replace("/entra/callback", "/callback")

    code_verifier = _b64url(os.urandom(32))
    code_challenge = _b64url(hashlib.sha256(code_verifier.encode()).digest())
    state_payload = {
        "ts": int(time.time()),
        "cv": code_verifier,
        "redirect_uri": effective_redirect,
    }
    state_token = sign_payload(state_payload, settings.session_secret_key)
    auth_url = build_authorize_url(settings, effective_redirect, state_token, code_challenge)
    return RedirectResponse(auth_url)


async def exchange_token(
    settings: Settings, code: str, redirect_uri: str, code_verifier: str
) -> dict:
    authority = f"https://login.microsoftonline.com/{settings.entra_tenant_id}"
    token_endpoint = f"{authority}/oauth2/v2.0/token"
    data = {
        "client_id": settings.entra_client_id,
        "client_secret": settings.entra_client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
        "scope": settings.entra_scope,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(token_endpoint, data=data)
    if resp.status_code != 200:
        detail = resp.text
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {detail}")
    return resp.json()


async def fetch_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info")
    return resp.json()


@router.post("/entra/callback", name="auth_callback")
async def entra_callback(
    payload: CallbackRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
):
    if not (settings.entra_client_id and settings.entra_client_secret and settings.entra_tenant_id):
        raise HTTPException(status_code=500, detail="Entra settings are not configured")

    state_data = verify_payload(payload.state, settings.session_secret_key)
    code_verifier = state_data.get("cv")
    saved_redirect = state_data.get("redirect_uri")
    redirect_uri = payload.redirect_uri or saved_redirect or settings.entra_redirect_uri
    if not (code_verifier and redirect_uri):
        raise HTTPException(status_code=400, detail="Invalid state/redirect_uri")

    token = await exchange_token(settings, payload.code, redirect_uri, code_verifier)
    access_token = token.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing access token")

    profile = await fetch_user_info(access_token)
    user_sub = profile.get("id")
    user = {
        "id": user_sub,
        "name": profile.get("displayName") or profile.get("givenName") or "",
        "email": profile.get("mail") or profile.get("userPrincipalName") or "",
    }

    # トークンをデータベースに保存（Cookieサイズ制限回避）
    save_tokens_to_db(db, user_sub, token)

    return _issue_session_response(user, settings, has_entra_tokens=True)


@router.post("/login/basic")
def basic_login(
    request: Request,
    payload: BasicLoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    user: Optional[User] = db.query(User).filter(User.email == payload.email).one_or_none()
    if not user or not user.is_active:
        # ログイン失敗を監査ログに記録
        audit_action(
            db=db,
            action=AuditAction.LOGIN_FAILED,
            request=request,
            details={"email": payload.email, "reason": "user_not_found_or_inactive"},
            status="failed"
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, user.password_hash, user.password_salt):
        # パスワード不一致を監査ログに記録
        audit_action(
            db=db,
            action=AuditAction.LOGIN_FAILED,
            request=request,
            user=user,
            details={"reason": "invalid_password"},
            status="failed"
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # ログイン成功を監査ログに記録
    audit_action(
        db=db,
        action=AuditAction.LOGIN_SUCCESS,
        request=request,
        user=user,
    )

    user_payload = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_admin": user.is_admin,
    }
    return _issue_session_response(user_payload, settings)


@router.post("/logout")
def logout(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
):
    # セッションからユーザー情報を取得（可能であれば）
    user_info = None
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            user_info = decrypt_json(token)
        except Exception:
            pass

    # ログアウトを監査ログに記録
    audit_action(
        db=db,
        action=AuditAction.LOGOUT,
        request=request,
        details={"user_id": user_info.get("sub") if user_info else None},
    )

    resp = JSONResponse({"ok": True})
    resp.delete_cookie(key=settings.session_cookie_name, path="/")
    return resp

@router.get("/me")
def who_am_i(request: Request, settings: Settings = Depends(get_settings)):
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        session_data = decrypt_json(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session_data.get("exp")
    if not exp or exp < int(time.time()):
        raise HTTPException(status_code=401, detail="Session expired")
    return {"ok": True, "user": session_data}
