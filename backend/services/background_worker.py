"""
バックグラウンドワーカー実装

ナレッジリファレンスのベストプラクティスに従う:
1. Phase分割: メモリ処理 → DB読み取り → DB書き込み
2. 進捗報告: 定期的に状態更新（100件ごと等）
3. エラーハンドリング: リトライ可能/不可能を区別
4. リソース管理: DBコネクション、ファイルハンドルの適切なクローズ
"""
import asyncio
from typing import Callable, Any
import logging

from backend.core.jobs import JobStatus
from backend.services.job_manager import InMemoryJobManager

logger = logging.getLogger(__name__)


class BackgroundWorker:
    """
    バックグラウンドタスク実行のベストプラクティス実装
    """

    def __init__(self, job_manager: InMemoryJobManager):
        self.job_manager = job_manager

    async def execute(
        self,
        job_id: str,
        task_func: Callable,
        *args,
        **kwargs
    ):
        """
        標準的なジョブ実行ラッパー

        task_funcの要件:
        - async関数であること
        - 進捗報告用のコールバックを受け取ること
        - 結果をdictで返すこと
        """

        job = await self.job_manager.get(job_id)
        if not job:
            logger.error(f"Job {job_id} not found")
            raise ValueError(f"Job {job_id} not found")

        logger.info(f"Starting job {job_id}")

        try:
            # 進捗報告コールバック
            async def report_progress(processed: int, total: int = None):
                await self.job_manager.update_progress(job_id, processed, total)
                logger.debug(f"Job {job_id}: {processed}/{total or '?'}")

            # タスク実行
            result = await task_func(
                *args,
                progress_callback=report_progress,
                **kwargs
            )

            # 完了
            await self.job_manager.complete(job_id, result)
            logger.info(f"Job {job_id} completed successfully")

        except Exception as e:
            # 失敗
            error_msg = str(e)
            await self.job_manager.fail(job_id, error_msg)
            logger.error(f"Job {job_id} failed: {error_msg}", exc_info=True)
            raise


# シングルトンインスタンス
_worker_instance: Any = None


def get_background_worker() -> BackgroundWorker:
    """
    バックグラウンドワーカーのシングルトンインスタンスを取得

    FastAPI の依存性注入で使用
    """
    global _worker_instance
    if _worker_instance is None:
        from backend.services.job_manager import get_job_manager
        _worker_instance = BackgroundWorker(get_job_manager())
    return _worker_instance
