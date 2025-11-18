"""
候補者テーブルに新しいカラムを追加するマイグレーションスクリプト
"""
from backend.core.database import engine
from sqlalchemy import inspect, text

def migrate_candidates_table():
    # 既存のカラムを確認
    inspector = inspect(engine)
    existing_columns = [col['name'] for col in inspector.get_columns('candidates')]
    print('既存カラム:', existing_columns)

    # 新しいカラムを追加
    new_columns = {
        'status': 'VARCHAR',
        'recommended_division': 'VARCHAR',
        'document_review_date': 'DATETIME',
        'document_review_reviewer': 'VARCHAR',
        'document_review_result': 'VARCHAR'
    }

    with engine.connect() as conn:
        for col_name, col_type in new_columns.items():
            if col_name not in existing_columns:
                sql = f'ALTER TABLE candidates ADD COLUMN {col_name} {col_type}'
                print(f'実行: {sql}')
                conn.execute(text(sql))
                conn.commit()
                print(f'✅ カラム {col_name} を追加しました')
            else:
                print(f'⏭️ カラム {col_name} は既に存在します')

    print('✅ データベース更新完了')

if __name__ == '__main__':
    migrate_candidates_table()
