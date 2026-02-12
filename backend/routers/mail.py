"""メール送信API"""
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user, get_user_tokens
from backend.core.config import Settings
from backend.models.user import User
from backend.models.mail_log import MailSendLog
from backend.models.attachment import TempAttachment
from backend.models.scheduled_mail import ScheduledMail
from backend.services.graph_mail_service import send_mail_via_graph, GraphMailAttachment
from backend.routers.attachments import get_attachment_data

router = APIRouter(prefix="/mail", tags=["mail"])
settings = Settings()


# Pydantic Schemas
class AttachmentInfo(BaseModel):
    id: str
    filename: str


class SendMailRequest(BaseModel):
    to: List[str]
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    subject: str
    body: str
    body_type: str = "text"  # text / html
    attachments: Optional[List[AttachmentInfo]] = None
    session_id: Optional[str] = None  # 添付ファイル取得用


class SendMailResponse(BaseModel):
    success: bool
    message_id: Optional[str] = None
    sent_at: str
    error: Optional[str] = None


class MailLogResponse(BaseModel):
    id: int
    to_addresses: List[str]
    cc_addresses: Optional[List[str]]
    bcc_addresses: Optional[List[str]]
    subject: str
    body: str
    status: str
    error_message: Optional[str]
    sent_at: str

    class Config:
        from_attributes = True


