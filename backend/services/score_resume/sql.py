from sqlalchemy import text
import openai
import hashlib
import asyncio
from typing import Dict, Any, Callable, Optional
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from backend.core.database import SessionLocal

# ============================================
# ✅ emit呼び出し
# ============================================

EmitFn = Callable[[Dict[str, Any]], None]

# ============================================
# 🚀 パフォーマンス最適化: キャッシング
# ============================================

_sql_cache: Dict[str, tuple[str, datetime]] = {}
CACHE_TTL_SECONDS = 3600  # 1時間

def _cache_key(text: str) -> str:
    """テキストからキャッシュキーを生成"""
    # 最初の500文字でキャッシュキーを作成
    content = text[:500]
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def _get_cached_sql(key: str) -> Optional[str]:
    """キャッシュからSQL取得"""
    if key in _sql_cache:
        sql, timestamp = _sql_cache[key]
        if datetime.now() - timestamp < timedelta(seconds=CACHE_TTL_SECONDS):
            print(f"✅ SQLキャッシュヒット: {key[:8]}...")
            return sql
        else:
            del _sql_cache[key]
    return None

def _set_cached_sql(key: str, sql: str):
    """SQLをキャッシュに保存"""
    _sql_cache[key] = (sql, datetime.now())

# ============================================
# 🚀 パフォーマンス最適化: 並列実行
# ============================================

_executor = ThreadPoolExecutor(max_workers=2)

async def _call_openai_async(
    prompt: str,
    model: str = "gpt-3.5-turbo",
    temperature: float = 0.2
) -> str:
    """OpenAI APIを非同期で呼び出す"""
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        _executor,
        lambda: openai.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
    )
    return (response.choices[0].message.content or "").strip()

# ============================================
# 🧠 テキストをSQLiteに保存（最適化版）
# ============================================

async def generate_resume_sql_async(
    masked_text: str,
    candidate_id: str,
    emit: Optional[EmitFn] = None
) -> str:
    """
    🚀 最適化版: 非同期 + キャッシング + プロンプト短縮
    """
    if emit:
        emit({"kind": "sql_prompt_build", "message": "🧾 SQL生成用プロンプトを構築中..."})
    
    # キャッシュチェック
    cache_k = _cache_key(masked_text + candidate_id)
    cached_sql = _get_cached_sql(cache_k)
    if cached_sql:
        if emit:
            emit({"kind": "sql_cache_hit", "message": "✅ キャッシュからSQL取得"})
        return cached_sql
    
    # 🚀 プロンプトを短縮・最適化（トークン削減）
    prompt = f"""
あなたはデータ構造化AIです。
以下の履歴書（個人情報マスク済み）を3つのテーブルに分けてINSERT文を出力してください。

候補者ID: {candidate_id}

テーブル構造:
1. resumes (id, name_masked, email_masked, phone_masked, skills, notes)
2. resume_education_history (id AUTOINCREMENT, resume_id, institution, degree, start_date, end_date)
3. resume_work_history (id AUTOINCREMENT, resume_id, company, position, start_date, end_date, description)

履歴書:
{masked_text[:2000]}

注意:
- resumes.id = '{candidate_id}'
- resume_*_history.resume_id = '{candidate_id}'
- マスク済み表記（＜人名削除＞等）はそのまま使用
- SQLコードのみ出力（解説不要）
"""
    
    if emit:
        emit({"kind": "sql_llm_call", "message": "🤖 GPTへSQL生成リクエスト送信中..."})
    
    raw_sql = await _call_openai_async(prompt, model="gpt-3.5-turbo", temperature=0.2)
    
    # キャッシュに保存
    _set_cached_sql(cache_k, raw_sql)
    
    if emit:
        emit({
            "kind": "sql_llm_response",
            "message": "🧩 GPTからSQL受信",
            "data": {"sql_length": len(raw_sql)}
        })
    
    return raw_sql

