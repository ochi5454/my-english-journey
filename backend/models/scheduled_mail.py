"""予約送信メールモデル"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.core.database import Base


class ScheduledMail(Base):
    """予約送信メール"""
    __tablename__ = "scheduled_mails"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # 予約日時
    scheduled_at = Column(DateTime, nullable=False, index=True)  # UTC
    timezone = Column(String(50), default="Asia/Tokyo")

    # メール内容（MailSendLogと同じ構造）
    to_addresses = Column(JSON, nullable=False)
    cc_addresses = Column(JSON, nullable=True)
    bcc_addresses = Column(JSON, nullable=True)
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    body_type = Column(String(20), default="text", nullable=False)  # text / html
    attachments = Column(JSON, nullable=True)  # [{id, filename, file_path, content_type}]

    # ステータス管理
    # pending: 送信待ち
    # processing: 送信処理中
    # sent: 送信完了
    # failed: 送信失敗
    # cancelled: キャンセル済み
    status = Column(String(20), default="pending", nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)

    # 送信結果
    graph_message_id = Column(String(255), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    mail_log_id = Column(Integer, ForeignKey("mail_send_logs.id"), nullable=True)

    # タイムスタンプ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    cancelled_at = Column(DateTime, nullable=True)

    # リレーション
    user = relationship("User", backref="scheduled_mails")
    mail_log = relationship("MailSendLog", backref="scheduled_mail")
