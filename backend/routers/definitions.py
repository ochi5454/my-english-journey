from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

from database import get_db

router = APIRouter(prefix="/api/definitions", tags=["definitions"])


class DefinitionUpdate(BaseModel):
    content: str


@router.get("")
def get_definitions():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM study_definitions ORDER BY key").fetchall()
        return [dict(r) for r in rows]


@router.put("/{key}")
def update_definition(key: str, body: DefinitionUpdate):
    if key not in ("qualitative", "quantitative"):
        raise HTTPException(status_code=400, detail="keyは 'qualitative' または 'quantitative' のみ")
    with get_db() as conn:
        conn.execute(
            "UPDATE study_definitions SET content = ?, updated_at = ? WHERE key = ?",
            (body.content, datetime.now().isoformat(), key),
        )
        row = conn.execute("SELECT * FROM study_definitions WHERE key = ?", (key,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="定義が見つかりません")
        return dict(row)
