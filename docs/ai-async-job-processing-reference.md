# 非同期ジョブ処理パターン - AI開発アシスタント向けリファレンス

## メタ情報
- **対象**: AI開発アシスタント（Claude Code, Copilot, Cursor等）
- **目的**: 重たい処理（大量データインポート、長時間バッチ等）の非同期化実装支援
- **前提知識**: Web API開発、データベース操作の基本

---

## 🎯 問題と解決策の要約

### 問題パターン
```
同期処理の3大問題:
1. HTTPタイムアウト（例: Azure 240秒、AWS API Gateway 30秒）
2. DB接続長時間占有（他リクエストがブロックされる）
3. クライアント待機時間（UX劣化）
```

### 解決策の4要素
```
1. 非同期処理: APIは即座に202 Acceptedを返す
2. ジョブ管理: バックグラウンドでタスク実行、状態管理
3. ポーリング: クライアントが定期的に進捗確認（2-5秒間隔）
4. DB最適化: トランザクション時間を最小化（バッチ処理）
```

---

## 📐 アーキテクチャパターン

### パターン1: シンプル非同期（推奨出発点）

```
クライアント          API Server           Background Worker
    |                     |                        |
    |--POST /upload------>|                        |
    |<--202 {job_id}------|                        |
    |                     |----queue_task-------->|
    |                     |                        |--process
    |--GET /jobs/:id----->|                        |
    |<--{progress: 30%}---|                        |
    |                     |                        |
    |--GET /jobs/:id----->|                        |
    |<--{completed}-------|                        |
```

### パターン2: エンタープライズ（スケーラブル）

```
複数インスタンス対応:
Client -> Load Balancer -> API Servers (複数)
                              ↓
                         Redis/DB (ジョブ状態)
                              ↓
                         Message Queue (RabbitMQ/Redis)
                              ↓
                         Worker Pool (複数)
```

---

## 🔧 実装テンプレート

### 1. データ構造定義

```python
# ジョブ状態の標準スキーマ
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any

class JobStatus(str, Enum):
    PENDING = "pending"          # キューに入った
    PROCESSING = "processing"    # 実行中
    COMPLETED = "completed"      # 成功
    FAILED = "failed"            # 失敗
    CANCELLED = "cancelled"      # キャンセル

@dataclass
class JobState:
    job_id: str
    status: JobStatus
    
    # 進捗管理
    total_items: int = 0
    processed_items: int = 0
    
    # 結果
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    # タイムスタンプ
    created_at: datetime = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    @property
    def progress_percent(self) -> int:
        if self.total_items == 0:
            return 0
        return int((self.processed_items / self.total_items) * 100)
    
    @property
    def duration_seconds(self) -> Optional[float]:
        if not self.started_at:
            return None
        end = self.completed_at or datetime.utcnow()
        return (end - self.started_at).total_seconds()
```

### 2. ジョブマネージャー（3パターン）

#### パターンA: インメモリ（開発/小規模向け）

```python
import asyncio
from typing import Dict, Optional

class InMemoryJobManager:
    """
    特徴:
    - 実装が最もシンプル
    - 依存なし（外部サービス不要）
    - サーバー再起動で消失
    - 単一インスタンスのみ
    
    適用:
    - プロトタイプ
    - 小規模アプリ（同時ユーザー<100）
    - ジョブ消失が許容される場合
    """
    
    def __init__(self):
        self._jobs: Dict[str, JobState] = {}
        self._lock = asyncio.Lock()
    
    async def create(self, job_id: str) -> JobState:
        async with self._lock:
            job = JobState(job_id=job_id, status=JobStatus.PENDING, created_at=datetime.utcnow())
            self._jobs[job_id] = job
            return job
    
    async def get(self, job_id: str) -> Optional[JobState]:
        return self._jobs.get(job_id)
    
    async def update_progress(self, job_id: str, processed: int, total: int = None):
        async with self._lock:
            if job := self._jobs.get(job_id):
                job.processed_items = processed
                if total:
                    job.total_items = total
                if job.status == JobStatus.PENDING:
                    job.status = JobStatus.PROCESSING
                    job.started_at = datetime.utcnow()
    
    async def complete(self, job_id: str, result: Dict[str, Any]):
        async with self._lock:
            if job := self._jobs.get(job_id):
                job.status = JobStatus.COMPLETED
                job.result = result
                job.completed_at = datetime.utcnow()
                job.processed_items = job.total_items
    
    async def fail(self, job_id: str, error: str):
        async with self._lock:
            if job := self._jobs.get(job_id):
                job.status = JobStatus.FAILED
                job.error = error
                job.completed_at = datetime.utcnow()
```

