import json
from datetime import datetime
from backend.models.candidate_expectations import CandidateExpectations
from backend.core.database import SessionLocal
from math import isnan
from typing import List, Dict, Any
from backend.core.openai_config import get_openai_client
from backend.utils.resume_utils import (
    save_result_to_file, 
    load_division_profiles
)
from backend.services.resume_upload.extractor import extract_text_from_resume

# ============================================
# ✅ GPT呼び出し
# ============================================

client = get_openai_client()

# ============================================
# 🧠 スコアリングを実施
# ============================================

# --- 📄 パタン1 履歴書をそのまま保存し、スコア判定（/resume-score） ---------------

def score_resume(file_path: str, candidate_id: str) -> dict:
    content = extract_text_from_resume(file_path)
    must_results = check_must_requirements_llm(content)

    # マスト条件NGなら即返す
    if not all(bool(item.get("result")) for item in must_results.values()):
        result = {
            "user_id": candidate_id,
            "timestamp": datetime.now().isoformat(),
            "must_check": must_results,
            "scores": [],
            "recommended_division": None,
        }
        save_result_to_file(result, candidate_id)
        return result

    division_profiles = load_division_profiles()

    # 複数部門を1つの文字列にまとめる
    division_descriptions = "\n\n".join(
        f"部門名: {profile.get('division','')}\n理想の特徴: {', '.join(profile.get('desired_traits', []))}"
        for profile in division_profiles
    )

    # GPTへの一括プロンプト
    prompt = f"""
あなたは人事担当者です。
以下の履歴書情報を読み、複数の部門ごとに適合度を10点満点で評価してください。

各部門の理想像は以下の通りです：

{division_descriptions}

候補者の履歴書:
{content}

【出力形式（JSON配列）】
[
  {{"division": "部門A", "score": 数値, "reason": "理由"}},
  ...
]
"""

    # GPT呼び出し：1回だけ（Noneセーフ）
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    # 応答をパース（配列）。content は str | None → 空文字にフォールバック
    raw = (response.choices[0].message.content or "").strip()
    scores: List[Dict[str, Any]]
    try:
        parsed = json.loads(raw)
        # もし単一オブジェクトで返ってきたら配列化
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            raise ValueError("JSON is not a list")
        # 要素型を正規化（division: str, score: float, reason: str）
        norm: List[Dict[str, Any]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            division = str(item.get("division", "")).strip()
            # scoreは数値化（NaNはスキップ）
            sc = item.get("score", 0)
            try:
                score_val = float(sc)
                if isnan(score_val):
                    continue
            except Exception:
                continue
            reason = str(item.get("reason", "")).strip()
            if division:
                norm.append({"division": division, "score": score_val, "reason": reason})
        scores = norm if norm else [{
            "division": "N/A",
            "score": 0,
            "reason": "解析エラー: 空または不正なJSON",
        }]
    except Exception as e:
        scores = [{
            "division": "N/A",
            "score": 0,
            "reason": f"解析エラー: {e}",
        }]

    # 推奨部門の抽出（scores が空でも安全）
    recommended = max(scores, key=lambda x: x.get("score", -1), default={"division": None})

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "scores": scores,
        "recommended_division": recommended.get("division"),
    }

    save_result_to_file(result, candidate_id)
    return result

# --- 📄 パタン2 履歴書をマスクし、ベクトルDB、SQLに保存し、スコア判定（/resume-score-no-save） ------

def score_resume_from_text(text: str, candidate_id: str) -> dict:
    must_results = check_must_requirements_llm(text)

    # マスト条件NGなら即保存・返却
    if not all(bool(item.get("result")) for item in must_results.values()):
        result = {
            "user_id": candidate_id,
            "timestamp": datetime.now().isoformat(),
            "must_check": must_results,
            "scores": [],
            "recommended_division": None,
        }
        save_result_to_file(result, candidate_id)
        return result

    division_profiles = load_division_profiles()

    division_descriptions = "\n\n".join(
        f"部門名: {profile.get('division','')}\n理想の特徴: {', '.join(profile.get('desired_traits', []))}"
        for profile in division_profiles
    )

    prompt = f"""
あなたは人事担当者です。
以下の履歴書情報を読み、複数の部門ごとに適合度を10点満点で評価してください。

各部門の理想像は以下の通りです：

{division_descriptions}

候補者の履歴書（マスク済み）:
{text}

【出力形式（JSON配列で）】
[
  {{"division": "部門A", "score": 数値, "reason": "理由"}},
  ...
]
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    # ★ None セーフにしてからパース
    raw = (response.choices[0].message.content or "").strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            raise ValueError("JSON is not a list")

        # 要素の正規化
        scores: List[Dict[str, Any]] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            division = str(item.get("division", "")).strip()
            reason = str(item.get("reason", "")).strip()

            sc = item.get("score", 0)
            try:
                score_val = float(sc)
                if isnan(score_val):
                    continue
            except Exception:
                continue

            if division:
                scores.append({"division": division, "score": score_val, "reason": reason})

        if not scores:
            scores = [{
                "division": "N/A",
                "score": 0,
                "reason": "解析エラー: 空または不正なJSON",
            }]

    except Exception as e:
        scores = [{
            "division": "N/A",
            "score": 0,
            "reason": f"解析エラー: {e}",
        }]

    recommended = max(scores, key=lambda x: x.get("score", -1), default={"division": None})

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "scores": scores,
        "recommended_division": recommended.get("division"),
    }

    save_result_to_file(result, candidate_id)
    return result

def check_must_requirements_llm(content: str) -> dict:
    """
    ResumeTraitテーブルからCommonのmust_requirementを取得して、LLM判定を行う
    """
    with SessionLocal() as db:
        rows = db.query(CandidateExpectations)\
                    .filter(CandidateExpectations.division == "Common")\
                    .filter(CandidateExpectations.trait_type == "must_requirement")\
                    .all()
        must_keywords = [r.trait_label.strip() for r in rows if r.trait_label.strip()]

    prompt = f"""
以下はある候補者の履歴書情報です：
---
{content}
---

以下のマスト条件を満たしているか、それぞれTrueまたはFalseで判定し、その根拠となる理由も併記してください。

条件: {', '.join(must_keywords)}

回答形式:
JSON形式で次のように返してください：
{{
  "大卒": {{"result": true, "reason": "東京大学卒業と明記されているため"}},
  "3年以上の職務経験": {{"result": true, "reason": "合計6年の職歴が記載されているため"}},
  ...
}}
"""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    try:
        # Noneセーフ化
        raw_content = response.choices[0].message.content or ""
        result = json.loads(raw_content)
        return result
    except Exception as e:
        # JSONパース失敗時は全て False 扱い
        return {k: {"result": False, "reason": "判定失敗"} for k in must_keywords}