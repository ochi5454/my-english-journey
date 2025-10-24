import uuid
import json
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Sequence, Mapping
from backend.core.database import SessionLocal, get_db
from backend.models.score_resume import Candidate, CandidateStatus, CandidateScoreHistory
from backend.models.checksheet import ChecksheetQualitativeItem
from backend.schemas.custom_qa import PrepItemDict
from backend.utils.division import load_division_profiles, convert_division_to_prefix, convert_prefix_to_division
from backend.utils.checksheet import load_qualitative_items
from backend.services.checksheet.upsert import upsert_checksheet, get_checksheet_one
from backend.services.score_adjustment.save import load_single_result, save_score_to_history
from backend.services.score_adjustment.score import call_openai_chat, parse_score_adjustments
from backend.services.score_byinterview.vectorstore import load_resume_text_by_candidate

# ============================================
# 🧠 面談シート評価・スコア補正ロジック
# ============================================

def review_with_interview_checksheet(
    candidate_id: str,
    reviewer_id: str,
    stage: str,
    prep_items: List[PrepItemDict],
    reviewed_resume: bool = False,
    qualitative: dict | None = None,
    quantitative: dict | None = None,
    hiring_decision: Optional[str] = None,
    recommended_division: Optional[str] = None,
    recommended_title: Optional[str] = None,
    pay_type: Optional[str] = None,
    employment_type: Optional[str] = None,
) -> dict:
    print(f'✅✅✅✅✅✅✅：{recommended_division}')
    now_str = datetime.now().isoformat()
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    # ▼ AI スコア調整処理（従来通り）
    division_profiles = load_division_profiles()
    valid_divisions = [p["division"] for p in division_profiles]
    current_map = {s["division"]: s.get("score", 0) for s in result.get("scores", [])}

    # --- 評価対象部門を制限 ---
    target_division = None

    if recommended_division:
        # 🟢 プレフィックス（facなど）→ 和名（ファシリティなど）へ変換
        target_division = convert_prefix_to_division(recommended_division)

    if target_division and target_division not in valid_divisions:
        print(f"⚠ recommended_division={target_division} は valid_divisions に含まれません。無視します。")
        target_division = None

    # === 履歴書全文をロード ===
    resume_context_text = ""
    try:
        full_resume = load_resume_text_by_candidate(candidate_id)
        if full_resume:
            # トークン制限を考慮して前方のみ
            resume_context_text = full_resume[:4000]
            print(f"📄 履歴書全文を使用: {len(resume_context_text)}文字")
        else:
            print(f"⚠ 履歴書が見つかりません: candidate_id={candidate_id}")
    except Exception as e:
        print(f"⚠ 履歴書読み込み失敗: {e}")

    # === 過去のスコア履歴を取得 ===
    score_history_text = ""
    try:
        db = next(get_db())

        # 🔸 まずクエリを作成
        query = db.query(CandidateScoreHistory).filter(
            CandidateScoreHistory.user_id == candidate_id
        )

        # 🔸 target_division（例: "法務"）がある場合は部門で絞り込む
        if target_division:
            query = query.filter(CandidateScoreHistory.division == target_division)

        histories = (
            query.order_by(CandidateScoreHistory.reviewed_at.desc())
            .limit(3)
            .all()
        )

        if histories:
            score_history_text = "\n".join([
                f"🕓 {h.reviewed_at.strftime('%Y-%m-%d') if h.reviewed_at else '不明日付'} | "
                f"{h.division}: {h.score if h.score is not None else 'N/A'}点 "
                f"({h.source or 'unknown'})"
                for h in histories
            ])
            print(f"📊 過去スコア履歴 {len(histories)}件取得（部門: {target_division or '全体'}）")
        else:
            print(f"📊 {target_division or '全体'} のスコア履歴なし")

    except Exception as e:
        print(f"⚠ スコア履歴取得失敗: {e}")

    # --- プロンプト生成直前 ---
    if target_division:
        # 既存スコアマップから対象部門だけ抽出
        current_map = {
            target_division: current_map.get(target_division, 0)
        }

    prompt = generate_interview_review_prompt(
        prep_items=prep_items,
        valid_divisions=[target_division] if target_division else valid_divisions,
        current_scores=current_map,
        qualitative=qualitative or {},
        quantitative=quantitative or {},
        score_history_text=score_history_text,
    )

    if resume_context_text:
        resume_context_msg = {
            "role": "system",
            "content": (
                "以下は候補者の履歴書全文（または主要部分）です。"
                "面接内容との整合性や一貫性を確認し、"
                "成長・改善が見られる場合はスコアを上方修正してください。\n\n"
                f"{resume_context_text}"
            ),
        }
        # system の直後に差し込む（[system, resume_context, user] の順）
        prompt.insert(1, resume_context_msg)

    if score_history_text:
        score_history_msg = {
            "role": "system",
            "content": (
                "以下は候補者の過去スコア履歴です。"
                "スコア推移の一貫性や変化の理由を参考にしつつ、"
                "今回の面接評価の妥当性を判断してください。\n"
                f"{score_history_text}"
            ),
        }
        # 履歴書メッセージの直後に追加
        insert_index = 2 if resume_context_text else 1
        prompt.insert(insert_index, score_history_msg)

    reply = call_openai_chat(prompt)
    adjustments = parse_score_adjustments(reply, current_map, allow_nochange=True)

    # === 推論結果を recommended_division のみに制限 ===
    if target_division:
        target_lower = target_division.lower()
        adjustments = [
            a for a in adjustments
            if a.get("division", "").lower().startswith(target_lower)
        ]

    if adjustments:
        # ✅ ここでスコアを 0〜100 にクリップ
        normalized_scores = []
        for adj in adjustments:
            try:
                score_val = float(adj["score"])
            except (TypeError, ValueError):
                score_val = 0
            safe_score = max(0, min(100, round(score_val)))
            normalized_scores.append({
                "division": convert_division_to_prefix(adj["division"]),
                "score": safe_score,
                "reason": adj["reason"]
            })
            print(f"🧩 正規化: {adj['division']} → {safe_score}")

        save_score_to_history(
            candidate_id=candidate_id,
            new_scores=normalized_scores,
            updated_by=reviewer_id,
            source="interview_review"
        )

    # ▼ qualitative（マスタ key 完全準拠 & ハードコーディングなし）
    with SessionLocal() as db:

        # ① 既存のチェックシート状態を取得（None の場合は {}）
        existing_block = get_checksheet_one(db, reviewer_id, candidate_id, stage) or {}

        items = db.query(ChecksheetQualitativeItem).all()  # id, key, ...
        valid_keys = [item.key for item in items]          # ["careerGoals", ...]

        incoming_qual = {}
        if qualitative:
            for key in valid_keys:
                incoming_qual[key] = qualitative.get(key, "")
        else:
            for key in valid_keys:
                incoming_qual[key] = ""

        incoming_block = {
            "prepItems": to_serializable(prep_items),
            "reviewedResume": reviewed_resume,
            "qualitative": incoming_qual,    # ← マスタ依存で完了
            "quantitative": quantitative or {},

            # ✅ None（＝今回指定なし）の場合は existing_block から保持
            "hiringDecision": (
                hiring_decision
                if hiring_decision is not None
                else existing_block.get("hiringDecision")
            ),
            "recommendedDivision": (
                recommended_division
                if recommended_division is not None
                else existing_block.get("recommendedDivision")
            ),
            "recommendedTitle": (
                recommended_title
                if recommended_title is not None
                else existing_block.get("recommendedTitle")
            ),
            "payType": (
                pay_type
                if pay_type is not None
                else existing_block.get("payType")
            ),
            "employmentType": (
                employment_type
                if employment_type is not None
                else existing_block.get("employmentType")
            ),
            "ai_score_reviewed": True,
            "eval_required": True,
            "updated_at": now_str
        }

        print("🟦 incoming_block (final, upsert as-is):", json.dumps(incoming_block, indent=2, ensure_ascii=False))

        upsert_checksheet(
            db=db,
            interviewer_id=reviewer_id,
            candidate_id=candidate_id,
            stage=stage,
            payload=incoming_block
        )

        # CandidateStatus にステージ記録
        db.add(CandidateStatus(
            id=str(uuid.uuid4()),
            user_id=candidate_id,
            stage=stage,
            chat_reviewer=reviewer_id,
            reviewed_at=datetime.utcnow(),
            reviewed_resume=reviewed_resume
        ))

        # Candidate の更新情報も更新
        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if candidate:
            candidate.updated_by = reviewer_id
            candidate.updated_at = datetime.utcnow()

        db.commit()

    return result

