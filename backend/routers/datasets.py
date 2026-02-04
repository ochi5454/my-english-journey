import io
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models.dataset import Dataset, DatasetStatus
from backend.services.dataset_service import DatasetService


router = APIRouter(prefix="/datasets", tags=["datasets"])
service = DatasetService()


@router.get("")
def list_datasets(kind: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Dataset)
    if kind:
        q = q.filter(Dataset.kind == kind)
    datasets = q.order_by(Dataset.uploaded_at.desc()).all()
    return [
        {
            "id": d.id,
            "kind": d.kind,
            "original_filename": d.original_filename,
            "uploaded_at": d.uploaded_at,
            "status": d.status.value if d.status else None,
            "row_count": d.row_count,
            "schema": d.schema_json,
        }
        for d in datasets
    ]


@router.get("/history/{file_key}")
def get_file_history(
    file_key: str,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    特定ファイルキーのアップロード履歴を取得

    ファイルの過去のアップロード一覧を表示
    """
    datasets = (
        db.query(Dataset)
        .filter(Dataset.kind == file_key)
        .order_by(Dataset.uploaded_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "file_key": file_key,
        "history": [
            {
                "id": d.id,
                "original_filename": d.original_filename,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "status": d.status.value if d.status else None,
                "row_count": d.row_count,
                "size": d.size,
                "content_hash": getattr(d, 'content_hash', None),
            }
            for d in datasets
        ],
        "total": len(datasets),
    }


@router.post("/upload")
async def upload_dataset(kind: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    dataset = service.save_upload(io.BytesIO(content), file.filename, kind, file.content_type, db)
    try:
        dataset = service.convert_to_parquet(dataset, db)
    except Exception as exc:
        dataset.status = DatasetStatus.failed
        db.add(dataset)
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "id": dataset.id,
        "kind": dataset.kind,
        "row_count": dataset.row_count,
        "status": dataset.status.value if dataset.status else None,
    }


def _get_dataset_or_404(dataset_id: str, db: Session) -> Dataset:
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="dataset not found")
    return dataset


@router.post("/{dataset_id}/query")
def query_dataset(dataset_id: str, body: dict = Body(default={}), db: Session = Depends(get_db)):
    dataset = _get_dataset_or_404(dataset_id, db)
    filters = body.get("filters") if isinstance(body, dict) else {}
    page = body.get("page", 1)
    page_size = body.get("pageSize", 25)
    try:
        columns, rows, total = service.query_dataset(dataset, filters or {}, page=page, page_size=page_size)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "columns": columns,
        "rows": rows,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.post("/{dataset_id}/export")
def export_dataset(dataset_id: str, body: dict = Body(default={}), db: Session = Depends(get_db)):
    dataset = _get_dataset_or_404(dataset_id, db)
    filters = body.get("filters") if isinstance(body, dict) else {}
    stream = service.export_dataset(dataset, filters or {})
    filename = f"{dataset.kind}-{dataset.id}.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(stream, media_type="text/csv", headers=headers)


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    dataset = _get_dataset_or_404(dataset_id, db)
    service.delete_dataset(dataset, db)
    return {"status": "deleted"}
