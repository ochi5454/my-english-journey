# 再デプロイガイド - アプリケーションの更新

このガイドでは、コード変更後に AI Mail アプリケーションを再デプロイする方法を説明します。

**関連ドキュメント:**
- 📦 [初回デプロイ情報](./DEPLOYMENT.md) - インフラ構成と初回デプロイ手順
- 🔧 [トラブルシューティング](./TROUBLESHOOTING.md) - デプロイ時の問題と解決策
- 📊 [アーキテクチャ比較](../ARCHITECTURE_COMPARISON.md) - All-in-One との比較

---

## アーキテクチャ概要

このデプロイは **分離アーキテクチャ + Cold Start** を使用しています:

- **Frontend Container**: Next.js 14 (App Router, SSR)
- **Backend Container**: FastAPI + LangChain
- **Database**: Azure PostgreSQL Flexible Server (外部マネージドサービス)

**重要**: データベースは外部サービスのため、何度デプロイしてもデータは消えません。

---

## クイック再デプロイプロセス

### 前提条件

- Azure CLI がインストールされログイン済み
- `prothentia-mail` リソースグループへのアクセス権
- 環境変数が設定済み（初回デプロイ時に設定）

```bash
# Azure CLI ログイン確認
az login
az account show

# 環境変数設定
export ACR_NAME="aimailacr"
export RESOURCE_GROUP="prothentia-mail"
```

---

## シナリオ別デプロイ手順

### シナリオ 1: フロントエンドのみ変更（React コンポーネント、スタイルなど）

**デプロイ時間**: 約 2-3 分

#### ステップ 1: イメージのビルド

```bash
# プロジェクトルートに移動
cd /path/to/ragtesting

# Frontend イメージをビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-frontend:latest \
  --file Dockerfile.frontend \
  .
```

#### ステップ 2: Container App の更新

```bash
# Frontend Container App を更新
az containerapp update \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP
```

Container Apps は自動的に新しいイメージを検出し、ゼロダウンタイムで新しいリビジョンを作成します。

#### ステップ 3: デプロイの確認

```bash
# リビジョンのステータスを確認
az containerapp revision list \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --output table

# アプリケーションが応答していることを確認
curl https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/
```

---

### シナリオ 2: バックエンドのみ変更（API、ビジネスロジックなど）

**デプロイ時間**: 約 5-7 分

#### ステップ 1: イメージのビルド

```bash
# プロジェクトルートに移動
cd /path/to/ragtesting

# Backend イメージをビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-backend:latest \
  --file Dockerfile.backend \
  .
```

#### ステップ 2: Container App の更新

```bash
# Backend Container App を更新
az containerapp update \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP
```

#### ステップ 3: デプロイの確認

```bash
# リビジョンのステータスを確認
az containerapp revision list \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --output table

# API ドキュメントを確認
curl https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/docs
```

---

### シナリオ 3: 両方を変更（フロントエンド + バックエンド）

**デプロイ時間**: 約 5-7 分（並行ビルド）

#### オプション A: 並行ビルド（推奨）

2つの ACR ビルドを並行して実行:

```bash
# ターミナル 1: Frontend ビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-frontend:latest \
  --file Dockerfile.frontend \
  . &

# ターミナル 2: Backend ビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-backend:latest \
  --file Dockerfile.backend \
  . &

# 両方のビルドが完了するまで待つ
wait
```

#### オプション B: 順次ビルド

```bash
# Frontend をビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-frontend:latest \
  --file Dockerfile.frontend \
  .

# Backend をビルド
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-backend:latest \
  --file Dockerfile.backend \
  .
```

#### ステップ 2: 両方の Container Apps を更新

```bash
# Frontend を更新
az containerapp update \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP

# Backend を更新
az containerapp update \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP
```

---

### シナリオ 4: 環境変数のみ更新

イメージを再ビルドせずに環境変数のみを更新する場合。

#### Frontend 環境変数の更新

```bash
az containerapp update \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    'NEXT_PUBLIC_API_BASE=https://new-backend-url.azurecontainerapps.io'
```