def to_serializable(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return obj.dict()
    if isinstance(obj, list):
        return [to_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_serializable(v) for k, v in obj.items()}
    return obj

def get_current_scores_map(result: dict) -> Dict[str, int]:
    """
    いまの表示スコアを部門→点数で返す。
    scores[].score_history があれば最後、なければ scores[].score を使う。
    """
    cur: Dict[str, int] = {}
    for s in result.get("scores", []):
        hist = s.get("score_history")
        if isinstance(hist, list) and hist:
            # ※ history が時系列で末尾が最新という前提
            cur[s["division"]] = int(hist[-1]["score"])
        else:
            cur[s["division"]] = int(s.get("score", 0))
    return cur

def _to_prep_item_dict(pi: Any) -> PrepItemDict:
    """PrepItem(Pydantic)・dict・その他を PrepItemDict へ正規化"""
    if hasattr(pi, "model_dump"):           # Pydantic v2
        d = pi.model_dump()
    elif hasattr(pi, "dict"):               # Pydantic v1
        d = pi.dict()
    elif isinstance(pi, dict):              # すでにdict
        d = pi
    else:
        d = {}

    return {
        "question": str(d.get("question", "") or ""),
        "answer":  str(d.get("answer", "") or ""),
        "tags":    d.get("tags", []) or [],
    }

def generate_interview_review_prompt(
    *,
    prep_items: Sequence[Mapping[str, Any]],
    valid_divisions: List[str],
    current_scores: Dict[str, int],
    qualitative: Dict[str, Any] | None = None,
    quantitative: Dict[str, Any] | None = None,
    score_history_text: str | None = None,
) -> List[dict]:
    """
    面談Q&A・定性/定量メモに加え、
    履歴書抜粋とスコア履歴を踏まえて再評価プロンプトを構築する。
    """
    qualitative = qualitative or {}
    quantitative = quantitative or {}

    # === system セクション ===
    system = {
        "role": "system",
        "content": (
            "あなたは人事部のスコア精査アシスタントです。\n"
            "今回の目的は、**指定された部門のみ**のスコア再評価です。他の部門は一切変更してはいけません。\n\n"
            "【出力形式】\n"
            "[スコア調整]: 部門=◯◯, 変更後スコア=◯ または 変更なし, 理由=◯◯\n"
            "※ 他の文章・説明文・前置き・後置きは禁止\n"
            "※ 100点満点スケールで整数値（例: 75, 82）\n"
            "※ 該当部門がない場合は「変更なし」と明記\n\n"
            f"【過去スコア履歴】\n{score_history_text or '（履歴なし）'}\n"
        )
    }

    # === 面談Q&A ===
    qa_lines: List[str] = []
    for i, it in enumerate(prep_items or [], 1):
        q = str(it.get("question", "")).strip()
        a = str(it.get("answer", "")).strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")
    qa_block = "\n\n".join(qa_lines) if qa_lines else "（メモなし）"

    # === 定性メモ ===
    qual_items = load_qualitative_items()
    qual_lines = []
    for item in qual_items:
        key = item["key"]
        v = qualitative.get(key)
        if v and str(v).strip():
            qual_lines.append(f"- {item['label']}: {v}")
    qual_block = "\n".join(qual_lines) if qual_lines else "（記載なし）"

    # === 定量メモ ===
    quant_lines: List[str] = []
    for k, v in (quantitative or {}).items():
        if isinstance(v, dict):
            lv = v.get("level")
            cm = v.get("comment", "")
            if lv is not None or (isinstance(cm, str) and cm.strip()):
                quant_lines.append(f"- {k}: level={lv}, comment={cm}")
    quant_block = "\n".join(quant_lines) if quant_lines else "（記載なし）"

    # === 現在スコア ===
    current_scores_lines = "\n".join(
        f"- {d}: {int(current_scores.get(d, 0))}点" for d in valid_divisions
    )

    # === user セクション ===
    user = {
        "role": "user",
        "content": (
            "■評価対象部門（今回のみ対象）: " + ", ".join(valid_divisions) + "\n"
            "■現在スコア (100点満点中):\n" + current_scores_lines + "\n\n"
            "■面談メモ(Q&A):\n" + qa_block + "\n\n"
            "■定性メモ:\n" + qual_block + "\n\n"
            "■定量メモ(1-5 + コメント):\n" + quant_block
        )
    }

    return [system, user]