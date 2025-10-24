import uuid
from datetime import datetime
from fastapi import HTTPException, APIRouter
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate, CandidateStatus
from backend.schemas.ai_score_chat import ScoreChatRequest, ScoreUpdateRequest
from backend.utils.division import load_division_profiles, convert_division_to_prefix
from backend.services.score_adjustment.optimized import search_resume_snippets
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

    # === 🔍 candidate_id とユーザーの発話を取得 ===
    candidate_id = getattr(payload, "candidate_id", None)
    last_user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
    last_content = last_user_msg["content"] if last_user_msg else ""

    # === 🧠 履歴書ベクトル検索（質問内容に関連する部分だけ抽出） ===
    context_snippets = []
    if candidate_id and last_content:
        try:
            context_snippets = search_resume_snippets(candidate_id, last_content, top_k=3, min_score=0.35)
            print(f"🔍 履歴書関連抜粋: {len(context_snippets)}件")
        except Exception as e:
            print(f"⚠ 履歴書検索失敗: {e}")

    # === 抜粋をテキスト化してAIに渡す準備 ===
    context_text = "\n---\n".join([f"🔸 {s['text']}" for s in context_snippets]) if context_snippets else ""

    # === 元スコア抽出 ===
    original_scores = extract_original_scores_from_message(last_content) if last_content else {}

    # === ベースプロンプト作成 ===
    base_prompt = generate_score_review_prompt(messages, valid_divisions)

    # === 履歴書抜粋をsystemメッセージとして追加 ===
    if context_text:
        resume_context_msg = {
            "role": "system",
            "content": f"以下は候補者の履歴書から関連がありそうな抜粋です。文脈を参考にスコアを再検討してください。\n{context_text}"
        }
        base_prompt.insert(1, resume_context_msg)

    # === 🧠 AI呼び出し ===
    reply = call_openai_chat(base_prompt)

    # === フェーズ判定 ===
    is_final_phase = "###FINAL" in reply

    # ユーザーに返す文面からは削除
    clean_reply = reply.replace("###FINAL", "").strip()

    # === 通常会話 ===
    if not is_final_phase:
        return {
            "reply": reply,
            "shouldUpdateScore": False,
            "adjusted_scores": None
        }

    # === 最終確定 ===
    adjusted_scores = parse_score_adjustments(reply, original_scores)
    return {
        "reply": clean_reply,
        "shouldUpdateScore": True,
        "adjusted_scores": adjusted_scores
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
            "division": convert_division_to_prefix(adj.division),
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