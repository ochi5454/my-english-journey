import asyncio
from datetime import datetime
from typing import List, Dict, Any, Callable, Optional, Union
from collections import OrderedDict
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.globals import set_llm_cache
from langchain_community.cache import InMemoryCache

from backend.core.database import SessionLocal
from backend.models.score_resume import CandidateExpectations
from backend.utils.division import load_division_profiles, convert_division_to_prefix
from backend.services.score_adjustment.save import save_score_to_history
from backend.services.score_resume.parser import safe_parse_division_scores, safe_parse_motivation, safe_parse_workexp
from backend.schemas.score import DivisionScore

# ============================================
# ✅ LangChain設定
# ============================================

# キャッシュ設定
set_llm_cache(InMemoryCache())

# LLMインスタンス
llm_gpt4 = ChatOpenAI(model="gpt-4o", temperature=0.2)
llm_gpt35 = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.2)

# ============================================
# 🛠️ ユーティリティ関数
# ============================================

EmitFn = Callable[[Dict[str, Any]], None]

def _truncate_text_smart(text: str, max_chars: int = 3000) -> str:
    """重要な情報を残しながらテキストを切り詰める"""
    if len(text) <= max_chars:
        return text
    
    important_keywords = [
        "職務経歴", "業務内容", "実績", "スキル", "資格",
        "学歴", "経験", "プロジェクト", "担当"
    ]
    
    sections = []
    for keyword in important_keywords:
        if keyword in text:
            start = max(0, text.find(keyword) - 50)
            end = min(len(text), text.find(keyword) + 400)
            sections.append(text[start:end])
    
    combined = "\n...\n".join(sections)
    if len(combined) <= max_chars:
        return combined
    
    return text[:max_chars] + "\n...(以下省略)"

# ============================================
# 🧠 プロンプトテンプレート定義
# ============================================

# 共通マストスキルチェック用
must_check_common_template = ChatPromptTemplate.from_messages([
    ("system", "あなたは採用担当者です。候補者の履歴書情報をもとに、マスト条件を満たしているか判定してください。"),
    ("user", """
以下はある候補者の履歴書情報です：
---
{content}
---

以下のマスト条件を満たしているか、それぞれTrueまたはFalseで判定し、その根拠となる理由も併記してください。

条件: {must_keywords}

必ず以下のJSON形式で返してください：
{{
  "大卒以上": {{"result": true, "reason": "東京大学卒業と明記されているため"}},
  ...
}}
""")
])

# 部門別マストスキルチェック用
must_check_division_template = ChatPromptTemplate.from_messages([
    ("system", "あなたは採用担当者です。"),
    ("user", """
以下の候補者の履歴書情報をもとに、「{division}」部門に必要な**特定のマスト条件のみ**について、各条件が満たされているかを判定してください。

条件リスト（これ以外は絶対に判定しないこと）:
{traits}

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
""")
])

# 部門別スコアリング用
division_scoring_template = ChatPromptTemplate.from_messages([
    ("system", "あなたは企業の採用担当者です。"),
    ("user", """
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
{content}

---

【出力形式（JSON）】必ず以下の形式で返してください：
{{
  "scores": [
    {{"division": "部門名", "score": 数値（0〜100）, "reason": "理由"}},
    ...
  ]
}}
""")
])

