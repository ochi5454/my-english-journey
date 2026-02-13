# AI Mail - デプロイメントオプション完全ガイド

**対象読者**: 開発チーム・プロジェクトマネージャー・Azure管理者
**最終更新**: 2026年2月13日

---

## 📋 現在のステータス

**採用予定オプション**: **Option C (Container Apps)** 🚀
**本番環境**: ⏳ 準備中
**月額コスト（予想）**: 約¥2,000-5,000

---

## 📋 この文書の目的

このドキュメントでは、AI Mail システムを Azure 本番環境にデプロイするための**すべての選択肢**を技術的に詳しく説明します。

### 関連ドキュメント
- **[OPTION_C_CONTAINER_APPS_IMPLEMENTATION.md](./OPTION_C_CONTAINER_APPS_IMPLEMENTATION.md)** - Option C デプロイメント詳細ガイド
- **[ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md)** - All-in-One vs 分離デプロイの比較
- **[ENVIRONMENT_VARIABLES.md](../setup/ENVIRONMENT_VARIABLES.md)** - 環境変数ガイド
- **[DOCKER_ARCHITECTURE.md](../setup/DOCKER_ARCHITECTURE.md)** - Docker 構成詳細

---

## システムアーキテクチャ

### コンポーネント構成

```
┌─────────────────────────────────────────────────┐
│  ユーザー (ブラウザ)                               │
└────────────────┬────────────────────────────────┘
                 │
                 ↓ HTTPS
┌─────────────────────────────────────────────────┐
│  Microsoft Entra ID (認証)                       │
│  - OAuth 2.0 + PKCE                             │
│  - セッション管理                                 │
└────────────────┬────────────────────────────────┘
                 │
                 ↓ Session Cookie
┌─────────────────────────────────────────────────┐
│  All-in-One Container                           │
│  ┌─────────────────────────────────────────┐   │
│  │  Next.js Frontend (Port 3000)           │   │
│  │    ↓ Internal Proxy                     │   │
│  │  FastAPI Backend (Port 8000)            │   │
│  │    ↓                                    │   │
│  │  PostgreSQL Database (Port 5432)        │   │
│  └─────────────────────────────────────────┘   │
│  - Next.js 14 (App Router)                     │
│  - FastAPI (Python 3.11)                       │
│  - PostgreSQL 16                               │
│  - OpenAI API 統合                              │
│  - LangChain メール生成                          │
└─────────────────────────────────────────────────┘
```

### 技術スタック詳細

| レイヤー | 技術 | 役割 |
|---------|------|------|
| **フロントエンド** | Next.js 14, TypeScript, Tailwind CSS | SSR/CSR、UI/UX |
| **バックエンド** | FastAPI, Python 3.11, Uvicorn, LangChain | REST API、ビジネスロジック、AI統合 |
| **データベース** | PostgreSQL 16, SQLAlchemy | データ永続化 |
| **認証** | Microsoft Entra ID, Session Cookie | ユーザー認証・認可 |
| **AI** | OpenAI API (GPT-4), LangChain | メール文章生成 |
| **インフラ** | Azure Container Apps | ホスティング・管理 |
| **メール送信** | Microsoft Graph API | メール送信（ログインユーザーとして） |

### 🔑 重要な違い: All-in-One アーキテクチャ

AI Mail システムは**All-in-One Container**アーキテクチャを採用予定です：

```
従来のマイクロサービス構成:
┌────────────┐   ┌────────────┐   ┌────────────┐
│ Frontend   │   │ Backend    │   │ Database   │
│ Container  │→→→│ Container  │→→→│ Service    │
└────────────┘   └────────────┘   └────────────┘
  (別々のサービス、複雑な設定、高コスト)

All-in-One Container構成:
┌────────────────────────────────────┐
│  単一コンテナ                       │
│  ┌─────────────────────────────┐  │
│  │ Next.js Frontend (SSR)      │  │
│  │           ↓                 │  │
│  │ FastAPI Backend             │  │
│  │           ↓                 │  │
│  │ PostgreSQL                  │  │
│  └─────────────────────────────┘  │
└────────────────────────────────────┘
  (シンプル、低コスト、簡単管理)
```

