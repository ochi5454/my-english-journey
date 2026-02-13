# 環境変数ガイド

このドキュメントでは、プロジェクトで使用するすべての環境変数ファイル（`.env`）と Dockerfile について説明します。

---

## 目次

1. [環境とDockerfileの対応表](#環境とdockerfileの対応表)
2. [環境変数ファイル一覧](#環境変数ファイル一覧)
3. [環境別セットアップガイド](#環境別セットアップガイド)
4. [環境変数の優先順位](#環境変数の優先順位)
5. [主要な環境変数](#主要な環境変数)
6. [セキュリティベストプラクティス](#セキュリティベストプラクティス)
7. [トラブルシューティング](#トラブルシューティング)

---

## 環境とDockerfileの対応表

### 📋 全環境一覧

| 環境 | アーキテクチャ | Dockerfile | 環境変数ファイル | 用途 |
|------|-------------|-----------|---------------|------|
| **ローカル開発（ネイティブ）** | なし | - | `backend/.env`<br>`frontend/.env.local` | VS Code + ターミナル |
| **ローカル開発（分離）** | 分離コンテナ | `backend/Dockerfile`<br>`frontend/Dockerfile` | `backend/.env`<br>`frontend/.env.local` | Docker-compose開発 |
| **ローカル開発（All-in-One）** | 単一コンテナ | `Dockerfile.linux` | `backend/.env`<br>`frontend/.env.docker` | 本番環境テスト |
| **Azure 本番（All-in-One）** | 単一コンテナ | `Dockerfile.linux` | `backend/.env.prod`<br>`frontend/.env.prod` | Azure Container Apps |

### 🔑 キーポイント

**ローカル開発用Dockerfile（サブディレクトリ）:**
- `backend/Dockerfile` - docker-compose用
- `frontend/Dockerfile` - docker-compose用

**本番デプロイ用Dockerfile（ルートディレクトリ）:**
- `Dockerfile.linux` - All-in-One（Azure デプロイ）

---

## 環境変数ファイル一覧

### 📋 全ファイルリスト

| 場所 | ファイル | Git | 用途 | 使用環境 |
|------|----------|-----|------|---------|
| **Backend** | `.env.example` | ✅ Tracked | バックエンドテンプレート | 全環境 |
| **Backend** | `.env` | 🔒 Ignored | ローカル開発用（秘密情報含む） | ローカル開発 |
| **Backend** | `.env.prod` | 🔒 Ignored | 本番環境用（秘密情報含む） | Azure 本番 |
| **Frontend** | `.env.example` | ✅ Tracked | フロントエンドテンプレート | 全環境 |
| **Frontend** | `.env.local` | 🔒 Ignored | ローカル開発用 | ローカル開発 |
| **Frontend** | `.env.docker` | ✅ Tracked | Docker ローカルテスト用 | Docker ローカル |
| **Frontend** | `.env.prod` | 🔒 Ignored | Azure 本番用 | Azure 本番 |

### 🔐 Git 管理について

**✅ Tracked（Git で管理）:**
- `.example` ファイル - テンプレートとして共有
- `frontend/.env.docker` - localhost URL のみなので安全

**🔒 Ignored（Git で管理しない）:**
- シークレット情報を含むファイル
- API キー、パスワード、認証情報を含むファイル

---

## 環境別セットアップガイド

### 🖥️ ローカル開発（ネイティブ実行）

Next.js と FastAPI をネイティブ実行（npm, uvicorn）する場合。

#### セットアップ手順

```bash
# 1. バックエンド設定
cp backend/.env.example backend/.env
# 編集: OPENAI_API_KEY, ENTRA_* などを設定

# 2. フロントエンド設定
cp frontend/.env.example frontend/.env.local
# 編集: NEXT_PUBLIC_API_BASE=http://localhost:8000 などを設定
```

#### 使用されるファイル

- `backend/.env` - バックエンド環境変数
- `frontend/.env.local` - フロントエンド環境変数（Next.js が読み込む）

---

### 🐳 Docker-compose（ローカル開発）

Docker コンテナで全サービスを起動する場合。

#### セットアップ手順

```bash
# 1. バックエンド設定
cp backend/.env.example backend/.env
# 編集: OPENAI_API_KEY, ENTRA_* などを設定
# DATABASE_URL を PostgreSQL に変更

# 2. フロントエンド設定（frontend/.env.local を使用）
cp frontend/.env.example frontend/.env.local
```

#### 使用されるファイル

- `backend/.env` - バックエンドコンテナの環境変数
- `frontend/.env.local` - フロントエンドのビルド時環境変数

#### 起動コマンド

```bash
docker-compose up --build -d
```

---

### 🏗️ All-in-One コンテナ（ローカルテスト）

本番環境に近い構成でローカルテストする場合。

#### セットアップ手順

```bash
# 1. バックエンド設定
cp backend/.env.example backend/.env
# 編集: OPENAI_API_KEY, ENTRA_* などを設定

# 2. フロントエンド Docker 設定を確認
# frontend/.env.docker にはすでに localhost URL が設定済み

# 3. イメージビルド
docker build --build-arg BUILD_MODE=local -f Dockerfile.linux -t mailagent-allinone:local .

# 4. コンテナ起動
docker run -d \
  --name mailagent_allinone \
  -p 3000:3000 \
  --env-file ./backend/.env \
  mailagent-allinone:local
```

#### 使用されるファイル

- `backend/.env` - `--env-file` で明示的に渡す
- `frontend/.env.docker` - ビルド時に Docker イメージに含まれる

---

### ☁️ Azure 本番環境（Container Apps）

Azure Container Apps へのデプロイ。

#### セットアップ手順

```bash
# 1. バックエンド本番設定
cp backend/.env.example backend/.env.prod
# 編集: 本番環境の OPENAI_API_KEY, ENTRA_*, DATABASE_URL などを設定

# 2. フロントエンド本番設定
cp frontend/.env.example frontend/.env.prod
# 編集: 本番環境の URL（https://your-app...）を設定

# 3. イメージビルド（ACR で直接ビルド推奨）
az acr build \
  --registry <your-acr-name> \
  --image mailagent-allinone:<tag> \
  --platform linux/amd64 \
  --file Dockerfile.linux .

# 4. Container App 更新
az containerapp update \
  --name <app-name> \
  --resource-group <resource-group>
```

#### 使用されるファイル

- `backend/.env.prod` - Docker イメージにビルドされる（デフォルト値）
- `frontend/.env.prod` - Docker イメージにビルドされる（Next.js ビルド時にコンパイル）

#### 重要な注意点

Azure Container Apps では、**App Settings（環境変数）** が Docker イメージ内の `.env.prod` より優先されます。

---

## 環境変数の優先順位

### モード別の使用ファイル

| モード | Dockerfile | Backend 環境変数 | Frontend 環境変数 |
|--------|-----------|----------------|-----------------|
| **ネイティブローカル** | - | `backend/.env` | `frontend/.env.local` |
| **Docker-compose（分離）** | `backend/Dockerfile`<br>`frontend/Dockerfile` | `backend/.env` | `frontend/.env.local` |
| **All-in-One ローカル** | `Dockerfile.linux` | `backend/.env` | `frontend/.env.docker` |
| **Azure 本番** | `Dockerfile.linux` | `backend/.env.prod` | `frontend/.env.prod` |

### Azure 本番環境での優先順位

Azure Container Apps にデプロイされたアプリケーションでは、環境変数は以下の優先順位で適用されます：

```
【優先順位：高】
    ↓
1. Azure Container Apps の App Settings
   └─ az containerapp update --set-env-vars で設定
   └─ Azure Portal の Configuration で設定
    ↓ (これらが存在する場合、下記を上書き)
2. Docker イメージに含まれる環境変数
   └─ backend/.env.prod (バックエンド用)
   └─ frontend/.env.prod (フロントエンド用、ビルド時に Next.js にコンパイル)
    ↓ (これらが存在しない場合)
3. コード内のデフォルト値
【優先順位：低】
```

---

## 主要な環境変数

### バックエンド環境変数

#### 必須変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `OPENAI_API_KEY` | OpenAI API キー | `sk-proj-...` |
| `DATABASE_URL` | データベース接続文字列 | `postgresql://user:pass@localhost:5432/db` |
| `ENCRYPTION_KEY` | データ暗号化キー | Fernet キー |
| `SESSION_SECRET_KEY` | セッション暗号化キー | ランダム文字列 |

#### Microsoft Entra ID 認証（オプション）

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `ENTRA_TENANT_ID` | Azure Entra ID テナント ID | `12345678-1234-...` |
| `ENTRA_CLIENT_ID` | Azure Entra ID クライアント ID | `87654321-4321-...` |
| `ENTRA_CLIENT_SECRET` | Azure Entra ID クライアントシークレット | `D5G8Q~...` |
| `ENTRA_REDIRECT_URI` | 認証後のリダイレクト URI | `http://localhost:3000/auth/callback` |

#### 管理者設定（ローカル開発用）

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `ADMIN_EMAIL` | 管理者メールアドレス | `admin` |
| `ADMIN_PASSWORD` | 管理者パスワード | `admin123!` |
| `ADMIN_NAME` | 管理者名 | `Admin User` |
| `ADMIN_BOOTSTRAP_ENABLED` | 初期管理者作成 | `true` |

#### メール設定

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `MAIL_USE_GRAPH` | Microsoft Graph API 使用 | `true` |
| `MAIL_FROM_NAME` | 送信者名 | `勤怠管理システム` |

### フロントエンド環境変数

#### 必須変数（すべて `NEXT_PUBLIC_` プレフィックス）

| 変数名 | 説明 | ローカル例 | 本番例 |
|--------|------|-----------|--------|
| `NEXT_PUBLIC_API_BASE` | バックエンド API URL | `http://localhost:8000` | `https://your-app...` |

**注意:** Next.js は `NEXT_PUBLIC_` プレフィックスの付いた変数のみをブラウザにバンドルします。

---

## セキュリティベストプラクティス

### ❌ 絶対にやってはいけないこと

1. **Git に機密情報をコミットしない**
   ```bash
   # これらのファイルは絶対にコミットしない
   backend/.env
   backend/.env.prod
   frontend/.env.local
   frontend/.env.prod
   ```

2. **本番環境の認証情報をローカルで使わない**
   - ローカル開発では開発用の API キーを使用
   - 本番用 API キーは `backend/.env.prod` のみに設定

3. **環境変数をログに出力しない**
   ```python
   # ❌ 危険
   print(f"API Key: {os.getenv('OPENAI_API_KEY')}")

   # ✅ 安全
   logger.info("OpenAI API initialized")
   ```

### ✅ 推奨事項

1. **`.example` ファイルからコピーする**
   ```bash
   cp backend/.env.example backend/.env
   # その後、実際の値を編集
   ```

2. **シークレットキーはランダム生成**
   ```bash
   # ENCRYPTION_KEY の生成
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

   # SESSION_SECRET_KEY の生成
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

3. **定期的にシークレットをローテーション**
   - 本番環境の API キーは3〜6ヶ月ごとに更新
   - チームメンバーが退職時には即座に更新

4. **環境ごとに異なる値を使用**
   - ローカル開発: `localhost` URL、開発用 API キー
   - 本番環境: 本番 URL、本番用 API キー

---

## トラブルシューティング

### 問題 1: 環境変数が反映されない

**症状:**
- 環境変数を設定したのに、アプリケーションが古い値を使用している

**原因と解決策:**

#### ローカル開発の場合

```bash
# 1. 開発サーバーを再起動
# フロントエンド
npm run dev を停止して再起動

# バックエンド
uvicorn を停止して再起動
```

#### Docker の場合

```bash
# 1. コンテナを再ビルド
docker-compose down
docker-compose up --build -d

# 2. イメージキャッシュをクリア
docker-compose build --no-cache
```

---

### 問題 2: フロントエンドで環境変数が undefined

**症状:**
```javascript
console.log(process.env.NEXT_PUBLIC_API_BASE); // undefined
```

**原因と解決策:**

1. **`NEXT_PUBLIC_` プレフィックスが付いていない**
   ```bash
   # ❌ 間違い
   API_BASE=http://localhost:8000

   # ✅ 正しい
   NEXT_PUBLIC_API_BASE=http://localhost:8000
   ```

2. **開発サーバーを再起動していない**
   ```bash
   # .env.local ファイルを変更したら必ず再起動
   npm run dev を停止して再起動
   ```

3. **ファイル名が間違っている**
   ```bash
   # Next.js が読み込むファイル
   .env.local      # ローカル開発用（推奨）
   .env            # 全環境共通
   ```

---

### 問題 3: データベース接続エラー

**症状:**
```
sqlalchemy.exc.OperationalError: could not connect to server
```

**原因と解決策:**

#### Docker-compose の場合

```bash
# 1. DATABASE_URL のホスト名を確認
# ❌ 間違い
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# ✅ 正しい（Docker ネットワーク内のサービス名）
DATABASE_URL=postgresql://user:pass@postgres:5432/db
```

#### ネイティブローカルの場合

```bash
# 1. PostgreSQL が起動しているか確認
docker-compose up postgres -d

# 2. DATABASE_URL を localhost に設定
DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db
```

---

### 問題 4: SQLite から PostgreSQL への移行エラー

**症状:**
- 既存の SQLite データが PostgreSQL に反映されない

**解決策:**
```bash
# マイグレーションスクリプトを実行
python scripts/migrate_sqlite_to_postgres.py

# または、新規データベースで開始
docker-compose down -v
docker-compose up postgres -d
```

詳細は [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) を参照してください。

---

## 関連ドキュメント

- [DOCKER_ARCHITECTURE.md](DOCKER_ARCHITECTURE.md) - Docker 構成と環境変数の使用
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - ローカル開発環境のセットアップ
- [DATABASE_MIGRATION.md](DATABASE_MIGRATION.md) - SQLite から PostgreSQL への移行

---

**最終更新日**: 2026-02-13
