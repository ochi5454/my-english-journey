"""メール送信API"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user, get_user_tokens
from backend.core.config import Settings
from backend.models.user import User
from backend.models.mail_log import MailSendLog
from backend.models.attachment import TempAttachment
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
