from backend.models.results_byinterview import ResultByInterview
from sqlalchemy.orm import Session
from backend.models.results_byinterview import ResultByInterview, ResultByInterviewQualitativeValue, ResultByInterviewQuantitative, ResultByInterviewQATag
from backend.models.checksheet import ChecksheetQualitativeItem
from datetime import datetime

# ============================================
# 🧠 面談シート抽出・更新
# ============================================

def get_checksheet_one(db: Session, interviewer_id: str, candidate_id: str, stage: str):
    result = (
        db.query(ResultByInterview)
        .filter_by(
            interviewer_id=interviewer_id,
            candidate_id=candidate_id,
            stage_name=stage
        )
        .first()
    )

    if not result:
        return {}  # ← 存在しない場合は空オブジェクト返す（現行仕様を維持）

    # prepItems（タグ付きQA） ← 従来どおり
    prep_items = [
        {
            "question_id": qa.question_id,
            "question": qa.question,
            "answer": qa.answer,
            "tags": qa.tags.split(",") if qa.tags else []
        }
        for qa in result.prep_items
    ]

    # ✅ qualitative（新構造・CamelCaseで返す）
    # ResultByInterviewQualitativeValue + ChecksheetQualitativeItem のマッピング
    qualitative_map = {}
    qv_list = (
        db.query(ResultByInterviewQualitativeValue)
          .filter_by(evaluation_id=result.id)
          .all()
    )
    if qv_list:
        # キー変換用マスタ（key: "careerGoals", id: "1" など）
        master_items = db.query(ChecksheetQualitativeItem).all()
        id_to_key_map = {m.id: m.key for m in master_items}  # "1" → "careerGoals"

        for qv in qv_list:
            key = id_to_key_map.get(qv.qualitative_item_id)
            if key is not None:
                qualitative_map[key] = qv.value or ""
    else:
        qualitative_map = {}

    # quantitative ← 従来どおり
    quantitative = {}
    for q in result.quantitative:
        if q.item_key:
            quantitative[q.item_key] = {
                "level": q.level,
                "comment": q.comment or ""
            }

    # ✅ CamelCase 形式で返す（POST の payload と一致させる）
    return {
        "reviewedResume": result.reviewed_resume or False,
        "prepItems": prep_items,
        "qualitative": qualitative_map,   # ← CamelCase key のマップ
        "quantitative": quantitative,
        "hiringDecision": result.hiring_decision,
        "recommendedDivision": result.recommended_division,
        "recommendedTitle": result.recommended_title,
        "payType": result.pay_type,
        "employmentType": result.employment_type,
        "updatedAt": result.updated_at.isoformat() if result.updated_at is not None else None,
        "aiScoreReviewed": result.ai_score_reviewed or False,
        "evalRequired": result.eval_required or False,
    }

def upsert_checksheet(
    db: Session,
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    payload: dict
) -> None:
    print("📥 payload inside upsert_checksheet:", payload)

    # 1. 既存の ResultByInterview を取得 or 新規作成
    result = (
        db.query(ResultByInterview)
        .filter_by(interviewer_id=interviewer_id, candidate_id=candidate_id, stage_name=stage)
        .first()
    )
    if not result:
        result = ResultByInterview(
            interviewer_id=interviewer_id,
            candidate_id=candidate_id,
            stage_name=stage
        )
        db.add(result)
        db.flush()

    # 2. prepItems 保存（従来どおり維持）
    existing_tags = {
        t.question_id: t
        for t in db.query(ResultByInterviewQATag)
                  .filter_by(evaluation_id=result.id)
                  .all()
    }
    incoming_items = payload.get("prepItems", [])
    for p in incoming_items:
        qid = p.get("question_id")
        if not qid:
            continue
        if qid in existing_tags:
            tag = existing_tags[qid]
            tag.question = p.get("question", "")
            tag.answer = p.get("answer", "")
            tag.tags = ",".join(p.get("tags", []))
        else:
            tag = ResultByInterviewQATag(
                evaluation_id=result.id,
                question_id=qid,
                question=p.get("question", ""),
                answer=p.get("answer", ""),
                tags=",".join(p.get("tags", []))
            )
            db.add(tag)

    # 3. qualitative 保存（新構造・マスタDB key→id マッピング）
    incoming_qual = payload.get("qualitative") or {}
    items = db.query(ChecksheetQualitativeItem).all()  # id, key
    key_to_id_map = {item.key: item.id for item in items}

    db.query(ResultByInterviewQualitativeValue).filter_by(
        evaluation_id=result.id
    ).delete()

    for key, value in incoming_qual.items():
        item_id = key_to_id_map.get(key)
        if item_id is None:
            continue  # 4項目以外（hiringDecision など）は無視
        db.add(ResultByInterviewQualitativeValue(
            evaluation_id=result.id,
            qualitative_item_id=item_id,
            value=value or ""
        ))

    # 4. quantitative 保存（従来どおり）
    db.query(ResultByInterviewQuantitative).filter_by(evaluation_id=result.id).delete()
    for k, v in (payload.get("quantitative") or {}).items():
        q = ResultByInterviewQuantitative(
            evaluation_id=result.id,
            item_key=k,
            level=v.get("level"),
            comment=v.get("comment")
        )
        db.add(q)

    # 5. その他の main result 情報（従来どおり）
    result.reviewed_resume = payload.get("reviewedResume", False)
    result.hiring_decision = payload.get("hiringDecision")
    result.recommended_division = payload.get("recommendedDivision")
    result.recommended_title = payload.get("recommendedTitle")
    result.pay_type = payload.get("payType")
    result.employment_type = payload.get("employmentType")
    result.updated_at = datetime.now()
    result.ai_score_reviewed = payload.get("ai_score_reviewed", False)
    result.eval_required = payload.get("eval_required", False)

    db.commit()
    print("✅ upsert_checksheet completed successfully.")