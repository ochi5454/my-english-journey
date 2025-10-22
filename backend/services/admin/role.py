from sqlalchemy.orm import Session
from fastapi import HTTPException
from backend.models.checksheet import ChecksheetRoleTitle
from backend.schemas.role import RoleTitleCreate, RoleTitleUpdate


def fetch_all_roles(db: Session):
    """ロール一覧を取得"""
    roles = db.query(ChecksheetRoleTitle).order_by(ChecksheetRoleTitle.order).all()
    if not roles:
        raise HTTPException(status_code=404, detail="ロールデータが見つかりません")
    return roles


def insert_role(db: Session, role_data: RoleTitleCreate):
    """ロールを新規追加"""
    existing = db.query(ChecksheetRoleTitle).filter(
        ChecksheetRoleTitle.value == role_data.value
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="同じ value のロールが既に存在します")

    new_role = ChecksheetRoleTitle(
        value=role_data.value,
        label=role_data.label,
        order=role_data.order or 0
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role


def modify_role(db: Session, role_id: int, update_data: RoleTitleUpdate):
    """ロールを更新"""
    db_role = db.query(ChecksheetRoleTitle).filter(
        ChecksheetRoleTitle.id == role_id
    ).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="指定されたロールが見つかりません")

    for field, value in update_data.dict(exclude_unset=True).items():
        setattr(db_role, field, value)

    db.commit()
    db.refresh(db_role)
    return db_role


def remove_role(db: Session, role_id: int):
    """ロールを削除"""
    db_role = db.query(ChecksheetRoleTitle).filter(
        ChecksheetRoleTitle.id == role_id
    ).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="指定されたロールが見つかりません")

    db.delete(db_role)
    db.commit()
    return {"message": "ロールを削除しました"}