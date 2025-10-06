import json
from pathlib import Path
from typing import Dict, Any, Mapping, Union
from backend.core.config import RESULT_PATH
from backend.models.trait import ResumeTrait
from backend.models.checksheet import ResumeHiringDecision, ResumeRoleTitle, ResumeQualitativeItem, ResumeQuantitativeItem
from backend.core.database import get_db
from collections import defaultdict

# ============================================
# 🧠 部署の読込
# ============================================

def load_division_profiles() -> list[dict]:
    """
    resume_traits テーブルから division ごとの desired_traits を構成したプロファイル一覧を返す。
    """
    with get_db() as db:
        rows = db.query(ResumeTrait)\
                    .filter(ResumeTrait.trait_type == "desired_trait")\
                    .filter(ResumeTrait.division.isnot(None))\
                    .all()
        
        division_map = defaultdict(list)
        for row in rows:
            division = row.division.strip()
            label = row.trait_label.strip()
            if division and label:
                division_map[division].append(label)
        
        # profilesの形式に変換
        profiles = [
            {"division": division, "desired_traits": traits}
            for division, traits in division_map.items()
        ]
        return profiles

def load_division_names() -> list[str]:
    """
    resume_traits テーブルからユニークな division 名を取得。
    """
    with get_db() as db:
        divisions = db.query(ResumeTrait.division)\
                        .distinct()\
                        .filter(ResumeTrait.division.isnot(None))\
                        .order_by(ResumeTrait.division)\
                        .all()
        # 結果は list[Tuple[str]] なので、flattenして返す
        return [d[0] for d in divisions]

# ============================================
# 🧠 スコア判定結果ファイルの保存
# ============================================

def save_result_to_file(result: dict, candidate_id: str):
    out_path = RESULT_PATH / f"{candidate_id}_result.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

# ============================================
# 🧠 ファイル読込
# ============================================

def _load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {"error": str(e)}
    
def _safe_load_json(path: Union[str, Path]) -> Dict[str, Any]:
    data: Any = _load_json(path)
    if isinstance(data, Mapping):
        try:
            return {str(k): v for k, v in data.items()}
        except Exception:
            return dict(data)  # type: ignore[arg-type]
    return {}

def load_hiring_decisions() -> list[dict]:
    with get_db() as db:
        rows = db.query(ResumeHiringDecision).order_by(ResumeHiringDecision.order).all()
        return [
            {
                "id": row.id,
                "value": row.value,
                "label": row.label,
                "order": row.order,
                "description": row.description
            }
            for row in rows
        ]
    
def load_role_titles() -> list[dict]:
    with get_db() as db:
        rows = db.query(ResumeRoleTitle).order_by(ResumeRoleTitle.order).all()
        return [
            {
                "id": row.id,
                "value": row.value,
                "label": row.label,
                "order": row.order
            }
            for row in rows
        ]
    
def load_qualitative_items() -> list[dict]:
    with get_db() as db:
        rows = db.query(ResumeQualitativeItem).all()
        return [
            {
                "id": row.id,
                "key": row.key,
                "label": row.label,
                "placeholder": row.placeholder
            }
            for row in rows
        ]
    
def load_quantitative_items() -> list[dict]:
    with get_db() as db:
        rows = db.query(ResumeQuantitativeItem).all()

        result = []
        for row in rows:
            # 関連する levels を value の昇順でソート
            levels = sorted(row.levels, key=lambda l: l.value)

            result.append({
                "key": row.key,
                "label": row.label,
                "hint": row.hint,
                "comment_placeholder": row.comment_placeholder,
                "levels": [
                    {
                        "value": level.value,
                        "label": level.label
                    }
                    for level in levels
                ],
                "rubrics": [r.rubric for r in row.rubrics]
            })

        return result

# ============================================
# 🧠 ファイル保存
# ============================================

def save_json(filepath: Path, data: dict, ensure_dir: bool = True, indent: int = 2) -> None:
    """
    指定されたPathにJSONを保存する。

    Args:
        filepath (Path): 保存先のファイルパス（例: Path("user123/cand_abc.json")）
        data (dict): 保存するデータ
        ensure_dir (bool): 親ディレクトリが存在しない場合は作成するか（デフォルト: True）
        indent (int): インデント幅（整形出力用）
    """
    if ensure_dir:
        filepath.parent.mkdir(parents=True, exist_ok=True)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)