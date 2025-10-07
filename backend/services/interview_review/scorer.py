from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from backend.schemas.resume import PrepItemDict
from backend.core.database import SessionLocal
from backend.utils.resume_utils import (
    save_result_to_file, 
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
    reviewer_id: str,     # = interviewer_id
    stage: str,
    prep_items: List[PrepItemDict],  # ← ✅ 型を明示
    reviewed_resume: bool = False,
    qualitative: dict | None = None,
    quantitative: dict | None = None,
) -> dict:
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    # 部門候補と現在スコア
    division_profiles = load_division_profiles()
    valid_divisions = [p["division"] for p in division_profiles]
    current_map = {s["division"]: s.get("score", 0) for s in result.get("scores", [])}

    # 🔹 プロンプト生成に定性・定量を追加
    prompt = generate_interview_review_prompt(
        prep_items=prep_items,
        valid_divisions=valid_divisions,
        current_scores=current_map,
        qualitative=qualitative or {},
        quantitative=quantitative or {},
    )
    reply = call_openai_chat(prompt)

    # スコア調整
    adjustments = parse_score_adjustments(reply, current_map, allow_nochange=True)
    if adjustments:
        result = save_score_to_history(
            candidate_id=candidate_id,
            new_scores=adjustments,
            updated_by=reviewer_id,
            source="interview_review",
        )

    # 🔥 推奨部門をスコアから再設定
    if result.get("scores"):
        top_div = max(result["scores"], key=lambda x: x.get("score", -1))
        result["recommended_division"] = top_div.get("division", None)

    # 🔹 ステージ別フラグ・タイムスタンプ
    now_str = datetime.now().isoformat()
    result[f"{stage}_reviewed_resume"] = reviewed_resume
    result[f"chat_review_{stage}_at"] = now_str
    result[f"chat_reviewer_{stage}"] = reviewer_id
    result["updated_by"] = reviewer_id
    result["updated_at"] = now_str
    save_result_to_file(result, candidate_id)

    now_str = datetime.now().isoformat()
    # 既存ブロックを取得
    try:
        existing_block = get_checksheet_one(reviewer_id, candidate_id, stage) or {}
    except Exception:
        existing_block = {}

    incoming_block = {
        "prepItems": to_serializable(prep_items),
        "reviewedResume": reviewed_resume,
        "qualitative": qualitative or {},
        "quantitative": quantitative or {},
    }

    # ← ここで壊さずマージ
    merged_block = merge_block(existing_block, incoming_block)
    merged_block["ai_score_reviewed"] = True
    merged_block["eval_required"] = True
    merged_block["updated_at"] = now_str


    with SessionLocal() as db:
        upsert_checksheet(
            db=db,
            interviewer_id=reviewer_id,
            candidate_id=candidate_id,
            stage=stage,
            payload=merged_block,
        )

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