import re
import json
from datetime import datetime
from backend.models.score_resume import CandidateExpectations
from backend.core.database import SessionLocal
from math import isnan
from typing import List, Dict, Any
from backend.core.openai_config import get_openai_client
from backend.utils.division import load_division_profiles
from backend.services.score_adjustment.save import save_score_to_history

# ============================================
# ✅ GPT呼び出し
# ============================================

client = get_openai_client()

# ============================================
# 🧠 スコアリングを実施
# ============================================

def score_resume_from_text(text: str, candidate_id: str) -> dict:
    print("📥 score_resume_from_text() called: candidate_id=%s", candidate_id)

    must_results = check_must_requirements_llm(text)

    print("✅ must_check 結果: %s", must_results)

    # マスト条件NGなら即保存・返却
    if not all(bool(item.get("result")) for item in must_results.values()):
        print("❌ must_check NGのためスコアリング中断 → 候補者ID: %s", candidate_id)
        result = {
            "user_id": candidate_id,
            "timestamp": datetime.now().isoformat(),
            "must_check": must_results,
            "scores": [],
            "recommended_division": None,
        }
        save_score_to_history(
            candidate_id=candidate_id,
            new_scores=result["scores"],
            source="resume_upload",
            updated_by="system",
        )
        return result

    division_profiles = load_division_profiles()
    print("🧠 division_profiles: %s", division_profiles)

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
    print("🧠 GPT 応答 raw: %s", raw)

    try:
        parsed = json.loads(raw)
        print("✅ GPT応答 JSONパース成功。件数: %d", len(parsed) if isinstance(parsed, list) else 1)
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
        print("❌ GPT応答 JSONパース失敗: %s", e)
        print("🧠 GPT raw応答: %s", raw)

    recommended = max(scores, key=lambda x: x.get("score", -1), default={"division": None})

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "scores": scores,
        "recommended_division": recommended.get("division"),
    }

    save_score_to_history(
        candidate_id=candidate_id,
        new_scores=result["scores"],
        source="resume_upload",
        updated_by="system",
    )

    print("📊 正常に取得したスコア: %s", scores)
    print("🏆 recommended_division: %s", recommended.get("division"))
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

def score_motivation_statement(text: str) -> int:
    """
    志望動機テキスト（~500文字）からやる気スコア（0〜100）を判定する関数。
    GPT-3.5-turbo用。サンプルとスコア基準付きでプロンプト設計。
    """
    prompt = f"""
あなたは新卒採用の人事担当者です。
以下の志望動機テキストを読み、候補者の「やる気・熱意」を0〜100点で評価してください。

【スコア基準の例】

◉ スコア100点（理想）：
私は御社の「持続可能な社会の実現に貢献する」という理念に深く共感し、志望いたしました。大学では環境経済学を専攻し、ゼミでは再生可能エネルギーの普及に関する研究に取り組みました。その中で、環境課題と経済合理性の両立の難しさに直面し、社会全体の意識変容の必要性を痛感しました。御社は環境分野での先進的な取り組みだけでなく、それをテクノロジーとデザインの力で実装している点に強く惹かれました。特に貴社の○○プロジェクトにおける○○の事例は、私自身が理想とする「課題解決型の仕事」のモデルケースであり、ぜひその一翼を担いたいと考えております。自らの経験と学びを活かし、貴社のさらなる社会的価値創出に貢献していきたいです。

→ 理念との接続、具体的経験、プロジェクト理解、貢献意欲が明確 → 100点

◉ スコア40点（不十分）：
IT業界に興味があります。御社でスキルを高めて成長したいです。

→ 抽象的、どの会社にも使える内容、熱意や理解が不十分 → 40点

---

【評価対象の志望動機】
{text}

---

この志望動機のやる気スコアを 0〜100 の数値で出力してください（数字のみ）:
"""

    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    content = response.choices[0].message.content
    print("📝 GPT応答:", content)

    # 数字だけを抽出
    match = re.search(r"\d{1,3}", content)
    return min(int(match.group()), 100) if match else 0