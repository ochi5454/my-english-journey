import sqlite3
import openai
from backend.core.config import RESUME_MASKED_PATH

# ============================================
# 🧠 テキストをSQLiteに保存
# ============================================

def generate_resume_sql(masked_text: str, candidate_id: str) -> str:
    prompt = f"""
あなたは人事用のデータ構造化AIです。
以下の履歴書情報（個人情報マスク済み）を読み、以下の3つのテーブルに分けてINSERT文を出力してください。

【候補者ID】
{candidate_id}

【テーブル構造】
1. resumes（基本情報）:
CREATE TABLE resumes (
  id TEXT,
  name_masked TEXT,
  email_masked TEXT,
  phone_masked TEXT,
  skills TEXT,
  notes TEXT
);

2. education_history（学歴）:
CREATE TABLE education_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id TEXT,
  institution TEXT,
  degree TEXT,
  start_date TEXT,
  end_date TEXT
);

3. work_history（職歴）:
CREATE TABLE work_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id TEXT,
  company TEXT,
  position TEXT,
  start_date TEXT,
  end_date TEXT,
  description TEXT
);

【履歴書内容】
{masked_text}

【出力形式】
各テーブルについて、1つずつINSERT文を出力してください。
複数の学歴や職歴があれば、複数行のINSERT文で構いません。

注意：
- resumesテーブルの `id` = `{candidate_id}`
- education_history, work_history の `resume_id` も `{candidate_id}` にしてください。
- 履歴書には「＜人名削除＞」「＜メールアドレス削除＞」「＜電話番号削除＞」などのマスク済み表記があります。
- これらの表記はそのままSQLに埋め込んでください。
- 「＜削除＞」や空文字列に変換してはいけません。
- SQLコードのみ出力し、解説や囲いなどは不要です。
"""
    response = openai.chat.completions.create(
        model="gpt-3.5-turbo",  # ダウングレード済
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    # ★ Noneセーフ化
    return (response.choices[0].message.content or "").strip()

def save_sql_to_sqlite(sql: str):
    try:
        db_path = str(RESUME_MASKED_PATH)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 複数の INSERT 文がある前提で split & 実行
        statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
        for stmt in statements:
            cursor.execute(stmt)

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ SQL実行エラー: {e}")
