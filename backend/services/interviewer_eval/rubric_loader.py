import json
from pathlib import Path
from hashlib import sha1
from backend.core.config import INTERVIEWER_COMMONSKILLS_PATH

# ============================================
# 🧠 基礎スコア評価
# ============================================

def load_interviewer_skills(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> dict:
    """面談者評価のルーブリック(JSON)を読み込み"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def default_interviewer_rubric() -> dict:
    """ファイルが無い/壊れている場合のデフォルト."""
    return {
        "version": "default",
        "max_score": 10,
        "criteria": [
            {"key": "prep",           "label": "事前準備",     "weight": 0.25, "guidance": ""},
            {"key": "coverage",       "label": "論点網羅",     "weight": 0.20, "guidance": ""},
            {"key": "depth",          "label": "深掘り",       "weight": 0.20, "guidance": ""},
            {"key": "evidence",       "label": "エビデンス活用","weight": 0.20, "guidance": ""},
            {"key": "professionalism","label": "プロ意識",     "weight": 0.15, "guidance": ""},
        ],
    }

def read_interviewer_rubric_file(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> dict:
    """ルーブリックJSONをそのまま読む（存在しなければ例外）。"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def make_rubric_etag(data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return sha1(body).hexdigest()[:16]

def normalize_rubric(raw: dict) -> dict:
    """
    形と値を整える:
    - version / max_score の補完
    - criteria を正規化（欠損/型違い除外、weightの範囲クリップ）
    - 重み合計が0なら等分に再配分
    """
    if not isinstance(raw, dict):
        raw = {}

    version = str(raw.get("version") or "unknown")
    max_score = int(raw.get("max_score") or 10)

    crits = raw.get("criteria") or []
    norm = []
    for c in crits:
        if not isinstance(c, dict):
            continue
        key = str(c.get("key") or "").strip()
        label = str(c.get("label") or key or "").strip()
        if not key or not label:
            continue
        try:
            w = float(c.get("weight", 0.0))
        except Exception:
            w = 0.0
        w = max(0.0, min(1.0, w))
        norm.append({
            "key": key,
            "label": label,
            "weight": w,
            "guidance": c.get("guidance") or "",
        })

    # 重み合計が0なら等分
    wsum = sum(c["weight"] for c in norm)
    if norm and wsum == 0:
        eq = 1.0 / len(norm)
        for c in norm:
            c["weight"] = eq

    return {"version": version, "max_score": max_score, "criteria": norm}

def get_interviewer_rubric_or_default(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> dict:
    """
    ファイル → 正規化。失敗時はデフォルト → 正規化。
    UIがそのまま使える形を保証して返す。
    """
    try:
        raw = read_interviewer_rubric_file(path)
    except FileNotFoundError:
        raw = default_interviewer_rubric()
    except Exception:
        # 破損等は安全側でデフォルト
        raw = default_interviewer_rubric()
    return normalize_rubric(raw)

def load_rubric_for_http(path: Path = INTERVIEWER_COMMONSKILLS_PATH) -> tuple[dict, str]:
    """
    HTTP レスポンス向けに (data, etag) を用意。
    """
    data = get_interviewer_rubric_or_default(path)
    return data, make_rubric_etag(data)
