from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate, CandidateDivisionScore, CandidateScoreHistory, CandidateMustCheckItem

# ============================================
# 🧠 スコア読み取り
# ============================================    
def load_full_score_context(candidate_id: str):
    with SessionLocal() as db:
        division_rows = db.query(CandidateDivisionScore)\
            .filter_by(user_id=candidate_id).all()
        hist_rows = db.query(CandidateScoreHistory)\
            .filter_by(user_id=candidate_id)\
            .order_by(CandidateScoreHistory.reviewed_at.desc())\
            .limit(20).all()

        return {
            "all_scores": {r.division: r.score for r in division_rows},
            "history": [
                {
                    "division": h.division,
                    "score": h.score,
                    "reason": h.reason,
                    "source": h.source,
                    "date": h.reviewed_at,
                }
                for h in hist_rows
            ]
        }