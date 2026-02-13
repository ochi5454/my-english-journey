# Docker アーキテクチャガイド

このドキュメントでは、ローカル開発環境と本番環境（Azure）で使用する Docker 構成の違いについて説明します。

---

## 概要

| 環境 | 構成 | Dockerfile | 用途 |
|------|------|------------|------|
| **ローカル開発（分離）** | 分離コンテナ | `backend/Dockerfile` + `frontend/Dockerfile` | 開発・デバッグ |
| **ローカル開発（All-in-One）** | 単一コンテナ | `Dockerfile.linux` | 本番環境テスト |
| **本番（Azure）** | 単一コンテナ | `Dockerfile.linux` | Azure Container Apps |

> 💡 **Tip**: All-in-One 構成（ローカル開発 All-in-One / 本番 Azure）は現在未実装です。ローカル開発には分離コンテナ構成を使用してください。

---

## 環境変数ファイル構成

このプロジェクトでは、環境ごとに異なる `.env` ファイルを使用します。

**📖 詳細ガイド:** 環境変数の完全な説明、セットアップ手順、トラブルシューティングは [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) を参照してください。

### クイックリファレンス

| Docker モード | 使用する環境ファイル |
|--------------|-------------------|
| **Docker-compose** | `backend/.env` + `frontend/.env.local` |
| **All-in-One ローカル** | `backend/.env` + `frontend/.env.docker` |
| **Azure 本番** | `backend/.env.prod` + `frontend/.env.prod` (イメージ内) + Azure App Settings |

**注意:**
- `.env`、`.env.prod` ファイルは Git にコミットしない
- `.example` ファイルをコピーして使用する
- Azure 本番環境では App Settings が Docker イメージ内の値より優先される

---

## ローカル開発：分離コンテナ構成

ローカル開発では、各サービスを個別のコンテナとして実行します。

```
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   PostgreSQL  │  │    Backend    │  │   Frontend    │
│    :5432      │  │    :8000      │  │    :3000      │
│  (postgres)   │  │  (FastAPI)    │  │  (Next.js)    │
└───────────────┘  └───────────────┘  └───────────────┘
     別コンテナ         別コンテナ         別コンテナ
```

### 使用ファイル

| ファイル | 役割 |
|----------|------|
| `docker-compose.yml` | サービス定義・オーケストレーション |
| `backend/Dockerfile` | バックエンド（FastAPI）イメージ |
| `frontend/Dockerfile` | フロントエンド（Next.js）イメージ |

### 起動コマンド

```bash
# すべてのサービスを起動
docker-compose up --build -d

# 特定のサービスのみ起動
docker-compose up postgres -d      # PostgreSQL のみ
docker-compose up backend -d       # バックエンドのみ

# ログ確認
docker-compose logs -f backend

# 停止
docker-compose down
```

### 利点

- 個別にログ確認・再起動が可能
- サービスごとに独立して開発・デバッグできる
- 軽量なイメージで高速なビルド
- **データが永続化される**（Docker ボリューム使用）

### データ永続化

分離コンテナ構成では、PostgreSQL のデータは Docker ボリューム（`postgres_data`）に保存されます。

```bash
# コンテナを停止してもデータは残る
docker-compose down

# コンテナを再起動するとデータが復元される
docker-compose up -d

# ⚠️ ボリュームを削除するとデータが消える
docker-compose down -v  # -v オプションでボリューム削除
```

---

## All-in-One 構成

> 💡 **Tip**: このセクションは参考情報です。All-in-One 構成は現在未実装です。

All-in-One 構成は、すべてのサービスを単一コンテナに統合して実行します。
ローカルテストと Azure 本番デプロイの両方で使用できます。

```
┌─────────────────────────────────────────────────────┐
│              Single Container (All-in-One)          │
│  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │PostgreSQL │  │  Backend  │  │   Frontend    │   │
│  │  :5432    │  │   :8000   │  │    :3000      │   │
│  └───────────┘  └───────────┘  └───────────────┘   │
│              (Supervisor で管理)                    │
└─────────────────────────────────────────────────────┘
```

---

## ローカルで All-in-One を使用する

> 💡 **Tip**: このセクションは参考情報です。All-in-One 構成は現在未実装です。

本番環境に近い状態でテストしたい場合、All-in-One コンテナをローカルで実行できます。

### ビルドコマンド

```bash
# ローカルテスト用にビルド（BUILD_MODE=local）
docker build --build-arg BUILD_MODE=local -f Dockerfile.linux -t mailagent-allinone:local .
```

