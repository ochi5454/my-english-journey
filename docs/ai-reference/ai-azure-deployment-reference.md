# Azureデプロイリファレンス（AI開発アシスタント用）
## フロントエンド + バックエンドデプロイ自動化ガイド

> **このドキュメントの目的**  
> Azure Container AppsとAzure Static Web Appsへのデプロイ手順を標準化します。コード生成・デプロイスクリプト作成時は、必ずこのガイドに従ってください。

---

## 🎯 デプロイアーキテクチャ

### システム構成

```
フロントエンド (React/Vite)
  ↓ ビルド
Azure Static Web Apps (production/staging)

バックエンド (FastAPI/Python)
  ↓ Oryxビルド
Azure Container Apps (Dockerコンテナ)
  ↓ 接続
PostgreSQL Database
```

### デプロイ対象の分離

| コンポーネント | 技術スタック | デプロイ先 | ビルド方式 |
|---|---|---|---|
| **フロントエンド** | React + TypeScript + Vite | Azure Static Web Apps | Viteビルド |
| **バックエンド** | FastAPI + Python 3.11 | Azure Container Apps | Oryxビルド（自動Docker化） |

---

## 📋 デプロイ前提条件チェック

### 必須ツール

コード生成時は、以下のツールが利用可能であることを前提とします：

```bash
# Azure CLI（必須）
az --version

# Git（必須）
git --version

# Node.js & npm（フロントエンド用）
node --version
npm --version

# Python（バックエンド用・検証のみ）
python --version
```

### 必須ファイル構成

デプロイ前に以下のファイルが存在することを確認：

#### フロントエンド

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.production        # 本番環境変数
├── .env.staging          # ステージング環境変数（推奨）
└── src/
```

#### バックエンド

```
backend/
├── application.py         # Oryx互換レイヤー（必須）
├── runtime.txt           # Python 3.11指定（必須）
├── requirements.txt      # gunicorn含む（必須）
├── containerapp.yaml     # Container Apps設定（必須）
└── app/
    └── main.py           # FastAPIアプリ
```

---

## 🚀 フロントエンドデプロイ手順

### Step 1: ビルド

```bash
cd frontend

# 本番環境用ビルド
npm run build

# ステージング環境用ビルド（オプション）
npm run build -- --mode staging
```

**出力先**: `frontend/dist/`

**環境変数ファイル**:
- `npm run build` → `.env.production` を使用
- `npm run build -- --mode staging` → `.env.staging` を使用

### Step 2: デプロイトークン取得

```bash
# Windows環境の場合（Git Bash）
export PATH="/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin:$PATH"

# デプロイトークン取得
DEPLOY_TOKEN=$(az staticwebapp secrets list \
  --name <STATIC_WEBAPP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --query "properties.apiKey" \
  -o tsv)
```

### Step 3: デプロイ実行

```bash
# 本番環境にデプロイ
npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$DEPLOY_TOKEN" \
  --env production

# ステージング環境にデプロイ
npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$DEPLOY_TOKEN" \
  --env staging
```

**重要**: `--env` パラメータは**必須**。指定しないと予期しない環境にデプロイされる。

### デプロイ確認

```bash
# 環境一覧と最終更新時刻確認
az staticwebapp environment list \
  --name <STATIC_WEBAPP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --query "[].{環境:name, URL:hostname, 更新:lastUpdatedOn}" \
  -o table
```

---

## 🔧 バックエンドデプロイ手順

### 必須ファイルの準備

#### 1. `backend/application.py`（Oryx互換レイヤー）

```python
"""
Oryx compatibility layer
Oryxのデフォルトスタートアップスクリプトは 'application:app' を探すため、
このファイルで app.main:app をインポートしてエクスポートする
"""
from app.main import app

