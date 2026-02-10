# AIメール送信エージェント 設計書

## 進捗管理チェックリスト

### フェーズ1: 基盤整備
- [x] 既存データ管理機能の整理・削除
- [x] 新規DBスキーマ設計（テンプレート、宛先リスト等）
- [x] APIエンドポイント設計
- [x] フロントエンド画面構成設計

### フェーズ2: 認証・ユーザー管理（既存維持）
- [x] Entra ID認証の維持
- [x] Basic認証の維持
- [x] ユーザーセッション管理
- [x] ユーザー別テンプレート管理機能

### フェーズ3: メールアドレス選択機能
- [x] **方式1**: Excel/CSVファイルアップロード → 宛先リスト読み込み
- [x] **方式1**: DBからの宛先リスト読み込み
- [x] **方式2**: Entra ID（Azure AD）ユーザーディレクトリ検索
- [x] **方式2**: 手動入力（フリーテキスト）
- [x] **方式3**: SharePoint連携（設計のみ、実装は後日）

### フェーズ4: ファイル添付機能
- [x] **方式1**: 外部エージェント連携による自動添付（API経由）
- [x] **方式2**: 手動ファイル選択・アップロード

### フェーズ5: メール文・件名作成機能
- [x] **方式1**: テンプレート管理（CRUD）
- [x] **方式1**: テンプレート選択UI（プルダウン）
- [x] **方式1**: ユーザー別テンプレート保存
- [x] **方式2**: 手動入力（リッチテキストエディタ）
- [x] **方式3**: AIチャット生成機能
- [x] **方式3**: キーワード・トーン・相手指定UI
- [x] **方式3**: 生成結果の編集・採用機能

### フェーズ6: メール送信フロー
- [x] プレビュー画面（内容確認・修正）
- [x] 送信確認ダイアログ
- [x] Microsoft Graph API経由送信
- [x] 送信結果表示・ログ記録

### フェーズ7: UI/UX実装
- [x] Outlook風メイン画面レイアウト
- [x] 宛先入力エリア（To/Cc/Bcc）
- [x] 件名入力エリア
- [x] 本文入力エリア
- [x] 添付ファイルエリア
- [x] AIアシスタントパネル
- [x] プレビューモーダル

### フェーズ8: テスト・運用準備
- [ ] 単体テスト
- [ ] 統合テスト
- [ ] E2Eテスト
- [ ] 本番環境デプロイ

---

## 1. システム概要

### 1.1 目的
Outlook風UIを持つ**AIメール送信エージェント**を構築する。
従来のメール作成に加え、AIによる文章生成支援機能を提供し、ユーザーのメール作成負担を軽減する。

### 1.2 主要機能
| 機能カテゴリ | 機能 | 実装優先度 |
|-------------|------|-----------|
| 宛先選択 | Excel/DB読み込み | Phase1 |
| 宛先選択 | Entra ID検索・手動入力 | Phase1 |
| 宛先選択 | SharePoint連携 | Phase2（設計のみ） |
| 添付 | 手動選択 | Phase1 |
| 添付 | 外部エージェント連携 | Phase2 |
| 本文作成 | テンプレート選択 | Phase1 |
| 本文作成 | 手動入力 | Phase1 |
| 本文作成 | AI生成 | Phase1 |
| 送信 | プレビュー・確認・送信 | Phase1 |

### 1.3 アーキテクチャ概要
```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐│
│  │ 宛先選択    │ │ 本文作成    │ │ プレビュー・送信        ││
│  │ ・ファイル  │ │ ・テンプレート│ │ ・内容確認              ││
│  │ ・検索      │ │ ・手動入力  │ │ ・修正                  ││
│  │ ・手動入力  │ │ ・AI生成    │ │ ・送信実行              ││
│  └─────────────┘ └─────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ /recipients  │ │ /templates   │ │ /mail                │ │
│  │ 宛先管理API  │ │ テンプレートAPI│ │ メール送信API        │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ /attachments │ │ /ai/generate │ │ /auth (既存)         │ │
│  │ 添付ファイルAPI│ │ AI生成API   │ │ 認証API              │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │ SQLite/  │   │ OpenAI   │   │ Microsoft    │
        │ PostgreSQL│   │ API      │   │ Graph API    │
        └──────────┘   └──────────┘   └──────────────┘
```

