# AI Mail Agent システム概要書

**最終更新**: 2026-02-19
**バージョン**: 2.0

---

## 1. システム概要

**AI Mail Agent** は、AIを活用したインテリジェントなメール送信支援システムです。
Outlook風のモダンなUIと自然言語による操作を組み合わせ、メール作成・送信業務を効率化します。

### 主要な特徴
- Glassmorphism デザインによる美しいUI
- AIチャットによるメール文章自動生成
- 自然言語でのシステム操作（マルチエージェント）
- Microsoft Entra ID 連携による組織データ活用
- Microsoft Graph API による安全なメール送信

---

## 2. システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 14)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ ダッシュボード │  │ メール作成    │  │ AIチャット   │  │ 管理画面  │ │
│  │    /         │  │   /compose   │  │   /chat     │  │ /templates│ │
│  │              │  │              │  │             │  │ /recipients│
│  │              │  │              │  │             │  │ /signatures│
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTP/REST API
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        API Routers                            │   │
│  │  /auth  /mail  /templates  /recipients  /agent  /signatures  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 │                                    │
│  ┌──────────────────────────────┴───────────────────────────────┐   │
│  │              Multi-Agent System                               │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │   │
│  │  │IntentRouter │→│AgentRegistry│→│  Agents     │             │   │
│  │  │(意図分類)   │ │(エージェント │ │・Recipient  │             │   │
│  │  │            │ │ 登録・検索)  │ │・MailHistory│             │   │
│  │  └─────────────┘ └─────────────┘ │・Send       │             │   │
│  │                                   │・Report     │             │   │
│  │                                   │・Chat       │             │   │
│  │                                   └─────────────┘             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 │                                    │
│  ┌──────────────────────────────┴───────────────────────────────┐   │
│  │                    Service Layer                              │   │
│  │  RecipientService  MailService  LLMService  ReportService    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    SQLite       │    │  Azure OpenAI   │    │ Microsoft Graph │
│   (Database)    │    │   (LLM API)     │    │   API (Email)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 3. 機能一覧

### 3.1 メール作成・送信機能

| 機能 | 説明 | 状態 |
|------|------|:----:|
| メール作成 | Outlook風UIでのメール作成 | ✅ |
| 宛先入力 | To/Cc/Bcc、ファジー検索、オートコンプリート | ✅ |
| 添付ファイル | 手動アップロード、ドラッグ&ドロップ | ✅ |
| AI文章生成 | キーワード・トーンからメール文を自動生成 | ✅ |
| プレビュー | 送信前確認、宛先名自動挿入 | ✅ |
| Microsoft Graph送信 | Entra ID認証によるセキュアな送信 | ✅ |
| 送信履歴 | 過去の送信ログ閲覧・検索 | ✅ |

### 3.2 テンプレート管理

| 機能 | 説明 | 状態 |
|------|------|:----:|
| テンプレートCRUD | 作成・編集・削除・一覧表示 | ✅ |
| カテゴリ分類 | カテゴリ別フィルタリング | ✅ |
| テンプレート選択UI | メール作成画面でのプルダウン選択 | ✅ |

### 3.3 宛先リスト管理

| 機能 | 説明 | 状態 |
|------|------|:----:|
| 宛先リストCRUD | 作成・編集・削除・一覧表示 | ✅ |
| Excel/CSVインポート | ファイルから宛先を一括取り込み | ✅ |
| Excelテンプレートダウンロード | インポート用テンプレート取得 | ✅ |
| Entra ID連携 | Azure ADユーザー検索 | ✅ |
| 組織ツリー選択 | 部署単位での宛先一括追加 | ✅ |

### 3.4 署名管理

| 機能 | 説明 | 状態 |
|------|------|:----:|
| 署名CRUD | 作成・編集・削除・一覧表示 | ✅ |
| デフォルト署名 | 自動挿入設定 | ✅ |
| メール作成連携 | 本文への署名自動挿入 | ✅ |

### 3.5 予約送信機能

| 機能 | 説明 | 状態 |
|------|------|:----:|
| 送信日時指定 | 将来の日時を指定して予約 | ✅ |
| 予約一覧・編集 | 予約メールの確認・変更 | ✅ |
| 予約キャンセル | 予約の取り消し | ✅ |
| 自動送信実行 | バックグラウンドワーカーによる送信 | ✅ |

### 3.6 AIアシスタント（マルチエージェントシステム）

| 機能 | 説明 | 状態 |
|------|------|:----:|
| 自然言語操作 | 日本語での指示によるシステム操作 | ✅ |
| 宛先検索 | 「〇〇さんのメールアドレスを教えて」 | ✅ |
| 送信履歴分析 | 「先月の送信状況を教えて」 | ✅ |
| レポート生成 | 「送信履歴のレポートを作成して」 | ✅ |
| 一般会話 | システムの使い方などのヘルプ | ✅ |

---

## 4. 技術スタック

### 4.1 フロントエンド

