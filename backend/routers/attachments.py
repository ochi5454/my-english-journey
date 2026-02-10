"""添付ファイル管理API"""
import os
import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.core.config import Settings, DATA_DIR
from backend.models.user import User
from backend.models.attachment import TempAttachment

router = APIRouter(prefix="/attachments", tags=["attachments"])
settings = Settings()

# 添付ファイル保存ディレクトリ
ATTACHMENTS_DIR = DATA_DIR / "attachments"
ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

# ファイルサイズ制限
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB
MAX_TOTAL_SIZE = 35 * 1024 * 1024  # 35MB


# Pydantic Schemas
class AttachmentResponse(BaseModel):
    id: str
    session_id: str
    filename: str
    content_type: Optional[str]
    file_size: Optional[int]
    source: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class AutoAttachmentRequest(BaseModel):
    session_id: str
    filename: str
    source: Optional[str] = "agent"


# Endpoints
@router.post("/upload", response_model=AttachmentResponse)
async def upload_attachment(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """手動でファイルをアップロード"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    # ファイルサイズチェック
    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds limit ({MAX_FILE_SIZE // 1024 // 1024}MB)"
        )

    # セッション内の合計サイズチェック
    existing_attachments = db.query(TempAttachment).filter(
        TempAttachment.session_id == session_id,
        TempAttachment.user_id == current_user.id,
    ).all()

    total_size = sum(a.file_size or 0 for a in existing_attachments) + file_size
    if total_size > MAX_TOTAL_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Total attachment size exceeds limit ({MAX_TOTAL_SIZE // 1024 // 1024}MB)"
        )

    # ファイル保存
    attachment_id = str(uuid.uuid4())
    file_ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    stored_filename = f"{attachment_id}.{file_ext}" if file_ext else attachment_id
    file_path = ATTACHMENTS_DIR / stored_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # DB保存
    attachment = TempAttachment(
        id=attachment_id,
        session_id=session_id,
        user_id=current_user.id,
        filename=file.filename,
        content_type=file.content_type,
        file_size=file_size,
        file_path=str(file_path),
        source="manual",
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentResponse(
        id=attachment.id,
        session_id=attachment.session_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        source=attachment.source,
        created_at=attachment.created_at.isoformat(),
    )


@router.post("/auto", response_model=AttachmentResponse)
async def auto_attach(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    source: str = Form(default="agent"),
    db: Session = Depends(get_db),
):
    """外部エージェントからの自動添付（APIキー認証も可）"""
    # この場合はユーザー認証なしでも可能（セッションIDで紐付け）
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds limit ({MAX_FILE_SIZE // 1024 // 1024}MB)"
        )

    # ファイル保存
    attachment_id = str(uuid.uuid4())
    file_ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    stored_filename = f"{attachment_id}.{file_ext}" if file_ext else attachment_id
    file_path = ATTACHMENTS_DIR / stored_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # DB保存（user_idはNone）
    attachment = TempAttachment(
        id=attachment_id,
        session_id=session_id,
        user_id=None,
        filename=file.filename,
        content_type=file.content_type,
        file_size=file_size,
        file_path=str(file_path),
        source=source,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentResponse(
        id=attachment.id,
        session_id=attachment.session_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        source=attachment.source,
        created_at=attachment.created_at.isoformat(),
    )


@router.get("/session/{session_id}", response_model=List[AttachmentResponse])
async def list_session_attachments(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """セッションの添付ファイル一覧"""
    attachments = db.query(TempAttachment).filter(
        TempAttachment.session_id == session_id,
    ).filter(
        (TempAttachment.user_id == current_user.id) | (TempAttachment.user_id.is_(None))
    ).all()

    return [
        AttachmentResponse(
            id=a.id,
            session_id=a.session_id,
            filename=a.filename,
            content_type=a.content_type,
            file_size=a.file_size,
            source=a.source,
            created_at=a.created_at.isoformat(),
        )
        for a in attachments
    ]


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """添付ファイルを削除"""
    attachment = db.query(TempAttachment).filter(
        TempAttachment.id == attachment_id,
    ).filter(
        (TempAttachment.user_id == current_user.id) | (TempAttachment.user_id.is_(None))
    ).first()

    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # ファイル削除
    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)

    db.delete(attachment)
    db.commit()


@router.delete("/session/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session_attachments(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """セッションの全添付ファイルを削除"""
    attachments = db.query(TempAttachment).filter(
        TempAttachment.session_id == session_id,
    ).filter(
        (TempAttachment.user_id == current_user.id) | (TempAttachment.user_id.is_(None))
    ).all()

    for attachment in attachments:
        if os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
        db.delete(attachment)

    db.commit()


def get_attachment_data(db: Session, attachment_id: str, user_id: int) -> tuple:
    """添付ファイルのデータを取得（内部用）"""
    attachment = db.query(TempAttachment).filter(
        TempAttachment.id == attachment_id,
    ).filter(
        (TempAttachment.user_id == user_id) | (TempAttachment.user_id.is_(None))
    ).first()

    if not attachment:
        return None, None, None

    if not os.path.exists(attachment.file_path):
        return None, None, None

    with open(attachment.file_path, "rb") as f:
        data = f.read()

    return data, attachment.filename, attachment.content_type


def cleanup_expired_attachments(db: Session):
    """期限切れの添付ファイルをクリーンアップ"""
    expired = db.query(TempAttachment).filter(
        TempAttachment.expires_at < datetime.utcnow()
    ).all()

    for attachment in expired:
        if os.path.exists(attachment.file_path):
            try:
                os.remove(attachment.file_path)
            except Exception:
                pass
        db.delete(attachment)

    db.commit()
