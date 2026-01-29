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

from backend.core.config import Settings


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


class CallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: Optional[str] = None


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
async def entra_callback(payload: CallbackRequest, settings: Settings = Depends(get_settings)):
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
    user = {
        "id": profile.get("id"),
        "name": profile.get("displayName") or profile.get("givenName") or "",
        "email": profile.get("mail") or profile.get("userPrincipalName") or "",
    }

    session_payload = {
        "sub": user["id"],
        "name": user["name"],
        "email": user["email"],
        "exp": int(time.time()) + settings.session_max_age,
    }
    session_token = sign_payload(session_payload, settings.session_secret_key)

    resp = JSONResponse({"ok": True, "user": user})
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