#### パターンB: Redis（本番推奨）

```python
import redis.asyncio as redis
import json

class RedisJobManager:
    """
    特徴:
    - 永続化（サーバー再起動OK）
    - 複数インスタンス対応
    - 高速（インメモリDB）
    - TTL自動削除
    
    適用:
    - 本番環境
    - 水平スケーリング必要
    - ジョブ履歴の保持
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url, decode_responses=True)
        self.ttl = 86400  # 24時間
    
    async def create(self, job_id: str) -> JobState:
        job = JobState(job_id=job_id, status=JobStatus.PENDING, created_at=datetime.utcnow())
        await self._save(job)
        return job
    
    async def get(self, job_id: str) -> Optional[JobState]:
        data = await self.redis.get(f"job:{job_id}")
        if data:
            return self._deserialize(json.loads(data))
        return None
    
    async def _save(self, job: JobState):
        key = f"job:{job.job_id}"
        value = self._serialize(job)
        await self.redis.setex(key, self.ttl, json.dumps(value))
    
    def _serialize(self, job: JobState) -> dict:
        return {
            "job_id": job.job_id,
            "status": job.status.value,
            "total_items": job.total_items,
            "processed_items": job.processed_items,
            "result": job.result,
            "error": job.error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
    
    def _deserialize(self, data: dict) -> JobState:
        return JobState(
            job_id=data["job_id"],
            status=JobStatus(data["status"]),
            total_items=data["total_items"],
            processed_items=data["processed_items"],
            result=data.get("result"),
            error=data.get("error"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            started_at=datetime.fromisoformat(data["started_at"]) if data.get("started_at") else None,
            completed_at=datetime.fromisoformat(data["completed_at"]) if data.get("completed_at") else None,
        )
```

#### パターンC: Database（完全な監査証跡）

```python
from sqlalchemy import Column, String, Integer, DateTime, JSON
from sqlalchemy.ext.asyncio import AsyncSession

class JobModel(Base):
    """
    特徴:
    - 完全な永続化
    - 複雑なクエリ可能
    - 監査証跡として保持
    - やや重い（書き込みコスト）
    
    適用:
    - コンプライアンス要件
    - 長期履歴分析
    - 複雑な検索要件
    """
    __tablename__ = "background_jobs"
    
    id = Column(String, primary_key=True)
    status = Column(String, nullable=False, index=True)
    total_items = Column(Integer, default=0)
    processed_items = Column(Integer, default=0)
    result = Column(JSON)
    error = Column(String)
    created_at = Column(DateTime, nullable=False, index=True)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

class DatabaseJobManager:
    def __init__(self, session_factory):
        self.session_factory = session_factory
    
    async def create(self, job_id: str) -> JobState:
        async with self.session_factory() as session:
            job = JobModel(
                id=job_id,
                status=JobStatus.PENDING.value,
                created_at=datetime.utcnow()
            )
            session.add(job)
            await session.commit()
            return self._to_state(job)
    
    async def get(self, job_id: str) -> Optional[JobState]:
        async with self.session_factory() as session:
            result = await session.get(JobModel, job_id)
            return self._to_state(result) if result else None
    
    def _to_state(self, model: JobModel) -> JobState:
        return JobState(
            job_id=model.id,
            status=JobStatus(model.status),
            total_items=model.total_items,
            processed_items=model.processed_items,
            result=model.result,
            error=model.error,
            created_at=model.created_at,
            started_at=model.started_at,
            completed_at=model.completed_at,
        )
```

### 3. バックグラウンドワーカー実装

