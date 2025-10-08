import uuid
from datetime import datetime
from fastapi import HTTPException, APIRouter
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate, CandidateStatus
from backend.schemas.ai_score import ScoreChatRequest, ScoreUpdateRequest
from backend.utils.division import load_division_profiles
from backend.services.score_adjustment.score import extract_original_scores_from_message, generate_score_review_prompt, call_openai_chat, parse_score_adjustments
from backend.services.score_adjustment.save import save_score_to_history

router = APIRouter()

#  ============================================
#  📮 チャットの中でリスコアリング
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

    now = datetime.utcnow()

    if not payload.adjustments:
        raise HTTPException(status_code=400, detail="調整内容がありません")

    # JSON形式に変換（save_score_to_history の仕様に合わせる）
    new_scores = [
        {
            "division": adj.division,
            "score": adj.score,
            "reason": adj.reason
        }
        for adj in payload.adjustments
    ]

    # スコア保存（DivisionScore 更新 ＋ ScoreHistory に記録 ＋ 推薦部門更新）
    try:
        save_score_to_history(
            candidate_id=candidate_id,
            new_scores=new_scores,
            updated_by=reviewer_id,
            source="chat_review"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存エラー: {str(e)}")

    # ステージ別レビュー履歴を CandidateStatus に保存（履歴形式なので毎回INSERT）
    with SessionLocal() as db:
        db.add(CandidateStatus(
            id=str(uuid.uuid4()),
            user_id=candidate_id,
            stage=stage,
            chat_reviewer=reviewer_id,
            reviewed_at=now,
            reviewed_resume=False  # 必要なら受け取って反映
        ))

        # 最終更新者も Candidate テーブルに反映
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        candidate.updated_by = reviewer_id
        candidate.updated_at = now

        db.commit()

    return JSONResponse(content={"status": "ok", "candidate_id": candidate_id})