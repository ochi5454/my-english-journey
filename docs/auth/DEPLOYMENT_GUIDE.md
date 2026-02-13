# デプロイメントガイド

本ドキュメントでは、RAGTestingシステムのデプロイ手順について説明します。

---

## 目次

1. [システム要件](#システム要件)
2. [ローカル開発環境](#ローカル開発環境)
3. [Docker環境](#docker環境)
4. [本番環境デプロイ](#本番環境デプロイ)
5. [データベースマイグレーション](#データベースマイグレーション)
6. [環境変数設定](#環境変数設定)
7. [監視とログ](#監視とログ)
8. [バックアップとリストア](#バックアップとリストア)

---

## システム要件

### バックエンド

| 項目 | 要件 |
|------|------|
| Python | 3.11以上 |
| メモリ | 最低2GB、推奨4GB |
| ディスク | 10GB以上（データ量による） |

### フロントエンド

| 項目 | 要件 |
|------|------|
| Node.js | 18.x以上 |
| npm | 9.x以上 |

### データベース

| 環境 | データベース |
|------|------------|
| 開発 | SQLite |
| 本番 | PostgreSQL 14以上（推奨） |

---

## ローカル開発環境

### 1. リポジトリのクローン

```bash
git clone https://github.com/your-org/ragtesting.git
cd ragtesting
```

### 2. Python環境のセットアップ

```bash
# 仮想環境の作成
python -m venv venv

# 仮想環境の有効化
# macOS/Linux:
source venv/bin/activate
# Windows:
.\venv\Scripts\activate

# 依存関係のインストール
pip install -r requirements.txt
```

### 3. 環境変数の設定

```bash
# .envファイルを作成
cp .env.example .env

# 必要な値を設定
# 最低限必要:
# - OPENAI_API_KEY
```

### 4. データベースの初期化

```bash
cd backend

# 初回起動時は自動的にテーブルが作成される
# または手動でマイグレーション実行:
alembic upgrade head
```

### 5. バックエンドの起動

```bash
cd backend
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 6. フロントエンドのセットアップ

```bash
cd frontend

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

### 7. アクセス確認

- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:8000
- APIドキュメント: http://localhost:8000/api/docs

---

## Docker環境

### docker-compose.yml

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/ragtesting
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
    volumes:
      - ./data:/app/data

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_BASE=http://backend:8000
    depends_on:
      - backend

  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=ragtesting
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Dockerビルドと起動

```bash
# ビルド
docker-compose build

# 起動
docker-compose up -d

# ログ確認
docker-compose logs -f

# 停止
docker-compose down
```

---

## 本番環境デプロイ

### 推奨構成

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │    (nginx)      │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  Frontend   │   │  Backend    │   │  Backend    │
    │  (Next.js)  │   │  (FastAPI)  │   │  (FastAPI)  │
    └─────────────┘   └──────┬──────┘   └──────┬──────┘
                             │                 │
                    ┌────────┴─────────────────┘
                    │
            ┌───────▼───────┐     ┌─────────────┐
            │  PostgreSQL   │────▶│   Redis     │
            │  (Primary)    │     │  (Cache)    │
            └───────────────┘     └─────────────┘
```

### 1. サーバー準備

```bash
# 必要なパッケージのインストール (Ubuntu/Debian)
sudo apt update
sudo apt install -y python3.11 python3.11-venv nginx postgresql

# ファイアウォール設定
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 2. PostgreSQLセットアップ

```bash
# データベースとユーザーの作成
sudo -u postgres psql

CREATE DATABASE ragtesting;
CREATE USER ragtesting_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ragtesting TO ragtesting_user;
\q
```

### 3. アプリケーションデプロイ

```bash
# アプリケーションディレクトリの作成
sudo mkdir -p /opt/ragtesting
sudo chown $USER:$USER /opt/ragtesting

# コードのデプロイ
git clone https://github.com/your-org/ragtesting.git /opt/ragtesting

# Python環境のセットアップ
cd /opt/ragtesting
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. systemdサービスの設定

```ini
# /etc/systemd/system/ragtesting-backend.service
[Unit]
Description=RAGTesting Backend API
After=network.target postgresql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ragtesting/backend
Environment="PATH=/opt/ragtesting/venv/bin"
EnvironmentFile=/opt/ragtesting/.env
ExecStart=/opt/ragtesting/venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# サービスの有効化と起動
sudo systemctl daemon-reload
sudo systemctl enable ragtesting-backend
sudo systemctl start ragtesting-backend
```

### 5. nginx設定

```nginx
# /etc/nginx/sites-available/ragtesting
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 200M;
    }

    location /auth {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /excel {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 200M;
    }
}
```

```bash
# 設定の有効化
sudo ln -s /etc/nginx/sites-available/ragtesting /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL証明書（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## データベースマイグレーション

### Alembicの使用

```bash
cd backend

# 現在のバージョン確認
alembic current

# マイグレーション履歴表示
alembic history

# 最新バージョンに更新
alembic upgrade head

# 1つ前に戻す
alembic downgrade -1

# 特定バージョンに更新
alembic upgrade <revision_id>
```

### 新しいマイグレーション作成

```bash
# 自動生成
alembic revision --autogenerate -m "説明文"

# 手動作成
alembic revision -m "説明文"
```

### 本番環境でのマイグレーション

```bash
# 1. バックアップを取る
pg_dump ragtesting > backup_$(date +%Y%m%d).sql

# 2. メンテナンスモードに切り替え（オプション）

# 3. マイグレーション実行
alembic upgrade head

# 4. 動作確認

# 5. メンテナンスモード解除
```

---

## 環境変数設定

詳細は [ENV_REFERENCE.md](./ENV_REFERENCE.md) を参照してください。

### 本番環境で必須の設定

```bash
# セキュリティ
SESSION_SECRET_KEY="<64文字以上のランダム文字列>"
ENCRYPTION_KEY="<Base64エンコードした32バイトのキー>"

# データベース
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# CORS（本番ドメインのみ）
CORS_ORIGINS="https://your-domain.com"

# 認証
ENTRA_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
ENTRA_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
ENTRA_CLIENT_SECRET="xxxxx"

# 管理者自動作成を無効化
ADMIN_BOOTSTRAP_ENABLED=false
```

---

## 監視とログ

### ヘルスチェック

```bash
# バックエンドの死活確認
curl http://localhost:8000/health

# 期待されるレスポンス
{"status": "healthy", "version": "1.0.0"}
```

### ログの確認

```bash
# systemdログ
sudo journalctl -u ragtesting-backend -f

# 構造化ログ（JSON形式）
# 本番環境ではJSON形式で出力されます
```

### 監視項目の推奨

| 項目 | 閾値 | アクション |
|------|------|----------|
| CPU使用率 | 80%以上 | スケールアップ検討 |
| メモリ使用率 | 85%以上 | メモリリーク確認 |
| ディスク使用率 | 80%以上 | 古いデータ削除 |
| APIレスポンス時間 | 5秒以上 | ボトルネック調査 |
| エラー率 | 1%以上 | ログ確認 |

---

## バックアップとリストア

### データベースバックアップ

```bash
# PostgreSQL
pg_dump -h localhost -U ragtesting_user ragtesting > backup_$(date +%Y%m%d).sql

# 自動バックアップ（cron）
0 2 * * * pg_dump -h localhost -U ragtesting_user ragtesting | gzip > /backup/db_$(date +\%Y\%m\%d).sql.gz
```

### データベースリストア

```bash
# PostgreSQL
psql -h localhost -U ragtesting_user ragtesting < backup.sql
```

### アップロードファイルのバックアップ

```bash
# dataディレクトリのバックアップ
tar -czvf data_backup_$(date +%Y%m%d).tar.gz /opt/ragtesting/data/
```

---

**作成日**: 2026-02-03
**更新日**: 2026-02-03
