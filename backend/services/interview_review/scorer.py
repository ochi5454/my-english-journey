from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backend.schemas.resume import PrepItemDict
from backend.core.database import SessionLocal
import uuid
from backend.models.candidate_evals import Candidate, CandidateStatus
from backend.utils.resume_utils import (
    load_division_profiles
)
from backend.services.interview_review.prompt_generator import generate_interview_review_prompt
from backend.services.interview_review.io import (
    get_checksheet_one, 
    upsert_checksheet
)
from backend.services.interview_review.merge import merge_block
from backend.services.score_adjustment.result_editor import (
    load_single_result, 
    save_score_to_history
)
from backend.services.score_adjustment.prompt_generator import (
    call_openai_chat, 
    parse_score_adjustments
)

# ============================================
# 🧠 面談シート評価・スコア補正ロジック
# ============================================

def review_with_interview_checksheet(
    candidate_id: str,
    reviewer_id: str,
    stage: str,
    prep_items: List[PrepItemDict],
    reviewed_resume: bool = False,
    qualitative: dict | None = None,
    quantitative: dict | None = None,
    hiring_decision: Optional[str] = None,
    recommended_division: Optional[str] = None,
    recommended_title: Optional[str] = None,
) -> dict:
    now_str = datetime.now().isoformat()
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    # ▼ AIプロンプト生成とOpenAI応答
    division_profiles = load_division_profiles()
    valid_divisions = [p["division"] for p in division_profiles]
    current_map = {s["division"]: s.get("score", 0) for s in result.get("scores", [])}

    prompt = generate_interview_review_prompt(
        prep_items=prep_items,
        valid_divisions=valid_divisions,
        current_scores=current_map,
        qualitative=qualitative or {},
        quantitative=quantitative or {},
    )
    reply = call_openai_chat(prompt)
    adjustments = parse_score_adjustments(reply, current_map, allow_nochange=True)

    # ▼ スコア保存・履歴登録・推薦部門更新（save_score_to_history に一任）
    if adjustments:
        save_score_to_history(
            candidate_id=candidate_id,
            new_scores=adjustments,
            updated_by=reviewer_id,
            source="interview_review"
        )

    # ▼ AIレビュー内容（チェックシート）をマージ保存
    try:
        existing_block = get_checksheet_one(reviewer_id, candidate_id, stage) or {}
    except Exception:
        existing_block = {}

    incoming_block = {
        "prepItems": to_serializable(prep_items),
        "reviewedResume": reviewed_resume,
        "qualitative": qualitative or {},
        "quantitative": quantitative or {},
        "hiringDecision": hiring_decision,
        "recommendedDivision": recommended_division,
        "recommendedTitle": recommended_title,
        "ai_score_reviewed": True,
        "eval_required": True,
        "updated_at": now_str
    }

    merged_block = merge_block(existing_block, incoming_block)

    with SessionLocal() as db:
        upsert_checksheet(
            db=db,
            interviewer_id=reviewer_id,
            candidate_id=candidate_id,
            stage=stage,
            payload=merged_block,
        )

        # CandidateStatus にステージ記録（resume_reviewedフラグ含む）
        db.add(CandidateStatus(
            id=str(uuid.uuid4()),
            user_id=candidate_id,
            stage=stage,
            chat_reviewer=reviewer_id,
            reviewed_at=datetime.utcnow(),
            reviewed_resume=reviewed_resume
        ))

        # Candidate に更新情報（updated_by, updated_at）を反映
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if candidate:
            candidate.updated_by = reviewer_id
            candidate.updated_at = datetime.utcnow()

        db.commit()

    return result

def to_serializable(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return obj.dict()
    if isinstance(obj, list):
        return [to_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_serializable(v) for k, v in obj.items()}
    return obj

def get_current_scores_map(result: dict) -> Dict[str, int]:
    """
    いまの表示スコアを部門→点数で返す。
    scores[].score_history があれば最後、なければ scores[].score を使う。
    """
    cur: Dict[str, int] = {}
    for s in result.get("scores", []):
        hist = s.get("score_history")
        if isinstance(hist, list) and hist:
            # ※ history が時系列で末尾が最新という前提
            cur[s["division"]] = int(hist[-1]["score"])
        else:
            cur[s["division"]] = int(s.get("score", 0))
    return cur

def _to_prep_item_dict(pi: Any) -> PrepItemDict:
    """PrepItem(Pydantic)・dict・その他を PrepItemDict へ正規化"""
    if hasattr(pi, "model_dump"):           # Pydantic v2
        d = pi.model_dump()
    elif hasattr(pi, "dict"):               # Pydantic v1
        d = pi.dict()
    elif isinstance(pi, dict):              # すでにdict
        d = pi
    else:
        d = {}

    return {
        "question": str(d.get("question", "") or ""),
        "answer":  str(d.get("answer", "") or ""),
        "tags":    d.get("tags", []) or [],
    }