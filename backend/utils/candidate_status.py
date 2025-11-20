# backend/utils/candidate_status.py

import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

from backend.models.score_resume import Candidate, CandidateStatus

# JST
JST = timezone(timedelta(hours=9))

def update_candidate_status(
    db: Session,
    user_id: str,
    new_stage: str,
    reviewer_id: str = "system",
    reviewed_resume: bool = False
) -> str:
    """
    候補者ステータスを更新する共通関数。
    ・CandidateStatus（履歴）を追加
    ・Candidate（現在値）を更新
    ・reviewer や reviewed_resume も記録
    """

    now = datetime.now(JST)

    # --- 1. CandidateStatus（履歴）追加 ---
    status_row = CandidateStatus(
        id=str(uuid.uuid4()),
        user_id=user_id,
        stage=new_stage,
        chat_reviewer=reviewer_id,
        reviewed_at=now,
        reviewed_resume=reviewed_resume
    )
    db.add(status_row)

    # --- 2. Candidate（現在ステータス）更新 ---
    candidate = db.query(Candidate).filter(Candidate.user_id == user_id).first()
    if candidate:
        candidate.status = new_stage
        candidate.updated_at = now
        candidate.updated_by = reviewer_id

    # --- 3. Commit ---
    db.commit()

    return new_stage