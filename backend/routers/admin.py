from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models.score_resume import CandidateExpectations, CandidateMustCheckItem, CandidateDivisionMustCheckItem
from backend.schemas.expectation import CandidateExpectationCreate, CandidateExpectationOut, SkillUpdateSchema
from backend.services.admin.expectation import get_all_expectations, create_expectation, delete_expectation
from typing import List

router = APIRouter(prefix="/admin")

#  ============================================
#  📮 候補者に求めるスキルの管理
#  ============================================

@router.get("/skills", response_model=List[CandidateExpectationOut])
def fetch_skills(db: Session = Depends(get_db)):
    return get_all_expectations(db)

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