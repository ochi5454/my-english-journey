import re
import json
from datetime import datetime
from backend.models.score_resume import CandidateExpectations
from backend.core.database import SessionLocal
from math import isnan
from typing import List, Dict, Any, Callable, Optional
from backend.core.openai_config import get_openai_client
from backend.utils.division import load_division_profiles, convert_division_to_prefix
from backend.services.score_adjustment.save import save_score_to_history

# ============================================
# ✅ GPT呼び出し
# ============================================

client = get_openai_client()

# ============================================
# ✅ emit呼び出し
# ============================================

EmitFn = Callable[[Dict[str, Any]], None]

# ============================================
# 🧠 部門ごとのスコアリング（中でマストチェックを呼ぶ）
# ============================================

def score_resume_from_text(text: str, candidate_id: str, emit: Optional[EmitFn] = None,) -> dict:
    def log(kind: str, msg: str, **extra):
        if emit:
            emit({"kind": kind, "message": msg, **extra})

    print("📥 score_resume_from_text() called: candidate_id=%s", candidate_id)
    log("llm_call", f"📥 候補者ID: {candidate_id}のスコアリングを開始")

    must_results = check_must_requirements_llm(text)
    must_results_by_division = check_must_requirements_by_division_llm(text)

    print("✅ must_check 結果: %s", must_results)
    print("✅ must_results_by_division 結果: %s", must_results_by_division)
    log("must_check", "✅ マストスキル（共通） 結果ログ", must_results=must_results)
    log("must_check_by_division", "✅ 部門別マストスキル 結果ログ", data=must_results_by_division)

    # === マスト条件NGなら即中断 ===
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

    # === 部門プロフィールのロード ===
    division_profiles = load_division_profiles()
    print("🧠 division_profiles: %s", division_profiles)
    log("division_profiles", "🧠 部門別で求められる歓迎スキル 取得ログ", data=division_profiles)

    division_descriptions = "\n\n".join(
        f"部門名: {profile.get('division','')}\n理想の特徴: {', '.join(profile.get('desired_traits', []))}"
        for profile in division_profiles
    )

    # === 🔧 プロンプト修正版（100点スケール対応） ===
    prompt = f"""
あなたは企業の採用担当者です。
以下の応募書類（履歴書および職務経歴書）を読み、
候補者の職務経歴・スキルセット・実績内容のみをもとに、
各部門に対する適合度を **100点満点** で評価してください。

- 志望動機や希望部門の記載には影響されないようにしてください。
- 評価は「スキル内容・実績・経験の方向性」が、各部門の理想像にどの程度合致しているかで判断します。

【評価基準の目安】
- 90〜100点: 各部門の理想像に非常によく合致している
- 70〜89点: 多くの要素で合致しており、実務上も即戦力の可能性が高い
- 50〜69点: 一部合致しているが、経験やスキルにギャップあり
- 30〜49点: 理想像とは離れている
- 0〜29点: スキルや経歴がほぼ一致していない

【部門ごとの理想像】
{division_descriptions}

【候補者の応募書類（マスク済み）】
{text}

---

【出力形式（JSON配列）】
[
  {{"division": "部門名", "score": 数値（0〜100）,"reason": "理由"}}, ...
]
"""

    # === GPT呼び出し ===
    log("division_request", "🤖 LLM呼び出し開始")
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    raw = (response.choices[0].message.content or "").strip()
    print("🧠 GPT応答 raw: %s", raw)
    log("division_response_raw", "🧠 GPT応答ログ", raw=raw)

    try:
        parsed = json.loads(raw)
        print("✅ GPT応答 JSONパース成功。件数: %d", len(parsed) if isinstance(parsed, list) else 1)
        log("division_parse_ok", "✅ GPT応答 JSONパース成功", count=(len(parsed) if isinstance(parsed, list) else 1))

        if isinstance(parsed, dict):
            parsed = [parsed]
        if not isinstance(parsed, list):
            raise ValueError("JSON is not a list")

        # === スコアの正規化 ===
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

            # ✅ 上限100点に正規化
            score_val = min(score_val, 100)

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
        log("division_parse_error", f"❌ GPT応答 JSONパース失敗: {e}", raw=raw)
        print("🧠 GPT raw応答: %s", raw)
        scores = [{
            "division": "N/A",
            "score": 0,
            "reason": "JSON解析エラー",
        }]

    # === 推薦部門決定（must_check NG部門を除外） ===

    # must_check_by_division から NG部門を抽出
    ng_divisions = {
        convert_division_to_prefix(div)
        for div, checks in must_results_by_division.items()
        if any(not c.get("result") for c in checks.values())
    }

    # スコア上位から順に、有効な部門を選ぶ（NGは減点処理）
    normalized_scores = []
    for s in scores:
        div_prefix = convert_division_to_prefix(s["division"])
        base_score = s["score"]

        # 部門ごとのmust_check結果を取得
        checks = must_results_by_division.get(s["division"]) or must_results_by_division.get(div_prefix)
        if checks:
            ng_count = sum(1 for c in checks.values() if not c.get("result"))
            # 1項目NGごとに−10点、下限0点
            PENALTY_PER_NG = 10
            adjusted_score = max(base_score - (ng_count * PENALTY_PER_NG), 0)
        else:
            ng_count = 0
            adjusted_score = base_score

        normalized_scores.append({
            "division": div_prefix,
            "score": adjusted_score,
            "reason": s["reason"],
            "base_score": base_score,
            "ng_count": ng_count,
        })

    # must_check NG部門を除外して推薦候補を決定
    valid_scores = [s for s in normalized_scores if s["division"] not in ng_divisions]
    recommended = (
        max(valid_scores, key=lambda x: x.get("score", -1))
        if valid_scores else {"division": None}
    )

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "must_check_by_division": must_results_by_division,
        "scores": normalized_scores,
        "recommended_division": convert_division_to_prefix(recommended.get("division")),
    }

    save_score_to_history(
        candidate_id=candidate_id,
        new_scores=result["scores"],
        source="resume_upload",
        updated_by="system",
    )

    print("📊 正常に取得したスコア: %s", scores)
    print("🏆 recommended_division: %s", recommended.get("division"))
    log("division_scores_ready", "📊 正常に取得したスコア", scores=normalized_scores)
    log("division_recommended", "🏆 recommended_division", division=result["recommended_division"])
    return result

