from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.core.database import Base

# ============================================
# ✅ 面接官が入力した面談シートのデータ
# ============================================

class ResultByInterview(Base):
    __tablename__ = "results_byinterview"

    id = Column(Integer, primary_key=True)
    candidate_id = Column(String, nullable=False)
    interviewer_id = Column(String, nullable=False)
    stage_name = Column(String, nullable=False)
    reviewed_resume = Column(Boolean)
    hiring_decision = Column(String)
    recommended_division = Column(String)
    recommended_title = Column(String)
    pay_type = Column(String, nullable=True)          # "daily_monthly" or "hourly"
    employment_type = Column(String, nullable=True)   # "fulltime", "contract", ...
    updated_at = Column(DateTime)
    ai_score_reviewed = Column(Boolean, nullable=False, default=False)
    eval_required = Column(Boolean, nullable=False, default=False)

    prep_items = relationship("ResultByInterviewQATag", cascade="all, delete-orphan")
    qualitative_values = relationship( "ResultByInterviewQualitativeValue", cascade="all, delete-orphan")
    quantitative = relationship("ResultByInterviewQuantitative", cascade="all, delete-orphan")

class ResultByInterviewQATag(Base):
    __tablename__ = "results_byinterview_qatags"

    id = Column(Integer, primary_key=True)
    evaluation_id = Column(Integer, ForeignKey("results_byinterview.id", ondelete="CASCADE"))
    question_id = Column(String)
    question = Column(String)
    answer = Column(String)
    tags = Column(String)  # カンマ区切り保存

class ResultByInterviewQualitativeValue(Base):
    __tablename__ = "results_byinterview_qualitative_values"

    id = Column(Integer, primary_key=True)
    evaluation_id = Column(Integer, ForeignKey("results_byinterview.id", ondelete="CASCADE"))
    qualitative_item_id = Column(Integer, ForeignKey("checksheet_qualitativeitems.id"))
    value = Column(Text, nullable=True)

class ResultByInterviewQuantitative(Base):
    __tablename__ = "results_byinterview_quantitative"

    id = Column(Integer, primary_key=True)
    evaluation_id = Column(Integer, ForeignKey("results_byinterview.id", ondelete="CASCADE"))
    item_key = Column(String)
    level = Column(Integer)
    comment = Column(String)