| 技術 | バージョン | 用途 |
|------|----------|------|
| Next.js | 14 | Reactフレームワーク |
| TypeScript | 5.x | 型安全な開発 |
| Tailwind CSS | 3.x | スタイリング |
| Lucide React | - | アイコン |

### 4.2 バックエンド

| 技術 | バージョン | 用途 |
|------|----------|------|
| Python | 3.11+ | メイン言語 |
| FastAPI | 0.100+ | WebAPIフレームワーク |
| SQLAlchemy | 2.x | ORM |
| Pydantic | 2.x | バリデーション |
| LangChain | 0.1+ | LLM統合 |

### 4.3 外部サービス

| サービス | 用途 |
|----------|------|
| Microsoft Entra ID | 認証・組織データ |
| Microsoft Graph API | メール送信 |
| Azure OpenAI | AI文章生成 |

---

## 5. データモデル

### 5.1 主要テーブル

```
┌──────────────────┐       ┌──────────────────┐
│      User        │       │    Template      │
├──────────────────┤       ├──────────────────┤
│ id               │       │ id               │
│ email            │       │ user_id (FK)     │
│ name             │       │ name             │
│ azure_oid        │       │ subject          │
│ access_token     │       │ body             │
└──────────────────┘       │ category         │
         │                 └──────────────────┘
         │
         │       ┌──────────────────┐
         ├───────│  RecipientList   │
         │       ├──────────────────┤
         │       │ id               │
         │       │ user_id (FK)     │
         │       │ name             │
         │       │ description      │
         │       └────────┬─────────┘
         │                │
         │       ┌────────▼─────────┐
         │       │RecipientListMember│
         │       ├──────────────────┤
         │       │ id               │
         │       │ list_id (FK)     │
         │       │ email            │
         │       │ name             │
         │       │ department       │
         │       └──────────────────┘
         │
         │       ┌──────────────────┐
         ├───────│    Signature     │
         │       ├──────────────────┤
         │       │ id               │
         │       │ user_id (FK)     │
         │       │ name             │
         │       │ content          │
         │       │ is_default       │
         │       └──────────────────┘
         │
         │       ┌──────────────────┐
         ├───────│  ScheduledMail   │
         │       ├──────────────────┤
         │       │ id               │
         │       │ user_id (FK)     │
         │       │ to_addresses     │
         │       │ cc_addresses     │
         │       │ subject          │
         │       │ body             │
         │       │ scheduled_at     │
         │       │ status           │
         │       └──────────────────┘
         │
         │       ┌──────────────────┐
         └───────│   MailSendLog    │
                 ├──────────────────┤
                 │ id               │
                 │ user_id (FK)     │
                 │ to_addresses     │
                 │ cc_addresses     │
                 │ subject          │
                 │ sent_at          │
                 │ status           │
                 └──────────────────┘
```

---

## 6. APIエンドポイント

### 6.1 認証 (`/auth`)

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /auth/login/azure | Entra ID認証開始 |
| GET | /auth/callback | OAuth2コールバック |
| POST | /auth/login/basic | Basic認証ログイン |
| POST | /auth/logout | ログアウト |
| GET | /auth/me | ログインユーザー情報取得 |

### 6.2 メール (`/mail`)

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | /mail/send | メール送信 |
| POST | /mail/preview | プレビュー生成 |
| GET | /mail/history | 送信履歴取得 |

### 6.3 テンプレート (`/templates`)

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /templates | 一覧取得 |
| POST | /templates | 新規作成 |
| GET | /templates/{id} | 詳細取得 |
| PUT | /templates/{id} | 更新 |
| DELETE | /templates/{id} | 削除 |
| GET | /templates/categories | カテゴリ一覧 |

### 6.4 宛先リスト (`/recipients`)

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /recipients/lists | リスト一覧 |
| POST | /recipients/lists | リスト作成 |
| GET | /recipients/lists/{id} | リスト詳細 |
| PUT | /recipients/lists/{id} | リスト更新 |
| DELETE | /recipients/lists/{id} | リスト削除 |
| POST | /recipients/lists/{id}/members | メンバー追加 |
| DELETE | /recipients/lists/{id}/members/{member_id} | メンバー削除 |
| POST | /recipients/search | 宛先検索（Entra ID） |
| GET | /recipients/import/template | Excelテンプレートダウンロード |
| POST | /recipients/import | Excel/CSVインポート |

### 6.5 署名 (`/signatures`)

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /signatures | 一覧取得 |
| POST | /signatures | 新規作成 |
| GET | /signatures/{id} | 詳細取得 |
| PUT | /signatures/{id} | 更新 |
| DELETE | /signatures/{id} | 削除 |
| GET | /signatures/default | デフォルト署名取得 |

### 6.6 AIエージェント (`/agent`)

| Method | Endpoint | 説明 |
|--------|----------|------|
| POST | /agent/chat | 自然言語で操作 |
| POST | /agent/chat/confirm | 操作の確認・実行 |

---

## 7. マルチエージェントシステム