---

## 2. 機能詳細設計

### 2.1 メールアドレス選択機能

#### 方式1: ファイル/DB読み込み
**概要**: Excel/CSVファイルをアップロード、またはDBに保存された宛先リストから選択

**フロー**:
```
1. ユーザーがExcel/CSVをアップロード
2. バックエンドでパース、バリデーション
3. 宛先リストとしてDBに保存（ユーザー紐付け）
4. フロントエンドで宛先リストを選択可能に
```

**ファイル形式**:
| 列名 | 必須 | 説明 |
|------|------|------|
| メールアドレス | ✓ | RFC準拠形式 |
| 氏名 | - | 表示名 |
| 部署/グループ | - | フィルタリング用 |
| 備考 | - | メモ |

**API**:
```
POST   /api/recipients/upload      # ファイルアップロード
GET    /api/recipients/lists       # 宛先リスト一覧
GET    /api/recipients/lists/{id}  # 宛先リスト詳細
DELETE /api/recipients/lists/{id}  # 宛先リスト削除
```

#### 方式2: Entra ID検索・手動入力
**概要**: Entra ID（Azure AD）のユーザーディレクトリから検索、または直接メールアドレスを入力

**機能**:
- Entra IDユーザーディレクトリからのリアルタイム検索
- インクリメンタル検索（名前、メールアドレス、部署）
- オートコンプリート（Outlookと同様の使用感）
- 複数選択（To/Cc/Bcc別）
- フリーテキスト入力（カンマ区切り対応）

**Microsoft Graph API**:
```
GET https://graph.microsoft.com/v1.0/users
    ?$filter=startswith(displayName,'{query}') or startswith(mail,'{query}')
    &$select=id,displayName,mail,department,jobTitle
    &$top=10
```

**必要なスコープ**:
- `User.Read.All` または `User.ReadBasic.All`（組織内ユーザー検索用）

**バックエンドAPI**:
```
GET /api/recipients/search?q={query}  # Entra IDユーザー検索（プロキシ）
```

**レスポンス例**:
```json
{
  "users": [
    {
      "id": "user-uuid",
      "displayName": "田中 太郎",
      "mail": "tanaka@company.com",
      "department": "営業部",
      "jobTitle": "主任"
    }
  ]
}
```

**UI動作**:
```
1. ユーザーがTo/Cc/Bcc欄に文字を入力
2. 2文字以上入力でEntra ID検索をトリガー（デバウンス300ms）
3. 検索結果をドロップダウンで表示
4. クリックまたはEnterで選択・追加
5. 選択された宛先はチップ形式で表示
```

#### 方式3: SharePoint連携（将来実装）
**概要**: SharePointの連絡先リストやExcelファイルと連携

**設計メモ**:
- Microsoft Graph API `/sites/{site-id}/lists` を使用
- OAuth2スコープ: `Sites.Read.All`
- SharePoint上のExcelファイル読み込み: `/sites/{site-id}/drive/items/{item-id}/workbook`

**API（将来）**:
```
GET  /api/sharepoint/sites           # サイト一覧
GET  /api/sharepoint/lists/{site-id} # リスト一覧
POST /api/sharepoint/import          # データインポート
```

---

### 2.2 ファイル添付機能

#### 方式1: 外部エージェント連携（自動添付）
**概要**: 別のAIエージェントやシステムからAPI経由でファイルを添付

**ユースケース**:
- レポート生成エージェントが生成したPDFを自動添付
- データ集計システムからのExcelを自動添付

**API**:
```
POST /api/attachments/auto
Body: {
  "session_id": "xxx",      # メール作成セッションID
  "file": <binary>,         # ファイルデータ
  "filename": "report.pdf",
  "source": "report-agent"  # 送信元識別子
}
```

**フロー**:
```
1. 外部エージェントがAPIを呼び出し
2. セッションIDに紐づけてファイルを一時保存
3. ユーザーのメール作成画面に添付ファイルとして表示
4. ユーザーは確認後、削除も可能
```

#### 方式2: 手動選択
**概要**: ユーザーがローカルからファイルを選択してアップロード

