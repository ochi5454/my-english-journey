import json
from pathlib import Path
from typing import Dict, Any, Mapping, Union

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