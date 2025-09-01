import json
from pathlib import Path
from typing import Dict, Any, Mapping, Union
from backend.core.config import RESULT_PATH

# ============================================
# 🧠 部署の読込
# ============================================

def load_division_profiles(skills_dir: Path) -> list:
    profiles = []
    for json_file in skills_dir.glob("*.json"):
        if json_file.name == "common.json":
            continue
        with open(json_file, encoding='utf-8') as f:
            data = json.load(f)
            profiles.append(data)
    return profiles

def load_division_names(skills_dir: Path) -> list[str]:
    divisions = []
    for json_file in skills_dir.glob("*.json"):
        if json_file.name == "common.json":
            continue
        with open(json_file, encoding="utf-8") as f:
            data = json.load(f)
            if "division" in data:
                divisions.append(data["division"])
    return divisions

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

def _safe_load_json_list(path: Union[str, Path]) -> list:
    data = _load_json(path)
    if isinstance(data, list):
        return data
    return []

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