**メリット**:
- ✅ シンプルな構成（1つのコンテナのみ）
- ✅ 低コスト（複数のサービスを管理する必要なし）
- ✅ 簡単なデプロイ（1コマンドで完了）
- ✅ ネットワーク遅延ゼロ（内部通信）

---

## デプロイメントオプション詳細比較

### 📊 3つのオプションの構造比較

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           オプション A: App Service（標準構成）                                │
│                                  月額: ¥5,000-6,500                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

    ユーザー
       │
       ↓ HTTPS
  ┌──────────────────────┐
  │ All-in-One Container │ ← すべて1つのコンテナに
  │ in App Service       │    • フロントエンド (Next.js)
  │ (B1 Linux)           │    • バックエンド (FastAPI)
  │ ¥2,000-2,500/月      │    • PostgreSQL (内蔵)
  │                      │
  │ 特徴：               │    マネージドPaaSプラットフォーム
  │ ✅ Azure標準         │    • Python 3.11ランタイム
  │ ✅ 本番環境向け       │    • 自動スケーリング可能
  │ ❌ VMクォータ必要    │    • Application Insights統合
  │ ❌ やや高コスト      │    • デプロイスロット
  └──────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                      オプション B: Container Instances（低コスト）                            │
│                                  月額: ¥240-300                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

    ユーザー
       │
       ↓ HTTPS
  ┌──────────────────────┐
  │ Container Instances  │ ← All-in-One Dockerコンテナ
  │ (1 vCPU, 1.5GB RAM)  │    • Dockerコンテナを直接実行
  │ ¥240-300/月          │    • 秒単位課金（使った分だけ）
  │                      │    • 手動起動・停止可能
  │ 特徴：               │    • シンプルな構成
  │ ✅ 最も低コスト       │
  │ ✅ 即デプロイ可能     │    【重要な違い】
  │ ❌ 自動スケールなし   │    • App Serviceはマネージドプラットフォーム
  │ ❌ 単一インスタンス   │    • Container Instancesはコンテナをそのまま実行
  └──────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                     オプション C: Container Apps（モダン構成）✅ 採用予定                     │
│                                  月額: ¥2,000-5,000                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

    ユーザー
       │
       ↓ HTTPS
  ┌──────────────────────────────────────────────┐
  │ Container Apps Environment                   │ ← Kubernetesベース管理環境
  │                                              │
  │  ┌────────────────────────────────────────┐  │
  │  │ Container App (aimail-app)            │  │ ← All-in-One Docker
  │  │ • 1.0 CPU, 2GB RAM                    │  │    • Dockerコンテナ
  │  │ • 自動スケーリング: 1-5 レプリカ      │  │    • KEDAベース自動スケール
  │  │ • ゼロダウンタイムデプロイ             │  │    • リビジョン管理
  │  │ • ヘルスチェック統合                   │  │    • Blue-Greenデプロイ可能
  │  │ • 内蔵PostgreSQL                      │  │
  │  └────────────────────────────────────────┘  │
  │                                              │    【重要な違い】
  │  特徴：                                       │    • Option B: 単一コンテナを直接実行
  │  ✅ 自動スケーリング (1-5レプリカ)           │    • Option C: Kubernetes上で複数レプリカ管理
  │  ✅ ゼロスケール可能（コスト削減）            │    • 本番環境向けの高度な機能
  │  ✅ ローリングデプロイ                        │
  │  ✅ Log Analytics統合監視                    │
  │  ✅ All-in-One構成で低コスト                 │
  │                                              │
  │ ¥1,500-2,000/月                              │
  └──────────────────────────────────────────────┘
  ┌──────────────────────┐
  │ Log Analytics        │ ← 監視・ログ管理（Option C専用）
  │ ¥500/月              │    • 集中ログ管理
  └──────────────────────┘
