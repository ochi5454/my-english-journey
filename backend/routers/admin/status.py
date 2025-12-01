from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models.score_resume import StatusMaster

router = APIRouter(
    prefix="/admin/status",
    tags=["admin-status"]
)

# ==========================================================
# 📌 StatusMaster 全件を order 順で返す API
# ==========================================================
@router.get("/master")
def get_status_master(db: Session = Depends(get_db)):
    rows = (
        db.query(StatusMaster)
        .filter(StatusMaster.is_active == True)
        .order_by(StatusMaster.order)
        .all()
    )

    return [
        {
            "key": row.key,
            "label": row.label,
            "order": row.order,
            "next_key": row.next_key,
            "is_skippable": row.is_skippable,
            "is_interview": row.is_interview,
            "is_review_target": row.is_review_target,
            "id": row.id,
        }
        for row in rows
    ]


# ==========================================================
# 📌 個別取得（key）
# ==========================================================
@router.get("/by_key/{key}")
def get_status_by_key(key: str, db: Session = Depends(get_db)):
    row = (
        db.query(StatusMaster)
        .filter(StatusMaster.key == key)
        .filter(StatusMaster.is_active == True)
        .first()
    )
    if not row:
        return None

    return {
        "key": row.key,
        "label": row.label,
        "order": row.order,
        "next_key": row.next_key,
        "is_skippable": row.is_skippable,
        "is_interview": row.is_interview,
        "is_review_target": row.is_review_target,
        "id": row.id,
    }


# ==========================================================
# 📌 個別取得（label）
# ==========================================================
@router.get("/by_label/{label}")
def get_status_by_label(label: str, db: Session = Depends(get_db)):
    row = (
        db.query(StatusMaster)
        .filter(StatusMaster.label == label)
        .filter(StatusMaster.is_active == True)
        .first()
    )
    if not row:
        return None

    return {
        "key": row.key,
        "label": row.label,
        "order": row.order,
        "next_key": row.next_key,
        "is_skippable": row.is_skippable,
        "is_interview": row.is_interview,
        "is_review_target": row.is_review_target,
        "id": row.id,
    }