from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import Request, HTTPException, APIRouter, Query, Body, Depends
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import HTTPException
from fastapi.encoders import jsonable_encoder
from backend.core.database import get_db
from backend.services.score_ofinterviewer.score_rubric import load_rubric_for_http
from backend.services.score_ofinterviewer.cache import load_all_evals, load_evals_for_interviewer, filter_cache_rows_in_memory
from backend.services.score_ofinterviewer.diffcheck import list_diff_targets, refresh_targets_and_upsert

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
    if interviewer_id:
        result = load_evals_for_interviewer(interviewer_id)
        src_rows = result.get("rows") or []
        cached_at = datetime.now().isoformat()
    else:
        result = load_all_evals()
        src_rows = result.get("rows") or []
        cached_at = result.get("generated_at")

    rows = filter_cache_rows_in_memory(
        src_rows, stage=stage, q=q, interviewer_id=interviewer_id, candidate_id=candidate_id, limit=limit
    )
    return JSONResponse(
        content={
            "rows": jsonable_encoder(rows),  # ✅ rowsの中身を変換
            "cached_at": cached_at
        }
    )

@router.post("/interviewer/evals-refresh")
async def interviewer_evals_refresh_ep(
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    print("🚀 /interviewer/evals-refresh called")
    print(f"📦 payload: {payload}")

    targets = payload.get("targets")
    if payload.get("auto"):
        diff = list_diff_targets(
            db=db,  # ← 追加
            stage=payload.get("stage"),
            q=payload.get("q"),
            limit=payload.get("limit")
        )
        print(f"🧮 diff targets: missing={len(diff['missing'])}, stale={len(diff['stale'])}")
        targets = (diff["missing"] + diff["stale"])
    targets = targets or []
    print(f"🎯 final targets count: {len(targets)}")

    model = payload.get("model") or "gpt-4"
    include_reasons = payload.get("includeReasons", True)
    skip_eval = payload.get("skipEval", False)

    # ✅ db を渡すように修正
    rows = refresh_targets_and_upsert(
        targets=targets,
        db=db,
        model=model, 
        include_reasons=include_reasons,
        skip_eval=skip_eval
    )

    return JSONResponse(content={"updated": len(rows), "rows": rows})