```python
import asyncio
from typing import Callable, Any

class BackgroundWorker:
    """
    バックグラウンドタスク実行のベストプラクティス:
    
    1. Phase分割: メモリ処理 → DB読み取り → DB書き込み
    2. 進捗報告: 定期的に状態更新（100件ごと等）
    3. エラーハンドリング: リトライ可能/不可能を区別
    4. リソース管理: DBコネクション、ファイルハンドルの適切なクローズ
    """
    
    def __init__(self, job_manager: Any):
        self.job_manager = job_manager
    
    async def execute(
        self,
        job_id: str,
        task_func: Callable,
        *args,
        **kwargs
    ):
        """
        標準的なジョブ実行ラッパー
        
        task_funcの要件:
        - async関数であること
        - 進捗報告用のコールバックを受け取ること
        - 結果をdictで返すこと
        """
        
        job = await self.job_manager.get(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        try:
            # 進捗報告コールバック
            async def report_progress(processed: int, total: int = None):
                await self.job_manager.update_progress(job_id, processed, total)
            
            # タスク実行
            result = await task_func(
                *args,
                progress_callback=report_progress,
                **kwargs
            )
            
            # 完了
            await self.job_manager.complete(job_id, result)
            
        except Exception as e:
            # 失敗
            await self.job_manager.fail(job_id, str(e))
            # ログ出力（実際の実装では構造化ログを使用）
            print(f"Job {job_id} failed: {e}")
            raise

# 使用例
async def heavy_import_task(
    file_content: bytes,
    progress_callback: Callable,
    db_session: Any
):
    """
    実際の重い処理の実装例
    
    重要: Phase分割でDB占有時間を最小化
    """
    
    # ========================================
    # Phase 1: メモリ上で前処理（DB不要）
    # ========================================
    rows = parse_file(file_content)
    total = len(rows)
    
    validated = []
    for i, row in enumerate(rows):
        validated_row = validate_and_transform(row)
        validated.append(validated_row)
        
        # 100件ごとに進捗報告
        if i % 100 == 0:
            await progress_callback(i, total)
    
    # ========================================
    # Phase 2: DB読み取り（短時間）
    # ========================================
    # 既存レコードを一括取得
    existing_keys = await db_session.execute(
        select(Model.key, Model.id).where(...)
    )
    existing_map = {row.key: row.id for row in existing_keys}
    
    # ========================================
    # Phase 3: 振り分け（メモリ上、DB不要）
    # ========================================
    to_insert = []
    to_update = []
    
    for row in validated:
        if row['key'] in existing_map:
            row['id'] = existing_map[row['key']]
            to_update.append(row)
        else:
            to_insert.append(row)
    
    # ========================================
    # Phase 4: DB書き込み（超短時間）
    # ========================================
    async with db_session.begin():
        if to_insert:
            await db_session.execute(insert(Model), to_insert)
        if to_update:
            # バルクアップデート
            for chunk in chunks(to_update, 1000):
                stmt = insert(Model).values(chunk)
                stmt = stmt.on_conflict_do_update(...)
                await db_session.execute(stmt)
    
    # 完了報告
    await progress_callback(total, total)
    
    return {
        "total": total,
        "inserted": len(to_insert),
        "updated": len(to_update),
    }

def chunks(lst: list, n: int):
    """リストをn個ずつのチャンクに分割"""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]
```

### 4. API エンドポイント

