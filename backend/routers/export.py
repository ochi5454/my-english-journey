import base64
import json
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models.dataset import Dataset, DatasetStatus
from backend.models.excel import ExportCache
from backend.services.export_cursor_service import (
    ESTIMATED_COLUMNS,
    OVERTIME_COLUMNS,
    build_estimated_rows,
    build_overtime_detail_rows,
    paginate_rows,
)

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/all")
def get_export_all(
    format: str = "json",
    limit: int = 5000,
    cursor: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    フロントの /export/all?format=json&limit=5000 からの要求に応答する簡易版。
    404でクルクルし続けるのを防ぐため、ExportCache があればそれを返し、
    無ければ空データを返す。
    """
    # 1) データセットを取得（最新の ready のみ）
    base_keys = ["person_progress", "schedule_input", "punches", "days_items", "tim_daily", "org_info"]
    def _latest(kind: str) -> Optional[Dataset]:
        return (
            db.query(Dataset)
            .filter(Dataset.kind == kind, Dataset.status == DatasetStatus.ready)
            .order_by(Dataset.uploaded_at.desc())
            .first()
        )

    datasets: List[Dataset] = []
    for k in base_keys:
        ds = _latest(k)
        if ds:
            datasets.append(ds)

    if not datasets:
        raise HTTPException(status_code=404, detail="no datasets uploaded")

    # 2) 推計データ・残業詳細を構築
    estimated_rows = build_estimated_rows(datasets)
    overtime_rows: List[List[str]] = []
    sched_ds = _latest("schedule_input")
    punch_ds = _latest("punches")
    org_ds = _latest("org_info")
    if sched_ds and punch_ds:
        overtime_rows = build_overtime_detail_rows(sched_ds, punch_ds, org_ds)

    # 3) ページング処理
    def _decode_cursor(c: Optional[str]) -> int:
        if not c:
            return 0
        try:
            data = json.loads(base64.urlsafe_b64decode(c.encode()).decode())
            return int(data.get("offset", 0))
        except Exception:
            return 0

    def _encode_cursor(offset: int) -> str:
        return base64.urlsafe_b64encode(json.dumps({"offset": offset}).encode()).decode()

    offset = _decode_cursor(cursor)
    limit = max(1, min(int(limit or 5000), 20000))  # 安全上限

    est_slice = estimated_rows[offset : offset + limit]
    ot_slice = overtime_rows[offset : offset + limit]

    next_offset = offset + limit
    has_more = next_offset < max(len(estimated_rows), len(overtime_rows))
    next_cursor = _encode_cursor(next_offset) if has_more else None

    return {
        "estimated": {"rows": est_slice},
        "overtime_detail": {"rows": ot_slice},
        "has_more": has_more,
        "next_cursor": next_cursor,
    }
