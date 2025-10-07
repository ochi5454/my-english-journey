from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session, joinedload
from backend.models.results_byinterview import ResultByInterview

# ============================================
# 🧠 面接シートの読み取り・一覧取得
# ============================================

def list_checksheet_by_interviewer(interviewer_id: str, db: Session) -> Dict[str, dict]:
    """
    DBから面接官の全チェックシートを {candidate_id: block} の形式で取得する。
    """
    rows = db.query(ResultByInterview).filter(ResultByInterview.interviewer_id == interviewer_id).all()
    result = {}
    for row in rows:
        block = {
            "reviewedResume": row.reviewed_resume,
            "ai_score_reviewed": row.ai_score_reviewed,
            "eval_required": row.eval_required,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "prepItems": [dict(question=x.question, answer=x.answer, tags=x.tags)
                        for x in row.prep_items],
            "qualitative": {
                "career_goals": row.qualitative.career_goals if row.qualitative else "",
                "other_apps": row.qualitative.other_apps if row.qualitative else "",
                "overall": row.qualitative.overall if row.qualitative else "",
                "assignment_plan": row.qualitative.assignment_plan if row.qualitative else "",
            },
            "quantitative": [
                dict(item_key=x.item_key, level=x.level, comment=x.comment)
                for x in row.quantitative
            ]
        }
        result[row.candidate_id] = block
    return result

def list_all_checksheet_blocks(db: Session) -> list[dict]:
    rows = db.query(ResultByInterview)\
        .options(
            joinedload(ResultByInterview.quantitative),
            joinedload(ResultByInterview.prep_items),
            joinedload(ResultByInterview.qualitative)
        )\
        .all()
    result = []
    for row in rows:
        result.append({
            "candidate_id": row.candidate_id,
            "interviewer_id": row.interviewer_id,
            "stage": row.stage_name,
            "reviewedResume": row.reviewed_resume,
            "ai_score_reviewed": row.ai_score_reviewed,
            "eval_required": row.eval_required,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "prepItems": [
                dict(question=x.question, answer=x.answer, tags=x.tags.split(",") if x.tags else [])
                for x in row.prep_items
            ],
            "qualitative": {
                "careerGoals": row.qualitative.career_goals if row.qualitative else "",
                "otherApps": row.qualitative.other_apps if row.qualitative else "",
                "overall": row.qualitative.overall if row.qualitative else "",
                "assignmentPlan": row.qualitative.assignment_plan if row.qualitative else "",
                # 👇 recommended系・decision系もここで返す
                "hiringDecision": row.hiring_decision,
                "recommendedDivision": row.recommended_division,
                "recommendedTitle": row.recommended_title,
            },
            "quantitative": [
                dict(item_key=x.item_key, level=x.level, comment=x.comment)
                for x in row.quantitative
            ]
        })
    return result

def get_divisions(result: dict) -> List[str]:
    return [s.get("division") for s in result.get("scores", []) if s.get("division")]

def _as_non_empty_str(x: Any) -> Optional[str]:
    """値を非空strに正規化。空/None/非strは None を返す。"""
    if isinstance(x, str):
        s = x.strip()
        return s if s else None
    return None