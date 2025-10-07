from sqlalchemy import Column, Integer, String, Float, Date
from backend.core.database import Base

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