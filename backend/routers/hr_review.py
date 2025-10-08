from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException
from backend.schemas.resume import HRReviewUpdate
from backend.core.database import get_db
from sqlalchemy.orm import Session
from backend.models.candidate_evals import Candidate 

router = APIRouter()

#  ============================================
#  📮 最終HR判定
#  ============================================

@router.post("/resume-result/hr-review")
async def update_hr_review(
    data: HRReviewUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    user_id = request.headers.get("x-user-id", "unknown")
    now = datetime.utcnow()

    # 候補者を取得
    candidate = db.query(Candidate).filter(Candidate.user_id == data.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # HRレビュー情報を更新
    candidate.hr_decision = data.review.decision
    candidate.hr_division = data.review.division
    candidate.hr_title = data.review.title
    candidate.hr_income = data.review.annual_income
    candidate.updated_by = user_id
    candidate.updated_at = now

    db.commit()

    return {"status": "success", "user_id": data.candidate_id}