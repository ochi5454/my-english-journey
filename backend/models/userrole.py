# backend/models/userrole.py
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
from datetime import datetime
from backend.core.database import UserRoleBase
from backend.utils.encryption import encrypt, decrypt

# ============================================
# ユーザーテーブル
# ============================================

class User(UserRoleBase):
    __tablename__ = "users"
    
    id = Column(String(50), primary_key=True)
    
    # 暗号化フィールド: email
    _email_encrypted = Column("email", String(500), unique=True, nullable=False, index=True)
    
    # 暗号化フィールド: name
    _name_encrypted = Column("name", String(500), nullable=False)
    
    # 暗号化フィールド: entra_id
    _entra_id_encrypted = Column("entra_id", String(500), unique=True, nullable=True)
    
    # 暗号化フィールド: location
    _location_encrypted = Column("location", String(500), nullable=True, index=True)
    
    # 暗号化フィールド: division
    _division_encrypted = Column("division", String(500), nullable=True)
    
    status = Column(String(20), default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(50), nullable=True)
    
    user_roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    permission_overrides = relationship("UserPermissionOverride", back_populates="user", cascade="all, delete-orphan")
    
    # email のプロパティ
    @hybrid_property
    def email(self):
        """メールアドレスを復号化して取得"""
        return decrypt(self._email_encrypted)
    
    @email.setter
    def email(self, value):
        """メールアドレスを暗号化して保存"""
        self._email_encrypted = encrypt(value)
    
    # name のプロパティ
    @hybrid_property
    def name(self):
        """名前を復号化して取得"""
        return decrypt(self._name_encrypted)
    
    @name.setter
    def name(self, value):
        """名前を暗号化して保存"""
        self._name_encrypted = encrypt(value)
    
    # entra_id のプロパティ
    @hybrid_property
    def entra_id(self):
        """Entra IDを復号化して取得"""
        return decrypt(self._entra_id_encrypted)
    
    @entra_id.setter
    def entra_id(self, value):
        """Entra IDを暗号化して保存"""
        self._entra_id_encrypted = encrypt(value) if value else None
    
    # location のプロパティ
    @hybrid_property
    def location(self):
        """所在地を復号化して取得"""
        return decrypt(self._location_encrypted)
    
    @location.setter
    def location(self, value):
        """所在地を暗号化して保存"""
        self._location_encrypted = encrypt(value) if value else None
    
    # division のプロパティ
    @hybrid_property
    def division(self):
        """部署を復号化して取得"""
        return decrypt(self._division_encrypted)
    
    @division.setter
    def division(self, value):
        """部署を暗号化して保存"""
        self._division_encrypted = encrypt(value) if value else None
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, name={self.name})>"

# ============================================
# ロール定義テーブル
# ============================================

class Role(UserRoleBase):
    __tablename__ = "roles"
    
    id = Column(String(50), primary_key=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_system_role = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(50), nullable=True)
    
    user_roles = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")
    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Role(id={self.id}, name={self.name}, display_name={self.display_name})>"

# ============================================
# 権限定義テーブル
# ============================================

class Permission(UserRoleBase):
    __tablename__ = "permissions"
    
    id = Column(String(50), primary_key=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=True, index=True)
    description = Column(Text, nullable=True)
    is_system_permission = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(50), nullable=True)
    
    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")
    user_overrides = relationship("UserPermissionOverride", back_populates="permission", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Permission(id={self.id}, name={self.name}, category={self.category})>"

# ============================================
# ユーザーとロールの紐付け
# ============================================

class UserRole(UserRoleBase):
    __tablename__ = "user_roles"
    
    user_id = Column(String(50), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(String(50), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(50), nullable=True)
    
    user = relationship("User", back_populates="user_roles")
    role = relationship("Role", back_populates="user_roles")
    
    def __repr__(self):
        return f"<UserRole(user_id={self.user_id}, role_id={self.role_id})>"

# ============================================
# ロールと権限の紐付け
# ============================================

class RolePermission(UserRoleBase):
    __tablename__ = "role_permissions"
    
    role_id = Column(String(50), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(String(50), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(50), nullable=True)
    
    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions")
    
    def __repr__(self):
        return f"<RolePermission(role_id={self.role_id}, permission_id={self.permission_id})>"

# ============================================
# ユーザー個別の権限オーバーライド
# ============================================

class UserPermissionOverride(UserRoleBase):
    __tablename__ = "user_permission_overrides"
    
    user_id = Column(String(50), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(String(50), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
    grant_type = Column(String(10), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(50), nullable=True)
    
    # 暗号化フィールド: reason
    _reason_encrypted = Column("reason", Text, nullable=True)
    
    __table_args__ = (
        CheckConstraint("grant_type IN ('grant', 'revoke')", name="check_grant_type"),
    )
    
    user = relationship("User", back_populates="permission_overrides")
    permission = relationship("Permission", back_populates="user_overrides")
    
    # reason のプロパティ
    @hybrid_property
    def reason(self):
        """理由を復号化して取得"""
        return decrypt(self._reason_encrypted)
    
    @reason.setter
    def reason(self, value):
        """理由を暗号化して保存"""
        self._reason_encrypted = encrypt(value) if value else None
    
    def __repr__(self):
        return f"<UserPermissionOverride(user_id={self.user_id}, permission_id={self.permission_id}, grant_type={self.grant_type})>"

# ============================================
# 監査ログ
# ============================================

class AuditLog(UserRoleBase):
    __tablename__ = "audit_logs"
    
    id = Column(String(50), primary_key=True)
    user_id = Column(String(50), nullable=True, index=True)
    action = Column(String(50), nullable=False, index=True)
    target_type = Column(String(50), nullable=True, index=True)
    target_id = Column(String(50), nullable=True, index=True)
    
    # 暗号化フィールド: changes
    _changes_encrypted = Column("changes", Text, nullable=True)
    
    # 暗号化フィールド: ip_address
    _ip_address_encrypted = Column("ip_address", String(500), nullable=True)
    
    # 暗号化フィールド: user_agent
    _user_agent_encrypted = Column("user_agent", Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # changes のプロパティ
    @hybrid_property
    def changes(self):
        """変更内容を復号化して取得"""
        return decrypt(self._changes_encrypted)
    
    @changes.setter
    def changes(self, value):
        """変更内容を暗号化して保存"""
        self._changes_encrypted = encrypt(value) if value else None
    
    # ip_address のプロパティ
    @hybrid_property
    def ip_address(self):
        """IPアドレスを復号化して取得"""
        return decrypt(self._ip_address_encrypted)
    
    @ip_address.setter
    def ip_address(self, value):
        """IPアドレスを暗号化して保存"""
        self._ip_address_encrypted = encrypt(value) if value else None
    
    # user_agent のプロパティ
    @hybrid_property
    def user_agent(self):
        """User-Agentを復号化して取得"""
        return decrypt(self._user_agent_encrypted)
    
    @user_agent.setter
    def user_agent(self, value):
        """User-Agentを暗号化して保存"""
        self._user_agent_encrypted = encrypt(value) if value else None
    
    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action}, user_id={self.user_id})>"