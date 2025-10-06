from datetime import datetime
from fastapi import Request, HTTPException, APIRouter, Query
from fastapi.responses import ORJSONResponse
from fastapi.exceptions import HTTPException
from typing import Dict, Any, Mapping
from backend.core.config import (
    TEMPLATE_QUANTITATIVE_PATH, 
    TEMPLATE_QUALITATIVE_PATH, 
    TEMPLATE_HIRIING_PATH, 
    TEMPLATE_ROLETITLE_PATH, 
    INTERVIEWER_META_PATH, 
    INTERVIEWER_SKILLS_PATH, 
    INTERVIEWER_CHECKSHEET_PATH,
)
from backend.utils.resume_utils import (
    _safe_load_json, 
    load_division_names, 
    _safe_load_json_list, _load_json
)
from backend.services.interview_review.io import (
    get_checksheet_one_async, 
    get_checksheet_one, 
    upsert_checksheets_block
)
from backend.services.interview_review.merge import merge_block
from backend.services.interview_sheet.reader import (
    _as_non_empty_str, 
    list_checksheet_by_interviewer, 
    list_all_checksheet_blocks
)
from backend.services.interviewer_eval.tag_analysis import (
    load_role_focus_dict, 
    load_all_prepitem_tags_by_role, 
    extract_ids_and_labels
)

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
            dept = str(user_meta.get("department") or "").strip().lower()
            role = str(user_meta.get("role") or "").strip()
            if dept and role:
                path = INTERVIEWER_SKILLS_PATH / f"{dept}.json"
                if path.exists():
                    role_file = _safe_load_json(path)
                    role_data = role_file.get(role)
                    if isinstance(role_data, Mapping):
                        exp = role_data.get("expected_focus", [])
                        if isinstance(exp, list):
                            tags = exp

    return {
        "divisions": load_division_names(),
        "quantitativeItems": _safe_load_json_list(TEMPLATE_QUANTITATIVE_PATH),
        "qualitativeItems": _safe_load_json_list(TEMPLATE_QUALITATIVE_PATH),
        "hiringDecisions": _safe_load_json_list(TEMPLATE_HIRIING_PATH),
        "titleOptions": _safe_load_json_list(TEMPLATE_ROLETITLE_PATH),
        "focusTags": tags,
    }

@router.get("/checksheet/one", response_class=ORJSONResponse)
async def api_get_checksheet_one(
    interviewer_id: str = Query(...),
    candidate_id: str = Query(...),
    stage: str = Query(...)
):
    try:
        data = await get_checksheet_one_async(interviewer_id, candidate_id, stage)  # async 実装に
        return ORJSONResponse(content=data or {})
    except FileNotFoundError:
        return ORJSONResponse(content={})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to read checksheet: {e}")

@router.post("/checksheet")
def api_upsert_checksheet(payload: Dict[str, Any]):
    # 必須キーを取得して非空文字列に正規化
    iid = _as_non_empty_str(payload.get("interviewer_id"))
    cid = _as_non_empty_str(payload.get("candidate_id"))
    stage = _as_non_empty_str(payload.get("stage"))

    if not (iid and cid and stage):
        raise HTTPException(status_code=400, detail="interviewer_id, candidate_id, stage は必須です")

    # 既存ブロックを安全に読み込み
    try:
        existing = get_checksheet_one(iid, cid, stage) or {}
    except Exception:
        existing = {}

    # incoming は dict 前提だが、None の可能性があるのでフォールバック
    incoming = {
        "prepItems": payload.get("prepItems") or [],
        "reviewedResume": payload.get("reviewedResume") or False,
        "qualitative": payload.get("qualitative") or {},
        "quantitative": payload.get("quantitative") or {},
    }

    block = merge_block(existing, incoming)

    # フラグ追加（保存時は未精査・再評価不要）
    block["ai_score_reviewed"] = False
    block["eval_required"] = False
    block["updated_at"] = datetime.now().isoformat()

    ok = upsert_checksheets_block(
        interviewer_id=iid,   # ← str が確定
        candidate_id=cid,     # ← str が確定
        stage=stage,          # ← str が確定
        block=block,
    )
    return {"ok": ok}

@router.get("/checksheet/interviewer/{interviewer_id}")
def api_list_checksheet_by_interviewer(interviewer_id: str):
    return list_checksheet_by_interviewer(interviewer_id)

@router.get("/checksheet/role-focus-summary")
def get_role_focus_summary():
    role_focus_dict = load_role_focus_dict(INTERVIEWER_SKILLS_PATH)
    meta = _load_json(INTERVIEWER_META_PATH)
    usage_counter = load_all_prepitem_tags_by_role(meta, INTERVIEWER_CHECKSHEET_PATH)

    role_summary = {}
    for role_key, role_data in role_focus_dict.items():
        expected_focus = role_data.get("expected_focus", [])
        expected_ids, id_to_label = extract_ids_and_labels(expected_focus)

        used_tags = usage_counter.get(role_key, {})
        missing_ids = [tag_id for tag_id in expected_ids if tag_id not in used_tags]

        role_summary[role_key] = {
            "expected_count": len(expected_ids),
            "missing_tags": [
                { "id": tag_id, "label": id_to_label.get(tag_id, tag_id) }
                for tag_id in missing_ids
            ],
            "used_count": sum(used_tags.values()),
            "used_tags": dict(used_tags),
            "expected_tags": [
                { "id": tag_id, "label": id_to_label.get(tag_id, tag_id) }
                for tag_id in expected_ids
            ]
        }

    return role_summary

@router.get("/checksheet/meta")
def get_interviewer_meta():
    return _load_json(INTERVIEWER_META_PATH)

@router.get("/checksheet/all", response_class=ORJSONResponse)
async def api_get_all_checksheet_blocks():
    try:
        results = list_all_checksheet_blocks()
        return ORJSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to load all checksheets: {e}")
    
