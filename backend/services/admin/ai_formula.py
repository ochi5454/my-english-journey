from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime
from backend.models.score_resume import AIFormulaConfig
from backend.schemas.ai_formula import AIFormulaConfigCreate

def get_formula_config(db: Session, key: str = "default", division: str | None = None):
    """AIスコア設定を取得（部門別 or 共通フォールバック付き）"""
    query = db.query(AIFormulaConfig).filter_by(key=key)

    if division:
        query = query.filter_by(division=division)

    config = query.first()

    # fallback: 部門設定が存在しない場合は共通設定を返す
    if not config:
        config = db.query(AIFormulaConfig).filter_by(key=key, division=None).first()

    if not config:
        raise HTTPException(status_code=404, detail="Formula config not found")

    # None防止
    if config.weights is None:
        config.weights = {}

    return config


def update_formula_config(db: Session, key: str, data: AIFormulaConfigCreate, division: str | None = None):
    """AIスコア設定を更新（存在しなければ作成）"""
    query = db.query(AIFormulaConfig).filter_by(key=key)
    if division:
        query = query.filter_by(division=division)

    config = query.first()

    if config:
        config.formula = data.formula
        config.enabled_fields = data.enabled_fields
        config.weights = data.weights
        config.updated_by = data.updated_by
        config.updated_at = datetime.utcnow()
    else:
        config = AIFormulaConfig(
            key=key,
            division=division,
            formula=data.formula,
            enabled_fields=data.enabled_fields,
            weights=data.weights,
            updated_by=data.updated_by,
            updated_at=datetime.utcnow(),
        )
        db.add(config)

    db.commit()
    db.refresh(config)
    return config


def get_all_formula_configs(db: Session):
    """全ての部門のAIスコア設定を取得"""
    configs = db.query(AIFormulaConfig).order_by(AIFormulaConfig.division.asc()).all()
    if not configs:
        raise HTTPException(status_code=404, detail="No AI formula configs found")
    return configs