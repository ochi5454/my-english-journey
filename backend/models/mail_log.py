"""メール送信履歴モデル"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.core.database import Base


class MailSendLog(Base):
    """メール送信履歴"""
    __tablename__ = "mail_send_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    to_addresses = Column(JSON, nullable=False)
    cc_addresses = Column(JSON, nullable=True)
    bcc_addresses = Column(JSON, nullable=True)
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    body_type = Column(String(20), default="text", nullable=False)  # text / html
    attachments = Column(JSON, nullable=True)  # 添付ファイル情報
    status = Column(String(20), nullable=False, index=True)  # success / failed
    error_message = Column(Text, nullable=True)
    graph_message_id = Column(String(255), nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # リレーション
    user = relationship("User", backref="mail_send_logs")
