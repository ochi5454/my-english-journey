from sqlalchemy import Column, Integer, String
from backend.core.database import Base

class ResumeTrait(Base):
    __tablename__ = "resume_traits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    division = Column(String, nullable=True)
    trait_type = Column(String, nullable=False)  # 例: "must_requirement" or "desired_trait"
    trait_label = Column(String, nullable=False)