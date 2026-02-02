#!/usr/bin/env python3
"""
非同期アップロードの動作確認スクリプト

使用方法:
    python backend/scripts/test_async_upload.py
"""
import asyncio
import time
from pathlib import Path

# テスト用のサンプルCSVデータを作成
def create_test_csv():
    """テスト用のCSVファイルを作成"""
    test_file = Path("/tmp/test_upload.csv")

    # 1000行のサンプルデータ
    with open(test_file, "w", encoding="utf-8") as f:
        f.write("従業員番号,氏名,勤務予定,実所定外時間\n")
        for i in range(1000):
            f.write(f"{i:05d},テスト太郎{i},出勤,120\n")

    return test_file


async def test_job_manager():
    """JobManagerの動作確認"""
    from backend.services.job_manager import InMemoryJobManager
    from backend.core.jobs import JobStatus

    print("=== JobManager テスト ===\n")

    manager = InMemoryJobManager()

    # ジョブ作成
    print("1. ジョブ作成")
    job = await manager.create("test-job-1")
    print(f"   ✓ Job ID: {job.job_id}")
    print(f"   ✓ Status: {job.status.value}")

    # 進捗更新
    print("\n2. 進捗更新")
    await manager.update_progress("test-job-1", 50, 100)
    job = await manager.get("test-job-1")
    print(f"   ✓ Progress: {job.progress_percent}%")
    print(f"   ✓ Status: {job.status.value}")

    # 完了
    print("\n3. ジョブ完了")
    await manager.complete("test-job-1", {"result": "success"})
    job = await manager.get("test-job-1")
    print(f"   ✓ Status: {job.status.value}")
    print(f"   ✓ Result: {job.result}")

    # 一覧取得
    print("\n4. ジョブ一覧")
    jobs = await manager.list_jobs()
    print(f"   ✓ Total jobs: {len(jobs)}")
    for j in jobs:
        print(f"      - {j.job_id}: {j.status.value}")

    print("\n✅ JobManager テスト完了\n")


async def test_background_worker():
    """BackgroundWorkerの動作確認"""
    from backend.services.job_manager import get_job_manager
    from backend.services.background_worker import BackgroundWorker

    print("=== BackgroundWorker テスト ===\n")

    manager = get_job_manager()
    worker = BackgroundWorker(manager)

    # テスト用のタスク関数
    async def test_task(progress_callback, message: str):
        """テスト用の簡単なタスク"""
        print(f"   Task started: {message}")

        for i in range(1, 6):
            await asyncio.sleep(0.5)  # 0.5秒待機
            await progress_callback(i, 5)
            print(f"   Progress: {i}/5")

        return {"message": message, "status": "completed"}

    # ジョブ実行
    print("1. バックグラウンドタスク実行")
    job = await manager.create("test-worker-1")

    try:
        await worker.execute(
            "test-worker-1",
            test_task,
            message="Hello from background worker!"
        )
        print("   ✓ Task completed")
    except Exception as e:
        print(f"   ✗ Error: {e}")

    # 結果確認
    job = await manager.get("test-worker-1")
    print(f"\n2. 結果確認")
    print(f"   ✓ Status: {job.status.value}")
    print(f"   ✓ Result: {job.result}")

    print("\n✅ BackgroundWorker テスト完了\n")


async def main():
    """メイン処理"""
    print("\n" + "="*60)
    print("非同期ジョブ処理システム - 動作確認")
    print("="*60 + "\n")

    # JobManager テスト
    await test_job_manager()

    # BackgroundWorker テスト
    await test_background_worker()

    print("="*60)
    print("すべてのテストが完了しました！")
    print("="*60 + "\n")

    print("次のステップ:")
    print("1. バックエンドを起動: uvicorn backend.app:app --reload")
    print("2. フロントエンドを起動: cd frontend && npm run dev")
    print("3. ブラウザで http://localhost:3000 を開く")
    print("4. ファイルをアップロードして動作確認")
    print("")


if __name__ == "__main__":
    asyncio.run(main())
