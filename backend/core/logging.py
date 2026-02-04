"""
構造化ログ設定モジュール

structlogを使用した構造化ログを提供
"""
import logging
import sys
from typing import Optional

import structlog
from structlog.types import Processor


def setup_logging(
    env: str = "development",
    log_level: str = "INFO",
    json_logs: bool = False
) -> None:
    """
    ログ設定を初期化

    Args:
        env: 環境名 ("development", "production", "test")
        log_level: ログレベル ("DEBUG", "INFO", "WARNING", "ERROR")
        json_logs: JSONフォーマットで出力するか（本番環境推奨）
    """
    # 標準のloggingレベルを設定
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper(), logging.INFO),
    )

    # 共通プロセッサー
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if env == "production" or json_logs:
        # 本番環境: JSON出力
        shared_processors.append(structlog.processors.format_exc_info)
        renderer = structlog.processors.JSONRenderer(ensure_ascii=False)
    else:
        # 開発環境: カラー付きコンソール出力
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: Optional[str] = None) -> structlog.stdlib.BoundLogger:
    """
    ロガーを取得

    Args:
        name: ロガー名（省略時は呼び出し元のモジュール名）

    Returns:
        structlog.stdlib.BoundLogger: 構造化ロガー

    Usage:
        logger = get_logger(__name__)
        logger.info("user_login", user_id="123", ip="192.168.1.1")
        logger.error("file_upload_failed", filename="test.xlsx", error=str(exc))
    """
    return structlog.get_logger(name)


# アプリケーション全体で使用するロガー
logger = get_logger("ragtesting")


# 便利なログ関数
def log_request(method: str, path: str, status_code: int, duration_ms: float, **extra):
    """HTTPリクエストをログ"""
    logger.info(
        "http_request",
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=round(duration_ms, 2),
        **extra
    )


def log_upload(file_key: str, filename: str, size_mb: float, job_id: str = None, **extra):
    """ファイルアップロードをログ"""
    logger.info(
        "file_upload",
        file_key=file_key,
        filename=filename,
        size_mb=round(size_mb, 2),
        job_id=job_id,
        **extra
    )


def log_job_status(job_id: str, status: str, progress: int = None, **extra):
    """ジョブステータス変更をログ"""
    logger.info(
        "job_status_change",
        job_id=job_id,
        status=status,
        progress=progress,
        **extra
    )


def log_auth(event: str, user_id: str = None, email: str = None, success: bool = True, **extra):
    """認証イベントをログ"""
    level = "info" if success else "warning"
    getattr(logger, level)(
        f"auth_{event}",
        user_id=user_id,
        email=email,
        success=success,
        **extra
    )


def log_error(event: str, error: str, **extra):
    """エラーをログ"""
    logger.error(event, error=error, **extra)
