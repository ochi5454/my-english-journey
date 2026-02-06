from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from backend.core.database import Base


class TokenStore(Base):
    """Entra ID トークンを保存するテーブル（Cookieサイズ制限回避用）"""
    __tablename__ = "token_store"

    id = Column(Integer, primary_key=True, index=True)
    user_sub = Column(String, nullable=False, index=True)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
