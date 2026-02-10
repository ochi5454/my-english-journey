"""添付ファイル一時保存モデル"""
from datetime import datetime, timedelta
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.core.database import Base


def default_expires_at():
    """デフォルトの有効期限（24時間後）"""
    return datetime.utcnow() + timedelta(hours=24)


class TempAttachment(Base):
    """添付ファイル一時保存"""
    __tablename__ = "temp_attachments"

    id = Column(String(36), primary_key=True)  # UUID
    session_id = Column(String(36), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    file_path = Column(String(500), nullable=False)
    source = Column(String(50), nullable=True)  # manual / agent
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, default=default_expires_at, nullable=True)

    # リレーション
    user = relationship("User", backref="temp_attachments")
