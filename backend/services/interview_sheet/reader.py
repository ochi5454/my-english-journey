import json
from backend.core.config import INTERVIEWER_CHECKSHEET_PATH
from typing import List, Dict, Optional, Any

# ============================================
# 🧠 面接シートの読み取り・一覧取得
# ============================================

def list_checksheet_by_interviewer(interviewer_id: str) -> Dict[str, Dict[str, Any]]:
    """
    指定面接官の配下にある全候補者ファイルを {candidate_id: doc} で返す。
    """
    base = INTERVIEWER_CHECKSHEET_PATH / interviewer_id
    if not base.exists():
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for jf in base.glob("*.json"):
        try:
            with open(jf, encoding="utf-8") as f:
                doc = json.load(f)
            cid = doc.get("candidate_id") or jf.stem
            out[cid] = doc
        except Exception as e:
            print("読み込み失敗:", jf, e)
    return out

def list_all_checksheet_blocks():
    results = []

    for interviewer_dir in INTERVIEWER_CHECKSHEET_PATH.iterdir():
        if not interviewer_dir.is_dir():
            continue

        for file in interviewer_dir.glob("*.json"):
            try:
                with open(file, encoding="utf-8") as f:
                    data = json.load(f)

                # ファイル名: {candidate_id}_{stage}.json を分解
                name_parts = file.stem.split("_")
                if len(name_parts) < 2:
                    continue
                candidate_id = "_".join(name_parts[:-1])
                stage = name_parts[-1]

                results.append({
                    "candidate_id": candidate_id,
                    "interviewer_id": interviewer_dir.name,
                    "stage": stage,
                    **data
                })
            except Exception:
                continue  # 読み込みエラーはスキップ

    return results

def get_divisions(result: dict) -> List[str]:
    return [s.get("division") for s in result.get("scores", []) if s.get("division")]

def _as_non_empty_str(x: Any) -> Optional[str]:
    """値を非空strに正規化。空/None/非strは None を返す。"""
    if isinstance(x, str):
        s = x.strip()
        return s if s else None
    return None