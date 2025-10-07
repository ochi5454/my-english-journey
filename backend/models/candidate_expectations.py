from sqlalchemy import Column, Integer, String
from backend.core.database import Base

class CandidateExpectations(Base):
    __tablename__ = "candidate_expectations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    division = Column(String, nullable=True)
    trait_type = Column(String, nullable=False)  # 例: "must_requirement" or "desired_trait"
    trait_label = Column(String, nullable=False)