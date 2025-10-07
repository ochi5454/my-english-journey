from typing import List, Dict, Optional, Iterable
from sqlalchemy.orm import Session, joinedload
from backend.models.results_byinterview import ResultByInterview

# ============================================
# 🧠 面接シートの読込
# ============================================

def load_prep_map_with_owner(db: Session) -> Dict[str, Dict[str, List[dict]]]:
    """
    DBの ResultByInterview テーブルから面談シート情報を収集。
    戻り値の形式:
    { candidate_id: { stage: [ { prepItems, qualitative, quantitative, reviewedResume, interviewer_id, updated_at } ] } }
    """
    merged: Dict[str, Dict[str, List[dict]]] = {}

    records: List[ResultByInterview] = (
        db.query(ResultByInterview)
        .options(
            joinedload(ResultByInterview.prep_items),
            joinedload(ResultByInterview.qualitative),
            joinedload(ResultByInterview.quantitative),
        )
        .all()
    )

    for r in records:
        cid = r.candidate_id
        stage = r.stage_name
        iid = r.interviewer_id

        # prepItems: ResultByInterviewQATag → list[dict]
        prep_items = [
            {
                "question_id": qa.question_id,
                "question": qa.question,
                "answer": qa.answer,
                "tags": qa.tags.split(",") if qa.tags else [],
            }
            for qa in r.prep_items
        ]

        # qualitative: ResultByInterviewQualitative → dict
        qualitative = (
            {
                "careerGoals": r.qualitative.career_goals,
                "otherApps": r.qualitative.other_apps,
                "overall": r.qualitative.overall,
                "assignmentPlan": r.qualitative.assignment_plan,
            }
            if r.qualitative
            else {}
        )

        # quantitative: ResultByInterviewQuantitative → dict[item_key] = { level, comment }
        quantitative = {}
        for qt in r.quantitative:
            quantitative[qt.item_key] = {
                "level": qt.level,
                "comment": qt.comment,
            }

        block = {
            "interviewer_id": iid,
            "prepItems": prep_items,
            "reviewedResume": r.reviewed_resume or False,
            "qualitative": qualitative,
            "quantitative": quantitative,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }

        # 格納
        stage_map = merged.setdefault(cid, {})
        stage_map.setdefault(stage, []).append(block)

    return merged

def pick_qa_block_for(
    prep_map: Dict[str, Dict[str, List[dict]]],
    candidate_id: str,
    stage: str,
    interviewer_id: Optional[str]
) -> dict:
    """
    候補者×ステージのQAを1件選ぶ。
    interviewer_id があればその人のものを優先、なければ先頭。
    見つからなければ空dict。
    """
    blocks = (prep_map.get(candidate_id, {}).get(stage, []) or [])
    if interviewer_id:
        for b in blocks:
            if b.get("interviewer_id") == interviewer_id:
                return b
    return blocks[0] if blocks else {}

def iter_all_prep(prep_map: Dict[str, Dict[str, List[dict]]]
                    ) -> Iterable[tuple[str, str, dict]]:
    """prep_map を (candidate_id, stage, qa_block) の列挙にフラット化"""
    for cid, stages in (prep_map or {}).items():
        for stage, blocks in (stages or {}).items():
            for b in (blocks or []):
                yield cid, stage, b