# 非同期ジョブ処理システム実装ガイド

## 概要

このドキュメントは、本プロジェクトに実装された**非同期ジョブ処理システム**の使用方法とアーキテクチャを説明します。

ナレッジリファレンス「非同期ジョブ処理パターン - AI開発アシスタント向けリファレンス」に基づいて実装されています。

## 実装の目的

従来の同期処理では以下の問題がありました：

1. **HTTPタイムアウトリスク** - 大きなファイル処理で数分かかる場合にタイムアウト
2. **DB接続長時間占有** - 処理中に他のリクエストがブロックされる
3. **クライアント待機時間** - UIがフリーズする

これらを解決するため、非同期ジョブ処理パターンを導入しました。

## アーキテクチャ

```
クライアント          API Server           Background Worker
    |                     |                        |
    |--POST upload-async->|                        |
    |<--202 {job_id}------|                        |
    |                     |----queue_task-------->|
    |                     |                        |--process
    |--GET /jobs/:id----->|                        |
    |<--{progress: 30%}---|                        |
    |                     |                        |
    |--GET /jobs/:id----->|                        |
    |<--{completed}-------|                        |
```

## コンポーネント

### バックエンド

#### 1. ジョブ管理（JobManager）

**ファイル:** `backend/services/job_manager.py`

- **InMemoryJobManager** - 開発/プロトタイプ用
  - メモリ上でジョブ状態を管理
  - サーバー再起動で消失
  - 単一インスタンスのみ

将来的には Redis 版や Database 版に移行可能です。

#### 2. バックグラウンドワーカー

**ファイル:** `backend/services/background_worker.py`

- タスクの非同期実行
- 進捗報告
- エラーハンドリング

#### 3. アップロードタスク

**ファイル:** `backend/services/upload_tasks.py`

Phase分割のベストプラクティス：
1. ファイル保存（軽量）
2. Parquet変換（重い）
3. 完了

#### 4. APIエンドポイント

**ファイル:** `backend/routers/excel.py`, `backend/routers/jobs.py`

- `POST /excel/{file_key}/upload-async` - 非同期アップロード（HTTP 202）
- `GET /jobs/{job_id}` - ジョブ状態取得（ポーリング用）
- `DELETE /jobs/{job_id}` - ジョブキャンセル
- `GET /jobs` - ジョブ一覧

### フロントエンド

#### 1. JobClient

**ファイル:** `frontend/app/api/jobClient.ts`

APIクライアント実装：
- `uploadFileAsync()` - ファイルアップロード
- `getJobStatus()` - ジョブ状態取得
- `pollUntilComplete()` - 完了までポーリング

#### 2. useJobUpload Hook

**ファイル:** `frontend/app/hooks/useJobUpload.ts`

React Hook：
- アップロード状態管理
- 進捗表示
- エラーハンドリング

#### 3. 統合（page.tsx）

`handleFileAsync` 関数で非同期アップロードを実行：
- ローカルプレビュー（即座に表示）
- 非同期アップロード開始
- ポーリング（2秒間隔）
- 完了時にデータ再読み込み

## 使用方法

### 開発環境でのテスト

#### 1. バックエンドの起動

```bash
cd backend
uvicorn backend.app:app --reload --port 8000
```

#### 2. フロントエンドの起動

```bash
cd frontend
npm run dev
```

#### 3. ファイルアップロードのテスト

1. ブラウザで `http://localhost:3000` を開く
2. ファイルをアップロード
3. 以下を確認：
   - HTTP 202 Acceptedが返される
   - 進捗メッセージが表示される
   - 2秒間隔でポーリングが実行される
   - 完了時にデータが表示される

#### 4. ジョブ状態の確認（API直接）

```bash
# ジョブ一覧
curl http://localhost:8000/jobs

# 特定ジョブの状態
curl http://localhost:8000/jobs/{job_id}
```

### ユニットテスト

```bash
cd backend
pytest tests/test_jobs.py -v
```

## APIリファレンス

### POST /excel/{file_key}/upload-async

非同期ファイルアップロード

**リクエスト:**
- `file_key`: ファイルキー（schedule_input等）
- `file`: アップロードファイル（multipart/form-data）

**レスポンス (HTTP 202 Accepted):**
```json
{
  "job_id": "uuid-string",
  "status": "pending",
  "message": "処理を開始しました..."
}
```

### GET /jobs/{job_id}

ジョブ状態取得（ポーリング用）

**レスポンス:**
```json
{
  "job_id": "uuid-string",
  "status": "processing",
  "progress": {
    "total": 3,
    "processed": 2,
    "percent": 66,
    "duration": 5.2
  },
  "result": null,
  "error": null
}
```

**ステータス:**
- `pending` - キューに入った
- `processing` - 実行中
- `completed` - 成功
- `failed` - 失敗
- `cancelled` - キャンセル

### GET /jobs

ジョブ一覧取得

**クエリパラメータ:**
- `status` (optional) - フィルタリング用ステータス
- `limit` (optional, default: 100) - 取得件数

## ベストプラクティス

### ポーリング間隔

- **推奨:** 2-5秒
- **短すぎる（<1秒）:** サーバー負荷増加
- **長すぎる（>10秒）:** UX劣化

### エラーハンドリング

```typescript
try {
  await jobClient.uploadFileAsync(file, fileKey)
} catch (error) {
  // エラー処理
  console.error('Upload failed:', error)
}
```

### 進捗表示

```typescript
await jobClient.pollUntilComplete(jobId, (status) => {
  console.log(`Progress: ${status.progress.percent}%`)
  // UIを更新
})
```

## パフォーマンス

### Before（同期処理）

- 7000行のCSVファイル: 約30-180秒
- DB占有時間: 処理全体
- タイムアウトリスク: 高

### After（非同期処理）

- HTTP応答時間: <1秒（202 Accepted）
- バックグラウンド処理: 30-180秒
- DB占有時間: 必要な部分のみ
- タイムアウトリスク: なし

## トラブルシューティング

### ジョブが永遠にPENDINGのまま

- BackgroundWorkerが正しく起動しているか確認
- ログを確認（`print`文やログ出力）

### ポーリングが動作しない

- CORS設定を確認
- ネットワークタブでリクエストを確認
- ジョブIDが正しいか確認

### メモリリーク

- 古いジョブを定期的に削除する
- `job_manager.cleanup_old_jobs(hours=24)` を実行

## 今後の拡張

### Phase 4: その他処理の非同期化

1. **残業時間集計** - `/excel/punches/overtime`
2. **Excel生成** - `/excel/processed/excel`
3. **エクスポート処理** - `/export/all`

### Redis版JobManagerへの移行

本番環境では、Redis版の実装を推奨します：

**メリット:**
- 永続化（サーバー再起動OK）
- 複数インスタンス対応
- 高速（インメモリDB）

**実装例（将来）:**
```python
from backend.services.job_manager import RedisJobManager

job_manager = RedisJobManager(redis_url="redis://localhost:6379")
```

## 参考資料

- [非同期ジョブ処理パターン - ナレッジリファレンス](ナレッジリファレンス.md)
- [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Celery Documentation](https://docs.celeryq.dev/)

## ライセンスとクレジット

このシステムは、公開された非同期ジョブ処理パターンのリファレンスに基づいて実装されています。
