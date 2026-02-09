import csv
import io
import json
import logging
import zipfile
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models.dataset import Dataset, DatasetStatus
from backend.services.export_cursor_service import (
    ESTIMATED_COLUMNS,
    OVERTIME_COLUMNS,
    build_estimated_rows,
    build_overtime_detail_rows,
    paginate_rows,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export-cursor"])


def _get_latest_dataset(kind: str, db: Session) -> Optional[Dataset]:
    return (
        db.query(Dataset)
        .filter(Dataset.kind == kind, Dataset.status == DatasetStatus.ready)
        .order_by(Dataset.uploaded_at.desc())
        .first()
    )


def _require_dataset(kind: str, db: Session) -> Dataset:
    ds = _get_latest_dataset(kind, db)
    if not ds:
        raise HTTPException(status_code=404, detail=f"dataset not found for kind={kind}")
    return ds


def _stream_csv(columns: List[str], rows: List[List[str]]) -> io.BytesIO:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    for r in rows:
        writer.writerow([v if v is not None else "" for v in r])
    mem = io.BytesIO(buffer.getvalue().encode("utf-8"))
    mem.seek(0)
    return mem


@router.get("/all")
def export_all(
    format: str = Query("json", pattern="^(json|csv|zip)$"),
    limit: int = Query(200, ge=1, le=5000),
    cursor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    実所定外時間推計データ + 残業時間詳細 をカーソル形式で返す。
    cursor は base64(offset) で統一。limit は両テーブル共通。
    """
    # 1) データセット取得
    # person_progress を先頭に置き、進捗状況を優先的にマッピング
    base_keys = ["person_progress", "schedule_input", "punches", "days_items", "tim_daily", "org_info"]
    datasets = []
    for k in base_keys:
        ds = _get_latest_dataset(k, db)
        if ds:
            datasets.append(ds)
    if not datasets:
        raise HTTPException(status_code=404, detail="no datasets uploaded")

    # 2) テーブル構築
    estimated_rows = build_estimated_rows(datasets)
    # overtime 用に必須の2種だけ取れれば OK
    sched_ds = _require_dataset("schedule_input", db)
    punch_ds = _require_dataset("punches", db)
    org_ds = _get_latest_dataset("org_info", db)
    person_ds = _get_latest_dataset("person_progress", db)
    overtime_rows = build_overtime_detail_rows(sched_ds, punch_ds, org_ds, person_progress=person_ds)

    est_page, est_more, next_cursor_est, start_idx = paginate_rows(estimated_rows, limit, cursor)
    ot_page, ot_more, next_cursor_ot, _ = paginate_rows(overtime_rows, limit, cursor)

    has_more = est_more or ot_more
    # 両方の offset を同じ値で進めるシンプル仕様
    next_cursor = next_cursor_est or next_cursor_ot

    logger.info(
        "[export] page start=%s limit=%s est_rows=%s ot_rows=%s has_more=%s next_cursor=%s",
        start_idx,
        limit,
        len(est_page),
        len(ot_page),
        has_more,
        next_cursor,
    )

    if format == "json":
        payload = {
            "estimated": {"columns": ESTIMATED_COLUMNS, "rows": est_page},
            "overtime_detail": {"columns": OVERTIME_COLUMNS, "rows": ot_page},
            "has_more": has_more,
            "next_cursor": next_cursor,
            "start_offset": start_idx,
        }
        return payload

    if format == "csv":
        # 2ファイル分を text/csv として連結できないので JSON を推奨。
        # ここでは estimated のみ CSV を返却（要件A/B/C のAに対応）
        stream = _stream_csv(ESTIMATED_COLUMNS, est_page)
        headers = {"Content-Disposition": 'attachment; filename="estimated.csv"'}
        return StreamingResponse(stream, media_type="text/csv", headers=headers)

    # zip
    def zip_stream():
        est_buf = _stream_csv(ESTIMATED_COLUMNS, est_page)
        ot_buf = _stream_csv(OVERTIME_COLUMNS, ot_page)
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("estimated.csv", est_buf.getvalue())
            zf.writestr("overtime_detail.csv", ot_buf.getvalue())
        mem.seek(0)
        yield from mem

    headers = {"Content-Disposition": 'attachment; filename="export.zip"'}
    return StreamingResponse(zip_stream(), media_type="application/zip", headers=headers)
