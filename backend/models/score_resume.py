from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import JSON
from datetime import datetime
from typing import Dict
from backend.core.database import Base

# ============================================
# ✅ 部門・マストスキル・歓迎スキル
# ============================================

class CandidateExpectations(Base):
    __tablename__ = "candidate_expectations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    division = Column(String, nullable=True)
    trait_type = Column(String, nullable=False)  # 例: "must_requirement" or "desired_trait"
    trait_label = Column(String, nullable=False)
    division_prefix = Column(String, nullable=True)

# ============================================
# ✅ 候補者の評価結果
# ============================================

class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, unique=True)
    name = Column(String)
    gender = Column(String)
    birth_date = Column(String, nullable=True)  # ✅ 追加: YYYY-MM-DD 形式
    notes = Column(String)
    score_notes = Column(Integer)
    work_summary = Column(Text, nullable=True)
    score_work = Column(Integer, nullable=True)
    experience = Column(Integer)
    recommended_div = Column(String)
    preferred_div = Column(String, nullable=True)
    uploader_id = Column(String)
    updated_by = Column(String)
    updated_at = Column(DateTime)
    hr_decision = Column(String)
    hr_division = Column(String)
    hr_title = Column(String)
    hr_income = Column(Integer)
    hr_saved_at = Column(DateTime, nullable=True)
    hr_saved_by = Column(String, nullable=True)
    hr_pay_type = Column(String, nullable=True)
    hr_employment_type = Column(String, nullable=True)

    # ステータス管理
    status = Column(String, nullable=True)  # "アップロード", "書類選考", "web面談", "1次面談", "2次面談", "待遇検討", "内定通知", "内定受諾", "内定辞退", "不合格"
    recommended_division = Column(String, nullable=True)  # AI推奨部門

    # 書類選考関連
    document_review_date = Column(DateTime, nullable=True)
    document_review_reviewer = Column(String, nullable=True)
    document_review_result = Column(String, nullable=True)  # "合格" or "不合格"

class CandidateMustCheckItem(Base):
    __tablename__ = "candidates_must_check_items"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    item_name = Column(String, nullable=False)
    result = Column(Boolean, nullable=False)
    reason = Column(Text)

class CandidateDivisionMustCheckItem(Base):
    __tablename__ = "candidates_division_must_check_items"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    division = Column(String, nullable=False)  # 新たに division を追加
    item_name = Column(String, nullable=False)
    result = Column(Boolean, nullable=False)
    reason = Column(Text)

class CandidateDivisionScore(Base):
    __tablename__ = "candidates_division_scores"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    division = Column(String, nullable=False)
    score = Column(Integer)
    reason = Column(Text)

class CandidateScoreHistory(Base):
    __tablename__ = "candidates_score_histories"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    division = Column(String, nullable=False)
    score = Column(Integer)
    reason = Column(Text)
    reviewer = Column(String)
    reviewed_at = Column(DateTime)
    source = Column(String)  # 例: "interview_review"

class CandidateStatus(Base):
    __tablename__ = "candidates_status"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    stage = Column(String)  # 例: "アップロード", "書類選考", "web面談", "1次面談", "2次面談"
    chat_reviewer = Column(String)
    reviewed_at = Column(DateTime)
    reviewed_resume = Column(Boolean)

# ============================================
# ✅ 推薦度の数式
# ============================================

class AIFormulaConfig(Base):
    __tablename__ = "ai_formula_config"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    formula = Column(Text, nullable=False)
    enabled_fields = Column(JSON, nullable=False)
    weights: Mapped[Dict[str, float]] = mapped_column(JSON)
    division = Column(String, nullable=True) 
    updated_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("key", "division", name="uq_ai_formula_key_division"),
    )

# ============================================
# ✅ ステータスマスター（StatusMaster）
# ============================================
class StatusMaster(Base):
    __tablename__ = "candidate_status_master"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    label = Column(String)
    order = Column(Integer)
    next_key = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    is_skippable = Column(Boolean, default=False) # スキップ可能かどうか
    is_interview = Column(Boolean, default=False) # 面談ステータスかどうか
    is_review_target = Column(Boolean, default=False) # レビュー対象ステータスかどうか
