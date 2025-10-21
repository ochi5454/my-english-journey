# ============================================
# 🧠 面談シートのマージ保存
# ============================================

def merge_quant(old: dict, new: dict) -> dict:
    """
    quantitative をマージ。level/comment が new にあれば優先、なければ old を保持。
    """
    old = old or {}
    new = new or {}
    out = dict(old)
    for key, nv in new.items():
        if not isinstance(nv, dict):
            continue
        ov = old.get(key, {}) if isinstance(old.get(key), dict) else {}
        out[key] = {
            "level": nv.get("level", ov.get("level", 0)),
            "comment": nv.get("comment", ov.get("comment", "")),
        }
    return out

def merge_block(existing: dict, incoming: dict) -> dict:
    existing = existing or {}
    incoming = incoming or {}

    # prepItems
    prep = incoming.get("prepItems")
    prepItems = prep if isinstance(prep, list) and len(prep) > 0 else existing.get("prepItems", [])

    # reviewedResume
    reviewedResume = bool(incoming.get("reviewedResume")) if "reviewedResume" in incoming else bool(existing.get("reviewedResume", False))

    # qualitative
    ql_new = incoming.get("qualitative")
    qualitative = {**(existing.get("qualitative") or {}), **ql_new} if isinstance(ql_new, dict) and ql_new else existing.get("qualitative", {})

    # quantitative
    qt_new = incoming.get("quantitative")
    quantitative = merge_quant(existing.get("quantitative") or {}, qt_new) if isinstance(qt_new, dict) and qt_new else existing.get("quantitative", {})

    # ✅ 最終評価3カラム: qualitative 内もフォールバックとして参照
    hiringDecision = (
        incoming.get("hiringDecision")
        or (qualitative.get("hiringDecision") if isinstance(qualitative, dict) else None)
        or existing.get("hiringDecision")
    )
    recommendedDivision = (
        incoming.get("recommendedDivision")
        or (qualitative.get("recommendedDivision") if isinstance(qualitative, dict) else None)
        or existing.get("recommendedDivision")
    )
    recommendedTitle = (
        incoming.get("recommendedTitle")
        or (qualitative.get("recommendedTitle") if isinstance(qualitative, dict) else None)
        or existing.get("recommendedTitle")
    )

    return {
        "prepItems": prepItems,
        "reviewedResume": reviewedResume,
        "qualitative": qualitative,
        "quantitative": quantitative,
        "hiringDecision": hiringDecision,
        "recommendedDivision": recommendedDivision,
        "recommendedTitle": recommendedTitle,
        "payType": incoming.get("payType") or existing.get("payType"),
        "employmentType": incoming.get("employmentType") or existing.get("employmentType"),
        "ai_score_reviewed": incoming.get("ai_score_reviewed", existing.get("ai_score_reviewed")),
        "eval_required": incoming.get("eval_required", existing.get("eval_required")),
    }