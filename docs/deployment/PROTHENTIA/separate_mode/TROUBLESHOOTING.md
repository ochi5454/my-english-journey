# トラブルシューティングガイド - 分離アーキテクチャ

このドキュメントでは、Azure Container Apps（分離デプロイ + Cold Start）へのデプロイ時に発生する一般的な問題と解決方法を記載します。

**関連ドキュメント:**
- 📦 [初回デプロイ情報](./DEPLOYMENT.md) - インフラ構成と初回デプロイ手順
- 📝 [再デプロイ手順](./REDEPLOYMENT.md) - アプリケーション更新時の手順
- 📊 [アーキテクチャ比較](../ARCHITECTURE_COMPARISON.md) - All-in-One との比較

---

## 目次

1. [認証エラー: AADSTS50011 Redirect URI Mismatch](#認証エラー-aadsts50011-redirect-uri-mismatch)
2. [認証エラー: セッション関連のエラー](#認証エラー-セッション関連のエラー)
3. [CORS エラー: Access-Control-Allow-Origin](#cors-エラー-access-control-allow-origin)
4. [API エラー: Backend に接続できない](#api-エラー-backend-に接続できない)
5. [Frontend HTTP 500: ECONNREFUSED](#frontend-http-500-econnrefused)
6. [データベース初期化エラー: created_at の NOT NULL 違反](#データベース初期化エラー-created_at-の-not-null-違反)
7. [データベース初期化: psql コマンドが見つからない](#データベース初期化-psql-コマンドが見つからない)
8. [デプロイ後も古いファイルが表示される](#デプロイ後も古いファイルが表示される)
9. [Cold Start: 初回アクセスが遅い](#cold-start-初回アクセスが遅い)
10. [メール送信エラー: Microsoft Graph API](#メール送信エラー-microsoft-graph-api)
11. [データベース接続エラー](#データベース接続エラー)
12. [Backend が起動しない](#backend-が起動しない)
13. [Frontend が表示されない](#frontend-が表示されない)
14. [その他のトラブルシューティング](#その他のトラブルシューティング)

---

## 認証エラー: AADSTS50011 Redirect URI Mismatch

### 症状

Microsoft Entra ID でログインしようとすると、以下のエラーが表示される:

```
AADSTS50011: The redirect URI 'https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/auth/callback'
specified in the request does not match the redirect URIs configured for the application.
```

### 原因

Microsoft Entra ID アプリケーション登録で、フロントエンドの URL がリダイレクト URI として登録されていない。

### 解決方法

#### Azure Portal で Redirect URI を追加

1. Azure Portal → Microsoft Entra ID → App registrations を開く
2. AI Mail アプリケーションを選択
3. **Authentication** → **Platform configurations** → **Web** を選択
4. **Redirect URIs** に以下を追加:
   ```
   https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/auth/callback
   ```
5. **Save** をクリック

#### Azure CLI で確認

```bash
az ad app show --id <your-client-id> \
  --query 'web.redirectUris' --output json
```

---

## 認証エラー: セッション関連のエラー

### 症状

ログイン後にセッションが維持されない、または以下のようなエラーが発生:

```
Session expired or invalid
```

### 原因

1. **SESSION_SECRET_KEY が設定されていない**: バックエンドでセッション署名に使用するキーが未設定
2. **CORS 設定の問題**: credentials が正しく設定されていない
3. **Cookie のドメイン設定**: クロスオリジンでの Cookie 送信設定

### 解決方法

#### Step 1: SESSION_SECRET_KEY を確認

```bash
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env[?name==`SESSION_SECRET_KEY`]'
```

設定されていない場合:

```bash
# Secret を設定
az containerapp secret set \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --secrets session-secret-key="<your-secret-key>"

# 環境変数で参照
az containerapp update \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --set-env-vars "SESSION_SECRET_KEY=secretref:session-secret-key"
```

#### Step 2: CORS 設定を確認

Backend の CORS 設定で `credentials: true` が必要です:

```bash
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env[?name==`CORS_ORIGINS`]'
```

---

## CORS エラー: Access-Control-Allow-Origin

### 症状

ブラウザコンソールに以下のエラーが表示される:

```
Access to fetch at 'https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/api/...'
from origin 'https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### 原因

Backend が Frontend の origin を許可していない。

### 解決方法

Backend Container App の CORS_ORIGINS 環境変数を更新:

```bash
az containerapp update \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --set-env-vars \
    "CORS_ORIGINS=https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io,http://localhost:3000"
```

**重要**: URL の末尾にスラッシュを含めないでください。

---

## API エラー: Backend に接続できない

### 症状

Frontend から Backend API を呼び出すと、以下のようなエラーが発生:

```
fetch failed
TypeError: Failed to fetch
```

または Network タブで Backend への接続がタイムアウト。

### 原因

1. **Backend が起動していない**: Cold Start で停止中、または起動に失敗
2. **URL の設定ミス**: NEXT_PUBLIC_API_BASE が正しくない
3. **ネットワーク設定**: Container Apps Environment の設定問題

### 解決方法

#### Step 1: Backend のステータスを確認

```bash
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query '{status:properties.runningStatus, fqdn:properties.configuration.ingress.fqdn}'
```

#### Step 2: Backend に直接アクセス

```bash
curl https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/docs
```

#### Step 3: Frontend の環境変数を確認

```bash
az containerapp show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env[?name==`NEXT_PUBLIC_API_BASE`]'
```

---

## Frontend HTTP 500: ECONNREFUSED

### 症状

Frontend にアクセスすると HTTP 500 エラーが発生し、ブラウザに以下のエラーが表示される:

```
Application error: a server-side exception has occurred
```

サーバーログには以下のエラー:

```
Error: connect ECONNREFUSED 127.0.0.1:8000
    at TCPConnectWrap.afterConnect [as oncomplete]
```

### 原因

Frontend の API プロキシ（`/api/proxy/[...path]/route.ts`）が Backend への接続に失敗しています。

**重要**: このプロキシは `BACKEND_URL` 環境変数を使用しています（`NEXT_PUBLIC_API_BASE` ではありません）。

```typescript
// frontend/app/api/proxy/[...path]/route.ts
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
```

`BACKEND_URL` が設定されていない場合、デフォルトで `localhost:8000` に接続しようとし、コンテナ内では Backend が存在しないため ECONNREFUSED エラーになります。

### 解決方法

Frontend Container App に `BACKEND_URL` 環境変数を追加:

```bash
az containerapp update \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --set-env-vars "BACKEND_URL=https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io"
```

### 確認方法

```bash
# Frontend の環境変数を確認
az containerapp show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env[?name==`BACKEND_URL`]'
```

---

## データベース初期化エラー: created_at の NOT NULL 違反

### 症状

データベース初期化スクリプト（`02-seed.sql` や `03-sample-data.sql`）を実行すると、以下のエラーが発生:

```
null value in column "created_at" of relation "users" violates not-null constraint
DETAIL:  Failing row contains (3, admin, Admin User, null, null, null, t, t, null).
```

または:

```
null value in column "created_at" of relation "recipient_lists" violates not-null constraint
```

### 原因

テーブルの `created_at` カラムに `DEFAULT CURRENT_TIMESTAMP` が設定されていない。これは以下の場合に発生します:

1. マイグレーションツール（Alembic）で作成されたテーブルにデフォルト値が設定されていない
2. 既存のテーブル定義と SQL スキーマファイルの不整合

### 解決方法

#### 方法1: カラムにデフォルト値を追加

```sql
-- 各テーブルの created_at にデフォルト値を設定
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE recipient_lists ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE email_templates ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE email_templates ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE signatures ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE signatures ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
```

#### 方法2: Python スクリプトで修正

```python
import psycopg2

conn = psycopg2.connect(
    host="aimail-db.postgres.database.azure.com",
    port=5432,
    dbname="mailagent_db",
    user="mailagent_admin",
    password="<password>",
    sslmode="require"
)
conn.autocommit = True
cursor = conn.cursor()

tables = ['users', 'recipient_lists', 'email_templates', 'signatures']
for table in tables:
    try:
        cursor.execute(f"ALTER TABLE {table} ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP")
        print(f"Fixed {table}.created_at")
    except Exception as e:
        print(f"Skipped {table}: {e}")

cursor.close()
conn.close()
```

**注意**: `03-sample-data.sql` にはこの修正が含まれています。

---

## データベース初期化: psql コマンドが見つからない

### 症状

SQL ファイルを実行しようとすると、以下のエラーが発生:

```bash
PGPASSWORD='password' psql -h aimail-db.postgres.database.azure.com ...
command not found: psql
```

### 原因

ローカルマシンに PostgreSQL クライアント（psql）がインストールされていない。

### 解決方法

#### 方法1: Python + psycopg2 を使用（推奨）

psql をインストールせずに、Python の psycopg2 を使ってSQL を実行できます:

```bash
# psycopg2 のインストール
pip install psycopg2-binary
```

```python
import psycopg2

conn_params = {
    "host": "aimail-db.postgres.database.azure.com",
    "port": 5432,
    "dbname": "mailagent_db",
    "user": "mailagent_admin",
    "password": "<password>",
    "sslmode": "require"
}

conn = psycopg2.connect(**conn_params)
conn.autocommit = True
cursor = conn.cursor()

# SQL ファイルを読み込んで実行
sql_files = [
    "docker/init-db/01-schema.sql",
    "docker/init-db/02-seed.sql",
    "docker/init-db/03-sample-data.sql"
]

for sql_file in sql_files:
    print(f"Executing: {sql_file}")
    with open(sql_file, 'r') as f:
        cursor.execute(f.read())
    print(f"  Done")

cursor.close()
conn.close()
print("Database initialization completed!")
```

#### 方法2: Homebrew で psql をインストール（macOS）

```bash
brew install postgresql@16
```

#### 方法3: TablePlus などの GUI ツールを使用

TablePlus、pgAdmin、DBeaver などの GUI ツールで接続し、SQL ファイルの内容をコピー＆ペーストして実行。

---

## デプロイ後も古いファイルが表示される

### 症状

新しいコードをビルドして `az acr build` でイメージをプッシュし、`az containerapp update` を実行したが、ブラウザやサーバーが古いコンテンツを返し続けている。

### 原因

Azure Container Apps は `:latest` タグのイメージを自動的に更新検知しません。新しいイメージを同じ `:latest` タグでプッシュしても、既存のコンテナは古いイメージをキャッシュし続けます。

### 解決方法

#### 方法1: イメージダイジェストを指定（推奨）

```bash
# Step 1: イメージをビルド
az acr build \
  --registry aimailacr \
  --resource-group prothentia-mail \
  --image aimail-frontend:latest \
  --file Dockerfile.frontend \
  .

# ビルド出力の最後に表示されるダイジェストをコピー:
# latest: digest: sha256:abc123...

# Step 2: ダイジェストを使用してデプロイ
az containerapp update \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --image aimailacr.azurecr.io/aimail-frontend@sha256:abc123... \
  --revision-suffix "$(date +%Y%m%d%H%M%S)"
```

#### 方法2: タイムスタンプタグを使用

```bash
TAG="v$(date +%Y%m%d-%H%M%S)"
az acr build \
  --registry aimailacr \
  --resource-group prothentia-mail \
  --image aimail-frontend:$TAG \
  --file Dockerfile.frontend \
  .

az containerapp update \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --image aimailacr.azurecr.io/aimail-frontend:$TAG
```

### ブラウザキャッシュのクリア

サーバーが正しいファイルを返していても、ブラウザがキャッシュしている場合:

1. **ハードリフレッシュ**: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
2. **開発者ツール**: Application → Storage → Clear site data
3. **シークレットウィンドウ**: 新しいシークレットウィンドウで開く

---

## Cold Start: 初回アクセスが遅い

### 症状

しばらくアクセスしていないと、初回アクセス時に 10-30秒かかる。

### 原因

Cold Start 設定（Min Replicas = 0）により、使用されていない時にコンテナが自動的に停止しています。

### 動作確認

これは**正常な動作**です。Cold Start により、使用していない時はコストが発生しません。

```bash
# 現在のレプリカ数を確認
az containerapp revision list \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --output table
```

Replicas が 0 の場合、Cold Start 状態です。

### 解決方法（必要な場合）

本番環境で常時稼働が必要な場合、Min Replicas を 1 に変更:

```bash
# Frontend: Min Replicas を 1 に変更
az containerapp update \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --min-replicas 1

# Backend: Min Replicas を 1 に変更
az containerapp update \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --min-replicas 1
```

**注意**: Min Replicas を 1 にすると、月額コストが増加します。

---

## メール送信エラー: Microsoft Graph API

### 症状

メール送信時に以下のようなエラーが発生:

```
Error sending email: 403 Forbidden
```

または:

```
Insufficient privileges to complete the operation
```

### 原因

1. **API 権限の不足**: Microsoft Graph API の `Mail.Send` 権限がない
2. **管理者の同意がない**: アプリケーション権限に対する管理者の同意が必要
3. **認証情報の問題**: ENTRA_CLIENT_SECRET が正しくない

### 解決方法

#### Step 1: Azure Portal で API 権限を確認

1. Azure Portal → Microsoft Entra ID → App registrations
2. AI Mail アプリケーションを選択
3. **API permissions** を確認
4. `Microsoft Graph` > `Mail.Send` (Delegated) が追加されているか確認
5. 管理者の同意が与えられているか確認（緑のチェックマーク）

#### Step 2: 環境変数を確認

```bash
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env' \
  --output json | grep -E "(ENTRA|MAIL)"
```

必要な環境変数:
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET` (secretref)
- `MAIL_USE_GRAPH=true`

---

## データベース接続エラー

### 症状

Backend ログに以下のようなエラーが表示される:

```
psycopg2.OperationalError: could not connect to server: Connection refused
```

または:

```
FATAL: password authentication failed for user "mailagent_admin"
```

### 原因

1. **接続文字列の誤り**: DATABASE_URL が正しくない
2. **ファイアウォールルール**: PostgreSQL がコンテナからのアクセスを許可していない
3. **SSL 設定**: `sslmode=require` が必要

### 解決方法

#### Step 1: データベース接続文字列を確認

```bash
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env[?name==`DATABASE_URL`]'
```

正しい形式:
```
postgresql://mailagent_admin:<password>@aimail-db.postgres.database.azure.com:5432/mailagent_db?sslmode=require
```

#### Step 2: PostgreSQL ファイアウォールルールを確認

```bash
# Azure サービスからのアクセスを許可
az postgres flexible-server firewall-rule create \
  --resource-group prothentia-mail \
  --name aimail-db \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

#### Step 3: 接続をテスト

```bash
PGPASSWORD='<password>' psql \
  -h aimail-db.postgres.database.azure.com \
  -U mailagent_admin \
  -d mailagent_db \
  -c "SELECT version();"
```

---

## Backend が起動しない

### 症状

Backend Container App が "Failed" または "Unhealthy" 状態になる。

### 原因

1. **環境変数の不足**: 必須の環境変数（OPENAI_API_KEY など）が設定されていない
2. **Secret 参照エラー**: Secrets が正しく設定されていない
3. **依存関係エラー**: Python パッケージのインストールに失敗

### 解決方法

#### Step 1: ログを確認

```bash
az containerapp logs show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --tail 100
```

#### よくあるエラーと解決策

##### エラー 1: OPENAI_API_KEY が設定されていない

```
ValueError: OPENAI_API_KEY environment variable not set
```

**解決策**:
```bash
az containerapp secret set \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --secrets openai-api-key="your-actual-openai-api-key"

az containerapp update \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --set-env-vars "OPENAI_API_KEY=secretref:openai-api-key"
```

##### エラー 2: ENCRYPTION_KEY が無効

```
ValueError: Fernet key must be 32 url-safe base64-encoded bytes
```

**解決策**: 新しい暗号化キーを生成
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## Frontend が表示されない

### 症状

- HTTP 502 Bad Gateway エラー
- 空白ページが表示される
- ブラウザコンソールにエラーが表示される

### 原因

1. **Next.js ビルドの失敗**: ビルドエラーがある
2. **ポート設定の誤り**: ターゲットポートが 3000 でない
3. **環境変数の問題**: ビルド時に必要な変数が不足

### 解決方法

#### Step 1: ログを確認

```bash
az containerapp logs show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --tail 100
```

#### Step 2: ポート設定を確認

```bash
az containerapp show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --query 'properties.configuration.ingress.targetPort'
```

`3000` が返ることを確認。

#### Step 3: イメージを再ビルド

```bash
az acr build \
  --registry aimailacr \
  --resource-group prothentia-mail \
  --image aimail-frontend:latest \
  --file Dockerfile.frontend \
  .

az containerapp update \
  --name aimail-frontend \
  --resource-group prothentia-mail
```

---

## その他のトラブルシューティング

### イメージビルドが失敗する

**症状**: `az acr build` コマンドがエラーで終了する

**解決方法**:
```bash
# ローカルでビルドをテスト
docker build -f Dockerfile.frontend -t test-frontend .
docker build -f Dockerfile.backend -t test-backend .

# エラーメッセージを確認して修正
```

### リビジョンが "Running" のままになる

**症状**: 新しいリビジョンが "Running" 状態のまま "Active" にならない

**解決方法**:
```bash
# 現在のリビジョン一覧を確認
az containerapp revision list \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --output table

# ヘルスチェックエラーの可能性 - ログを確認
az containerapp logs show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --tail 100
```

---

## デバッグ用コマンド集

### 環境変数の確認

```bash
# Frontend 環境変数
az containerapp show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env' \
  --output json

# Backend 環境変数
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query 'properties.template.containers[0].env' \
  --output json
```

### リビジョンの詳細

```bash
# Frontend リビジョン詳細
az containerapp revision show \
  --revision <revision-name> \
  --resource-group prothentia-mail \
  -n aimail-frontend \
  --query '{revision:name, active:properties.active, health:properties.healthState, replicas:properties.replicas}'
```

### コンテナステータス

```bash
# Frontend ステータス
az containerapp show \
  --name aimail-frontend \
  --resource-group prothentia-mail \
  --query '{status:properties.runningStatus, latestRevision:properties.latestRevisionName, fqdn:properties.configuration.ingress.fqdn}'

# Backend ステータス
az containerapp show \
  --name aimail-backend \
  --resource-group prothentia-mail \
  --query '{status:properties.runningStatus, latestRevision:properties.latestRevisionName, fqdn:properties.configuration.ingress.fqdn}'
```

---

## サポート

問題が解決しない場合は、以下の情報を含めて報告してください:

- エラーメッセージの全文
- `az containerapp show` の出力
- `az containerapp logs show` の出力
- 実行したコマンドと結果

**主要リソース**:
- **Frontend URL**: https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/
- **Backend URL**: https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/
- **API ドキュメント**: https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/docs
- **Azure Portal**: https://portal.azure.com
- **リソースグループ**: `prothentia-mail`

---

**最終更新日**: 2026年2月13日
