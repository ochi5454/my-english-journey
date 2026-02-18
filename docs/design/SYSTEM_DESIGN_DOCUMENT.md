# RAGTesting システム設計書

**作成日**: 2026-02-03
**バージョン**: 1.0
**目的**: 勤怠管理・残業時間追跡システムの改善計画

---

## 機能チェックリスト

### ✅ 実装済み機能

| カテゴリ | 機能 | 説明 |
|---------|------|------|
| 認証 | Microsoft Entra ID OAuth2 | Azure AD連携ログイン |
| 認証 | 管理者ログイン | メール/パスワード認証 |
| 認証 | セッション暗号化 | AES-256-GCM |
| 認証 | パスワードハッシュ | PBKDF2 (100k iterations) |
| 認証 | HTTPOnly Cookie | XSS対策 |
| 認証 | APIキー認証 | スコープ・有効期限対応 |
| 認証 | 監査ログ | ログイン/操作記録 |
| 認証 | レート制限 | slowapi実装 |
| アップロード | Excel (.xlsx) アップロード | 基本機能 |
| アップロード | CSV アップロード | UTF-8-sig対応 |
| アップロード | ドラッグ&ドロップ | UIインタラクション |
| アップロード | 非同期ジョブ処理 | バックグラウンド処理 |
| アップロード | 進捗表示 | リアルタイム更新 |
| アップロード | ETA表示 | 完了予測時間 |
| アップロード | Parquet変換 | 効率的なストレージ |
| 集計 | 残業時間計算 | 基本集計 |
| 集計 | 従業員別集計 | グループ化 |
| 集計 | 部署別集計 | org6グループ化 |
| 集計 | Web Worker処理 | UIブロッキング回避 |
| 集計 | データキャッシュ | localStorage保存 |
| 集計 | 月次/週次サマリー | summary_service実装 |
| 集計 | 36協定アラート | 4段階閾値警告 |
| 表示 | テーブル表示 | 基本グリッド |
| 表示 | 仮想スクロール | 大量行対応 |
| 表示 | 全文検索 | 従業員名等 |
| 表示 | ページネーション | 25行/ページ |
| 表示 | 色分け凡例 | 残業時間レベル |
| 表示 | カラムソート | クリックでasc/desc切替 |
| 表示 | カラムフィルター | カラム別絞込UI |
| 表示 | 行選択 | チェックボックス選択 |
| エクスポート | Excel出力 | org6別ファイル |
| エクスポート | CSV出力 | カーソルページネーション |
| エクスポート | JSON出力 | API連携用 |
| エクスポート | ZIP出力 | 複数ファイル |
| エクスポート | 色分けフォーマット | 残業時間レベル |
| エクスポート | PDFエクスポート | reportlab使用 |
| エクスポート | メール添付送信 | PDF添付対応 |
| 通知 | Toast通知 | 成功/エラー表示 |
| 通知 | メール送信基盤 | SMTP設定済み |
| 基盤 | SQLite DB | 基本データストア |
| 基盤 | PostgreSQL対応 | コネクションプール |
| 基盤 | Redis連携 | ジョブ永続化 |
| 基盤 | FastAPI | REST API |
| 基盤 | Next.js 14 | フロントエンド |
| 基盤 | Docker対応 | コンテナ化 |
| 基盤 | Alembicマイグレーション | DBスキーマ管理 |
| 基盤 | 構造化ログ | structlog実装 |
| テスト | ジョブテスト | 基本的なテスト |
| テスト | 残業計算テスト | 一部カバー |
| テスト | セキュリティテスト | OWASP Top 10対応 |
| テスト | E2Eテスト | Playwright設定済み |
| テスト | フロントエンドテスト | Jest + Testing Library |
| ドキュメント | README | 基本セットアップ |
| ドキュメント | 非同期ジョブ設計書 | 実装詳細 |
| ドキュメント | アーキテクチャ参照 | 概念レベル |

---

## UI/機能整合性チェックリスト（2026-02-16 調査）

以下は、指示された設計と実装の整合性を調査した結果発見された問題点です。

### 🔴 優先度高（即時対応推奨）

| 状態 | カテゴリ | 問題 | 対象ファイル | 詳細 |
|:---:|---------|------|-------------|------|
| ✅ | UIテーマ | 旧テーマ使用 | `frontend/app/templates/page.tsx` | Glassmorphism適用完了 (2026-02-16) |
| ✅ | UIテーマ | 旧テーマ使用 | `frontend/app/history/page.tsx` | Glassmorphism適用完了 (2026-02-16) |
| ✅ | ページ未作成 | 予約編集ページ不在 | `frontend/app/scheduled/[id]/edit/page.tsx` | 新規作成完了 (2026-02-16) |

### 🟡 優先度中（機能不完全）

