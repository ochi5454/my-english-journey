# AI Mail - Azure 分離アーキテクチャ デプロイガイド

このドキュメントは AI Mail の分離アーキテクチャ（Cold Start 対応）のデプロイ情報と手順を記載しています。

**関連ドキュメント:**
- 📝 [再デプロイ手順](./REDEPLOYMENT.md) - アプリケーション更新時の手順
- 🔧 [トラブルシューティング](./TROUBLESHOOTING.md) - デプロイ時の問題と解決策
- 📊 [アーキテクチャ比較](../ARCHITECTURE_COMPARISON.md) - All-in-One との比較

---

## デプロイ情報

**デプロイ日**: 2026年2月13日
**リソースグループ**: `prothentia-mail`
**ロケーション**: 東日本 (japaneast)
**アーキテクチャ**: 分離デプロイ + Cold Start
**ステータス**: ✅ デプロイ完了

### アプリケーション URL

| サービス | URL | 説明 |
|---------|-----|------|
| **フロントエンド** | https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/ | ユーザーインターフェース |
| **バックエンド API** | https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/ | REST API |
| **API ドキュメント** | https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/docs | Swagger UI |
| **データベース** | aimail-db.postgres.database.azure.com | PostgreSQL (外部接続不可) |
| **Container Registry** | aimailacr.azurecr.io | Docker イメージ保存先 |

---

## アーキテクチャ

### 分離デプロイ構成

```
┌─────────────────────────────────────────────┐
│          インターネット (HTTPS)               │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│      Microsoft Entra ID (認証)              │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────────────────────┐
│               Container Apps Environment                 │
│  ┌─────────────────────┐  ┌────────────────────────┐   │
│  │  Frontend Container │  │  Backend Container     │   │
│  │  (Next.js 14)       │  │  (FastAPI)             │   │
│  │  Port: 3000         │  │  Port: 8000            │   │
│  │  Min Replicas: 0    │  │  Min Replicas: 0       │   │
│  │  Max Replicas: 3    │  │  Max Replicas: 5       │   │
│  │  CPU: 0.5, RAM: 1GB │  │  CPU: 1.0, RAM: 2GB    │   │
│  └─────────┬───────────┘  └────────┬───────────────┘   │
│            │ /api/                  │                    │
│            └────────────────────────┘                    │
└──────────────────────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────┐
│           Azure PostgreSQL Flexible Server               │
│           aimail-db (Managed)                            │
│           Tier: Burstable Standard_B1ms                  │
│           Storage: 32GB                                  │
│           Backup: 7 days                                 │
└──────────────────────────────────────────────────────────┘
```

### 主要な特徴

1. **Cold Start (min replicas = 0)**
   - 使用されていない時は自動的にスケールダウン
   - 初回リクエスト時に 10-30秒で起動
   - コスト最適化（使用時のみ課金）

2. **データベースの永続性**
   - Azure PostgreSQL Flexible Server を使用
   - 何度デプロイしてもデータは消えない
   - 自動バックアップ（7日間保持）

3. **個別スケーリング**
   - フロントエンドとバックエンドが独立してスケール
   - 負荷に応じて最適なリソース配分

---

## インフラストラクチャ詳細

### 1. Frontend Container App

- **名前**: `aimail-frontend`
- **イメージ**: `aimailacr.azurecr.io/aimail-frontend:latest`
- **Dockerfile**: `Dockerfile.frontend`
- **CPU**: 0.5 vCPU
- **メモリ**: 1.0 GiB
- **オートスケーリング**: 0-3 レプリカ (Cold Start)
- **ターゲットポート**: 3000
- **内容**: Next.js 14 (App Router, SSR)

### 2. Backend Container App

- **名前**: `aimail-backend`
- **イメージ**: `aimailacr.azurecr.io/aimail-backend:latest`
- **Dockerfile**: `Dockerfile.backend`
- **CPU**: 1.0 vCPU
- **メモリ**: 2.0 GiB
- **オートスケーリング**: 0-5 レプリカ (Cold Start)
- **ターゲットポート**: 8000
- **内容**: FastAPI + LangChain + OpenAI

### 3. PostgreSQL Database

- **名前**: `aimail-db`
- **サーバー**: aimail-db.postgres.database.azure.com
- **データベース**: mailagent_db
- **ユーザー**: mailagent_admin
- **Tier**: Burstable, Standard_B1ms (1 vCore, 2GB RAM)
- **ストレージ**: 32 GB
- **バックアップ保持**: 7 日間
- **接続**: SSL/TLS 必須

### 4. Container Registry

- **レジストリ**: `aimailacr.azurecr.io`
- **SKU**: Basic
- **認証**: Admin enabled

### 5. Container Apps Environment

- **名前**: `aimail-env`
- **Log Analytics**: `aimail-logs`

---

## 初回デプロイ手順

### 前提条件

```bash
# Azure CLI のインストールとログイン
az login
az account show

# 必要な環境変数を設定
export TENANT_ID="<your-tenant-id>"
export CLIENT_ID="<your-client-id>"
export CLIENT_SECRET="<your-client-secret>"
export OPENAI_API_KEY="<your-openai-key>"
export ACR_NAME="<your-acr-name>"
export RESOURCE_GROUP="prothentia-mail"
```

### ステップ1: リソースグループ作成

```bash
az group create \
  --name $RESOURCE_GROUP \
  --location japaneast
```

