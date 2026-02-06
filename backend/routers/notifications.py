import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.config import Settings, get_settings
from backend.core.database import get_db
from backend.core.dependencies import CurrentUser, get_current_user
from backend.services.mail_service import send_overtime_emails, preview_overtime_emails

logger = logging.getLogger(__name__)
from backend.services.excel import fetch_grid_for_key
from backend.services.overtime import aggregate_overtime_by_employee
from backend.services.overtime_alert import (
    check_overtime_alerts,
    AlertLevel,
    alerts_to_dict,
    get_alert_summary,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/debug/sender-info")
def get_sender_info(
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    デバッグ用: 現在のログインユーザーの送信元情報を確認
    """
    import time
    has_token = bool(current_user.access_token)
    token_valid = current_user.has_valid_token()
    token_expires_in = None
    if current_user.token_expires_at:
        token_expires_in = current_user.token_expires_at - int(time.time())

    return {
        "user_id": current_user.sub,
        "name": current_user.name,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "has_access_token": has_token,
        "token_valid": token_valid,
        "token_expires_in_seconds": token_expires_in,
        "has_refresh_token": bool(current_user.refresh_token),
        "can_send_email": token_valid,
        "note": "Entra IDログインでトークンを取得してください。Basic認証ではメール送信不可。"
    }


class OvertimeEmailRequest(BaseModel):
    """残業メール送信リクエスト"""
    data_date: Optional[date] = None  # データ基準日（指定なしなら送信日）


class AlertNotificationRequest(BaseModel):
    """アラート通知リクエスト"""
    min_level: str = "warning"  # 最小アラートレベル
    send_email: bool = False    # メール送信するか（将来用）
    dry_run: bool = True        # ドライラン（実際には送信しない）


@router.post("/overtime-email")
async def send_overtime_email(
    request: Optional[OvertimeEmailRequest] = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    org6ごとに残業明細メールを全メンバーに送信
    添付ファイル: Excel + PDF
    Microsoft Graph API を使用してメール送信（ログインユーザーの委任トークンを使用）

    data_date: データ基準日（例: 2月15日のデータを16日に送る場合は2025-02-15を指定）
               指定しない場合は送信日が使用されます
    """
    try:
        data_date = request.data_date if request else None
        # ログインユーザーのアクセストークンを使用（委任されたアクセス許可）
        if not current_user.has_valid_token():
            raise ValueError(
                "メール送信にはEntra IDログインが必要です。"
                "再度ログインしてください。"
            )
        logger.info(f"Send overtime email: user={current_user.name}, email={current_user.email}")
        result = await send_overtime_emails(
            db, settings, data_date=data_date,
            access_token=current_user.access_token,
            refresh_token=current_user.refresh_token,
            token_expires_at=current_user.token_expires_at
        )
        result["sender_email"] = current_user.email
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/overtime-email/preview")
def preview_overtime_email(
    request: Optional[OvertimeEmailRequest] = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    残業明細メールのプレビューを取得（送信はしない）

    送信前にメール内容を確認するためのエンドポイント。
    org6ごとの件名、本文、宛先、添付ファイル名を返します。

    data_date: データ基準日（例: 2月15日のデータを16日に送る場合は2025-02-15を指定）
               指定しない場合は送信日が使用されます
    """
    try:
        data_date = request.data_date if request else None
        result = preview_overtime_emails(db, settings, data_date=data_date)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/overtime-alerts")
def send_overtime_alerts(
    request: AlertNotificationRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
):
    """
    36協定アラート対象者への通知

    残業時間が閾値を超えている従業員を検出し、
    通知対象リストを返します。

    将来的にはメール送信機能を追加予定。
    """
    # 出退社時刻データを取得
    grid = fetch_grid_for_key(db, "punches")
    if not grid:
        raise HTTPException(
            status_code=400,
            detail="出退社時刻ファイルがアップロードされていません"
        )

    try:
        overtime_data = aggregate_overtime_by_employee(grid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # アラートレベルを変換
    level_map = {
        "info": AlertLevel.INFO,
        "warning": AlertLevel.WARNING,
        "danger": AlertLevel.DANGER,
        "critical": AlertLevel.CRITICAL,
    }
    alert_level = level_map.get(request.min_level.lower(), AlertLevel.WARNING)

    # アラートを生成
    alerts = check_overtime_alerts(overtime_data, min_level=alert_level)
    summary = get_alert_summary(alerts)

    # 通知対象リスト
    notification_targets = []
    for alert in alerts:
        notification_targets.append({
            "employee_id": alert.employee_id,
            "employee_name": alert.employee_name,
            "department": alert.department,
            "current_hours": alert.current_hours,
            "level": alert.level.value,
            "message": alert.message,
            "would_notify": not request.dry_run,
        })

    return {
        "dry_run": request.dry_run,
        "min_level": request.min_level,
        "targets": notification_targets,
        "summary": summary,
        "message": "ドライランモード: 実際の通知は送信されていません" if request.dry_run else "通知対象を検出しました",
    }