| 状態 | カテゴリ | 問題 | 対象ファイル | 詳細 |
|:---:|---------|------|-------------|------|
| ✅ | UI不足 | 削除ボタン未実装 | `frontend/app/history/page.tsx` | 削除ボタンUI追加完了 (2026-02-16) |
| ✅ | API未連携 | Cc/Bcc未送信 | `frontend/app/compose/page.tsx` | Graph API Cc/Bcc対応完了 (2026-02-16) |
| ✅ | 機能不足 | 署名自動読込なし | `frontend/app/compose/page.tsx` | デフォルト署名自動読込完了 (2026-02-16) |
| ✅ | API未使用 | カテゴリ一覧 | `backend/routers/templates.py` | カテゴリフィルタUI追加完了 (2026-02-16) |
| ✅ | API未使用 | デフォルト署名取得 | `backend/routers/signatures.py` | compose画面で使用開始 (2026-02-16) |
| ❌ | フィールド未使用 | テンプレート変数 | `backend/models/template.py` | `variables`フィールドがDBにあるがフロントUIで設定・表示されない |
| ✅ | ヘッダーボタン | 作成ボタン不在 | `frontend/app/scheduled/page.tsx` | 新規作成ボタン追加完了 (2026-02-16) |

### 🟢 優先度低（改善推奨）

| 状態 | カテゴリ | 問題 | 対象ファイル | 詳細 |
|:---:|---------|------|-------------|------|
| ✅ | コード品質 | 空のdestructuring | `frontend/app/templates/page.tsx` | 不要コード削除完了 (2026-02-16) |
| ⚠️ | 一貫性 | エラーハンドリング | 複数ファイル | ページによってtry-catch有無やトースト表示方法が異なる |
| ⚠️ | UI一貫性 | ボタンスタイル | `frontend/app/signatures/page.tsx` | 「新規作成」ボタンが紫色（他ページは青/グラデーション） |

### ✅ 正常動作確認済み（ヘッダーボタン配置）

| ページ | ヘッダー右側ボタン | 状態 |
|-------|------------------|------|
| テンプレート管理 (`/templates`) | 「新規」ボタンあり | ✅ 正常 |
| 宛先リスト管理 (`/recipients`) | 「新規」ボタンあり | ✅ 正常 |
| 署名管理 (`/signatures`) | 「新規作成」ボタンあり | ✅ 正常 |
| メール作成 (`/compose`) | 該当なし（作成ページ自体） | ✅ 正常 |
| 送信履歴 (`/history`) | 該当なし（履歴閲覧のみ） | ✅ 正常 |
| 予約一覧 (`/scheduled`) | 「更新」+「新規」ボタンあり | ✅ 正常 |

---

## 修正実施記録

### Phase 5: UI/機能整合性修正（2026-02-16〜）

| 状態 | 対応内容 | 完了日 |
|:---:|---------|-------|
| ✅ | templates/page.tsx Glassmorphismテーマ適用 | 2026-02-16 |
| ✅ | history/page.tsx Glassmorphismテーマ適用 | 2026-02-16 |
| ✅ | scheduled/[id]/edit/page.tsx 新規作成 | 2026-02-16 |
| ✅ | history/page.tsx 削除ボタンUI追加 | 2026-02-16 |
| ✅ | compose/page.tsx Cc/Bcc API連携修正 | 2026-02-16 |
| ✅ | compose/page.tsx デフォルト署名自動読込 | 2026-02-16 |
| ✅ | scheduled/page.tsx ヘッダーに新規作成ボタン追加 | 2026-02-16 |
| ✅ | templates/page.tsx カテゴリ選択UI追加 | 2026-02-16 |

**Phase 5 進捗: 8/8 完了 ✅**

---

### ✅ Phase 1: 緊急対応（1-2週間）【完了】

| 状態 | カテゴリ | 機能 | 説明 | 優先度 |
|:---:|---------|------|------|:---:|
| ✅ | 認証 | CORS設定 | 環境変数化完了 (`CORS_ORIGINS`) | 高 |
| ✅ | 認証 | レート制限 | slowapi実装完了 | 高 |
| ✅ | アップロード | ファイルサイズ検証 | 200MB制限、事前チェック追加 | 高 |
| ✅ | アップロード | ヘッダー検証 | 日本語エラーメッセージ追加 | 高 |
| ✅ | アップロード | アップロードキャンセル | DELETE /jobs/{job_id} 実装完了 | 高 |
| ✅ | 通知 | エラーメッセージ | 日本語メッセージ統一 | 高 |
| ✅ | 基盤 | エラーハンドリング | exceptions.py作成、統一完了 | 高 |
| ✅ | ドキュメント | APIドキュメント | /api/docs で確認可能 | 高 |
| ✅ | ドキュメント | 環境変数リファレンス | ENV_REFERENCE.md作成完了 | 高 |

**Phase 1 進捗: 9/9 完了 ✅**

---

### ✅ Phase 2: 安定性向上（2-4週間）【完了】

