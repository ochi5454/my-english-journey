import uuid
from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.models.score_resume import Candidate, CandidateStatus
from backend.schemas.hr_review import HRReviewUpdate

router = APIRouter()

ALL_STATUSES = [
    "アップロード",
    "書類選考",
    "面談・1次",
    "面談・2次",
    "最終面談",
    "待遇検討",
    "内定通知",
    "内定受諾",
    "内定辞退",
]

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
    candidate.hr_saved_at = now
    candidate.hr_saved_by = user_id

    db.commit()

    return {"status": "success", "user_id": data.candidate_id}

@router.post("/hr/candidates/advance-status")
def advance_candidate_status(payload: dict, db: Session = Depends(get_db)):
    user_ids = payload.get("user_ids", [])
    advanced_by = payload.get("advanced_by", None)
    if not user_ids:
        raise HTTPException(status_code=400, detail="user_ids is required")

    updated = []
    for user_id in user_ids:
        candidate = db.query(Candidate).filter_by(user_id=user_id).first()
        if not candidate:
            continue

        # 現在ステージを取得
        latest_status = (
            db.query(CandidateStatus)
            .filter_by(user_id=user_id)
            .order_by(CandidateStatus.reviewed_at.desc())
            .first()
        )
        current_stage = latest_status.stage if latest_status else "アップロード"

        # 次ステージを決定
        try:
            next_stage = ALL_STATUSES[ALL_STATUSES.index(current_stage) + 1]
        except (ValueError, IndexError):
            # すでに最終ステージなど
            next_stage = current_stage

        # CandidateStatusに新規行を追加
        new_status = CandidateStatus(
            id=str(uuid.uuid4()),
            user_id=user_id,
            stage=next_stage,
            chat_reviewer=advanced_by,
            reviewed_at=datetime.utcnow(),
            reviewed_resume=False,
        )
        db.add(new_status)

        # Candidateテーブルも更新（任意）
        candidate.updated_at = datetime.utcnow()
        candidate.updated_by = advanced_by

        updated.append({
            "user_id": user_id,
            "new_stage": next_stage,
        })

    db.commit()
    return {"updated": updated, "count": len(updated)}