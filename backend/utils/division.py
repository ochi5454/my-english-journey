from sqlalchemy.orm import Session
from collections import defaultdict
from backend.core.database import SessionLocal
from backend.models.score_resume import CandidateExpectations
from backend.models.score_ofinterviewer import InterviewerRoleFocusItem

# ============================================
# 🧠 部門の読込
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