**注意**: Next.js は `NEXT_PUBLIC_*` 環境変数をビルド時に埋め込む場合があります。ランタイム環境変数として機能させるには、Next.js の設定で明示的にサーバーサイドで読み込む必要があります。

#### Backend 環境変数の更新

```bash
az containerapp update \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars \
    'MAIL_FROM_NAME=AI Mail System' \
    'TOKENIZERS_PARALLELISM=false'
```

#### シークレット値の更新

```bash
# まずシークレットを更新
az containerapp secret set \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --secrets openai-api-key="new-api-key-value"

# 変更を適用するためにアプリを再起動
az containerapp revision restart \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP
```

---

### シナリオ 5: データベーススキーマの変更

データベーススキーマを更新する必要がある場合。

**重要**: データベースは外部の Azure PostgreSQL Flexible Server です。

#### オプション A: Alembic マイグレーション経由（推奨）

```bash
# プロジェクトルートに移動
cd /path/to/ragtesting

# マイグレーションを作成
cd backend
alembic revision --autogenerate -m "description"

# Backend イメージを再ビルド（マイグレーションを含む）
cd ..
az acr build \
  --registry $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --image aimail-backend:latest \
  --file Dockerfile.backend \
  .

# Backend を更新（起動時にマイグレーション実行）
az containerapp update \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP
```

#### オプション B: 直接 SQL 実行

```bash
# PostgreSQL に接続
PGPASSWORD='<password>' psql \
  -h aimail-db.postgres.database.azure.com \
  -U mailagent_admin \
  -d mailagent_db \
  -f your_migration.sql
```

---

## 以前のバージョンへのロールバック

以前のリビジョンにロールバックする必要がある場合。

### Frontend のロールバック

```bash
# 利用可能なリビジョンを一覧表示
az containerapp revision list \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --output table

# 以前のリビジョンをアクティブ化
az containerapp revision activate \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --revision <revision-name>
```

### Backend のロールバック

```bash
# 利用可能なリビジョンを一覧表示
az containerapp revision list \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --output table

# 以前のリビジョンをアクティブ化
az containerapp revision activate \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --revision <revision-name>
```

### トラフィック分割の設定（Blue-Green デプロイ）

```bash
# Frontend: 新しいリビジョンに50%、古いリビジョンに50%
az containerapp ingress traffic set \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --revision-weight <new-revision>=50 <old-revision>=50

# テスト後、新しいリビジョンに100%
az containerapp ingress traffic set \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --revision-weight <new-revision>=100
```

---

## デプロイの進捗状況の監視

### Frontend ログの監視

```bash
# リアルタイムログを表示
az containerapp logs show \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --follow

# 最新50行を表示
az containerapp logs show \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --tail 50
```

### Backend ログの監視

```bash
# リアルタイムログを表示
az containerapp logs show \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --follow

# 最新50行を表示
az containerapp logs show \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --tail 50
```

### コンテナのステータス確認

```bash
# Frontend のステータス
az containerapp show \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --query '{status:properties.runningStatus, latestRevision:properties.latestRevisionName, fqdn:properties.configuration.ingress.fqdn}'

# Backend のステータス
az containerapp show \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --query '{status:properties.runningStatus, latestRevision:properties.latestRevisionName, fqdn:properties.configuration.ingress.fqdn}'
```

### レプリカ数の確認（Cold Start）

```bash
# Frontend レプリカ数
az containerapp revision show \
  --revision <revision-name> \
  --resource-group $RESOURCE_GROUP \
  -n aimail-frontend \
  --query '{revision:name, replicas:properties.replicas, active:properties.active}'

# Backend レプリカ数
az containerapp revision show \
  --revision <revision-name> \
  --resource-group $RESOURCE_GROUP \
  -n aimail-backend \
  --query '{revision:name, replicas:properties.replicas, active:properties.active}'
```

**Cold Start 設定**: Min Replicas = 0 のため、使用されていない時は自動的にレプリカが0になります。

---

## デプロイチェックリスト

### デプロイ前

