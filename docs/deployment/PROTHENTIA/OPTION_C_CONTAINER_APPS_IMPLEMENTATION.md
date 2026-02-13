# Container Apps デプロイメント実装ガイド

## 概要

AI Mail は **Azure Container Apps** を使用してデプロイされる予定です。All-in-One Container アーキテクチャにより、本番環境に適した自動スケーリングとゼロダウンタイムデプロイメントを実現します。

**作成日**: 2026年2月13日
**ステータス**: ⏳ 準備中
**推定月額コスト**: 約¥2,600-4,100

---

## 🌐 本番環境 URL（予定）

| サービス | URL |
|---------|-----|
| **アプリケーション** | https://aimail-app.[environment-id].japaneast.azurecontainerapps.io/ |
| **API ドキュメント** | https://aimail-app.[environment-id].japaneast.azurecontainerapps.io/api/docs |

**カスタムドメイン**: 設定予定

---

## 🚀 クイックアップデートガイド（既存環境へのアップデート）

既に本番環境が稼働しており、新しいコード変更をデプロイする場合は、このセクションを参照してください。

### アプリケーション更新（コード変更を反映）

#### 方法 1: Azure ACR Build を使用（推奨）

```bash
# プロジェクトルートに移動
cd /path/to/ragtesting

# 1. ACRで直接イメージをビルド＆プッシュ
az acr build \
  --registry <your-acr-name> \
  --image aimail:latest \
  --platform linux/amd64 \
  --file Dockerfile.linux \
  .

# 2. Container App を自動更新（新しいイメージを検出）
az containerapp update \
  --name aimail-app \
  --resource-group <your-resource-group>

# 3. ヘルスチェックで確認
curl https://aimail-app.[environment-id].japaneast.azurecontainerapps.io/
```

**所要時間**: 10〜15分
**ダウンタイム**: なし（ローリングアップデート）

#### 方法 2: ローカルビルド（非推奨：docker push が不安定な場合あり）

```bash
# 1. ローカルでイメージをビルド
docker buildx build --platform linux/amd64 \
  -t <your-acr-name>.azurecr.io/aimail:latest \
  -f Dockerfile.linux .

# 2. ACRにログイン
az acr login --name <your-acr-name>

# 3. イメージをプッシュ
docker push <your-acr-name>.azurecr.io/aimail:latest

# 4. Container App を更新
az containerapp update \
  --name aimail-app \
  --resource-group <your-resource-group>
```

### 環境変数のみ更新

```bash
# 単一の環境変数を更新
az containerapp update \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --set-env-vars 'VARIABLE_NAME=new_value'

# シークレットを更新
az containerapp secret set \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --secrets openai-api-key="new-api-key-value"
```

**所要時間**: 1〜2分
**ダウンタイム**: なし（ローリングアップデート）

---

## インフラストラクチャコンポーネント

### 1. Log Analytics ワークスペース
- **名前**: `aimail-logs`
- **用途**: Container Apps の集中ログ管理・監視
- **ロケーション**: Japan East

### 2. Container Apps Environment
- **名前**: `aimail-env`
- **用途**: Container Apps をホストするマネージド環境
- **ロケーション**: Japan East
- **機能**:
  - Log Analytics との統合
  - 自動スケーリングインフラ
  - ゼロダウンタイムデプロイメント

### 3. Container App（All-in-One）
- **名前**: `aimail-app`
- **イメージ**: `<your-acr-name>.azurecr.io/aimail:latest`
- **ターゲットポート**: 3000（Next.js）
- **リソース**: 1.0 CPU、2.0Gi メモリ
- **スケーリング**: 1〜3 レプリカ（トラフィックに応じた自動スケーリング）
- **イングレス**: 外部 HTTPS（自動SSL）

**コンテナ内部構成**:
```
┌─────────────────────────────────────┐
│  Next.js Frontend (Port 3000)       │ ← 外部アクセスポイント
│    ├─ App Router (SSR)              │
│    └─ API Proxy → Backend           │
│    ↓ Proxy Pass                     │
│  FastAPI Backend (Port 8000)        │
│    ├─ Python 3.11                   │
│    ├─ LangChain                     │
│    └─ OpenAI API 統合               │
│    ↓                                │
│  PostgreSQL 16 (Port 5432)          │ ← 内蔵データベース
│                                     │
│  Managed by: supervisord            │ ← プロセス管理
└─────────────────────────────────────┘
```