**機能**:
- ドラッグ&ドロップ対応
- 複数ファイル選択
- ファイルサイズ制限（25MB/ファイル、合計35MB）
- プレビュー表示（画像、PDF）

**API**:
```
POST   /api/attachments/upload    # ファイルアップロード
DELETE /api/attachments/{id}      # ファイル削除
```

---

### 2.3 メール文・件名作成機能

#### 方式1: テンプレート選択
**概要**: 事前登録したテンプレートをプルダウンで選択

**機能**:
- ユーザー別テンプレート管理
- カテゴリ分類
- 変数埋め込み（`{{name}}`, `{{date}}` など）
- テンプレートCRUD

**データモデル**:
```python
class EmailTemplate(Base):
    id: int
    user_id: int              # ユーザー紐付け
    name: str                 # テンプレート名
    category: str             # カテゴリ
    subject: str              # 件名テンプレート
    body: str                 # 本文テンプレート
    variables: JSON           # 使用可能変数リスト
    created_at: datetime
    updated_at: datetime
```

**API**:
```
GET    /api/templates              # テンプレート一覧（自分のもの）
POST   /api/templates              # テンプレート作成
GET    /api/templates/{id}         # テンプレート詳細
PUT    /api/templates/{id}         # テンプレート更新
DELETE /api/templates/{id}         # テンプレート削除
```

**UI**:
```
┌─────────────────────────────────────┐
│ テンプレート選択                     │
│ ┌─────────────────────────────────┐ │
│ │ ▼ カテゴリ: 定期報告            │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ ▼ 月次残業報告                  │ │
│ │   週次進捗報告                  │ │
│ │   四半期レビュー                │ │
│ └─────────────────────────────────┘ │
│ [適用] [編集] [新規作成]            │
└─────────────────────────────────────┘
```

#### 方式2: 手動入力
**概要**: 従来通りの自由入力

**機能**:
- リッチテキストエディタ（太字、リスト、リンク等）
- 署名自動挿入
- 下書き自動保存

#### 方式3: AI生成
**概要**: チャット形式でキーワード・トーン・相手を指定し、AIがメール文を生成

**入力パラメータ**:
| パラメータ | 説明 | 例 |
|-----------|------|-----|
| キーワード | メールの主題 | 「会議日程調整」「お礼」「依頼」 |
| トーン | 文体 | フォーマル / カジュアル / 丁寧 |
| 相手 | 宛先の関係性 | 上司 / 同僚 / 顧客 / 取引先 |
| 追加指示 | 自由記述 | 「簡潔に」「詳細を含めて」 |

**チャットUI**:
```
┌─────────────────────────────────────────────────┐
│ 🤖 AIメールアシスタント                          │
├─────────────────────────────────────────────────┤
│                                                 │
│ AI: どのようなメールを作成しますか？             │
│                                                 │
│ User: 来週の会議の日程調整をしたい              │
│                                                 │
│ AI: 了解しました。以下を教えてください：         │
│     ・相手は誰ですか？（上司/同僚/顧客など）     │
│     ・トーンはどうしますか？                    │
│       [フォーマル] [カジュアル] [丁寧]          │
│                                                 │
│ User: 顧客向けで丁寧に                          │
│                                                 │
│ AI: 以下の内容でメールを作成しました：           │
│     ────────────────────────────                │
│     件名: 会議日程のご調整について               │
│     本文: ○○様                                  │
│           いつもお世話になっております...        │
│     ────────────────────────────                │
│     [この内容を使用] [修正を依頼] [やり直し]     │
│                                                 │
├─────────────────────────────────────────────────┤
│ [入力欄...]                          [送信]     │
└─────────────────────────────────────────────────┘
```

**API**:
```
POST /api/ai/generate
Body: {
  "keywords": ["会議", "日程調整"],
  "tone": "polite",           # formal / casual / polite
  "recipient_type": "customer", # boss / colleague / customer / vendor
  "additional_instructions": "簡潔に",
  "context": {                # オプション：前回の会話コンテキスト
    "messages": [...]
  }
}

Response: {
  "subject": "会議日程のご調整について",
  "body": "○○様\n\nいつもお世話になっております...",
  "suggestions": [            # 代替案
    { "subject": "...", "body": "..." }
  ]
}
```

