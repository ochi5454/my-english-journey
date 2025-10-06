from datetime import datetime
from backend.core.database import get_db
from backend.models.interview_schedule import ResumeInterviewSchedule
from backend.schemas.resume import InterviewSetupRequest

# ============================================
# 🧠 面談日程の保存
# ============================================

def save_interview_schedule(req: InterviewSetupRequest) -> dict:
    key_map = {
        "面談・1次": "interview_1",
        "面談・2次": "interview_2",
        "最終面談": "interview_final"
    }

    interview_stage = key_map.get(req.stage, "interview_other")

    with get_db() as db: 
        existing = db.query(ResumeInterviewSchedule).filter_by(
            candidate_id=req.candidate,
            interview_stage=interview_stage
        ).first()

        now = datetime.now()

        if existing:
            existing.scheduled_at = req.interviewDate
            existing.last_updated = now
        else:
            new_schedule = ResumeInterviewSchedule(
                candidate_id=req.candidate,
                interview_stage=interview_stage,
                scheduled_at=req.interviewDate,
                last_updated=now
            )
            db.add(new_schedule)

        db.commit()

    return {
        "saved_stage": req.stage,
        "saved_date": req.interviewDate
    }