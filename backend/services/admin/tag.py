from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import Optional
from backend.models.score_ofinterviewer import InterviewerRoleFocusItem
from backend.schemas.tag import InterviewerRoleFocusCreate, InterviewerRoleFocusUpdate


def get_all_focus_items(db: Session, division_prefix: Optional[str] = None, role: Optional[str] = None):
    """QAタグ一覧を取得"""
    query = db.query(InterviewerRoleFocusItem)

    if division_prefix:
        query = query.filter(InterviewerRoleFocusItem.division_prefix == division_prefix)
    if role:
        query = query.filter(InterviewerRoleFocusItem.role == role)

    return query.order_by(InterviewerRoleFocusItem.id.asc()).all()


def create_focus_item(db: Session, data: InterviewerRoleFocusCreate):
    """QAタグを新規作成"""
    exists = db.query(InterviewerRoleFocusItem).filter_by(focus_id=data.focus_id).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"同一の focus_id '{data.focus_id}' は既に存在します")

    try:
        new_item = InterviewerRoleFocusItem(**data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return new_item
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB登録中にエラー: {str(e)}")


def update_focus_item(db: Session, item_id: int, data: InterviewerRoleFocusUpdate):
    """QAタグを更新"""
    item = db.query(InterviewerRoleFocusItem).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="指定されたタグが見つかりません")

    for k, v in data.dict(exclude_unset=True).items():
        setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return item


def delete_focus_item(db: Session, item_id: int):
    """QAタグを削除"""
    item = db.query(InterviewerRoleFocusItem).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="指定されたタグが見つかりません")

    db.delete(item)
    db.commit()
    return {"message": "タグを削除しました"}