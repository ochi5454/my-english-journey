# backend/services/userrole/audit_service.py
import json
from uuid import uuid4
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from backend.core.database import UserRoleDB
from backend.models.userrole import AuditLog

# ============================================
# 監査ログサービス
# ============================================

class AuditService:
    """
    監査ログの記録・参照を行うサービス
    """
    
    @staticmethod
    def log_action(
        action: str,
        user_id: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        changes: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        db: Optional[Session] = None
    ) -> AuditLog:
        """
        操作ログを記録
        
        Args:
            action: 操作種別 ('create_user', 'update_role', 'grant_permission' など)
            user_id: 操作実行者のユーザーID
            target_type: 対象のタイプ ('user', 'role', 'permission')
            target_id: 対象のID
            changes: 変更内容（辞書形式）
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
            db: セッション（指定しない場合は自動で作成）
        
        Returns:
            AuditLog: 作成されたログエントリ
        """
        # 変更内容をJSON文字列に変換
        changes_json = json.dumps(changes, ensure_ascii=False) if changes else None
        
        log_entry = AuditLog(
            id=str(uuid4()),
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            changes=changes_json,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=datetime.utcnow()
        )
        
        # DBセッションが渡されていない場合は新規作成
        if db:
            db.add(log_entry)
            db.flush()  # コミットはしない（呼び出し元で管理）
        else:
            with UserRoleDB() as db:
                db.add(log_entry)
                db.commit()
        
        return log_entry
    
    @staticmethod
    def log_change(
        action: str,
        target_type: str,
        target_id: str,
        before: Optional[Dict[str, Any]],
        after: Optional[Dict[str, Any]],
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        db: Optional[Session] = None
    ) -> AuditLog:
        """
        変更前後の情報を含む監査ログを記録
        
        Args:
            action: 操作種別
            target_type: 対象のタイプ
            target_id: 対象のID
            before: 変更前のデータ
            after: 変更後のデータ
            user_id: 操作実行者のユーザーID
            ip_address: IPアドレス
            user_agent: ユーザーエージェント
            db: セッション
        
        Returns:
            AuditLog: 作成されたログエントリ
        """
        # 差分を計算
        changes = {
            "before": before,
            "after": after,
            "diff": AuditService._compute_diff(before, after)
        }
        
        return AuditService.log_action(
            action=action,
            user_id=user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes,
            ip_address=ip_address,
            user_agent=user_agent,
            db=db
        )
    
    @staticmethod
    def _compute_diff(before: Optional[Dict], after: Optional[Dict]) -> Dict[str, Any]:
        """
        変更前後の差分を計算
        
        Args:
            before: 変更前のデータ
            after: 変更後のデータ
        
        Returns:
            Dict: 差分情報
        """
        if not before and not after:
            return {}
        
        if not before:
            return {"added": after}
        
        if not after:
            return {"removed": before}
        
        diff = {}
        all_keys = set(before.keys()) | set(after.keys())
        
        for key in all_keys:
            before_val = before.get(key)
            after_val = after.get(key)
            
            if before_val != after_val:
                diff[key] = {
                    "old": before_val,
                    "new": after_val
                }
        
        return diff
    
    @staticmethod
    def get_logs(
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        監査ログを取得
        
        Args:
            user_id: 操作者でフィルタ
            action: 操作種別でフィルタ
            target_type: 対象タイプでフィルタ
            target_id: 対象IDでフィルタ
            start_date: 開始日時
            end_date: 終了日時
            limit: 取得件数
            offset: オフセット
        
        Returns:
            List[Dict]: ログのリスト
        """
        with UserRoleDB() as db:
            query = db.query(AuditLog)
            
            # フィルタリング
            if user_id:
                query = query.filter(AuditLog.user_id == user_id)
            if action:
                query = query.filter(AuditLog.action == action)
            if target_type:
                query = query.filter(AuditLog.target_type == target_type)
            if target_id:
                query = query.filter(AuditLog.target_id == target_id)
            if start_date:
                query = query.filter(AuditLog.created_at >= start_date)
            if end_date:
                query = query.filter(AuditLog.created_at <= end_date)
            
            # 並び順（新しい順）
            query = query.order_by(AuditLog.created_at.desc())
            
            # ページネーション
            logs = query.limit(limit).offset(offset).all()
            
            # 辞書形式に変換
            return [AuditService._log_to_dict(log) for log in logs]
    
    @staticmethod
    def get_user_actions(
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        特定ユーザーの操作履歴を取得
        
        Args:
            user_id: ユーザーID
            start_date: 開始日時
            end_date: 終了日時
            limit: 取得件数
        
        Returns:
            List[Dict]: 操作履歴
        """
        return AuditService.get_logs(
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit
        )
    
    @staticmethod
    def get_target_history(
        target_type: str,
        target_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        特定対象の変更履歴を取得
        
        Args:
            target_type: 対象タイプ ('user', 'role', 'permission')
            target_id: 対象ID
            limit: 取得件数
        
        Returns:
            List[Dict]: 変更履歴
        """
        return AuditService.get_logs(
            target_type=target_type,
            target_id=target_id,
            limit=limit
        )
    
    @staticmethod
    def _log_to_dict(log: AuditLog) -> Dict[str, Any]:
        """
        AuditLogオブジェクトを辞書に変換
        
        Args:
            log: AuditLogオブジェクト
        
        Returns:
            Dict: ログの辞書表現
        """
        changes = None
        if log.changes:
            try:
                changes = json.loads(log.changes)
            except json.JSONDecodeError:
                changes = log.changes
        
        return {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "changes": changes,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat() if log.created_at else None
        }
    
    @staticmethod
    def get_log_count(
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        target_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> int:
        """
        監査ログの件数を取得
        
        Args:
            user_id: 操作者でフィルタ
            action: 操作種別でフィルタ
            target_type: 対象タイプでフィルタ
            start_date: 開始日時
            end_date: 終了日時
        
        Returns:
            int: ログ件数
        """
        with UserRoleDB() as db:
            query = db.query(AuditLog)
            
            if user_id:
                query = query.filter(AuditLog.user_id == user_id)
            if action:
                query = query.filter(AuditLog.action == action)
            if target_type:
                query = query.filter(AuditLog.target_type == target_type)
            if start_date:
                query = query.filter(AuditLog.created_at >= start_date)
            if end_date:
                query = query.filter(AuditLog.created_at <= end_date)
            
            return query.count()