"""
監査ログ実装

ユーザーアクションの追跡と監査証跡の記録
"""
import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
from sqlalchemy import Column, Integer, String, DateTime, Text, Index
from sqlalchemy.orm import Session

from backend.core.database import Base
from backend.core.logging import get_logger

logger = get_logger(__name__)


class AuditAction(str, Enum):
    """監査対象アクション"""
    # 認証関連
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    SESSION_EXPIRED = "session_expired"

    # ファイル操作
    FILE_UPLOAD = "file_upload"
    FILE_DOWNLOAD = "file_download"
    FILE_DELETE = "file_delete"

    # データ操作
    DATA_EXPORT = "data_export"
    DATA_IMPORT = "data_import"
    DATA_VIEW = "data_view"

    # ジョブ操作
    JOB_CREATE = "job_create"
    JOB_CANCEL = "job_cancel"

    # 管理操作
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    SETTINGS_CHANGE = "settings_change"


class AuditLog(Base):
    """監査ログテーブル"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6対応
    user_agent = Column(String(500), nullable=True)
    resource_type = Column(String(50), nullable=True)  # e.g., "file", "user", "job"
    resource_id = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)  # JSON形式の追加情報
    status = Column(String(20), default="success")  # success, failed, error

    __table_args__ = (
        Index("ix_audit_user_action", "user_id", "action"),
        Index("ix_audit_timestamp_action", "timestamp", "action"),
    )


class AuditLogger:
    """監査ログ記録クラス"""

    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        action: AuditAction,
        user_id: Optional[int] = None,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        status: str = "success"
    ) -> AuditLog:
        """
        監査ログを記録

        Args:
            action: 実行されたアクション
            user_id: ユーザーID
            user_email: ユーザーメールアドレス
            ip_address: クライアントIPアドレス
            user_agent: ユーザーエージェント
            resource_type: リソースタイプ（file, user, job等）
            resource_id: リソースID
            details: 追加情報（JSON化される）
            status: 結果ステータス（success, failed, error）
        """
        audit_log = AuditLog(
            action=action.value,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            user_agent=user_agent,
            resource_type=resource_type,
            resource_id=resource_id,
            details=json.dumps(details, ensure_ascii=False) if details else None,
            status=status
        )

        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(audit_log)

        # 構造化ログにも出力
        logger.info(
            "audit_log",
            action=action.value,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            resource_type=resource_type,
            resource_id=resource_id,
            status=status,
        )

        return audit_log


def get_client_ip(request) -> str:
    """リクエストからクライアントIPを取得"""
    # X-Forwarded-For ヘッダーをチェック（プロキシ経由の場合）
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # 最初のIPが元のクライアントIP
        return forwarded.split(",")[0].strip()

    # X-Real-IP ヘッダーをチェック（nginx等）
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # 直接接続の場合
    if request.client:
        return request.client.host

    return "unknown"


def audit_action(
    db: Session,
    action: AuditAction,
    request=None,
    user=None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    status: str = "success"
) -> AuditLog:
    """
    監査ログを簡易的に記録するヘルパー関数

    Args:
        db: データベースセッション
        action: 実行されたアクション
        request: FastAPI Requestオブジェクト（オプション）
        user: ユーザーオブジェクト（オプション）
        resource_type: リソースタイプ
        resource_id: リソースID
        details: 追加情報
        status: 結果ステータス
    """
    audit_logger = AuditLogger(db)

    ip_address = None
    user_agent = None
    if request:
        ip_address = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")[:500]

    user_id = None
    user_email = None
    if user:
        user_id = getattr(user, "id", None)
        user_email = getattr(user, "email", None)

    return audit_logger.log(
        action=action,
        user_id=user_id,
        user_email=user_email,
        ip_address=ip_address,
        user_agent=user_agent,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        status=status
    )
