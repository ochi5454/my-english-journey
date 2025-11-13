from datetime import datetime
from backend.core.database import SessionLocal
from backend.models.interview_schedule import InterviewSchedule
from backend.schemas.interviewsheet import InterviewSetupRequest

# ============================================
# 🧠 面談日程の保存
# ============================================

def save_interview_schedule(req: InterviewSetupRequest) -> dict:
    key_map = {
        "web面談": "interview_1",
        "1次面談": "interview_2",
        "2次面談": "interview_final"
    }

    interview_stage = key_map.get(req.stage, "interview_other")

    with SessionLocal() as db: 
        existing = db.query(InterviewSchedule).filter_by(
            candidate_id=req.candidate,
            interview_stage=interview_stage
        ).first()

        now = datetime.now()

        # ✅ 型チェックしてdatetimeに変換
        scheduled_at = req.interviewDate
        if isinstance(scheduled_at, str):
            try:
                scheduled_at = datetime.fromisoformat(scheduled_at)
            except ValueError:
                raise ValueError(f"interviewDate が不正な形式です: {scheduled_at}")

        if existing:
            existing.scheduled_at = scheduled_at
            existing.last_updated = now
        else:
            new_schedule = InterviewSchedule(
                candidate_id=req.candidate,
                interview_stage=interview_stage,
                scheduled_at=scheduled_at,
                last_updated=now
            )
            db.add(new_schedule)

        db.commit()

    return {
        "saved_stage": req.stage,
        "saved_date": scheduled_at
    }