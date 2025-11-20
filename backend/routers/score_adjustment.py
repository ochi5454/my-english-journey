import re
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from backend.core.database import get_db
from sqlalchemy.orm import Session
from backend.models.score_resume import Candidate
from backend.schemas.ai_score_chat import ScoreChatRequest, ScoreUpdateRequest
from backend.utils.division import load_division_profiles, convert_division_to_prefix
from backend.utils.candidate_status import update_candidate_status
from backend.services.score_adjustment.optimized import search_resume_snippets
from backend.services.score_adjustment.score import extract_original_scores_from_message, generate_score_review_prompt, call_openai_chat, parse_score_adjustments
from backend.services.score_adjustment.save import save_score_to_history

router = APIRouter()
JST = timezone(timedelta(hours=9))
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
    print("💬 AI reply =======================")
    print(reply)
    print("💬 =================================")


    # === フェーズ判定 ===
    is_final_phase = ("[スコア調整]" in reply)

    # ユーザーに返す文面からは削除
    clean_reply = reply.replace("###FINAL", "").strip()

    # === 推奨部門の抽出 ===
    recommended_div = None
    rec_match = re.search(r"\[推奨部門\]\s*:\s*部門\s*=\s*(.+?)(?:\n|$)", reply)
    if rec_match:
        recommended_div = rec_match.group(1).strip()

    # === 合格・不合格の判定 ===
    decision = None
    decision_match = re.search(r"\[判定\]\s*:\s*結果\s*=\s*(合格|不合格)", reply)
    if decision_match:
        decision = decision_match.group(1).strip()

    # === 通常会話 ===
    if not is_final_phase:
        return {
            "reply": reply,
            "shouldUpdateScore": False,
            "adjusted_scores": None,
            "recommended_division": recommended_div,
            "decision": decision
        }

    # === 最終確定 ===
    raw_adjusted_scores = parse_score_adjustments(reply, original_scores)
    print("🟦 raw_adjusted_scores (before normalize):", raw_adjusted_scores)

    # 🔽 dict → 配列に変換
    adjusted_scores_list = []
    if isinstance(raw_adjusted_scores, dict):
        for div, info in raw_adjusted_scores.items():
            if not info:
                continue
            adjusted_scores_list.append({
                "division": div,
                "score": info.get("score"),
                "reason": info.get("reason") or ""
            })
    elif isinstance(raw_adjusted_scores, list):
        print("🔵 raw_adjusted_scores はすでに list 形式:", raw_adjusted_scores)
        # もし既に配列形式で返ってくるケースがあるなら一応そのまま使う
        adjusted_scores_list = raw_adjusted_scores
    else:
        print("⚠️ raw_adjusted_scores が dict でも list でもありません:", type(raw_adjusted_scores))
        adjusted_scores_list = []

    print("🟩 adjusted_scores_list (after normalize):", adjusted_scores_list)
    print("🟪 shouldUpdateScore:", len(adjusted_scores_list) > 0)

    return {
        "reply": clean_reply,
        "shouldUpdateScore": len(adjusted_scores_list) > 0,
        "adjusted_scores": adjusted_scores_list,
        "recommended_division": recommended_div,
        "decision": decision
    }

@router.post("/update-score")
async def update_score(payload: ScoreUpdateRequest, db: Session = Depends(get_db)):
    candidate_id = payload.candidate_id
    reviewer_id = payload.reviewer_id
    stage = payload.stage
    recommended_division = payload.recommended_division

    now = datetime.now(JST)

    # スコア調整がない場合でも、推奨部門があれば処理を続行
    if not payload.adjustments and not recommended_division:
        raise HTTPException(status_code=400, detail="調整内容または推奨部門が必要です")

    # JSON形式に変換（save_score_to_history の仕様に合わせる）
    new_scores = [
        {
            "division": convert_division_to_prefix(adj.division),
            "score": adj.score,
            "reason": adj.reason
        }
        for adj in payload.adjustments
    ] if payload.adjustments else []

    # スコア保存（DivisionScore 更新 ＋ ScoreHistory に記録）
    if new_scores:
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

    # ★ ステータス更新（履歴＋Candidate.status）
    update_candidate_status(
        db=db,
        user_id=candidate_id,
        new_stage=stage,
        reviewer_id=reviewer_id,
        reviewed_resume=False
    )

    # 推奨部門の更新だけ別処理
    if recommended_division:
        recommended_div_prefix = convert_division_to_prefix(recommended_division)
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        candidate.recommended_div = recommended_div_prefix

    db.commit()

    return JSONResponse(content={"status": "ok", "candidate_id": candidate_id})