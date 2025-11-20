from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models.score_resume import Candidate, CandidateStatus
from backend.schemas.hr_review import HRReviewUpdate
from backend.utils.status import update_candidate_status, get_all_status_labels

router = APIRouter()
JST = timezone(timedelta(hours=9))

#  ============================================
#  📮 最終HR判定
#  ============================================

@router.post("/hr-review")
async def update_hr_review(
    data: HRReviewUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    user_id = request.headers.get("x-user-id", "unknown")
    now = datetime.now(JST)

    # 候補者を取得
    candidate = db.query(Candidate).filter(Candidate.user_id == data.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # HRレビュー情報を更新
    candidate.hr_decision = data.review.decision
    # ✅ None（つまり送られてきていない or 空）なら「現状維持」
    if data.review.division is not None:
        candidate.hr_division = data.review.division
    if data.review.pay_type is not None:
        candidate.hr_pay_type = data.review.pay_type
    if data.review.employment_type is not None:
        candidate.hr_employment_type = data.review.employment_type
    if data.review.title is not None:
        candidate.hr_title = data.review.title
    if data.review.annual_income is not None:
        candidate.hr_income = data.review.annual_income

    candidate.updated_by = user_id
    candidate.updated_at = now
    candidate.hr_saved_at = now
    candidate.hr_saved_by = user_id

    db.commit()

    return {"status": "success", "user_id": data.candidate_id}

@router.post("/update-status")
async def update_status(payload: dict, db: Session = Depends(get_db)):
    user_id = payload.get("user_id")
    new_stage = payload.get("stage")
    reviewer_id = payload.get("reviewer_id", "system")

    if not user_id or not new_stage:
        raise HTTPException(status_code=400, detail="user_id and stage are required")

    update_candidate_status(
        db=db,
        user_id=user_id,
        new_stage=new_stage,
        reviewer_id=reviewer_id
    )

    return {"status": "ok", "user_id": user_id, "new_stage": new_stage}

@router.post("/hr/candidates/advance-status")
def advance_candidate_status(payload: dict, db: Session = Depends(get_db)):
    user_ids = payload.get("user_ids", [])
    advanced_by = payload.get("advanced_by", None)
    if not user_ids:
        raise HTTPException(status_code=400, detail="user_ids is required")

    updated = []

    for user_id in user_ids:
        latest_status = (
            db.query(CandidateStatus)
            .filter_by(user_id=user_id)
            .order_by(CandidateStatus.reviewed_at.desc())
            .first()
        )
        # すべてのステータス（label）を順序付きで取得
        all_labels = get_all_status_labels(db)

        current_label = str(latest_status.stage) if latest_status else all_labels[0]

        try:
            next_label = all_labels[all_labels.index(current_label) + 1]
        except (ValueError, IndexError):
            next_label = current_label

        update_candidate_status(
            db=db,
            user_id=user_id,
            new_stage=next_label,
            reviewer_id=advanced_by
        )

        updated.append({
            "user_id": user_id,
            "new_stage": next_label,
        })

    return {"updated": updated, "count": len(updated)}