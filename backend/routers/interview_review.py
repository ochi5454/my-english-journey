from datetime import datetime
from fastapi import HTTPException, APIRouter
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from typing import List, cast
from backend.schemas.resume import (
    ScoreChatRequest, 
    ScoreUpdateRequest, 
    InterviewPrepByInterviewerRequest, 
    PrepItemDict
)
from backend.utils.resume_utils import (
    load_division_profiles, 
    save_result_to_file
)
from backend.services.score_adjustment.prompt_generator import (
    extract_original_scores_from_message, 
    generate_score_review_prompt, 
    call_openai_chat, 
    parse_score_adjustments
)
from backend.services.score_adjustment.result_editor import save_score_to_history
from backend.services.interview_review.scorer import (
    _to_prep_item_dict, 
    review_with_interview_checksheet
)

router = APIRouter()

#  ============================================
#  📮 面談シートからスコアリング
#  ============================================

@router.post("/chat-score-review")
async def chat_score_review(payload: ScoreChatRequest):
    messages = [m.dict() for m in payload.messages]
    division_profiles = load_division_profiles()
    valid_divisions = [p["division"] for p in division_profiles]

    # 最新のuserメッセージから元スコアを抽出
    last_user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
    original_scores = extract_original_scores_from_message(last_user_msg["content"]) if last_user_msg else {}

    # プロンプト生成 → 応答 → スコア解析
    prompt = generate_score_review_prompt(messages, valid_divisions)
    reply = call_openai_chat(prompt)
    adjusted_scores = parse_score_adjustments(reply, original_scores)

    return {
        "reply": reply,
        "adjusted_score": adjusted_scores  # ← 複数
    }

@router.post("/update-score")
async def update_score(payload: ScoreUpdateRequest):
    candidate_id = payload.candidate_id
    reviewer_id = payload.reviewer_id
    stage = payload.stage

    now_str = datetime.now().isoformat()

    if not payload.adjustments:
        raise HTTPException(status_code=400, detail="調整内容がありません")

    # JSON形式に変換（save_score_to_historyの仕様に合わせる）
    new_scores = [
        {
            "division": adj.division,
            "score": adj.score,
            "reason": adj.reason
        }
        for adj in payload.adjustments
    ]

    # 保存・推薦部門の更新含む
    result = save_score_to_history(
        candidate_id=candidate_id,
        new_scores=new_scores,
        updated_by=reviewer_id,
        source="chat_review"
    )

    if not result:
        raise HTTPException(status_code=500, detail="保存に失敗しました")

    # ステージ別のレビュー履歴
    if stage:
        result[f"chat_review_{stage}_at"] = now_str
        result[f"chat_reviewer_{stage}"] = reviewer_id

    result["updated_by"] = reviewer_id
    result["updated_at"] = now_str

    save_result_to_file(result, candidate_id)
    return JSONResponse(content=result)

@router.post("/interview/review-score")
async def interview_review_score(payload: InterviewPrepByInterviewerRequest):
    # PrepItem -> PrepItemDict に実体変換（Noneセーフ）
    prep_items_normalized: List[PrepItemDict] = [
        _to_prep_item_dict(pi) for pi in (payload.prepItems or [])
    ]
    # （任意）Pylanceに型を明示
    prep_items_for_review = cast(List[PrepItemDict], prep_items_normalized)

    updated = review_with_interview_checksheet(
        candidate_id=payload.candidate_id,
        reviewer_id=payload.interviewer_id,
        stage=payload.stage,
        prep_items=prep_items_for_review,  # ← 型が完全一致
        reviewed_resume=getattr(payload, "reviewedResume", False),
        qualitative=getattr(payload, "qualitative", None),
        quantitative=getattr(payload, "quantitative", None),
    )
    return JSONResponse(content=updated)
