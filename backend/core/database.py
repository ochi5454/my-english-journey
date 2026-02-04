import os
import logging
from pathlib import Path
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from sqlalchemy.pool import QueuePool
from .config import Settings, DATA_DIR

logger = logging.getLogger(__name__)
settings = Settings()


def _is_postgres(url: str) -> bool:
    """PostgreSQL URLかどうかを判定"""
    return url.startswith("postgresql://") or url.startswith("postgres://")


def _is_sqlite(url: str) -> bool:
    """SQLite URLかどうかを判定"""
    return url.startswith("sqlite:///")


def _normalize_sqlite_url(url: str):
    """
    Ensure SQLite DB files live under DATA_DIR while preserving any relative subpaths.
    Returns the normalized url and the resolved Path (or None for non-sqlite URLs).
    """
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url, None

    raw_path = Path(url[len(prefix) :])
    if raw_path.is_absolute():
        resolved = raw_path
    elif raw_path.parts and raw_path.parts[0] == "data":
        resolved = DATA_DIR.joinpath(*raw_path.parts[1:])
    else:
        resolved = DATA_DIR / raw_path

    resolved.parent.mkdir(parents=True, exist_ok=True)
    return f"{prefix}{resolved}", resolved


def _create_engine_for_database(url: str):
    """
    データベースタイプに応じたエンジンを作成

    PostgreSQL:
    - コネクションプーリング設定
    - 本番環境向け最適化

    SQLite:
    - check_same_thread=False
    - WALモード
    """
    if _is_postgres(url):
        logger.info("Using PostgreSQL database")
        return create_engine(
            url,
            poolclass=QueuePool,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1800,  # 30分でコネクションリサイクル
            pool_pre_ping=True,  # コネクションの生存確認
            echo=False,
        )
    elif _is_sqlite(url):
        logger.info("Using SQLite database")
        return create_engine(
            url,
            connect_args={"check_same_thread": False, "timeout": 60},
            echo=False,
        )
    else:
        # その他のデータベース
        logger.info(f"Using database: {url.split('://')[0]}")
        return create_engine(url, echo=False)


# 設定の正規化
SQLITE_PATH = None
if _is_sqlite(settings.database_url):
    settings.database_url, SQLITE_PATH = _normalize_sqlite_url(settings.database_url)

os.makedirs(DATA_DIR, exist_ok=True)

# エンジン作成
engine = _create_engine_for_database(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# SQLite向けのWALモード設定
if _is_sqlite(settings.database_url):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=10000")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.close()


def init_db():
    """
    データベースを初期化

    - テーブル作成
    - 管理者アカウントのブートストラップ
    - PostgreSQLの場合は追加の最適化
    """
    # Import models to register metadata
    from backend import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Bootstrap built-in admin account (idempotent)
    try:
        from backend.core.bootstrap import ensure_default_admin
        ensure_default_admin()
    except Exception:
        # Avoid crashing startup if bootstrap fails; log/print for visibility
        import traceback
        traceback.print_exc()

    # PostgreSQL固有の最適化
    if _is_postgres(settings.database_url):
        with engine.connect() as conn:
            try:
                # ランダム読み取りのコスト設定（SSDに最適化）
                conn.execute(text("SET random_page_cost = 1.1"))
                conn.commit()
            except Exception:
                pass

    logger.info("Database initialized successfully")


def reset_sqlite_db():
    """
    Always start with a fresh SQLite DB and clean uploads on app boot.
    """
    if SQLITE_PATH and SQLITE_PATH.exists():
        SQLITE_PATH.unlink()
    uploads_dir = DATA_DIR / "uploads"
    if os.path.isdir(uploads_dir):
        for entry in os.listdir(uploads_dir):
            try:
                os.remove(uploads_dir / entry)
            except IsADirectoryError:
                pass
    os.makedirs(DATA_DIR, exist_ok=True)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_database_info() -> dict:
    """
    データベースの情報を取得

    ヘルスチェックや診断に使用
    """
    info = {
        "type": "unknown",
        "url_masked": settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url,
        "pool_size": None,
        "connected": False,
    }

    if _is_postgres(settings.database_url):
        info["type"] = "postgresql"
        info["pool_size"] = engine.pool.size()
        info["pool_checkedout"] = engine.pool.checkedout()
        info["pool_overflow"] = engine.pool.overflow()
    elif _is_sqlite(settings.database_url):
        info["type"] = "sqlite"
        info["path"] = str(SQLITE_PATH) if SQLITE_PATH else None

    # 接続テスト
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            info["connected"] = True
    except Exception as e:
        info["connected"] = False
        info["error"] = str(e)

    return info