### 起動コマンド

```bash
# コンテナを起動
docker run -d \
  --name mailagent_allinone \
  -p 3000:3000 \
  -p 8000:8000 \
  -p 5432:5432 \
  --env-file ./backend/.env \
  -v $(pwd)/data:/app/data \
  mailagent-allinone:local
```

### アクセス URL

| サービス | URL |
|---------|-----|
| フロントエンド | http://localhost:3000 |
| バックエンド API | http://localhost:8000 |
| API ドキュメント | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

### TablePlus 接続設定

| 設定 | 値 |
|-----|-----|
| Host | `localhost` |
| Port | `5432` |
| User | `mailagent_user` |
| Password | `mailagent_password` |
| Database | `mailagent_db` |

### データ永続化（All-in-One）

All-in-One コンテナのデータはコンテナ内部に保存されます。

| 操作 | データ |
|------|--------|
| `docker stop` → `docker start` | **保持される** |
| `docker rm` → `docker run` | **リセットされる**（初期データに戻る） |
| ソースコード更新後の再ビルド | **リセットされる** |

```bash
# データを保持したまま停止・再開
docker stop mailagent_allinone
docker start mailagent_allinone

# ⚠️ コンテナを削除するとデータが消える
docker rm mailagent_allinone
```

### 利点

- 本番環境に近い状態でテスト可能
- 単一コンテナで管理がシンプル
- 新鮮なサンプルデータで毎回テスト可能（再ビルド時）

---

## 本番環境（Azure）：デプロイ方式

> 💡 **Tip**: このセクションは参考情報です。Azure デプロイは現在未実装です。

本番環境では、Azure Container Apps を使用して All-in-One コンテナをデプロイします。

### Azure Container Apps：All-in-One

```
┌─────────────────────────────────────────────────────┐
│              Single Container (All-in-One)          │
│  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │PostgreSQL │  │  Backend  │  │   Frontend    │   │
│  │  :5432    │  │   :8000   │  │    :3000      │   │
│  └───────────┘  └───────────┘  └───────────────┘   │
│              (Supervisor で管理)                    │
└─────────────────────────────────────────────────────┘
```

**使用ファイル:**
- `Dockerfile.linux` - All-in-One イメージ定義
- `supervisord.conf` - プロセス管理設定
- `entrypoint.sh` - コンテナ起動スクリプト

**ビルドコマンド（ACR）:**
```bash
az acr build \
  --registry <your-acr-name> \
  --image mailagent-allinone:<tag> \
  --platform linux/amd64 \
  --file Dockerfile.linux .
```

**特徴:**
- 単一コンテナで管理がシンプル
- コンテナ間通信の設定が不要
- ⚠️ デプロイに時間がかかる
- ⚠️ データベースがコンテナ内部（再デプロイでリセット）

---

## モード切り替え

> 💡 **Tip**: このセクションは参考情報です。All-in-One 構成は現在未実装のため、モード切り替えは使用できません。

分離コンテナと All-in-One コンテナを切り替えて使用できます。各モードのデータは独立しています。

### 分離コンテナ → All-in-One に切り替え

```bash
# 分離コンテナを停止（データは保持）
docker-compose down

# All-in-One を起動
docker start mailagent_allinone
# または新規作成: docker run -d --name mailagent_allinone ...
```

### All-in-One → 分離コンテナに切り替え

```bash
# All-in-One を停止（データは保持）
docker stop mailagent_allinone

# 分離コンテナを起動（以前のデータが復元）
docker-compose up -d
```

### データの独立性

| モード | データ保存場所 | 他モードとの共有 |
|--------|---------------|-----------------|
| 分離コンテナ | Docker ボリューム（`postgres_data`） | なし |
| All-in-One | コンテナ内部 | なし |

- 分離コンテナのデータは All-in-One には反映されません
- All-in-One のデータは分離コンテナには反映されません
- 各モードは独立したデータベースを持っています

---

## データストレージの詳細

このアプリケーションは以下のデータストレージを使用します。

### ストレージの種類

| ストレージ | 用途 | 技術 |
|-----------|------|------|
| **PostgreSQL** | メインデータベース（ユーザー、メール、テンプレートなど） | PostgreSQL 16 |
| **ファイルストレージ** | アップロードファイル、添付ファイル | ローカルファイルシステム |

### 環境別のデータ保存場所

#### ローカル環境

