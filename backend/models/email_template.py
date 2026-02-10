"""メールテンプレートモデル"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.core.database import Base


class EmailTemplate(Base):
    """ユーザー別メールテンプレート"""
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    variables = Column(JSON, nullable=True)  # 使用可能変数リスト
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # リレーション
    user = relationship("User", backref="email_templates")