```python
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from pydantic import BaseModel
import uuid

router = APIRouter()

# レスポンススキーマ
class JobCreatedResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobProgressResponse(BaseModel):
    job_id: str
    status: str
    progress: dict
    result: dict = None
    error: str = None

@router.post("/upload", status_code=202, response_model=JobCreatedResponse)
async def upload_file(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    job_manager: Any,  # Depends経由で注入
    db_session: Any,   # Depends経由で注入
):
    """
    重い処理のアップロードエンドポイント
    
    HTTPステータス: 202 Accepted（処理受付）
    即座にjob_idを返す
    """
    
    # バリデーション
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(400, "CSVまたはExcelファイルのみ対応")
    
    # ファイルサイズチェック
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    MAX_SIZE = 100 * 1024 * 1024  # 100MB
    if size > MAX_SIZE:
        raise HTTPException(413, f"ファイルが大きすぎます（最大{MAX_SIZE/1024/1024}MB）")
    
    # ジョブ作成
    job_id = str(uuid.uuid4())
    await job_manager.create(job_id)
    
    # ファイル読み込み
    content = await file.read()
    
    # バックグラウンドタスク登録
    background_tasks.add_task(
        worker.execute,
        job_id=job_id,
        task_func=heavy_import_task,
        file_content=content,
        db_session=db_session
    )
    
    return JobCreatedResponse(
        job_id=job_id,
        status="pending",
        message="処理を開始しました"
    )

@router.get("/jobs/{job_id}", response_model=JobProgressResponse)
async def get_job_status(
    job_id: str,
    job_manager: Any
):
    """
    ジョブ状態取得（ポーリング用）
    
    クライアントは2-5秒間隔でこのエンドポイントを呼ぶ
    """
    
    job = await job_manager.get(job_id)
    
    if not job:
        raise HTTPException(404, "ジョブが見つかりません")
    
    return JobProgressResponse(
        job_id=job.job_id,
        status=job.status.value,
        progress={
            "total": job.total_items,
            "processed": job.processed_items,
            "percent": job.progress_percent,
            "duration": job.duration_seconds,
        },
        result=job.result,
        error=job.error
    )

@router.delete("/jobs/{job_id}")
async def cancel_job(
    job_id: str,
    job_manager: Any
):
    """
    ジョブキャンセル（オプション）
    
    実装の複雑さ: 高
    - 実行中のタスクを安全に停止する必要がある
    - asyncio.Task.cancel()を適切に扱う
    """
    
    job = await job_manager.get(job_id)
    
    if not job:
        raise HTTPException(404, "ジョブが見つかりません")
    
    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
        raise HTTPException(400, "完了済みのジョブはキャンセルできません")
    
    # キャンセル処理（実装は複雑なので省略）
    # 実際にはタスク管理の仕組みが必要
    
    return {"message": "キャンセルリクエストを送信しました"}
```

### 5. フロントエンド実装

```typescript
// API クライアント
interface JobResponse {
  job_id: string;
  status: string;
  message: string;
}

interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    processed: number;
    percent: number;
    duration: number | null;
  };
  result?: any;
  error?: string;
}

class JobClient {
  /**
   * ファイルアップロード
   */
  async uploadFile(file: File): Promise<JobResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * ジョブ状態取得
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`/api/jobs/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * ポーリング実行（完了まで）
   * 
   * @param jobId ジョブID
   * @param onProgress 進捗コールバック
   * @param interval ポーリング間隔（ミリ秒）
   * @returns 最終結果
   */
  async pollUntilComplete(
    jobId: string,
    onProgress?: (status: JobStatus) => void,
    interval: number = 2000
  ): Promise<JobStatus> {
    
    while (true) {
      const status = await this.getJobStatus(jobId);
      
      // 進捗コールバック
      if (onProgress) {
        onProgress(status);
      }
      
      // 完了判定
      if (status.status === 'completed') {
        return status;
      }
      
      if (status.status === 'failed') {
        throw new Error(status.error || 'Job failed');
      }
      
      // 待機
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}

// React Hook実装
import { useState, useCallback } from 'react';

interface UseJobUploadResult {
  uploading: boolean;
  progress: number;
  status: JobStatus | null;
  error: string | null;
  upload: (file: File) => Promise<void>;
  reset: () => void;
}

function useJobUpload(): UseJobUploadResult {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const client = new JobClient();
  
  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(0);
    
    try {
      // アップロード
      const response = await client.uploadFile(file);
      
      // ポーリング
      await client.pollUntilComplete(
        response.job_id,
        (jobStatus) => {
          setStatus(jobStatus);
          setProgress(jobStatus.progress.percent);
        }
      );
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  }, []);
  
  const reset = useCallback(() => {
    setUploading(false);
    setProgress(0);
    setStatus(null);
    setError(null);
  }, []);
  
  return { uploading, progress, status, error, upload, reset };
}

