import json
from pathlib import Path
from typing import Dict, Any, Mapping, Union
from sqlalchemy.orm import Session
from backend.models.candidate_evals import CandidateExpectations
from backend.models.checksheet import ChecksheetHiringDecision, ChecksheetRoleTitle, ChecksheetQualitativeItem, ChecksheetQuantitativeItem
from backend.models.interviewer_evals import InterviewerRoleFocusItem
from backend.core.database import SessionLocal
from collections import defaultdict

# ============================================
# 🧠 部署の読込
# ============================================

def load_division_profiles() -> list[dict]:
    """
    candidate_expectations テーブルから division ごとの desired_traits を構成したプロファイル一覧を返す。
    """
    with SessionLocal() as db:
        rows = db.query(CandidateExpectations)\
                    .filter(CandidateExpectations.trait_type == "desired_trait")\
                    .filter(CandidateExpectations.division.isnot(None))\
                    .all()
        
        division_map = defaultdict(list)
        for row in rows:
            division = row.division.strip()
            label = row.trait_label.strip()
            if division and label:
                division_map[division].append(label)
        
        # profilesの形式に変換
        profiles = [
            {"division": division, "desired_traits": traits}
            for division, traits in division_map.items()
        ]
        return profiles

def load_division_names() -> list[str]:
    """
    candidate_expectations テーブルからユニークな division 名を取得。
    """
    with SessionLocal() as db:
        divisions = db.query(CandidateExpectations.division)\
                        .distinct()\
                        .filter(CandidateExpectations.division.isnot(None))\
                        .order_by(CandidateExpectations.division)\
                        .all()
        # 結果は list[Tuple[str]] なので、flattenして返す
        return [d[0] for d in divisions]

# ============================================
# 🧠 ファイル読込
# ============================================

def _load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {"error": str(e)}
    
def _safe_load_json(path: Union[str, Path]) -> Dict[str, Any]:
    data: Any = _load_json(path)
    if isinstance(data, Mapping):
        try:
            return {str(k): v for k, v in data.items()}
        except Exception:
            return dict(data)  # type: ignore[arg-type]
    return {}

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

# ============================================
# 🧠 部門ごとのタグ読込
# ============================================

def get_expected_focus_items(department: str, role: str, db: Session) -> list[dict]:
    rows = db.query(InterviewerRoleFocusItem).filter_by(
        division=department.lower().strip(),  # ← division列を使う
        role=role.strip()
    ).all()

    return [
        {"id": row.focus_id, "label": row.focus_label}  # ← カラム名に合わせて修正
        for row in rows
    ]