@router.post("/send", response_model=SendMailResponse)
async def send_mail(
    data: SendMailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """メールを送信"""
    # ユーザーのアクセストークンを取得
    tokens = get_user_tokens(db, current_user.id)
    if not tokens or not tokens.get("access_token"):
        raise HTTPException(
            status_code=403,
            detail="Entra ID access token not available. Please login with Entra ID to send emails."
        )

    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token")
    token_expires_at = tokens.get("expires_at")

    # 添付ファイルの準備
    graph_attachments = []
    attachment_info_for_log = []

    if data.attachments:
        for att_info in data.attachments:
            file_data, filename, content_type = get_attachment_data(db, att_info.id, current_user.id)
            if file_data:
                graph_attachments.append(GraphMailAttachment(
                    filename=filename or att_info.filename,
                    data=file_data,
                    content_type=content_type or "application/octet-stream",
                ))
                attachment_info_for_log.append({
                    "filename": filename or att_info.filename,
                    "size": len(file_data),
                })

    # session_idから添付ファイルを取得（attachmentsが指定されていない場合）
    if not data.attachments and data.session_id:
        session_attachments = db.query(TempAttachment).filter(
            TempAttachment.session_id == data.session_id,
        ).filter(
            (TempAttachment.user_id == current_user.id) | (TempAttachment.user_id.is_(None))
        ).all()

        for att in session_attachments:
            file_data, filename, content_type = get_attachment_data(db, att.id, current_user.id)
            if file_data:
                graph_attachments.append(GraphMailAttachment(
                    filename=filename,
                    data=file_data,
                    content_type=content_type or "application/octet-stream",
                ))
                attachment_info_for_log.append({
                    "filename": filename,
                    "size": len(file_data),
                })

    # 全宛先リスト（To + Cc + Bcc）
    all_recipients = list(data.to)
    cc_addresses = data.cc or []
    bcc_addresses = data.bcc or []

    # 送信ログを先に作成（pending状態）
    log = MailSendLog(
        user_id=current_user.id,
        to_addresses=data.to,
        cc_addresses=cc_addresses if cc_addresses else None,
        bcc_addresses=bcc_addresses if bcc_addresses else None,
        subject=data.subject,
        body=data.body,
        body_type=data.body_type,
        attachments=attachment_info_for_log if attachment_info_for_log else None,
        status="pending",
    )
    db.add(log)
    db.flush()

    try:
        # Microsoft Graph APIでメール送信
        # Note: Graph APIのsendMailはTo/Cc/Bccを別々に指定可能だが、
        # 現在のgraph_mail_serviceは単純なtoリストのみ対応
        # 必要に応じてgraph_mail_serviceを拡張

        result = await send_mail_via_graph(
            settings=settings,
            to=data.to,  # Toのみ（Cc/Bccは別途対応が必要）
            subject=data.subject,
            body=data.body,
            attachments=graph_attachments if graph_attachments else None,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
        )

        # 成功
        log.status = "success"
        log.graph_message_id = result.get("message_id")
        log.sent_at = datetime.utcnow()
        db.commit()

        # セッションの添付ファイルを削除（送信成功後）
        if data.session_id:
            from backend.routers.attachments import delete_session_attachments
            # 非同期で削除（エラーは無視）
            try:
                session_attachments = db.query(TempAttachment).filter(
                    TempAttachment.session_id == data.session_id,
                ).all()
                for att in session_attachments:
                    import os
                    if os.path.exists(att.file_path):
                        os.remove(att.file_path)
                    db.delete(att)
                db.commit()
            except Exception:
                pass

        return SendMailResponse(
            success=True,
            message_id=result.get("message_id"),
            sent_at=log.sent_at.isoformat(),
        )

    except Exception as e:
        # 失敗
        log.status = "failed"
        log.error_message = str(e)
        log.sent_at = datetime.utcnow()
        db.commit()

        return SendMailResponse(
            success=False,
            sent_at=log.sent_at.isoformat(),
            error=str(e),
        )


@router.get("/logs", response_model=List[MailLogResponse])
async def list_mail_logs(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """送信履歴を取得"""
    query = db.query(MailSendLog).filter(
        MailSendLog.user_id == current_user.id
    )

    if status:
        query = query.filter(MailSendLog.status == status)

    logs = query.order_by(MailSendLog.sent_at.desc()).offset(offset).limit(limit).all()

    return [
        MailLogResponse(
            id=log.id,
            to_addresses=log.to_addresses,
            cc_addresses=log.cc_addresses,
            bcc_addresses=log.bcc_addresses,
            subject=log.subject,
            body=log.body[:200] + "..." if len(log.body) > 200 else log.body,
            status=log.status,
            error_message=log.error_message,
            sent_at=log.sent_at.isoformat(),
        )
        for log in logs
    ]


@router.get("/logs/{log_id}", response_model=MailLogResponse)
async def get_mail_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """送信履歴詳細を取得"""
    log = db.query(MailSendLog).filter(
        MailSendLog.id == log_id,
        MailSendLog.user_id == current_user.id,
    ).first()

    if not log:
        raise HTTPException(status_code=404, detail="Mail log not found")

    return MailLogResponse(
        id=log.id,
        to_addresses=log.to_addresses,
        cc_addresses=log.cc_addresses,
        bcc_addresses=log.bcc_addresses,
        subject=log.subject,
        body=log.body,
        status=log.status,
        error_message=log.error_message,
        sent_at=log.sent_at.isoformat(),
    )


# =============================================
# 予約送信関連のスキーマとエンドポイント
# =============================================

class ScheduleMailRequest(BaseModel):
    """予約送信リクエスト"""
    to: List[str]
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    subject: str
    body: str
    body_type: str = "text"
    attachments: Optional[List[AttachmentInfo]] = None
    session_id: Optional[str] = None
    scheduled_at: datetime  # ISO 8601 形式
    timezone: str = "Asia/Tokyo"


class ScheduleMailResponse(BaseModel):
    """予約送信レスポンス"""
    id: int
    scheduled_at: str
    timezone: str
    status: str
    created_at: str


class ScheduledMailListResponse(BaseModel):
    """予約送信一覧レスポンス"""
    id: int
    to_addresses: List[str]
    subject: str
    scheduled_at: str
    timezone: str
    status: str
    created_at: str


class ScheduledMailDetailResponse(BaseModel):
    """予約送信詳細レスポンス"""
    id: int
    to_addresses: List[str]
    cc_addresses: Optional[List[str]]
    bcc_addresses: Optional[List[str]]
    subject: str
    body: str
    body_type: str
    attachments: Optional[List[dict]]
    scheduled_at: str
    timezone: str
    status: str
    error_message: Optional[str]
    created_at: str
    updated_at: str
    sent_at: Optional[str]

    class Config:
        from_attributes = True


class ScheduleMailUpdate(BaseModel):
    """予約送信更新リクエスト"""
    to: Optional[List[str]] = None
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    timezone: Optional[str] = None


@router.post("/schedule", response_model=ScheduleMailResponse, status_code=201)
async def schedule_mail(
    data: ScheduleMailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """メールを予約送信"""
    # scheduled_at が未来であることを確認
    now = datetime.utcnow()
    # タイムゾーン情報を持つ datetime を UTC に変換
    if data.scheduled_at.tzinfo is not None:
        scheduled_utc = data.scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
    else:
        # タイムゾーン情報がない場合は UTC として扱う
        scheduled_utc = data.scheduled_at

    if scheduled_utc <= now:
        raise HTTPException(
            status_code=400,
            detail="予約日時は現在時刻より後を指定してください"
        )

    # 添付ファイル情報の準備
    attachment_info = []
    if data.attachments:
        for att_info in data.attachments:
            file_data, filename, content_type = get_attachment_data(db, att_info.id, current_user.id)
            if file_data:
                # 予約送信用に添付ファイル情報を保存
                # ファイルパスは TempAttachment から取得
                temp_att = db.query(TempAttachment).filter(
                    TempAttachment.id == att_info.id
                ).first()
                attachment_info.append({
                    "id": att_info.id,
                    "filename": filename or att_info.filename,
                    "content_type": content_type,
                    "file_path": temp_att.file_path if temp_att else None,
                })

    # session_id から添付ファイルを取得（attachments が指定されていない場合）
    if not data.attachments and data.session_id:
        session_attachments = db.query(TempAttachment).filter(
            TempAttachment.session_id == data.session_id,
        ).filter(
            (TempAttachment.user_id == current_user.id) | (TempAttachment.user_id.is_(None))
        ).all()

        for att in session_attachments:
            attachment_info.append({
                "id": att.id,
                "filename": att.filename,
                "content_type": att.content_type,
                "file_path": att.file_path,
            })

    # 予約送信レコードを作成
    scheduled_mail = ScheduledMail(
        user_id=current_user.id,
        scheduled_at=scheduled_utc,
        timezone=data.timezone,
        to_addresses=data.to,
        cc_addresses=data.cc if data.cc else None,
        bcc_addresses=data.bcc if data.bcc else None,
        subject=data.subject,
        body=data.body,
        body_type=data.body_type,
        attachments=attachment_info if attachment_info else None,
        status="pending",
    )
    db.add(scheduled_mail)
    db.commit()
    db.refresh(scheduled_mail)

    return ScheduleMailResponse(
        id=scheduled_mail.id,
        scheduled_at=scheduled_mail.scheduled_at.isoformat(),
        timezone=scheduled_mail.timezone,
        status=scheduled_mail.status,
        created_at=scheduled_mail.created_at.isoformat(),
    )


@router.get("/schedule", response_model=List[ScheduledMailListResponse])
async def list_scheduled_mails(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """予約送信一覧を取得"""
    query = db.query(ScheduledMail).filter(
        ScheduledMail.user_id == current_user.id
    )

    if status:
        query = query.filter(ScheduledMail.status == status)

    mails = query.order_by(ScheduledMail.scheduled_at.asc()).offset(offset).limit(limit).all()

    return [
        ScheduledMailListResponse(
            id=m.id,
            to_addresses=m.to_addresses,
            subject=m.subject,
            scheduled_at=m.scheduled_at.isoformat(),
            timezone=m.timezone,
            status=m.status,
            created_at=m.created_at.isoformat(),
        )
        for m in mails
    ]


@router.get("/schedule/{schedule_id}", response_model=ScheduledMailDetailResponse)
async def get_scheduled_mail(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """予約送信詳細を取得"""
    scheduled_mail = db.query(ScheduledMail).filter(
        ScheduledMail.id == schedule_id,
        ScheduledMail.user_id == current_user.id,
    ).first()

    if not scheduled_mail:
        raise HTTPException(status_code=404, detail="予約送信が見つかりません")

    return ScheduledMailDetailResponse(
        id=scheduled_mail.id,
        to_addresses=scheduled_mail.to_addresses,
        cc_addresses=scheduled_mail.cc_addresses,
        bcc_addresses=scheduled_mail.bcc_addresses,
        subject=scheduled_mail.subject,
        body=scheduled_mail.body,
        body_type=scheduled_mail.body_type,
        attachments=scheduled_mail.attachments,
        scheduled_at=scheduled_mail.scheduled_at.isoformat(),
        timezone=scheduled_mail.timezone,
        status=scheduled_mail.status,
        error_message=scheduled_mail.error_message,
        created_at=scheduled_mail.created_at.isoformat(),
        updated_at=scheduled_mail.updated_at.isoformat() if scheduled_mail.updated_at else scheduled_mail.created_at.isoformat(),
        sent_at=scheduled_mail.sent_at.isoformat() if scheduled_mail.sent_at else None,
    )


@router.put("/schedule/{schedule_id}", response_model=ScheduledMailDetailResponse)
async def update_scheduled_mail(
    schedule_id: int,
    data: ScheduleMailUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """予約送信を更新（pending状態のみ）"""
    scheduled_mail = db.query(ScheduledMail).filter(
        ScheduledMail.id == schedule_id,
        ScheduledMail.user_id == current_user.id,
    ).first()

    if not scheduled_mail:
        raise HTTPException(status_code=404, detail="予約送信が見つかりません")

    if scheduled_mail.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"ステータスが '{scheduled_mail.status}' の予約は更新できません"
        )

    # フィールドを更新
    if data.to is not None:
        scheduled_mail.to_addresses = data.to
    if data.cc is not None:
        scheduled_mail.cc_addresses = data.cc
    if data.bcc is not None:
        scheduled_mail.bcc_addresses = data.bcc
    if data.subject is not None:
        scheduled_mail.subject = data.subject
    if data.body is not None:
        scheduled_mail.body = data.body
    if data.scheduled_at is not None:
        if data.scheduled_at.tzinfo is not None:
            scheduled_utc = data.scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            scheduled_utc = data.scheduled_at
        if scheduled_utc <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="予約日時は現在時刻より後を指定してください")
        scheduled_mail.scheduled_at = scheduled_utc
    if data.timezone is not None:
        scheduled_mail.timezone = data.timezone

    db.commit()
    db.refresh(scheduled_mail)

    return ScheduledMailDetailResponse(
        id=scheduled_mail.id,
        to_addresses=scheduled_mail.to_addresses,
        cc_addresses=scheduled_mail.cc_addresses,
        bcc_addresses=scheduled_mail.bcc_addresses,
        subject=scheduled_mail.subject,
        body=scheduled_mail.body,
        body_type=scheduled_mail.body_type,
        attachments=scheduled_mail.attachments,
        scheduled_at=scheduled_mail.scheduled_at.isoformat(),
        timezone=scheduled_mail.timezone,
        status=scheduled_mail.status,
        error_message=scheduled_mail.error_message,
        created_at=scheduled_mail.created_at.isoformat(),
        updated_at=scheduled_mail.updated_at.isoformat() if scheduled_mail.updated_at else scheduled_mail.created_at.isoformat(),
        sent_at=scheduled_mail.sent_at.isoformat() if scheduled_mail.sent_at else None,
    )


@router.delete("/schedule/{schedule_id}", status_code=204)
async def cancel_scheduled_mail(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """予約送信をキャンセル"""
    scheduled_mail = db.query(ScheduledMail).filter(
        ScheduledMail.id == schedule_id,
        ScheduledMail.user_id == current_user.id,
    ).first()

    if not scheduled_mail:
        raise HTTPException(status_code=404, detail="予約送信が見つかりません")

    if scheduled_mail.status not in ["pending", "failed"]:
        raise HTTPException(
            status_code=400,
            detail=f"ステータスが '{scheduled_mail.status}' の予約はキャンセルできません"
        )

    scheduled_mail.status = "cancelled"
    scheduled_mail.cancelled_at = datetime.utcnow()
    db.commit()
