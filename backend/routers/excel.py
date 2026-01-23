import os
import tempfile
import time
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from backend.core.config import DATA_DIR
from backend.core.database import get_db
from backend.models.excel import ExcelFile, ExcelCell, ExportCache
from backend.services.excel import (
    FILE_DEFINITIONS,
    parse_csv_to_cells,
    parse_xlsx_to_cells,
    fetch_grid_for_key,
    build_processed_excel,
)


router = APIRouter(prefix="/excel", tags=["excel"])


@router.get("/config")
def list_excel_config():
    return FILE_DEFINITIONS


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

    os.makedirs(DATA_DIR / "uploads", exist_ok=True)
    suffix = os.path.splitext(file.filename)[1].lower()
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > 50:
        raise HTTPException(status_code=413, detail="file too large (>50MB)")
    with tempfile.NamedTemporaryFile(delete=False, dir=DATA_DIR / "uploads", suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    timings["save_temp_ms"] = round((time.perf_counter() - t0) * 1000)

    try:
        t_parse = time.perf_counter()
        if suffix in [".csv"]:
            cells, headers, sheet_name = parse_csv_to_cells(tmp_path)
        elif suffix in [".xlsx", ".xls"]:
            cells, headers, sheet_name = parse_xlsx_to_cells(tmp_path)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
        timings["parse_ms"] = round((time.perf_counter() - t_parse) * 1000)

        latest = (
            db.query(ExcelFile)
            .filter(ExcelFile.file_key == file_key)
            .order_by(ExcelFile.version.desc())
            .first()
        )
        version = (latest.version + 1) if latest else 1

        from datetime import date
        ef = ExcelFile(file_key=file_key, file_name=file.filename, version=version, uploaded_at=date.today())
        db.add(ef)
        db.flush()

        t_insert = time.perf_counter()
        cell_objs = [
            ExcelCell(file_id=ef.id, sheet_name=sheet_name, row_index=r, col_index=c, value=v) for r, c, v in cells
        ]
        db.bulk_save_objects(cell_objs)
        db.commit()
        timings["insert_ms"] = round((time.perf_counter() - t_insert) * 1000)

        timings["total_ms"] = round((time.perf_counter() - t0) * 1000)
        print(f"[UPLOAD_TIMING] key={file_key} size_mb={size_mb:.2f} steps={timings}")
        return {
            "file_key": file_key,
            "version": version,
            "rows": len(set([r for r, _, _ in cells])),
            "cells": len(cells),
            "sheet_name": sheet_name,
            "timings_ms": timings,
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.get("/{file_key}")
def get_excel(file_key: str, db=Depends(get_db)):
    ef = (
        db.query(ExcelFile)
        .filter(ExcelFile.file_key == file_key)
        .order_by(ExcelFile.version.desc())
        .first()
    )
    if not ef:
        raise HTTPException(status_code=404, detail="not found")
    cells = (
        db.query(ExcelCell)
        .filter(ExcelCell.file_id == ef.id)
        .order_by(ExcelCell.sheet_name, ExcelCell.row_index, ExcelCell.col_index)
        .all()
    )
    sheets = {}
    for cell in cells:
        sheets.setdefault(cell.sheet_name, []).append(cell)

    formatted = []
    for sheet_name, sheet_cells in sheets.items():
        max_row = max(c.row_index for c in sheet_cells)
        max_col = max(c.col_index for c in sheet_cells)
        grid = [["" for _ in range(max_col)] for _ in range(max_row)]
        for c in sheet_cells:
            grid[c.row_index - 1][c.col_index - 1] = c.value or ""
        formatted.append(
            {
                "name": sheet_name,
                "headers": grid[0] if grid else [],
                "rows": grid[1:] if len(grid) > 1 else [],
                "grid": grid,
            }
        )

    return {
        "file_key": ef.file_key,
        "file_name": ef.file_name,
        "version": ef.version,
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
