from datetime import datetime
from backend.core.database import SessionLocal
from backend.models.interview_schedule import InterviewSchedule
from backend.schemas.interviewsheet import InterviewSetupRequest

# ============================================
# 🧠 面談日程の保存
# ============================================

def save_interview_schedule(req: InterviewSetupRequest) -> dict:
    print("\n--------------------------------------")
    print("🟦 save_interview_schedule() 呼び出し")
    print("🟦 受け取った req:", req)
    print("🟦 req.stage:", getattr(req, "stage", None))
    print("🟦 req.candidate:", getattr(req, "candidate", None))
    print("🟦 req.interviewDate:", getattr(req, "interviewDate", None))
    print("--------------------------------------\n")

    key_map = {
        "web面談": "interview_1",
        "1次面談": "interview_2",
        "2次面談": "interview_final"
    }

    interview_stage = key_map.get(req.stage, "interview_other")
    print("🟣 変換後 interview_stage:", interview_stage)

    with SessionLocal() as db:
        # 既存確認
        try:
            existing = db.query(InterviewSchedule).filter_by(
                candidate_id=req.candidate,
                interview_stage=interview_stage
            ).first()
            print("🟧 existing:", existing)
        except Exception as e:
            print("🔥 DB 検索エラー:", e)
            raise

        now = datetime.now()

        # datetime 型確認
        scheduled_at = req.interviewDate
        print("🟦 scheduled_at 受信値:", scheduled_at)

        if isinstance(scheduled_at, str):
            try:
                scheduled_at = datetime.fromisoformat(scheduled_at)
                print("🟢 文字列 → datetime 変換成功:", scheduled_at)
            except ValueError as ve:
                print("🔥 datetime 変換エラー:", ve)
                raise ValueError(f"interviewDate が不正形式: {scheduled_at}")

        # 保存処理
        try:
            if existing:
                print("🟩 既存レコード更新")
                existing.scheduled_at = scheduled_at
                existing.last_updated = now
            else:
                print("🟩 新規レコード作成")
                new_schedule = InterviewSchedule(
                    candidate_id=req.candidate,
                    interview_stage=interview_stage,
                    scheduled_at=scheduled_at,
                    last_updated=now
                )
                print("🟩 new_schedule:", new_schedule)
                db.add(new_schedule)

            db.commit()
            print("🟢 DB コミット成功")

        except Exception as e:
            print("🔥 DB 保存エラー:", e)
            raise

    return {
        "saved_stage": req.stage,
        "saved_date": scheduled_at
    }