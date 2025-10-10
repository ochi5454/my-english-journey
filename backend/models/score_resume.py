from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text
from backend.core.database import Base

# ============================================
# ✅ 評価の元となる定義
# ============================================

class CandidateExpectations(Base):
    __tablename__ = "candidate_expectations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    division = Column(String, nullable=True)
    trait_type = Column(String, nullable=False)  # 例: "must_requirement" or "desired_trait"
    trait_label = Column(String, nullable=False)

# ============================================
# ✅ 評価
# ============================================

class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, unique=True)
    name = Column(String)
    gender = Column(String)
    notes = Column(String)
    score_notes = Column(Integer)
    recommended_div = Column(String)
    uploader_id = Column(String)
    updated_by = Column(String)
    updated_at = Column(DateTime)
    hr_decision = Column(String)
    hr_division = Column(String)
    hr_title = Column(String)
    hr_income = Column(Integer)

class CandidateMustCheckItem(Base):
    __tablename__ = "candidates_must_check_items"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
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
    stage = Column(String)  # 例: "アップロード", "書類選考", "面談・1次"
    chat_reviewer = Column(String)
    reviewed_at = Column(DateTime)
    reviewed_resume = Column(Boolean)