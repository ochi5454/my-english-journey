from backend.models.checksheet import ChecksheetHiringDecision, EmploymentType, ChecksheetRoleTitle, ChecksheetQualitativeItem, ChecksheetQuantitativeItem
from backend.core.database import SessionLocal

# ============================================
# 🧠 チェックシート画面の定数読込
# ============================================

def load_hiring_decisions() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(ChecksheetHiringDecision).order_by(ChecksheetHiringDecision.order).all()
        return [
            {
                "id": row.id,
                "value": row.value,
                "label": row.label,
                "order": row.order,
                "description": row.description
            }
            for row in rows
        ]
    
def load_employment_types() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(EmploymentType).order_by(EmploymentType.id).all()
        return [
            {
                "id": row.id,
                "value": row.value,             # 英語コード
                "label": row.label,             # 日本語表示
                "pay_type": row.pay_type,       # 例: "daily_monthly"
                "pay_type_label": row.pay_type_label,  # 例: "日給月給者"
            }
            for row in rows
        ]

def load_role_titles() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(ChecksheetRoleTitle).order_by(ChecksheetRoleTitle.order).all()
        return [
            {
                "id": row.id,
                "value": row.value,
                "label": row.label,
                "order": row.order
            }
            for row in rows
        ]

def load_qualitative_items() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(ChecksheetQualitativeItem).all()
        return [
            {
                "id": row.id,
                "key": row.key,
                "label": row.label,
                "placeholder": row.placeholder
            }
            for row in rows
        ]

def load_quantitative_items() -> list[dict]:
    with SessionLocal() as db:
        rows = db.query(ChecksheetQuantitativeItem).all()

        result = []
        for row in rows:
            # 関連する levels を value の昇順でソート
            levels = sorted(row.levels, key=lambda l: l.value)

            result.append({
                "key": row.key,
                "label": row.label,
                "hint": row.hint,
                "comment_placeholder": row.comment_placeholder,
                "levels": [
                    {
                        "value": level.value,
                        "label": level.label
                    }
                    for level in levels
                ],
                "rubrics": [r.rubric for r in row.rubrics]
            })

        return result