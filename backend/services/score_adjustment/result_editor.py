import json
from datetime import datetime
from fastapi import HTTPException
from typing import List, Optional
from backend.core.config import RESULT_PATH
from backend.utils.resume_utils import save_result_to_file

# ============================================
# 🧠 スコア更新・履歴保存ロジック
# ============================================

def load_single_result(candidate_id: str) -> Optional[dict]:
    path = RESULT_PATH / f"{candidate_id}_result.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def save_result_with_timestamp(result: dict, candidate_id: str) -> str:
    """タイムスタンプ付きで保存し、ファイル名を返す"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = RESULT_PATH / f"{candidate_id}_{timestamp}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return out_path.name

def update_score_in_result(result: dict, division: str, new_score: int, new_reason: str,
                            second_reviewer: Optional[str] = None,
                            second_reviewed_at: Optional[str] = None) -> bool:
    for s in result.get("scores", []):
        if s["division"] == division:
            # 保存前に元の値を original_〜 に残す（なければ）
            if "original_score" not in s:
                s["original_score"] = s["score"]
            if "original_reason" not in s:
                s["original_reason"] = s["reason"]

            s["score"] = new_score
            s["reason"] = new_reason

            if second_reviewer:
                s["second_reviewer"] = second_reviewer
            if second_reviewed_at:
                s["second_reviewed_at"] = second_reviewed_at
            return True
    return False

def update_recommended_division_from_history(result: dict):
    scores = result.get("scores", [])
    if not scores:
        result["recommended_division"] = None
        return

    recommended = max(scores, key=lambda x: x.get("score", -1))
    result["recommended_division"] = recommended.get("division")

def save_score_to_history(candidate_id: str, new_scores: List[dict], updated_by: str, source: str):
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    now = datetime.now().isoformat()

    # ✅ グローバルスコア履歴（divisionごとに）
    if "score_history" not in result:
        result["score_history"] = {}

    for new_score in new_scores:
        division = new_score["division"]

        # --------------------------
        # 🔁 グローバル履歴の重複チェック
        # --------------------------
        global_history = result["score_history"].setdefault(division, [])
        if not global_history or (
            global_history[-1]["score"] != new_score["score"] or
            global_history[-1]["reason"] != new_score["reason"]
        ):
            global_history.append({
                "score": new_score["score"],
                "reason": new_score["reason"],
                "updated_by": updated_by,
                "updated_at": now,
                "source": source
            })

        # --------------------------
        # 🎯 scores[] に反映（上書き前に履歴）
        # --------------------------
        for s in result.get("scores", []):
            if s.get("division") == division:
                # 履歴初期化
                if "score_history" not in s:
                    s["score_history"] = []

                # 🔁 上書き前の内容を履歴に保存（重複チェックあり）
                last_entry = s["score_history"][-1] if s["score_history"] else None
                if not last_entry or (
                    last_entry["score"] != s["score"] or
                    last_entry["reason"] != s["reason"]
                ):
                    s["score_history"].append({
                        "score": s["score"],
                        "reason": s["reason"],
                        "reviewer": result.get("updated_by", updated_by),
                        "reviewed_at": result.get("updated_at", now)
                    })

                # 🎯 現在のスコア・理由を上書き
                s["score"] = new_score["score"]
                s["reason"] = new_score["reason"]

    # ✅ 推奨部門の更新ロジック（変わらず）
    update_recommended_division_from_history(result)

    save_result_to_file(result, candidate_id)
    return result