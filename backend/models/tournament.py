from sqlalchemy import Column, Integer, String, Date, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from backend.core.database import Base
from datetime import date


class Tournament(Base):
    __tablename__ = "tournaments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    scale = Column(String, nullable=False, default="small")
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    venue_name = Column(String, nullable=True)
    venue_address = Column(String, nullable=True)
    organizer_contact = Column(String, nullable=True)
    staff_roles = Column(Text, nullable=True)
    created_at = Column(Date, default=date.today)
    tasks = relationship("Task", back_populates="tournament", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="tournament", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="tournament", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    assignee = Column(String, nullable=True)
    due_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="todo")
    priority = Column(String, nullable=True)
    dependency = Column(String, nullable=True)
    generated = Column(Boolean, default=True)
    tournament = relationship("Tournament", back_populates="tasks")


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    doc_type = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    tournament = relationship("Tournament", back_populates="documents")


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(Date, default=date.today)
    tournament = relationship("Tournament", back_populates="alerts")
