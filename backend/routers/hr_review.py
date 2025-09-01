import os
import json
from datetime import datetime
from fastapi import APIRouter, Request
from typing import Dict, Any
from backend.core.config import RESULT_PATH
from backend.schemas.resume import HRReviewUpdate

router = APIRouter()

#  ============================================
#  📮 最終HR判定
#  ============================================

@router.post("/resume-result/hr-review")
async def update_hr_review(data: HRReviewUpdate, request: Request):
    user_id = request.headers.get("x-user-id", "unknown")
    now = datetime.utcnow().isoformat()

    file_path = RESULT_PATH / f"{data.candidate_id}_result.json"

    # 既存読み込み（型を明示）
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            existing: Dict[str, Any] = json.load(f)
            if not isinstance(existing, dict):
                existing = {}
    else:
        existing: Dict[str, Any] = {
            "user_id": data.candidate_id,
            "timestamp": now,
        }

    # HR評価を更新
    existing["hr_review"] = {
        "decision": data.decision,
        "division": data.division,
        "title": data.title,
        "annual_income": data.annual_income,
        "updated_by": user_id,
        "updated_at": now,
    }

    os.makedirs(RESULT_PATH, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return {"status": "success", "path": str(file_path)}

