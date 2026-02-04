"""
Redisベースのジョブマネージャー

本番環境向けの永続化ジョブ管理:
- サーバー再起動でもジョブ状態を保持
- 複数ワーカーでの分散処理対応
- TTLによる自動クリーンアップ
"""
import json
import logging
from typing import Dict, Optional, Any, List
from datetime import datetime

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    redis = None
    REDIS_AVAILABLE = False

from backend.core.jobs import JobState, JobStatus
from backend.core.config import Settings

logger = logging.getLogger(__name__)


class RedisJobManager:
    """
    Redisジョブマネージャー

    特徴:
    - サーバー再起動でもジョブ状態を保持
    - 複数ワーカーで状態共有
    - TTLによる自動クリーンアップ
    - Pub/Subでリアルタイム更新通知（将来拡張）

    適用:
    - 本番環境
    - 複数ワーカー構成
    - ジョブ永続化が必要な場合
    """

    KEY_PREFIX = "ragtesting:job:"
    LIST_KEY = "ragtesting:jobs"
    DEFAULT_TTL = 86400 * 7  # 7日間

    def __init__(
        self,
        redis_url: str = None,
        ttl: int = None
    ):
        if not REDIS_AVAILABLE:
            raise ImportError(
                "redis package is required. Install with: pip install redis"
            )

        settings = Settings()
        self.redis_url = redis_url or settings.redis_url or "redis://localhost:6379/0"
        self.ttl = ttl or self.DEFAULT_TTL
        self._client: Optional[redis.Redis] = None

    async def _get_client(self) -> redis.Redis:
        """Redis接続を取得"""
        if self._client is None:
            self._client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
        return self._client

    def _job_key(self, job_id: str) -> str:
        """ジョブのRedisキーを生成"""
        return f"{self.KEY_PREFIX}{job_id}"

    def _serialize_job(self, job: JobState) -> str:
        """JobStateをJSON文字列に変換"""
        return json.dumps({
            "job_id": job.job_id,
            "status": job.status.value,
            "processed_items": job.processed_items,
            "total_items": job.total_items,
            "result": job.result,
            "error": job.error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        })

    def _deserialize_job(self, data: str) -> Optional[JobState]:
        """JSON文字列からJobStateを復元"""
        try:
            d = json.loads(data)
            return JobState(
                job_id=d["job_id"],
                status=JobStatus(d["status"]),
                processed_items=d.get("processed_items", 0),
                total_items=d.get("total_items"),
                result=d.get("result"),
                error=d.get("error"),
                created_at=datetime.fromisoformat(d["created_at"]) if d.get("created_at") else None,
                started_at=datetime.fromisoformat(d["started_at"]) if d.get("started_at") else None,
                completed_at=datetime.fromisoformat(d["completed_at"]) if d.get("completed_at") else None,
            )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to deserialize job: {e}")
            return None

    async def create(self, job_id: str) -> JobState:
        """新しいジョブを作成"""
        client = await self._get_client()

        job = JobState(
            job_id=job_id,
            status=JobStatus.PENDING,
            created_at=datetime.utcnow()
        )

        # ジョブをRedisに保存
        await client.setex(
            self._job_key(job_id),
            self.ttl,
            self._serialize_job(job)
        )

        # ジョブIDをリストに追加（最新の取得用）
        await client.lpush(self.LIST_KEY, job_id)
        # リストを1000件に制限
        await client.ltrim(self.LIST_KEY, 0, 999)

        logger.info(f"Created job in Redis: {job_id}")
        return job

    async def get(self, job_id: str) -> Optional[JobState]:
        """ジョブ状態を取得"""
        client = await self._get_client()
        data = await client.get(self._job_key(job_id))

        if data is None:
            return None

        return self._deserialize_job(data)

    async def _update_job(self, job: JobState):
        """ジョブを更新（内部用）"""
        client = await self._get_client()
        await client.setex(
            self._job_key(job.job_id),
            self.ttl,
            self._serialize_job(job)
        )

    async def update_progress(
        self,
        job_id: str,
        processed: int,
        total: int = None
    ):
        """進捗を更新"""
        job = await self.get(job_id)
        if job is None:
            return

        job.processed_items = processed
        if total is not None:
            job.total_items = total

        # PENDINGからPROCESSINGに自動遷移
        if job.status == JobStatus.PENDING:
            job.status = JobStatus.PROCESSING
            job.started_at = datetime.utcnow()

        await self._update_job(job)

    async def complete(self, job_id: str, result: Dict[str, Any]):
        """ジョブを完了状態にする"""
        job = await self.get(job_id)
        if job is None:
            return

        job.status = JobStatus.COMPLETED
        job.result = result
        job.completed_at = datetime.utcnow()
        job.processed_items = job.total_items or job.processed_items

        await self._update_job(job)
        logger.info(f"Job completed: {job_id}")

    async def fail(self, job_id: str, error: str):
        """ジョブを失敗状態にする"""
        job = await self.get(job_id)
        if job is None:
            return

        job.status = JobStatus.FAILED
        job.error = error
        job.completed_at = datetime.utcnow()

        await self._update_job(job)
        logger.warning(f"Job failed: {job_id} - {error}")

    async def cancel(self, job_id: str):
        """ジョブをキャンセルする"""
        job = await self.get(job_id)
        if job is None:
            return

        if job.status in [JobStatus.PENDING, JobStatus.PROCESSING]:
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.utcnow()
            await self._update_job(job)
            logger.info(f"Job cancelled: {job_id}")

    async def list_jobs(
        self,
        status: Optional[JobStatus] = None,
        limit: int = 100
    ) -> List[JobState]:
        """ジョブ一覧を取得"""
        client = await self._get_client()

        # リストからジョブIDを取得
        job_ids = await client.lrange(self.LIST_KEY, 0, limit * 2)

        jobs = []
        for job_id in job_ids:
            job = await self.get(job_id)
            if job is None:
                continue

            if status is None or job.status == status:
                jobs.append(job)

            if len(jobs) >= limit:
                break

        return jobs

    async def cleanup_old_jobs(self, hours: int = 24) -> int:
        """古いジョブを削除"""
        client = await self._get_client()
        cutoff = datetime.utcnow().timestamp() - (hours * 3600)

        job_ids = await client.lrange(self.LIST_KEY, 0, -1)
        deleted = 0

        for job_id in job_ids:
            job = await self.get(job_id)
            if job and job.completed_at and job.completed_at.timestamp() < cutoff:
                await client.delete(self._job_key(job_id))
                await client.lrem(self.LIST_KEY, 1, job_id)
                deleted += 1

        logger.info(f"Cleaned up {deleted} old jobs")
        return deleted

    async def close(self):
        """接続をクローズ"""
        if self._client:
            await self._client.close()
            self._client = None


# シングルトンインスタンス
_redis_job_manager: Optional[RedisJobManager] = None


def get_redis_job_manager() -> Optional[RedisJobManager]:
    """
    Redisジョブマネージャーのシングルトンインスタンスを取得

    Redisが利用できない場合はNoneを返す
    """
    global _redis_job_manager

    if not REDIS_AVAILABLE:
        return None

    settings = Settings()
    if not settings.redis_url:
        return None

    if _redis_job_manager is None:
        try:
            _redis_job_manager = RedisJobManager(redis_url=settings.redis_url)
        except Exception as e:
            logger.warning(f"Failed to create RedisJobManager: {e}")
            return None

    return _redis_job_manager


async def get_best_job_manager():
    """
    利用可能な最適なジョブマネージャーを取得

    Redis → InMemory の順で試行
    """
    from backend.services.job_manager import get_job_manager

    redis_manager = get_redis_job_manager()
    if redis_manager:
        try:
            # Redis接続テスト
            client = await redis_manager._get_client()
            await client.ping()
            logger.info("Using RedisJobManager")
            return redis_manager
        except Exception as e:
            logger.warning(f"Redis not available, falling back to InMemory: {e}")

    logger.info("Using InMemoryJobManager")
    return get_job_manager()
