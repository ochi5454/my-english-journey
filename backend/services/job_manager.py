"""
ジョブマネージャー実装

3つのパターンを提供：
1. InMemoryJobManager - 開発/小規模向け（プロトタイプ）
2. RedisJobManager - 本番推奨（将来実装）
3. DatabaseJobManager - 完全な監査証跡（将来実装）
"""
import asyncio
from typing import Dict, Optional, Any
from datetime import datetime

from backend.core.jobs import JobState, JobStatus


class InMemoryJobManager:
    """
    インメモリジョブマネージャー

    特徴:
    - 実装が最もシンプル
    - 依存なし（外部サービス不要）
    - サーバー再起動で消失
    - 単一インスタンスのみ

    適用:
    - プロトタイプ
    - 小規模アプリ（同時ユーザー<100）
    - ジョブ消失が許容される場合
    """

    def __init__(self):
        self._jobs: Dict[str, JobState] = {}
        self._lock = asyncio.Lock()

    async def create(self, job_id: str) -> JobState:
        """新しいジョブを作成"""
        async with self._lock:
            job = JobState(
                job_id=job_id,
                status=JobStatus.PENDING,
                created_at=datetime.utcnow()
            )
            self._jobs[job_id] = job
            return job

    async def get(self, job_id: str) -> Optional[JobState]:
        """ジョブ状態を取得"""
        return self._jobs.get(job_id)

    async def update_progress(
        self,
        job_id: str,
        processed: int,
        total: int = None
    ):
        """進捗を更新"""
        async with self._lock:
            if job := self._jobs.get(job_id):
                job.processed_items = processed
                if total:
                    job.total_items = total

                # PENDINGからPROCESSINGに自動遷移
                if job.status == JobStatus.PENDING:
                    job.status = JobStatus.PROCESSING
                    job.started_at = datetime.utcnow()

    async def complete(self, job_id: str, result: Dict[str, Any]):
        """ジョブを完了状態にする"""
        async with self._lock:
            if job := self._jobs.get(job_id):
                job.status = JobStatus.COMPLETED
                job.result = result
                job.completed_at = datetime.utcnow()
                job.processed_items = job.total_items

    async def fail(self, job_id: str, error: str):
        """ジョブを失敗状態にする"""
        async with self._lock:
            if job := self._jobs.get(job_id):
                job.status = JobStatus.FAILED
                job.error = error
                job.completed_at = datetime.utcnow()

    async def cancel(self, job_id: str):
        """ジョブをキャンセルする"""
        async with self._lock:
            if job := self._jobs.get(job_id):
                if job.status in [JobStatus.PENDING, JobStatus.PROCESSING]:
                    job.status = JobStatus.CANCELLED
                    job.completed_at = datetime.utcnow()

    async def list_jobs(
        self,
        status: Optional[JobStatus] = None,
        limit: int = 100
    ) -> list[JobState]:
        """ジョブ一覧を取得"""
        jobs = list(self._jobs.values())

        if status:
            jobs = [j for j in jobs if j.status == status]

        # 作成日時の降順でソート
        jobs.sort(key=lambda j: j.created_at, reverse=True)

        return jobs[:limit]

    async def cleanup_old_jobs(self, hours: int = 24):
        """古いジョブを削除（メモリ解放）"""
        async with self._lock:
            cutoff = datetime.utcnow().timestamp() - (hours * 3600)
            to_delete = [
                job_id for job_id, job in self._jobs.items()
                if job.completed_at and job.completed_at.timestamp() < cutoff
            ]
            for job_id in to_delete:
                del self._jobs[job_id]

            return len(to_delete)


# シングルトンインスタンス（開発用）
_job_manager_instance: Optional[InMemoryJobManager] = None


def get_job_manager() -> InMemoryJobManager:
    """
    ジョブマネージャーのシングルトンインスタンスを取得

    FastAPI の依存性注入で使用
    """
    global _job_manager_instance
    if _job_manager_instance is None:
        _job_manager_instance = InMemoryJobManager()
    return _job_manager_instance