__all__ = ['app']
```

#### 2. `backend/runtime.txt`（Python バージョン指定）

```
python-3.11
```

#### 3. `backend/requirements.txt`（依存関係）

**必須**: `gunicorn>=21.2.0` を含めること（ASGIサポート）

```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
gunicorn>=21.2.0
sqlalchemy>=2.0.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
python-multipart>=0.0.6
psycopg2-binary>=2.9.0
cryptography>=42.0.0
python-dotenv>=1.0.0
```

#### 4. `backend/containerapp.yaml`（Container Apps設定）

```yaml
properties:
  configuration:
    secrets:
      - name: secret-key
      - name: encryption-keys
      - name: encryption-key
      - name: database-url
      - name: anthropic-api-key
      # その他のシークレット
    
    ingress:
      external: true
      targetPort: 8000
      transport: auto
  
  template:
    containers:
      - image: <REGISTRY_NAME>.azurecr.io/<APP_NAME>:<IMAGE_TAG>
        name: <APP_NAME>
        env:
          - name: ENVIRONMENT
            value: production
          - name: SECRET_KEY
            secretRef: secret-key
          - name: ENCRYPTION_KEYS
            secretRef: encryption-keys
          - name: ENCRYPTION_KEY
            secretRef: encryption-key
          - name: DATABASE_URL
            secretRef: database-url
          - name: ANTHROPIC_API_KEY
            secretRef: anthropic-api-key
          # その他の環境変数
        resources:
          cpu: 0.5
          memory: 1Gi
        
        command:
          - /bin/bash
          - -c
        args:
          - |
            gunicorn application:app \
              --workers 1 \
              --worker-class uvicorn.workers.UvicornWorker \
              --bind 0.0.0.0:8000 \
              --timeout 120 \
              --access-logfile - \
              --error-logfile -
```

**重要ポイント**:
- `--worker-class uvicorn.workers.UvicornWorker`: ASGI対応（FastAPI必須）
- `command` と `args`: スタートアップコマンドを明示的に指定
- `secretRef`: 機密情報はシークレット参照

---

### Step 1: Oryxビルド＆デプロイ

```bash
# Windows環境の場合
export PATH="/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin:$PATH"
export PYTHONIOENCODING=utf-8  # エンコーディングエラー対策

# Oryxビルド＆初回デプロイ
az containerapp up \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --source backend \
  --ingress external \
  --target-port 8000 \
  --env-vars AZURE_ENV=production
```

**ビルドプロセス**:
1. Oryxがソースコードを解析
2. `runtime.txt`からPython 3.11を検出
3. 仮想環境作成・依存関係インストール
4. Dockerイメージ自動生成
5. Azure Container Registryにプッシュ

**所要時間**: 約4〜5分

**出力から取得すべき情報**:
- **イメージタグ**（例: `20260124134027202641`）

例：
```
Successfully pushed image <REGISTRY>.azurecr.io/<APP>:20260124134027202641
                                                      ↑
                                              このタグをメモ
```

---

### Step 2: containerapp.yaml更新

```bash
# 1. backend/containerapp.yaml を編集
#    image: の行のタグを Step 1 で取得したタグに更新

# 2. 更新した設定を適用
az containerapp update \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --yaml backend/containerapp.yaml
```

---

### Step 3: シークレット登録（初回または変更時のみ）

```bash
# シークレット登録
az containerapp secret set \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --secrets \
    secret-key="<VALUE>" \
    encryption-keys="<VALUE>" \
    encryption-key="<VALUE>" \
    database-url="<VALUE>" \
    anthropic-api-key="<VALUE>"
    # その他のシークレット
```

**注意**:
- シークレット値は `.env.prod` ファイルから取得
- 値にスペースや特殊文字が含まれる場合はクォートで囲む
- シークレット変更後は環境変数の再設定（Step 4）で新リビジョン作成

---

### Step 4: 環境変数設定

```bash
az containerapp update \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --set-env-vars \
    ENVIRONMENT=production \
    SECRET_KEY=secretref:secret-key \
    ENCRYPTION_KEYS=secretref:encryption-keys \
    ENCRYPTION_KEY=secretref:encryption-key \
    DATABASE_URL=secretref:database-url \
    ANTHROPIC_API_KEY=secretref:anthropic-api-key \
    "CORS_ORIGINS=<FRONTEND_URL_1>,<FRONTEND_URL_2>" \
    ALLOWED_HOSTS=<BACKEND_HOST> \
    FRONTEND_URL=<FRONTEND_URL> \
    LOG_LEVEL=INFO
    # その他の環境変数
```

**重要**:
- `secretref:` プレフィックス：シークレット参照
- CORS_ORIGINS：カンマ区切り、クォートで囲む
- 機密情報は必ず `secretref:` を使用

---

### Step 5: 動作確認

```bash
# ログ確認（最新30行）
az containerapp logs show \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --tail 30

