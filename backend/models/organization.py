"""組織・従業員所属情報モデル（部署単位での宛先指定用）"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.core.database import Base


class Organization(Base):
    """
    組織マスタ

    Entra IDのdepartmentフィールドと同期し、組織ツリーを構築する。
    本番環境では tenant_id を追加してマルチテナント対応可能。
    """
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), nullable=True, index=True)  # 部署コード（オプション）
    name = Column(String(255), nullable=False)  # 部署名
    name_en = Column(String(255), nullable=True)  # 英語名（オプション）
    parent_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    level = Column(Integer, default=1)  # 階層レベル (1=本部, 2=部, 3=課...)
    entra_department_name = Column(String(255), nullable=True, index=True)  # Entra IDのdepartmentフィールド値
    member_count = Column(Integer, default=0)  # 所属人数（キャッシュ）
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)  # 表示順
    metadata_json = Column(JSON, default=dict)  # 拡張用メタデータ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # リレーション
    parent = relationship("Organization", remote_side=[id], backref="children")
    employees = relationship("EmployeeAssignment", back_populates="organization")


class EmployeeAssignment(Base):
    """
    従業員所属情報

    Entra IDのユーザー情報と同期し、組織への所属を管理する。
    人事異動は end_date で管理（終了日がNULLなら現在所属）。
    """
    __tablename__ = "employee_assignments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # 内部ユーザーへの紐付け（オプション）
    entra_user_id = Column(String(255), nullable=False, unique=True, index=True)  # Entra ID上のユーザーID
    email = Column(String(255), nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    display_name_kana = Column(String(255), nullable=True)  # ふりがな（日本語環境）
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)
    job_title = Column(String(255), nullable=True)
    employee_number = Column(String(50), nullable=True)  # 社員番号
    is_primary = Column(Boolean, default=True)  # 主所属フラグ
    employment_type = Column(String(50), nullable=True)  # 正社員/契約社員/派遣等
    start_date = Column(Date, default=date.today)  # 所属開始日
    end_date = Column(Date, nullable=True)  # 所属終了日（異動時）
    synced_at = Column(DateTime, nullable=True)  # 最終同期日時
    sync_status = Column(String(20), default="synced")  # synced/pending/error
    sync_error_message = Column(Text, nullable=True)
    metadata_json = Column(JSON, default=dict)  # 拡張用メタデータ
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # リレーション
    user = relationship("User", backref="employee_assignments")
    organization = relationship("Organization", back_populates="employees")


class EntraSyncLog(Base):
    """
    Entra ID同期ログ（監査・デバッグ用）
    """
    __tablename__ = "entra_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    sync_type = Column(String(20), nullable=False)  # full / incremental / manual
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="running")  # running/completed/failed
    users_processed = Column(Integer, default=0)
    users_added = Column(Integer, default=0)
    users_updated = Column(Integer, default=0)
    users_deactivated = Column(Integer, default=0)
    orgs_added = Column(Integer, default=0)
    orgs_updated = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    error_details = Column(JSON, default=list)
    metadata_json = Column(JSON, default=dict)


class EmployeeTransferHistory(Base):
    """
    異動履歴（監査用）
    """
    __tablename__ = "employee_transfer_history"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employee_assignments.id"), nullable=False, index=True)
    from_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    to_organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    transfer_date = Column(Date, nullable=False)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    sync_log_id = Column(Integer, ForeignKey("entra_sync_logs.id"), nullable=True)

    # リレーション
    employee = relationship("EmployeeAssignment", backref="transfer_history")
    from_organization = relationship("Organization", foreign_keys=[from_organization_id])
    to_organization = relationship("Organization", foreign_keys=[to_organization_id])
    sync_log = relationship("EntraSyncLog", backref="transfers")
