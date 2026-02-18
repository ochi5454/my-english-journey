"""テンプレート管理API"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.auth import get_current_user
from backend.models.user import User
from backend.models.email_template import EmailTemplate

router = APIRouter(prefix="/templates", tags=["templates"])


# Pydantic Schemas
class TemplateCreate(BaseModel):
    name: str
    category: Optional[str] = None
    subject: str
    body: str
    variables: Optional[List[str]] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    variables: Optional[List[str]] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    category: Optional[str]
    subject: str
    body: str
    variables: Optional[List[str]]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# Endpoints
@router.get("", response_model=List[TemplateResponse])
async def list_templates(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """自分のテンプレート一覧を取得"""
    query = db.query(EmailTemplate).filter(EmailTemplate.user_id == current_user.id)
    if category:
        query = query.filter(EmailTemplate.category == category)
    templates = query.order_by(EmailTemplate.updated_at.desc()).all()

    return [
        TemplateResponse(
            id=t.id,
            name=t.name,
            category=t.category,
            subject=t.subject,
            body=t.body,
            variables=t.variables,
            created_at=t.created_at.isoformat(),
            updated_at=t.updated_at.isoformat(),
        )
        for t in templates
    ]


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """テンプレートを作成"""
    template = EmailTemplate(
        user_id=current_user.id,
        name=data.name,
        category=data.category,
        subject=data.subject,
        body=data.body,
        variables=data.variables,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id,
        name=template.name,
        category=template.category,
        subject=template.subject,
        body=template.body,
        variables=template.variables,
        created_at=template.created_at.isoformat(),
        updated_at=template.updated_at.isoformat(),
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """テンプレート詳細を取得"""
    template = db.query(EmailTemplate).filter(
        EmailTemplate.id == template_id,
        EmailTemplate.user_id == current_user.id,
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return TemplateResponse(
        id=template.id,
        name=template.name,
        category=template.category,
        subject=template.subject,
        body=template.body,
        variables=template.variables,
        created_at=template.created_at.isoformat(),
        updated_at=template.updated_at.isoformat(),
    )


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """テンプレートを更新"""
    template = db.query(EmailTemplate).filter(
        EmailTemplate.id == template_id,
        EmailTemplate.user_id == current_user.id,
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if data.name is not None:
        template.name = data.name
    if data.category is not None:
        template.category = data.category
    if data.subject is not None:
        template.subject = data.subject
    if data.body is not None:
        template.body = data.body
    if data.variables is not None:
        template.variables = data.variables

    db.commit()
    db.refresh(template)

    return TemplateResponse(
        id=template.id,
        name=template.name,
        category=template.category,
        subject=template.subject,
        body=template.body,
        variables=template.variables,
        created_at=template.created_at.isoformat(),
        updated_at=template.updated_at.isoformat(),
    )


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """テンプレートを削除"""
    template = db.query(EmailTemplate).filter(
        EmailTemplate.id == template_id,
        EmailTemplate.user_id == current_user.id,
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(template)
    db.commit()
    return {"message": "削除しました"}


@router.get("/categories/list", response_model=List[str])
async def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """カテゴリ一覧を取得"""
    categories = db.query(EmailTemplate.category).filter(
        EmailTemplate.user_id == current_user.id,
        EmailTemplate.category.isnot(None),
    ).distinct().all()

    return [c[0] for c in categories if c[0]]