### 7.1 アーキテクチャ

```
User Input (自然言語)
        │
        ▼
┌───────────────────┐
│   IntentRouter    │  ← LLMで意図を分類
│  (意図分類器)      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  AgentRegistry    │  ← 適切なエージェントを検索
│  (エージェント登録) │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────┐
│                Domain Agents                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │ Recipient   │ │ MailHistory │ │    Send     │  │
│  │   Agent     │ │   Agent     │ │   Agent     │  │
│  │ 宛先検索     │ │ 履歴分析    │ │ メール送信   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘  │
│  ┌─────────────┐ ┌─────────────┐                  │
│  │   Report    │ │    Chat     │                  │
│  │   Agent     │ │   Agent     │                  │
│  │ レポート生成 │ │ 一般会話    │                  │
│  └─────────────┘ └─────────────┘                  │
└─────────┬─────────────────────────────────────────┘
          │
          ▼
┌───────────────────┐
│ ResultSynthesizer │  ← 結果を自然言語に変換
│  (結果合成器)      │
└───────────────────┘
          │
          ▼
    Response (日本語)
```

### 7.2 対応インテント

| Intent | 説明 | 例 |
|--------|------|-----|
| recipient_search | 宛先検索 | 「田中さんのメールアドレスを教えて」 |
| mail_history | 履歴分析 | 「先週送ったメールを見せて」 |
| send_email | メール送信 | 「田中さんにお礼のメールを送りたい」 |
| generate_report | レポート生成 | 「送信履歴をExcelで出力して」 |
| chat | 一般会話 | 「このシステムの使い方を教えて」 |

---

## 8. セキュリティ

### 8.1 認証・認可

- **Microsoft Entra ID (Azure AD)**: OAuth2.0による企業認証
- **セッション管理**: HTTPOnly Cookieによる安全なセッション
- **アクセストークン**: AES-256-GCMで暗号化して保存

### 8.2 データ保護

- **CORS設定**: 環境変数による許可オリジン制御
- **レート制限**: slowapiによるAPI呼び出し制限
- **入力検証**: Pydanticによる厳格なバリデーション

---

## 9. ディレクトリ構成

```
ragtesting/
├── backend/
│   ├── agents/               # マルチエージェントシステム
│   │   ├── __init__.py
│   │   ├── base.py           # BaseAgent
│   │   ├── container.py      # ServiceContainer (DI)
│   │   ├── registry.py       # AgentRegistry
│   │   ├── intent_router.py  # IntentRouter
│   │   ├── orchestrator.py   # AgentOrchestrator
│   │   ├── synthesizer.py    # ResultSynthesizer
│   │   ├── state.py          # AgentState
│   │   ├── domain/           # ドメインエージェント
│   │   │   ├── recipient_agent.py
│   │   │   ├── mail_history_agent.py
│   │   │   ├── send_agent.py
│   │   │   ├── report_agent.py
│   │   │   └── chat_agent.py
│   │   └── services/         # サービス実装
│   │       ├── recipient_service.py
│   │       ├── mail_history_service.py
│   │       ├── mail_send_service.py
│   │       ├── report_service.py
│   │       └── llm_service.py
│   ├── core/                 # 共通基盤
│   │   ├── config.py
│   │   ├── database.py
│   │   └── security.py
│   ├── models/               # SQLAlchemyモデル
│   │   ├── user.py
│   │   ├── template.py
│   │   ├── recipient_list.py
│   │   ├── signature.py
│   │   ├── scheduled_mail.py
│   │   └── mail_send_log.py
│   ├── routers/              # FastAPIルーター
│   │   ├── auth.py
│   │   ├── mail.py
│   │   ├── templates.py
│   │   ├── recipients.py
│   │   ├── signatures.py
│   │   ├── attachments.py
│   │   └── agent_chat.py
│   ├── services/             # ビジネスロジック
│   └── app.py                # FastAPIアプリ
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # ダッシュボード
│   │   ├── compose/          # メール作成
│   │   ├── chat/             # AIチャット
│   │   ├── templates/        # テンプレート管理
│   │   ├── recipients/       # 宛先リスト管理
│   │   ├── signatures/       # 署名管理
│   │   ├── scheduled/        # 予約送信管理
│   │   ├── history/          # 送信履歴
│   │   ├── components/       # 共通コンポーネント
│   │   └── hooks/            # Reactフック
│   └── package.json
│
└── docs/
    ├── SYSTEM_OVERVIEW.md    # 本ドキュメント
    └── design/               # 詳細設計書
```

---

## 10. 今後の拡張予定

| 機能 | 優先度 | 状態 |
|------|:------:|:----:|
| SharePoint宛先連携 | 中 | 設計完了 |
| 単体テスト | 高 | 未着手 |
| E2Eテスト | 中 | 未着手 |
| Slack/Teams通知連携 | 低 | 未着手 |
| 監査ログUI | 低 | 不要 |

---

**作成者**: Claude Code
**最終更新**: 2026-02-19
