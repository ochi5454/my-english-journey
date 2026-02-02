"""
ジョブ管理APIエンドポイント

非同期処理のジョブステータス確認用
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from backend.core.jobs import JobStatus
from backend.services.job_manager import InMemoryJobManager, get_job_manager

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobResponse(BaseModel):
    """ジョブレスポンススキーマ"""
    job_id: str
    status: str
    progress: dict
    result: Optional[dict] = None
    error: Optional[str] = None


class JobListResponse(BaseModel):
    """ジョブ一覧レスポンススキーマ"""
    jobs: List[JobResponse]
    total: int


@router.get("/{job_id}", response_model=JobResponse)
async def get_job_status(
    job_id: str,
    job_manager: InMemoryJobManager = Depends(get_job_manager)
):
    """
    ジョブ状態取得（ポーリング用）

    クライアントは2-5秒間隔でこのエンドポイントを呼ぶ
    """

    job = await job_manager.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="ジョブが見つかりません")

    return JobResponse(
        job_id=job.job_id,
        status=job.status.value,
        progress={
            "total": job.total_items,
            "processed": job.processed_items,
            "percent": job.progress_percent,
            "duration": job.duration_seconds,
        },
        result=job.result,
        error=job.error
    )


@router.delete("/{job_id}")
async def cancel_job(
    job_id: str,
    job_manager: InMemoryJobManager = Depends(get_job_manager)
):
    """
    ジョブキャンセル

    実装の複雑さ: 高
    - 実行中のタスクを安全に停止する必要がある
    - asyncio.Task.cancel()を適切に扱う
    """

    job = await job_manager.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="ジョブが見つかりません")

    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
        raise HTTPException(
            status_code=400,
            detail="完了済みのジョブはキャンセルできません"
        )

    await job_manager.cancel(job_id)

    return {"message": "キャンセルリクエストを送信しました"}


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    status: Optional[str] = None,
    limit: int = 100,
    job_manager: InMemoryJobManager = Depends(get_job_manager)
):
    """
    ジョブ一覧取得

    クエリパラメータ:
    - status: フィルタリング用ステータス（pending, processing, completed, failed）
    - limit: 取得件数（デフォルト: 100）
    """

    status_filter = None
    if status:
        try:
            status_filter = JobStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {status}"
            )

    jobs = await job_manager.list_jobs(status=status_filter, limit=limit)

    return JobListResponse(
        jobs=[
            JobResponse(
                job_id=job.job_id,
                status=job.status.value,
                progress={
                    "total": job.total_items,
                    "processed": job.processed_items,
                    "percent": job.progress_percent,
                    "duration": job.duration_seconds,
                },
                result=job.result,
                error=job.error
            )
            for job in jobs
        ],
        total=len(jobs)
    )
