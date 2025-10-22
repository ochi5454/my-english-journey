from fastapi import APIRouter, Depends, HTTPException, Query, Body
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models.score_resume import CandidateExpectations, CandidateMustCheckItem, CandidateDivisionMustCheckItem, AIFormulaConfig
from backend.models.checksheet import ChecksheetRoleTitle, ChecksheetQualitativeItem
from backend.models.score_ofinterviewer import InterviewerRoleFocusItem
from backend.schemas.expectation import CandidateExpectationCreate, CandidateExpectationOut, SkillUpdateSchema
from backend.schemas.ai_formula import AIFormulaConfigResponse, AIFormulaConfigCreate
from backend.schemas.tag import InterviewerRoleFocusUpdate, InterviewerRoleFocusOut, InterviewerRoleFocusCreate
from backend.schemas.role import RoleTitleOut, RoleTitleCreate, RoleTitleUpdate
from backend.schemas.qualitative import ChecksheetQualitativeItemOut, ChecksheetQualitativeItemCreate, ChecksheetQualitativeItemUpdate
from backend.services.admin.expectation import get_all_expectations, create_expectation, delete_expectation

router = APIRouter(prefix="/admin")

#  ============================================
#  📮 部門・スキルの管理
#  ============================================

@router.get("/skills", response_model=List[CandidateExpectationOut])
def fetch_skills(division_prefix: Optional[str] = None, db: Session = Depends(get_db)):
    return get_all_expectations(db, division_prefix)

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
    division_prefix: Optional[str] = Query(None),  # ← フロントと一致させる
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(InterviewerRoleFocusItem)
    if division_prefix:  # ← ここ重要
        query = query.filter(InterviewerRoleFocusItem.division_prefix == division_prefix)
    if role:
        query = query.filter(InterviewerRoleFocusItem.role == role)
    return query.order_by(InterviewerRoleFocusItem.id).all()

@router.post("/tag", response_model=InterviewerRoleFocusOut)
def create_focus_item(item: InterviewerRoleFocusCreate, db: Session = Depends(get_db)):
    print("🔍 受け取った item:", item.dict())  # ← これだけで超有益

    exists = db.query(InterviewerRoleFocusItem).filter_by(focus_id=item.focus_id).first()
    if exists:
        print("⚠️ 同一 focus_id が既に存在しています →", item.focus_id)
        raise HTTPException(status_code=400, detail="Focus ID already exists")

    try:
        new_item = InterviewerRoleFocusItem(**item.dict())
        print("✅ new_item インスタンス:", new_item)
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        print("✅ 登録成功 →", new_item.id)
        return new_item
    except Exception as e:
        print("🔥 DB登録中に例外発生:", e)
        raise HTTPException(status_code=500, detail=str(e))

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
#  📮 定性評価項目（ChecksheetQualitativeItem）の管理
#  ============================================

@router.get("/qualitative-items", response_model=List[ChecksheetQualitativeItemOut])
def list_qualitative_items(db: Session = Depends(get_db)):
    """定性評価項目一覧を取得"""
    items = db.query(ChecksheetQualitativeItem).order_by(ChecksheetQualitativeItem.id.asc()).all()
    return items


@router.post("/qualitative-items", response_model=ChecksheetQualitativeItemOut)
def create_qualitative_item(data: ChecksheetQualitativeItemCreate, db: Session = Depends(get_db)):
    """定性評価項目を新規追加"""
    # 重複 key チェック
    exists = db.query(ChecksheetQualitativeItem).filter(ChecksheetQualitativeItem.key == data.key).first()
    if exists:
        raise HTTPException(status_code=400, detail="同じ key の項目が既に存在します")

    new_item = ChecksheetQualitativeItem(
        key=data.key,
        label=data.label,
        placeholder=data.placeholder,
        order=data.order,
        pay_type=data.pay_type or "daily_monthly",
        is_active=True,  # デフォルト有効
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@router.put("/qualitative-items/{item_id}", response_model=ChecksheetQualitativeItemOut)
def update_qualitative_item(item_id: str, data: ChecksheetQualitativeItemUpdate, db: Session = Depends(get_db)):
    """定性評価項目を更新"""
    item = db.query(ChecksheetQualitativeItem).filter(ChecksheetQualitativeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="定性評価項目が見つかりません")

    update_data = data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/qualitative-items/{item_id}")
def delete_qualitative_item(item_id: str, db: Session = Depends(get_db)):
    """定性評価項目を削除"""
    item = db.query(ChecksheetQualitativeItem).filter(ChecksheetQualitativeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="定性評価項目が見つかりません")
    db.delete(item)
    db.commit()
    return {"message": "定性評価項目を削除しました"}

#  ============================================
#  📮 推薦度の数式
#  ============================================

@router.get("/ai-formula", response_model=AIFormulaConfigResponse)
def get_formula_config(
    key: str = "default",
    division: str | None = None,
    db: Session = Depends(get_db)
):
    """
    AIスコア設定を取得。
    division が指定されていれば部門別設定を返し、
    存在しなければ division=None（共通設定）をフォールバック。
    """
    query = db.query(AIFormulaConfig).filter_by(key=key)

    if division:
        query = query.filter_by(division=division)

    config = query.first()

    # fallback: 部門設定が存在しない場合は共通設定を返す
    if not config:
        config = db.query(AIFormulaConfig).filter_by(key=key, division=None).first()

    if not config:
        raise HTTPException(status_code=404, detail="Formula config not found")

    if config.weights is None:
        config.weights = {}

    return config

@router.put("/ai-formula", response_model=AIFormulaConfigResponse)
def update_formula_config(
    key: str,
    division: str | None = None,
    data: AIFormulaConfigCreate = Body(...),
    db: Session = Depends(get_db)
):
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
            division=division,  # ← 新規登録時に反映
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

@router.get("/ai-formula/all", response_model=list[AIFormulaConfigResponse])
def get_all_formula_configs(db: Session = Depends(get_db)):
    """
    全ての部門のAIスコア設定を取得。
    部門ごとの数式・有効フィールド・重みなどをまとめて返す。
    """
    configs = db.query(AIFormulaConfig).order_by(AIFormulaConfig.division.asc()).all()
    if not configs:
        raise HTTPException(status_code=404, detail="No AI formula configs found")
    # None（共通設定）も含めてそのまま返す
    return configs