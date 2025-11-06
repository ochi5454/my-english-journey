from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
from typing import Generator
from pathlib import Path
from backend.core.config import DB_PATH
import os

# ============================================
# ✅ メインDB（既存）
# ============================================

SQLALCHEMY_DATABASE_URL = f"sqlite:///{str(DB_PATH)}"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ✅ init_db() を追加
def init_db():
    """全テーブルを作成（既存のテーブルは上書きしない）"""
    # まず全モデルをインポート
    from backend.models import score_resume  # noqa
    Base.metadata.create_all(bind=engine)
    print("✅ メインDB テーブル初期化完了")

def reset_db():
    """全テーブルを削除して再作成（データが消える！）"""
    from backend.models import score_resume  # noqa
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("✅ メインDB テーブルをリセットしました")

# ============================================
# ✅ UserRole DB（新規追加）
# ============================================

# プロジェクトルートからの相対パス
PROJECT_ROOT = Path(__file__).parent.parent.parent
USERROLE_DB_PATH = PROJECT_ROOT / "data" / "userrole.db"

# 環境変数で上書き可能
USERROLE_DB_URL = os.getenv(
    "USERROLE_DB_URL",
    f"sqlite:///{USERROLE_DB_PATH}"
)

# UserRole用エンジンとセッション
userrole_engine = create_engine(
    USERROLE_DB_URL,
    connect_args={"check_same_thread": False},
    echo=False,
    pool_pre_ping=True,
)

UserRoleSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=userrole_engine
)

# UserRole用Base（別のBase）
UserRoleBase = declarative_base()

def get_userrole_db() -> Generator[Session, None, None]:
    """
    UserRole DB用の依存性注入関数
    
    使用例:
    @router.get("/users")
    def get_users(db: Session = Depends(get_userrole_db)):
        users = db.query(User).all()
        return users
    """
    db = UserRoleSessionLocal()
    try:
        yield db
    finally:
        db.close()

# ✅ UserRole DB の init_db
def init_userrole_db():
    """UserRole DB のテーブルを作成"""
    from backend.models import userrole  # noqa
    UserRoleBase.metadata.create_all(bind=userrole_engine)
    print("✅ UserRole DB テーブル初期化完了")

# ============================================
# ✅ UserRole DB コンテキストマネージャー
# ============================================

class UserRoleDB:
    """
    サービス層で使用するコンテキストマネージャー
    
    使用例:
    with UserRoleDB() as db:
        user = db.query(User).filter_by(id=user_id).first()
        return user
    """
    def __enter__(self) -> Session:
        self.db = UserRoleSessionLocal()
        return self.db
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.db.rollback()
        self.db.close()

# ============================================
# ✅ ユーティリティ関数
# ============================================

def check_userrole_db_connection() -> bool:
    """UserRole DB接続チェック"""
    try:
        with UserRoleDB() as db:
            db.execute(text("SELECT 1"))  # ✅ text() で囲む
        return True
    except Exception as e:
        print(f"❌ UserRole DB接続エラー: {e}")
        return False

def get_userrole_db_info() -> dict:
    """UserRole DB情報取得"""
    from sqlalchemy import inspect
    
    inspector = inspect(userrole_engine)
    tables = inspector.get_table_names()
    
    return {
        "db_path": str(USERROLE_DB_PATH),
        "db_url": USERROLE_DB_URL,
        "db_exists": USERROLE_DB_PATH.exists(),
        "tables": tables,
        "table_count": len(tables),
        "connection_ok": check_userrole_db_connection()
    }