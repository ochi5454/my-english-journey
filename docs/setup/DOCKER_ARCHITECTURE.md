# Docker アーキテクチャガイド

このドキュメントでは、ローカル開発環境と本番環境（Azure）で使用する Docker 構成の違いについて説明します。

---

## 概要

| 環境 | 構成 | Dockerfile | 用途 | ステータス |
|------|------|------------|------|----------|
| **ローカル開発（分離）** | 分離コンテナ | `backend/Dockerfile` + `frontend/Dockerfile` | 開発・デバッグ | ✅ 実装済み |
| **ローカル開発（All-in-One）** | 単一コンテナ | `Dockerfile.linux` | 本番環境テスト | 📄 参考資料のみ |
| **本番（Azure 分離）** | 分離コンテナ | `Dockerfile.frontend` + `Dockerfile.backend` | Azure Container Apps | ⏳ 準備中（メイン） |
| **本番（Azure All-in-One）** | 単一コンテナ | `Dockerfile.linux` | Azure Container Apps | 📄 参考資料のみ |

> 💡 **Tip**: ローカル開発にはオプション A（ネイティブ実行）または B（分離コンテナ）を使用してください。本番環境へのデプロイは**分離アーキテクチャがメイン**です。All-in-One 構成はドキュメントに参考資料として残していますが、実装予定はありません。

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

> 📄 **注意**: このセクションは参考資料です。All-in-One 構成は未実装であり、実装予定もありません。ローカル開発には分離コンテナ構成を、本番デプロイには分離アーキテクチャを使用してください。

All-in-One 構成は、すべてのサービスを単一コンテナに統合して実行する設計です（参考情報）。

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

> 📄 **注意**: このセクションは参考資料です。All-in-One 構成は未実装であり、実装予定もありません。

本番環境に近い状態でテストしたい場合の参考情報です。

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

本番環境では、Azure Container Apps を使用してデプロイします。**分離アーキテクチャがメインのデプロイ方式**です。

### Azure Container Apps：分離アーキテクチャ（推奨・メイン）

Frontend と Backend を別々のコンテナでデプロイし、データベースは Azure PostgreSQL Flexible Server を使用します。

```
┌──────────────────────────────────────────────────────────┐
│               Container Apps Environment                 │
│  ┌─────────────────────┐  ┌────────────────────────┐   │
│  │  Frontend Container │  │  Backend Container     │   │
│  │  (Next.js)          │  │  (FastAPI)             │   │
│  │  Port: 3000         │  │  Port: 8000            │   │
│  └─────────────────────┘  └────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────┐
│           Azure PostgreSQL Flexible Server               │
│           (外部マネージドサービス)                        │
└──────────────────────────────────────────────────────────┘
```

**使用ファイル:**
- `Dockerfile.frontend` - Frontend イメージ定義
- `Dockerfile.backend` - Backend イメージ定義

**ビルドコマンド（ACR）:**
```bash
# Frontend
az acr build \
  --registry <your-acr-name> \
  --image aimail-frontend:latest \
  --platform linux/amd64 \
  --file Dockerfile.frontend .

# Backend
az acr build \
  --registry <your-acr-name> \
  --image aimail-backend:latest \
  --platform linux/amd64 \
  --file Dockerfile.backend .
```

**特徴:**
- ✅ 部分的な更新が可能（変更したコンポーネントのみデプロイ）
- ✅ 独立したスケーリング
- ✅ データベースの完全な永続性（Azure PostgreSQL）
- ✅ デプロイ時間が短い（2-7分）

詳細は [分離アーキテクチャ デプロイガイド](../deployment/PROTHENTIA/separate_mode/DEPLOYMENT.md) を参照してください。

---

### Azure Container Apps：All-in-One（参考資料）

> 📄 **注意**: このセクションは参考資料です。All-in-One 構成は実装予定がありません。

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

**使用ファイル（参考）:**
- `Dockerfile.linux` - All-in-One イメージ定義
- `supervisord.conf` - プロセス管理設定
- `entrypoint.sh` - コンテナ起動スクリプト

**特徴:**
- 単一コンテナで管理がシンプル
- コンテナ間通信の設定が不要
- ⚠️ デプロイに時間がかかる（10-15分）
- ⚠️ データベースがコンテナ内部（再デプロイでリセット）

---

## モード切り替え

> 📄 **注意**: このセクションは参考資料です。All-in-One 構成は未実装のため、モード切り替えは使用できません。ローカル開発には分離コンテナ構成のみを使用してください。

参考情報として、分離コンテナと All-in-One コンテナを切り替えて使用する場合の手順を記載しています。

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
| **分離アーキテクチャ（メイン）** | Azure PostgreSQL Flexible Server | Azure Storage | ✅ 完全永続 |
| **All-in-One（参考資料）** | コンテナ内部 | コンテナ内部 | ⚠️ 再デプロイでリセット |

### 本番環境（Azure）でのデータについて

**分離アーキテクチャ（推奨）** では、Azure PostgreSQL Flexible Server を使用するため、データは完全に永続化されます。

| イベント | PostgreSQL | ファイル |
|---------|------------|----------|
| コンテナ再起動 | ✅ **保持される** | ✅ **保持される** |
| 新イメージのデプロイ | ✅ **保持される** | ✅ **保持される** |

All-in-One 環境（参考資料）では PostgreSQL がコンテナ内部に保存されるため、データの永続性に注意が必要です。

---

## Docker イメージ一覧

### ローカル開発用

| イメージ名 | サイズ | Dockerfile | 用途 |
|-----------|--------|------------|------|
| `mailagent-backend:latest` | ~1.5GB | `backend/Dockerfile` | バックエンド（docker-compose） |
| `mailagent-frontend:latest` | ~500MB | `frontend/Dockerfile` | フロントエンド（docker-compose） |
| `postgres:16-alpine` | ~230MB | (公式イメージ) | データベース |

### 本番デプロイ用（分離アーキテクチャ・メイン）

| イメージ名 | サイズ | Dockerfile | 用途 |
|-----------|--------|------------|------|
| `aimail-frontend` | ~500MB | `Dockerfile.frontend` | Frontend（Next.js） |
| `aimail-backend` | ~1.5GB | `Dockerfile.backend` | Backend（FastAPI） |

### 本番デプロイ用（All-in-One・参考資料）

| イメージ名 | サイズ | Dockerfile | 用途 |
|-----------|--------|------------|------|
| `mailagent-allinone` | ~2.5GB | `Dockerfile.linux` | All-in-One（FE+BE+DB）※実装予定なし |

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

### Dockerfile.frontend（本番用・分離）

```dockerfile
FROM node:20-alpine AS builder  # ビルドステージ
FROM node:20-alpine             # 実行ステージ
# Frontend のみ
# - Next.js アプリをビルド
# - Node.js で SSR 実行
# - ポート: 3000
```

### Dockerfile.backend（本番用・分離）

```dockerfile
FROM python:3.11-slim
# Backend のみ
# - FastAPI アプリケーション
# - Python 依存関係
# - ポート: 8000
```

### Dockerfile.linux（本番用 All-in-One・参考資料）

> 📄 **注意**: このファイルは参考資料です。実装予定はありません。

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
- [分離アーキテクチャ デプロイガイド](../deployment/PROTHENTIA/separate_mode/DEPLOYMENT.md) - Azure 本番環境デプロイ（メイン）
- [アーキテクチャ比較](../deployment/PROTHENTIA/ARCHITECTURE_COMPARISON.md) - All-in-One vs 分離の比較

---

**最終更新日**: 2026-02-13
