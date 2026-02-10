"""宛先リスト関連モデル"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.core.database import Base


class RecipientList(Base):
    """宛先リスト（ユーザー別）"""
    __tablename__ = "recipient_lists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # リレーション
    user = relationship("User", backref="recipient_lists")
    members = relationship("RecipientListMember", back_populates="list", cascade="all, delete-orphan")


class RecipientListMember(Base):
    """宛先リストのメンバー"""
    __tablename__ = "recipient_list_members"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("recipient_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    department = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)

    # リレーション
    list = relationship("RecipientList", back_populates="members")
