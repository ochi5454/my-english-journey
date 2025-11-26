from typing import List, Dict, Optional, Iterable
from sqlalchemy.orm import Session, joinedload
from backend.models.results_byinterview import ResultByInterview, ResultByInterviewQualitativeValue
from backend.models.checksheet import ChecksheetQualitativeItem
from backend.utils.timezone import to_jst_iso

# ============================================
# 🧠 面接シートの読込
# ============================================

def load_prep_map_with_owner(db: Session) -> Dict[str, Dict[str, List[dict]]]:
    """
    DBの ResultByInterview テーブルから面談シート情報を収集。
    戻り値の形式（/checksheet/one と完全統一）:
    { candidate_id: { stage: [ { interviewer_id, prepItems, qualitative, quantitative, reviewedResume, updated_at } ] } }
    """
    merged: Dict[str, Dict[str, List[dict]]] = {}

    # ★ qualitative は別テーブルにあり、joinedload(ResultByInterview.qualitative) は不要
    records: List[ResultByInterview] = (
        db.query(ResultByInterview)
        .options(
            joinedload(ResultByInterview.prep_items),
            joinedload(ResultByInterview.quantitative)
        )
        .all()
    )

    # ▼ qualitative の key 情報をマスタから取得
    master_items = db.query(ChecksheetQualitativeItem).all()
    id_to_key_map = {m.id: m.key for m in master_items}  # { 1: "careerGoals", 2: ... }

    for r in records:
        # 🔧 Fix: Convert Column values to actual strings
        cid = str(r.candidate_id)
        stage = str(r.stage_name)
        iid = str(r.interviewer_id)

        # prepItems
        prep_items = [
            {
                "question_id": qa.question_id,
                "question": qa.question,
                "answer": qa.answer,
                # 🔧 Fix: Handle potential None value for tags
                "tags": qa.tags.split(",") if qa.tags else [],
            }
            for qa in r.prep_items
        ]

        # qualitative
        qv_list = db.query(ResultByInterviewQualitativeValue)\
            .filter_by(evaluation_id=r.id)\
            .all()
        qualitative_map = {}
        for qv in qv_list:
            key = id_to_key_map.get(qv.qualitative_item_id)
            if key is not None:
                qualitative_map[key] = qv.value or ""

        # quantitative
        quantitative = {
            qt.item_key: {
                "level": qt.level,
                "comment": qt.comment or ""
            }
            for qt in r.quantitative
        }

        block = {
            "interviewer_id": iid,
            "prepItems": prep_items,
            "reviewedResume": r.reviewed_resume or False,
            "qualitative": qualitative_map,  # ← /checksheet/one と同じ CamelCase key
            "quantitative": quantitative,
            "hiringDecision": r.hiring_decision,
            "recommendedDivision": r.recommended_division,
            "recommendedTitle": r.recommended_title,
            "payType": r.pay_type,
            "employmentType": r.employment_type,
            # 🔧 Fix: Properly handle datetime conditional
            "updated_at": to_jst_iso(r.updated_at),
        }

        # 🔧 Fix: Use converted string values for dict keys
        stage_map = merged.setdefault(cid, {})
        stage_map.setdefault(stage, []).append(block)

    # 🔧 Fix: Move debug print outside the loop and add safety check
    if records:
        print(f"🟦 [DEBUG] load_prep_map_with_owner processed {len(records)} records")
        # デバッグ出力は最後のレコードの情報を表示
        if records:
            last_r = records[-1]
            last_cid = str(last_r.candidate_id)
            last_stage = str(last_r.stage_name)
            last_iid = str(last_r.interviewer_id)
            
            # 最後のレコードのqualitativeを再取得（ループ外なので）
            last_qv_list = db.query(ResultByInterviewQualitativeValue)\
                .filter_by(evaluation_id=last_r.id)\
                .all()
            last_qualitative_map = {}
            for qv in last_qv_list:
                key = id_to_key_map.get(qv.qualitative_item_id)
                if key is not None:
                    last_qualitative_map[key] = qv.value or ""
            
            print(f"     Last record: candidate={last_cid}, stage={last_stage}")
            print(f"     interviewer_id={last_iid}")
            print(f"     qualitative keys={list(last_qualitative_map.keys())}")
            for k, v in last_qualitative_map.items():
                print(f"       - {k} = {v}")

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
