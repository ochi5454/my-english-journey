from typing import Optional
from typing import List

def parse_interview_score_adjustment(reply: Optional[str], original_scores: dict) -> List[dict]:
    if not reply or not isinstance(reply, str):
        return []

    import re

    # 全角→半角ゆれ吸収
    text = (reply.replace("，", ",")
                .replace("：", ":")
                .replace("．", ".")
                .replace("　", " "))

    # パターン抽出
    pattern = r"部門\s*=\s*([^,\n]+)\s*,\s*スコア\s*=\s*([^,\n]+)\s*,\s*理由\s*=\s*(.+)"
    m = re.search(pattern, text)
    if not m:
        return []

    division_jp = m.group(1).strip()
    score_raw = m.group(2).strip()
    reason = m.group(3).strip()

    # スコア数値チェック
    if not re.fullmatch(r"-?\d+", score_raw):
        return []

    new_score = int(score_raw)
    new_score = max(0, min(100, new_score))  # 0〜100

    # ここでは old_score チェックしない！！！（prefix 変換後にやる）
    return [{
        "division": division_jp,
        "score": new_score,
        "reason": reason
    }]