import sqlite3
import os
from pathlib import Path

# パス設定
SCRIPT_DIR = Path(__file__).parent           # migration フォルダ
BACKEND_DIR = SCRIPT_DIR.parent              # backend フォルダ
PROJECT_ROOT = BACKEND_DIR.parent            # プロジェクトルート ← 追加
DATA_DIR = PROJECT_ROOT / 'data'             # ルート直下の data ← 修正
DB_PATH = DATA_DIR / 'userrole.db'
MIGRATIONS_DIR = BACKEND_DIR / 'migration' / 'userrole'

# マイグレーションファイルの順序
MIGRATION_FILES = [
    'UserRole_00BaseTable.sql',
    'UserRole_01Relations.sql',
    'UserRole_02AuditLogs.sql',
    'UserRole_03InitialData.sql'
]

def init_userrole_database():
    # dataディレクトリがなければ作成
    DATA_DIR.mkdir(exist_ok=True)
    
    print(f"📦 データベースファイルを作成: {DB_PATH}")
    print(f"📂 マイグレーションフォルダ: {MIGRATIONS_DIR}")
    
    # データベース接続
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # 各SQLファイルを順番に実行
    for filename in MIGRATION_FILES:
        sql_file = MIGRATIONS_DIR / filename
        
        if not sql_file.exists():
            print(f"⚠️ SQLファイルが見つかりません: {sql_file}")
            continue
        
        print(f"\n📄 実行中: {filename}")
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_script = f.read()
            cursor.executescript(sql_script)
        print(f"✅ 完了: {filename}")
    
    # 確認: テーブル一覧を表示
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = cursor.fetchall()
    print(f"\n📋 作成されたテーブル ({len(tables)}個):")
    for table in tables:
        print(f"  - {table[0]}")
    
    # 確認: ロール数を表示
    cursor.execute("SELECT COUNT(*) FROM roles;")
    role_count = cursor.fetchone()[0]
    print(f"\n👥 登録されたロール: {role_count}個")
    
    # 確認: 権限数を表示
    cursor.execute("SELECT COUNT(*) FROM permissions;")
    perm_count = cursor.fetchone()[0]
    print(f"🔑 登録された権限: {perm_count}個")
    
    conn.commit()
    conn.close()
    
    print(f"\n✨ 完了！{DB_PATH} が作成されました")

if __name__ == '__main__':
    init_userrole_database()