# リアルタイムログ監視
az containerapp logs show \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --follow

# API疎通確認
curl https://<BACKEND_HOST>/
```

**成功の確認ポイント**:

| ログメッセージ | 意味 | 重要度 |
|---|---|---|
| `Using worker: uvicorn.workers.UvicornWorker` | ASGI対応確認 | 必須 |
| `Application startup complete` | FastAPI起動成功 | 必須 |
| `Database initialized successfully!` | DB接続成功 | 必須 |
| `GET / HTTP/1.1" 200` | API正常応答 | 推奨 |

---

## 🗄️ データベースマイグレーション

### PostgreSQL互換性

**重要**: 本番環境はPostgreSQLを使用。SQLite構文は使用不可。

### 禁止構文と正しい構文

| SQLite構文（❌禁止） | PostgreSQL構文（✅必須） | 用途 |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | 自動採番主キー |
| `datetime('now')` | `NOW()` または `CURRENT_TIMESTAMP` | 現在時刻 |
| `DATETIME` | `TIMESTAMP` | 日時型 |

### マイグレーションスクリプト配置

```
backend/scripts/
├── dev/                  # 開発環境用（SQLite構文OK）
│   └── *.py
└── prod/                 # 本番環境用（PostgreSQL構文必須）
    └── *.py
```

### マイグレーションスクリプト実装パターン

```python
# backend/scripts/prod/add_table_example.py
from sqlalchemy import create_engine, text
import os

def run_migration():
    """PostgreSQL互換マイグレーション"""
    database_url = os.getenv('DATABASE_URL')
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        # ✅ PostgreSQL構文
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS example_table (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.commit()
    
    print("✅ Migration completed successfully")

if __name__ == "__main__":
    run_migration()
```

**実行**:
```bash
# 本番環境で実行（Container Apps内で）
python backend/scripts/prod/add_table_example.py
```

---

## 🔍 トラブルシューティング

### 1. ASGI/WSGI問題

**症状**: `TypeError: FastAPI.__call__() missing 1 required positional argument: 'send'`

**原因**: WSGIワーカーでFastAPIを起動している

**解決**:
- `containerapp.yaml` で `--worker-class uvicorn.workers.UvicornWorker` を指定
- `requirements.txt` に `gunicorn>=21.2.0` を含める

---

### 2. 環境変数が反映されない

**症状**: アプリ起動失敗、設定が読み込まれない

**原因**: 
- 環境変数が設定されていない
- シークレットが未登録

**解決**:
```bash
# シークレット確認
az containerapp secret list \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME>

# 環境変数確認
az containerapp show \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --query "properties.template.containers[0].env" \
  -o table

# 環境変数再設定
az containerapp update --set-env-vars ...
```

---

### 3. CORS エラー

**症状**: フロントエンドからAPIアクセスできない

**原因**: `CORS_ORIGINS` にフロントエンドURLが含まれていない

**解決**:
```bash
az containerapp update \
  --set-env-vars \
    "CORS_ORIGINS=<FRONTEND_PRODUCTION_URL>,<FRONTEND_STAGING_URL>"
```

---

### 4. ビルド時のエンコーディングエラー（Windows）

**症状**: `cp932` エンコーディングエラー

**原因**: Windowsのデフォルトエンコーディング

**解決**:
```bash
export PYTHONIOENCODING=utf-8
```

**注意**: エラーが表示されてもビルド自体は成功していることが多い。
出力末尾の「Successfully pushed image」を確認すること。

---

## 📝 デプロイスクリプトテンプレート

### フロントエンドデプロイスクリプト

```bash
#!/bin/bash
# deploy-frontend-production.sh

set -e  # エラー時に停止

export PATH="/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin:$PATH"

echo "🚀 フロントエンド本番デプロイ開始..."

# 1. ビルド
echo "1. ビルド実行中..."
cd frontend
npm run build

# 2. デプロイトークン取得
echo "2. デプロイトークン取得中..."
DEPLOY_TOKEN=$(az staticwebapp secrets list \
  --name <STATIC_WEBAPP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --query "properties.apiKey" \
  -o tsv)

# 3. デプロイ
echo "3. 本番環境にデプロイ中..."
npx @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$DEPLOY_TOKEN" \
  --env production

echo "✅ デプロイ完了！"
echo "🌐 URL: <FRONTEND_PRODUCTION_URL>"
```

