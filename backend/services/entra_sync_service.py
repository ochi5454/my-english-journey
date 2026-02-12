"""
Entra ID同期サービス

本番環境でEntra IDからユーザー・組織情報を同期するためのサービス。
開発環境ではダミーデータを使用可能。

使用方法:
1. 環境変数を設定:
   - AZURE_TENANT_ID
   - AZURE_CLIENT_ID
   - AZURE_CLIENT_SECRET

2. 同期を実行:
   from backend.services.entra_sync_service import EntraSyncService
   service = EntraSyncService(db)
   await service.run_full_sync()
"""

import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.models.organization import (
    Organization,
    EmployeeAssignment,
    EntraSyncLog,
    EmployeeTransferHistory,
)
from backend.core.config import Settings

logger = logging.getLogger(__name__)
settings = Settings()


class EntraSyncService:
    """
    Entra ID同期サービス

    特徴:
    - ページネーション対応（大規模組織）
    - エラーハンドリング＆リトライ
    - 増分同期サポート（将来）
    - 監査ログ
    """

    def __init__(self, db: Session):
        self.db = db
        self.batch_size = 100
        self.graph_client = None

        # Graph APIクライアントの初期化（本番環境用）
        self._init_graph_client()

    def _init_graph_client(self):
        """
        Microsoft Graph APIクライアントを初期化

        必要な環境変数:
        - AZURE_TENANT_ID
        - AZURE_CLIENT_ID
        - AZURE_CLIENT_SECRET
        """
        azure_tenant_id = getattr(settings, 'azure_tenant_id', None)
        azure_client_id = getattr(settings, 'azure_client_id', None)
        azure_client_secret = getattr(settings, 'azure_client_secret', None)

        if not all([azure_tenant_id, azure_client_id, azure_client_secret]):
            logger.warning(
                "Azure credentials not configured. "
                "Entra ID sync will use manual mode only."
            )
            return

        try:
            # msgraphを使用する場合（本番環境）
            # from azure.identity import ClientSecretCredential
            # from msgraph import GraphServiceClient
            #
            # credential = ClientSecretCredential(
            #     tenant_id=azure_tenant_id,
            #     client_id=azure_client_id,
            #     client_secret=azure_client_secret
            # )
            # self.graph_client = GraphServiceClient(credential)
            logger.info("Graph API client initialization skipped (development mode)")
        except Exception as e:
            logger.error(f"Failed to initialize Graph API client: {e}")

    async def run_full_sync(self) -> Dict[str, int]:
        """
        フル同期を実行

        Returns:
            同期統計情報
        """
        sync_log = self._create_sync_log('full')

        try:
            stats = {
                'users_processed': 0,
                'users_added': 0,
                'users_updated': 0,
                'users_deactivated': 0,
                'orgs_added': 0,
                'orgs_updated': 0,
                'error_count': 0
            }
            errors = []

            if self.graph_client is None:
                # 開発環境: Graph APIが利用できない場合はスキップ
                logger.info("Graph API not available. Skipping Entra ID sync.")
                self._complete_sync_log(sync_log, 'skipped', stats, [])
                return stats

            # 1. Entra IDから全ユーザー取得（ページネーション）
            all_users = await self._fetch_all_users()
            logger.info(f"Fetched {len(all_users)} users from Entra ID")

            # 2. 組織情報の抽出と更新
            departments = self._extract_departments(all_users)
            org_stats = await self._sync_organizations(departments)
            stats['orgs_added'] = org_stats['added']
            stats['orgs_updated'] = org_stats['updated']

            # 3. ユーザー情報の同期
            entra_user_ids = set()
            for user in all_users:
                try:
                    result = await self._sync_user(user, sync_log.id)
                    stats['users_processed'] += 1
                    stats[f"users_{result}"] = stats.get(f"users_{result}", 0) + 1
                    entra_user_ids.add(user['id'])
                except Exception as e:
                    stats['error_count'] += 1
                    errors.append({
                        'user_id': user.get('id'),
                        'email': user.get('mail'),
                        'error': str(e)
                    })
                    logger.error(f"Failed to sync user {user.get('mail')}: {e}")

            # 4. 削除されたユーザーの非アクティブ化
            deactivated = await self._deactivate_removed_users(entra_user_ids)
            stats['users_deactivated'] = deactivated

            # 5. 同期ログ更新
            self._complete_sync_log(sync_log, 'completed', stats, errors)

            logger.info(f"Full sync completed: {stats}")
            return stats

        except Exception as e:
            logger.exception(f"Full sync failed: {e}")
            self._complete_sync_log(sync_log, 'failed', {}, [{'error': str(e)}])
            raise

    def _create_sync_log(self, sync_type: str) -> EntraSyncLog:
        """同期ログを作成"""
        sync_log = EntraSyncLog(
            sync_type=sync_type,
            started_at=datetime.utcnow(),
            status='running'
        )
        self.db.add(sync_log)
        self.db.flush()
        return sync_log

    def _complete_sync_log(
        self,
        sync_log: EntraSyncLog,
        status: str,
        stats: Dict[str, int],
        errors: List[Dict]
    ):
        """同期ログを完了"""
        sync_log.completed_at = datetime.utcnow()
        sync_log.status = status
        sync_log.users_processed = stats.get('users_processed', 0)
        sync_log.users_added = stats.get('users_added', 0)
        sync_log.users_updated = stats.get('users_updated', 0)
        sync_log.users_deactivated = stats.get('users_deactivated', 0)
        sync_log.orgs_added = stats.get('orgs_added', 0)
        sync_log.orgs_updated = stats.get('orgs_updated', 0)
        sync_log.error_count = len(errors)
        sync_log.error_details = errors
        self.db.commit()

    async def _fetch_all_users(self) -> List[Dict[str, Any]]:
        """
        全ユーザーをページネーションで取得

        本番環境では Microsoft Graph API を使用
        """
        # 本番実装例:
        # users = []
        # result = await self.graph_client.users.get(
        #     query_parameters={
        #         '$select': 'id,displayName,mail,department,jobTitle,employeeId,accountEnabled',
        #         '$filter': 'accountEnabled eq true',
        #         '$top': self.batch_size,
        #         '$orderby': 'displayName'
        #     }
        # )
        # users.extend(result.value)
        #
        # while result.odata_next_link:
        #     result = await self.graph_client.users.with_url(result.odata_next_link).get()
        #     users.extend(result.value)
        #
        # return users

        return []  # 開発環境ではダミー

    def _extract_departments(self, users: List[Dict]) -> Dict[str, int]:
        """ユーザーリストから部署名を抽出（重複排除、人数カウント）"""
        departments = {}
        for user in users:
            dept = user.get('department')
            if dept:
                departments[dept] = departments.get(dept, 0) + 1
        return departments

    async def _sync_organizations(self, departments: Dict[str, int]) -> Dict[str, int]:
        """組織マスタを同期"""
        stats = {'added': 0, 'updated': 0}

        for dept_name, member_count in departments.items():
            org = self.db.query(Organization).filter(
                Organization.entra_department_name == dept_name
            ).first()

            if org:
                if org.member_count != member_count:
                    org.member_count = member_count
                    org.updated_at = datetime.utcnow()
                    stats['updated'] += 1
            else:
                # 新規部署を作成
                new_org = Organization(
                    name=dept_name,
                    entra_department_name=dept_name,
                    member_count=member_count,
                    code=self._generate_org_code(dept_name)
                )
                self.db.add(new_org)
                stats['added'] += 1

        self.db.commit()
        return stats

    def _generate_org_code(self, dept_name: str) -> str:
        """部署名からコードを生成"""
        # 簡易的な実装（本番では適切なコード生成ロジックを使用）
        import hashlib
        return hashlib.md5(dept_name.encode()).hexdigest()[:8].upper()

    async def _sync_user(self, entra_user: Dict, sync_log_id: int) -> str:
        """
        単一ユーザーを同期

        Returns: 'added' | 'updated' | 'unchanged'
        """
        existing = self.db.query(EmployeeAssignment).filter(
            EmployeeAssignment.entra_user_id == entra_user['id']
        ).first()

        org = self.db.query(Organization).filter(
            Organization.entra_department_name == entra_user.get('department')
        ).first()

        if existing:
            # 異動検知
            if existing.organization_id != (org.id if org else None):
                self._record_transfer(existing, org, sync_log_id)
                existing.organization_id = org.id if org else None

            # 情報更新
            changed = False
            if existing.display_name != entra_user.get('displayName'):
                existing.display_name = entra_user.get('displayName')
                changed = True
            if existing.email != entra_user.get('mail'):
                existing.email = entra_user.get('mail')
                changed = True
            if existing.job_title != entra_user.get('jobTitle'):
                existing.job_title = entra_user.get('jobTitle')
                changed = True
            if existing.employee_number != entra_user.get('employeeId'):
                existing.employee_number = entra_user.get('employeeId')
                changed = True

            existing.synced_at = datetime.utcnow()
            existing.sync_status = 'synced'

            return 'updated' if changed else 'unchanged'
        else:
            # 新規追加
            new_employee = EmployeeAssignment(
                entra_user_id=entra_user['id'],
                email=entra_user.get('mail'),
                display_name=entra_user.get('displayName'),
                organization_id=org.id if org else None,
                job_title=entra_user.get('jobTitle'),
                employee_number=entra_user.get('employeeId'),
                start_date=date.today(),
                synced_at=datetime.utcnow()
            )
            self.db.add(new_employee)
            return 'added'

    def _record_transfer(
        self,
        employee: EmployeeAssignment,
        new_org: Optional[Organization],
        sync_log_id: int
    ):
        """異動履歴を記録"""
        transfer = EmployeeTransferHistory(
            employee_id=employee.id,
            from_organization_id=employee.organization_id,
            to_organization_id=new_org.id if new_org else None,
            transfer_date=date.today(),
            sync_log_id=sync_log_id
        )
        self.db.add(transfer)
        logger.info(
            f"Transfer detected: {employee.display_name} "
            f"from org_id={employee.organization_id} to org_id={new_org.id if new_org else None}"
        )

    async def _deactivate_removed_users(self, active_entra_ids: set) -> int:
        """Entra IDから削除されたユーザーを非アクティブ化"""
        if not active_entra_ids:
            return 0

        # Entra ID同期されたユーザーで、active_entra_idsに含まれないものを非アクティブ化
        employees = self.db.query(EmployeeAssignment).filter(
            EmployeeAssignment.entra_user_id.not_in(active_entra_ids),
            EmployeeAssignment.entra_user_id.notlike('manual_%'),  # 手動追加は除外
            EmployeeAssignment.end_date == None
        ).all()

        count = 0
        for emp in employees:
            emp.end_date = date.today()
            emp.sync_status = 'deactivated'
            count += 1

        if count > 0:
            self.db.commit()
            logger.info(f"Deactivated {count} employees not found in Entra ID")

        return count


