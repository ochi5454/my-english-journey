"""
非同期ジョブ処理のコアモジュール

ナレッジベースのテンプレートを使用した実装
"""
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any


class JobStatus(str, Enum):
    """ジョブステータス"""
    PENDING = "pending"          # キューに入った
    PROCESSING = "processing"    # 実行中
    COMPLETED = "completed"      # 成功
    FAILED = "failed"            # 失敗
    CANCELLED = "cancelled"      # キャンセル


@dataclass
class JobState:
    """
    ジョブ状態の標準スキーマ

    ナレッジリファレンスの実装パターンに従う
    """
    job_id: str
    status: JobStatus

    # 進捗管理
    total_items: int = 0
    processed_items: int = 0

    # 結果
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    # タイムスタンプ
    created_at: datetime = field(default_factory=lambda: datetime.utcnow())
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @property
    def progress_percent(self) -> int:
        """進捗率（パーセント）を計算"""
        if self.total_items == 0:
            return 0
        return int((self.processed_items / self.total_items) * 100)

    @property
    def duration_seconds(self) -> Optional[float]:
        """実行時間（秒）を計算"""
        if not self.started_at:
            return None
        end = self.completed_at or datetime.utcnow()
        return (end - self.started_at).total_seconds()

    def to_dict(self) -> Dict[str, Any]:
        """辞書形式に変換（API レスポンス用）"""
        return {
            "job_id": self.job_id,
            "status": self.status.value,
            "progress": {
                "total": self.total_items,
                "processed": self.processed_items,
                "percent": self.progress_percent,
                "duration": self.duration_seconds,
            },
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
