"""
ファイルアップロード用の非同期タスク

ナレッジリファレンスのベストプラクティスに従う:
1. Phase分割: ファイル保存 → Parquet変換
2. 進捗報告: 定期的に状態更新
3. エラーハンドリング: 失敗時の適切な処理
"""
import io
from typing import Callable
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services.dataset_service import DatasetService
from backend.models.dataset import DatasetStatus


async def process_upload_task(
    file_content: bytes,
    filename: str,
    file_key: str,
    content_type: str,
    progress_callback: Callable,
) -> dict:
    """
    ファイルアップロード処理の非同期タスク

    Phase分割:
    1. ファイル保存（軽量）
    2. Parquet変換（重い）

    Args:
        file_content: ファイル内容（バイト列）
        filename: オリジナルファイル名
        file_key: ファイルキー（schedule_input等）
        content_type: Content-Type
        progress_callback: 進捗報告用コールバック

    Returns:
        dict: 処理結果（dataset_id, row_count等）
    """

    # DBセッションの取得
    # 注意: これは同期的なDB操作のため、将来的にはasync SQLAlchemyに移行すべき
    db: Session = next(get_db())

    # DatasetServiceのインスタンスを作成
    dataset_service = DatasetService()

    try:
        # ========================================
        # Phase 1: ファイル保存（軽量、1-2秒）
        # ========================================
        await progress_callback(processed=1, total=3)

        dataset = dataset_service.save_upload(
            io.BytesIO(file_content),
            filename,
            file_key,
            content_type,
            db
        )

        # ========================================
        # Phase 2: Parquet変換（重い、数秒～数分）
        # ========================================
        await progress_callback(processed=2, total=3)

        dataset = dataset_service.convert_to_parquet(dataset, db)

        # ========================================
        # Phase 3: 完了
        # ========================================
        await progress_callback(processed=3, total=3)

        return {
            "file_key": file_key,
            "dataset_id": dataset.id,
            "row_count": dataset.row_count,
            "status": dataset.status.value if dataset.status else None,
            "message": "アップロードが完了しました"
        }

    except Exception as exc:
        # エラー時の処理
        if 'dataset' in locals() and dataset:
            dataset.status = DatasetStatus.failed
            db.add(dataset)
            db.commit()

        # エラーを再度スロー
        raise

    finally:
        # DBセッションのクローズ
        db.close()
