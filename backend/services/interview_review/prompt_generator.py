from typing import List, Dict, Any, Sequence, Mapping

# ============================================
# 🧠 面談シート評価・スコア補正用プロンプト
# ============================================

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
    qual_keys = [
        "hiringDecision", "recommendedTitle", "recommendedDivision",
        "careerGoals", "otherApps", "overall", "assignmentPlan",
    ]
    qual_lines: List[str] = []
    for k in qual_keys:
        v = qualitative.get(k)
        if v is not None and str(v).strip():
            qual_lines.append(f"- {k}: {v}")
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
    return [system, user]