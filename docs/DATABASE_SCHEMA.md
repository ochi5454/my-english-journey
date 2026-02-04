# データベーススキーマドキュメント

本ドキュメントでは、RAGTestingシステムのデータベーススキーマについて説明します。

---

## 概要

- **データベース**: SQLite（開発）/ PostgreSQL（本番推奨）
- **ORM**: SQLAlchemy 2.x
- **マイグレーション**: Alembic

---

## テーブル一覧

| テーブル名 | 説明 | 主キー |
|-----------|------|--------|
| `users` | ユーザー情報 | `id` (Integer) |
| `datasets` | アップロードされたデータセット | `id` (UUID String) |
| `excel_files` | Excelファイルメタデータ（レガシー） | `id` (Integer) |
| `excel_cells` | Excelセルデータ（レガシー） | `id` (Integer) |
| `export_cache` | エクスポートキャッシュ | `id` (Integer) |
| `audit_logs` | 監査ログ | `id` (Integer) |

---

## テーブル詳細

### users（ユーザー）

ログインユーザー情報を管理します。

| カラム名 | 型 | NULL | デフォルト | インデックス | 説明 |
|----------|-----|------|-----------|-------------|------|
| `id` | Integer | NO | Auto | PK | ユーザーID |
| `email` | String | NO | - | UNIQUE | メールアドレス |
| `name` | String | NO | - | - | 表示名 |
| `password_hash` | String | NO | - | - | パスワードハッシュ（PBKDF2） |
| `password_salt` | String | NO | - | - | パスワードソルト |
| `is_admin` | Boolean | NO | false | - | 管理者フラグ |
| `is_active` | Boolean | NO | true | - | アクティブフラグ |
| `created_at` | DateTime | NO | now() | - | 作成日時 |

**インデックス:**
- `ix_users_email` - emailのユニークインデックス

---

### datasets（データセット）

アップロードされたファイルの情報を管理します。Parquet形式で保存されます。

| カラム名 | 型 | NULL | デフォルト | インデックス | 説明 |
|----------|-----|------|-----------|-------------|------|
| `id` | String (UUID) | NO | uuid4() | PK | データセットID |
| `kind` | String | NO | - | YES | ファイル種別（schedule_input, punches等） |
| `stored_path` | String | NO | - | - | 保存先パス |
| `original_filename` | String | NO | - | - | 元のファイル名 |
| `content_type` | String | YES | - | - | MIMEタイプ |
| `size` | Integer | YES | - | - | ファイルサイズ（バイト） |
| `uploaded_at` | DateTime | NO | now() | - | アップロード日時 |
| `status` | Enum | NO | pending | - | 状態（pending/ready/failed） |
| `schema_json` | JSON | YES | - | - | スキーマ情報 |
| `row_count` | Integer | YES | - | - | 行数 |
| `created_at` | DateTime | NO | now() | - | 作成日時 |
| `updated_at` | DateTime | NO | now() | - | 更新日時 |

**Enum: DatasetStatus**
- `pending` - 処理中
- `ready` - 利用可能
- `failed` - 失敗

**インデックス:**
- `ix_datasets_kind` - kindのインデックス

---

### excel_files（Excelファイル）

アップロードされたExcelファイルのメタデータを管理します。

| カラム名 | 型 | NULL | デフォルト | インデックス | 説明 |
|----------|-----|------|-----------|-------------|------|
| `id` | Integer | NO | Auto | PK | ファイルID |
| `file_key` | String | NO | - | YES | ファイルキー |
| `file_name` | String | NO | - | - | ファイル名 |
| `version` | Integer | NO | 1 | - | バージョン |
| `uploaded_at` | Date | NO | today() | - | アップロード日 |

**リレーション:**
- `cells` → ExcelCell (1:N, cascade delete)

---

### excel_cells（Excelセル）

Excelファイルの各セルデータを管理します。

| カラム名 | 型 | NULL | デフォルト | インデックス | 説明 |
|----------|-----|------|-----------|-------------|------|
| `id` | Integer | NO | Auto | PK | セルID |
| `file_id` | Integer | NO | - | FK | 親ファイルID |
| `sheet_name` | String | NO | - | - | シート名 |
| `row_index` | Integer | NO | - | - | 行番号 |
| `col_index` | Integer | NO | - | - | 列番号 |
| `value` | Text | YES | - | - | セル値 |

**外部キー:**
- `file_id` → `excel_files.id`

---

### export_cache（エクスポートキャッシュ）

エクスポートデータのキャッシュを管理します。

| カラム名 | 型 | NULL | デフォルト | インデックス | 説明 |
|----------|-----|------|-----------|-------------|------|
| `id` | Integer | NO | Auto | PK | キャッシュID |
| `payload` | JSON | NO | - | - | キャッシュデータ |
| `created_at` | Date | NO | today() | - | 作成日 |

---

