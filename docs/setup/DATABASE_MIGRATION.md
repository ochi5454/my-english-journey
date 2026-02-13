# データベースマイグレーションガイド

このドキュメントでは、SQLite から PostgreSQL への移行手順を説明します。

---

## 概要

現在のシステムは SQLite（`data/app.db`）を使用していますが、Docker 環境および本番環境では PostgreSQL を使用します。

| 環境 | データベース | 接続先 |
|------|-------------|--------|
| ローカル開発（現在） | SQLite | `data/app.db` |
| Docker 開発 | PostgreSQL | `localhost:5432` |
| Azure 本番 | PostgreSQL | コンテナ内または Azure Database |

---

## 前提条件

- Docker Desktop がインストール済み
- Python 3.11+ がインストール済み
- `psycopg2-binary` がインストール済み

```bash
pip install psycopg2-binary
```

---

## 移行手順

### ステップ 1: PostgreSQL コンテナを起動

```bash
docker-compose up postgres -d
```

コンテナが正常に起動したか確認：

```bash
docker-compose ps
```

### ステップ 2: マイグレーションスクリプトを実行

```bash
python scripts/migrate_sqlite_to_postgres.py
```

出力例：

```
============================================================
SQLite to PostgreSQL Migration
============================================================
Source: sqlite:///data/app.db
Target: postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db

Connecting to databases...

Migrating tables...
  Migrating users...
    Migrated 5/5 rows
  Migrating email_templates...
    Migrated 10/10 rows
  ...

  Resetting sequences...
    Reset users_id_seq to 5
    ...

============================================================
Migration complete! Total rows migrated: 150
============================================================
```

### ステップ 3: backend/.env を更新

```bash
# SQLite（旧）
# DATABASE_URL=sqlite:///./data/app.db

# PostgreSQL（新）
DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db
```

### ステップ 4: バックエンドを再起動

```bash
uvicorn backend.app:app --reload
```

### ステップ 5: 動作確認

1. http://localhost:8000/docs にアクセス
2. API が正常に動作することを確認
3. データが正しく移行されていることを確認

---

## TablePlus での接続

PostgreSQL に直接接続してデータを確認できます。

| 設定 | 値 |
|-----|-----|
| Host | `localhost` |
| Port | `5432` |
| User | `mailagent_user` |
| Password | `mailagent_password` |
| Database | `mailagent_db` |

---

## 移行されるテーブル

以下のテーブルが SQLite から PostgreSQL に移行されます：

| テーブル | 説明 |
|---------|------|
| `users` | ユーザー情報 |
| `token_store` | Entra ID トークン |
| `email_templates` | メールテンプレート |
| `signatures` | メール署名 |
| `recipient_lists` | 宛先リスト |
| `recipient_list_members` | 宛先リストメンバー |
| `mail_send_logs` | メール送信履歴 |
| `scheduled_mails` | 予約送信メール |
| `temp_attachments` | 一時添付ファイル |
| `organizations` | 組織マスタ |
| `employee_assignments` | 従業員所属情報 |
| `entra_sync_logs` | Entra 同期ログ |
| `employee_transfer_history` | 異動履歴 |

---

## トラブルシューティング

### エラー: "connection refused"

PostgreSQL コンテナが起動していない可能性があります：

```bash
# コンテナの状態を確認
docker-compose ps

# コンテナを再起動
docker-compose restart postgres
```

### エラー: "database does not exist"

初期化スクリプトが実行されていない可能性があります：

```bash
# ボリュームを削除して再作成
docker-compose down -v
docker-compose up postgres -d
```

### エラー: "relation does not exist"

PostgreSQL のスキーマが作成されていない可能性があります。初期化SQLを手動で実行：

```bash
docker exec -i mailagent_postgres psql -U mailagent_user -d mailagent_db < docker/init-db/01-schema.sql
```

### 移行後にデータが見つからない

SQLite にデータが存在するか確認：

```bash
sqlite3 data/app.db "SELECT COUNT(*) FROM users;"
```

---

## ロールバック（SQLite に戻す）

PostgreSQL への移行後、問題があれば SQLite に戻せます：

1. `backend/.env` を編集：
   ```bash
   DATABASE_URL=sqlite:///./data/app.db
   ```

2. バックエンドを再起動：
   ```bash
   uvicorn backend.app:app --reload
   ```

---

## 関連ドキュメント

- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - ローカル開発ガイド
- [DOCKER_ARCHITECTURE.md](DOCKER_ARCHITECTURE.md) - Docker アーキテクチャ
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) - 環境変数ガイド

---

**最終更新日**: 2026-02-13
