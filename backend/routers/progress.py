from fastapi import APIRouter

from database import get_db

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("")
def get_progress():
    with get_db() as conn:
        # カテゴリ別集計
        category_rows = conn.execute(
            """SELECT category, SUM(minutes) as total_minutes
               FROM study_records GROUP BY category"""
        ).fetchall()

        # サブカテゴリ別集計
        sub_rows = conn.execute(
            """SELECT category, subcategory, SUM(minutes) as total_minutes
               FROM study_records GROUP BY category, subcategory
               ORDER BY category, subcategory"""
        ).fetchall()

        # 目標取得
        goal_rows = conn.execute("SELECT category, target_hours FROM study_goals").fetchall()

        # サブカテゴリ目標取得
        sub_goal_rows = conn.execute(
            "SELECT category, subcategory, target_hours FROM study_subcategory_goals"
        ).fetchall()

        goals = {r["category"]: r["target_hours"] for r in goal_rows}
        sub_goals = {
            (r["category"], r["subcategory"]): r["target_hours"] for r in sub_goal_rows
        }
        category_totals = {r["category"]: r["total_minutes"] for r in category_rows}
        sub_totals = {
            (r["category"], r["subcategory"]): r["total_minutes"] for r in sub_rows
        }

        total_minutes = sum(category_totals.values())
        total_target_hours = sum(goals.values())

        # 全サブカテゴリを含む（記録がなくても表示）
        all_subs = {
            "基礎": ["発音", "単語", "文法"],
            "運用": ["スピーキング", "リスニング", "リーディング", "ライティング"],
        }

        subcategories = []
        for cat, subs in all_subs.items():
            for sub in subs:
                minutes = sub_totals.get((cat, sub), 0)
                target = sub_goals.get((cat, sub), 0)
                subcategories.append({
                    "category": cat,
                    "subcategory": sub,
                    "minutes": minutes,
                    "hours": round(minutes / 60, 1),
                    "target_hours": target,
                })

        return {
            "total": {
                "minutes": total_minutes,
                "hours": round(total_minutes / 60, 1),
                "target_hours": total_target_hours,
            },
            "categories": {
                cat: {
                    "minutes": category_totals.get(cat, 0),
                    "hours": round(category_totals.get(cat, 0) / 60, 1),
                    "target_hours": goals.get(cat, 0),
                }
                for cat in ["基礎", "運用"]
            },
            "subcategories": subcategories,
        }
