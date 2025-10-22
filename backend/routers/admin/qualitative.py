from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from backend.core.database import get_db
from backend.schemas.qualitative import (
    ChecksheetQualitativeItemOut,
    ChecksheetQualitativeItemCreate,
    ChecksheetQualitativeItemUpdate,
)
from backend.services.admin import qualitative as qualitative_service

router = APIRouter(prefix="/admin/qualitative-items")


@router.get("", response_model=List[ChecksheetQualitativeItemOut])
def list_qualitative_items(db: Session = Depends(get_db)):
    """定性評価項目一覧を取得"""
    return qualitative_service.get_all_qualitative_items(db)


@router.post("", response_model=ChecksheetQualitativeItemOut)
def create_qualitative_item(data: ChecksheetQualitativeItemCreate, db: Session = Depends(get_db)):
    """定性評価項目を新規追加"""
    return qualitative_service.create_qualitative_item(db, data)


@router.put("/{item_id}", response_model=ChecksheetQualitativeItemOut)
def update_qualitative_item(item_id: str, data: ChecksheetQualitativeItemUpdate, db: Session = Depends(get_db)):
    """定性評価項目を更新"""
    return qualitative_service.update_qualitative_item(db, item_id, data)


@router.delete("/{item_id}")
def delete_qualitative_item(item_id: str, db: Session = Depends(get_db)):
    """定性評価項目を削除"""
    return qualitative_service.delete_qualitative_item(db, item_id)