---

### 2.4 プレビュー・送信機能

#### プレビュー画面
**機能**:
- 送信前の最終確認
- 宛先・件名・本文・添付ファイルの一覧表示
- その場で編集可能
- 添付ファイルの追加/削除

**UI**:
```
┌─────────────────────────────────────────────────────────────┐
│ 📧 メールプレビュー                              [×]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 宛先(To):  tanaka@example.com, suzuki@example.com    [編集] │
│ CC:        manager@example.com                        [編集] │
│ BCC:       -                                          [編集] │
│                                                             │
│ 件名:      会議日程のご調整について                   [編集] │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ ○○様                                                        │
│                                                             │
│ いつもお世話になっております。                              │
│ 株式会社△△の□□でございます。                              │
│                                                             │
│ 来週の会議について、日程調整のご連絡をさせていただきます。 │
│ ...                                                         │
│                                                      [編集] │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 📎 添付ファイル:                                            │
│    ├─ meeting_agenda.pdf (1.2MB)              [×]          │
│    └─ schedule.xlsx (0.5MB)                   [×]          │
│                                                [+ 追加]    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                              [キャンセル]  [下書き保存]  [送信] │
└─────────────────────────────────────────────────────────────┘
```

#### 送信処理
**フロー**:
```
1. 送信ボタンクリック
2. 確認ダイアログ表示
3. Microsoft Graph API /me/sendMail 呼び出し
4. 送信結果表示（成功/失敗）
5. 送信ログ記録
```

**API**:
```
POST /api/mail/send
Body: {
  "to": ["tanaka@example.com"],
  "cc": ["manager@example.com"],
  "bcc": [],
  "subject": "会議日程のご調整について",
  "body": "○○様\n\nいつもお世話になっております...",
  "body_type": "text",        # text / html
  "attachments": [
    { "id": "att-123", "filename": "meeting_agenda.pdf" }
  ]
}

Response: {
  "success": true,
  "message_id": "xxx",
  "sent_at": "2025-02-10T10:30:00+09:00"
}
```

---

## 3. 画面設計

### 3.1 メイン画面レイアウト（Outlook風）
```
┌────────────────────────────────────────────────────────────────────────┐
│ 🔷 AI Mail Agent                              [ユーザー名] [ログアウト] │
├────────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────────────────────────────────────────────────┐ │
│ │          │ │                                                      │ │
│ │ サイド   │ │  To:  [                                    ] [📁]   │ │
│ │ メニュー │ │  Cc:  [                                    ] [📁]   │ │
│ │          │ │  Bcc: [                                    ] [📁]   │ │
│ │ ────────│ │                                                      │ │
│ │ 新規作成 │ │  件名: [                                          ] │ │
│ │ テンプレ │ │                                                      │ │
│ │ 宛先管理 │ │  ┌─────────────────────────────────────────────────┐│ │
│ │ 送信履歴 │ │  │ [テンプレート▼] [手動入力] [✨AI生成]           ││ │
│ │ 設定     │ │  ├─────────────────────────────────────────────────┤│ │
│ │          │ │  │                                                 ││ │
│ │          │ │  │              本文入力エリア                     ││ │
│ │          │ │  │                                                 ││ │
│ │          │ │  │                                                 ││ │
│ │          │ │  │                                                 ││ │
│ │          │ │  └─────────────────────────────────────────────────┘│ │
│ │          │ │                                                      │ │
│ │          │ │  📎 添付: [ファイルを選択] またはドラッグ&ドロップ   │ │
│ │          │ │     └─ report.pdf (2.1MB) [×]                       │ │
│ │          │ │                                                      │ │
│ │          │ │                    [プレビュー] [送信]               │ │
│ └──────────┘ └──────────────────────────────────────────────────────┘ │
│              ┌──────────────────────────────────────────────────────┐ │
│              │ 🤖 AIアシスタント                          [−][□][×]│ │
│              │ ────────────────────────────────────────────────────│ │
│              │ どのようなメールを作成しますか？                     │ │
│              │                                                      │ │
│              │ [入力欄...]                              [送信]     │ │
│              └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 画面遷移
```
ログイン画面
    │
    ▼
