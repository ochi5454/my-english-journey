from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models.score_resume import CandidateExpectations, CandidateMustCheckItem, CandidateDivisionMustCheckItem, AIFormulaConfig
from backend.models.checksheet import ChecksheetRoleTitle
from backend.models.score_ofinterviewer import InterviewerRoleFocusItem
from backend.schemas.expectation import CandidateExpectationCreate, CandidateExpectationOut, SkillUpdateSchema
from backend.schemas.ai_formula import AIFormulaConfigResponse, AIFormulaConfigCreate
from backend.schemas.tag import InterviewerRoleFocusUpdate, InterviewerRoleFocusOut, InterviewerRoleFocusCreate
from backend.schemas.role import RoleTitleOut, RoleTitleCreate, RoleTitleUpdate
from backend.services.admin.expectation import get_all_expectations, create_expectation, delete_expectation

router = APIRouter(prefix="/admin")

#  ============================================
#  📮 部門・スキルの管理
#  ============================================

@router.get("/skills", response_model=List[CandidateExpectationOut])
def fetch_skills(division: Optional[str] = None, db: Session = Depends(get_db)):
    return get_all_expectations(db, division)

@router.post("/skills", response_model=CandidateExpectationOut)
def add_skill(data: CandidateExpectationCreate, db: Session = Depends(get_db)):
    return create_expectation(db, data)

@router.delete("/skills/{expectation_id}")
def remove_skill(expectation_id: int, db: Session = Depends(get_db)):
    success = delete_expectation(db, expectation_id)
    if not success:
        raise HTTPException(status_code=404, detail="スキルが見つかりません")
    return {"message": "削除完了"}

@router.put("/skills/{skill_id}")
def update_skill(skill_id: int, update: SkillUpdateSchema, db: Session = Depends(get_db)):
    skill = db.query(CandidateExpectations).filter(CandidateExpectations.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    old_label = skill.trait_label
    new_label = update.trait_label

    # スキルマスタの更新
    skill.trait_label = new_label
    db.commit()

    # 共通 must_check の item_name を更新
    db.query(CandidateMustCheckItem).filter(
        CandidateMustCheckItem.item_name == old_label
    ).update({CandidateMustCheckItem.item_name: new_label})

    # 部門ごとの must_check も同様に更新
    division = skill.division
    db.query(CandidateDivisionMustCheckItem).filter(
        CandidateDivisionMustCheckItem.division == division,
        CandidateDivisionMustCheckItem.item_name == old_label
    ).update({CandidateDivisionMustCheckItem.item_name: new_label})

    db.commit()

    return {"message": "Skill and related data updated"}

#  ============================================
#  📮 QAタグの管理
#  ============================================

@router.get("/tag", response_model=List[InterviewerRoleFocusOut])
def list_focus_items(
    division: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(InterviewerRoleFocusItem)
    if division:
        query = query.filter(InterviewerRoleFocusItem.division == division)
    if role:
        query = query.filter(InterviewerRoleFocusItem.role == role)
    return query.order_by(InterviewerRoleFocusItem.id).all()


@router.post("/tag", response_model=InterviewerRoleFocusOut)
def create_focus_item(item: InterviewerRoleFocusCreate, db: Session = Depends(get_db)):
    exists = db.query(InterviewerRoleFocusItem).filter_by(focus_id=item.focus_id).first()
    if exists:
        raise HTTPException(status_code=400, detail="Focus ID already exists")
    new_item = InterviewerRoleFocusItem(**item.dict())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@router.put("/tag/{item_id}", response_model=InterviewerRoleFocusOut)
def update_focus_item(item_id: int, update: InterviewerRoleFocusUpdate, db: Session = Depends(get_db)):
    item = db.query(InterviewerRoleFocusItem).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in update.dict(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/tag/{item_id}")
def delete_focus_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(InterviewerRoleFocusItem).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "deleted"}

#  ============================================
#  📮 ロール
#  ============================================

@router.get("/roles", response_model=List[RoleTitleOut])
def get_roles(db: Session = Depends(get_db)):
    roles = db.query(ChecksheetRoleTitle).order_by(ChecksheetRoleTitle.order).all()
    if not roles:
        raise HTTPException(status_code=404, detail="ロールデータが見つかりません")
    return roles

@router.post("/roles", response_model=RoleTitleOut)
def create_role(role: RoleTitleCreate, db: Session = Depends(get_db)):
    # 重複チェック
    existing = db.query(ChecksheetRoleTitle).filter(ChecksheetRoleTitle.value == role.value).first()
    if existing:
        raise HTTPException(status_code=400, detail="同じ value のロールが既に存在します")

    new_role = ChecksheetRoleTitle(
        value=role.value,
        label=role.label,
        order=role.order or 0
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role

@router.put("/roles/{role_id}", response_model=RoleTitleOut)
def update_role(role_id: int, role: RoleTitleUpdate, db: Session = Depends(get_db)):
    db_role = db.query(ChecksheetRoleTitle).filter(ChecksheetRoleTitle.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="指定されたロールが見つかりません")

    # --- 更新可能フィールド ---
    if role.label is not None:
        db_role.label = role.label
    if role.value is not None:
        db_role.value = role.value
    if role.order is not None:
        db_role.order = role.order 

    db.commit()
    db.refresh(db_role)
    return db_role

@router.delete("/roles/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db)):
    db_role = db.query(ChecksheetRoleTitle).filter(ChecksheetRoleTitle.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="指定されたロールが見つかりません")

    db.delete(db_role)
    db.commit()
    return {"message": "ロールを削除しました"}

#  ============================================
#  📮 AI推薦度の数式
#  ============================================

@router.get("/ai-formula", response_model=AIFormulaConfigResponse)
def get_formula_config(key: str = "default", db: Session = Depends(get_db)):
    config = db.query(AIFormulaConfig).filter_by(key=key).first()
    if not config:
        raise HTTPException(status_code=404, detail="Formula config not found")

    # null回避（weightsがNoneの場合は空辞書に）
    if config.weights is None:
        config.weights = {}
    return config

@router.put("/ai-formula", response_model=AIFormulaConfigResponse)
def update_formula_config(
    key: str,
    data: AIFormulaConfigCreate,
    db: Session = Depends(get_db)
):
    config = db.query(AIFormulaConfig).filter_by(key=key).first()
    if config:
        config.formula = data.formula
        config.enabled_fields = data.enabled_fields
        config.weights = data.weights
        config.updated_by = data.updated_by
        config.updated_at = datetime.utcnow()
    else:
        config = AIFormulaConfig(
            key=key,
            formula=data.formula,
            enabled_fields=data.enabled_fields,
            weights=data.weights,
            updated_by=data.updated_by,
            updated_at=datetime.utcnow()
        )
        db.add(config)
    db.commit()
    db.refresh(config)
    return config