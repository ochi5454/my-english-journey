import json
import os
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Iterable
from backend.core.config import INTERVIEWER_EVALS_PATH

# ============================================
# 🧠 キャッシュファイルの読込
# ============================================

def _empty_cache(iid: str | None = None) -> dict:
    return {"version": "1", "generated_at": None, "interviewer_id": iid, "rows": []}

def _cache_file_for(iid: str) -> Path:
    INTERVIEWER_EVALS_PATH.mkdir(parents=True, exist_ok=True)
    safe = iid.replace("/", "_")
    return INTERVIEWER_EVALS_PATH / f"{safe}.json"

def load_evals_cache_for(iid: str) -> dict:
    p = _cache_file_for(iid)
    if not p.exists():
        return _empty_cache(iid)
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        # 古い形式のファイルでも rows だけあれば救う
        if "interviewer_id" not in data:
            data["interviewer_id"] = iid
        return data
    except Exception:
        # 破損は退避して空を返す
        try:
            p.rename(p.with_suffix(p.suffix + f".bak.{int(time.time())}"))
        except Exception:
            pass
        return _empty_cache(iid)

def save_evals_cache_for(iid: str, cache: dict) -> None:
    p = _cache_file_for(iid)
    cache = {**cache, "version": "1", "interviewer_id": iid, "generated_at": datetime.now().isoformat()}
    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(INTERVIEWER_EVALS_PATH))
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp_path, p)
    finally:
        if os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except Exception: pass

def iter_cache_files() -> Iterable[Path]:
    if not INTERVIEWER_EVALS_PATH.exists():
        return []
    return INTERVIEWER_EVALS_PATH.glob("*.json")

def load_evals_cache_aggregate() -> dict:
    """全ファイルを合算（閲覧用途）。"""
    rows, latest = [], None
    for fp in iter_cache_files():
        try:
            with open(fp, encoding="utf-8") as f:
                d = json.load(f)
            rows.extend(d.get("rows") or [])
            ga = d.get("generated_at")
            if ga and (latest is None or ga > latest):
                latest = ga
        except Exception:
            continue
    return {"version": "1", "generated_at": latest, "rows": rows}

def index_rows(rows: list[dict]) -> dict[str, dict]:
    from backend.services.interviewer_eval.interviewer_diff import _row_key
    idx = {}
    for r in rows or []:
        k = _row_key(r["candidate_id"], r["interviewer_id"], r["stage"])
        idx[k] = r
    return idx

def filter_cache_rows_in_memory(
    rows: list[dict],
    stage: str|None=None,
    q: str|None=None,
    interviewer_id: str|None=None,
    candidate_id: str|None=None,
    limit: int|None=None
) -> list[dict]:
    needle = (q or "").strip().lower()
    out = []
    for r in rows or []:
        if stage and r["stage"] != stage: continue
        if interviewer_id and r["interviewer_id"] != interviewer_id: continue
        if candidate_id and r["candidate_id"] != candidate_id: continue
        if needle and (needle not in r["interviewer_id"].lower() and needle not in r["candidate_id"].lower()): continue
        out.append(r)
        if limit and len(out) >= limit: break
    out.sort(key=lambda x: (x["stage"], x["interviewer_id"], x["candidate_id"]))
    return out
