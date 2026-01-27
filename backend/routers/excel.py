import os
import tempfile
import time
from datetime import date
import io
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from backend.core.config import DATA_DIR
from backend.core.database import get_db
from backend.models.excel import ExcelFile, ExcelCell, ExportCache
from backend.models.dataset import Dataset, DatasetStatus
from backend.services.excel import FILE_DEFINITIONS, fetch_grid_for_key, build_processed_excel
from backend.services.dataset_service import DatasetService
from backend.services.overtime import aggregate_overtime_by_employee, BASE_MINUTES


router = APIRouter(prefix="/excel", tags=["excel"])
dataset_service = DatasetService()


@router.get("/config")
def list_excel_config():
    return FILE_DEFINITIONS


@router.get("/punches/overtime")
def get_punches_overtime(db=Depends(get_db)):
    grid = fetch_grid_for_key(db, "punches")
    if not grid:
        raise HTTPException(status_code=404, detail="punches file not uploaded")
    try:
        aggregates = aggregate_overtime_by_employee(grid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "base_minutes": BASE_MINUTES,
        "rows": aggregates,
    }


@router.get("/export-cache")
def get_export_cache(db=Depends(get_db)):
    latest = db.query(ExportCache).order_by(ExportCache.id.desc()).first()
    return {"payload": latest.payload if latest else None}


@router.post("/export-cache")
def set_export_cache(payload: dict = Body(default={}, embed=False), db=Depends(get_db)):
    if not isinstance(payload, dict) or "rows" not in payload:
        raise HTTPException(status_code=400, detail="payload must include rows")
    cache = ExportCache(payload=payload, created_at=date.today())
    db.add(cache)
    db.commit()
    return {"status": "ok"}


@router.post("/{file_key}/upload")
async def upload_excel(file_key: str, file: UploadFile = File(...), db=Depends(get_db)):
    if file_key not in FILE_DEFINITIONS:
        raise HTTPException(status_code=400, detail="unknown file_key")

    timings = {}
    t0 = time.perf_counter()

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > 200:
        raise HTTPException(status_code=413, detail="file too large (>200MB)")

    dataset = dataset_service.save_upload(io.BytesIO(content), file.filename, file_key, file.content_type, db)
    try:
        dataset = dataset_service.convert_to_parquet(dataset, db)
    except Exception as exc:
        dataset.status = DatasetStatus.failed
        db.add(dataset)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc))

    timings["total_ms"] = round((time.perf_counter() - t0) * 1000)
    print(f"[UPLOAD_TIMING] key={file_key} size_mb={size_mb:.2f} steps={timings}")
    return {
        "file_key": file_key,
        "dataset_id": dataset.id,
        "rows": dataset.row_count,
        "status": dataset.status.value if dataset.status else None,
        "timings_ms": timings,
    }


@router.get("/{file_key}")
def get_excel(file_key: str, db=Depends(get_db)):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=404, detail="not found")
    try:
        df = pd.read_parquet(dataset.stored_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"failed to read dataset: {exc}")

    headers = list(df.columns)
    rows = df.head(500).fillna("").astype(str).values.tolist()
    grid = [headers, *rows]

    formatted = [
        {
          "name": "Sheet1",
          "headers": headers,
          "rows": rows,
          "grid": grid,
        }
    ]

    return {
        "file_key": dataset.kind,
        "file_name": dataset.original_filename,
        "dataset_id": dataset.id,
        "version": 1,
        "sheets": formatted,
        "expected_headers": FILE_DEFINITIONS.get(file_key, {}).get("expected_headers", []),
    }


@router.post("/processed/excel")
def generate_processed_excel(payload: dict = Body(default={} ,embed=False), db=Depends(get_db)):
    target_ym = payload.get("target_ym", "") if isinstance(payload, dict) else ""
    file_key = payload.get("file_key", "person_progress") if isinstance(payload, dict) else "person_progress"

    grid = fetch_grid_for_key(db, file_key)
    if not grid:
        raise HTTPException(status_code=400, detail={"message": f"file not uploaded for key: {file_key}"})

    try:
        stream = build_processed_excel(grid, target_ym)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)})
    stamp = date.today().strftime("%Y%m%d")
    filename = f"{target_ym or '実所定外時間'}_推計データ_{stamp}.xlsx"
    headers = {
        "Content-Disposition": f'attachment; filename=\"{filename}\"'
    }
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
