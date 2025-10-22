from sqlalchemy.orm import Session
from fastapi import HTTPException
from backend.models.checksheet import ChecksheetQualitativeItem
from backend.schemas.qualitative import (
    ChecksheetQualitativeItemCreate,
    ChecksheetQualitativeItemUpdate,
)

def get_all_qualitative_items(db: Session):
    """定性評価項目一覧を取得"""
    return db.query(ChecksheetQualitativeItem).order_by(ChecksheetQualitativeItem.id.asc()).all()


def create_qualitative_item(db: Session, data: ChecksheetQualitativeItemCreate):
    """定性評価項目を新規追加"""
    exists = db.query(ChecksheetQualitativeItem).filter(
        ChecksheetQualitativeItem.key == data.key
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="同じ key の項目が既に存在します")

    new_item = ChecksheetQualitativeItem(
        key=data.key,
        label=data.label,
        placeholder=data.placeholder,
        order=data.order,
        pay_type=data.pay_type or "daily_monthly",
        is_active=True,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


def update_qualitative_item(db: Session, item_id: str, data: ChecksheetQualitativeItemUpdate):
    """定性評価項目を更新"""
    item = db.query(ChecksheetQualitativeItem).filter(
        ChecksheetQualitativeItem.id == item_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="定性評価項目が見つかりません")

    update_data = data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


def delete_qualitative_item(db: Session, item_id: str):
    """定性評価項目を削除"""
    item = db.query(ChecksheetQualitativeItem).filter(
        ChecksheetQualitativeItem.id == item_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="定性評価項目が見つかりません")

    db.delete(item)
    db.commit()
    return {"message": "定性評価項目を削除しました"}