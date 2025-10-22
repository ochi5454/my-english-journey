from backend.models.checksheet import ChecksheetHiringDecision, EmploymentType, ChecksheetRoleTitle, ChecksheetQualitativeItem, ChecksheetQuantitativeItem
from backend.schemas.qualitative import ChecksheetQualitativeItemOut
from backend.schemas.quantitative import QuantitativeLevelOut, QuantitativeItemOut
from backend.schemas.employment_type import EmploymentTypeOut
from backend.schemas.role import RoleTitleOut
from backend.schemas.hiring_decision import HiringDecisionOut
from backend.core.database import SessionLocal

# ============================================
# 🧠 チェックシート画面の定数読込
# ============================================

def load_hiring_decisions() -> list[dict]:
    """採用可否マスタをDBから取得"""
    with SessionLocal() as db:
        rows = db.query(ChecksheetHiringDecision).order_by(ChecksheetHiringDecision.order.asc()).all()
        return [HiringDecisionOut.from_orm(row).dict() for row in rows]
    
def load_employment_types() -> list[dict]:
    """雇用区分をDBから取得"""
    with SessionLocal() as db:
        rows = db.query(EmploymentType).order_by(EmploymentType.id.asc()).all()
        return [EmploymentTypeOut.from_orm(row).dict() for row in rows]

def load_role_titles() -> list[dict]:
    """タイトル（役職）をDBから取得"""
    with SessionLocal() as db:
        rows = db.query(ChecksheetRoleTitle).order_by(ChecksheetRoleTitle.order.asc()).all()
        return [RoleTitleOut.from_orm(row).dict() for row in rows]

def load_qualitative_items() -> list[dict]:
    """定性評価項目をDBから取得し、order順で返す（is_active=Trueのみ）"""
    with SessionLocal() as db:
        rows = (
            db.query(ChecksheetQualitativeItem)
            .filter(ChecksheetQualitativeItem.is_active == True)
            .order_by(ChecksheetQualitativeItem.order.asc())
            .all()
        )
        # ORM → Pydantic 変換
        return [ChecksheetQualitativeItemOut.from_orm(row).dict() for row in rows]

def load_quantitative_items() -> list[dict]:
    """定量評価項目をDBから取得（levelsとrubricsを含む）"""
    with SessionLocal() as db:
        rows = db.query(ChecksheetQuantitativeItem).all()

        result = []
        for row in rows:
            # levelsを昇順でソート
            levels = sorted(row.levels, key=lambda l: l.value)
            level_models = [QuantitativeLevelOut.from_orm(l).dict() for l in levels]
            rubrics = [r.rubric for r in row.rubrics]

            result.append(
                QuantitativeItemOut(
                    key=row.key,
                    label=row.label,
                    hint=row.hint,
                    comment_placeholder=row.comment_placeholder,
                    levels=level_models,
                    rubrics=rubrics,
                ).dict()
            )

        return result