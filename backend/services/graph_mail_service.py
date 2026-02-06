"""
Microsoft Graph API を使用したメール送信サービス

委任されたアクセス許可 (Delegated permission) を使用してメールを送信します。
ログインユーザーのアクセストークンで /me/sendMail を呼び出します。
必要な権限: Mail.Send (Delegated)
"""
import base64
import logging
import time
from dataclasses import dataclass
from typing import List, Optional

import httpx

from backend.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class GraphMailAttachment:
    """メール添付ファイル"""
    filename: str
    data: bytes
    content_type: str


async def refresh_access_token(settings: Settings, refresh_token: str) -> dict:
    """
    リフレッシュトークンを使用してアクセストークンを更新

    Args:
        settings: アプリケーション設定
        refresh_token: リフレッシュトークン

    Returns:
        新しいトークン情報（access_token, refresh_token, expires_in）
    """
    token_url = f"https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0/token"

    data = {
        "client_id": settings.entra_client_id,
        "client_secret": settings.entra_client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": settings.entra_scope,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(token_url, data=data)

    if response.status_code != 200:
        logger.error(f"Token refresh failed: {response.text}")
        raise ValueError(f"トークンの更新に失敗しました。再度ログインしてください。")

    return response.json()


async def send_mail_via_graph(
    settings: Settings,
    to: List[str],
    subject: str,
    body: str,
    attachments: Optional[List[GraphMailAttachment]] = None,
    access_token: str = None,
    refresh_token: str = None,
    token_expires_at: int = None,
) -> dict:
    """
    Microsoft Graph API でメール送信（委任されたアクセス許可を使用）

    ログインユーザーのアクセストークンを使用して /me/sendMail を呼び出します。
    これにより、ユーザー自身のメールボックスからメールが送信されます。

    Args:
        settings: アプリケーション設定
        to: 宛先メールアドレスのリスト
        subject: メール件名
        body: メール本文
        attachments: 添付ファイルのリスト
        access_token: ユーザーのアクセストークン（Entra IDログイン時に取得）
        refresh_token: リフレッシュトークン（トークン更新用）
        token_expires_at: トークンの有効期限（Unix timestamp）

    Returns:
        送信結果

    Raises:
        ValueError: アクセストークンがない場合（Entra IDログイン必須）
    """
    # アクセストークンの確認
    if not access_token:
        raise ValueError(
            "アクセストークンがありません。"
            "Entra IDでログインしてから実行してください。"
            "（Basic認証ではメール送信できません）"
        )

    # トークンの有効期限チェック（5分のバッファ）
    current_token = access_token
    if token_expires_at and token_expires_at < int(time.time()) + 300:
        if refresh_token:
            logger.info("Access token expired or expiring soon, refreshing...")
            try:
                new_tokens = await refresh_access_token(settings, refresh_token)
                current_token = new_tokens.get("access_token")
                logger.info("Token refreshed successfully")
            except Exception as e:
                logger.error(f"Token refresh failed: {e}")
                raise ValueError(
                    "アクセストークンの有効期限が切れており、更新にも失敗しました。"
                    "再度Entra IDでログインしてください。"
                )
        else:
            logger.warning("Token expired but no refresh token available")

    # メッセージを構築
    message = {
        "message": {
            "subject": subject,
            "body": {
                "contentType": "Text",
                "content": body,
            },
            "toRecipients": [
                {"emailAddress": {"address": addr}} for addr in to
            ],
        },
        "saveToSentItems": "true",
    }

    # 添付ファイルを追加
    if attachments:
        message["message"]["attachments"] = []
        for att in attachments:
            message["message"]["attachments"].append({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": att.filename,
                "contentType": att.content_type,
                "contentBytes": base64.b64encode(att.data).decode("utf-8"),
            })

    # Graph API でメール送信（/me/sendMail を使用）
    send_url = "https://graph.microsoft.com/v1.0/me/sendMail"
    logger.info(f"Sending mail via Graph API /me/sendMail: to={to}, subject={subject[:50]}...")

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            send_url,
            json=message,
            headers={
                "Authorization": f"Bearer {current_token}",
                "Content-Type": "application/json",
            },
        )

    if response.status_code == 202:
        logger.info(f"Mail sent successfully to {to}")
        return {"success": True, "message": "Mail sent successfully"}
    else:
        logger.error(f"Failed to send mail: {response.status_code} - {response.text}")
        error_detail = response.text
        if "MailboxNotEnabledForRESTAPI" in error_detail:
            raise ValueError(
                "メールボックスがREST APIに対応していません。"
                "Exchange Onlineライセンスを確認してください。"
            )
        elif "ErrorAccessDenied" in error_detail:
            raise ValueError(
                "メール送信の権限がありません。"
                "Mail.Send権限が付与されているか確認してください。"
                "また、再度ログインして権限を許可してください。"
            )
        elif "InvalidAuthenticationToken" in error_detail:
            raise ValueError(
                "認証トークンが無効です。"
                "再度Entra IDでログインしてください。"
            )
        else:
            raise ValueError(f"メール送信に失敗しました: {response.status_code} - {error_detail}")