---

### バックエンドデプロイスクリプト

```bash
#!/bin/bash
# deploy-backend-production.sh

set -e

export PATH="/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin:$PATH"
export PYTHONIOENCODING=utf-8

echo "🚀 バックエンド本番デプロイ開始..."

# 1. Oryxビルド＆デプロイ
echo "1. ビルド実行中（4-5分）..."
az containerapp up \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --source backend \
  --ingress external \
  --target-port 8000 \
  --env-vars AZURE_ENV=production

# 2. イメージタグ入力促す
echo ""
echo "⚠️  出力されたイメージタグをメモしてください"
echo "    例: 20260124134027202641"
echo ""
read -p "イメージタグを入力してください: " IMAGE_TAG

# 3. containerapp.yaml更新（手動または自動）
echo "3. containerapp.yaml を更新してください..."
echo "   image: <REGISTRY>.azurecr.io/<APP_NAME>:$IMAGE_TAG"
read -p "更新完了したらEnterを押してください..."

# 4. 設定適用
echo "4. 設定適用中..."
az containerapp update \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --yaml backend/containerapp.yaml

# 5. 環境変数設定
echo "5. 環境変数設定中..."
az containerapp update \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --set-env-vars \
    ENVIRONMENT=production \
    SECRET_KEY=secretref:secret-key \
    # ... その他の環境変数

# 6. 動作確認
echo "6. 動作確認中..."
az containerapp logs show \
  --name <CONTAINER_APP_NAME> \
  --resource-group <RESOURCE_GROUP_NAME> \
  --tail 30

echo "✅ デプロイ完了！"
echo "🌐 URL: <BACKEND_URL>"
```

---

## ✅ デプロイチェックリスト

### デプロイ前

- [ ] Gitでコミット・プッシュ済み
- [ ] ローカル環境で動作確認済み
- [ ] `.env.production` / `.env.prod` ファイル確認済み
- [ ] `az login` でログイン済み
- [ ] 必須ファイルが存在（`application.py`, `runtime.txt`, `containerapp.yaml`）

### フロントエンドデプロイ

- [ ] `npm run build` 成功
- [ ] `--env production` を指定
- [ ] デプロイ完了確認（environment list）
- [ ] ブラウザで動作確認

### バックエンドデプロイ

- [ ] `az containerapp up` 成功
- [ ] イメージタグをメモ
- [ ] `containerapp.yaml` 更新・適用
- [ ] 環境変数設定
- [ ] ログで起動成功確認
- [ ] API疎通確認（`curl`）

### デプロイ後

- [ ] 本番環境で動作確認
- [ ] ログイン機能確認
- [ ] データ取得・表示確認
- [ ] 主要機能の動作確認
- [ ] エラーログ確認

---

## 🔐 セキュリティベストプラクティス

### シークレット管理

**絶対に禁止**:
- ❌ コードにシークレットをハードコーディング
- ❌ Gitにシークレットをコミット
- ❌ 環境変数に平文でシークレットを設定

**必須**:
- ✅ Azure Container Appsのシークレット機能を使用
- ✅ 環境変数で `secretref:` を使用
- ✅ `.env.prod` は `.gitignore` に追加

### 環境変数の分類

| 情報の種類 | 設定方法 | 例 |
|---|---|---|
| **機密情報** | `secretref:secret-name` | API キー、DB URL、暗号化キー |
| **公開情報** | 直接設定 | `ENVIRONMENT=production` |
| **URL** | 直接設定 | `FRONTEND_URL=https://...` |

---

## 📊 デプロイフロー図

```
[開発者]
   ↓
[Git commit & push]
   ↓
[デプロイ実行]
   ↓
   ├─ [フロントエンド]
   │    ↓ npm run build
   │    ↓ SWA CLI deploy
   │    └─→ [Azure Static Web Apps]
   │
   └─ [バックエンド]
        ↓ az containerapp up
        ↓ containerapp.yaml更新
        ↓ 環境変数設定
        └─→ [Azure Container Apps]
              ↓
           [PostgreSQL]
```

---

**このガイドに従って、一貫性のある安全なデプロイを実行してください。**