```

### 🔍 主要な違いまとめ

| 項目 | Option A<br/>App Service | Option B<br/>Container Instances | Option C<br/>Container Apps |
|------|-------------------------|----------------------------------|----------------------------|
| **コンテナ構成** | All-in-One Container on PaaS | All-in-One Container単体実行 | All-in-One Container on Kubernetes |
| **データベース** | コンテナ内蔵PostgreSQL | コンテナ内蔵PostgreSQL | コンテナ内蔵PostgreSQL |
| **スケーリング** | 手動設定で自動スケール可能 | ❌ スケーリングなし | ✅ 自動スケール（1-5レプリカ） |
| **可用性** | 1インスタンス | 1インスタンス | 複数レプリカで高可用性 |
| **デプロイ方式** | Docker push | コンテナ再作成 | ゼロダウンタイムローリング |
| **監視** | Application Insights | コンテナログのみ | Log Analytics統合 |
| **料金体系** | 月額固定 | 秒単位課金 | 月額固定（使用量ベース） |
| **本番環境適性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **月額コスト** | ¥5,000-6,500 | ¥240-300 | ¥2,000-5,000 |

---

## オプション C: Container Apps（採用予定）✅

### アーキテクチャ

```
[Container Apps]  ←  [All-in-One Docker Container]
  (Kubernetes)        (Next.js + FastAPI + PostgreSQL)
  Port: 443           Target Port: 3000
  Auto-scale: 1-5     CPU: 1.0, RAM: 2.0Gi
```

### 技術仕様

**Container App (aimail-app):**
- **Environment**: aimail-env
- **Image**: prothentiaacr.azurecr.io/aimail:latest
- **スペック**:
  - 1.0 vCPU
  - 2.0GB RAM
  - Linux コンテナ (linux/amd64)
- **機能**:
  - 自動スケーリング (1-5 replicas)
  - ゼロダウンタイムデプロイ
  - Log Analytics 統合
  - 外部 HTTPS イングレス
  - ヘルスチェック

**コンテナ内訳**:
- Next.js (Port 3000) - フロントエンドサーバー (SSR)
- FastAPI バックエンド (Port 8000)
- PostgreSQL データベース (Port 5432)
- Supervisor - プロセス管理

### メリット・デメリット

| メリット ✅ | デメリット ❌ |
|-----------|-------------|
| 自動スケーリング (1-5 replicas) | Container Instancesより高コスト |
| ゼロダウンタイムデプロイ | 設定がやや複雑 |
| All-in-One構成でシンプル | 初回デプロイに時間がかかる |
| Kubernetes ベースの堅牢性 | |
| Log Analytics統合監視 | |

### コスト詳細

```
Container Apps (1-5 replicas):              ¥1,500-2,500/月
Log Analytics:                              ¥500-1,000/月
Container Registry (Basic):                 ¥600/月
────────────────────────────────────────────────
合計:                                       ¥2,600-4,100/月
```

**コスト変動要因**:
- トラフィック量（レプリカ数）
- ログ保存量
- イメージストレージ使用量

---

## 総合比較表

| オプション | 月額コスト | デプロイ時間 | 本番適性 | All-in-One対応 |
|----------|----------|------------|---------|---------------|
| **A: App Service** | ¥5,500 | 30-45分 | ⭐⭐⭐⭐⭐ | ✅ |
| **B: Container Instances** | ¥240 | 20-30分 | ⭐⭐⭐⭐ | ✅ |
| **C: Container Apps** | ¥2,600 | 40-60分 | ⭐⭐⭐⭐⭐ | ✅ |

---

## 推奨事項

### ✅ 採用予定: モダンな本番環境 (Container Apps)
→ **オプション C (Container Apps)** 🚀

**採用理由**:
1. 自動スケーリング (1-5 レプリカ)
2. ゼロダウンタイムデプロイ
3. All-in-One構成でシンプル
4. Kubernetesベースの堅牢性
5. バランスの取れたコスト (月額¥2,600-4,100)

---

## 次のステップ

### Option C の詳細:
→ **[OPTION_C_CONTAINER_APPS_IMPLEMENTATION.md](./OPTION_C_CONTAINER_APPS_IMPLEMENTATION.md)** デプロイメント詳細

### アーキテクチャ比較:
→ **[ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md)** All-in-One vs 分離デプロイの比較

---

**作成日**: 2026年2月13日
**対象システム**: AI Mail