### 4. Container Registry
- **名前**: `<your-acr-name>`
- **ロケーション**: Japan East
- **SKU**: Basic
- **ログインサーバー**: `<your-acr-name>.azurecr.io`

---

## 環境変数（Container App）

Container App は以下の環境変数を使用します：

### シークレット（secretref経由で参照）
- `OPENAI_API_KEY` - OpenAI API キー
- `SESSION_SECRET_KEY` - セッション署名用シークレット
- `ENCRYPTION_KEY` - データ暗号化キー（Fernet）
- `ENTRA_CLIENT_SECRET` - Microsoft Entra ID クライアントシークレット

### 通常の環境変数
```bash
# データベース（内蔵 PostgreSQL）
DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db

# Microsoft Entra ID 認証
ENTRA_TENANT_ID=<your-tenant-id>
ENTRA_CLIENT_ID=<your-client-id>
ENTRA_REDIRECT_URI=https://aimail-app.[environment-id].japaneast.azurecontainerapps.io/auth/callback

# メール設定（Microsoft Graph API）
MAIL_USE_GRAPH=true
MAIL_FROM_NAME=AI Mail

# アプリケーション設定
TOKENIZERS_PARALLELISM=false
```

**注意**: データベースは内蔵（localhost）を使用しているため、外部データベースサービスは不要

---

## デプロイ手順（初回）

### 前提条件

1. すべての Azure プロバイダーが登録済み:
   ```bash
   az provider register --namespace Microsoft.App
   az provider register --namespace Microsoft.OperationalInsights
   az provider register --namespace Microsoft.ContainerRegistry
   ```

2. Azure CLI にログイン済み:
   ```bash
   az login
   az account show
   ```

### フェーズ 1: インフラストラクチャ構築

```bash
# 変数設定
RESOURCE_GROUP="aimail-rg"
LOCATION="japaneast"
ENVIRONMENT_NAME="aimail-env"
LOG_ANALYTICS_WORKSPACE="aimail-logs"
ACR_NAME="<your-acr-name>"

# リソースグループ作成（まだない場合）
az group create --name $RESOURCE_GROUP --location $LOCATION

# Log Analytics ワークスペース作成
az monitor log-analytics workspace create \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_ANALYTICS_WORKSPACE \
  --location $LOCATION

# ワークスペース認証情報取得
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_ANALYTICS_WORKSPACE \
  --query customerId --output tsv)

WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group $RESOURCE_GROUP \
  --workspace-name $LOG_ANALYTICS_WORKSPACE \
  --query primarySharedKey --output tsv)

# Container Apps Environment 作成
az containerapp env create \
  --name $ENVIRONMENT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --logs-workspace-id $WORKSPACE_ID \
  --logs-workspace-key $WORKSPACE_KEY

# Container Registry 作成（まだない場合）
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --location $LOCATION
```

### フェーズ 2: Docker イメージビルド

```bash
# プロジェクトルートに移動
cd /path/to/ragtesting

# ACR で直接ビルド（推奨）
az acr build \
  --registry $ACR_NAME \
  --image aimail:latest \
  --platform linux/amd64 \
  --file Dockerfile.linux \
  .
```

### フェーズ 3: Container App デプロイ

```bash
# ACR認証情報取得
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)

# Container App デプロイ
az containerapp create \
  --name aimail-app \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $ACR_NAME.azurecr.io/aimail:latest \
  --target-port 3000 \
  --ingress external \
  --cpu 1.0 --memory 2.0Gi \
  --min-replicas 1 --max-replicas 3 \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --secrets \
    "openai-api-key=<your-openai-key>" \
    "session-secret-key=<your-session-secret>" \
    "encryption-key=<your-encryption-key>" \
    "entra-client-secret=<your-entra-client-secret>" \
  --env-vars \
    "OPENAI_API_KEY=secretref:openai-api-key" \
    "SESSION_SECRET_KEY=secretref:session-secret-key" \
    "ENCRYPTION_KEY=secretref:encryption-key" \
    "ENTRA_CLIENT_SECRET=secretref:entra-client-secret" \
    "TOKENIZERS_PARALLELISM=false" \
    "DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db" \
    "ENTRA_TENANT_ID=<your-tenant-id>" \
    "ENTRA_CLIENT_ID=<your-client-id>" \
    "ENTRA_REDIRECT_URI=https://aimail-app.[environment-id].japaneast.azurecontainerapps.io/auth/callback" \
    "MAIL_USE_GRAPH=true" \
    "MAIL_FROM_NAME=AI Mail"

# デプロイ確認
az containerapp show \
  --name aimail-app \
  --resource-group $RESOURCE_GROUP \
  --query '{status:properties.runningStatus, fqdn:properties.configuration.ingress.fqdn}'
```

