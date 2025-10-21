from backend.models.results_byinterview import ResultByInterview
from sqlalchemy.orm import Session
from backend.models.results_byinterview import (
    ResultByInterview, ResultByInterviewQualitative,
    ResultByInterviewQuantitative, ResultByInterviewQATag
)
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
        return {}  # ← 存在しない場合は空オブジェクト返す（これ重要）

    # prepItems（タグ付きQA）
    prep_items = [
        {
            "question_id": qa.question_id,
            "question": qa.question,
            "answer": qa.answer,
            "tags": qa.tags.split(",") if qa.tags else []
        }
        for qa in result.prep_items
    ]

    # qualitative
    qualitative = {}
    if result.qualitative:
        qualitative = {
            "career_goals": result.qualitative.career_goals or "",
            "other_apps": result.qualitative.other_apps or "",
            "overall": result.qualitative.overall or "",
            "assignment_plan": result.qualitative.assignment_plan or "",
        }

    # quantitative
    quantitative = {}
    for q in result.quantitative:
        if q.item_key:
            quantitative[q.item_key] = {
                "level": q.level,
                "comment": q.comment or ""
            }

    return {
        "reviewedResume": result.reviewed_resume or False,
        "prepItems": prep_items,
        "qualitative": qualitative,
        "quantitative": quantitative,
        "hiringDecision": result.hiring_decision,
        "recommendedDivision": result.recommended_division,
        "recommendedTitle": result.recommended_title,
        "payType": result.pay_type,
        "employmentType": result.employment_type,
        "updatedAt": result.updated_at.isoformat() if result.updated_at else None,
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
    print("📥 payload values inside upsert_checksheet")
    print("ai_score_reviewed:", payload.get("ai_score_reviewed"))
    print("eval_required:", payload.get("eval_required"))
    # 既存または新規取得
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
        db.flush()  # result.id を確定させる

    # ステータス更新
    result.reviewed_resume = payload.get("reviewedResume", False)
    result.hiring_decision = payload.get("hiringDecision")
    result.recommended_division = payload.get("recommendedDivision")
    result.recommended_title = payload.get("recommendedTitle")
    result.pay_type = payload.get("payType")  
    result.employment_type = payload.get("employmentType") 
    result.updated_at = datetime.now()

    result.ai_score_reviewed = payload.get("ai_score_reviewed", False)
    result.eval_required = payload.get("eval_required", False)

    print("📝 result に代入された値")
    print("ai_score_reviewed:", result.ai_score_reviewed)
    print("eval_required:", result.eval_required)

    # --- prepItems 保存 ---
    existing_tags = {
        t.question_id: t
        for t in db.query(ResultByInterviewQATag)
                .filter_by(evaluation_id=result.id)
                .all()
    }

    incoming_items = payload.get("prepItems", [])
    incoming_ids = {p.get("question_id") for p in incoming_items if p.get("question_id")}

    # 上書き or 新規追加
    for p in incoming_items:
        qid = p.get("question_id")
        if not qid:
            continue  # 無効なものはスキップ

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

    # --- qualitative 保存 ---
    qual = result.qualitative or ResultByInterviewQualitative(evaluation_id=result.id)
    qual.career_goals = payload["qualitative"].get("careerGoals", "")
    qual.other_apps = payload["qualitative"].get("otherApps", "")
    qual.overall = payload["qualitative"].get("overall", "")
    qual.assignment_plan = payload["qualitative"].get("assignmentPlan", "")
    result.qualitative = qual

    # --- quantitative 保存 ---
    db.query(ResultByInterviewQuantitative).filter_by(evaluation_id=result.id).delete()
    for k, v in (payload.get("quantitative") or {}).items():
        q = ResultByInterviewQuantitative(
            evaluation_id=result.id,
            item_key=k,
            level=v.get("level"),
            comment=v.get("comment")
        )
        db.add(q)

    db.commit()