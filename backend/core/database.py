import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from .config import Settings, DATA_DIR

settings = Settings()

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


settings.database_url, SQLITE_PATH = _normalize_sqlite_url(settings.database_url)

os.makedirs(DATA_DIR, exist_ok=True)

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False, "timeout": 60})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db():
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
    # Improve SQLite concurrency
    with engine.connect() as conn:
        try:
            conn.execute(text("PRAGMA journal_mode=WAL"))
            conn.execute(text("PRAGMA synchronous=NORMAL"))
        except Exception:
            pass


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