### ステップ2: Container Apps Environment 作成

```bash
# Log Analytics ワークスペース作成
az monitor log-analytics workspace create \
  --resource-group $RESOURCE_GROUP \
  --workspace-name aimail-logs \
  --location japaneast

# ワークスペース認証情報取得
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RESOURCE_GROUP \
  --workspace-name aimail-logs \
  --query customerId --output tsv)

WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group $RESOURCE_GROUP \
  --workspace-name aimail-logs \
  --query primarySharedKey --output tsv)

# Container Apps Environment 作成
az containerapp env create \
  --name aimail-env \
  --resource-group $RESOURCE_GROUP \
  --location japaneast \
  --logs-workspace-id $WORKSPACE_ID \
  --logs-workspace-key $WORKSPACE_KEY
```

### ステップ3: PostgreSQL Flexible Server 作成

```bash
# サーバー作成
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name aimail-db \
  --location japaneast \
  --admin-user mailagent_admin \
  --admin-password "<secure-password>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0-255.255.255.255

# データベース作成
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name aimail-db \
  --database-name mailagent_db

# 初期データ投入
PGPASSWORD='<secure-password>' psql \
  -h aimail-db.postgres.database.azure.com \
  -U mailagent_admin \
  -d mailagent_db \
  -f docker/init-db/01-schema.sql

# 残りのSQLファイルも同様に実行 (02-seed.sql, 03-sample-data.sql)
```

### ステップ4: Container Registry 作成

```bash
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --location japaneast \
  --admin-enabled true
```

### ステップ5: Frontend イメージビルドとデプロイ

```bash
# イメージビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-frontend:latest \
  --file Dockerfile.frontend \
  .

# ACR認証情報取得
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Container App 作成
az containerapp create \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --environment aimail-env \
  --image $ACR_NAME.azurecr.io/aimail-frontend:latest \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 3 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --env-vars \
    "NEXT_PUBLIC_API_BASE=https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io"
```

### ステップ6: Backend イメージビルドとデプロイ

```bash
# イメージビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-backend:latest \
  --file Dockerfile.backend \
  .

# Container App 作成
az containerapp create \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --environment aimail-env \
  --image $ACR_NAME.azurecr.io/aimail-backend:latest \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 5 \
  --cpu 1.0 \
  --memory 2.0Gi \
  --secrets \
    openai-api-key="$OPENAI_API_KEY" \
    session-secret-key="<your-session-secret>" \
    encryption-key="<your-encryption-key>" \
    entra-client-secret="$CLIENT_SECRET" \
  --env-vars \
    "DATABASE_URL=postgresql://mailagent_admin:<password>@aimail-db.postgres.database.azure.com:5432/mailagent_db?sslmode=require" \
    "OPENAI_API_KEY=secretref:openai-api-key" \
    "SESSION_SECRET_KEY=secretref:session-secret-key" \
    "ENCRYPTION_KEY=secretref:encryption-key" \
    "ENTRA_CLIENT_SECRET=secretref:entra-client-secret" \
    "ENTRA_CLIENT_ID=$CLIENT_ID" \
    "ENTRA_TENANT_ID=$TENANT_ID" \
    "ENTRA_REDIRECT_URI=https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/auth/callback" \
    "CORS_ORIGINS=https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io,http://localhost:3000" \
    "MAIL_USE_GRAPH=true" \
    "MAIL_FROM_NAME=AI Mail" \
    "TOKENIZERS_PARALLELISM=false"
```

### ステップ7: Microsoft Entra ID 設定

Azure Portal で以下のリダイレクト URI を追加:

```
https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/auth/callback
```

---

## デプロイ後の確認

### ヘルスチェック

```bash
# Frontend
curl https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/

# Backend
curl https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/docs

# Database
PGPASSWORD='<password>' psql \
  -h aimail-db.postgres.database.azure.com \
  -U mailagent_admin \
  -d mailagent_db \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
```

### ログの確認

```bash
# Frontend logs
az containerapp logs show \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --tail 50

# Backend logs
az containerapp logs show \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --tail 50
```

---

## 運用情報

### モニタリング

Log Analytics ワークスペース: `aimail-logs`
- Application Insights で詳細なメトリクスを確認可能
- Container Apps のメトリクスから CPU/メモリ使用率を監視

### バックアップ

- **データベース**: 自動バックアップ 7日間保持
- **コンテナイメージ**: ACR に全バージョン保持

### コスト

現在の構成での月額概算:
- Frontend Container: ¥2,500-5,000 (Cold Start)
- Backend Container: ¥5,000-10,000 (Cold Start)
- PostgreSQL Flexible Server: ¥15,000
- **合計**: 約 ¥22,500-30,000/月

※ All-in-One 構成（約 ¥2,600-4,100/月）と比較してコストは高いですが、データ永続性とデプロイ速度が大幅に向上

---

## 関連ドキュメント

- [再デプロイ手順](./REDEPLOYMENT.md) - コード更新時のデプロイ方法
- [トラブルシューティング](./TROUBLESHOOTING.md) - よくある問題と解決策
- [アーキテクチャ比較](../ARCHITECTURE_COMPARISON.md) - All-in-One との詳細比較
- [環境変数ガイド](../../setup/ENVIRONMENT_VARIABLES.md) - 環境変数の完全リスト

---

**最終更新**: 2026年2月13日