# ========== 手動同期用ユーティリティ ==========

def seed_demo_organizations(db: Session):
    """
    デモ用の組織データをシード

    開発環境でテスト用のデータを投入する
    """
    # 既存データがあれば何もしない
    if db.query(Organization).count() > 0:
        logger.info("Organizations already exist, skipping seed")
        return

    # デモ組織を作成
    demo_orgs = [
        {"name": "本社", "code": "HQ", "level": 1, "parent_id": None},
        {"name": "営業本部", "code": "SALES", "level": 2, "parent_id": 1},
        {"name": "営業1部", "code": "SALES1", "level": 3, "parent_id": 2},
        {"name": "営業2部", "code": "SALES2", "level": 3, "parent_id": 2},
        {"name": "開発本部", "code": "DEV", "level": 2, "parent_id": 1},
        {"name": "開発1部", "code": "DEV1", "level": 3, "parent_id": 5},
        {"name": "開発2部", "code": "DEV2", "level": 3, "parent_id": 5},
        {"name": "管理本部", "code": "ADMIN", "level": 2, "parent_id": 1},
        {"name": "人事部", "code": "HR", "level": 3, "parent_id": 8},
        {"name": "経理部", "code": "FIN", "level": 3, "parent_id": 8},
    ]

    for org_data in demo_orgs:
        org = Organization(
            name=org_data["name"],
            code=org_data["code"],
            level=org_data["level"],
            parent_id=org_data["parent_id"],
            member_count=0
        )
        db.add(org)

    db.commit()
    logger.info(f"Seeded {len(demo_orgs)} demo organizations")


