import json
import os
from datetime import datetime
from backend.core.config import INTERVIEWDATE_EACH_CANDIDATE_PATH
from backend.schemas.resume import InterviewSetupRequest

# ============================================
# 🧠 面談日程の保存
# ============================================

def save_interview_schedule(req: InterviewSetupRequest) -> dict:
    key_map = {
        "面談・1次": "interview_1_date",
        "面談・2次": "interview_2_date",
        "最終面談": "interview_final_date"
    }

    interview_key = key_map.get(req.stage, "interview_date_other")
    data_path = os.path.join(INTERVIEWDATE_EACH_CANDIDATE_PATH, f"{req.candidate}.json")

    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = {}

    existing[interview_key] = req.interviewDate
    existing["last_updated"] = datetime.now().isoformat()

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return {
        "saved_stage": req.stage,
        "saved_date": req.interviewDate
    }