### フェーズ 4: Microsoft Entra ID 設定

デプロイ後、Container App の FQDN を取得し、リダイレクト URI を更新します：

```bash
# Container App の FQDN を取得
FQDN=$(az containerapp show \
  --name aimail-app \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "リダイレクト URI として設定: https://$FQDN/auth/callback"

# Azure Portal で Microsoft Entra ID アプリ登録のリダイレクト URI を更新
# - https://$FQDN/auth/callback を Web プラットフォームに追加
```

---

## All-in-One Docker イメージ（Dockerfile.linux）

AI Mail は All-in-One アーキテクチャを採用しており、単一のコンテナ内で以下をすべて実行します：

### Dockerfile.linux の主要な特徴

```dockerfile
# Ubuntu 22.04 ベース
FROM ubuntu:22.04

# フロントエンド (Node.js 20 + Next.js 14)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# バックエンド (Python 3.11 + FastAPI)
RUN apt-get install -y python3.11 python3.11-venv python3-pip

# データベース (PostgreSQL 16)
RUN apt-get install -y postgresql-16 postgresql-contrib-16

# プロセス管理 (Supervisor)
RUN apt-get install -y supervisor

# ポート公開
EXPOSE 3000 8000 5432

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/ && \
        curl -f http://localhost:8000/docs && \
        pg_isready -U mailagent_user -d mailagent_db || exit 1

# エントリーポイント
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

### Supervisor 設定（supervisord.conf）

```ini
[supervisord]
nodaemon=true

[program:postgresql]
command=/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main -c config_file=/etc/postgresql/16/main/postgresql.conf
priority=1
autostart=true

[program:backend]
command=/app/venv/bin/uvicorn backend.app:app --host 0.0.0.0 --port 8000
directory=/app
priority=2
autostart=true

[program:frontend]
command=npm start
directory=/app/frontend
priority=3
autostart=true
environment=PORT="3000"
```

---

## トラブルシューティング

### よくある問題

#### 1. Docker Push がハングする

**症状**: `docker push` コマンドが全レイヤー転送後にハング

**解決策**: Azure ACR Build を使用
```bash
az acr build \
  --registry <your-acr-name> \
  --image aimail:latest \
  --platform linux/amd64 \
  --file Dockerfile.linux \
  .
```

#### 2. コンテナが起動しない

**症状**: Container App が "Failed" 状態

**解決策**: ログを確認
```bash
az containerapp logs show \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --tail 100

# よくある原因:
# - entrypoint.sh の改行コードが CRLF
# - 環境変数の不足
# - PostgreSQL の初期化失敗
```

#### 3. データベース接続エラー

**症状**: Backend が PostgreSQL に接続できない

**解決策**:
- DATABASE_URL が `localhost` を指しているか確認
- PostgreSQL サービスが起動しているか確認
- entrypoint.sh でデータベース初期化が完了しているか確認

#### 4. フロントエンドが表示されない

**症状**: HTTP 502 または空白ページ

**解決策**:
- Next.js がビルドされているか確認
- next.config.js の設定を確認
- フロントエンドログを確認

#### 5. Microsoft Entra ID 認証エラー

**症状**: ログイン後にリダイレクトエラー

**解決策**:
- Entra ID アプリ登録のリダイレクト URI が正しいか確認
- ENTRA_REDIRECT_URI 環境変数がデプロイ先の URL と一致しているか確認
- クライアントシークレットが正しく設定されているか確認

---

## ログ確認

### リアルタイムログ

```bash
# すべてのログをストリーム
az containerapp logs show \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --follow

