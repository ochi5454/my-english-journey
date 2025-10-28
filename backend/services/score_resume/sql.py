from sqlalchemy import text
import openai
from typing import Dict, Any, Callable, Optional
from backend.core.database import SessionLocal

# ============================================
# ✅ emit呼び出し
# ============================================

EmitFn = Callable[[Dict[str, Any]], None]

# ============================================
# 🧠 テキストをSQLiteに保存
# ============================================

def generate_resume_sql(masked_text: str, candidate_id: str, emit: Optional[EmitFn] = None) -> str:
    if emit:
        emit({"kind": "sql_prompt_build", "message": "🧾 SQL生成用プロンプトを構築中..."})
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

2. resume_education_history（学歴）:
CREATE TABLE resume_education_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resume_id TEXT,
  institution TEXT,
  degree TEXT,
  start_date TEXT,
  end_date TEXT
);

3. resume_work_history（職歴）:
CREATE TABLE resume_work_history (
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
- resume_education_history, resume_work_history の `resume_id` も `{candidate_id}` にしてください。
- 履歴書には「＜人名削除＞」「＜メールアドレス削除＞」「＜電話番号削除＞」などのマスク済み表記があります。
- これらの表記はそのままSQLに埋め込んでください。
- 「＜削除＞」や空文字列に変換してはいけません。
- SQLコードのみ出力し、解説や囲いなどは不要です。
"""
    
    if emit:
        emit({"kind": "sql_llm_call", "message": "🤖 GPTへSQL構造生成リクエストを送信中..."})
    response = openai.chat.completions.create(
        model="gpt-3.5-turbo",  # ダウングレード済
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    raw_sql = (response.choices[0].message.content or "").strip()
    if emit:
        emit({"kind": "sql_llm_response", "message": "🧩 GPTからSQL構造を受信", "data": {"sql_length": len(raw_sql)}})
    return raw_sql

def save_sql_to_sqlite(sql: str, emit: Optional[EmitFn] = None):
    try:
        if emit:
            emit({"kind": "sql_parse_start", "message": "🔍 SQL文を分割・解析中..."})
        with SessionLocal() as db:
            statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
            for stmt in statements:
                if emit:
                    emit({"kind": "sql_exec", "message": f"💾 SQL文を実行中: {stmt[:40]}..."})
                db.execute(text(stmt))
            db.commit()
        if emit:
            emit({"kind": "sql_done", "message": f"✅ SQL構造保存完了（{len(statements)}文）"})
    except Exception as e:
        if emit:
            emit({"kind": "sql_error", "message": f"❌ SQL実行エラー: {e}"})
        print(f"❌ SQL実行エラー: {e}")
