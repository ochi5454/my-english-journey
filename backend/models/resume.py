from sqlalchemy import Column, String, Integer, Text, ForeignKey
from sqlalchemy.orm import relationship
from backend.core.database import Base

class Resume(Base):
    __tablename__ = 'resumes'

    id = Column(String, primary_key=True)
    name_masked = Column(Text, nullable=True)
    email_masked = Column(Text, nullable=True)
    phone_masked = Column(Text, nullable=True)
    skills = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    education_history = relationship("ResumeEducationHistory", back_populates="resume", cascade="all, delete-orphan")
    work_history = relationship("ResumeWorkHistory", back_populates="resume", cascade="all, delete-orphan")

class ResumeEducationHistory(Base):
    __tablename__ = 'resume_education_history'

    id = Column(Integer, primary_key=True, autoincrement=True)
    resume_id = Column(String, ForeignKey('resumes.id'), nullable=False)
    institution = Column(Text, nullable=True)
    degree = Column(Text, nullable=True)
    start_date = Column(String, nullable=True)  # 日付文字列（例: "2010-04"）
    end_date = Column(String, nullable=True)

    resume = relationship("Resume", back_populates="education_history")

class ResumeWorkHistory(Base):
    __tablename__ = 'resume_work_history'

    id = Column(Integer, primary_key=True, autoincrement=True)
    resume_id = Column(String, ForeignKey('resumes.id'), nullable=False)
    company = Column(Text, nullable=True)
    position = Column(Text, nullable=True)
    start_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    resume = relationship("Resume", back_populates="work_history")