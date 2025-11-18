import traceback
from fastapi import Request, HTTPException, APIRouter, Query
from fastapi.responses import ORJSONResponse
from fastapi.exceptions import HTTPException
from typing import Dict, Any, Mapping
from backend.core.config import INTERVIEWER_META_PATH
from backend.core.database import SessionLocal
from backend.utils.checksheet import load_hiring_decisions, load_employment_types, load_role_titles, load_qualitative_items, load_quantitative_items
from backend.utils.load_json import _load_json, _safe_load_json
from backend.utils.division import load_division_names, get_expected_focus_items, convert_division_to_prefix
from backend.services.checksheet.upsert import upsert_checksheet, get_checksheet_one
from backend.services.checksheet.read_all import _as_non_empty_str, list_all_checksheet_blocks
from backend.services.score_ofinterviewer.tag import load_role_focus_dict, load_all_prepitem_tags_by_role, extract_ids_and_labels

router = APIRouter()

#  ============================================
#  📮 面談シート準備・保存・一覧化
#  ============================================

@router.get("/checksheet/config")
def get_all_interview_settings(request: Request):
    user_id = request.headers.get("x-user-id")
    tags: list[dict] = []

    if user_id:
        meta = _safe_load_json(INTERVIEWER_META_PATH)
        user_meta = meta.get(user_id)
        if isinstance(user_meta, Mapping):
            dept = str(user_meta.get("department_prefix") or "").strip().lower()
            role = str(user_meta.get("role") or "").strip()
            if user_id:
                meta = _safe_load_json(INTERVIEWER_META_PATH)
                user_meta = meta.get(user_id)
                if isinstance(user_meta, Mapping):
                    dept = str(user_meta.get("department") or "").strip().lower()
                    role = str(user_meta.get("role") or "").strip()
                    if dept and role:
                        with SessionLocal() as db:
                            tags = get_expected_focus_items(dept, role, db)

    return {
        "divisions": load_division_names(),
        "quantitativeItems": load_quantitative_items(),
        "qualitativeItems": load_qualitative_items(),
        "hiringDecisions": load_hiring_decisions(),
        "employmentTypes": load_employment_types(),
        "titleOptions": load_role_titles(),
        "focusTags": tags,
    }

@router.get("/checksheet/one", response_class=ORJSONResponse)
def api_get_checksheet_one(
    interviewer_id: str = Query(...),
    candidate_id: str = Query(...),
    stage: str = Query(...)
):
    try:
        with SessionLocal() as db:
            data = get_checksheet_one(db, interviewer_id, candidate_id, stage)
        return ORJSONResponse(content=data or {})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"failed to read checksheet: {e}")

@router.post("/checksheet")
def api_upsert_checksheet(payload: Dict[str, Any]):
    iid = _as_non_empty_str(payload.get("interviewer_id"))
    cid = _as_non_empty_str(payload.get("candidate_id"))
    stage = _as_non_empty_str(payload.get("stage"))

    if not (iid and cid and stage):
        raise HTTPException(status_code=400, detail="interviewer_id, candidate_id, stage は必須です")

    block = {
        "prepItems": payload.get("prepItems") or [],
        "reviewedResume": payload.get("reviewedResume") or False,
        "qualitative": payload.get("qualitative") or {},
        "quantitative": payload.get("quantitative") or {},
        "hiringDecision": payload.get("hiringDecision"),
        "recommendedDivision": payload.get("recommendedDivision"),
        "recommendedTitle": payload.get("recommendedTitle"),
        "payType": payload.get("payType"),
        "employmentType": payload.get("employmentType"),
        "ai_score_reviewed": False,
        "eval_required": False
    }

    with SessionLocal() as db:
        upsert_checksheet(db, iid, cid, stage, block)

        # ステータスを次の段階に進める
        from backend.models import Candidate
        candidate = db.query(Candidate).filter_by(user_id=cid).first()
        if candidate:
            # 面談完了後、次のステータスに進める
            stage_progression = {
                "web面談": "1次面談",
                "1次面談": "2次面談",
                "2次面談": "待遇検討"
            }
            next_stage = stage_progression.get(stage)
            if next_stage:
                candidate.status = next_stage
                db.commit()

    return {"ok": True}

@router.post("/interview/skip")
def skip_interview(payload: Dict[str, Any]):
    """面談省略エンドポイント - 面談をスキップして次のステージに進める"""
    cid = _as_non_empty_str(payload.get("candidate_id"))
    stage = _as_non_empty_str(payload.get("stage"))

    if not (cid and stage):
        raise HTTPException(status_code=400, detail="candidate_id, stage は必須です")

    # 1次面談と2次面談のみスキップ可能
    if stage not in ["1次面談", "2次面談"]:
        raise HTTPException(status_code=400, detail="1次面談または2次面談のみスキップ可能です")

    with SessionLocal() as db:
        from backend.models import Candidate
        candidate = db.query(Candidate).filter_by(user_id=cid).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="候補者が見つかりません")

        # 次のステージに進める
        stage_progression = {
            "1次面談": "2次面談",
            "2次面談": "待遇検討"
        }
        next_stage = stage_progression.get(stage)
        if next_stage:
            candidate.status = next_stage
            db.commit()

    return {"ok": True, "next_stage": next_stage}

@router.get("/checksheet/role-focus-summary")
def get_role_focus_summary():
    with SessionLocal() as db:
        role_focus_dict = load_role_focus_dict(db)
        meta = _load_json(INTERVIEWER_META_PATH)
        usage_counter = load_all_prepitem_tags_by_role(meta, db)

    role_summary = {}
    for role_key, role_data in role_focus_dict.items():
        expected_focus = role_data.get("expected_focus", [])

        # ① 和名とrole_suffixを分離
        dept_name, role_suffix = role_key.split(":", 1)

        # ② prefixに変換する
        dept_prefix = convert_division_to_prefix(dept_name)

        normalized_suffix = role_suffix.lower()
        prefix_key = f"{dept_prefix}:{normalized_suffix}"

        expected_ids, id_to_label = extract_ids_and_labels(expected_focus)

        # ✅ used_tags は "和名:role_suffix" で集計されてるので role_key (原型) で取る
        normalized_key = f"{convert_division_to_prefix(dept_name)}:{role_suffix.lower().replace('+', 'plus')}"
        used_tags = usage_counter.get(normalized_key, {})

        normalized_used_tags = {}
        for tag_id, count in used_tags.items():
            normalized_used_tags[tag_id] = count  # ここはそのままでOK（tag_idはprefix形式でDBに入ってる前提）
            
        missing_ids = [tag_id for tag_id in expected_ids if tag_id not in used_tags]

        # ✅ prefix_key を keyとして返す（DB・保存基準）
        role_summary[prefix_key] = {
            "expected_count": len(expected_ids),
            "missing_tags": [
                { "id": tag_id, "label": id_to_label.get(tag_id, tag_id) }
                for tag_id in missing_ids
            ],
            "used_count": sum(used_tags.values()),
            "used_tags": normalized_used_tags,
            "expected_tags": [
                { "id": tag_id, "label": id_to_label.get(tag_id, tag_id) }
                for tag_id in expected_ids
            ]
        }

    return role_summary

@router.get("/checksheet/meta")
def get_interviewer_meta():
    return _load_json(INTERVIEWER_META_PATH)

@router.get("/checksheet/all")
async def api_get_all_checksheet_blocks():
    try:
        with SessionLocal() as db:
            result_dicts = list_all_checksheet_blocks(db)
        return ORJSONResponse(content=result_dicts)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to load all checksheets: {e}")