"""
既存テーブルに書類選考関連フィールド追加マイグレーション
実行: python backend/migration/add_document_review_fields.py
"""
import sys
from pathlib import Path

# プロジェクトルートをパスに追加
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import inspect, text
from backend.core.database import engine

def column_exists(table_name: str, column_name: str) -> bool:
    """カラムが存在するかチェック"""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def upgrade():
    """マイグレーション適用"""
    
    # candidatesテーブルに列を追加
    with engine.begin() as conn:
        # document_review_result 追加
        if not column_exists('candidates', 'document_review_result'):
            conn.execute(text("""
                ALTER TABLE candidates 
                ADD COLUMN document_review_result VARCHAR
            """))
            print("✅ candidates.document_review_result を追加しました")
        else:
            print("⏭️  candidates.document_review_result は既に存在します")
        
        # document_review_date 追加
        if not column_exists('candidates', 'document_review_date'):
            conn.execute(text("""
                ALTER TABLE candidates 
                ADD COLUMN document_review_date DATETIME
            """))
            print("✅ candidates.document_review_date を追加しました")
        else:
            print("⏭️  candidates.document_review_date は既に存在します")
        
        # document_review_reviewer 追加
        if not column_exists('candidates', 'document_review_reviewer'):
            conn.execute(text("""
                ALTER TABLE candidates 
                ADD COLUMN document_review_reviewer VARCHAR
            """))
            print("✅ candidates.document_review_reviewer を追加しました")
        else:
            print("⏭️  candidates.document_review_reviewer は既に存在します")
    
    print("✅ マイグレーション完了")

def downgrade():
    """マイグレーション取り消し"""
    with engine.begin() as conn:
        # SQLiteはALTER TABLE DROP COLUMNをサポートしていないため、
        # 新しいテーブルを作成して移行する必要があります
        print("⚠️ SQLiteはカラム削除をサポートしていません")
        print("⚠️ 手動でテーブルを再作成する必要があります")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--downgrade', action='store_true', help='ロールバック実行')
    args = parser.parse_args()
    
    if args.downgrade:
        downgrade()
    else:
        upgrade()