"""署名モデル"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.core.database import Base


class Signature(Base):
    """メール署名"""
    __tablename__ = "signatures"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)  # 署名の名前（例：「通常」「社外向け」）
    content = Column(Text, nullable=False)  # 署名本文
    is_default = Column(Boolean, default=False, nullable=False)  # デフォルト署名フラグ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # リレーション
    user = relationship("User", backref="signatures")
