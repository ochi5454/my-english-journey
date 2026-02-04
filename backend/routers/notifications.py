from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.config import Settings, get_settings
from backend.core.database import get_db
from backend.services.mail_service import send_overtime_emails
from backend.services.excel import fetch_grid_for_key
from backend.services.overtime import aggregate_overtime_by_employee
from backend.services.overtime_alert import (
    check_overtime_alerts,
    AlertLevel,
    alerts_to_dict,
    get_alert_summary,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class OvertimeEmailRequest(BaseModel):
    """残業メール送信リクエスト"""
    data_date: Optional[date] = None  # データ基準日（指定なしなら送信日）


class AlertNotificationRequest(BaseModel):
    """アラート通知リクエスト"""
    min_level: str = "warning"  # 最小アラートレベル
    send_email: bool = False    # メール送信するか（将来用）
    dry_run: bool = True        # ドライラン（実際には送信しない）


@router.post("/overtime-email")
def send_overtime_email(
    request: Optional[OvertimeEmailRequest] = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings)
):
    """
    org6ごとに残業明細メールを全メンバーに送信
    添付ファイル: Excel + PDF

    data_date: データ基準日（例: 2月15日のデータを16日に送る場合は2025-02-15を指定）
               指定しない場合は送信日が使用されます
    """
    try:
        data_date = request.data_date if request else None
        result = send_overtime_emails(db, settings, data_date=data_date)
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
