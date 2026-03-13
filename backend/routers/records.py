from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime

from database import get_db

router = APIRouter(prefix="/api/records", tags=["records"])

VALID_SUBCATEGORIES = {
    "基礎": ["発音", "単語", "文法"],
    "運用": ["スピーキング", "リスニング", "リーディング", "ライティング"],
}


class RecordCreate(BaseModel):
    date: date
    category: str = Field(..., pattern="^(基礎|運用)$")
    subcategory: str
    minutes: int = Field(..., gt=0)
    note: Optional[str] = None


class RecordUpdate(BaseModel):
    date: Optional[date] = None
    category: Optional[str] = Field(None, pattern="^(基礎|運用)$")
    subcategory: Optional[str] = None
    minutes: Optional[int] = Field(None, gt=0)
    note: Optional[str] = None


def _validate_subcategory(category: str, subcategory: str):
    valid = VALID_SUBCATEGORIES.get(category, [])
    if subcategory not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"'{subcategory}' は '{category}' の有効なサブカテゴリではありません。有効: {valid}",
        )


@router.get("")
def list_records(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    with get_db() as conn:
        query = "SELECT * FROM study_records WHERE 1=1"
        params = []
        if date_from:
            query += " AND date >= ?"
            params.append(date_from.isoformat())
        if date_to:
            query += " AND date <= ?"
            params.append(date_to.isoformat())
        query += " ORDER BY date DESC, created_at DESC"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


@router.post("", status_code=201)
def create_record(body: RecordCreate):
    _validate_subcategory(body.category, body.subcategory)
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO study_records (date, category, subcategory, minutes, note)
               VALUES (?, ?, ?, ?, ?)""",
            (body.date.isoformat(), body.category, body.subcategory, body.minutes, body.note),
        )
        row = conn.execute("SELECT * FROM study_records WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@router.put("/{record_id}")
def update_record(record_id: int, body: RecordUpdate):
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM study_records WHERE id = ?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="記録が見つかりません")

        category = body.category or existing["category"]
        subcategory = body.subcategory or existing["subcategory"]
        _validate_subcategory(category, subcategory)

        conn.execute(
            """UPDATE study_records
               SET date = ?, category = ?, subcategory = ?, minutes = ?, note = ?, updated_at = ?
               WHERE id = ?""",
            (
                (body.date or existing["date"]),
                category,
                subcategory,
                (body.minutes or existing["minutes"]),
                (body.note if body.note is not None else existing["note"]),
                datetime.now().isoformat(),
                record_id,
            ),
        )
        row = conn.execute("SELECT * FROM study_records WHERE id = ?", (record_id,)).fetchone()
        return dict(row)


@router.delete("/{record_id}")
def delete_record(record_id: int):
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM study_records WHERE id = ?", (record_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="記録が見つかりません")
        conn.execute("DELETE FROM study_records WHERE id = ?", (record_id,))
        return {"deleted": True}
