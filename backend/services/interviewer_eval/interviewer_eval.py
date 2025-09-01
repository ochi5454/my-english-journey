import json
from datetime import datetime
from typing import List
from backend.services.score_adjustment.prompt_generator import call_openai_chat

# ============================================
# 🧠 面接官のスコアリング
# ============================================

def compute_weighted_total(rubric: dict, criteria: List[dict]) -> int:
    """criteria のスコアを rubric.weight で合成して 0-10 に丸める"""
    weights = {c["key"]: float(c.get("weight", 0)) for c in rubric.get("criteria", [])}
    acc, wsum = 0.0, 0.0
    for c in criteria or []:
        w = weights.get(c.get("key"), 0.0)
        acc += float(c.get("score", 0)) * w
        wsum += w
    return int(max(0, min(10, round(acc / wsum)))) if wsum > 0 else 0

def normalize_interviewer_eval_output(
    raw_json: dict,
    rubric: dict,
    interviewer_id: str,
    candidate_id: str,
    stage: str
) -> dict:
    criteria = raw_json.get("criteria", [])
    total = compute_weighted_total(rubric, criteria)

    full_criteria = rubric.get("criteria", [])
    label_map = {c["key"]: c["label"] for c in full_criteria}
    weight_map = {c["key"]: c["weight"] for c in full_criteria}
    guide_map = {c["key"]: c["guidance"] for c in full_criteria}

    labeled = []
    breakdown = {}
    for c in criteria:
        key = c.get("key")
        score = c.get("score", 0)
        breakdown[key] = score  # 👈 各項目のスコアを辞書に追加
        labeled.append({
            "key": key,
            "label": label_map.get(key, key),
            "score": score,
            "note": c.get("note", ""),
            "weight": weight_map.get(key),
            "guidance": guide_map.get(key),
        })

    return {
        "total": total,                    # 👈 一貫性のため "score" → "total" にしてもOK
        "breakdown": breakdown,            # ✅ 各観点のスコアを追加
        "reasons": raw_json.get("reasons", []),
        "suggestions": raw_json.get("suggestions", []),
        "rubric": labeled,
        "evaluated_at": datetime.now().isoformat(),
        "evaluated_by": interviewer_id,
        "candidate_id": candidate_id,
        "stage": stage,
        "skipped": raw_json.get("skipped", False),
        "note": raw_json.get("note", ""),
    }