def seed_demo_employees(db: Session):
    """
    デモ用の従業員データをシード
    """
    # 既存データがあれば何もしない
    if db.query(EmployeeAssignment).count() > 0:
        logger.info("Employees already exist, skipping seed")
        return

    # デモ従業員を作成
    demo_employees = [
        {"email": "tanaka@example.com", "display_name": "田中太郎", "org_id": 3, "job_title": "部長"},
        {"email": "yamada@example.com", "display_name": "山田花子", "org_id": 3, "job_title": "課長"},
        {"email": "suzuki@example.com", "display_name": "鈴木一郎", "org_id": 4, "job_title": "主任"},
        {"email": "sato@example.com", "display_name": "佐藤美咲", "org_id": 6, "job_title": "エンジニア"},
        {"email": "ito@example.com", "display_name": "伊藤健太", "org_id": 6, "job_title": "エンジニア"},
        {"email": "watanabe@example.com", "display_name": "渡辺優子", "org_id": 7, "job_title": "エンジニア"},
        {"email": "takahashi@example.com", "display_name": "高橋誠", "org_id": 9, "job_title": "課長"},
        {"email": "kobayashi@example.com", "display_name": "小林あゆみ", "org_id": 10, "job_title": "経理"},
    ]

    for emp_data in demo_employees:
        emp = EmployeeAssignment(
            entra_user_id=f"demo_{emp_data['email']}",
            email=emp_data["email"],
            display_name=emp_data["display_name"],
            organization_id=emp_data["org_id"],
            job_title=emp_data["job_title"],
            sync_status="demo"
        )
        db.add(emp)

    # member_countを更新
    for org in db.query(Organization).all():
        count = db.query(EmployeeAssignment).filter(
            EmployeeAssignment.organization_id == org.id,
            EmployeeAssignment.end_date == None
        ).count()
        org.member_count = count

    db.commit()
    logger.info(f"Seeded {len(demo_employees)} demo employees")
