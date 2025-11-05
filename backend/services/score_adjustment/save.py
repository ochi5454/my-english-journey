import uuid
from datetime import datetime
from typing import List, Optional
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate, CandidateDivisionScore, CandidateScoreHistory, CandidateMustCheckItem

# ============================================
# 🧠 スコア更新・履歴保存ロジック
# ============================================

def load_single_result(candidate_id: str) -> Optional[dict]:
    with SessionLocal() as db:
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            return None

        must_items = db.query(CandidateMustCheckItem)\
            .filter_by(user_id=candidate_id).all()

        scores = db.query(CandidateDivisionScore)\
            .filter_by(user_id=candidate_id).all()

        result = {
            "user_id": candidate.user_id,
            "recommended_division": candidate.recommended_div,
            "uploader_id": candidate.uploader_id,
            "timestamp": candidate.updated_at.isoformat() if candidate.updated_at is not None else None,
            "must_check": {
                m.item_name: {"result": m.result, "reason": m.reason}
                for m in must_items
            },
            "scores": [
                {"division": s.division, "score": s.score, "reason": s.reason}
                for s in scores
            ]
        }
        return result

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
    now = datetime.utcnow()

    with SessionLocal() as db:
        # 🎯 該当候補者取得
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise ValueError(f"Candidate not found: {candidate_id}")

        for new_score in new_scores:
            division = new_score["division"].strip()

            # --------------------------
            # 🎯 CandidateDivisionScore の更新 or INSERT
            # --------------------------
            score_record = db.query(CandidateDivisionScore).filter_by(
                user_id=candidate_id,
                division=division
            ).first()

            if score_record:
                score_record.score = new_score["score"]
                score_record.reason = new_score["reason"]
            else:
                db.add(CandidateDivisionScore(
                    id=str(uuid.uuid4()),
                    user_id=candidate_id,
                    division=division,
                    score=new_score["score"],
                    reason=new_score.get("reason", "")
                ))

            # --------------------------
            # 🕓 CandidateScoreHistory に履歴として残す
            # --------------------------
            db.add(CandidateScoreHistory(
                id=str(uuid.uuid4()),
                user_id=candidate_id,
                division=division,
                score=new_score["score"],
                reason=new_score.get("reason", ""),
                reviewer=updated_by,
                reviewed_at=now,
                source=source
            ))

        # --------------------------
        # 🧠 推奨部門の更新ロジック（最大スコアのdivisionにする例）
        # --------------------------
        all_scores = db.query(CandidateDivisionScore).filter_by(user_id=candidate_id).all()
        if all_scores:
            recommended = max(all_scores, key=lambda x: x.score or 0)
            candidate.recommended_div = recommended.division
        else:
            candidate.recommended_div = None

        candidate.updated_by = updated_by
        candidate.updated_at = now

        db.commit()