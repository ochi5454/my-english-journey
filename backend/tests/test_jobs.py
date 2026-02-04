"""
ジョブ管理システムのテスト

ナレッジリファレンスのテスト戦略に従う
"""
import pytest
from backend.core.jobs import JobState, JobStatus
from backend.services.job_manager import InMemoryJobManager


@pytest.mark.asyncio
async def test_job_lifecycle():
    """ジョブのライフサイクルテスト"""

    manager = InMemoryJobManager()
    job_id = "test-123"

    # 作成
    job = await manager.create(job_id)
    assert job.status == JobStatus.PENDING
    assert job.job_id == job_id

    # 進捗更新
    await manager.update_progress(job_id, 50, 100)
    job = await manager.get(job_id)
    assert job.status == JobStatus.PROCESSING
    assert job.progress_percent == 50

    # 完了
    result = {"total": 100, "success": 100}
    await manager.complete(job_id, result)
    job = await manager.get(job_id)
    assert job.status == JobStatus.COMPLETED
    assert job.result == result


@pytest.mark.asyncio
async def test_job_failure():
    """ジョブ失敗のテスト"""

    manager = InMemoryJobManager()
    job_id = "test-456"

    await manager.create(job_id)
    await manager.fail(job_id, "Test error")

    job = await manager.get(job_id)
    assert job.status == JobStatus.FAILED
    assert job.error == "Test error"


@pytest.mark.asyncio
async def test_job_not_found():
    """存在しないジョブの取得"""

    manager = InMemoryJobManager()
    job = await manager.get("nonexistent")

    assert job is None


@pytest.mark.asyncio
async def test_job_list():
    """ジョブ一覧取得のテスト"""

    manager = InMemoryJobManager()

    # 複数ジョブを作成
    await manager.create("job-1")
    await manager.create("job-2")
    await manager.create("job-3")

    # 一覧取得
    jobs = await manager.list_jobs()
    assert len(jobs) == 3

    # ステータスでフィルタリング
    await manager.complete("job-1", {"result": "ok"})
    completed_jobs = await manager.list_jobs(status=JobStatus.COMPLETED)
    assert len(completed_jobs) == 1
    assert completed_jobs[0].job_id == "job-1"


@pytest.mark.asyncio
async def test_job_cancel():
    """ジョブキャンセルのテスト"""

    manager = InMemoryJobManager()
    job_id = "test-cancel"

    await manager.create(job_id)
    await manager.cancel(job_id)

    job = await manager.get(job_id)
    assert job.status == JobStatus.CANCELLED