- [ ] コード変更をコミットし、ローカルでテスト済み
- [ ] データベースマイグレーションをテスト済み（該当する場合）
- [ ] 環境変数を確認済み
- [ ] Azure CLI にログイン済み（`az login`）
- [ ] 変更したコンポーネントを特定（Frontend/Backend/両方）

### デプロイ中

- [ ] ACR で新しいイメージをビルド
- [ ] Container App を更新
- [ ] エラーがないかログを監視
- [ ] 新しいリビジョンがアクティブになる
- [ ] Cold Start の場合、初回アクセスで起動を確認（10-30秒）

### デプロイ後

- [ ] **Frontend をテスト**: ブラウザでアクセス
- [ ] **Backend をテスト**: /docs で API ドキュメント確認
- [ ] **認証をテスト**: Entra ID でログイン
- [ ] **メール送信をテスト**: テストメール送信
- [ ] **データベースをテスト**: データの読み書きを確認
- [ ] **ログでエラーを確認**: 両方のコンテナのログをチェック

---

## デプロイ時間の比較

| 変更内容 | ビルド時間 | 合計時間 |
|---------|----------|---------|
| **Frontend のみ** | 2-3分 | 2-3分 |
| **Backend のみ** | 5-7分 | 5-7分 |
| **両方（順次）** | 7-10分 | 7-10分 |
| **両方（並行）** | 5-7分 | 5-7分 |

**注**: All-in-One アーキテクチャでは全変更に 10-15分かかりますが、分離アーキテクチャでは部分的な更新が可能で高速です。

---

## Cold Start に関する注意事項

### Cold Start とは

- **Min Replicas = 0**: 使用されていない時、コンテナは自動的に停止
- **初回アクセス**: 10-30秒の起動時間が必要
- **アイドル後**: 一定時間アクセスがないと自動停止
- **コスト**: 使用時のみ課金されるため、開発環境に最適

### Cold Start の動作確認

```bash
# 現在のレプリカ数を確認
az containerapp revision list \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --output table

# Replicas が 0 の場合、Cold Start 状態
# ブラウザでアクセスすると自動的に起動
```

### Cold Start の設定変更

本番環境で Cold Start を無効化したい場合:

```bash
# Frontend: Min Replicas を 1 に変更
az containerapp update \
  --name aimail-frontend \
  --resource-group $RESOURCE_GROUP \
  --min-replicas 1

# Backend: Min Replicas を 1 に変更
az containerapp update \
  --name aimail-backend \
  --resource-group $RESOURCE_GROUP \
  --min-replicas 1
```

---

## トラブルシューティング

デプロイ時に問題が発生した場合は、[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) を参照してください。

よくある問題:

- **新しいリビジョンの起動に失敗** - Failed ステータスの原因と対処法
- **イメージビルドの失敗** - Dockerfile や依存関係の問題
- **認証エラー** - Entra ID 設定、Redirect URI Mismatch
- **CORS エラー** - Backend の CORS 設定の問題
- **API エラー** - バックエンド接続の問題
- **データベースエラー** - 接続文字列やマイグレーションの問題

---

## デプロイ頻度

**推奨アプローチ**:
- 開発変更: 必要に応じてデプロイ
- バグ修正: すぐにデプロイ
- 機能リリース: トラフィックの少ない時間帯にデプロイ
- セキュリティ更新: できるだけ早くデプロイ

**ゼロダウンタイム**: Container Apps はローリング更新をサポートしているため、サービス中断なしでいつでもデプロイ可能です。

---

## サポート

**主要リソース**:
- **Frontend URL**: https://aimail-frontend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/
- **Backend URL**: https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/
- **API ドキュメント**: https://aimail-backend.redsmoke-9ae101a9.japaneast.azurecontainerapps.io/docs
- **Azure Portal**: https://portal.azure.com
- **リソースグループ**: `prothentia-mail`
- **Container Registry**: `aimailacr.azurecr.io`
- **Database**: aimail-db.postgres.database.azure.com

---

**最終更新日**: 2026年2月13日
