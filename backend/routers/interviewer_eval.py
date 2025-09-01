from fastapi import Request, HTTPException, APIRouter, Query, Body
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import HTTPException
from backend.services.interviewer_eval.rubric_loader import load_rubric_for_http
from backend.services.interviewer_eval.eval_cache import (
    load_evals_cache_for, 
    load_evals_cache_aggregate, 
    filter_cache_rows_in_memory
)
from backend.services.interviewer_eval.interviewer_diff import (
    list_diff_targets, 
    refresh_targets_and_upsert, 
    evaluate_interviewer_single
)

router = APIRouter()

#  ============================================
#  📮 面接官スコアリング
#  ============================================

@router.get("/interviewer/rubric")
def get_interviewer_rubric_ep(request: Request):
    """
    面談者評価ルーブリックを返す。If-None-Match 対応で 304 も返せる。
    """
    try:
        data, etag = load_rubric_for_http()
        inm = request.headers.get("if-none-match")
        if inm and inm.strip('"') == etag:
            return Response(status_code=304, headers={"ETag": f'"{etag}"'})
        return JSONResponse(content=data, headers={"ETag": f'"{etag}"'})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"rubric load error: {e}")

@router.get("/interviewer/evals-cache")
async def interviewer_evals_cache_ep(
    stage: str|None = Query(None),
    q: str|None = Query(None),
    interviewer_id: str|None = Query(None),
    candidate_id: str|None = Query(None),
    limit: int|None = Query(None, ge=1, le=200),
):
    # 面談者指定なら単一ファイル、未指定なら合算
    if interviewer_id:
        cache = load_evals_cache_for(interviewer_id)
        src_rows = cache.get("rows") or []
        cached_at = cache.get("generated_at")
    else:
        cache = load_evals_cache_aggregate()
        src_rows = cache.get("rows") or []
        cached_at = cache.get("generated_at")

    rows = filter_cache_rows_in_memory(
        src_rows, stage=stage, q=q, interviewer_id=interviewer_id, candidate_id=candidate_id, limit=limit
    )
    return JSONResponse(content={"rows": rows, "cached_at": cached_at})

@router.post("/interviewer/evals-refresh")
async def interviewer_evals_refresh_ep(payload: dict = Body(...)):
    """
    body 例:
        { "targets": [{candidate_id,interviewer_id,stage}, ...] }
        または
        { "auto": true, "stage":"面談・1次", "q":"user", "limit":100 }
    """
    targets = payload.get("targets")
    if payload.get("auto"):
        diff = list_diff_targets(stage=payload.get("stage"), q=payload.get("q"), limit=payload.get("limit"))
        targets = (diff["missing"] + diff["stale"])
    targets = targets or []

    model = payload.get("model") or "gpt-4"
    include_reasons = payload.get("includeReasons", True)
    skip_eval = payload.get("skipEval", False)

    rows = refresh_targets_and_upsert(
        targets, 
        model=model, 
        include_reasons=include_reasons,
        skip_eval=skip_eval
    )
    return JSONResponse(content={"updated": len(rows), "rows": rows})

@router.post("/interviewer/evaluate")
async def interviewer_evaluate(payload: dict = Body(...)):
    candidate_id = payload.get("candidate_id")
    interviewer_id = payload.get("interviewer_id")
    stage = payload.get("stage", "面談・1次")
    if not candidate_id or not interviewer_id:
        raise HTTPException(status_code=400, detail="candidate_id と interviewer_id は必須です")

    out = evaluate_interviewer_single(
        candidate_id=candidate_id,
        interviewer_id=interviewer_id,
        stage=stage,
        resume_result=payload.get("resume_result"),
        qa_block=payload.get("interview_prep"),
    )
    return JSONResponse(content=out)

