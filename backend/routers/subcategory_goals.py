from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime

from database import get_db

router = APIRouter(prefix="/api/subcategory-goals", tags=["subcategory-goals"])


class SubGoalUpdate(BaseModel):
    target_hours: int = Field(..., gt=0)


@router.get("")
def get_subcategory_goals():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM study_subcategory_goals ORDER BY category, subcategory"
        ).fetchall()
        return [dict(r) for r in rows]


@router.put("/{category}/{subcategory}")
def update_subcategory_goal(category: str, subcategory: str, body: SubGoalUpdate):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM study_subcategory_goals WHERE category = ? AND subcategory = ?",
            (category, subcategory),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="サブカテゴリ目標が見つかりません")
        conn.execute(
            "UPDATE study_subcategory_goals SET target_hours = ?, updated_at = ? WHERE category = ? AND subcategory = ?",
            (body.target_hours, datetime.now().isoformat(), category, subcategory),
        )
        updated = conn.execute(
            "SELECT * FROM study_subcategory_goals WHERE category = ? AND subcategory = ?",
            (category, subcategory),
        ).fetchone()
        return dict(updated)