| 状態 | カテゴリ | 機能 | 説明 | 優先度 |
|:---:|---------|------|------|:---:|
| ✅ | 認証 | 監査ログ | audit.py実装、ログイン/ファイル操作/エクスポート記録 | 中 |
| ✅ | アップロード | エンコーディング自動検出 | encoding.py実装、UTF-8/Shift-JIS/CP932/EUC-JP対応 | 中 |
| ✅ | 集計 | 大量データ処理 | data_processing.py実装、ベクトル化処理・ページネーション | 高 |
| ✅ | 表示 | 検索パフォーマンス | カラムフィルター・ソート機能追加、クライアントサイド最適化 | 中 |
| ✅ | エクスポート | 大量データエクスポート | StreamingExporter実装、/stream-csvエンドポイント | 高 |
| ✅ | 基盤 | ジョブ永続化 | job_manager_redis.py実装、Redis対応 | 高 |
| ✅ | 基盤 | ログ出力 | logging.py実装、structlogで構造化ログ | 中 |
| ✅ | 基盤 | Redis連携 | RedisJobManager実装、設定追加 | 高 |
| ✅ | 基盤 | DBマイグレーション | Alembic設定完了、001_initial.py, 002_add_audit_logs.py | 高 |
| ✅ | 基盤 | ヘルスチェック | /health エンドポイント実装済み | 中 |
| ✅ | テスト | テストカバレッジ | 認証・API・フロントエンド・E2Eテスト追加 | 高 |
| ✅ | テスト | 認証テスト | test_auth.py作成 | 高 |
| ✅ | テスト | APIエンドポイントテスト | test_api.py作成 | 高 |
| ✅ | テスト | フロントエンドテスト | Jest + Testing Library設定、コンポーネントテスト | 高 |
| ✅ | テスト | セキュリティテスト | test_security.py作成、OWASP Top 10対応テスト | 高 |
| ✅ | ドキュメント | データベーススキーマ | DATABASE_SCHEMA.md作成完了 | 中 |

**Phase 2 進捗: 16/16 完了 ✅**

---

### ✅ Phase 3: UX向上（4-6週間）【完了】