メイン画面（メール作成）
    │
    ├─→ 宛先選択モーダル
    │      ├─ ファイルアップロード
    │      ├─ 検索・選択
    │      └─ 手動入力
    │
    ├─→ テンプレート管理画面
    │      ├─ 一覧
    │      ├─ 新規作成
    │      └─ 編集
    │
    ├─→ AIアシスタントパネル（トグル）
    │
    ├─→ プレビューモーダル
    │      └─ 送信確認
    │
    └─→ 送信履歴画面
```

---

## 4. データベース設計

### 4.1 新規テーブル

```sql
-- メールテンプレート
CREATE TABLE email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    variables JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_templates_user ON email_templates(user_id);

-- 宛先リスト
CREATE TABLE recipient_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_recipient_lists_user ON recipient_lists(user_id);

-- 宛先リストのメンバー
CREATE TABLE recipient_list_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES recipient_lists(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    department VARCHAR(255),
    note TEXT
);
CREATE INDEX idx_members_list ON recipient_list_members(list_id);
CREATE INDEX idx_members_email ON recipient_list_members(email);

-- 送信履歴
CREATE TABLE mail_send_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    to_addresses JSON NOT NULL,
    cc_addresses JSON,
    bcc_addresses JSON,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    attachments JSON,
    status VARCHAR(20) NOT NULL,  -- success / failed
    error_message TEXT,
    graph_message_id VARCHAR(255),
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_logs_user ON mail_send_logs(user_id);
CREATE INDEX idx_logs_sent_at ON mail_send_logs(sent_at);

-- 添付ファイル一時保存
CREATE TABLE temp_attachments (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    session_id VARCHAR(36) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    file_size INTEGER,
    file_path VARCHAR(500) NOT NULL,
    source VARCHAR(50),  -- manual / agent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);
CREATE INDEX idx_attachments_session ON temp_attachments(session_id);
```

---

## 5. API設計（追加分）

### 5.1 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| **宛先管理** |
| POST | /api/recipients/upload | ファイルアップロード |
| GET | /api/recipients/lists | 宛先リスト一覧 |
| GET | /api/recipients/lists/{id} | 宛先リスト詳細 |
| DELETE | /api/recipients/lists/{id} | 宛先リスト削除 |
| GET | /api/recipients/search | 宛先検索 |
| **テンプレート** |
| GET | /api/templates | テンプレート一覧 |
| POST | /api/templates | テンプレート作成 |
| GET | /api/templates/{id} | テンプレート詳細 |
| PUT | /api/templates/{id} | テンプレート更新 |
| DELETE | /api/templates/{id} | テンプレート削除 |
| **添付ファイル** |
| POST | /api/attachments/upload | 手動アップロード |
| POST | /api/attachments/auto | 自動添付（エージェント用） |
| DELETE | /api/attachments/{id} | 削除 |
| **AI生成** |
| POST | /api/ai/generate | メール文生成 |
| **メール送信** |
| POST | /api/mail/send | メール送信 |
| GET | /api/mail/logs | 送信履歴 |

---

## 6. 技術スタック

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui（UIコンポーネント）
- React Hook Form（フォーム管理）
- SWR（データフェッチング）

### Backend
- FastAPI
- SQLAlchemy
- SQLite（開発）/ PostgreSQL（本番）
- OpenAI API（AI生成）
- Microsoft Graph API（メール送信）

### 既存維持
- Entra ID認証
- Basic認証
- セッション管理

---

## 7. セキュリティ考慮事項

- すべてのAPIは認証必須
- ユーザーは自分のテンプレート・宛先リストのみアクセス可能
- 添付ファイルは一時保存後、送信完了または一定時間経過で削除
- AI生成リクエストにはレート制限を適用
- 送信ログは監査用に保持

---

## 8. 今後の拡張（Phase2以降）

- SharePoint連携
- 予約送信機能
- 送信テンプレートのチーム共有
- 送信承認ワークフロー
- メール開封トラッキング

---

## 変更履歴

| 日付 | 版 | 変更内容 |
|------|-----|----------|
| 2025-02-10 | 1.0 | 初版作成 |
