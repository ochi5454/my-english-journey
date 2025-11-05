import os
import re
import json
import logging
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.schemas.division_skill import SuggestedSkills, SuggestSkillsResponse

logger = logging.getLogger(__name__)

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


# ------------------------------
# 🔧 正規化 & 重複ヘルパー
# ------------------------------
def _normalize_label(s: str) -> str:
    return s.strip().lower()


def _dedupe(labels: List[str]) -> List[str]:
    seen = set()
    result = []
    for label in labels:
        norm = _normalize_label(label)
        if norm and norm not in seen:
            seen.add(norm)
            result.append(label.strip())
    return result


# ------------------------------
# 🧠 AIスキル抽出
# ------------------------------
def _extract_skills_with_ai(content: str) -> SuggestedSkills:
    """
    AIを用いてスキルを抽出し、must_requirement / desired_trait に分類して返す。
    """
    if not content.strip():
        return SuggestedSkills(must_requirement=[], desired_trait=[])

    # --- APIキー未設定時（フォールバック） ---
    if not OPENAI_API_KEY:
        parts = re.split(r"[,、/・\|\n]", content)
        labels = [p.strip() for p in parts if 1 < len(p.strip()) <= 64]
        return SuggestedSkills(
            must_requirement=_dedupe(labels[: len(labels)//2]),
            desired_trait=_dedupe(labels[len(labels)//2 :]),
        )

    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)

    # 🧠 改善プロンプト
    system = (
        "あなたは採用アナリストです。以下の求人票本文を分析し、"
        "仕事内容・応募条件・応募資格・求める人物像などから、"
        "仕事に必要とされるスキル・知識・資格・経験を幅広く抽出してください。\n\n"
        "分類は以下の2つです：\n"
        "1. 'must_requirement'（マスト要件）:\n"
        "- 「必須」「応募条件」「必要」「要」「資格」「最終学歴」などの表現を含む項目。\n"
        "- または文脈的に業務遂行に不可欠なスキル・経験・学歴も含む。\n"
        "（例: '監理技術者', '施工管理経験', '高等学校卒以上', '普通自動車免許'）\n\n"
        "2. 'desired_trait'（歓迎要件）:\n"
        "- 「歓迎」「望ましい」「尚可」「優遇」「あると尚良い」「プラス評価」などの表現を含む項目。\n"
        "- または人物特性・補完的スキル・人間的資質など。\n"
        "（例: 'チームワーク', 'リーダーシップ', '柔軟性', 'コミュニケーション能力'）\n\n"
        "出力形式（JSONのみ）:\n"
        "{\n"
        "  \"must_requirement\": [\"スキル1\", \"スキル2\", ...],\n"
        "  \"desired_trait\": [\"スキルA\", \"スキルB\", ...]\n"
        "}\n\n"
        "制約:\n"
        "- JSON以外の文章や説明は一切含めないこと。\n"
        "- 各配列には最低10件ずつ、関連するスキルを可能な限り抽出すること。\n"
        "- 各スキルは20文字以内の短い名詞句（資格名・スキル名・性格特性など）にすること。\n"
        "- 「学歴」も業務条件の一部として抽出対象に含めてよい。\n"
    )

    # 🔥 実行
    comp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": content[:12000]},
        ],
        temperature=0.3,
    )

    raw = comp.choices[0].message.content
    if raw is None:
        logger.warning("AI応答が空でした。")
        return SuggestedSkills(must_requirement=[], desired_trait=[])
    raw = raw.strip()

    # ✅ コードブロック除去
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = re.sub(r"^json", "", raw).strip()

    # ✅ JSONパース
    try:
        data = json.loads(raw)
        must = data.get("must_requirement", [])
        desired = data.get("desired_trait", [])
    except Exception:
        logger.warning("AI出力のJSON解析に失敗しました: %s", raw)
        must, desired = [], []

    return SuggestedSkills(
        must_requirement=_dedupe(must),
        desired_trait=_dedupe(desired)
    )


# ------------------------------
# 🚀 公開サービス関数
# ------------------------------
def suggest_skills_from_job(
    db: Session,
    job_text: Optional[str],
    division: Optional[str],
    division_prefix: Optional[str],
) -> SuggestSkillsResponse:
    """
    求人票本文をAIに渡し、マスト/歓迎スキル候補を抽出して返す。
    """
    if not job_text or not job_text.strip():
        raise ValueError("求人票本文を入力してください。")

    logger.info("求人票本文をもとにスキル抽出を開始します。")

    sg = _extract_skills_with_ai(job_text)

    # まだDB重複除去はオフ。将来的に再導入可能
    return SuggestSkillsResponse(
        division=division,
        division_prefix=division_prefix,
        suggested=sg,
        deduped_against_existing=sg,
    )