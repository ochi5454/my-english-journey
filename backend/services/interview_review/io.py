import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
import aiofiles
import orjson
from typing import Dict, Optional, Any
from backend.core.config import INTERVIEWER_CHECKSHEET_PATH

# ============================================
# 🧠 面談シート抽出・整形・構造化
# ============================================

def _shape_block(raw: Dict[str, Any], stage: str) -> Dict[str, Any]:
    stages = (raw.get("stages") or {})
    block = stages.get(stage) or {}
    return {
        "prepItems": block.get("prepItems", []),
        "reviewedResume": bool(block.get("reviewedResume", False)),
        "qualitative": block.get("qualitative") or {},
        "quantitative": block.get("quantitative") or {},
        "updated_at": block.get("updated_at"),
    }

async def get_checksheet_one_async(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    base: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    interviewer_checksheet_files/<iid>/<cid>.json から該当 stage ブロックだけ返す（非同期I/O版）
    返り値: { prepItems, reviewedResume, qualitative, quantitative, updated_at } or {}
    例外:
        - FileNotFoundError: ファイルが無い
        - ValueError: 入力不正
        - RuntimeError: JSON読込に失敗
    """
    if not interviewer_id or not candidate_id or not stage:
        raise ValueError("interviewer_id, candidate_id, stage は必須です")

    base = base or INTERVIEWER_CHECKSHEET_PATH
    fp = (base / interviewer_id / f"{candidate_id}.json")

    if not fp.exists():
        # exists() 自体は同期だが軽い stat。必要なら anyio.to_thread に逃がせる
        raise FileNotFoundError(str(fp))

    try:
        # テキストではなく bytes を読み、orjson.loads で高速デコード
        async with aiofiles.open(fp, "rb") as f:
            data_bytes = await f.read()
        doc = orjson.loads(data_bytes) if data_bytes else {}
    except FileNotFoundError:
        raise
    except Exception as e:
        # デコード失敗や I/O エラーをまとめて RuntimeError に
        raise RuntimeError(f"JSON read failed: {e}")

    return _shape_block(doc, stage)

def get_checksheet_one(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    base: Path | None = None,
) -> Dict[str, Any]:
    """
    interviewer_checksheet_files/<iid>/<cid>.json から該当 stage ブロックだけ返す。
    返り値: { prepItems, reviewedResume, qualitative, quantitative, updated_at } or {}
    例外:
        - FileNotFoundError: ファイルが無い
        - ValueError: 入力不正
        - RuntimeError: JSON読込に失敗
    """
    if not interviewer_id or not candidate_id or not stage:
        raise ValueError("interviewer_id, candidate_id, stage は必須です")

    base = base or INTERVIEWER_CHECKSHEET_PATH
    fp = (base / interviewer_id / f"{candidate_id}.json")

    if not fp.exists():
        raise FileNotFoundError(str(fp))

    try:
        with fp.open(encoding="utf-8") as f:
            doc = json.load(f) or {}
    except Exception as e:
        raise RuntimeError(f"JSON read failed: {e}")

    block = (doc.get("stages") or {}).get(stage) or {}
    # 最小セットで整形
    return {
        "prepItems": block.get("prepItems", []),
        "reviewedResume": bool(block.get("reviewedResume", False)),
        "qualitative": block.get("qualitative") or {},
        "quantitative": block.get("quantitative") or {},
        "updated_at": block.get("updated_at"),
    }

def upsert_checksheet(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    payload: dict,
) -> bool:
    """interviewer_checksheet_files/<iid>/<cid>.json をステージ単位で upsert"""
    base: Path = INTERVIEWER_CHECKSHEET_PATH / interviewer_id
    base.mkdir(parents=True, exist_ok=True)
    fp = base / f"{candidate_id}.json"

    doc = {}
    if fp.exists():
        try:
            with open(fp, encoding="utf-8") as f:
                doc = json.load(f)
        except Exception:
            doc = {}

    # ルート情報を補完
    doc.setdefault("interviewer_id", interviewer_id)
    doc.setdefault("candidate_id", candidate_id)
    stages = doc.setdefault("stages", {})

    # ステージの中身を上書き/追記
    block = stages.get(stage, {})
    block.update({
        "prepItems": payload.get("prepItems", []),
        "reviewedResume": bool(payload.get("reviewedResume", False)),
        "qualitative": payload.get("qualitative") or {},
        "quantitative": payload.get("quantitative") or {},
        "updated_at": datetime.now().isoformat(),
    })
    stages[stage] = block

    # アトミックに保存
    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(base))
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp_path, fp)
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except Exception: pass

    return True

def upsert_checksheets_block(
    interviewer_id: str,
    candidate_id: str,
    stage: str,
    block: dict,                              # {prepItems, reviewedResume, qualitative, quantitative, updated_at, ...}
) -> None:
    """
    interviewer_checksheet_files/<interviewer_id>/<candidate_id>.json に
    stages[stage] を upsert（他ステージは保持）
    """
    base = INTERVIEWER_CHECKSHEET_PATH / interviewer_id
    base.mkdir(parents=True, exist_ok=True)
    jf = base / f"{candidate_id}.json"

    doc = {}
    if jf.exists():
        try:
            with open(jf, encoding="utf-8") as f:
                doc = json.load(f)
        except Exception:
            doc = {}

    # メタは上書き補完
    doc.setdefault("interviewer_id", interviewer_id)
    doc.setdefault("candidate_id", candidate_id)
    stages = doc.setdefault("stages", {})

    stages[stage] = {**(stages.get(stage) or {}), **block}

    with open(jf, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)