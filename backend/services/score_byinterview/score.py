import json
from datetime import datetime
from pydantic import BaseModel
from fastapi import HTTPException
from typing import List, Dict, Any, Optional, Sequence, Mapping
from backend.core.database import SessionLocal, get_db
from backend.models.score_resume import Candidate, CandidateExpectations
from backend.models.checksheet import ChecksheetQualitativeItem
from backend.schemas.custom_qa import PrepItemDict
from backend.utils.division import convert_division_to_prefix, convert_prefix_to_division
from backend.utils.checksheet import load_qualitative_items
from backend.utils.status import update_candidate_status, get_next_stage_key_by_label, get_label_by_key
from backend.services.checksheet.upsert import upsert_checksheet, get_checksheet_one
from backend.services.score_adjustment.save import save_score_to_history, load_single_result
from backend.services.score_adjustment.score import call_openai_chat
from backend.services.score_byinterview.vectorstore import load_resume_text_by_candidate
from backend.services.score_byinterview.load import load_full_score_context
from backend.services.score_byinterview.parser import parse_interview_score_adjustment

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

    # ============================================
    # 候補者の存在チェック
    # ============================================
    with SessionLocal() as db:
        exists = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if not exists:
            raise HTTPException(status_code=404, detail="候補者データが見つかりません")

    # ============================================
    # 履歴書テキスト取得
    # ============================================
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

    # ============================================
    # 全部門スコア・スコア変更履歴の取得
    # ============================================
    full_ctx = load_full_score_context(candidate_id)

    current_all_division_scores: Dict[str, int] = full_ctx["all_scores"]  # 現在の全部門スコア
    full_score_history = full_ctx["history"]  # 過去スコア履歴（最大20件）

    # スコア履歴テキスト化（全体）
    full_score_history_text = "\n".join(
        [
            f"{h['date'].strftime('%Y-%m-%d') if h['date'] else '不明日付'} | "
            f"{h['division']}: {h['score']} ({h['source']}) 理由:{h['reason']}"
            for h in full_score_history
        ]
    ) or "（履歴なし）"

    print("📌 全体スコア:", current_all_division_scores)
    print("📌 全履歴スコア:", full_score_history_text)

    # ここから AI に渡す「現在スコアマップ」
    current_map: Dict[str, int] = current_all_division_scores.copy()

    # ============================================
    # 推薦部門（prefix）の取得
    # ============================================
    division_prefix = recommended_division  # 例 "fac"
    print(f"🙋‍♀️ 面接官の選択した推薦部門(リスコア対象部門／prefix)：{division_prefix}")

    # ============================================
    # 推薦部門（和名）の取得
    # ============================================
    division_jp = convert_prefix_to_division(division_prefix)
    valid_divisions = [division_jp]
    print(f"🙋‍♀️ 面接官の選択した推薦部門(リスコア対象部門／和名)：{division_jp}")

    # ============================================
    # current_map を prefix で絞る
    # ============================================
    if division_prefix:
        current_map = {division_prefix: current_map.get(division_prefix, 0)}
    else:
        # 全体対象のまま
        pass

    # ============================================
    # 評価対象部門の期待スキル（must / desired）
    # ============================================
    db = next(get_db())

    expectations = []
    if division_prefix:
        expectations = (
            db.query(CandidateExpectations)
            .filter(CandidateExpectations.division_prefix == division_prefix)
            .all()
        )

    division_expectations = {
        "must": [
            e.trait_label for e in expectations if e.trait_type == "must_requirement"
        ],
        "desired": [
            e.trait_label for e in expectations if e.trait_type == "desired_trait"
        ],
    }
    print("📋 期待スキル:", division_expectations)

    # ============================================
    # 対象部門のスコア履歴（直近3件）
    # division_prefix（prefix）で一致させる
    # ============================================
    if division_prefix:
        target_hist = [
            h for h in full_score_history
            if h["division"] == division_prefix
        ][:3]
    else:
        target_hist = full_score_history[:3]

    target_history_text = "\n".join(
        [
            f"{h['date'].strftime('%Y-%m-%d') if h['date'] else '不明日付'} | "
            f"{h['division']}: {h['score']} ({h['source']}) 理由:{h['reason']}"
            for h in target_hist
        ]
    ) or "（履歴なし）"

    # ============================================
    # プロンプト生成（valid_divisions は日本語名でOK）
    # ============================================
    prompt = generate_interview_review_prompt(
        prep_items=prep_items,
        valid_divisions=valid_divisions,  # 日本語一覧（GPTに表示用）
        current_scores=current_map,       # prefix → score の1部門
        qualitative=qualitative or {},
        quantitative=quantitative or {},
        score_history_text=target_history_text,
        division_expectations=division_expectations,
        current_all_division_scores=current_all_division_scores,  # 全prefix
        full_score_history_text=full_score_history_text,
    )

    # 履歴書を最初の user として挿入（system 次）
    if resume_context_text:
        resume_context_msg = {
            "role": "user",
            "content": (
                "以下は候補者の履歴書全文（または主要部分）です。"
                "面接内容との整合性や一貫性を確認し、"
                "成長・改善が見られる場合はスコアを上方修正してください。\n\n"
                f"{resume_context_text}"
            ),
        }
        # [system, resume_resume, user] の順を維持
        prompt.insert(1, resume_context_msg)

    # ============================================
    # OpenAI 呼び出し
    # ============================================
    reply = call_openai_chat(prompt)

    print("━━━━━━━━━━━━━━━━━━━━━━━")
    print("🧠 AI raw reply:")
    print(reply)
    print("━━━━━━━━━━━━━━━━━━━━━━━")

    adjustments = parse_interview_score_adjustment(reply, current_map)
    print("📤 Parsed adjustments:", json.dumps(adjustments, ensure_ascii=False, indent=2))

    # ============================================
    # GPT の division（日本語）→ prefix へ変換
    # ============================================
    for a in adjustments:
        if "division" in a:
            a["division_prefix"] = convert_division_to_prefix(a["division"])

    # ============================================
    # 推薦部門 prefix のみ残す
    # ============================================
    if division_prefix:
        adjustments = [
            a for a in adjustments
            if a.get("division_prefix") == division_prefix
        ]

    # ============================================
    # スコア更新ロジック
    # ============================================
    if adjustments:
        normalized_scores = []

        # --- 面接官の定量評価の平均を算出 ---
        quant_levels: List[float] = []
        for v in (quantitative or {}).values():
            if isinstance(v, dict) and isinstance(v.get("level"), (int, float)):
                quant_levels.append(float(v["level"]))

        quant_avg = sum(quant_levels) / len(quant_levels) if quant_levels else None
        print(f"🎯 quant_avg={quant_avg}")

        # --- バイアスの決定 ---
        if quant_avg is not None:
            if quant_avg >= 4:
                bias = 3  # 上向き
                print(f"⭐ 面接官高評価: quant_avg={quant_avg} → bias=+3")
            elif quant_avg <= 2:
                bias = -3  # 下向き
                print(f"⚠ 面接官低評価: quant_avg={quant_avg} → bias=-3")
            else:
                bias = 0
                print(f"➡ 中間評価: quant_avg={quant_avg} → bias=0")
        else:
            bias = 0
            print("ℹ quant_avgなし → bias=0")

        for adj in adjustments:
            prefix = adj.get("division_prefix")
            old_score = current_all_division_scores.get(prefix, 0)

            # ① GPTの new_score を安全にパース
            try:
                raw = adj.get("score")
                if raw == "変更なし" or raw is None:
                    new_score = old_score
                else:
                    new_score = float(raw)
            except Exception:
                new_score = old_score

            # ② 面接官バイアス適用
            new_score = new_score + bias
            print(f"📊 adj for {prefix}: old={old_score}, raw={raw}, bias={bias}, after_bias={new_score}")

            # ③ 高評価（quant_avg >= 4）の場合：最低上昇幅（例：+5 未満なら強制的に old+5 へ）
            if quant_avg is not None and quant_avg >= 4:
                min_up = 5  # ←ここを好きに調整可能
                if new_score < old_score + min_up:
                    print(f"⤴️ 高評価のため最低上昇幅適用: {old_score} → {old_score + min_up}")
                    new_score = old_score + min_up

            # ④ 高評価（quant_avg >= 4）の場合：下げ禁止
            if quant_avg is not None and quant_avg >= 4 and new_score < old_score:
                print(
                    "🔒 面接官高評価のため下方修正禁止 → new_score = old_score"
                )
                new_score = old_score

            # ⑤ ±10 の制限
            delta = new_score - old_score
            if delta > 10:
                new_score = old_score + 10
            elif delta < -10:
                new_score = old_score - 10

            # ④ 0〜100 でクリップ
            safe_score = max(0, min(100, round(new_score)))

            normalized_scores.append(
                {
                    "division": prefix,
                    "score": safe_score,
                    "reason": adj.get("reason", ""),
                }
            )

            print(
                f"🧩 正規化（±10 + bias）: {prefix} → {safe_score}（old={old_score}, delta={delta}）"
            )

        # DB に履歴保存
        save_score_to_history(
            candidate_id=candidate_id,
            new_scores=normalized_scores,
            updated_by=reviewer_id,
            source="interview_review",
        )

    # ============================================
    # チェックシートの upsert & ステータス更新
    # ============================================
    with SessionLocal() as db:
        existing_block = (
            get_checksheet_one(db, reviewer_id, candidate_id, stage) or {}
        )

        items = db.query(ChecksheetQualitativeItem).all()
        valid_keys = [item.key for item in items]

        incoming_qual: Dict[str, str] = {}
        if qualitative:
            for key in valid_keys:
                incoming_qual[key] = qualitative.get(key, "")
        else:
            for key in valid_keys:
                incoming_qual[key] = ""

        incoming_block = {
            "prepItems": to_serializable(prep_items),
            "reviewedResume": reviewed_resume,
            "qualitative": incoming_qual,
            "quantitative": quantitative or {},
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
                pay_type if pay_type is not None else existing_block.get("payType")
            ),
            "employmentType": (
                employment_type
                if employment_type is not None
                else existing_block.get("employmentType")
            ),
            "ai_score_reviewed": True,
            "eval_required": True,
            "updated_at": now_str,
        }

        print(
            "🟦 incoming_block (final, upsert as-is):",
            json.dumps(incoming_block, indent=2, ensure_ascii=False),
        )

        upsert_checksheet(
            db=db,
            interviewer_id=reviewer_id,
            candidate_id=candidate_id,
            stage=stage,
            payload=incoming_block,
        )

        # stage（フロントが送る）は label（例： "1次面談"）
        next_stage_key = get_next_stage_key_by_label(db, stage)
        next_stage_label = get_label_by_key(db, next_stage_key) if next_stage_key else None

        print(f"🔄 現在のステージ(label): {stage} → 次ステージ(key): {next_stage_key}, label={next_stage_label}")

        if next_stage_key:
            update_candidate_status(
                db=db,
                user_id=candidate_id,
                new_stage=next_stage_label,   # ← ここが重要！
                reviewer_id=reviewer_id
            )
        else:
            print("⚠ next_stage_key が取れなかったためステータスを進めません")

        candidate = db.query(Candidate).filter_by(user_id=candidate_id).first()
        if candidate:
            candidate.updated_by = reviewer_id
            candidate.updated_at = datetime.utcnow()

        db.commit()

    # 返却用データ取得
    return load_single_result(candidate_id)