# 最新 100 行
az containerapp logs show \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --tail 100
```

### コンテナステータス

```bash
# Container App ステータス
az containerapp show \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --query '{status:properties.runningStatus, revision:properties.latestRevisionName, fqdn:properties.configuration.ingress.fqdn}'

# リビジョン一覧
az containerapp revision list \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --output table
```

---

## コスト内訳

| リソース | 月額コスト | 備考 |
|----------|------------|------|
| Log Analytics ワークスペース | ¥500-1,000 | ログ保存量による |
| Container App（自動スケーリング） | ¥1,500-2,500 | レプリカ数・実行時間による |
| Container Registry（Basic） | ¥600 | 固定 |
| **合計** | **¥2,600-4,100** | トラフィックにより変動 |

**コスト削減のヒント**:
- 低トラフィック時に min-replicas を 0 に設定（ゼロスケール）
- 古いイメージを定期的に削除
- Log Analytics の保存期間を調整

---

## All-in-One アーキテクチャのメリット

✅ **シンプルな構成**: 1つのコンテナのみで完結
✅ **低コスト**: 複数のマネージドサービス不要（月額約 ¥2,600-4,100）
✅ **高速**: 内部通信（ネットワーク遅延なし）
✅ **簡単なデプロイ**: 1コマンドで完了
✅ **ポータビリティ**: どこでも同じ環境で実行可能
✅ **開発環境との一致**: ローカルと本番で同じ構成

---

## メンテナンス

### アプリケーション更新

```bash
# 新しいイメージをビルド
az acr build \
  --registry <your-acr-name> \
  --image aimail:latest \
  --platform linux/amd64 \
  --file Dockerfile.linux \
  .

# Container App を更新（ゼロダウンタイム）
az containerapp update \
  --name aimail-app \
  --resource-group <your-resource-group>
```

### ロールバック

```bash
# 利用可能なリビジョンを確認
az containerapp revision list \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --output table

# 特定のリビジョンをアクティブ化
az containerapp revision activate \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --revision <revision-name>
```

---

## セキュリティ注意事項

1. **シークレット管理**:
   - 機密情報はすべて Container App Secrets として保存
   - 環境変数から `secretref:` で参照
   - 将来的に Azure Key Vault への移行を検討

2. **ネットワークセキュリティ**:
   - 外部イングレス（HTTPS のみ）
   - 自動 SSL 証明書
   - データベースは内部通信のみ（localhost）

3. **認証**:
   - Microsoft Entra ID によるユーザー認証
   - セッションベースの API 認証
   - Microsoft Graph API によるメール送信（ユーザー権限で送信）

---

## データ永続化

All-in-One アーキテクチャでは、データベースがコンテナ内に存在します。データを保護するため、以下の対策を実装します：

### Azure Files ボリュームマウント

```bash
# Azure Files ストレージアカウント作成
az storage account create \
  --name aimailstorage \
  --resource-group <your-resource-group> \
  --location japaneast \
  --sku Standard_LRS

# ファイル共有作成
az storage share create \
  --name aimail-pgdata \
  --account-name aimailstorage

# Container App にボリュームをマウント
az containerapp update \
  --name aimail-app \
  --resource-group <your-resource-group> \
  --set-env-vars "PGDATA=/mnt/pgdata"
```

### 定期バックアップ

```bash
# バックアップ用 Blob コンテナ作成
az storage container create \
  --name aimail-backups \
  --account-name aimailstorage

# コンテナ内でバックアップを実行（手動）
# pg_dump -U mailagent_user mailagent_db > backup.sql
```

---

## 関連ドキュメント

- [OPTIONS.md](./OPTIONS.md) - デプロイメントオプション概要
- [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md) - アーキテクチャ比較
- [DOCKER_ARCHITECTURE.md](../setup/DOCKER_ARCHITECTURE.md) - Docker 構成詳細
- [ENVIRONMENT_VARIABLES.md](../setup/ENVIRONMENT_VARIABLES.md) - 環境変数ガイド
- [MICROSOFT_ENTRA_ID.md](../auth/MICROSOFT_ENTRA_ID.md) - Entra ID 設定ガイド

---

**最終更新**: 2026年2月13日
**対象システム**: AI Mail
**アーキテクチャ**: All-in-One Container on Azure Container Apps