| 環境 | PostgreSQL | ファイル | 永続性 |
|------|------------|----------|--------|
| **ネイティブローカル（VS Code）** | Docker ボリューム または SQLite | `./data/` | ✅ 永続 |
| **Docker-compose（分離）** | Docker ボリューム（`postgres_data`） | `./data/`（マウント） | ✅ 永続 |
| **All-in-One** | コンテナ内部 | `./data/`（`-v` マウント） | ⚠️ PostgreSQL はコンテナ内 |

#### 本番環境（Azure）

| 環境 | PostgreSQL | ファイル | 永続性 |
|------|------------|----------|--------|
| **All-in-One（Azure）** | コンテナ内部 | コンテナ内部 | ⚠️ 再デプロイでリセット |

### 本番環境（Azure）でのデータについて

All-in-One 環境では PostgreSQL がコンテナ内部に保存されます。

| イベント | PostgreSQL | ファイル |
|---------|------------|----------|
| コンテナ再起動 | ⚠️ 保持される可能性あり | ⚠️ 保持される可能性あり |
| 新イメージのデプロイ | ❌ **リセット** | ❌ **リセット** |

**注意**: All-in-One 環境でデータを永続化するには、以下の対応が必要です：
- **Azure Database for PostgreSQL** の使用（推奨）
- **Azure Storage** のマウント（ファイル用）

---

## Docker イメージ一覧

### ローカル開発用

| イメージ名 | サイズ | Dockerfile | 用途 |
|-----------|--------|------------|------|
| `mailagent-backend:latest` | ~1.5GB | `backend/Dockerfile` | バックエンド（docker-compose） |
| `mailagent-frontend:latest` | ~500MB | `frontend/Dockerfile` | フロントエンド（docker-compose） |
| `postgres:16-alpine` | ~230MB | (公式イメージ) | データベース |

### 本番デプロイ用

| イメージ名 | サイズ | Dockerfile | 用途 |
|-----------|--------|------------|------|
| `mailagent-allinone` | ~2.5GB | `Dockerfile.linux` | All-in-One（FE+BE+DB） |

---

## Dockerfile 構成詳細

### backend/Dockerfile（ローカル用）

```dockerfile
FROM python:3.11-slim
# バックエンドのみ
# - FastAPI アプリケーション
# - Python 依存関係
# - ポート: 8000
```

### frontend/Dockerfile（ローカル用）

```dockerfile
FROM node:20-alpine AS builder  # ビルドステージ
FROM node:20-alpine             # 実行ステージ
# フロントエンドのみ
# - Next.js アプリをビルド
# - Node.js で SSR 実行
# - ポート: 3000
```

### Dockerfile.linux（本番用 All-in-One）

```dockerfile
FROM ubuntu:22.04
# すべてを含む
# - PostgreSQL 16
# - Python 3.11 + FastAPI
# - Node.js 20 + Next.js ビルド
# - Supervisor（プロセス管理）
# - ポート: 5432, 8000, 3000
```

---

## イメージサイズについて

バックエンドイメージのサイズ内訳：

| パッケージ | サイズ | 用途 |
|-----------|--------|------|
| `langchain-*` | ~300MB | LLM 連携 |
| `openai` | ~50MB | OpenAI API |
| `pandas` + `numpy` | ~200MB | データ処理 |
| `openpyxl` | ~30MB | Excel ファイル処理 |

### サイズ削減のための最適化（実施済み）

- `.dockerignore` で不要ファイルを除外
- `--no-cache-dir` で pip キャッシュを無効化
- マルチステージビルドの使用

---

## トラブルシューティング

### イメージが大きすぎる

```bash
# 未使用イメージを削除
docker image prune -a

# ビルドキャッシュを削除
docker builder prune
```

### アーキテクチャエラー（Azure デプロイ時）

Azure Container Apps は `linux/amd64` のみサポート。M1/M2 Mac でビルドする場合：

```bash
docker build --platform linux/amd64 -f Dockerfile.linux -t <image-name> .
```

### コンテナが起動しない

```bash
# ログを確認
docker logs <container-name>

# entrypoint.sh の改行コードを確認（LF 必須）
file entrypoint.sh
# CRLF の場合は変換
sed -i 's/\r$//' entrypoint.sh
```

---

## 関連ドキュメント

- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) - 環境変数の詳細ガイド
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - ローカル開発ガイド
- [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) - SQLite から PostgreSQL への移行

---

**最終更新日**: 2026-02-13