# ============================================
# 🧠 共通マストスキルの判定
# ============================================

def check_must_requirements_llm(content: str) -> dict:
    """
    ResumeTraitテーブルからCommonのmust_requirementを取得して、LLM判定を行う
    """
    with SessionLocal() as db:
        rows = db.query(CandidateExpectations)\
                    .filter(CandidateExpectations.division_prefix == "common")\
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
  "大卒以上": {{"result": true, "reason": "東京大学卒業と明記されているため"}},
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

# ============================================
# 🧠 部門単位マストスキルの判定
# ============================================

def check_must_requirements_by_division_llm(content: str) -> Dict[str, Dict[str, Dict[str, Any]]]:
    from collections import OrderedDict

    with SessionLocal() as db:
        rows = db.query(CandidateExpectations)\
            .filter(CandidateExpectations.trait_type == "must_requirement")\
            .filter(CandidateExpectations.division_prefix != "common")\
            .all()

    # divisionごとに分類（順番保持のためOrderedDict推奨）
    division_map: Dict[str, List[str]] = OrderedDict()
    for r in rows:
        division = r.division.strip()
        label = r.trait_label.strip()
        if not label:
            continue
        division_map.setdefault(division, []).append(label)

    results = {}
    for division, traits in division_map.items():
        joined_traits = ', '.join(f'"{t}"' for t in traits)

        prompt = f"""
あなたは採用担当者です。
以下の候補者の履歴書情報をもとに、「{division}」部門に必要な**特定のマスト条件のみ**について、各条件が満たされているかを判定してください。

条件リスト（これ以外は絶対に判定しないこと）:
{joined_traits}

---

履歴書内容（マスク済み）:
{content}

---

出力形式は必ず以下のJSON形式で、**条件ラベル名をキーとした辞書形式**で返してください（それ以外の項目を追加しないこと）：
{{
  "ビル設備管理技能士": {{"result": true, "reason": "資格欄に明記されているため"}},
  "危険物取扱者": {{"result": false, "reason": "記載なし"}},
  ...
}}
"""

        try:
            response = client.chat.completions.create(
                model="gpt-4",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            raw = response.choices[0].message.content or ""
            parsed = json.loads(raw)

            # ❗念のため trait_label 以外を除外（保険）
            filtered = {
                k: v for k, v in parsed.items()
                if k in traits
            }
            results[division] = filtered

        except Exception:
            results[division] = {
                label: {"result": False, "reason": "パース失敗"} for label in traits
            }

    return results

# ============================================
# 🧠 志望動機のスコアリング
# ============================================

def score_motivation_statement(text: str) -> int:
    """
    志望動機テキスト（~500文字）からやる気スコア（0〜100）を判定する関数。
    GPT-3.5-turbo用。サンプルとスコア基準付きでプロンプト設計。
    """
    prompt = f"""
あなたは新卒採用の人事担当者です。
以下の志望動機を読み、候補者の「やる気・熱意」を次の4つの観点から評価してください。
各観点を25点満点とし、合計100点で総合評価を出してください。

【評価軸】
1️⃣ 理念共感度（企業理念や事業への理解・共感の深さ）
2️⃣ 経験接続度（自分の経験や学びと企業の方向性の結びつき）
3️⃣ 具体性（抽象的表現ではなく、具体的な事例・行動・成果があるか）
4️⃣ 成長・貢献意欲（入社後にどう貢献・成長したいかが明確か）

【スコアリングガイドライン】
- 内容が浅く、どの企業にも使えそうな志望動機 → 40点未満
- ある程度具体的だが独自性が乏しい → 50〜70点
- 理念・経験・貢献意欲の全てが明確で独自性がある → 80点以上
- 特に熱意・具体性が突出している → 90点以上
スコアにばらつきが出るよう、同質な内容には平均点を、突出して良い内容には高得点をつけてください。

【評価対象の志望動機】
{text}

---

出力フォーマット：
理念共感度: xx点
経験接続度: xx点
具体性: xx点
成長・貢献意欲: xx点
合計スコア: xx
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

# ============================================
# 🧠 職務経歴のスコアリング
# ============================================

def score_work_experience(text: str) -> int:
    """
    職務経歴書テキストから経験・実績スコア（0〜100）を算出する関数。
    GPT-3.5-turbo用。スコア基準付き。
    """
    prompt = f"""
あなたは採用担当者です。
以下の職務経歴を読み、候補者の「経験の深さ・スキルの幅・成果の具体性・一貫性」を
それぞれ25点満点で評価し、合計100点満点のスコアを算出してください。

【評価軸】
1️⃣ 経験の深さ（経験年数・担当業務の難易度・責任範囲）
2️⃣ スキルの幅（扱った技術・ツール・業務領域の多様さ）
3️⃣ 成果の具体性（成果・実績が定量的か、具体的に示されているか）
4️⃣ 一貫性・成長性（キャリアに筋が通っており、成長が見えるか）

【スコアリングガイドライン】
- 期間・成果が曖昧で抽象的 → 40点未満
- 一般的な内容で可もなく不可もない → 50〜70点
- 成果や責任範囲が明確で、経験に厚みがある → 75〜85点
- 業務内容・成果・成長がすべて明確で卓越している → 90点以上
スコアが均一にならないよう、内容の充実度に応じて積極的に点差をつけてください。

【評価対象の職務経歴】
{text}

---

出力フォーマット：
経験の深さ: xx点
スキルの幅: xx点
成果の具体性: xx点
一貫性・成長性: xx点
合計スコア: xx
"""

    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    content = response.choices[0].message.content
    print("🧾 GPT応答（職務経歴スコア）:", content)

    match = re.search(r"\d{1,3}", content)
    return min(int(match.group()), 100) if match else 0