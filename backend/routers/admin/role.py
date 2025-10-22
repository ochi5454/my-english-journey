from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from backend.core.database import get_db
from backend.schemas.role import RoleTitleOut, RoleTitleCreate, RoleTitleUpdate
from backend.services.admin.role import fetch_all_roles, insert_role, modify_role, remove_role

router = APIRouter(prefix="/admin/roles")


@router.get("", response_model=List[RoleTitleOut])
def list_roles(db: Session = Depends(get_db)):
    """ロール一覧を取得"""
    return fetch_all_roles(db)


@router.post("", response_model=RoleTitleOut)
def create_role(data: RoleTitleCreate, db: Session = Depends(get_db)):
    """ロールを新規追加"""
    return insert_role(db, data)


@router.put("/{role_id}", response_model=RoleTitleOut)
def update_role(role_id: int, data: RoleTitleUpdate, db: Session = Depends(get_db)):
    """ロールを更新"""
    return modify_role(db, role_id, data)


@router.delete("/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db)):
    """ロールを削除"""
    return remove_role(db, role_id)