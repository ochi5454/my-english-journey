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
    """
    prepItems / reviewedResume / qualitative / quantitative を壊さずマージ。
    incoming が「空/None」の場合は existing を残す。
    """
    existing = existing or {}
    incoming = incoming or {}

    # prepItems（空配列なら保持）
    prep = incoming.get("prepItems")
    if isinstance(prep, list) and len(prep) > 0:
        prepItems = prep
    else:
        prepItems = existing.get("prepItems", [])

    # reviewedResume（bool はそのまま。未指定(None)なら既存）
    if "reviewedResume" in incoming:
        reviewedResume = bool(incoming.get("reviewedResume"))
    else:
        reviewedResume = bool(existing.get("reviewedResume", False))

    # qualitative（シャローに new 優先でマージ。ただし new が None/{} なら既存）
    ql_new = incoming.get("qualitative")
    if isinstance(ql_new, dict) and ql_new:
        qualitative = {**(existing.get("qualitative") or {}), **ql_new}
    else:
        qualitative = existing.get("qualitative", {})

    # quantitative（キーごとに level/comment をマージ）
    qt_new = incoming.get("quantitative")
    if isinstance(qt_new, dict) and qt_new:
        quantitative = merge_quant(existing.get("quantitative") or {}, qt_new)
    else:
        quantitative = existing.get("quantitative", {})

    return {
        "prepItems": prepItems,
        "reviewedResume": reviewedResume,
        "qualitative": qualitative,
        "quantitative": quantitative,
    }