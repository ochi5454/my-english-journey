# backend/migration/add_birth_date_column.py
import sqlite3
import sys
from pathlib import Path

# プロジェクトルートをPythonパスに追加
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.core.config import DB_PATH

def add_birth_date_column():
    """candidatesテーブルにbirth_dateカラムを追加"""
    print(f"📁 データベースパス: {DB_PATH}")
    
    if not DB_PATH.exists():
        print(f"❌ データベースファイルが見つかりません: {DB_PATH}")
        print(f"   確認してください: {DB_PATH.absolute()}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("ALTER TABLE candidates ADD COLUMN birth_date VARCHAR")
        conn.commit()
        print("✅ birth_date カラムを追加しました")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("⚠️ birth_date カラムは既に存在します")
        else:
            print(f"❌ エラー: {e}")
            raise
    finally:
        conn.close()

if __name__ == "__main__":
    add_birth_date_column()