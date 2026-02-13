"""署名管理API"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models.user import User
from backend.models.signature import Signature

router = APIRouter(prefix="/signatures", tags=["signatures"])


# Pydantic Schemas
class SignatureCreate(BaseModel):
    name: str
    content: str
    is_default: bool = False


class SignatureUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_default: Optional[bool] = None


class SignatureResponse(BaseModel):
    id: int
    name: str
    content: str
    is_default: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# API Endpoints
@router.get("", response_model=List[SignatureResponse])
async def list_signatures(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """署名一覧を取得"""
    signatures = db.query(Signature).filter(
        Signature.user_id == current_user.id
    ).order_by(Signature.is_default.desc(), Signature.created_at.desc()).all()

    return [
        SignatureResponse(
            id=sig.id,
            name=sig.name,
            content=sig.content,
            is_default=sig.is_default,
            created_at=sig.created_at.isoformat(),
            updated_at=sig.updated_at.isoformat(),
        )
        for sig in signatures
    ]


@router.post("", response_model=SignatureResponse, status_code=status.HTTP_201_CREATED)
async def create_signature(
    data: SignatureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """署名を作成"""
    # デフォルト署名を設定する場合、既存のデフォルトを解除
    if data.is_default:
        db.query(Signature).filter(
            Signature.user_id == current_user.id,
            Signature.is_default == True
        ).update({"is_default": False})

    signature = Signature(
        user_id=current_user.id,
        name=data.name,
        content=data.content,
        is_default=data.is_default,
    )
    db.add(signature)
    db.commit()
    db.refresh(signature)

    return SignatureResponse(
        id=signature.id,
        name=signature.name,
        content=signature.content,
        is_default=signature.is_default,
        created_at=signature.created_at.isoformat(),
        updated_at=signature.updated_at.isoformat(),
    )


@router.get("/{signature_id}", response_model=SignatureResponse)
async def get_signature(
    signature_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """署名詳細を取得"""
    signature = db.query(Signature).filter(
        Signature.id == signature_id,
        Signature.user_id == current_user.id,
    ).first()

    if not signature:
        raise HTTPException(status_code=404, detail="署名が見つかりません")

    return SignatureResponse(
        id=signature.id,
        name=signature.name,
        content=signature.content,
        is_default=signature.is_default,
        created_at=signature.created_at.isoformat(),
        updated_at=signature.updated_at.isoformat(),
    )


@router.put("/{signature_id}", response_model=SignatureResponse)
async def update_signature(
    signature_id: int,
    data: SignatureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """署名を更新"""
    signature = db.query(Signature).filter(
        Signature.id == signature_id,
        Signature.user_id == current_user.id,
    ).first()

    if not signature:
        raise HTTPException(status_code=404, detail="署名が見つかりません")

    # デフォルト署名を設定する場合、既存のデフォルトを解除
    if data.is_default:
        db.query(Signature).filter(
            Signature.user_id == current_user.id,
            Signature.id != signature_id,
            Signature.is_default == True
        ).update({"is_default": False})

    # フィールドを更新
    if data.name is not None:
        signature.name = data.name
    if data.content is not None:
        signature.content = data.content
    if data.is_default is not None:
        signature.is_default = data.is_default

    db.commit()
    db.refresh(signature)

    return SignatureResponse(
        id=signature.id,
        name=signature.name,
        content=signature.content,
        is_default=signature.is_default,
        created_at=signature.created_at.isoformat(),
        updated_at=signature.updated_at.isoformat(),
    )


@router.delete("/{signature_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_signature(
    signature_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """署名を削除"""
    signature = db.query(Signature).filter(
        Signature.id == signature_id,
        Signature.user_id == current_user.id,
    ).first()

    if not signature:
        raise HTTPException(status_code=404, detail="署名が見つかりません")

    db.delete(signature)
    db.commit()


@router.get("/default/current", response_model=Optional[SignatureResponse])
async def get_default_signature(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """デフォルト署名を取得"""
    signature = db.query(Signature).filter(
        Signature.user_id == current_user.id,
        Signature.is_default == True
    ).first()

    if not signature:
        return None

    return SignatureResponse(
        id=signature.id,
        name=signature.name,
        content=signature.content,
        is_default=signature.is_default,
        created_at=signature.created_at.isoformat(),
        updated_at=signature.updated_at.isoformat(),
    )
