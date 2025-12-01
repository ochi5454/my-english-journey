from typing import Dict, Any
from backend.schemas.score import (
    DivisionScoreList,
    MotivationScore,
    WorkExperienceScore
)

# 🛡 部門スコア（List形式）
def safe_parse_division_scores(raw: dict) -> DivisionScoreList:
    try:
        return DivisionScoreList(**raw)
    except Exception:
        fixed = {"scores": []}

        if isinstance(raw, dict) and "scores" in raw and isinstance(raw["scores"], list):
            fixed["scores"] = []
            for item in raw["scores"]:
                if not isinstance(item, dict):
                    continue
                
                division = item.get("division", "N/A")
                score = item.get("score", 0)
                reason = item.get("reason", "補完された理由")

                fixed["scores"].append({
                    "division": division,
                    "score": score,
                    "reason": reason
                })

        return DivisionScoreList(**fixed)


# 🛡 志望動機
def safe_parse_motivation(raw: Dict[str, Any]) -> MotivationScore:
    default = {
        "理念共感度": 0,
        "経験接続度": 0,
        "具体性": 0,
        "成長貢献意欲": 0,
        "合計スコア": 0,
    }
    if isinstance(raw, dict):
        for k in default:
            default[k] = raw.get(k, default[k])

    return MotivationScore(**default)


# 🛡 職務経歴
def safe_parse_workexp(raw: Dict[str, Any]) -> WorkExperienceScore:
    default = {
        "経験の深さ": 0,
        "スキルの幅": 0,
        "成果の具体性": 0,
        "一貫性成長性": 0,
        "合計スコア": 0,
    }
    if isinstance(raw, dict):
        for k in default:
            default[k] = raw.get(k, default[k])

    return WorkExperienceScore(**default)