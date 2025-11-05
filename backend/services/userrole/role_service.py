# backend/services/userrole/role_service.py
from uuid import uuid4
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from backend.core.database import UserRoleDB
from backend.models.userrole import Role, RolePermission, Permission
from backend.services.userrole.audit_service import AuditService
from backend.services.userrole.permission_service import PermissionNotFoundException

# ============================================
# カスタム例外
# ============================================

class RoleNotFoundException(Exception):
    """ロールが見つからない"""
    pass

class RoleAlreadyExistsException(Exception):
    """ロールが既に存在する"""
    pass

class SystemRoleProtectedException(Exception):
    """システムロールは保護されている"""
    pass

# ============================================
# ロール管理サービス
# ============================================

class RoleService:
    """
    ロールの作成・取得・更新・削除、および権限の割り当てを行うサービス
    """
    
    @staticmethod
    def create_role(
        name: str,
        display_name: str,
        description: Optional[str] = None,
        is_system_role: bool = False,
        created_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        新しいロールを作成
        
        Args:
            name: ロール名（一意）
            display_name: 表示名
            description: 説明
            is_system_role: システムロールフラグ
            created_by: 作成者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            Dict: 作成されたロール情報
        
        Raises:
            RoleAlreadyExistsException: ロール名が既に存在する場合
        """
        with UserRoleDB() as db:
            # 重複チェック
            existing = db.query(Role).filter(Role.name == name).first()
            if existing:
                raise RoleAlreadyExistsException(f"ロール '{name}' は既に存在します")
            
            # ロール作成
            role = Role(
                id=str(uuid4()),
                name=name,
                display_name=display_name,
                description=description,
                is_system_role=is_system_role,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                created_by=created_by
            )
            
            db.add(role)
            db.commit()
            db.refresh(role)
            
            # 🔧 Fix: Convert Column to string
            # 監査ログ記録
            AuditService.log_action(
                action="create_role",
                user_id=created_by,
                target_type="role",
                target_id=str(role.id),  # Convert to string
                changes={
                    "after": RoleService._role_to_dict(role)
                },
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return RoleService._role_to_dict(role)
    
    @staticmethod
    def get_role(role_id: str) -> Dict[str, Any]:
        """
        ロールを取得
        
        Args:
            role_id: ロールID
        
        Returns:
            Dict: ロール情報
        
        Raises:
            RoleNotFoundException: ロールが見つからない場合
        """
        with UserRoleDB() as db:
            role = db.query(Role).filter(Role.id == role_id).first()
            if not role:
                raise RoleNotFoundException(f"ロールID '{role_id}' が見つかりません")
            
            return RoleService._role_to_dict(role)
    
    @staticmethod
    def get_role_by_name(name: str) -> Optional[Dict[str, Any]]:
        """
        ロール名からロールを取得
        
        Args:
            name: ロール名
        
        Returns:
            Dict | None: ロール情報（見つからない場合はNone）
        """
        with UserRoleDB() as db:
            role = db.query(Role).filter(Role.name == name).first()
            if not role:
                return None
            
            return RoleService._role_to_dict(role)
    
    @staticmethod
    def update_role(
        role_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        updated_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        ロールを更新
        
        Args:
            role_id: ロールID
            display_name: 表示名
            description: 説明
            updated_by: 更新者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            Dict: 更新されたロール情報
        
        Raises:
            RoleNotFoundException: ロールが見つからない場合
        """
        with UserRoleDB() as db:
            role = db.query(Role).filter(Role.id == role_id).first()
            if not role:
                raise RoleNotFoundException(f"ロールID '{role_id}' が見つかりません")
            
            # 変更前の状態を保存
            before = RoleService._role_to_dict(role)
            
            # 更新
            if display_name is not None:
                role.display_name = display_name
            if description is not None:
                role.description = description
            
            role.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(role)
            
            # 変更後の状態
            after = RoleService._role_to_dict(role)
            
            # 🔧 Fix: Convert Column to string
            # 監査ログ記録
            AuditService.log_change(
                action="update_role",
                target_type="role",
                target_id=str(role.id),  # Convert to string
                before=before,
                after=after,
                user_id=updated_by,
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return after
    
    @staticmethod
    def delete_role(
        role_id: str,
        deleted_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        ロールを削除
        
        Args:
            role_id: ロールID
            deleted_by: 削除者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            bool: 削除成功ならTrue
        
        Raises:
            RoleNotFoundException: ロールが見つからない場合
            SystemRoleProtectedException: システムロールを削除しようとした場合
        """
        with UserRoleDB() as db:
            role = db.query(Role).filter(Role.id == role_id).first()
            if not role:
                raise RoleNotFoundException(f"ロールID '{role_id}' が見つかりません")
            
            # 🔧 Fix: Proper check for system role
            # システムロールの保護
            if role.is_system_role is True:  # Explicit comparison
                raise SystemRoleProtectedException(
                    f"システムロール '{role.name}' は削除できません"
                )
            
            # 削除前の状態を保存
            before = RoleService._role_to_dict(role)
            
            # 削除
            db.delete(role)
            db.commit()
            
            # 監査ログ記録
            AuditService.log_change(
                action="delete_role",
                target_type="role",
                target_id=role_id,
                before=before,
                after=None,
                user_id=deleted_by,
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return True
    
    @staticmethod
    def list_roles(
        include_system: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        ロール一覧を取得
        
        Args:
            include_system: システムロールを含めるか
            limit: 取得件数
            offset: オフセット
        
        Returns:
            List[Dict]: ロールのリスト
        """
        with UserRoleDB() as db:
            query = db.query(Role)
            
            # フィルタリング
            if not include_system:
                query = query.filter(Role.is_system_role == False)
            
            # 並び順（名前順）
            query = query.order_by(Role.name)
            
            # ページネーション
            roles = query.limit(limit).offset(offset).all()
            
            return [RoleService._role_to_dict(r) for r in roles]
    
    @staticmethod
    def assign_permission(
        role_id: str,
        permission_id: str,
        assigned_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        ロールに権限を割り当て
        
        Args:
            role_id: ロールID
            permission_id: 権限ID
            assigned_by: 割り当て実行者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            bool: 割り当て成功ならTrue
        
        Raises:
            RoleNotFoundException: ロールが見つからない場合
            PermissionNotFoundException: 権限が見つからない場合
        """
        with UserRoleDB() as db:
            # ロール存在チェック
            role = db.query(Role).filter(Role.id == role_id).first()
            if not role:
                raise RoleNotFoundException(f"ロールID '{role_id}' が見つかりません")
            
            # 権限存在チェック
            permission = db.query(Permission).filter(Permission.id == permission_id).first()
            if not permission:
                raise PermissionNotFoundException(f"権限ID '{permission_id}' が見つかりません")
            
            # 既に割り当て済みかチェック
            existing = db.query(RolePermission).filter(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission_id
            ).first()
            
            if existing:
                return True  # 既に割り当て済み
            
            # 割り当て
            role_permission = RolePermission(
                role_id=role_id,
                permission_id=permission_id,
                assigned_at=datetime.utcnow(),
                assigned_by=assigned_by
            )
            
            db.add(role_permission)
            db.commit()
            
            # 監査ログ記録
            AuditService.log_action(
                action="assign_permission_to_role",
                user_id=assigned_by,
                target_type="role",
                target_id=role_id,
                changes={
                    "permission_id": permission_id,
                    "permission_name": permission.name
                },
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return True
    
    @staticmethod
    def remove_permission(
        role_id: str,
        permission_id: str,
        removed_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        ロールから権限を削除
        
        Args:
            role_id: ロールID
            permission_id: 権限ID
            removed_by: 削除実行者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            bool: 削除成功ならTrue
        
        Raises:
            RoleNotFoundException: ロールが見つからない場合
        """
        with UserRoleDB() as db:
            # ロール存在チェック
            role = db.query(Role).filter(Role.id == role_id).first()
            if not role:
                raise RoleNotFoundException(f"ロールID '{role_id}' が見つかりません")
            
            # 割り当てを検索
            role_permission = db.query(RolePermission).filter(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission_id
            ).first()
            
            if not role_permission:
                return True  # 既に削除済み
            
            # 権限名を取得（ログ用）
            permission = db.query(Permission).filter(Permission.id == permission_id).first()
            permission_name = permission.name if permission else None
            
            # 削除
            db.delete(role_permission)
            db.commit()
            
            # 監査ログ記録
            AuditService.log_action(
                action="remove_permission_from_role",
                user_id=removed_by,
                target_type="role",
                target_id=role_id,
                changes={
                    "permission_id": permission_id,
                    "permission_name": permission_name
                },
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return True
    
    @staticmethod
    def get_role_permissions(role_id: str) -> List[Dict[str, Any]]:
        """
        ロールが持つ権限の一覧を取得
        
        Args:
            role_id: ロールID
        
        Returns:
            List[Dict]: 権限のリスト
        
        Raises:
            RoleNotFoundException: ロールが見つからない場合
        """
        with UserRoleDB() as db:
            # ロール存在チェック
            role = db.query(Role).filter(Role.id == role_id).first()
            if not role:
                raise RoleNotFoundException(f"ロールID '{role_id}' が見つかりません")
            
            # 権限を取得
            permissions = db.query(Permission).join(
                RolePermission,
                Permission.id == RolePermission.permission_id
            ).filter(
                RolePermission.role_id == role_id
            ).order_by(Permission.category, Permission.name).all()
            
            from backend.services.userrole.permission_service import PermissionService
            return [PermissionService._permission_to_dict(p) for p in permissions]
    
    @staticmethod
    def get_role_count(include_system: bool = True) -> int:
        """
        ロールの件数を取得
        
        Args:
            include_system: システムロールを含めるか
        
        Returns:
            int: ロール件数
        """
        with UserRoleDB() as db:
            query = db.query(Role)
            
            if not include_system:
                query = query.filter(Role.is_system_role == False)
            
            return query.count()
    
    @staticmethod
    def _role_to_dict(role: Role) -> Dict[str, Any]:
        """
        Roleオブジェクトを辞書に変換
        
        Args:
            role: Roleオブジェクト
        
        Returns:
            Dict: ロールの辞書表現
        """
        return {
            "id": role.id,
            "name": role.name,
            "display_name": role.display_name,
            "description": role.description,
            "is_system_role": role.is_system_role,
            # 🔧 Fix: Proper datetime check
            "created_at": role.created_at.isoformat() if role.created_at is not None else None,
            "updated_at": role.updated_at.isoformat() if role.updated_at is not None else None,
            "created_by": role.created_by
        }