# 志望動機スコアリング用
motivation_scoring_template = ChatPromptTemplate.from_messages([
    ("system", "あなたは新卒採用の人事担当者です。"),
    ("user", """
以下の志望動機を読み、候補者の「やる気・熱意」を次の4つの観点から評価してください。
**各観点を25点満点**とし、合計100点で総合評価を出してください。

【評価軸（各25点満点）】
1️⃣ 理念共感度（企業理念や事業への理解・共感の深さ）
2️⃣ 経験接続度（自分の経験や学びと企業の方向性の結びつき）
3️⃣ 具体性（抽象的表現ではなく、具体的な事例・行動・成果があるか）
4️⃣ 成長・貢献意欲（入社後にどう貢献・成長したいかが明確か）

【スコアリングガイドライン】
- 各項目は0〜25点で採点してください
- 内容が浅く、どの企業にも使えそうな志望動機 → 各項目10点未満
- ある程度具体的だが独自性が乏しい → 各項目13〜18点
- 理念・経験・貢献意欲の全てが明確で独自性がある → 各項目20点以上
- 特に熱意・具体性が突出している → 各項目23点以上

【評価対象の志望動機】
{text}

---

【出力形式（JSON）】必ず以下の形式で返してください。各項目は25点満点です：
{{
  "理念共感度": 数値（0〜25）,
  "経験接続度": 数値（0〜25）,
  "具体性": 数値（0〜25）,
  "成長貢献意欲": 数値（0〜25）,
  "合計スコア": 数値（0〜100）
}}
""")
])

# 職務経歴スコアリング用
work_experience_template = ChatPromptTemplate.from_messages([
    ("system", "あなたは採用担当者です。"),
    ("user", """
以下の職務経歴を読み、候補者の「経験の深さ・スキルの幅・成果の具体性・一貫性」を
**それぞれ25点満点**で評価し、合計100点満点のスコアを算出してください。

【評価軸（各25点満点）】
1️⃣ 経験の深さ（経験年数・担当業務の難易度・責任範囲）
2️⃣ スキルの幅（扱った技術・ツール・業務領域の多様さ）
3️⃣ 成果の具体性（成果・実績が定量的か、具体的に示されているか）
4️⃣ 一貫性・成長性（キャリアに筋が通っており、成長が見えるか）

【スコアリングガイドライン】
- 各項目は0〜25点で採点してください
- 期間・成果が曖昧で抽象的 → 各項目10点未満
- 一般的な内容で可もなく不可もない → 各項目13〜18点
- 成果や責任範囲が明確で、経験に厚みがある → 各項目19〜21点
- 業務内容・成果・成長がすべて明確で卓越している → 各項目23点以上

【評価対象の職務経歴】
{text}

---

【出力形式（JSON）】必ず以下の形式で返してください。各項目は25点満点です：
{{
  "経験の深さ": 数値（0〜25）,
  "スキルの幅": 数値（0〜25）,
  "成果の具体性": 数値（0〜25）,
  "一貫性成長性": 数値（0〜25）,
  "合計スコア": 数値（0〜100）
}}
""")
])

# ============================================
# 🧠 LangChainチェーン構築
# ============================================

# JSONパーサー
json_parser = JsonOutputParser()

# 部門スコアリングチェーン（LLM → JSON → safe_parse）
division_scoring_chain = (
    division_scoring_template
    | llm_gpt4
    | json_parser
)

# 志望動機スコアリングチェーン
motivation_scoring_chain = (
    motivation_scoring_template
    | llm_gpt35
    | json_parser
)

# 職務経歴スコアリングチェーン
work_experience_chain = (
    work_experience_template
    | llm_gpt35
    | json_parser
)

# マストチェック用
must_check_common_chain = must_check_common_template | llm_gpt4 | json_parser
must_check_division_chain = must_check_division_template | llm_gpt4 | json_parser

# ============================================
# 🧠 共通マストスキルチェック（非同期版）
# ============================================

async def _check_must_requirements_llm_async(content: str) -> dict:
    """非同期版: 共通マストスキルチェック"""
    with SessionLocal() as db:
        rows = db.query(CandidateExpectations)\
                    .filter(CandidateExpectations.division_prefix == "common")\
                    .filter(CandidateExpectations.trait_type == "must_requirement")\
                    .all()
        must_keywords = [r.trait_label.strip() for r in rows if r.trait_label.strip()]

    if not must_keywords:
        return {}

    try:
        result = await must_check_common_chain.ainvoke({
            "content": content,
            "must_keywords": ', '.join(must_keywords)
        })
        return result
        
    except Exception as e:
        print(f"❌ マストチェック失敗: {e}")
        return {k: {"result": False, "reason": "判定失敗"} for k in must_keywords}

