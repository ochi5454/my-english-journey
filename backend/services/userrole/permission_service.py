# backend/services/userrole/permission_service.py
from uuid import uuid4
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from backend.core.database import UserRoleDB
from backend.models.userrole import Permission
from backend.services.userrole.audit_service import AuditService

# ============================================
# カスタム例外
# ============================================

class PermissionNotFoundException(Exception):
    """権限が見つからない"""
    pass

class PermissionAlreadyExistsException(Exception):
    """権限が既に存在する"""
    pass

class SystemPermissionProtectedException(Exception):
    """システム権限は保護されている"""
    pass

# ============================================
# 権限管理サービス
# ============================================

class PermissionService:
    """
    権限の作成・取得・更新・削除を行うサービス
    """
    
    @staticmethod
    def create_permission(
        name: str,
        display_name: str,
        category: Optional[str] = None,
        description: Optional[str] = None,
        is_system_permission: bool = False,
        created_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        新しい権限を作成
        
        Args:
            name: 権限名（一意）
            display_name: 表示名
            category: カテゴリ
            description: 説明
            is_system_permission: システム権限フラグ
            created_by: 作成者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            Dict: 作成された権限情報
        
        Raises:
            PermissionAlreadyExistsException: 権限名が既に存在する場合
        """
        with UserRoleDB() as db:
            # 重複チェック
            existing = db.query(Permission).filter(Permission.name == name).first()
            if existing:
                raise PermissionAlreadyExistsException(f"権限 '{name}' は既に存在します")
            
            # 権限作成
            permission = Permission(
                id=str(uuid4()),
                name=name,
                display_name=display_name,
                category=category,
                description=description,
                is_system_permission=is_system_permission,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                created_by=created_by
            )
            
            db.add(permission)
            db.commit()
            db.refresh(permission)
            
            # 監査ログ記録
            AuditService.log_action(
                action="create_permission",
                user_id=created_by,
                target_type="permission",
                target_id=permission.id,
                changes={
                    "after": PermissionService._permission_to_dict(permission)
                },
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return PermissionService._permission_to_dict(permission)
    
    @staticmethod
    def get_permission(permission_id: str) -> Dict[str, Any]:
        """
        権限を取得
        
        Args:
            permission_id: 権限ID
        
        Returns:
            Dict: 権限情報
        
        Raises:
            PermissionNotFoundException: 権限が見つからない場合
        """
        with UserRoleDB() as db:
            permission = db.query(Permission).filter(Permission.id == permission_id).first()
            if not permission:
                raise PermissionNotFoundException(f"権限ID '{permission_id}' が見つかりません")
            
            return PermissionService._permission_to_dict(permission)
    
    @staticmethod
    def get_permission_by_name(name: str) -> Optional[Dict[str, Any]]:
        """
        権限名から権限を取得
        
        Args:
            name: 権限名
        
        Returns:
            Dict | None: 権限情報（見つからない場合はNone）
        """
        with UserRoleDB() as db:
            permission = db.query(Permission).filter(Permission.name == name).first()
            if not permission:
                return None
            
            return PermissionService._permission_to_dict(permission)
    
    @staticmethod
    def update_permission(
        permission_id: str,
        display_name: Optional[str] = None,
        category: Optional[str] = None,
        description: Optional[str] = None,
        updated_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        権限を更新
        
        Args:
            permission_id: 権限ID
            display_name: 表示名
            category: カテゴリ
            description: 説明
            updated_by: 更新者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            Dict: 更新された権限情報
        
        Raises:
            PermissionNotFoundException: 権限が見つからない場合
            SystemPermissionProtectedException: システム権限を更新しようとした場合
        """
        with UserRoleDB() as db:
            permission = db.query(Permission).filter(Permission.id == permission_id).first()
            if not permission:
                raise PermissionNotFoundException(f"権限ID '{permission_id}' が見つかりません")
            
            # システム権限のチェック（nameの変更は不可）
            if permission.is_system_permission:
                # 表示名や説明の変更は許可するが、警告
                pass
            
            # 変更前の状態を保存
            before = PermissionService._permission_to_dict(permission)
            
            # 更新
            if display_name is not None:
                permission.display_name = display_name
            if category is not None:
                permission.category = category
            if description is not None:
                permission.description = description
            
            permission.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(permission)
            
            # 変更後の状態
            after = PermissionService._permission_to_dict(permission)
            
            # 監査ログ記録
            AuditService.log_change(
                action="update_permission",
                target_type="permission",
                target_id=permission.id,
                before=before,
                after=after,
                user_id=updated_by,
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return after
    
    @staticmethod
    def delete_permission(
        permission_id: str,
        deleted_by: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        権限を削除
        
        Args:
            permission_id: 権限ID
            deleted_by: 削除者
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
        
        Returns:
            bool: 削除成功ならTrue
        
        Raises:
            PermissionNotFoundException: 権限が見つからない場合
            SystemPermissionProtectedException: システム権限を削除しようとした場合
        """
        with UserRoleDB() as db:
            permission = db.query(Permission).filter(Permission.id == permission_id).first()
            if not permission:
                raise PermissionNotFoundException(f"権限ID '{permission_id}' が見つかりません")
            
            # システム権限の保護
            if permission.is_system_permission:
                raise SystemPermissionProtectedException(
                    f"システム権限 '{permission.name}' は削除できません"
                )
            
            # 削除前の状態を保存
            before = PermissionService._permission_to_dict(permission)
            
            # 削除
            db.delete(permission)
            db.commit()
            
            # 監査ログ記録
            AuditService.log_change(
                action="delete_permission",
                target_type="permission",
                target_id=permission_id,
                before=before,
                after=None,
                user_id=deleted_by,
                ip_address=ip_address,
                user_agent=user_agent,
                db=db
            )
            
            return True
    
    @staticmethod
    def list_permissions(
        category: Optional[str] = None,
        include_system: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        権限一覧を取得
        
        Args:
            category: カテゴリでフィルタ
            include_system: システム権限を含めるか
            limit: 取得件数
            offset: オフセット
        
        Returns:
            List[Dict]: 権限のリスト
        """
        with UserRoleDB() as db:
            query = db.query(Permission)
            
            # フィルタリング
            if category:
                query = query.filter(Permission.category == category)
            if not include_system:
                query = query.filter(Permission.is_system_permission == False)
            
            # 並び順（カテゴリ、名前順）
            query = query.order_by(Permission.category, Permission.name)
            
            # ページネーション
            permissions = query.limit(limit).offset(offset).all()
            
            return [PermissionService._permission_to_dict(p) for p in permissions]
    
    @staticmethod
    def list_permissions_by_category() -> Dict[str, List[Dict[str, Any]]]:
        """
        カテゴリ別に権限を取得
        
        Returns:
            Dict: カテゴリをキーとした権限のリスト
        """
        with UserRoleDB() as db:
            permissions = db.query(Permission).order_by(Permission.category, Permission.name).all()
            
            result = {}
            for p in permissions:
                category = p.category or "その他"
                if category not in result:
                    result[category] = []
                result[category].append(PermissionService._permission_to_dict(p))
            
            return result
    
    @staticmethod
    def get_permission_count(
        category: Optional[str] = None,
        include_system: bool = True
    ) -> int:
        """
        権限の件数を取得
        
        Args:
            category: カテゴリでフィルタ
            include_system: システム権限を含めるか
        
        Returns:
            int: 権限件数
        """
        with UserRoleDB() as db:
            query = db.query(Permission)
            
            if category:
                query = query.filter(Permission.category == category)
            if not include_system:
                query = query.filter(Permission.is_system_permission == False)
            
            return query.count()
    
    @staticmethod
    def _permission_to_dict(permission: Permission) -> Dict[str, Any]:
        """
        Permissionオブジェクトを辞書に変換
        
        Args:
            permission: Permissionオブジェクト
        
        Returns:
            Dict: 権限の辞書表現
        """
        return {
            "id": permission.id,
            "name": permission.name,
            "display_name": permission.display_name,
            "category": permission.category,
            "description": permission.description,
            "is_system_permission": permission.is_system_permission,
            "created_at": permission.created_at.isoformat() if permission.created_at else None,
            "updated_at": permission.updated_at.isoformat() if permission.updated_at else None,
            "created_by": permission.created_by
        }