def generate_resume_sql(
    masked_text: str,
    candidate_id: str,
    emit: Optional[EmitFn] = None
) -> str:
    """
    同期版ラッパー（イベントループ対応）
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    generate_resume_sql_async(masked_text, candidate_id, emit)
                )
                return future.result()
        else:
            return loop.run_until_complete(
                generate_resume_sql_async(masked_text, candidate_id, emit)
            )
    except RuntimeError:
        return asyncio.run(generate_resume_sql_async(masked_text, candidate_id, emit))

# ============================================
# 🧠 SQLiteへの保存（最適化版）
# ============================================

def save_sql_to_sqlite(sql: str, emit: Optional[EmitFn] = None):
    """
    🚀 最適化版: バッチ実行 + エラーハンドリング改善
    """
    try:
        if emit:
            emit({"kind": "sql_parse_start", "message": "🔍 SQL文を分割・解析中..."})
        
        # SQL文を分割（空文を除外）
        statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
        
        if not statements:
            if emit:
                emit({"kind": "sql_empty", "message": "⚠️ SQL文が空です"})
            return
        
        with SessionLocal() as db:
            success_count = 0
            error_count = 0
            
            for i, stmt in enumerate(statements, 1):
                try:
                    if emit:
                        emit({
                            "kind": "sql_exec",
                            "message": f"💾 SQL実行中 ({i}/{len(statements)}): {stmt[:50]}..."
                        })
                    
                    db.execute(text(stmt))
                    success_count += 1
                    
                except Exception as e:
                    error_count += 1
                    error_msg = str(e)
                    print(f"❌ SQL実行エラー (文{i}): {error_msg}")
                    
                    if emit:
                        emit({
                            "kind": "sql_exec_error",
                            "message": f"⚠️ SQL文{i}でエラー: {error_msg[:100]}"
                        })
                    
                    # 🚀 エラーがあっても続行（部分的な保存を許可）
                    continue
            
            # 🚀 トランザクションのコミット
            db.commit()
            
            if emit:
                emit({
                    "kind": "sql_done",
                    "message": f"✅ SQL保存完了（成功: {success_count}, エラー: {error_count}）"
                })
            
            print(f"✅ SQL保存完了: 成功{success_count}件, エラー{error_count}件")
            
    except Exception as e:
        if emit:
            emit({"kind": "sql_error", "message": f"❌ SQL実行エラー: {e}"})
        print(f"❌ SQL実行エラー: {e}")
        raise

# ============================================
# 🚀 新機能: SQL生成と保存を一括実行
# ============================================

async def generate_and_save_resume_sql_async(
    masked_text: str,
    candidate_id: str,
    emit: Optional[EmitFn] = None
) -> bool:
    """
    🚀 SQL生成と保存を一括実行（非同期版）
    
    Returns:
        bool: 成功したかどうか
    """
    try:
        # SQL生成
        sql = await generate_resume_sql_async(masked_text, candidate_id, emit)
        
        # SQL保存（同期処理なので別スレッドで実行）
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            _executor,
            lambda: save_sql_to_sqlite(sql, emit)
        )
        
        return True
        
    except Exception as e:
        if emit:
            emit({
                "kind": "sql_complete_error",
                "message": f"❌ SQL生成・保存エラー: {e}"
            })
        print(f"❌ SQL生成・保存エラー: {e}")
        return False

def generate_and_save_resume_sql(
    masked_text: str,
    candidate_id: str,
    emit: Optional[EmitFn] = None
) -> bool:
    """
    同期版ラッパー（イベントループ対応）
    
    使用例:
    success = generate_and_save_resume_sql(masked_text, candidate_id, emit)
    if success:
        print("SQL生成・保存成功")
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    generate_and_save_resume_sql_async(masked_text, candidate_id, emit)
                )
                return future.result()
        else:
            return loop.run_until_complete(
                generate_and_save_resume_sql_async(masked_text, candidate_id, emit)
            )
    except RuntimeError:
        return asyncio.run(
            generate_and_save_resume_sql_async(masked_text, candidate_id, emit)
        )

# ============================================
# 🚀 新機能: バッチ処理（複数候補者を一括処理）
# ============================================

async def batch_generate_resume_sql_async(
    candidates: list[tuple[str, str]],
    emit: Optional[EmitFn] = None
) -> dict[str, str]:
    """
    🚀 複数候補者のSQL生成を並列実行
    
    Args:
        candidates: [(masked_text, candidate_id), ...]
        
    Returns:
        {candidate_id: sql_string, ...}
    """
    if emit:
        emit({
            "kind": "batch_start",
            "message": f"🚀 バッチ処理開始: {len(candidates)}件"
        })
    
    # 並列タスクを作成
    tasks = [
        generate_resume_sql_async(text, cid, None)  # emitは個別に送らない
        for text, cid in candidates
    ]
    
    # 並列実行
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 結果を辞書にまとめる
    result_dict = {}
    success_count = 0
    error_count = 0
    
    for (text, cid), result in zip(candidates, results):
        if isinstance(result, Exception):
            print(f"❌ バッチ処理エラー ({cid}): {result}")
            error_count += 1
        else:
            result_dict[cid] = result
            success_count += 1
    
    if emit:
        emit({
            "kind": "batch_done",
            "message": f"✅ バッチ処理完了: 成功{success_count}件, エラー{error_count}件"
        })
    
    return result_dict

def batch_generate_resume_sql(
    candidates: list[tuple[str, str]],
    emit: Optional[EmitFn] = None
) -> dict[str, str]:
    """
    同期版ラッパー（イベントループ対応）
    
    使用例:
    candidates = [
        (masked_text1, "candidate_001"),
        (masked_text2, "candidate_002"),
    ]
    results = batch_generate_resume_sql(candidates)
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    batch_generate_resume_sql_async(candidates, emit)
                )
                return future.result()
        else:
            return loop.run_until_complete(
                batch_generate_resume_sql_async(candidates, emit)
            )
    except RuntimeError:
        return asyncio.run(batch_generate_resume_sql_async(candidates, emit))