import json
from hashlib import sha1
from datetime import date
from backend.core.database import SessionLocal
from backend.models.score_ofinterviewer import InterviewerCriteriaItem 

# ============================================
# 🧠 基礎スコア評価
# ============================================

def load_interviewer_skills(version: date | None = None) -> dict:
    """DBから面談評価ルーブリックを読み込んで整形したdictで返す。"""
    from backend.services.score_ofinterviewer.score_rubric import default_interviewer_rubric

    with SessionLocal() as db:
        query = db.query(InterviewerCriteriaItem)
        if version:
            query = query.filter(InterviewerCriteriaItem.version == version)
        items = query.order_by(InterviewerCriteriaItem.id).all()

        if not items:
            return default_interviewer_rubric()

        # 🔧 Fix: Explicitly get attribute values and convert
        weights = [float(getattr(i, 'weight', 0.0)) for i in items]
        weights_sum = sum(weights)
        
        if weights_sum == 0:
            equal_weight = round(1.0 / len(items), 4)
            weights = [equal_weight] * len(items)

        criteria = [
            {
                "key": str(i.key),
                "label": str(i.label),
                "weight": w,
                "guidance": str(i.guidance or "")
            }
            for i, w in zip(items, weights)
        ]
        return {
            "version": str(items[0].version),
            "max_score": 10,
            "criteria": criteria,
        }
     
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

def get_interviewer_rubric_or_default(version: date | None = None) -> dict:
    from backend.services.score_ofinterviewer.score_rubric import default_interviewer_rubric
    from typing import cast

    with SessionLocal() as db:
        query = db.query(InterviewerCriteriaItem)
        if version:
            query = query.filter(InterviewerCriteriaItem.version == version)
        items = query.order_by(InterviewerCriteriaItem.id).all()

        if not items:
            return normalize_rubric(default_interviewer_rubric())

        # 🔧 Fix: Use cast to tell type checker this is a float
        weights = [cast(float, i.weight) for i in items]
        weights_sum = sum(weights)
        
        if weights_sum == 0:
            equal_weight = round(1.0 / len(items), 4)
            weights = [equal_weight] * len(items)

        criteria = [
            {
                "key": str(i.key),
                "label": str(i.label),
                "weight": w,
                "guidance": str(i.guidance or "")
            }
            for i, w in zip(items, weights)
        ]
        return normalize_rubric({
            "version": str(items[0].version),
            "max_score": 10,
            "criteria": criteria,
        })

def load_rubric_for_http(version: date | None = None) -> tuple[dict, str]:
    """
    HTTP レスポンス向けに (data, etag) を用意（DBから取得）。
    """
    data = get_interviewer_rubric_or_default(version)
    return data, make_rubric_etag(data)