def check_must_requirements_llm(content: str) -> dict:
    """同期版ラッパー"""
    return asyncio.run(_check_must_requirements_llm_async(content))

# ============================================
# 🧠 部門別マストスキルチェック（非同期版）
# ============================================

async def _check_must_requirements_by_division_llm_async(
    content: str
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """非同期版: 部門別マストスキルチェック（並列実行）"""
    
    with SessionLocal() as db:
        rows = db.query(CandidateExpectations)\
            .filter(CandidateExpectations.trait_type == "must_requirement")\
            .filter(CandidateExpectations.division_prefix != "common")\
            .all()

    division_map: Dict[str, List[str]] = OrderedDict()
    for r in rows:
        division = r.division.strip()
        label = r.trait_label.strip()
        if not label:
            continue
        division_map.setdefault(division, []).append(label)

    if not division_map:
        return {}

    tasks = []
    division_names = []
    
    for division, traits in division_map.items():
        print(f"🟦 [DEBUG] Division: {division}")
        print(f"🟦 [DEBUG] Traits sent to GPT: {traits}")
        joined_traits = ', '.join(f'"{t}"' for t in traits)
        
        task = must_check_division_chain.ainvoke({
            "content": content,
            "division": division,
            "traits": joined_traits
        })
        tasks.append(task)
        division_names.append((division, traits))

    responses = await asyncio.gather(*tasks, return_exceptions=True)
    print("🟦 [DEBUG] Raw must-check GPT responses:", responses)
    
    results = {}
    for (division, traits), response in zip(division_names, responses):
        try:
            if isinstance(response, Exception):
                raise response
            
            filtered = {k: v for k, v in response.items() if k in traits}
            results[division] = filtered
            
        except Exception as e:
            print(f"❌ 部門別マストチェック失敗 ({division}): {e}")
            results[division] = {
                label: {"result": False, "reason": "パース失敗"} for label in traits
            }

    return results

def check_must_requirements_by_division_llm(content: str) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """同期版ラッパー"""
    return asyncio.run(_check_must_requirements_by_division_llm_async(content))

# ============================================
# 🚀 メインスコアリング関数（非同期版）
# ============================================

async def score_resume_from_text_async(
    text: str,
    candidate_id: str,
    emit: Optional[EmitFn] = None,
) -> dict:
    """
    LangChain最適化版: マストチェックとスコアリングを並列実行
    """
    def log(kind: str, msg: str, **extra):
        if emit:
            emit({"kind": kind, "message": msg, **extra})

    print("📥 score_resume_from_text_async() called: candidate_id=%s", candidate_id)
    log("llm_call", f"📥 候補者ID: {candidate_id}のスコアリングを開始")

    optimized_text = _truncate_text_smart(text, max_chars=4000)
    
    log("parallel_start", "⚡ マストチェックを並列実行中...")
    
    must_results, must_results_by_division = await asyncio.gather(
        _check_must_requirements_llm_async(optimized_text),
        _check_must_requirements_by_division_llm_async(optimized_text)
    )

    print("✅ must_check 結果: %s", must_results)
    print("✅ must_results_by_division 結果: %s", must_results_by_division)
    log("must_check", "✅ マストスキル（共通） 結果ログ", must_results=must_results)
    log("must_check_by_division", "✅ 部門別マストスキル 結果ログ", data=must_results_by_division)

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
    log("division_profiles", "🧠 部門別で求められる歓迎スキル 取得ログ", data=division_profiles)

    division_descriptions = "\n\n".join(
        f"部門名: {profile.get('division','')}\n理想の特徴: {', '.join(profile.get('desired_traits', []))}"
        for profile in division_profiles
    )

    log("division_request", "🤖 LLM呼び出し開始")
    
    try:
        raw = await division_scoring_chain.ainvoke({
            "division_descriptions": division_descriptions,
            "content": optimized_text
        })

        # 🛡 ここで安全に吸収
        result_obj = safe_parse_division_scores(raw)
        scores = result_obj.scores
        
        print("✅ GPT応答 パース成功。件数: %d", len(scores))
        log("division_parse_ok", "✅ GPT応答 パース成功", count=len(scores))
        
    except Exception as e:
        print("❌ GPT応答 処理失敗: %s", e)
        log("division_parse_error", f"❌ GPT応答 処理失敗: {e}")
        scores = [DivisionScore(division="N/A", score=0, reason="解析エラー")]

    ng_divisions = {
        convert_division_to_prefix(div)
        for div, checks in must_results_by_division.items()
        if any(not c.get("result") for c in checks.values())
    }

    normalized_scores = []
    for score_obj in scores:
        div_prefix = convert_division_to_prefix(score_obj.division)
        base_score = score_obj.score

        checks = must_results_by_division.get(score_obj.division) or \
                must_results_by_division.get(div_prefix)
        
        if checks:
            ng_count = sum(1 for c in checks.values() if not c.get("result"))
            PENALTY_PER_NG = 30  # 必須スキル不合格のペナルティ 厳しめに30
            adjusted_score = max(base_score - (ng_count * PENALTY_PER_NG), 0)
        else:
            ng_count = 0
            adjusted_score = base_score

        normalized_scores.append({
            "division": div_prefix,
            "score": adjusted_score,
            "reason": score_obj.reason,
            "base_score": base_score,
            "ng_count": ng_count,
        })

    valid_scores = [s for s in normalized_scores if s["division"] not in ng_divisions]
    recommended = (
        max(valid_scores, key=lambda x: x.get("score", -1))
        if valid_scores else {"division": None}
    )
    
    # ✅ 型安全に処理
    recommended_div = recommended.get("division")
    recommended_division_str = convert_division_to_prefix(recommended_div) if recommended_div else None

    result = {
        "user_id": candidate_id,
        "timestamp": datetime.now().isoformat(),
        "must_check": must_results,
        "must_check_by_division": must_results_by_division,
        "scores": normalized_scores,
        "recommended_division": recommended_division_str,
    }

    save_score_to_history(
        candidate_id=candidate_id,
        new_scores=result["scores"],
        source="resume_upload",
        updated_by="system",
    )

    print("📊 正常に取得したスコア: %s", normalized_scores)
    print("🏆 recommended_division: %s", result["recommended_division"])
    log("division_scores_ready", "📊 正常に取得したスコア", scores=normalized_scores)
    log("division_recommended", "🏆 recommended_division", division=result["recommended_division"])
    
    return result

# ============================================
# 🧠 志望動機のスコアリング（LangChain版）
# ============================================

async def score_motivation_statement_async(text: str) -> int:
    """LangChain版: 志望動機スコアリング（非同期）"""
    text = _truncate_text_smart(text, max_chars=800)
    
    try:
        raw = await motivation_scoring_chain.ainvoke({"text": text})
        result = safe_parse_motivation(raw)
            
        print("📝 志望動機スコア:", result)
        return min(result.合計スコア, 100)
    except Exception as e:
        print(f"❌ 志望動機スコアリング失敗: {e}")
        return 0

def score_motivation_statement(text: str) -> int:
    """同期版ラッパー"""
    return asyncio.run(score_motivation_statement_async(text))

# ============================================
# 🧠 職務経歴のスコアリング（LangChain版）
# ============================================

async def score_work_experience_async(text: str) -> int:
    """LangChain版: 職務経歴スコアリング（非同期）"""
    text = _truncate_text_smart(text, max_chars=1000)
    
    try:
        raw = await work_experience_chain.ainvoke({"text": text})
        result = safe_parse_workexp(raw)
            
        print("🧾 職務経歴スコア:", result)
        return min(result.合計スコア, 100)
    except Exception as e:
        print(f"❌ 職務経歴スコアリング失敗: {e}")
        return 0

def score_work_experience(text: str) -> int:
    """同期版ラッパー"""
    return asyncio.run(score_work_experience_async(text))

__all__ = [
    'score_resume_from_text_async',
    'score_motivation_statement_async',
    'score_work_experience_async',
    '_check_must_requirements_llm_async',
    '_check_must_requirements_by_division_llm_async',
]