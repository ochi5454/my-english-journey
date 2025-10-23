import re
from typing import List, Dict, Optional, Any, cast
from openai.types.chat import (
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
    ChatCompletionAssistantMessageParam,
)
from backend.core.openai_config import get_openai_client

# ============================================
# ✅ GPT呼び出し
# ============================================

client = get_openai_client()

# ============================================
# 🧠 スコア調整用AIプロンプト・呼び出し系
# ============================================

def generate_score_review_prompt(messages: list[dict], valid_divisions: list[str]) -> list[dict]:
    system_prompt = {
        "role": "system",
        "content": (
            "あなたは人事のスコア精査アシスタントです。\n"
            "ユーザー（人事担当者）と自然な会話を通じて、候補者の部門別スコア評価を再検討します。\n\n"
            "【目的】\n"
            "- ユーザーの意図を理解し、必要に応じてスコアを提案・修正します。\n"
            "- スコア調整が確定したときだけ、文末に「###FINAL」を付けてください。\n"
            "- 「###FINAL」を出すのはスコア確定の最終1回のみです。\n"
            "- それ以外の応答では「###FINAL」を付けてはいけません。\n\n"
            "【利用できる部門一覧】\n"
            f"{', '.join(valid_divisions)}\n\n"
            "【会話ルール】\n"
            "- 必要なら観点や理由を確認してから調整を提案してください。\n"
            "- スコアを提案する際は次の形式を使ってください。\n\n"
            "[スコア調整]: 部門=◯◯, 変更後スコア=◯, 理由=◯◯\n\n"
            "例：\n"
            "👥 通常会話 → 「了解しました。どの観点を重視しますか？」\n"
            "🏁 最終確定 → 「課題解決力を重視して+5点調整します。###FINAL」"
        ),
    }
    return [system_prompt] + messages[-5:]

def _coerce_messages(prompt: List[Dict[str, Any]]) -> List[ChatCompletionMessageParam]:
    """ゆるいdictの配列をChatCompletionMessageParamに正規化"""
    out: List[ChatCompletionMessageParam] = []
    for m in prompt:
        role = m.get("role")
        content = m.get("content")
        if role == "user":
            out.append(cast(ChatCompletionUserMessageParam, {"role": "user", "content": content}))
        elif role == "system":
            out.append(cast(ChatCompletionSystemMessageParam, {"role": "system", "content": content}))
        elif role == "assistant":
            out.append(cast(ChatCompletionAssistantMessageParam, {"role": "assistant", "content": content}))
        else:
            # 未知のroleはuser扱いにフォールバック
            out.append(cast(ChatCompletionUserMessageParam, {"role": "user", "content": content}))
    return out

def call_openai_chat(prompt: List[Dict[str, Any]], model: str = "gpt-3.5-turbo") -> str:
    try:
        messages: List[ChatCompletionMessageParam] = _coerce_messages(prompt)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
        )
        return (response.choices[0].message.content or "")
    except Exception as e:
        return f"AI応答に失敗しました: {str(e)}"

def parse_score_adjustments(
    reply: Optional[str],
    original_scores: dict,
    allow_nochange: bool = True,
) -> List[dict]:
    if not reply or not isinstance(reply, str):
        return []

    # 全角→半角などのゆれを吸収
    text = (reply.replace("，", ",")
                    .replace("：", ":")
                    .replace("．", "。")
                    .replace("　", " "))

    # 複数行対応。「変更なし」もパースできるように
    pattern = r"""
        \[スコア調整\]\s*:\s*
        部門\s*=\s*(.+?)\s*,\s*
        変更後スコア\s*=\s*(変更なし|-?\d+)\s*,\s*
        理由\s*=\s*(.+?)
        (?:[。．]?\s*(?:\r?\n|$))
    """
    matches = re.findall(pattern, text, flags=re.VERBOSE)

    results: List[dict] = []
    for division, score_str, reason in matches:
        division = division.strip()
        reason = reason.strip()

        # 「変更なし」は保存しない（履歴汚し防止）
        if allow_nochange and score_str.strip() == "変更なし":
            continue

        # 数値以外はスキップ
        if not re.fullmatch(r"-?\d+", score_str.strip()):
            continue

        new_score = int(score_str)
        old_score = original_scores.get(division)

        # ✅ 追加: スコアを 0〜100 に正規化
        new_score = max(0, min(100, new_score))

        # 実質変更なしはスキップ
        if old_score is not None and new_score == old_score:
            continue

        results.append({"division": division, "score": new_score, "reason": reason})

    return results

def extract_original_scores_from_message(text: str) -> dict:
    """
    「【部門名】現在スコア: X点, 理由: ...」という形式から部門ごとのスコアを抽出
    """
    results = {}
    lines = text.splitlines()
    for line in lines:
        match = re.match(r"【(.+?)】現在スコア: (\d+)点", line)
        if match:
            division = match.group(1).strip()
            score = int(match.group(2))
            results[division] = score
    return results