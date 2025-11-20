import re
from typing import List, Dict, Optional, Any, cast
from openai.types.chat import (
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
    ChatCompletionAssistantMessageParam,
)
from backend.core.openai_config import get_openai_client
from backend.models.score_resume import CandidateExpectations
from sqlalchemy.orm import Session

# ============================================
# ✅ GPT呼び出し
# ============================================

client = get_openai_client()

# ============================================
# 🧠 LangChainプロンプトテンプレート
# ============================================

SYSTEM_TEMPLATE = """あなたは経験豊富な人事評価の専門家です。
候補者の履歴書を詳細に分析し、各部門への適合度を評価してスコアを調整します。

【評価の原則】
1. **具体的な根拠**: 履歴書の具体的な記述に基づいて評価する
2. **多角的な分析**: スキル、経験年数、プロジェクト規模、責任範囲を総合的に判断
3. **部門特性**: 各部門が求める専門性・適性を考慮
4. **公平性**: 主観を排除し、客観的な事実に基づく

【評価基準の詳細】
{division_trait_details}

【利用可能な部門】
{divisions}

【出力形式】
1. **スコア提案時**: 必ずマークダウンテーブルで見やすく表示

   | 部門 | 現在 | 変更後 | 調整幅 | 詳細な理由 |
   |------|------|--------|--------|-----------|
   | 営業部門 | 65点 | 70点 | +5点 | 履歴書の「大手法人向け提案営業で年間目標120%達成」という実績から、目標達成能力が高く評価できる。ただし顧客折衝の具体的な困難事例の記載が少ないため、+5点が妥当 |

2. **技術的記述（パース用。絶対に省略しない）**:
   スコアを変更する場合は、**変更した部門ごとに必ず次の形式の行を出力**してください。

   [スコア調整]: 部門=人事部門, 変更後スコア=30, 理由=人事関連の経験が不足しているため

   - 行頭からそのまま書くこと（箇条書きの「- 」や「* 」は付けない）
   - 「部門=」「変更後スコア=」「理由=」というキー名と順番を必ず守る
   - 変更後スコアは半角数字のみ（例: 30, 25, 80）
   - 各部門ごとに1行ずつ出力し、複数部門あれば複数行書く
   - ユーザーが「理由を教えて」「分析して」など**説明のみを求めている場合は、スコアを変更せず [スコア調整] 行を出力しないこと**

3. **確定処理について（重要）**:
   - あなたが **[スコア調整] 行を出力した時点で、システム側ではスコアが即座に保存されます。**
   - そのため、ユーザーに「この内容で確定しますか？」「確定してもよいですか？」などと**確認の質問をしてはいけません。**
   - [スコア調整] 行を出力した場合は、最後に「以上のスコア調整を反映しました。」のように、**すでに反映済みであることを伝える**文章で締めてください。

4. **推奨部門の質問**: ユーザーから「推奨部門は？」「どの部門がいい？」などの質問があった場合:
   [推奨部門]: 部門=最もスコアが高い部門名

5. **合格・不合格の判定**: ユーザーから「合格にして」「不合格にして」などの指示があった場合:
   [判定]: 結果=合格 または [判定]: 結果=不合格

【会話の流れ】
- 提案フェーズ: 詳細な根拠を示してスコア調整を提案
- 議論フェーズ: ユーザーの質問に詳細に回答
- 確定フェーズ: ユーザーが了承したら、[スコア調整] 行を出力し、その直後に「###FINAL」を付けて確定
- 推奨部門: ユーザーから質問があればスコアに基づいて推奨
- 判定: ユーザーから指示があれば合格・不合格を判定
"""

def get_division_traits_map(db: Session) -> dict[str, list[str]]:
    """
    candidate_expectations テーブルから部門ごとの trait_label を取得
    """
    rows = (
        db.query(
            CandidateExpectations.division,
            CandidateExpectations.trait_label
        )
        .order_by(CandidateExpectations.division)
        .all()
    )

    division_map: dict[str, list[str]] = {}

    for division, trait in rows:
        if not division:
            continue
        division_map.setdefault(division, []).append(trait)

    return division_map

def format_division_traits_for_prompt(div_map: dict[str, list[str]]) -> str:
    """
    SYSTEM_TEMPLATE に埋め込む Markdown を生成する
    """
    lines = ["【評価基準の詳細】"]
    for division, traits in div_map.items():
        trait_joined = "、".join(traits)
        lines.append(f"- **{division}**: {trait_joined}")
    return "\n".join(lines)

def generate_score_review_prompt(messages: list[dict], valid_divisions: list[str], division_trait_details: str) -> list[dict]:
    """LangChainのプロンプトテンプレートを使用して、より構造化されたプロンプトを生成"""

    # システムプロンプトを部門リストでフォーマット
    system_content = SYSTEM_TEMPLATE.format(divisions=", ".join(valid_divisions), division_trait_details=division_trait_details)
    system_prompt = {
        "role": "system",
        "content": system_content
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

def call_openai_chat(prompt: List[Dict[str, Any]], model: str = "gpt-4o-mini") -> str:
    """
    OpenAI APIを呼び出してチャット応答を取得
    デフォルトでgpt-4o-miniを使用し、より詳細で質の高い分析を提供
    """
    try:
        messages: List[ChatCompletionMessageParam] = _coerce_messages(prompt)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,  # 一貫性のある評価のため低めに設定
            max_tokens=2000,  # 詳細な分析のため十分なトークン数を確保
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