| 状態 | カテゴリ | 機能 | 説明 | 優先度 |
|:---:|---------|------|------|:---:|
| ✅ | 認証 | APIキー認証 | api_key.py実装、スコープ・有効期限対応 | 中 |
| ✅ | アップロード | 重複ファイル検出 | file_hash.py実装、SHA-256ハッシュ比較 | 中 |
| ✅ | アップロード | ファイル履歴管理 | /datasets/history/{file_key}エンドポイント | 中 |
| ✅ | 集計 | 月次/週次サマリー | summary_service.py、/summary/*ページ実装 | 高 |
| ✅ | 集計 | 36協定アラート | overtime_alert.py実装、4段階閾値 | 高 |
| ✅ | 表示 | カラムソート | SheetTableにsortable機能追加、クリックでソート | 高 |
| ✅ | 表示 | カラムフィルター | SheetTableにfilterable機能追加、カラム別絞込 | 高 |
| ✅ | 表示 | 行選択 | SheetTableにselectable機能追加、チェックボックス選択 | 中 |
| ✅ | エクスポート | PDFエクスポート | pdf_export.py実装、/export/pdf/*エンドポイント | 中 |
| ✅ | エクスポート | メール添付送信 | mail_service.py拡張、PDF添付送信対応 | 中 |
| ✅ | 通知 | 残業アラート | /notifications/overtime-alertsエンドポイント | 高 |
| ✅ | テスト | E2Eテスト | Playwright設定、login/uploadテスト | 中 |
| ✅ | ドキュメント | デプロイメントガイド | DEPLOYMENT_GUIDE.md作成完了 | 中 |
| ✅ | ドキュメント | トラブルシューティング | TROUBLESHOOTING.md作成完了 | 中 |
| ✅ | ドキュメント | ユーザーマニュアル | USER_MANUAL.md作成完了 | 高 |

**Phase 3 進捗: 15/15 完了 ✅**

---

### ✅ Phase 4: スケーラビリティ（6-8週間）【完了】

| 状態 | カテゴリ | 機能 | 説明 | 優先度 |
|:---:|---------|------|------|:---:|
| ❌ | 認証 | 2要素認証 | 将来実装予定 | 低 |
| ❌ | アップロード | 複数ファイル同時アップロード | 将来実装予定 | 低 |
| ✅ | 集計 | 大量データ処理 | data_processing.py実装、ベクトル化処理 | 高 |
| ✅ | 集計 | 月次/週次サマリー | summary_service.py、/summary/*ページ、フロントエンドUI | 高 |
| ✅ | 集計 | 傾向分析 | /summary/trendエンドポイント、グラフ表示UI | 中 |
| ❌ | 集計 | 予測機能 | 将来実装予定 | 低 |
| ❌ | 集計 | カスタム計算式 | 将来実装予定 | 低 |
| ✅ | 表示 | 検索パフォーマンス | DataFilterOptimizer実装、フロントエンドフィルター最適化 | 中 |
| ✅ | 表示 | カラムソート | SheetTableにsortable実装、クリックでasc/desc切替 | 高 |
| ✅ | 表示 | カラムフィルター | SheetTableにfilterable実装、カラム別絞込UI | 高 |
| ✅ | 表示 | 行選択 | SheetTableにselectable実装、チェックボックス選択UI | 中 |
| ❌ | 表示 | カラム表示/非表示 | 将来実装予定 | 低 |
| ❌ | 表示 | ビュー保存 | 将来実装予定 | 低 |
| ✅ | エクスポート | 大量データエクスポート | StreamingExporter実装、/{file_key}/stream-csv | 高 |
| ✅ | エクスポート | PDFエクスポート | pdf_export.py実装、/export/pdf/*エンドポイント | 中 |
| ✅ | エクスポート | メール添付送信 | mail_service.py拡張、PDF添付送信対応 | 中 |
| ❌ | エクスポート | スケジュールエクスポート | 将来実装予定 | 中 |
| ❌ | エクスポート | テンプレートカスタマイズ | 将来実装予定 | 低 |
| ❌ | 通知 | Slack/Teams連携 | 将来実装予定 | 中 |
| ❌ | 通知 | プッシュ通知 | 将来実装予定 | 低 |
| ❌ | 通知 | 通知設定 | 将来実装予定 | 中 |
| ✅ | 基盤 | ジョブ永続化 | job_manager_redis.py実装 | 高 |
| ✅ | 基盤 | Redis連携 | RedisJobManager実装、設定追加 | 高 |
| ✅ | 基盤 | PostgreSQL対応 | database.py更新、コネクションプール | 高 |
| ❌ | 基盤 | メトリクス収集 | 将来実装予定 | 低 |
| ❌ | 基盤 | 分散トレーシング | 将来実装予定 | 低 |
| ✅ | テスト | フロントエンドテスト | Jest + Testing Library設定、3テストファイル | 高 |
| ✅ | テスト | セキュリティテスト | test_security.py作成、OWASP Top 10対応テスト | 高 |
| ✅ | テスト | E2Eテスト | Playwright設定、2テストファイル | 中 |
| ❌ | テスト | 負荷テスト | 将来実装予定 | 中 |

**Phase 4 進捗: 18/30 完了 ✅**（高優先度項目すべて完了、フロントエンドUI統合済み）

---

## 凡例

- ✅ **実装済み**: 機能が完全に動作している
- ⚠️ **要改善**: 実装済みだが問題がある
- ❌ **未実装**: 機能が存在しない

---

## 改善計画

### Phase 1: 緊急対応（1-2週間）

#### 1.1 エラーハンドリングの統一

**現状の問題**:
- バックエンドで`Exception`を広くキャッチし、内部エラーをそのままクライアントに返している
- フロントエンドでエラーメッセージがユーザーに不親切

**改善案**:

```python
# backend/core/exceptions.py (新規作成)
from enum import Enum
from fastapi import HTTPException

class ErrorCode(Enum):
    INVALID_FILE_FORMAT = "E001"
    FILE_TOO_LARGE = "E002"
    HEADER_MISMATCH = "E003"
    PROCESSING_FAILED = "E004"
    UNAUTHORIZED = "E005"
    NOT_FOUND = "E006"
    RATE_LIMITED = "E007"

class AppException(HTTPException):
    def __init__(self, code: ErrorCode, detail_ja: str, detail_en: str = None):
        self.code = code
        self.detail_ja = detail_ja
        super().__init__(
            status_code=self._get_status_code(code),
            detail={
                "code": code.value,
                "message": detail_ja,
                "message_en": detail_en or detail_ja
            }
        )
```

```typescript
// frontend/app/utils/errorHandler.ts (新規作成)
export const ERROR_MESSAGES: Record<string, string> = {
  E001: "ファイル形式が正しくありません。Excel (.xlsx) または CSV ファイルをアップロードしてください。",
  E002: "ファイルサイズが大きすぎます。200MB以下のファイルをアップロードしてください。",
  E003: "ファイルのヘッダーが期待される形式と一致しません。テンプレートを確認してください。",
  E004: "ファイルの処理中にエラーが発生しました。ファイルの内容を確認してください。",
  E005: "ログインセッションが期限切れです。再度ログインしてください。",
  E006: "指定されたデータが見つかりません。",
  E007: "リクエストが多すぎます。しばらく待ってから再試行してください。",
};
```

#### 1.2 レート制限の実装

**現状の問題**:
- アップロードエンドポイントに制限がなく、DoS攻撃に脆弱

**改善案**:

```python
# backend/core/rate_limit.py (新規作成)
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# app.py での適用
@app.post("/excel/{file_key}/upload")
@limiter.limit("10/minute")  # 1分間に10回まで
async def upload_file(...):
    ...

@app.post("/excel/{file_key}/upload-async")
@limiter.limit("20/minute")  # 1分間に20回まで
async def upload_file_async(...):
    ...
```

#### 1.3 アップロードキャンセル機能

**現状の問題**:
- UIにキャンセルボタンがあるが、機能していない

**改善案**:

```typescript
// frontend/app/api/jobClient.ts に追加
export async function cancelJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to cancel job');
  }
}

// frontend/app/hooks/useJobUpload.ts に追加
const handleCancel = useCallback(async () => {
  if (currentJobId) {
    await cancelJob(currentJobId);
    setStatus('cancelled');
    setCurrentJobId(null);
  }
}, [currentJobId]);
```

```python
# backend/services/job_manager.py に追加
async def cancel_job(self, job_id: str) -> bool:
    job = self._jobs.get(job_id)
    if job and job.status in [JobStatus.pending, JobStatus.processing]:
        job.status = JobStatus.cancelled
        job.completed_at = datetime.utcnow()
        return True
    return False
```

#### 1.4 ファイルサイズ事前検証

**現状の問題**:
- アップロード開始後にサイズエラーが発生

**改善案**:

```typescript
// frontend/app/components/UploadSection.tsx
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

const handleFileSelect = (file: File) => {
  if (file.size > MAX_FILE_SIZE) {
    setError(`ファイルサイズが大きすぎます（${formatBytes(file.size)}）。200MB以下のファイルを選択してください。`);
    return;
  }
  // 続行...
};
```

---

### Phase 2: 安定性向上（2-4週間）

#### 2.1 ジョブ永続化（Redis連携）

**現状の問題**:
- `InMemoryJobManager`はサーバー再起動でジョブ情報が消失
- 本番環境では致命的

**改善案**:

```python
# backend/services/job_manager_redis.py (新規作成)
import redis.asyncio as redis
import json
from datetime import datetime

class RedisJobManager(BaseJobManager):
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url)
        self.key_prefix = "job:"
        self.ttl = 86400 * 7  # 7日間保持

    async def create_job(self, file_key: str, filename: str, user_id: str = None) -> JobState:
        job_id = str(uuid.uuid4())
        job = JobState(
            id=job_id,
            file_key=file_key,
            filename=filename,
            status=JobStatus.pending,
            user_id=user_id,
            created_at=datetime.utcnow()
        )
        await self.redis.setex(
            f"{self.key_prefix}{job_id}",
            self.ttl,
            job.model_dump_json()
        )
        return job

    async def get_job(self, job_id: str) -> JobState | None:
        data = await self.redis.get(f"{self.key_prefix}{job_id}")
        if data:
            return JobState.model_validate_json(data)
        return None

    async def update_job(self, job_id: str, **updates) -> JobState | None:
        job = await self.get_job(job_id)
        if job:
            for key, value in updates.items():
                setattr(job, key, value)
            await self.redis.setex(
                f"{self.key_prefix}{job_id}",
                self.ttl,
                job.model_dump_json()
            )
        return job
```

#### 2.2 データベースマイグレーション (Alembic)

**現状の問題**:
- スキーマ変更が手動で、バージョン管理されていない

**改善案**:

```bash
# セットアップ
cd backend
alembic init alembic
```

```python
# alembic/env.py
from backend.core.database import Base
from backend.models import user, dataset, excel, tournament

target_metadata = Base.metadata
```

```python
# alembic/versions/001_initial.py (自動生成後)
def upgrade():
    op.create_table('users', ...)
    op.create_table('datasets', ...)
    op.create_index('ix_datasets_kind', 'datasets', ['kind'])
    op.create_index('ix_datasets_status', 'datasets', ['status'])
```

#### 2.3 テストカバレッジ向上

**目標**: カバレッジ 60% 以上

```python
# backend/tests/test_auth.py (新規作成)
import pytest
from httpx import AsyncClient
from backend.app import app

@pytest.mark.asyncio
async def test_basic_login_success():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/auth/login/basic", json={
            "email": "admin@example.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        assert "session" in response.cookies

@pytest.mark.asyncio
async def test_basic_login_invalid_credentials():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/auth/login/basic", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
```

```python
# backend/tests/test_upload.py (新規作成)
@pytest.mark.asyncio
async def test_upload_invalid_file_type():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # ログイン
        await client.post("/auth/login/basic", json={...})

        # 無効なファイルタイプ
        response = await client.post(
            "/excel/invalid_key/upload",
            files={"file": ("test.xlsx", b"content", "application/vnd.openxmlformats")}
        )
        assert response.status_code == 404
```

```typescript
// frontend/__tests__/UploadSection.test.tsx (新規作成)
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadSection } from '../app/components/UploadSection';

describe('UploadSection', () => {
  it('shows error for oversized files', async () => {
    render(<UploadSection fileKey="punches" onUploadComplete={() => {}} />);

    const file = new File(['x'.repeat(300 * 1024 * 1024)], 'large.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/ファイルサイズが大きすぎます/)).toBeInTheDocument();
  });
});
```

#### 2.4 構造化ログ

**現状の問題**:
- `print()`や`traceback.print_exc()`が散在
- 本番環境でのデバッグが困難

**改善案**:

```python
# backend/core/logging.py (新規作成)
import structlog
import logging

def setup_logging(env: str = "development"):
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer() if env == "production"
                else structlog.dev.ConsoleRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    )

logger = structlog.get_logger()

# 使用例
logger.info("file_upload_started",
    job_id=job_id,
    file_key=file_key,
    filename=filename,
    user_id=user_id
)

logger.error("file_processing_failed",
    job_id=job_id,
    error=str(exc),
    traceback=traceback.format_exc()
)
```

---

### Phase 3: ユーザー体験向上（4-6週間）

#### 3.1 36協定アラート機能

**目的**: 法定上限（月45時間、年360時間等）超過を警告

**改善案**:

```python
# backend/services/overtime_alert.py (新規作成)
from enum import Enum
from dataclasses import dataclass

class AlertLevel(Enum):
    INFO = "info"        # 15-30時間: 通常
    WARNING = "warning"  # 30-45時間: 社内上限接近
    DANGER = "danger"    # 45-60時間: 法定上限接近
    CRITICAL = "critical" # 60時間以上: 特別条項発動

@dataclass
class OvertimeAlert:
    employee_id: str
    employee_name: str
    current_hours: float
    threshold: float
    level: AlertLevel
    message: str

def check_overtime_alerts(overtime_data: list[dict]) -> list[OvertimeAlert]:
    alerts = []
    for row in overtime_data:
        hours = row.get('overtime_hours', 0)
        if hours >= 80:
            level = AlertLevel.CRITICAL
            message = f"残業時間が80時間を超えています。即座に対応が必要です。"
        elif hours >= 60:
            level = AlertLevel.CRITICAL
            message = f"特別条項の上限（60時間）を超えています。"
        elif hours >= 45:
            level = AlertLevel.DANGER
            message = f"法定残業上限（45時間）に達しています。"
        elif hours >= 30:
            level = AlertLevel.WARNING
            message = f"社内上限（30時間）に接近しています。"
        else:
            continue

        alerts.append(OvertimeAlert(
            employee_id=row['emp_no'],
            employee_name=row['name'],
            current_hours=hours,
            threshold=45 if hours < 45 else 60 if hours < 60 else 80,
            level=level,
            message=message
        ))

    return sorted(alerts, key=lambda a: a.current_hours, reverse=True)
```

```typescript
// frontend/app/components/AlertBanner.tsx (新規作成)
interface Alert {
  level: 'info' | 'warning' | 'danger' | 'critical';
  count: number;
  message: string;
}

export function AlertBanner({ alerts }: { alerts: Alert[] }) {
  const criticalCount = alerts.filter(a => a.level === 'critical').length;
  const dangerCount = alerts.filter(a => a.level === 'danger').length;

  if (criticalCount === 0 && dangerCount === 0) return null;

  return (
    <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-4">
      <div className="flex items-center">
        <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
        <div>
          <p className="font-bold text-red-700">残業時間アラート</p>
          <p className="text-red-600">
            {criticalCount > 0 && `${criticalCount}名が60時間超過、`}
            {dangerCount > 0 && `${dangerCount}名が45時間超過`}
          </p>
        </div>
      </div>
    </div>
  );
}
```

#### 3.2 カラムソート・フィルター

**現状の問題**:
- テーブルのカラムをクリックしてもソートできない

**改善案**:

```typescript
// frontend/app/components/SortableTable.tsx (新規作成)
interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export function SortableTable({ data, columns }: Props) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const sortedData = useMemo(() => {
    let result = [...data];

    // フィルター適用
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        result = result.filter(row =>
          String(row[key]).toLowerCase().includes(value.toLowerCase())
        );
      }
    });

    // ソート適用
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, sortConfig, filters]);

  return (
    <table>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key} onClick={() => handleSort(col.key)}>
              {col.label}
              {sortConfig?.key === col.key && (
                sortConfig.direction === 'asc' ? <ChevronUp /> : <ChevronDown />
              )}
            </th>
          ))}
        </tr>
        <tr>
          {columns.map(col => (
            <th key={col.key}>
              <input
                type="text"
                placeholder="フィルター..."
                value={filters[col.key] || ''}
                onChange={e => setFilters({...filters, [col.key]: e.target.value})}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedData.map((row, i) => (
          <tr key={i}>
            {columns.map(col => (
              <td key={col.key}>{row[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

#### 3.3 ユーザーマニュアル

**目的**: 操作手順を明確にし、問い合わせを減らす

```markdown
# docs/USER_MANUAL.md (新規作成)

# AI Mail ユーザーマニュアル

## 目次
1. [ログイン方法](#ログイン方法)
2. [ファイルのアップロード](#ファイルのアップロード)
3. [データの確認](#データの確認)
4. [エクスポート](#エクスポート)
5. [よくある質問](#よくある質問)

## ログイン方法

### Microsoft アカウントでログイン（推奨）
1. ログイン画面で「Microsoftでログイン」ボタンをクリック
2. 会社のMicrosoftアカウントでサインイン
3. 初回のみ、アプリへのアクセス許可を承認

### 管理者アカウントでログイン
1. メールアドレスとパスワードを入力
2. 「管理者でログイン」ボタンをクリック

## ファイルのアップロード

### 対応ファイル形式
- Excel (.xlsx)
- CSV (.csv) - UTF-8エンコーディング推奨

### アップロード手順
1. 左側のサイドバーからファイル種別を選択
   - 勤務予定入力
   - 出退社時刻
   - 日数項目
   - 日次実績
   - 勤務予定進捗一覧
   - 所属情報

2. ファイルをドラッグ&ドロップ、または「ファイルを選択」をクリック

3. アップロード進捗を確認
   - 経過時間と推定残り時間が表示されます
   - キャンセルする場合は「キャンセル」ボタンをクリック

4. 「アップロード完了」と表示されたら完了

### トラブルシューティング

| エラーメッセージ | 原因 | 対処法 |
|--------------|------|-------|
| ファイル形式が正しくありません | 非対応のファイル形式 | .xlsx または .csv 形式で保存し直す |
| ファイルサイズが大きすぎます | 200MB超過 | ファイルを分割するか、不要なデータを削除 |
| ヘッダーが一致しません | 列名が異なる | テンプレートファイルの列名を確認 |

## データの確認

### 検索機能
- **従業員名検索**: 氏名の一部を入力
- **従業員番号検索**: 完全一致
- **部署検索**: 所属名称6で絞り込み
- **日付範囲**: 特定期間のデータを抽出

### 色分けの意味
| 色 | 残業時間 | 意味 |
|---|---------|-----|
| 🔵 青 | 15-20時間 | 通常 |
| 🟢 緑 | 20-30時間 | 社内基準内 |
| 🟡 黄 | 30-45時間 | 社内上限接近 |
| 🟠 オレンジ | 45-60時間 | 法定上限超過 |
| 🔴 赤 | 60-80時間 | 特別条項上限 |
| ⚫ 濃茶 | 80時間以上 | 要即時対応 |

## エクスポート

### Excel出力
1. 「Excelダウンロード」ボタンをクリック
2. 所属名称6ごとに別ファイルが生成されます
3. ブラウザのダウンロードフォルダを確認

### 出力ファイルの内容
- **時間外労働_エクスポート_[部署名]_[日時].xlsx**
  - シート1: データ一覧（色分け付き）
  - シート2: 残業時間詳細

## よくある質問

**Q: アップロードに時間がかかります**
A: ファイルサイズや行数によって処理時間が異なります。7000行程度で30秒〜3分程度かかることがあります。

**Q: 前回アップロードしたデータが消えました**
A: ブラウザのキャッシュをクリアすると、一時保存されたデータが削除されます。必要なデータはエクスポートして保存してください。

**Q: 特定の従業員だけエクスポートできますか？**
A: 検索機能で絞り込んだ状態でエクスポートすると、表示中のデータのみが出力されます。
```

---

### Phase 4: スケーラビリティ（6-8週間）

#### 4.1 PostgreSQL対応

**目的**: 本番環境での同時接続・大量データ対応

```python
# backend/core/config.py の修正
class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/app.db"

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

# backend/core/database.py の修正
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

if settings.is_postgres:
    engine = create_async_engine(
        settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
        pool_size=20,
        max_overflow=10,
        pool_timeout=30,
    )
else:
    engine = create_async_engine(
        settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///"),
        connect_args={"check_same_thread": False}
    )
```

#### 4.2 WebSocket リアルタイム更新

**目的**: ポーリングからWebSocketへ移行し、効率化

```python
# backend/routers/websocket.py (新規作成)
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.active_connections:
            self.active_connections[job_id] = set()
        self.active_connections[job_id].add(websocket)

    def disconnect(self, websocket: WebSocket, job_id: str):
        self.active_connections[job_id].discard(websocket)

    async def broadcast_job_update(self, job_id: str, data: dict):
        if job_id in self.active_connections:
            for connection in self.active_connections[job_id]:
                await connection.send_json(data)

manager = ConnectionManager()

@router.websocket("/ws/jobs/{job_id}")
async def websocket_job_status(websocket: WebSocket, job_id: str):
    await manager.connect(websocket, job_id)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket, job_id)
```

```typescript
// frontend/app/hooks/useJobWebSocket.ts (新規作成)
export function useJobWebSocket(jobId: string | null) {
  const [status, setStatus] = useState<JobStatus | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const ws = new WebSocket(`${WS_BASE}/ws/jobs/${jobId}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data);
    };

    ws.onerror = () => {
      // フォールバック: ポーリングに切り替え
      startPolling(jobId);
    };

    return () => ws.close();
  }, [jobId]);

  return status;
}
```

#### 4.3 分散ジョブキュー (Celery)

**目的**: 複数ワーカーでの並列処理

```python
# backend/celery_app.py (新規作成)
from celery import Celery

celery_app = Celery(
    "ragtesting",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Tokyo",
    task_track_started=True,
    task_time_limit=600,  # 10分
)

@celery_app.task(bind=True)
def process_file_task(self, job_id: str, file_path: str, file_key: str):
    # 進捗更新
    self.update_state(state='PROGRESS', meta={'progress': 10})

    # ファイル処理
    ...

    self.update_state(state='PROGRESS', meta={'progress': 50})

    # Parquet変換
    ...

    return {"status": "completed", "row_count": row_count}
```

---

## アーキテクチャ図

### 現状のアーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js 14    │────▶│    FastAPI      │────▶│    SQLite       │
│   (Frontend)    │◀────│   (Backend)     │◀────│   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │  InMemory Jobs  │
        │               │   (Lost on     │
        │               │    restart)     │
        │               └─────────────────┘
        │
        ▼
┌─────────────────┐
│   localStorage  │
│   (Cache)       │
└─────────────────┘
```

### 改善後のアーキテクチャ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js 14    │────▶│    FastAPI      │────▶│  PostgreSQL     │
│   (Frontend)    │◀────│   (Backend)     │◀────│   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       │                       │
        ▼                       ▼                       │
┌─────────────────┐     ┌─────────────────┐            │
│   WebSocket     │◀────│     Redis       │◀───────────┘
│   (Real-time)   │     │  (Jobs/Cache)   │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │    Celery       │
                        │   (Workers)     │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   S3 / Blob     │
                        │   (Storage)     │
                        └─────────────────┘
```

---

## 実装スケジュール

| Phase | 期間 | 主要タスク | 担当 |
|-------|------|----------|------|
| **Phase 1** | Week 1-2 | エラーハンドリング統一、レート制限、キャンセル機能 | Backend |
| **Phase 2** | Week 3-4 | Redis連携、Alembic設定、テスト拡充 | Backend/DevOps |
| **Phase 3** | Week 5-6 | 36協定アラート、ソート/フィルター、マニュアル | Frontend/Docs |
| **Phase 4** | Week 7-8 | PostgreSQL対応、WebSocket、Celery | DevOps/Backend |

---

## 成功指標 (KPI)

| 指標 | 現状 | 目標 |
|------|------|------|
| テストカバレッジ | ~10% | 60%以上 |
| エラー発生率 | 不明 | 1%以下 |
| アップロード成功率 | 不明 | 99%以上 |
| 平均処理時間 (7000行) | 30-180秒 | 30秒以下 |
| ユーザー問い合わせ数 | 不明 | 50%削減 |
| システム稼働率 | 不明 | 99.5%以上 |

---

## リスクと軽減策

| リスク | 影響度 | 発生確率 | 軽減策 |
|-------|--------|---------|-------|
| DBマイグレーション失敗 | 高 | 中 | ステージング環境での事前検証、ロールバック手順整備 |
| Redis障害 | 高 | 低 | フォールバック（InMemory）実装、レプリケーション |
| 大量データによるメモリ不足 | 中 | 中 | ストリーミング処理、チャンク分割 |
| OAuth認証障害 | 高 | 低 | 管理者ログインのフォールバック維持 |
| 本番環境での予期せぬエラー | 高 | 中 | 構造化ログ、アラート設定、エラー追跡ツール導入 |

---

## 次のアクション

### ✅ 完了済み

1. **Phase 1: 緊急対応**（完了）
   - [x] CORS設定を環境変数化
   - [x] OpenAPIドキュメント有効化
   - [x] エラーメッセージの日本語化
   - [x] レート制限実装
   - [x] アップロードキャンセル機能

2. **Phase 2: 安定性向上**（完了）
   - [x] 監査ログ実装
   - [x] エンコーディング自動検出
   - [x] 構造化ログ（structlog）
   - [x] DBマイグレーション（Alembic）
   - [x] ヘルスチェックエンドポイント
   - [x] 認証・APIテスト

3. **Phase 3: UX向上**（完了）
   - [x] APIキー認証
   - [x] 重複ファイル検出
   - [x] ファイル履歴管理
   - [x] 36協定アラート
   - [x] 残業アラート通知
   - [x] ユーザーマニュアル
   - [x] デプロイメントガイド
   - [x] トラブルシューティング

4. **Phase 4: スケーラビリティ**（完了 - 18/30項目実装）
   - [x] 大量データ処理の最適化（チャンク処理、ベクトル化演算）
   - [x] カラムソート・フィルター機能
   - [x] ストリーミングCSVエクスポート
   - [x] Redis連携・ジョブ永続化
   - [x] PostgreSQL対応（コネクションプーリング）
   - [x] 月次/週次サマリー機能
   - [x] フロントエンドテスト（Jest + Testing Library）
   - [x] E2Eテスト（Playwright）
   - [x] 行選択機能（SheetTable selectable）
   - [x] PDFエクスポート（pdf_export.py）
   - [x] メール添付送信（mail_service.py拡張）
   - [x] セキュリティテスト（OWASP Top 10対応）

### 🔵 今後の拡張（将来実装予定）

1. **認証・セキュリティ強化**
   - [ ] 2要素認証
   - [x] セキュリティテスト（test_security.py実装済み）
   - [ ] 負荷テスト

2. **UI/UX改善**
   - [x] 行選択機能（SheetTable selectable実装済み）
   - [ ] カラム表示/非表示
   - [ ] ビュー保存
   - [ ] 予測機能
   - [ ] カスタム計算式

3. **エクスポート拡張**
   - [x] PDFエクスポート（pdf_export.py実装済み）
   - [x] メール添付送信（mail_service.py拡張済み）
   - [ ] スケジュールエクスポート
   - [ ] テンプレートカスタマイズ

4. **通知・連携**
   - [ ] Slack/Teams連携
   - [ ] プッシュ通知
   - [ ] 通知設定カスタマイズ

5. **運用・監視**
   - [ ] メトリクス収集（Prometheus）
   - [ ] 分散トレーシング

---

**作成者**: Claude Code
**最終更新**: 2026-02-16（Phase 5: 全8件完了）
