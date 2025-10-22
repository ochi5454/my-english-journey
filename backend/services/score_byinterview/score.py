import uuid
import json
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Sequence, Mapping
from backend.core.database import SessionLocal
from backend.models.score_resume import Candidate, CandidateStatus
from backend.models.checksheet import ChecksheetQualitativeItem
from backend.schemas.custom_qa import PrepItemDict
from backend.utils.division import load_division_profiles, convert_division_to_prefix
from backend.utils.checksheet import load_qualitative_items
from backend.services.checksheet.upsert import upsert_checksheet, get_checksheet_one
from backend.services.score_adjustment.save import load_single_result, save_score_to_history
from backend.services.score_adjustment.score import call_openai_chat, parse_score_adjustments

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
    now_str = datetime.now().isoformat()
    result = load_single_result(candidate_id)
    if result is None:
        raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    # ▼ AI スコア調整処理（従来通り）
    division_profiles = load_division_profiles()
    valid_divisions = [p["division"] for p in division_profiles]
    current_map = {s["division"]: s.get("score", 0) for s in result.get("scores", [])}

    prompt = generate_interview_review_prompt(
        prep_items=prep_items,
        valid_divisions=valid_divisions,
        current_scores=current_map,
        qualitative=qualitative or {},
        quantitative=quantitative or {},
    )
    reply = call_openai_chat(prompt)
    adjustments = parse_score_adjustments(reply, current_map, allow_nochange=True)

    if adjustments:
        normalized_scores = [
            {
                "division": convert_division_to_prefix(adj["division"]),
                "score": adj["score"],
                "reason": adj["reason"]
            }
            for adj in adjustments
        ]
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
    prep_items: Sequence[Mapping[str, Any]],  # ★ ここを List[Dict...] → Sequence[Mapping...] に変更
    valid_divisions: List[str],
    current_scores: Dict[str, int],
    qualitative: Dict[str, Any] | None = None,
    quantitative: Dict[str, Any] | None = None,
) -> List[dict]:
    """
    面談Q&A（prep_items）に加えて、定性(qualitative)・定量(quantitative)も渡して
    スコア再評価用の messages を作る。
    """
    qualitative = qualitative or {}
    quantitative = quantitative or {}

    system = {
        "role": "system",
        "content": (
            "あなたは人事のサポートAIです。以下の面談Q&Aと評価メモを踏まえて、"
            "【列挙された全ての部門】について、再評価が必要かを必ず部門ごとに1行ずつ出力してください。\n"
            "出力は次の形式のみ（他の文章・前置き・後置きは禁止）：\n"
            "[スコア調整]: 部門=◯◯, 変更後スコア=◯ または 変更なし, 理由=◯◯\n"
            "※ 全部門ぶんを必ず出力（変更なしの場合も1行）\n"
            "※ 改行で部門ごとに区切る\n"
        )
    }

    # --- QA（prep_items） ---
    qa_lines: List[str] = []
    for i, it in enumerate(prep_items or [], 1):
        q = str(it.get("question", "")).strip()
        a = str(it.get("answer", "")).strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")

    qa_block = "\n\n".join(qa_lines) if qa_lines else "（メモなし）"

    # --- Qualitative（定性） ---
    # DBの key, label ベースの柔軟対応
    qual_items = load_qualitative_items()  # [{ key: "careerGoals", label: "本人希望..." }, ...]

    qual_lines = []
    for item in qual_items:
        key = item["key"]
        v = qualitative.get(key)
        if v is not None and str(v).strip():
            # LLM精度向上のため、keyよりも label の方が人間が理解しやすく正確
            qual_lines.append(f"- {item['label']}: {v}")
    qual_block = "\n".join(qual_lines) if qual_lines else "（記載なし）"

    # --- Quantitative（定量 1-5 + コメント） ---
    quant_lines: List[str] = []
    for k, v in (quantitative or {}).items():
        if isinstance(v, dict):
            lv = v.get("level")
            cm = v.get("comment", "")
            if lv is not None or (isinstance(cm, str) and cm.strip()):
                quant_lines.append(f"- {k}: level={lv}, comment={cm}")
    quant_block = "\n".join(quant_lines) if quant_lines else "（記載なし）"

    # --- 現在スコアを並べる ---
    current_scores_lines = "\n".join(
        f"- {d}: {int(current_scores.get(d, 0))}点" for d in valid_divisions
    )

    user = {
        "role": "user",
        "content": (
            "■評価対象部門（全て出力対象）: " + ", ".join(valid_divisions) + "\n"
            "■現在スコア:\n" + current_scores_lines + "\n\n"
            "■面談メモ(Q&A):\n" + qa_block + "\n\n"
            "■定性メモ:\n" + qual_block + "\n\n"
            "■定量メモ(1-5 + コメント):\n" + quant_block
        )
    }

    print("\n🟦 [DEBUG] Interivew Review Prompt (for LLM)")
    print("------ system ------")
    print(system["content"])
    print("------ user ------")
    print(user["content"])
    print("--------------------\n")

    return [system, user]