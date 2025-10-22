from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from typing import List
from backend.core.database import get_db
from backend.schemas.ai_formula import AIFormulaConfigResponse, AIFormulaConfigCreate
from backend.services.admin import ai_formula as ai_formula_service

router = APIRouter(prefix="/admin/ai-formula")


@router.get("", response_model=AIFormulaConfigResponse)
def get_formula_config(
    key: str = "default",
    division: str | None = None,
    db: Session = Depends(get_db),
):
    """AIスコア設定を取得"""
    return ai_formula_service.get_formula_config(db, key, division)


@router.put("", response_model=AIFormulaConfigResponse)
def update_formula_config(
    key: str,
    division: str | None = None,
    data: AIFormulaConfigCreate = Body(...),
    db: Session = Depends(get_db),
):
    """AIスコア設定を更新"""
    return ai_formula_service.update_formula_config(db, key, data, division)


@router.get("/all", response_model=List[AIFormulaConfigResponse])
def get_all_formula_configs(db: Session = Depends(get_db)):
    """全ての部門のAIスコア設定を取得"""
    return ai_formula_service.get_all_formula_configs(db)