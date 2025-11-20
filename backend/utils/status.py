import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from typing import Optional, List

from backend.models.score_resume import Candidate, CandidateStatus, StatusMaster

# JST
JST = timezone(timedelta(hours=9))

# ==========================================================
# 📝 Candidate / CandidateStatus の更新
# ==========================================================
def update_candidate_status(
    db: Session,
    user_id: str,
    new_stage: str,
    reviewer_id: str = "system",
    reviewed_resume: bool = False
) -> str:
    """
    候補者ステータスを更新する共通関数。
    ・CandidateStatus（履歴）を追加
    ・Candidate（現在値）を更新
    ・reviewer や reviewed_resume も記録
    """

    now = datetime.now(JST)

    # --- 1. CandidateStatus（履歴）追加 ---
    status_row = CandidateStatus(
        id=str(uuid.uuid4()),
        user_id=user_id,
        stage=new_stage,
        chat_reviewer=reviewer_id,
        reviewed_at=now,
        reviewed_resume=reviewed_resume
    )
    db.add(status_row)

    # --- 2. Candidate（現在ステータス）更新 ---
    candidate = db.query(Candidate).filter(Candidate.user_id == user_id).first()
    if candidate:
        candidate.status = new_stage
        candidate.updated_at = now
        candidate.updated_by = reviewer_id

    # --- 3. Commit ---
    db.commit()

    return new_stage

# ==========================================================
# 🔄 next_key（英語キー）関連
# ==========================================================
def get_next_stage_key(db: Session, current_key: str) -> Optional[str]:
    """
    現在のステージ key（英語）から、next_key（英語）を取得する軽量関数。
    String のみ返す（StatusMaster 行は返さない）
    """
    row = db.execute(
        "SELECT next_key FROM candidate_status_master WHERE key = :key",
        {"key": current_key},
    ).fetchone()
    if row:
        return row[0]
    return None

def get_next_stage_key_by_label(db: Session, stage_label: str) -> Optional[str]:
    """
    label（日本語）をもとに next_key を取得する軽量関数。
    StatusMaster 行は不要な場面で使用。
    """
    row = (
        db.query(StatusMaster)
        .filter(StatusMaster.label == stage_label)
        .filter(StatusMaster.is_active == True)
        .first()
    )

    if not row:
        print(f"⚠ ステージ label={stage_label} が見つかりません")
        return None

    return row.next_key

# ==========================================================
# 🔄 軽量変換（label ↔ key のみ取得）
# ==========================================================
def get_label_by_key(db: Session, key: str) -> Optional[str]:
    """
    key（英語）→ label（日本語）を取得する軽量関数。
    文字列だけ返したい場面向け。
    """
    row = (
        db.query(StatusMaster)
        .filter(StatusMaster.key == key)
        .first()
    )
    return row.label if row else None

def get_key_by_label(db: Session, label: str) -> str:
    """
    label（日本語）→ key（英語）変換の軽量関数。
    文字列だけ返したい場面向け。
    label が key と一致しているケースも想定し fallback として label を返す。
    """
    row = db.query(StatusMaster).filter(StatusMaster.label == label).first()
    return row.key if row else label

def get_all_status_labels(db: Session) -> List[str]:
    """
    ステータスのラベル一覧（日本語）を order 順で取得する。
    フロント UI のステータス表示などで使用。
    """
    rows = (
        db.query(StatusMaster)
        .filter(StatusMaster.is_active == True)
        .order_by(StatusMaster.order)
        .all()
    )
    return [row.label for row in rows]

# ==========================================================
# 🧱 StatusMaster の行ごと取得（レコードが必要な場面向け）
# ==========================================================
def get_status_by_label(db: Session, label: str) -> Optional[StatusMaster]:
    """
    label（日本語）→ StatusMaster レコード取得。
    ・is_skippable
    ・next_key
    ・order
    ・key
    など複数の値を扱いたい場面で使用。
    """
    return (
        db.query(StatusMaster)
        .filter(StatusMaster.label == label)
        .filter(StatusMaster.is_active == True)
        .first()
    )


def get_status_by_key(db: Session, key: str) -> Optional[StatusMaster]:
    """
    key（英語）→ StatusMaster レコード取得。
    next_key から label へ戻す場面などで使用。
    """
    return (
        db.query(StatusMaster)
        .filter(StatusMaster.key == key)
        .filter(StatusMaster.is_active == True)
        .first()
    )

# ==========================================================
# ⏭ スキップ可否判定（ビジネスルールの DB 化）
# ==========================================================
def is_stage_skippable(db: Session, label: str) -> bool:
    """
    ラベルを受け取り、そのステージがスキップ可能かを DB の is_skippable で判定する
    """
    row = get_status_by_label(db, label)
    if not row:
        print(f"⚠ ステージ label={label} が見つかりません（is_skippable 判定不可）")
        return False
    return bool(row.is_skippable)