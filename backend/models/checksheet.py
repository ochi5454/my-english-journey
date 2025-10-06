from sqlalchemy import Column, Integer, String
from backend.core.database import Base

class ResumeHiringDecision(Base):
    __tablename__ = "resume_hiring_decisions"

    id = Column(String, primary_key=True)  # "no_hire", "hire_ok", etc.
    value = Column(String, nullable=False)  # emoji付き: "🙅‍♂️ 採用すべきでない"
    label = Column(String, nullable=False)  # 表示名: "採用すべきでない"
    order = Column(Integer, nullable=False)  # 並び順
    description = Column(String, nullable=True)  # 説明文

class ResumeQualitativeItem(Base):
    __tablename__ = "resume_qualitativeitems"

    id = Column(String, primary_key=True, index=True)
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    placeholder = Column(String)