def to_serializable(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return obj.dict()
    if isinstance(obj, list):
        return [to_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_serializable(v) for k, v in obj.items()}
    return obj

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
    division_expectations: Dict[str, List[str]] | None = None,
    current_all_division_scores: Dict[str, int] | None = None,
    full_score_history_text: str | None = None,
) -> List[dict]:
    qualitative = qualitative or {}
    quantitative = quantitative or {}

    must_items = division_expectations.get("must", []) if division_expectations else []
    desired_items = (
        division_expectations.get("desired", []) if division_expectations else []
    )

    # 全部門スコア表示用
    if current_all_division_scores:
        all_scores_block = "\n".join(
            f"- {d}: {s}点" for d, s in current_all_division_scores.items()
        )
    else:
        all_scores_block = "（スコア情報なし）"

    # 全履歴表示用
    full_history_block = full_score_history_text or "（履歴なし）"

    # === system セクション ===
    system_msg = {
        "role": "system",
        "content": (
            "あなたは人事部のスコア精査アシスタントです。\n"
            "今回の目的は、指定された部門のスコアを **面談内容・履歴書内容・期待スキル** に基づいて再評価することです。\n\n"
            "【候補者の全体スコア（最新）】\n"
            + all_scores_block
            + "\n\n【候補者の過去スコア履歴（最大20件）】\n"
            + full_history_block
            + "\n\n【注意】\n"
            "今回の部門は面接官が推奨しているため、原則としてスコアを下げないこと。\n"
            "過去の傾向と合致するよう慎重に微調整すること。\n"
            "極端な変更（±10を超える変更）は禁止。\n\n"
            "【重要】\n"
            "- 対象部門だけを評価する。他部門のスコアは変更禁止。\n"
            "- 面談内容が期待スキルに合致していればスコアを上げてよい。\n"
            "- 面談内容が期待スキルに不足していればスコアを下げてもよい。\n"
            "- 履歴書だけを理由に大きく減点してはいけない。面談で補完される場合は上方修正可能。\n\n"
            "【出力形式】\n"
            "必ず次の **1行のみ** を出力してください。複数行は禁止。\n"
            "形式：\n"
            "部門=<部門名>, スコア=<数値または変更なし>, 理由=<理由>\n\n"
            "【厳守ルール】\n"
            "- 'スコア=' の後は **数値(0-100)** または **変更なし** のどちらか1つだけ。\n"
            "- '0 または 変更なし' のような複数候補の記述は禁止。\n"
            "- 他の文章・前置き・説明文を出力してはならない。\n"
            "- 出力は必ず1行のみ。\n\n"
            "【面接官評価の反映ルール】\n"
            "- 面接官のコメントや定量スコアが高ければ、基本的にスコアを上げる方向で検討する。\n"
            "- 面接官のコメントや定量スコアが低い場合、スコアを下げる方向で検討する。\n"
            "- 高評価とも低評価とも判断できない場合は、基本的に現在スコアを維持する（変更なし）。\n"
            "- 無理に上げ下げを行う必要はない。\n"
            "【履歴と今回の面接評価の優先順位】\n"
            "- スコア履歴は参考情報として扱い、今回の面談で新たに示された強み・スキルの方を優先する。\n"
            "- 特に面接官の定量評価平均が4.0以上の場合、履歴よりも面接評価を優先し、上昇方向の調整を積極的に検討する。\n"
            "- 過去にスコアが高かった場合は、その水準に戻す・近づける上方修正を検討してよい。\n"
            "- 過去にスコアが低かったとしても、今回の面談で改善・成長が見られた場合は上方修正してよい。\n"
            "- 履歴はあくまで補助であり、現在の面談内容と期待スキル適合度が最も重要である。\n"
        ),
    }

    # === 部門期待スキル ===
    if must_items or desired_items:
        lines: List[str] = []
        if must_items:
            lines.append("【必須スキル（must）】")
            for m in must_items:
                lines.append(f"- {m}")
        if desired_items:
            lines.append("\n【歓迎スキル（desired）】")
            for d in desired_items:
                lines.append(f"- {d}")
        expectation_block = "\n".join(lines)
    else:
        expectation_block = (
            "※ この部門の期待スキルは未登録です。\n"
            "一般的な職務適性（問題解決力・コミュニケーション・主体性）を基準に評価してください。"
        )

    # === 面談Q&A ===
    qa_lines = []
    for i, it in enumerate(prep_items or [], 1):
        q = str(it.get("question", "")).strip()
        a = str(it.get("answer", "")).strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")
    qa_block = "\n\n".join(qa_lines) if qa_lines else "（メモなし）"

    # === 定性 ===
    qual_items = load_qualitative_items()
    qual_lines = []
    for item in qual_items:
        key = item["key"]
        v = qualitative.get(key)
        if v and str(v).strip():
            qual_lines.append(f"- {item['label']}: {v}")
    qual_block = "\n".join(qual_lines) if qual_lines else "（記載なし）"

    # === 定量 ===
    quant_lines = []
    for k, v in (quantitative or {}).items():
        if isinstance(v, dict):
            lv = v.get("level")
            cm = v.get("comment", "")
            if lv is not None or (isinstance(cm, str) and cm.strip()):
                quant_lines.append(f"- {k}: level={lv}, comment={cm}")
    quant_block = "\n".join(quant_lines) if quant_lines else "（記載なし）"

    # === 現在スコア（対象部門のみ） ===
    current_scores_lines = "\n".join(
        f"- {d}: {int(current_scores.get(d, 0))}点" for d in valid_divisions
    )

    # === user セクション ===
    user_msg = {
        "role": "user",
        "content": (
            "■評価対象部門: " + ", ".join(valid_divisions) + "\n\n"
            "■この部門の期待スキル:\n" + expectation_block + "\n\n"
            "■現在スコア:\n" + current_scores_lines + "\n\n"
            "■面談メモ(Q&A):\n" + qa_block + "\n\n"
            "■定性メモ:\n" + qual_block + "\n\n"
            "■定量メモ:\n" + quant_block + "\n\n"
            "■対象部門の過去スコア履歴（要約）:\n"
            + (score_history_text or "（履歴なし）")
        ),
    }

    return [system_msg, user_msg]