def build_interviewer_eval_prompt(
    interviewer_id: str,
    stage: str,
    resume_result: dict,
    qa_block: dict,
    rubric: dict,
    include_reasons: bool = True
) -> list[dict]:
    """面談QA + 直前スコア + ルーブリックから評価用プロンプトを生成"""
    # QA整形
    items = (qa_block or {}).get("prepItems", [])
    qa_lines = []
    for i, it in enumerate(items, 1):
        q = (it["question"] or "").strip()
        a = (it["answer"] or "").strip()
        if q or a:
            qa_lines.append(f"Q{i}: {q}\nA{i}: {a}")
    qa_text = "\n\n".join(qa_lines) if qa_lines else "（面談QAの記録なし）"

    # 定性メモ
    qual = qa_block.get("qualitative") or {}
    qual_lines = []
    for k in ("careerGoals", "otherApps", "overall", "assignmentPlan"):
        v = (qual.get(k) or "").strip()
        if v:
            qual_lines.append(f"- {k}: {v}")
    qual_text = "\n".join(qual_lines) if qual_lines else "（定性メモなし）"

    # 定量メモ
    quant = qa_block.get("quantitative") or {}
    q_rows = []
    for k, row in (quant.items() if isinstance(quant, dict) else []):
        lv = row.get("level")
        cm = (row.get("comment") or "").strip()
        if lv or cm:
            q_rows.append(f"- {k}: Lv{lv or 0} / {cm}")
    quant_text = "\n".join(q_rows) if q_rows else "（定量メモなし）"

    # 直前スコア
    scores = resume_result.get("scores", [])
    score_lines = [f"- {s.get('division')}: {s.get('score')}点（理由: {s.get('reason','')}）" for s in scores]
    scores_text = "\n".join(score_lines) if score_lines else "（スコアなし）"

    # ルーブリック説明
    crit_lines = []
    for c in rubric.get("criteria", []):
        crit_lines.append(f"- {c['label']}({c['key']}): 重み {c['weight']} → {c['guidance']}")

    if not include_reasons:
        output_format = (
            "出力は必ずJSONで、次の形式：\n"
            "{\n"
            '  "score": 0-10 の整数,\n'
            '  "criteria": [{"key":"prep","score":0-10,"note":"..."}, ...],\n'
            '  "reasons": ["...","..."],\n'
            '  "suggestions": ["...","..."]\n'
            "}\n"
        )
    else:
        output_format = (
            "出力は必ずJSONで、次の形式：\n"
            "{\n"
            '  "score": 0-10 の整数,\n'
            '  "criteria": [{"key":"prep","score":0-10,"note":"..."}, ...]\n'
            "}\n"
        )

    system = {
        "role": "system",
        "content": (
            "あなたは採用プロセスの監査官です。"
            "面談者が面談前の準備と適切な質問設計で候補者を適正評価できているかを採点します。"
        )
    }

    user = {
        "role": "user",
        "content": (
            f"【評価対象面談者】{interviewer_id}\n"
            f"【ステージ】{stage}\n\n"
            "■ 候補者の直前スコア\n"
            f"{scores_text}\n\n"
            "■ 面談QA（質問と回答）\n"
            f"{qa_text}\n\n"
            "■ 定性メモ\n"
            f"{qual_text}\n\n"
            "■ 定量メモ（各項目のレベルと根拠）\n"
            f"{quant_text}\n\n"
            "■ 評価ルーブリック\n" + "\n".join(crit_lines) + "\n\n"
            + output_format +
            "総合scoreは各criteriaのscoreを重みで合成し四捨五入（0-10）。"
        )
    }

    return [system, user]

def eval_interviewer_once(
    interviewer_id: str,
    stage: str,
    resume_result: dict,
    qa_block: dict,
    rubric: dict,
    model: str = "gpt-4",
    include_reasons: bool = True
) -> dict:
    """LLMで面談者を1名分採点し、重みで総合点を補正"""
    prompt = build_interviewer_eval_prompt(
        interviewer_id, 
        stage, 
        resume_result, 
        qa_block, 
        rubric,
        include_reasons=include_reasons
    )
    raw = call_openai_chat(prompt, model=model)

    # 🔽 ここに print を追加！
    print("\n========== [DEBUG] LLM raw output ==========")
    print(raw)
    print("============================================\n")

    try:
        data = json.loads(raw)
    except Exception:
        data = {"score": 0, "criteria": [], "reasons": [f"解析失敗: {raw[:200]}"], "suggestions": []}

    # LLMの合成がズレてもサーバー側で重み合成し直す
    weights = {c["key"]: float(c["weight"]) for c in rubric.get("criteria", [])}
    acc = 0.0
    wsum = 0.0
    for c in data.get("criteria", []):
        k = c.get("key")
        s = float(c.get("score", 0))
        w = weights.get(k, 0.0)
        acc += s * w
        wsum += w
    if wsum > 0:
        total = round(acc / wsum)
        data["score"] = int(max(0, min(10, total)))

    return data

def to_row_from_llm_json(
    cid: str, iid: str, stg: str, result: dict, rubric: dict, source_sig: str
) -> dict:
    return {
        "candidate_id": cid,
        "interviewer_id": iid,
        "stage": stg,
        "total": result.get("total", 0),
        "breakdown": result.get("breakdown", {}),
        "reasons": result.get("reasons", []),
        "suggestions": result.get("suggestions", []),
        "rubric": result.get("rubric", []),
        "evaluated_at": result.get("evaluated_at"),
        "source_sig": source_sig,
        "role_expectation": result.get("role_expectation", {}),
        "skipped": result.get("skipped", False),
        "note": result.get("note", ""),
    }
