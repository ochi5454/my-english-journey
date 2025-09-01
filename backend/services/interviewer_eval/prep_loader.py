import json
from pathlib import Path
from typing import List, Dict, Optional, Iterable
from backend.core.config import INTERVIEWER_CHECKSHEET_PATH

# ============================================
# 🧠 面接シートの読込
# ============================================

def load_prep_map_with_owner() -> Dict[str, Dict[str, List[dict]]]:
    """
    新構成のみ対応:
        interviewer_checksheet_files/<interviewer_id>/<candidate_id>.json

        返り値の正規化フォーマット:
        { candidate_id: { stage: [ { ...面談ブロック..., "interviewer_id": <iid> }, ... ] } }

        各ファイルの推奨スキーマ:
        {
        "interviewer_id": "user123",        # 省略可（無ければディレクトリ名で補完）
        "candidate_id": "cand_xxx",         # 省略可（無ければファイル名で補完）
        "stages": {
            "面談・1次": {
            "prepItems": [...],
            "reviewedResume": true,
            "qualitative": {...},
            "quantitative": {...},
            "updated_at": "ISO8601"
            },
            ...
        }
    }
    """
    merged: Dict[str, Dict[str, List[dict]]] = {}
    base: Path = INTERVIEWER_CHECKSHEET_PATH
    if not base.exists():
        return merged

    for iid_dir in base.glob("*"):
        if not iid_dir.is_dir():
            continue
        iid = iid_dir.name

        for jf in iid_dir.glob("*.json"):
            try:
                with open(jf, encoding="utf-8") as f:
                    doc = json.load(f)
            except Exception as e:
                print("読み込み失敗:", jf, e)
                continue

            cid = (doc.get("candidate_id") or jf.stem)
            interviewer_id = (doc.get("interviewer_id") or iid)
            stages = doc.get("stages") or {}

            stage_map = merged.setdefault(cid, {})
            for stage, block in (stages or {}).items():
                enriched = {**(block or {}), "interviewer_id": interviewer_id}
                stage_map.setdefault(stage, []).append(enriched)

    return merged

def pick_qa_block_for(
    prep_map: Dict[str, Dict[str, List[dict]]],
    candidate_id: str,
    stage: str,
    interviewer_id: Optional[str]
) -> dict:
    """
    候補者×ステージのQAを1件選ぶ。
    interviewer_id があればその人のものを優先、なければ先頭。
    見つからなければ空dict。
    """
    blocks = (prep_map.get(candidate_id, {}).get(stage, []) or [])
    if interviewer_id:
        for b in blocks:
            if b.get("interviewer_id") == interviewer_id:
                return b
    return blocks[0] if blocks else {}

def iter_all_prep(prep_map: Dict[str, Dict[str, List[dict]]]
                    ) -> Iterable[tuple[str, str, dict]]:
    """prep_map を (candidate_id, stage, qa_block) の列挙にフラット化"""
    for cid, stages in (prep_map or {}).items():
        for stage, blocks in (stages or {}).items():
            for b in (blocks or []):
                yield cid, stage, b