from typing import List, cast
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from backend.schemas.interview_schedule import InterviewPrepByInterviewerRequest
from backend.schemas.checksheet import PrepItemDict
from backend.services.score_byinterview.score import _to_prep_item_dict, review_with_interview_checksheet

router = APIRouter()

#  ============================================
#  📮 面談後リスコアリング
#  ============================================

@router.post("/interview/ai-score")
async def interview_review_score(payload: InterviewPrepByInterviewerRequest):
    # PrepItem -> PrepItemDict に実体変換（Noneセーフ）
    prep_items_normalized: List[PrepItemDict] = [
        _to_prep_item_dict(pi) for pi in (payload.prepItems or [])
    ]

    prep_items_for_review = cast(List[PrepItemDict], prep_items_normalized)

    updated = review_with_interview_checksheet(
        candidate_id=payload.candidate_id,
        reviewer_id=payload.interviewer_id,
        stage=payload.stage,
        prep_items=prep_items_for_review,
        reviewed_resume=getattr(payload, "reviewedResume", False),
        qualitative=getattr(payload, "qualitative", None),
        quantitative=getattr(payload, "quantitative", None),
        hiring_decision=getattr(payload, "hiringDecision", None),
        recommended_division=getattr(payload, "recommendedDivision", None),
        recommended_title=getattr(payload, "recommendedTitle", None),
        pay_type=getattr(payload, "payType", None),
        employment_type=getattr(payload, "employmentType", None),
    )
    return JSONResponse(content=updated)