from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.core.database import get_db
from backend.schemas.tag import (
    InterviewerRoleFocusOut,
    InterviewerRoleFocusCreate,
    InterviewerRoleFocusUpdate,
)
from backend.services.admin import tag as tag_service

router = APIRouter(prefix="/admin/tag")


@router.get("", response_model=List[InterviewerRoleFocusOut])
def list_focus_items(
    division_prefix: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """QAタグ一覧を取得"""
    return tag_service.get_all_focus_items(db, division_prefix, role)


@router.post("", response_model=InterviewerRoleFocusOut)
def create_focus_item(data: InterviewerRoleFocusCreate, db: Session = Depends(get_db)):
    """QAタグを新規作成"""
    return tag_service.create_focus_item(db, data)


@router.put("/{item_id}", response_model=InterviewerRoleFocusOut)
def update_focus_item(item_id: int, data: InterviewerRoleFocusUpdate, db: Session = Depends(get_db)):
    """QAタグを更新"""
    return tag_service.update_focus_item(db, item_id, data)


@router.delete("/{item_id}")
def delete_focus_item(item_id: int, db: Session = Depends(get_db)):
    """QAタグを削除"""
    return tag_service.delete_focus_item(db, item_id)