### audit_logs（監査ログ）

ユーザー操作の監査ログを記録します。

| カラム名 | 型 | NULL | デフォルト | インデックス | 説明 |
|----------|-----|------|-----------|-------------|------|
| `id` | Integer | NO | Auto | PK | ログID |
| `timestamp` | DateTime | NO | now() | YES | 記録日時 |
| `action` | String(50) | NO | - | YES | アクション種別 |
| `user_id` | Integer | YES | - | YES | ユーザーID |
| `user_email` | String(255) | YES | - | - | ユーザーメールアドレス |
| `ip_address` | String(45) | YES | - | - | クライアントIPアドレス |
| `user_agent` | String(500) | YES | - | - | ユーザーエージェント |
| `resource_type` | String(50) | YES | - | - | リソース種別 |
| `resource_id` | String(100) | YES | - | - | リソースID |
| `details` | Text | YES | - | - | 追加情報（JSON形式） |
| `status` | String(20) | YES | success | - | 結果ステータス |

**監査対象アクション:**
- `login_success` - ログイン成功
- `login_failed` - ログイン失敗
- `logout` - ログアウト
- `file_upload` - ファイルアップロード
- `file_download` - ファイルダウンロード
- `data_export` - データエクスポート
- `job_create` - ジョブ作成
- `job_cancel` - ジョブキャンセル

**インデックス:**
- `ix_audit_logs_timestamp` - timestampのインデックス
- `ix_audit_logs_action` - actionのインデックス
- `ix_audit_logs_user_id` - user_idのインデックス
- `ix_audit_user_action` - (user_id, action)の複合インデックス
- `ix_audit_timestamp_action` - (timestamp, action)の複合インデックス

---

## ER図

```
┌─────────────────┐
│     users       │
├─────────────────┤
│ id (PK)         │
│ email (UNIQUE)  │
│ name            │
│ password_hash   │
│ password_salt   │
│ is_admin        │
│ is_active       │
│ created_at      │
└─────────────────┘

┌─────────────────┐
│    datasets     │
├─────────────────┤
│ id (PK, UUID)   │
│ kind (INDEX)    │
│ stored_path     │
│ original_filename│
│ content_type    │
│ size            │
│ uploaded_at     │
│ status          │
│ schema_json     │
│ row_count       │
│ created_at      │
│ updated_at      │
└─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│   excel_files   │       │   excel_cells   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │──┐    │ id (PK)         │
│ file_key (INDEX)│  │    │ file_id (FK)    │──┘
│ file_name       │  └───>│ sheet_name      │
│ version         │       │ row_index       │
│ uploaded_at     │       │ col_index       │
└─────────────────┘       │ value           │
                          └─────────────────┘

┌─────────────────┐
│  export_cache   │
├─────────────────┤
│ id (PK)         │
│ payload (JSON)  │
│ created_at      │
└─────────────────┘

┌─────────────────┐
│   audit_logs    │
├─────────────────┤
│ id (PK)         │
│ timestamp (IDX) │
│ action (IDX)    │
│ user_id (IDX)   │
│ user_email      │
│ ip_address      │
│ user_agent      │
│ resource_type   │
│ resource_id     │
│ details (JSON)  │
│ status          │
└─────────────────┘
```

---

## マイグレーション

### Alembicの使用方法

```bash
# マイグレーションディレクトリに移動
cd backend

# 新しいマイグレーションを作成（自動生成）
alembic revision --autogenerate -m "説明"

# マイグレーションを適用
alembic upgrade head

# マイグレーションを1つ戻す
alembic downgrade -1

# 現在のバージョンを確認
alembic current

# マイグレーション履歴を表示
alembic history
```

### 初期マイグレーションの生成

```bash
cd backend
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

---

## パフォーマンス考慮事項

### インデックス推奨

1. **datasets.kind** - ファイル種別での検索が頻繁
2. **datasets.status** - ステータスでのフィルタリング
3. **users.email** - ログイン時の検索
4. **excel_files.file_key** - ファイル種別での検索

### 大量データ対策

- `excel_cells`テーブルは行数が多くなりやすい
- 大量データの場合はParquet形式（datasets）を推奨
- 定期的な古いデータのアーカイブ/削除を検討

---

## 将来の拡張

### PostgreSQL移行時の考慮点

1. UUID型のネイティブサポート
2. JSONB型への変更（検索性能向上）
3. インデックス戦略の見直し
4. コネクションプーリングの設定

### 追加予定のテーブル

| テーブル名 | 説明 | Phase | 状態 |
|-----------|------|-------|------|
| `audit_logs` | 監査ログ | P2 | ✅ 実装済み |
| `jobs` | ジョブ永続化 | P4 (Redis代替) | 予定 |
| `notifications` | 通知設定 | P4 | 予定 |

---

**作成日**: 2026-02-03
**更新日**: 2026-02-03
