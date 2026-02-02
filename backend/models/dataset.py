import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Enum, JSON
from backend.core.database import Base
import enum


class DatasetStatus(str, enum.Enum):
    pending = "pending"
    ready = "ready"
    failed = "failed"


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kind = Column(String, index=True, nullable=False)
    stored_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    size = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(Enum(DatasetStatus), default=DatasetStatus.pending, nullable=False)
    schema_json = Column(JSON, nullable=True)
    row_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
