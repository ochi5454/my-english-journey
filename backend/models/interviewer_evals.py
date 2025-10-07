from sqlalchemy import Column, Integer, String, Float, Date, Text, Boolean, DateTime
from backend.core.database import Base

# ============================================
# ✅ 評価の元となる定義
# ============================================
class InterviewerCriteriaItem(Base):
    __tablename__ = "interviewer_criteria_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(Date, nullable=False)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    weight = Column(Float, nullable=False)
    guidance = Column(String, nullable=False)

class InterviewerRoleFocusItem(Base):
    __tablename__ = "interviewer_role_focus_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    division = Column(String, nullable=False)  # 例: "consultant"
    role = Column(String, nullable=False)      # 例: "C"
    focus_id = Column(String, nullable=False)  # 例: "c_01"
    focus_label = Column(String, nullable=False)  # 例: "論理思考"

# ============================================
# ✅ 評価
# ============================================

class InterviewerEvaluation(Base):
    __tablename__ = "interviewer_evaluations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(String, nullable=False)
    interviewer_id = Column(String, nullable=False)
    stage = Column(String, nullable=False)
    total_score = Column(Float, nullable=False)
    skipped = Column(Boolean, default=False)
    note = Column(Text, default="")
    evaluated_at = Column(DateTime, nullable=False)
    source_sig = Column(String, nullable=False)


class EvaluationRubricScore(Base):
    __tablename__ = "evaluation_rubric_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evaluation_id = Column(Integer, nullable=False)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    note = Column(Text, default="")
    weight = Column(Float, nullable=False)
    guidance = Column(Text, nullable=False)


class EvaluationComment(Base):
    __tablename__ = "evaluation_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evaluation_id = Column(Integer, nullable=False)
    type = Column(String, nullable=False)  # 'reason' or 'suggestion'
    text = Column(Text, nullable=False)


class EvaluationRoleExpectation(Base):
    __tablename__ = "evaluation_role_expectation"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evaluation_id = Column(Integer, nullable=False)
    matched_json = Column(Text, nullable=False)  # JSON文字列
    matched_semantic_json = Column(Text, nullable=False)  # JSON文字列
    missing_json = Column(Text, nullable=False)  # JSON文字列
    violated_json = Column(Text, nullable=False)  # JSON文字列
    score = Column(Float, nullable=False)
    comment = Column(Text, default="")