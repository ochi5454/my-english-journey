from typing import Dict, Optional, Any
from sqlalchemy.orm import Session, joinedload
from backend.models.results_byinterview import ResultByInterview, ResultByInterviewQualitativeValue
from backend.models.checksheet import ChecksheetQualitativeItem
from backend.utils.timezone import to_jst_iso

# ============================================
# 🧠 面接シートの読み取り・一覧取得
# ============================================

def list_all_checksheet_blocks(db: Session) -> list[dict]:
    rows = (
        db.query(ResultByInterview)
        .options(
            joinedload(ResultByInterview.quantitative),
            joinedload(ResultByInterview.prep_items),
            # ⚠️ ResultByInterview.qualitative は旧テーブルなので無視してOK
        )
        .all()
    )

    result = []

    for row in rows:
        # ✅ prepItems（従来通り）
        prep_items = [
            dict(
                question=x.question,
                answer=x.answer,
                tags=x.tags.split(",") if x.tags else []
            )
            for x in row.prep_items
        ]

        # ✅ qualitative
        qv_list = db.query(ResultByInterviewQualitativeValue)\
            .filter_by(evaluation_id=row.id)\
            .all()

        qualitative_map = {}
        if qv_list:
            master_items = db.query(ChecksheetQualitativeItem).all()
            id_to_key_map = {m.id: m.key for m in master_items}
            for qv in qv_list:
                key = id_to_key_map.get(qv.qualitative_item_id)
                if key is not None:
                    qualitative_map[key] = qv.value or ""

        # ✅ quantitative
        quantitative = [
            dict(item_key=x.item_key, level=x.level, comment=x.comment)
            for x in row.quantitative
        ]

        # ✅ hiringDecision / recommended系 は qualitative に含めず top-level に出す
        result.append({
            "candidate_id": row.candidate_id,
            "interviewer_id": row.interviewer_id,
            "stage": row.stage_name,
            "reviewedResume": row.reviewed_resume or False,
            "ai_score_reviewed": row.ai_score_reviewed or False,
            "eval_required": row.eval_required or False,
            "updated_at": to_jst_iso(row.updated_at),

            "prepItems": prep_items,
            "qualitative": qualitative_map,

            "quantitative": quantitative,

            "hiringDecision": row.hiring_decision,
            "recommendedDivision": row.recommended_division,
            "recommendedTitle": row.recommended_title,
            "payType": row.pay_type,
            "employmentType": row.employment_type,
        })

    return result

def _as_non_empty_str(x: Any) -> Optional[str]:
    """値を非空strに正規化。空/None/非strは None を返す。"""
    if isinstance(x, str):
        s = x.strip()
        return s if s else None
    return None
