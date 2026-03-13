from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime

from database import get_db

router = APIRouter(prefix="/api/goals", tags=["goals"])


class GoalUpdate(BaseModel):
    target_hours: int = Field(..., gt=0)


@router.get("")
def get_goals():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM study_goals ORDER BY category").fetchall()
        return [dict(r) for r in rows]


@router.put("/{category}")
def update_goal(category: str, body: GoalUpdate):
    if category not in ("基礎", "運用"):
        raise HTTPException(status_code=400, detail="カテゴリは '基礎' または '運用' のみ")
    with get_db() as conn:
        conn.execute(
            """UPDATE study_goals SET target_hours = ?, updated_at = ? WHERE category = ?""",
            (body.target_hours, datetime.now().isoformat(), category),
        )
        row = conn.execute("SELECT * FROM study_goals WHERE category = ?", (category,)).fetchone()
        return dict(row)
