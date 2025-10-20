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

def get_expected_focus_items(department_prefix: str, role: str, db: Session) -> list[dict]:
    rows = db.query(InterviewerRoleFocusItem).filter_by(
        division_prefix=department_prefix.lower().strip(),  # ✅ prefix に変更
        role=role.strip()
    ).all()

    return [
        {"id": row.focus_id, "label": row.focus_label}
        for row in rows
    ]

# ============================================
# 🧠 部門の和名→プレフィックスへ変換
# ============================================

def convert_division_to_prefix(division_name: str) -> str:
    with SessionLocal() as db:
        row = db.query(InterviewerRoleFocusItem)\
                .filter(InterviewerRoleFocusItem.division == division_name)\
                .first()
        return row.division_prefix if row else division_name  # fallback