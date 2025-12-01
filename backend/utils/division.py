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

def convert_division_to_prefix(division_name: str | None) -> str | None:
    """
    部門和名 → prefix に変換（「人事部門」などの余計な語尾も処理）
    """
    if not division_name:
        return None

    clean_name = division_name.strip()

    # 「人事部門」→「人事」
    if clean_name.endswith("部門"):
        clean_name = clean_name[:-2]

    with SessionLocal() as db:
        # 完全一致検索（例: 人事 → hr）
        row = db.query(CandidateExpectations)\
                .filter(CandidateExpectations.division == clean_name)\
                .first()

        if row and row.division_prefix:
            return row.division_prefix

        # 部分一致（念のため、"人事部" → "人事" のようなケース）
        row = db.query(CandidateExpectations)\
                .filter(CandidateExpectations.division.like(f"%{clean_name}%"))\
                .first()

        if row and row.division_prefix:
            return row.division_prefix

    # 変換できなかった場合は元の文字列を返す（安全対策）
    return clean_name

# ============================================
# 🧠 プレフィックス→和名の変換
# ============================================

def convert_prefix_to_division(prefix: str) -> str:
    with SessionLocal() as db:
        row = db.query(CandidateExpectations)\
                .filter(CandidateExpectations.division_prefix == prefix)\
                .first()
        return row.division if row and row.division is not None else prefix