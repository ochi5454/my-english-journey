from sqlalchemy import Column, Integer, String, DateTime
from backend.core.database import Base

class InterviewSchedule(Base):
    __tablename__ = "interview_schedule"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(String, nullable=False)
    interview_stage = Column(String, nullable=False)
    scheduled_at = Column(DateTime, nullable=False) 
    last_updated = Column(DateTime, nullable=False)