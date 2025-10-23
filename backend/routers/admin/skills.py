import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.schemas.division_skill import (
    CandidateExpectationCreate,
    CandidateExpectationOut,
    SkillUpdateSchema,
    SuggestSkillsRequest,
    SuggestSkillsResponse,
)
from backend.models.score_resume import (
    CandidateExpectations,
    CandidateMustCheckItem,
    CandidateDivisionMustCheckItem,
)
from backend.services.admin.skills import (
    get_all_expectations,
    create_expectation,
    delete_expectation,
)
from backend.services.admin.skills_suggest import suggest_skills_from_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/skills")

# 一覧
@router.get("", response_model=List[CandidateExpectationOut])
def fetch_skills(
    division_prefix: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return get_all_expectations(db, division_prefix)

# 追加
@router.post("", response_model=CandidateExpectationOut)
def add_skill(data: CandidateExpectationCreate, db: Session = Depends(get_db)):
    return create_expectation(db, data)

# 削除
@router.delete("/{expectation_id}")
def remove_skill(expectation_id: int, db: Session = Depends(get_db)):
    success = delete_expectation(db, expectation_id)
    if not success:
        raise HTTPException(status_code=404, detail="スキルが見つかりません")
    return {"message": "削除完了"}

# 更新（副作用あり：must_check連動）
@router.put("/{skill_id}")
def update_skill(skill_id: int, update: SkillUpdateSchema, db: Session = Depends(get_db)):
    skill = db.query(CandidateExpectations).filter(CandidateExpectations.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    old_label = skill.trait_label
    new_label = update.trait_label

    # スキルマスタ
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

@router.post("/suggest", response_model=SuggestSkillsResponse)
def suggest_skills(req: SuggestSkillsRequest, db: Session = Depends(get_db)):
    """
    求人票本文からAIがマスト／歓迎スキルを抽出して返す。
    - 出力は SuggestedSkills(must_requirement[], desired_trait[]) 形式。
    - 推定結果はフロントのプルダウン初期値として使用可能。
    """
    if not req.job_text or not req.job_text.strip():
        raise HTTPException(status_code=400, detail="求人票本文を入力してください。")

    try:
        logger.info(
            f"AIスキル抽出開始: division={req.division}, prefix={req.division_prefix}"
        )

        resp = suggest_skills_from_job(
            db=db,
            job_text=req.job_text,
            division=req.division,
            division_prefix=req.division_prefix,
        )

        logger.info(
            f"AIスキル抽出完了: must={len(resp.suggested.must_requirement)}, "
            f"desired={len(resp.suggested.desired_trait)}"
        )
        return resp

    except ValueError as e:
        logger.warning(f"入力エラー: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:
        logger.exception("スキル抽出失敗: %s", e)
        raise HTTPException(status_code=500, detail="スキル抽出に失敗しました。")