// 使用例
function UploadPage() {
  const { uploading, progress, status, error, upload } = useJobUpload();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      upload(file);
    }
  };
  
  return (
    <div>
      <input
        type="file"
        onChange={handleFileChange}
        disabled={uploading}
      />
      
      {uploading && (
        <div>
          <progress value={progress} max={100} />
          <p>{progress}% 完了</p>
          {status && (
            <p>
              {status.progress.processed} / {status.progress.total} 件処理済み
            </p>
          )}
        </div>
      )}
      
      {error && <div className="error">{error}</div>}
      
      {status?.status === 'completed' && (
        <div className="success">
          完了しました！
          {status.result && (
            <pre>{JSON.stringify(status.result, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 DB最適化パターン

### アンチパターン: ループ内でDB操作

```python
# ❌ 最悪: 7000件 × 2回（SELECT + INSERT/UPDATE）= 14000クエリ
async def bad_import(rows: list):
    for row in rows:  # 7000回ループ
        # 既存チェック
        existing = await db.execute(
            select(Model).where(Model.key == row['key'])
        )
        
        if existing:
            # UPDATE
            await db.execute(
                update(Model).where(Model.id == existing.id).values(...)
            )
        else:
            # INSERT
            await db.execute(insert(Model).values(**row))
        
        await db.commit()  # 毎回コミット
    
    # DB占有: 180秒（3分）
```

### ベストプラクティス: バッチ処理

```python
# ✅ 最善: 2回のクエリ（SELECT 1回 + INSERT/UPDATE 1回）
async def good_import(rows: list):
    
    # ========================================
    # Step 1: 既存データを一括取得（1回のクエリ）
    # ========================================
    keys = [row['key'] for row in rows]
    result = await db.execute(
        select(Model.key, Model.id).where(Model.key.in_(keys))
    )
    existing_map = {r.key: r.id for r in result}
    
    # ========================================
    # Step 2: メモリ上で振り分け
    # ========================================
    to_insert = []
    to_update = []
    
    for row in rows:
        if row['key'] in existing_map:
            row['id'] = existing_map[row['key']]
            to_update.append(row)
        else:
            to_insert.append(row)
    
    # ========================================
    # Step 3: バッチ書き込み（1回のトランザクション）
    # ========================================
    async with db.begin():
        # バルクINSERT
        if to_insert:
            await db.execute(insert(Model), to_insert)
        
        # バルクUPDATE（PostgreSQL UPSERT）
        if to_update:
            stmt = insert(Model).values(to_update)
            stmt = stmt.on_conflict_do_update(
                index_elements=['id'],
                set_={
                    col: stmt.excluded[col]
                    for col in ['column1', 'column2', ...]
                }
            )
            await db.execute(stmt)
    
    # DB占有: 30秒（1/6に短縮）
```

### チャンク分割（超大量データ対応）

```python
async def chunked_import(rows: list, chunk_size: int = 1000):
    """
    用途: 10万件以上のデータ
    
    メリット:
    - メモリ使用量の抑制
    - 他のトランザクションに処理を譲る
    - 部分的な成功/失敗の管理
    """
    
    total_inserted = 0
    total_updated = 0
    
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]
        
        # チャンクごとに処理
        result = await process_chunk(chunk)
        
        total_inserted += result['inserted']
        total_updated += result['updated']
        
        # 進捗報告
        await update_progress(i + len(chunk), len(rows))
        
        # 短い休憩（他のトランザクションに譲る）
        await asyncio.sleep(0.1)
    
    return {
        "total_inserted": total_inserted,
        "total_updated": total_updated
    }
```

---

## 🔍 エラーハンドリング

### リトライ戦略

```python
import asyncio
from typing import TypeVar, Callable

T = TypeVar('T')

class RetryableError(Exception):
    """一時的なエラー（リトライ可能）"""
    pass

class PermanentError(Exception):
    """恒久的なエラー（リトライ不可）"""
    pass

async def retry_with_backoff(
    func: Callable[..., T],
    max_retries: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    *args,
    **kwargs
) -> T:
    """
    指数バックオフ付きリトライ
    
    リトライ間隔: 1秒 → 2秒 → 4秒 → 8秒...
    """
    
    delay = initial_delay
    
    for attempt in range(max_retries):
        try:
            return await func(*args, **kwargs)
            
        except RetryableError as e:
            if attempt == max_retries - 1:
                # 最後の試行
                raise
            
            # 待機してリトライ
            print(f"Retry {attempt + 1}/{max_retries} after {delay}s: {e}")
            await asyncio.sleep(delay)
            delay *= backoff_factor
            
        except PermanentError:
            # リトライせず即座に失敗
            raise

# 使用例
async def process_with_retry(job_id: str, data: bytes):
    try:
        result = await retry_with_backoff(
            heavy_import_task,
            max_retries=3,
            file_content=data
        )
        await job_manager.complete(job_id, result)
        
    except RetryableError as e:
        await job_manager.fail(job_id, f"一時的エラーでリトライ失敗: {e}")
        
    except PermanentError as e:
        await job_manager.fail(job_id, f"データエラー: {e}")
```

### エラー分類の例

```python
# データベース関連
class DBConnectionError(RetryableError):
    """DB接続エラー → リトライ可能"""
    pass

class DBDeadlockError(RetryableError):
    """デッドロック → リトライ可能"""
    pass

# データ関連
class ValidationError(PermanentError):
    """バリデーションエラー → リトライ不可"""
    pass

class DuplicateKeyError(PermanentError):
    """重複エラー → リトライ不可"""
    pass

# ネットワーク関連
class NetworkTimeoutError(RetryableError):
    """ネットワークタイムアウト → リトライ可能"""
    pass
```

---

## 📊 監視とロギング

### 構造化ログ

```python
import structlog
from datetime import datetime

logger = structlog.get_logger()

async def process_job_with_logging(job_id: str, data: bytes):
    """
    重要なログポイント:
    1. ジョブ開始
    2. 各フェーズの開始/終了
    3. エラー発生
    4. ジョブ完了
    """
    
    log = logger.bind(job_id=job_id)
    
    # ジョブ開始
    log.info("job_started", data_size=len(data))
    start_time = datetime.utcnow()
    
    try:
        # Phase 1
        log.info("phase_started", phase="parse")
        rows = parse_file(data)
        log.info("phase_completed", phase="parse", row_count=len(rows))
        
        # Phase 2
        log.info("phase_started", phase="validate")
        validated = validate_rows(rows)
        log.info("phase_completed", phase="validate")
        
        # Phase 3
        log.info("phase_started", phase="db_write")
        result = await write_to_db(validated)
        log.info("phase_completed", phase="db_write", **result)
        
        # 完了
        duration = (datetime.utcnow() - start_time).total_seconds()
        log.info("job_completed", duration_seconds=duration, **result)
        
        return result
        
    except Exception as e:
        duration = (datetime.utcnow() - start_time).total_seconds()
        log.error(
            "job_failed",
            error=str(e),
            error_type=type(e).__name__,
            duration_seconds=duration
        )
        raise
```

### メトリクス収集

```python
from prometheus_client import Counter, Histogram, Gauge

# メトリクス定義
job_started = Counter('job_started_total', 'Jobs started', ['job_type'])
job_completed = Counter('job_completed_total', 'Jobs completed', ['job_type', 'status'])
job_duration = Histogram('job_duration_seconds', 'Job duration', ['job_type'])
active_jobs = Gauge('active_jobs', 'Currently active jobs', ['job_type'])

async def process_with_metrics(job_id: str, job_type: str, data: bytes):
    """メトリクス収集付き処理"""
    
    job_started.labels(job_type=job_type).inc()
    active_jobs.labels(job_type=job_type).inc()
    
    start_time = datetime.utcnow()
    
    try:
        result = await process_job(job_id, data)
        
        # 成功
        job_completed.labels(job_type=job_type, status='success').inc()
        return result
        
    except Exception:
        # 失敗
        job_completed.labels(job_type=job_type, status='failure').inc()
        raise
        
    finally:
        # 所要時間記録
        duration = (datetime.utcnow() - start_time).total_seconds()
        job_duration.labels(job_type=job_type).observe(duration)
        
        active_jobs.labels(job_type=job_type).dec()
```

---

## 🧪 テスト戦略

### ユニットテスト（ジョブマネージャー）

```python
import pytest

@pytest.mark.asyncio
async def test_job_lifecycle():
    """ジョブのライフサイクルテスト"""
    
    manager = InMemoryJobManager()
    job_id = "test-123"
    
    # 作成
    job = await manager.create(job_id)
    assert job.status == JobStatus.PENDING
    
    # 進捗更新
    await manager.update_progress(job_id, 50, 100)
    job = await manager.get(job_id)
    assert job.status == JobStatus.PROCESSING
    assert job.progress_percent == 50
    
    # 完了
    result = {"total": 100, "success": 100}
    await manager.complete(job_id, result)
    job = await manager.get(job_id)
    assert job.status == JobStatus.COMPLETED
    assert job.result == result

@pytest.mark.asyncio
async def test_job_failure():
    """ジョブ失敗のテスト"""
    
    manager = InMemoryJobManager()
    job_id = "test-456"
    
    await manager.create(job_id)
    await manager.fail(job_id, "Test error")
    
    job = await manager.get(job_id)
    assert job.status == JobStatus.FAILED
    assert job.error == "Test error"
```

### 統合テスト（API）

```python
from fastapi.testclient import TestClient

def test_upload_returns_job_id(client: TestClient):
    """アップロードがjob_idを返すことを確認"""
    
    files = {"file": ("test.csv", b"data", "text/csv")}
    response = client.post("/api/upload", files=files)
    
    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["status"] == "pending"

def test_job_status_endpoint(client: TestClient, job_manager):
    """ジョブ状態取得エンドポイントのテスト"""
    
    # テスト用ジョブを作成
    job_id = "test-789"
    job_manager.create(job_id)
    
    # 状態取得
    response = client.get(f"/api/jobs/{job_id}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert "progress" in data

def test_nonexistent_job(client: TestClient):
    """存在しないジョブの404エラー"""
    
    response = client.get("/api/jobs/nonexistent")
    assert response.status_code == 404
```

### E2Eテスト（フロントエンド）

```typescript
// Playwright/Cypress等での例

describe('File Upload Flow', () => {
  it('should upload file and show progress', async () => {
    // ファイル選択
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('test-data.csv');
    
    // プログレスバーが表示される
    await expect(page.locator('.progress-bar')).toBeVisible();
    
    // 完了メッセージが表示される（最大60秒待機）
    await expect(page.locator('.success'))
      .toBeVisible({ timeout: 60000 });
    
    // 結果が表示される
    const result = await page.locator('.result').textContent();
    expect(result).toContain('完了');
  });
  
  it('should handle error gracefully', async () => {
    // 無効なファイルをアップロード
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('invalid.txt');
    
    // エラーメッセージが表示される
    await expect(page.locator('.error')).toBeVisible();
  });
});
```

---

## 🚀 デプロイメント考慮事項

### 環境変数

```bash
# ジョブ管理
JOB_MANAGER_TYPE=redis  # inmemory | redis | database
REDIS_URL=redis://localhost:6379
JOB_TTL_HOURS=24

# ワーカー設定
MAX_CONCURRENT_JOBS=5
JOB_TIMEOUT_SECONDS=3600

# ポーリング設定
POLLING_INTERVAL_SECONDS=2
MAX_RETRIES=3

# ファイルサイズ制限
MAX_FILE_SIZE_MB=100
```

### スケーリング戦略

```yaml
# Docker Compose例
version: '3.8'

services:
  # API Server（複数インスタンス可）
  api:
    image: myapp-api
    replicas: 3
    environment:
      - JOB_MANAGER_TYPE=redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - postgres
  
  # Worker（別プロセスとして実行推奨）
  worker:
    image: myapp-worker
    replicas: 2
    environment:
      - JOB_MANAGER_TYPE=redis
      - REDIS_URL=redis://redis:6379
      - MAX_CONCURRENT_JOBS=3
    depends_on:
      - redis
      - postgres
  
  # Redis（ジョブ状態管理）
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
  
  # PostgreSQL（メインDB）
  postgres:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

### ヘルスチェック

```python
from fastapi import APIRouter

health_router = APIRouter()

@health_router.get("/health")
async def health_check(
    job_manager: Any,
    db: Any
):
    """
    ヘルスチェックエンドポイント
    
    確認項目:
    - APIサーバーの稼働
    - ジョブマネージャーの接続
    - データベース接続
    """
    
    health = {
        "status": "healthy",
        "components": {}
    }
    
    # ジョブマネージャー
    try:
        test_job = await job_manager.get("health-check")
        health["components"]["job_manager"] = "ok"
    except Exception as e:
        health["status"] = "unhealthy"
        health["components"]["job_manager"] = f"error: {e}"
    
    # データベース
    try:
        await db.execute("SELECT 1")
        health["components"]["database"] = "ok"
    except Exception as e:
        health["status"] = "unhealthy"
        health["components"]["database"] = f"error: {e}"
    
    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(health, status_code=status_code)

@health_router.get("/metrics/jobs")
async def job_metrics(job_manager: Any):
    """
    ジョブメトリクスエンドポイント
    
    監視ダッシュボードで使用
    """
    
    # Redis/DB実装の場合は集計クエリ
    # ここではインメモリ実装の例
    
    jobs = await job_manager.get_all_jobs()
    
    metrics = {
        "total": len(jobs),
        "pending": sum(1 for j in jobs if j.status == JobStatus.PENDING),
        "processing": sum(1 for j in jobs if j.status == JobStatus.PROCESSING),
        "completed": sum(1 for j in jobs if j.status == JobStatus.COMPLETED),
        "failed": sum(1 for j in jobs if j.status == JobStatus.FAILED),
    }
    
    return metrics
```

---

## 📋 チェックリスト

### 実装前の確認

```
□ 処理の実行時間を測定済み（タイムアウトリスクの評価）
□ データ量の見積もり（メモリ使用量の評価）
□ 並行実行数の想定（リソース要件の評価）
□ エラー時の動作を定義（リトライ戦略）
□ ジョブ管理方式の選択（inmemory/Redis/DB）
```

### 実装時の確認

```
□ ジョブIDの生成（UUID推奨）
□ HTTP 202 Acceptedを返す
□ 進捗報告の実装（100件ごと等）
□ エラーハンドリング（リトライ可能/不可の分類）
□ DB占有時間の最小化（バッチ処理）
□ ポーリング間隔の設定（2-5秒推奨）
□ タイムアウト設定（ジョブ全体、DB接続等）
□ ログ出力（開始、進捗、完了、エラー）
```

### テスト時の確認

```
□ 正常系テスト（小規模データ）
□ 正常系テスト（大規模データ）
□ エラーケーステスト（バリデーションエラー）
□ エラーケーステスト（DB接続エラー）
□ 並行実行テスト（複数ユーザー同時）
□ タイムアウトテスト
□ サーバー再起動テスト（ジョブの永続性確認）
```

### 本番運用の確認

```
□ 監視設定（メトリクス、アラート）
□ ログ集約（ELK/CloudWatch等）
□ ジョブのクリーンアップ（古いジョブの削除）
□ スケーリング設定（オートスケール）
□ バックアップ戦略（Redis/DB）
□ ドキュメント作成（運用手順、障害対応）
```

---

## 🎓 AIアシスタントへの指示例

コード生成時にこのリファレンスを参照する際の例:

```
# 良い指示例

「Pythonで大量CSVインポート機能を実装してください。
要件:
- 10,000件のCSVデータ
- 重複チェックあり（employee_no + qualification_nameで判定）
- 非同期処理（HTTP 202 Accepted）
- 進捗表示対応
- DB占有時間を最小化

非同期ジョブ処理リファレンスの『実装テンプレート』に従って実装してください。」

# さらに詳細に指定する場合

「ジョブマネージャーはRedis版を使用。
バックグラウンドワーカーは4フェーズ構成。
APIエンドポイントはFastAPIで実装。
テストコードも含めてください。」
```

---

## 📚 用語集

| 用語 | 説明 |
|------|------|
| **同期処理** | リクエストを受けて処理が完了するまでレスポンスを返さない方式 |
| **非同期処理** | リクエストを受けてすぐにレスポンスを返し、処理はバックグラウンドで実行する方式 |
| **ジョブ** | バックグラウンドで実行される処理の単位 |
| **ポーリング** | クライアントが定期的にサーバーに状態を問い合わせる方式 |
| **バッチ処理** | 複数のデータをまとめて一度に処理する方式（DB書き込みの効率化） |
| **トランザクション** | データベースの一連の操作をまとめた単位（全て成功or全て失敗） |
| **指数バックオフ** | リトライ間隔を指数関数的に増やす戦略（1秒→2秒→4秒...） |
| **TTL** | Time To Live。データの保持期間（例: 24時間後に自動削除） |
| **UUID** | 一意識別子（Universally Unique Identifier）。ジョブIDに使用 |

---

## 🔗 関連リソース

- FastAPI Background Tasks: https://fastapi.tiangolo.com/tutorial/background-tasks/
- Celery Documentation: https://docs.celeryq.dev/
- Redis Pub/Sub: https://redis.io/docs/manual/pubsub/
- PostgreSQL UPSERT: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT
- WebSocket vs Polling: https://ably.com/topic/websockets-vs-polling

---

**このリファレンスは、AI開発アシスタントが効率的に非同期ジョブ処理を実装するための完全ガイドです。**
