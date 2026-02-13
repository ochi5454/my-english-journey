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

### フェーズ9: 追加機能実装

#### ① AI生成：宛先・送信者名の自動挿入（Langchain）
- [x] Langchain統合の設計・セットアップ
- [x] プロンプトテンプレート作成（宛先名、送信者名の挿入ルール）
- [x] 宛先情報からの名前抽出ロジック
- [x] AI生成APIの拡張（名前情報のコンテキスト付与）
- [x] フロントエンドUIでの名前プレースホルダー表示
- [x] 生成結果のプレビュー・編集機能

#### ② ファジー検索（To/Cc/Bcc）
- [x] バックエンドにファジー検索エンドポイント追加
- [x] 検索アルゴリズム実装（Levenshtein距離/N-gram）
- [x] 検索対象：メールアドレス、名前、部署
- [x] 検索結果のスコアリング・ソート
- [x] フロントエンド検索UIの実装
- [x] デバウンス処理（入力中の連続リクエスト抑制）

#### ③ 宛先候補ウインドウ（To/Cc/Bcc）
- [x] ドロップダウンコンポーネント設計
- [x] 候補リスト表示UI（名前、メール、部署）
- [x] キーボードナビゲーション（↑↓選択、Enter確定）
- [x] 選択済み宛先のチップ表示
- [x] 複数選択対応
- [x] ローカル宛先リスト＋Entra ID統合検索

#### ④ SharePoint宛先連携（保留）
- [x] 設計のみ完了（実装は後日）
- [x] Microsoft Graph API連携設計
- [x] SharePointリスト読み込みAPI設計
- [x] 同期スケジュール設計

#### ⑤ 部署単位での宛先指定＋Entra ID連携

##### 設計完了
- [x] 組織マスタテーブル設計（organizations）- tenant_id対応版
- [x] 所属情報テーブル設計（employee_assignments）- 拡張版
- [x] Entra IDからの組織データ同期バッチ - 本番対応版
- [x] 組織ツリー取得API - キャッシュ・ページネーション対応
- [x] フロントエンド組織ツリー選択UI
- [x] 部署選択 → メンバー一括展開機能
- [x] 人事異動の自動反映ロジック（異動履歴テーブル含む）

##### 本番環境対応設計
- [x] マルチテナント対応設計
- [x] 環境設定ファイル構成設計
- [x] テナントマスタテーブル設計
- [x] 同期ログテーブル設計（監査用）
- [x] 異動履歴テーブル設計
- [x] エラーハンドリング＆リトライ設計
- [x] 本番デプロイチェックリスト作成

##### 開発環境での実装（完了）
- [x] バックエンドAPI実装（`backend/routers/organizations.py`）
  - 組織ツリー取得API
  - 組織メンバー取得API
  - 組織メールアドレス一括取得API
  - 組織CRUD API
  - 同期ログ取得API
  - デモデータシードAPI
- [x] データベースモデル実装（`backend/models/organization.py`）
  - Organization（組織マスタ）
  - EmployeeAssignment（従業員所属情報）
  - EntraSyncLog（同期ログ）
  - EmployeeTransferHistory（異動履歴）
- [x] フロントエンドUI実装（`frontend/app/components/OrganizationPicker.tsx`）
  - 組織ツリー表示
  - メンバープレビュー
  - 宛先への一括追加
- [x] 同期バッチ基本構造（`backend/services/entra_sync_service.py`）
  - EntraSyncServiceクラス
  - デモデータシード関数

##### 本番デプロイ（実装完了後）
- [ ] 本番環境設定（8.5.4チェックリスト参照）
- [ ] 本番デプロイ
- [ ] 初回フル同期・動作確認
- [ ] テスト作成

#### ⑥ 送信予約機能
- [x] 予約送信テーブル設計（scheduled_mails）
- [x] 予約送信API（日時指定）
- [x] バックグラウンドジョブスケジューラ設計
- [x] 予約メール一覧・編集・キャンセルUI
- [x] 送信実行ワーカー実装
- [x] 送信結果通知機能
  - [x] 通知メール送信関数の実装（`_send_failure_notification`）
  - [x] 送信失敗時の通知呼び出し追加
  - [ ] 動作確認

#### ⑦ 署名管理機能
- [x] 署名テーブル設計（signatures）
- [x] 署名CRUD API実装
- [x] 署名管理UI実装（登録・編集・削除）
- [x] メール作成画面への署名挿入機能
- [x] ダッシュボードレイアウト調整（メイン75%、サブ5項目×15%）

#### ⑧ AIチャットUI改善（Teams風操作感）
##### キー挙動
- [x] Enter → 送信
- [x] Shift + Enter → 改行
- [x] IME変換中のEnterは送信しない（compositionstart / compositionendで制御）
- [x] 空文字／空白のみは送信しない
- [x] 送信時は preventDefault を使用

##### チャットUI
- [x] チャット履歴エリアだけ縦スクロール（overflow-y: auto）
- [x] 入力欄は下部固定（sticky or flexで固定）
- [x] 新規メッセージ追加時は最下部へ自動スクロール
- [x] メール本文側スクロールとは分離すること

#### ⑨ AIガイド会話（2-3回のラリーで意図を引き出す）
- [x] バックエンド側で段階的な質問フロー実装（目的→詳細→確認）
- [x] 質問に応じた文脈保持（会話履歴を送信）
- [x] 十分な情報が集まったらメール生成

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

## 8. 追加機能詳細設計（フェーズ9）

### 8.1 AI生成：宛先・送信者名の自動挿入（Langchain）

#### 概要
メール生成時に宛先の名前や送信者の名前を自動的に文章に挿入する。Langchainを使用してプロンプトテンプレートを管理し、必須ルールを適用。

#### Langchain構成
```python
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

# プロンプトテンプレート
mail_generation_prompt = PromptTemplate(
    input_variables=["recipient_name", "sender_name", "sender_department",
                     "keywords", "tone", "recipient_type", "additional_instructions"],
    template="""
あなたはビジネスメール作成アシスタントです。以下のルールを必ず守ってください。

【必須ルール】
1. 宛先名「{recipient_name}」を本文の冒頭に必ず入れること（例：○○様）
2. 送信者名「{sender_name}」を本文の署名部分に必ず入れること
3. 送信者部署「{sender_department}」を署名に含めること

【メール作成条件】
- キーワード: {keywords}
- トーン: {tone}
- 宛先との関係: {recipient_type}
- 追加指示: {additional_instructions}

上記を踏まえて、件名と本文を作成してください。
"""
)
```

#### API拡張
```
POST /api/ai/generate
Body: {
  "keywords": ["会議", "日程調整"],
  "tone": "polite",
  "recipient_type": "customer",
  "additional_instructions": "簡潔に",
  "recipient_info": {          # ★追加
    "name": "田中太郎",
    "email": "tanaka@example.com",
    "department": "営業部"
  },
  "sender_info": {             # ★追加
    "name": "山田花子",
    "department": "総務部"
  }
}
```

#### フロントエンド連携
```
1. 宛先選択時にrecipient_infoを自動取得
2. ログインユーザーからsender_infoを自動取得
3. AI生成リクエストに両方を含める
4. 生成結果に名前が含まれているか検証
```

---

### 8.2 ファジー検索（To/Cc/Bcc）

#### 概要
タイプミスや部分一致でも宛先を見つけられるファジー検索機能。

#### 検索アルゴリズム
| アルゴリズム | 用途 | ライブラリ |
|-------------|------|-----------|
| Levenshtein距離 | タイプミス許容 | `python-Levenshtein` |
| N-gram | 部分一致 | 自前実装 or `ngram` |
| トライグラム類似度 | PostgreSQL | `pg_trgm` |

#### API
```
GET /api/recipients/search/fuzzy?q={query}&threshold=0.6

Response: {
  "results": [
    {
      "email": "tanaka@example.com",
      "name": "田中太郎",
      "department": "営業部",
      "score": 0.95,           # マッチスコア
      "match_field": "name"    # マッチした項目
    }
  ]
}
```

#### 検索対象と優先度
```
1. メールアドレス完全一致 → スコア 1.0
2. 名前完全一致 → スコア 0.95
3. 名前部分一致 → スコア 0.8
4. メールアドレス部分一致 → スコア 0.7
5. 部署一致 → スコア 0.6
6. ファジーマッチ（編集距離2以内）→ スコア 0.5
```

#### バックエンド実装例
```python
from rapidfuzz import fuzz, process

def fuzzy_search(query: str, candidates: List[RecipientMember], threshold: float = 0.6):
    results = []
    for candidate in candidates:
        # 各フィールドでスコア計算
        email_score = fuzz.ratio(query.lower(), candidate.email.lower()) / 100
        name_score = fuzz.ratio(query, candidate.name or "") / 100 if candidate.name else 0
        dept_score = fuzz.ratio(query, candidate.department or "") / 100 if candidate.department else 0

        best_score = max(email_score, name_score, dept_score)
        if best_score >= threshold:
            results.append({
                "candidate": candidate,
                "score": best_score,
                "match_field": "email" if email_score == best_score else
                               "name" if name_score == best_score else "department"
            })

    return sorted(results, key=lambda x: x["score"], reverse=True)
```

---

### 8.3 宛先候補ウインドウ（To/Cc/Bcc）

#### 概要
To/Cc/Bcc入力欄をクリックまたは入力開始時に候補ウインドウを表示。

#### UI設計
```
┌──────────────────────────────────────────────────────────────┐
│ To: [tanaka                                              ] │
│     ┌────────────────────────────────────────────────────┐ │
│     │ 🔍 検索結果（3件）                                  │ │
│     ├────────────────────────────────────────────────────┤ │
│     │ ▶ 田中 太郎                                         │ │
│     │   tanaka.taro@company.com | 営業部                  │ │
│     ├────────────────────────────────────────────────────┤ │
│     │   田中 次郎                                         │ │
│     │   tanaka.jiro@company.com | 開発部                  │ │
│     ├────────────────────────────────────────────────────┤ │
│     │   田中 花子                                         │ │
│     │   tanaka.hanako@company.com | 人事部                │ │
│     └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### コンポーネント設計
```typescript
interface RecipientSuggestion {
  id: string;
  email: string;
  name?: string;
  department?: string;
  source: 'local' | 'entra' | 'recent';  // データソース
  score?: number;                          // ファジー検索スコア
}

interface RecipientInputProps {
  label: 'To' | 'Cc' | 'Bcc';
  value: RecipientSuggestion[];
  onChange: (recipients: RecipientSuggestion[]) => void;
  onSearch: (query: string) => Promise<RecipientSuggestion[]>;
}
```

#### 動作仕様
| 操作 | 動作 |
|------|------|
| クリック | 最近使用した宛先を表示 |
| 入力開始 | デバウンス300ms後に検索実行 |
| ↑↓キー | 候補間を移動 |
| Enter | 選択中の候補を追加 |
| Tab | 選択中の候補を追加して次の項目へ |
| Escape | 候補ウインドウを閉じる |
| バックスペース | 選択済みチップを削除 |

#### 検索ソース統合
```
検索実行時の優先順位:
1. 最近使用した宛先（ローカルストレージ）
2. ローカル宛先リスト（DB）
3. Entra IDユーザーディレクトリ（API）

結果をマージしてスコア順に表示
```

---

### 8.4 SharePoint宛先連携（保留）

#### 設計概要（実装は後日）

SharePointの連絡先リストやExcelファイルから宛先情報を取得し、メール送信時に利用可能にする。

---

#### 8.4.1 Microsoft Graph API連携設計

##### 認証フロー
```
┌─────────────────────────────────────────────────────────────┐
│                    認証フロー概要                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. ユーザーがSharePoint連携を有効化                         │
│     ↓                                                       │
│  2. Azure AD認証画面にリダイレクト                           │
│     ↓                                                       │
│  3. ユーザーが Sites.Read.All スコープを承認                 │
│     ↓                                                       │
│  4. access_token + refresh_token を取得                     │
│     ↓                                                       │
│  5. トークンをユーザーに紐づけて保存                         │
│     ↓                                                       │
│  6. 以降、Graph APIアクセス時にトークン使用                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### 必要なスコープ
| スコープ | 用途 | 必須 |
|---------|------|------|
| `Sites.Read.All` | SharePointサイト・リストの読み取り | ✓ |
| `Files.Read.All` | SharePoint上のExcelファイル読み取り | - |
| `offline_access` | refresh_tokenの取得 | ✓ |

##### 主要API エンドポイント

**1. サイト一覧取得**
```
GET https://graph.microsoft.com/v1.0/sites
    ?search={keyword}
    &$select=id,displayName,webUrl

Response: {
  "value": [
    {
      "id": "contoso.sharepoint.com,abc123,def456",
      "displayName": "営業部サイト",
      "webUrl": "https://contoso.sharepoint.com/sites/sales"
    }
  ]
}
```

**2. リスト一覧取得**
```
GET https://graph.microsoft.com/v1.0/sites/{site-id}/lists
    ?$filter=list/template eq 'genericList' or list/template eq 'contacts'
    &$select=id,displayName,list

Response: {
  "value": [
    {
      "id": "list-guid-123",
      "displayName": "連絡先リスト",
      "list": { "template": "contacts" }
    }
  ]
}
```

**3. リストアイテム取得**
```
GET https://graph.microsoft.com/v1.0/sites/{site-id}/lists/{list-id}/items
    ?$select=fields
    &$expand=fields($select=Email,Title,Department,Company)
    &$top=200

Response: {
  "value": [
    {
      "id": "1",
      "fields": {
        "Email": "tanaka@external.com",
        "Title": "田中太郎",
        "Department": "営業部",
        "Company": "株式会社A"
      }
    }
  ],
  "@odata.nextLink": "..." // ページネーション
}
```

**4. SharePoint上のExcelファイル読み取り**
```
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drive/items/{item-id}/workbook/worksheets/{sheet-name}/usedRange
    ?$select=values

Response: {
  "values": [
    ["メールアドレス", "氏名", "部署"],
    ["tanaka@example.com", "田中太郎", "営業部"],
    ["suzuki@example.com", "鈴木一郎", "開発部"]
  ]
}
```

##### データモデル（トークン管理）
```sql
-- SharePoint連携トークン
CREATE TABLE sharepoint_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    access_token TEXT NOT NULL,           -- 暗号化して保存
    refresh_token TEXT NOT NULL,          -- 暗号化して保存
    expires_at TIMESTAMP NOT NULL,
    scopes TEXT,                          -- 付与されたスコープ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_sp_token_user ON sharepoint_tokens(user_id);
```

---

#### 8.4.2 SharePointリスト読み込みAPI設計

##### バックエンドAPI

**1. SharePoint連携状態確認**
```
GET /api/sharepoint/status

Response: {
  "connected": true,
  "scopes": ["Sites.Read.All"],
  "expires_at": "2025-02-20T10:00:00Z"
}
```

**2. SharePoint認証開始**
```
GET /api/sharepoint/auth

Response: {
  "auth_url": "https://login.microsoftonline.com/..."
}
```

**3. サイト一覧取得**
```
GET /api/sharepoint/sites?q={search_query}

Response: {
  "sites": [
    {
      "id": "contoso.sharepoint.com,abc123,def456",
      "name": "営業部サイト",
      "url": "https://contoso.sharepoint.com/sites/sales"
    }
  ]
}
```

**4. リスト一覧取得**
```
GET /api/sharepoint/sites/{site-id}/lists

Response: {
  "lists": [
    {
      "id": "list-guid-123",
      "name": "連絡先リスト",
      "type": "contacts",
      "item_count": 150
    }
  ]
}
```

**5. リストカラム取得（マッピング用）**
```
GET /api/sharepoint/sites/{site-id}/lists/{list-id}/columns

Response: {
  "columns": [
    { "name": "Email", "display_name": "メールアドレス", "type": "text" },
    { "name": "Title", "display_name": "名前", "type": "text" },
    { "name": "Department", "display_name": "部署", "type": "text" }
  ]
}
```

**6. インポート設定保存**
```
POST /api/sharepoint/import-config

Body: {
  "site_id": "contoso.sharepoint.com,abc123,def456",
  "list_id": "list-guid-123",
  "name": "営業部連絡先",
  "column_mapping": {
    "email": "Email",
    "name": "Title",
    "department": "Department",
    "note": "Company"
  },
  "sync_enabled": true,
  "sync_schedule": "daily"  // daily / weekly / manual
}

Response: {
  "id": 1,
  "status": "configured",
  "next_sync": "2025-02-13T03:00:00+09:00"
}
```

**7. 手動インポート実行**
```
POST /api/sharepoint/import/{config-id}/execute

Response: {
  "status": "completed",
  "imported_count": 150,
  "updated_count": 10,
  "error_count": 2,
  "errors": [
    { "row": 45, "message": "Invalid email format" }
  ]
}
```

**8. インポート設定一覧**
```
GET /api/sharepoint/import-config

Response: {
  "configs": [
    {
      "id": 1,
      "name": "営業部連絡先",
      "site_name": "営業部サイト",
      "list_name": "連絡先リスト",
      "last_sync": "2025-02-12T03:00:00+09:00",
      "sync_enabled": true,
      "recipient_count": 150
    }
  ]
}
```

##### データモデル（インポート設定）
```sql
-- SharePointインポート設定
CREATE TABLE sharepoint_import_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,           -- 設定名
    site_id VARCHAR(500) NOT NULL,        -- SharePointサイトID
    site_name VARCHAR(255),               -- サイト表示名
    list_id VARCHAR(255) NOT NULL,        -- リストID
    list_name VARCHAR(255),               -- リスト表示名
    column_mapping JSON NOT NULL,         -- カラムマッピング
    sync_enabled BOOLEAN DEFAULT FALSE,
    sync_schedule VARCHAR(20) DEFAULT 'manual',  -- daily/weekly/manual
    last_sync_at TIMESTAMP,
    last_sync_status VARCHAR(20),         -- success/failed
    last_sync_count INTEGER,
    recipient_list_id INTEGER REFERENCES recipient_lists(id),  -- 連携先の宛先リスト
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sp_config_user ON sharepoint_import_configs(user_id);
```

---

#### 8.4.3 同期スケジュール設計

##### 同期アーキテクチャ
```
┌─────────────────────────────────────────────────────────────┐
│                   同期処理フロー                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Scheduler  │ -> │  Sync Job   │ -> │ Graph API   │     │
│  │  (APScheduler)│    │  (Worker)   │    │ (Microsoft) │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │             │
│         │                  ▼                  │             │
│         │           ┌─────────────┐           │             │
│         │           │  Diff Engine│ <─────────┘             │
│         │           │  (差分検出)  │                         │
│         │           └─────────────┘                         │
│         │                  │                                │
│         │                  ▼                                │
│         │           ┌─────────────┐                         │
│         └────────>  │    DB       │                         │
│                     │ (宛先リスト) │                         │
│                     └─────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### スケジュールオプション
| オプション | 実行タイミング | ユースケース |
|-----------|---------------|-------------|
| `manual` | ユーザーが手動実行 | 更新頻度が低い場合 |
| `daily` | 毎日 AM 3:00 | 通常運用 |
| `weekly` | 毎週月曜 AM 3:00 | 更新頻度が低い大規模リスト |

##### 同期処理ロジック
```python
async def sync_sharepoint_recipients(config_id: int):
    """
    SharePointリストと宛先リストを同期
    """
    config = db.query(SharePointImportConfig).get(config_id)
    user = db.query(User).get(config.user_id)

    # 1. トークン取得（必要に応じてリフレッシュ）
    token = await get_valid_token(user.id)

    # 2. SharePointからデータ取得
    sp_items = await fetch_all_list_items(
        token=token,
        site_id=config.site_id,
        list_id=config.list_id,
        column_mapping=config.column_mapping
    )

    # 3. 既存の宛先リストを取得
    existing_members = db.query(RecipientListMember).filter(
        RecipientListMember.list_id == config.recipient_list_id
    ).all()
    existing_map = {m.email: m for m in existing_members}

    # 4. 差分処理
    stats = {"added": 0, "updated": 0, "deleted": 0}

    sp_emails = set()
    for item in sp_items:
        email = item.get("email")
        if not email:
            continue
        sp_emails.add(email)

        if email in existing_map:
            # 更新チェック
            member = existing_map[email]
            if (member.name != item.get("name") or
                member.department != item.get("department")):
                member.name = item.get("name")
                member.department = item.get("department")
                stats["updated"] += 1
        else:
            # 新規追加
            new_member = RecipientListMember(
                list_id=config.recipient_list_id,
                email=email,
                name=item.get("name"),
                department=item.get("department"),
                note=item.get("note")
            )
            db.add(new_member)
            stats["added"] += 1

    # 5. 削除処理（SharePointから消えたもの）
    for email, member in existing_map.items():
        if email not in sp_emails:
            db.delete(member)
            stats["deleted"] += 1

    # 6. 同期結果を記録
    config.last_sync_at = datetime.utcnow()
    config.last_sync_status = "success"
    config.last_sync_count = len(sp_items)
    db.commit()

    return stats
```

##### スケジューラー設定
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

# 日次同期（毎日 AM 3:00 JST）
@scheduler.scheduled_job(CronTrigger(hour=3, minute=0, timezone='Asia/Tokyo'))
async def daily_sharepoint_sync():
    configs = db.query(SharePointImportConfig).filter(
        SharePointImportConfig.sync_enabled == True,
        SharePointImportConfig.sync_schedule == 'daily'
    ).all()

    for config in configs:
        try:
            await sync_sharepoint_recipients(config.id)
        except Exception as e:
            logger.error(f"SharePoint sync failed for config {config.id}: {e}")
            config.last_sync_status = "failed"
            db.commit()

# 週次同期（毎週月曜 AM 3:00 JST）
@scheduler.scheduled_job(CronTrigger(day_of_week='mon', hour=3, minute=0, timezone='Asia/Tokyo'))
async def weekly_sharepoint_sync():
    configs = db.query(SharePointImportConfig).filter(
        SharePointImportConfig.sync_enabled == True,
        SharePointImportConfig.sync_schedule == 'weekly'
    ).all()

    for config in configs:
        try:
            await sync_sharepoint_recipients(config.id)
        except Exception as e:
            logger.error(f"SharePoint sync failed for config {config.id}: {e}")
```

##### フロントエンドUI
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 SharePoint連携設定                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ステータス: ✅ 連携済み                    [連携解除]        │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 📁 インポート設定                                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 営業部連絡先                                   [編集][削除]│ │
│ │ サイト: 営業部サイト / リスト: 連絡先リスト              │ │
│ │ 同期: 日次 / 最終同期: 2025-02-12 03:00 / 150件         │ │
│ │                                     [今すぐ同期]        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 取引先一覧                                     [編集][削除]│ │
│ │ サイト: 総務部サイト / リスト: 取引先マスタ              │ │
│ │ 同期: 週次 / 最終同期: 2025-02-10 03:00 / 500件         │ │
│ │                                     [今すぐ同期]        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                              [+ 新しいインポート設定を追加]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### インポート設定ウィザード
```
┌─────────────────────────────────────────────────────────────┐
│ SharePointからインポート                          Step 2/4  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ カラムマッピングを設定してください                           │
│                                                             │
│ SharePointカラム          →    システムフィールド           │
│ ┌─────────────────────┐      ┌─────────────────────┐       │
│ │ Email               │  ->  │ メールアドレス ✓必須 │       │
│ └─────────────────────┘      └─────────────────────┘       │
│ ┌─────────────────────┐      ┌─────────────────────┐       │
│ │ Title               │  ->  │ 氏名                │       │
│ └─────────────────────┘      └─────────────────────┘       │
│ ┌─────────────────────┐      ┌─────────────────────┐       │
│ │ Department          │  ->  │ 部署                │       │
│ └─────────────────────┘      └─────────────────────┘       │
│ ┌─────────────────────┐      ┌─────────────────────┐       │
│ │ Company             │  ->  │ 備考                │       │
│ └─────────────────────┘      └─────────────────────┘       │
│                                                             │
│ プレビュー（最初の3件）:                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ tanaka@ext.com | 田中太郎 | 営業部 | 株式会社A          │ │
│ │ suzuki@ext.com | 鈴木一郎 | 開発部 | 株式会社B          │ │
│ │ sato@ext.com   | 佐藤花子 | 人事部 | 株式会社C          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                         [戻る] [次へ: 同期設定]              │
└─────────────────────────────────────────────────────────────┘
```

---

### 8.5 部署単位での宛先指定＋Entra ID連携

#### 概要
部署を選択すると、その部署に所属する全員が宛先に追加される。人事異動はEntra IDとの同期で自動反映。

---

#### 8.5.1 本番環境デプロイ考慮事項

##### マルチテナント対応設計
```
┌─────────────────────────────────────────────────────────────┐
│                  マルチテナントアーキテクチャ                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Company A  │  │  Company B  │  │  Company C  │        │
│  │  Tenant     │  │  Tenant     │  │  Tenant     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         ▼                ▼                ▼                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              AI Mail Agent (共通基盤)                │  │
│  │  ┌─────────────────────────────────────────────┐    │  │
│  │  │  tenant_id によるデータ分離                   │    │  │
│  │  └─────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────┘  │
│         │                │                │                │
│         ▼                ▼                ▼                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Entra ID A  │  │ Entra ID B  │  │ Entra ID C  │        │
│  │ (Azure AD)  │  │ (Azure AD)  │  │ (Azure AD)  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### 環境設定ファイル構成
```
config/
├── .env.development      # 開発環境
├── .env.staging          # ステージング環境
├── .env.production       # 本番環境テンプレート
└── tenants/
    ├── company_a.env     # A社固有設定
    ├── company_b.env     # B社固有設定
    └── README.md         # テナント設定ガイド
```

##### テナント別環境変数
```bash
# テナント識別
TENANT_ID=company_a
TENANT_NAME=株式会社A

# Azure AD / Entra ID 設定（テナントごとに異なる）
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=encrypted_secret_here

# Graph API設定
GRAPH_API_SCOPES=User.Read.All,Directory.Read.All

# 同期設定
ENTRA_SYNC_ENABLED=true
ENTRA_SYNC_SCHEDULE=0 3 * * *  # 毎日AM3:00
ENTRA_SYNC_BATCH_SIZE=100      # ページネーションサイズ
ENTRA_SYNC_RETRY_COUNT=3       # リトライ回数

# 組織構造設定
ORG_HIERARCHY_SOURCE=entra_department  # entra_department / manual / hybrid
ORG_MAX_DEPTH=5                         # 組織階層の最大深度
ORG_ROOT_DEPARTMENT=本社               # ルート組織名（オプション）

# データベース（テナント分離）
DATABASE_URL=postgresql://user:pass@host:5432/aimail_company_a
# または共有DB + tenant_id分離
# DATABASE_URL=postgresql://user:pass@host:5432/aimail_shared
```

---

#### 8.5.2 データベース設計（本番対応版）

```sql
-- テナントマスタ（マルチテナント運用時）
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    tenant_code VARCHAR(50) UNIQUE NOT NULL,  -- company_a, company_b
    tenant_name VARCHAR(255) NOT NULL,
    azure_tenant_id VARCHAR(255) NOT NULL,    -- Entra IDテナントID
    settings JSONB DEFAULT '{}',              -- テナント固有設定
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 組織マスタ（tenant_id追加）
CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    code VARCHAR(100),                        -- 部署コード（テナント内ユニーク）
    name VARCHAR(255) NOT NULL,               -- 部署名
    name_en VARCHAR(255),                     -- 英語名（グローバル企業対応）
    parent_id INTEGER REFERENCES organizations(id),
    level INTEGER DEFAULT 1,
    entra_id VARCHAR(255),                    -- Entra ID上の部署識別子
    entra_department_name VARCHAR(255),       -- Entra IDのdepartmentフィールド値
    member_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,             -- 表示順
    metadata JSONB DEFAULT '{}',              -- 拡張用メタデータ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_org_tenant ON organizations(tenant_id);
CREATE INDEX idx_org_parent ON organizations(parent_id);
CREATE INDEX idx_org_entra_dept ON organizations(tenant_id, entra_department_name);

-- 従業員所属情報（tenant_id追加 + 拡張）
CREATE TABLE employee_assignments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id INTEGER REFERENCES users(id),
    entra_user_id VARCHAR(255) NOT NULL,      -- Entra ID上のユーザーID
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    display_name_kana VARCHAR(255),           -- ふりがな（日本語環境）
    organization_id INTEGER REFERENCES organizations(id),
    job_title VARCHAR(255),
    employee_number VARCHAR(50),              -- 社員番号
    is_primary BOOLEAN DEFAULT TRUE,
    employment_type VARCHAR(50),              -- 正社員/契約社員/派遣等
    start_date DATE,
    end_date DATE,
    synced_at TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'synced', -- synced/pending/error
    sync_error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, entra_user_id)
);
CREATE INDEX idx_assign_tenant ON employee_assignments(tenant_id);
CREATE INDEX idx_assign_org ON employee_assignments(organization_id);
CREATE INDEX idx_assign_email ON employee_assignments(tenant_id, email);
CREATE INDEX idx_assign_entra ON employee_assignments(tenant_id, entra_user_id);
CREATE INDEX idx_assign_active ON employee_assignments(tenant_id, end_date)
    WHERE end_date IS NULL;

-- 同期ログ（監査・デバッグ用）
CREATE TABLE entra_sync_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    sync_type VARCHAR(20) NOT NULL,           -- full / incremental / manual
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL,              -- running/completed/failed
    users_processed INTEGER DEFAULT 0,
    users_added INTEGER DEFAULT 0,
    users_updated INTEGER DEFAULT 0,
    users_deactivated INTEGER DEFAULT 0,
    orgs_added INTEGER DEFAULT 0,
    orgs_updated INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_details JSONB,
    metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_sync_log_tenant ON entra_sync_logs(tenant_id);
CREATE INDEX idx_sync_log_date ON entra_sync_logs(started_at DESC);

-- 異動履歴（監査用）
CREATE TABLE employee_transfer_history (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    employee_id INTEGER NOT NULL REFERENCES employee_assignments(id),
    from_organization_id INTEGER REFERENCES organizations(id),
    to_organization_id INTEGER REFERENCES organizations(id),
    transfer_date DATE NOT NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_log_id INTEGER REFERENCES entra_sync_logs(id)
);
CREATE INDEX idx_transfer_tenant ON employee_transfer_history(tenant_id);
CREATE INDEX idx_transfer_employee ON employee_transfer_history(employee_id);
```

---

#### 8.5.3 Entra ID同期バッチ（本番対応版）

```python
import asyncio
import logging
from datetime import datetime, date
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from tenacity import retry, stop_after_attempt, wait_exponential
from msgraph import GraphServiceClient
from azure.identity import ClientSecretCredential

logger = logging.getLogger(__name__)


class EntraSyncService:
    """
    Entra ID同期サービス（本番環境対応版）

    特徴:
    - マルチテナント対応
    - ページネーション対応（大規模組織）
    - エラーハンドリング＆リトライ
    - 増分同期サポート
    - 監査ログ
    """

    def __init__(self, tenant_id: int, config: Dict[str, Any]):
        self.tenant_id = tenant_id
        self.config = config
        self.batch_size = config.get('batch_size', 100)
        self.retry_count = config.get('retry_count', 3)

        # Graph APIクライアント初期化
        credential = ClientSecretCredential(
            tenant_id=config['azure_tenant_id'],
            client_id=config['azure_client_id'],
            client_secret=config['azure_client_secret']
        )
        self.graph_client = GraphServiceClient(credential)

    async def run_full_sync(self) -> Dict[str, int]:
        """
        フル同期を実行
        - 初回デプロイ時
        - 手動トリガー時
        """
        sync_log = await self._create_sync_log('full')

        try:
            stats = {
                'users_processed': 0,
                'users_added': 0,
                'users_updated': 0,
                'users_deactivated': 0,
                'orgs_added': 0,
                'orgs_updated': 0,
                'error_count': 0
            }
            errors = []

            # 1. Entra IDから全ユーザー取得（ページネーション）
            all_users = await self._fetch_all_users()
            logger.info(f"Fetched {len(all_users)} users from Entra ID")

            # 2. 組織情報の抽出と更新
            departments = self._extract_departments(all_users)
            org_stats = await self._sync_organizations(departments)
            stats['orgs_added'] = org_stats['added']
            stats['orgs_updated'] = org_stats['updated']

            # 3. ユーザー情報の同期
            entra_user_ids = set()
            for user in all_users:
                try:
                    result = await self._sync_user(user, sync_log.id)
                    stats['users_processed'] += 1
                    stats[f"users_{result}"] = stats.get(f"users_{result}", 0) + 1
                    entra_user_ids.add(user['id'])
                except Exception as e:
                    stats['error_count'] += 1
                    errors.append({
                        'user_id': user.get('id'),
                        'email': user.get('mail'),
                        'error': str(e)
                    })
                    logger.error(f"Failed to sync user {user.get('mail')}: {e}")

            # 4. 削除されたユーザーの非アクティブ化
            deactivated = await self._deactivate_removed_users(entra_user_ids)
            stats['users_deactivated'] = deactivated

            # 5. 同期ログ更新
            await self._complete_sync_log(sync_log, 'completed', stats, errors)

            return stats

        except Exception as e:
            logger.exception(f"Full sync failed for tenant {self.tenant_id}")
            await self._complete_sync_log(sync_log, 'failed', {}, [{'error': str(e)}])
            raise

    async def run_incremental_sync(self, since: datetime) -> Dict[str, int]:
        """
        増分同期を実行（delta queryを使用）
        - 日次同期で使用
        - 変更があったユーザーのみ取得
        """
        sync_log = await self._create_sync_log('incremental')
        # delta query実装...
        pass

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=60)
    )
    async def _fetch_all_users(self) -> List[Dict[str, Any]]:
        """
        全ユーザーをページネーションで取得（リトライ付き）
        """
        users = []

        # 初回リクエスト
        result = await self.graph_client.users.get(
            query_parameters={
                '$select': 'id,displayName,mail,department,jobTitle,employeeId,accountEnabled',
                '$filter': 'accountEnabled eq true',
                '$top': self.batch_size,
                '$orderby': 'displayName'
            }
        )

        users.extend(result.value)

        # ページネーション
        while result.odata_next_link:
            logger.debug(f"Fetching next page, current count: {len(users)}")
            result = await self.graph_client.users.with_url(result.odata_next_link).get()
            users.extend(result.value)

            # レート制限対策
            await asyncio.sleep(0.1)

        return users

    def _extract_departments(self, users: List[Dict]) -> Dict[str, int]:
        """
        ユーザーリストから部署名を抽出（重複排除、人数カウント）
        """
        departments = {}
        for user in users:
            dept = user.get('department')
            if dept:
                departments[dept] = departments.get(dept, 0) + 1
        return departments

    async def _sync_organizations(self, departments: Dict[str, int]) -> Dict[str, int]:
        """
        組織マスタを同期
        """
        stats = {'added': 0, 'updated': 0}

        for dept_name, member_count in departments.items():
            org = await db.get_organization_by_entra_dept(
                self.tenant_id, dept_name
            )

            if org:
                if org.member_count != member_count:
                    org.member_count = member_count
                    org.updated_at = datetime.utcnow()
                    stats['updated'] += 1
            else:
                # 新規部署を作成
                new_org = Organization(
                    tenant_id=self.tenant_id,
                    name=dept_name,
                    entra_department_name=dept_name,
                    member_count=member_count,
                    code=self._generate_org_code(dept_name)
                )
                db.add(new_org)
                stats['added'] += 1

        await db.commit()
        return stats

    async def _sync_user(self, entra_user: Dict, sync_log_id: int) -> str:
        """
        単一ユーザーを同期
        Returns: 'added' | 'updated' | 'unchanged'
        """
        existing = await db.get_employee_by_entra_id(
            self.tenant_id, entra_user['id']
        )

        org = await db.get_organization_by_entra_dept(
            self.tenant_id, entra_user.get('department')
        )

        if existing:
            # 異動検知
            if existing.organization_id != (org.id if org else None):
                await self._record_transfer(
                    existing, org, sync_log_id
                )
                existing.organization_id = org.id if org else None

            # 情報更新
            existing.display_name = entra_user.get('displayName')
            existing.email = entra_user.get('mail')
            existing.job_title = entra_user.get('jobTitle')
            existing.employee_number = entra_user.get('employeeId')
            existing.synced_at = datetime.utcnow()
            existing.sync_status = 'synced'

            return 'updated' if db.is_modified(existing) else 'unchanged'
        else:
            # 新規追加
            new_employee = EmployeeAssignment(
                tenant_id=self.tenant_id,
                entra_user_id=entra_user['id'],
                email=entra_user.get('mail'),
                display_name=entra_user.get('displayName'),
                organization_id=org.id if org else None,
                job_title=entra_user.get('jobTitle'),
                employee_number=entra_user.get('employeeId'),
                start_date=date.today(),
                synced_at=datetime.utcnow()
            )
            db.add(new_employee)
            return 'added'

    async def _record_transfer(
        self,
        employee: EmployeeAssignment,
        new_org: Optional[Organization],
        sync_log_id: int
    ):
        """
        異動履歴を記録
        """
        transfer = EmployeeTransferHistory(
            tenant_id=self.tenant_id,
            employee_id=employee.id,
            from_organization_id=employee.organization_id,
            to_organization_id=new_org.id if new_org else None,
            transfer_date=date.today(),
            sync_log_id=sync_log_id
        )
        db.add(transfer)
        logger.info(
            f"Transfer detected: {employee.display_name} "
            f"from org_id={employee.organization_id} to org_id={new_org.id if new_org else None}"
        )

    async def _deactivate_removed_users(self, active_entra_ids: set) -> int:
        """
        Entra IDから削除されたユーザーを非アクティブ化
        """
        count = await db.deactivate_employees_not_in(
            self.tenant_id, active_entra_ids
        )
        return count
```

---

#### 8.5.4 本番デプロイチェックリスト

##### Azure AD / Entra ID 設定
```markdown
□ Azureポータルでアプリ登録を作成
  - 名前: AI Mail Agent - {会社名}
  - サポートされるアカウントの種類: この組織ディレクトリ内のアカウントのみ

□ API権限を設定
  - Microsoft Graph > User.Read.All (アプリケーション権限)
  - Microsoft Graph > Directory.Read.All (アプリケーション権限)
  - ※ 管理者の同意を付与

□ クライアントシークレットを作成
  - 有効期限: 24ヶ月推奨
  - シークレット値を安全に保管

□ リダイレクトURIを設定（OAuth使用時）
  - https://{domain}/api/auth/callback
```

##### インフラ設定
```markdown
□ データベース作成
  - PostgreSQL 14以上推奨
  - 接続プーリング設定
  - バックアップ設定

□ 環境変数設定
  - AZURE_TENANT_ID
  - AZURE_CLIENT_ID
  - AZURE_CLIENT_SECRET（暗号化推奨）
  - DATABASE_URL

□ スケジューラー設定
  - cronまたはAPScheduler設定
  - 同期時刻の設定（業務時間外推奨）

□ 監視設定
  - 同期ジョブのヘルスチェック
  - エラーアラート設定
```

##### 初回データ移行
```markdown
□ 初回フル同期の実行
  - 本番環境で初回フル同期を実行
  - 同期結果の確認（ユーザー数、組織数）

□ 組織階層の確認・調整
  - 自動生成された組織構造を確認
  - 必要に応じて親子関係を手動調整
  - 表示順（sort_order）の設定

□ テストユーザーでの動作確認
  - 部署選択UIの動作確認
  - メンバー展開の確認
```

---

#### 8.5.5 組織ツリーAPI（本番対応版）

```python
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


@router.get("/tree")
async def get_organization_tree(
    current_user: User = Depends(get_current_user),
    include_inactive: bool = False,
    max_depth: Optional[int] = None
):
    """
    組織ツリーを取得
    - キャッシュ対応（Redis使用時）
    - 大規模組織でもパフォーマンス確保
    """
    tenant_id = current_user.tenant_id

    # キャッシュチェック
    cache_key = f"org_tree:{tenant_id}:{include_inactive}:{max_depth}"
    cached = await cache.get(cache_key)
    if cached:
        return cached

    # DBから取得
    organizations = await db.get_organizations(
        tenant_id=tenant_id,
        include_inactive=include_inactive
    )

    # ツリー構造に変換
    tree = build_tree(organizations, max_depth)

    # キャッシュ保存（5分）
    await cache.set(cache_key, tree, ttl=300)

    return {"organizations": tree}


@router.get("/{org_id}/members")
async def get_organization_members(
    org_id: int,
    include_children: bool = True,
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user)
):
    """
    組織のメンバー一覧を取得
    - ページネーション対応
    - 下位組織を含むオプション
    """
    tenant_id = current_user.tenant_id

    # 組織の存在確認
    org = await db.get_organization(tenant_id, org_id)
    if not org:
        raise HTTPException(404, "Organization not found")

    # 対象組織IDリストを取得
    org_ids = [org_id]
    if include_children:
        child_ids = await db.get_descendant_org_ids(tenant_id, org_id)
        org_ids.extend(child_ids)

    # メンバー取得（ページネーション）
    members, total = await db.get_employees_by_orgs(
        tenant_id=tenant_id,
        org_ids=org_ids,
        offset=(page - 1) * page_size,
        limit=page_size
    )

    return {
        "organization": {"id": org.id, "name": org.name},
        "members": [
            {
                "email": m.email,
                "name": m.display_name,
                "department": m.organization.name if m.organization else None,
                "job_title": m.job_title
            }
            for m in members
        ],
        "total_count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }
```

---

#### 8.5.6 フロントエンドUI

```
┌─────────────────────────────────────────────────────────────┐
│ 🏢 組織から宛先を選択                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ 本社                                              150名   │
│   ├─ ▼ 営業本部                                      50名   │
│   │    ├─ □ 営業1部                                  25名   │
│   │    ├─ ☑ 営業2部                                  25名   │← チェック済み
│   │    └─ □ 営業企画課                               10名   │
│   ├─ ▶ 開発本部                                      80名   │
│   └─ ▶ 管理本部                                      20名   │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ 選択中: 営業2部（25名）                                      │
│ [プレビュー] [To に追加] [Cc に追加] [キャンセル]             │
└─────────────────────────────────────────────────────────────┘
```

#### Entra ID同期バッチ
```python
# 同期処理フロー
async def sync_entra_users():
    """
    1. Microsoft Graph APIから全ユーザー取得
    2. department情報でorganizationsテーブルを更新
    3. employee_assignmentsを差分更新
    4. 異動検知: 前回と所属が変わった場合は履歴を残す
    """

    # Graph APIでユーザー一覧取得
    users = await graph_client.get("/users", params={
        "$select": "id,displayName,mail,department,jobTitle",
        "$filter": "accountEnabled eq true",
        "$top": 999
    })

    for user in users:
        # 部署が存在しなければ作成
        org = get_or_create_organization(user["department"])

        # 所属情報を更新（異動検知）
        existing = get_assignment_by_entra_id(user["id"])
        if existing and existing.organization_id != org.id:
            # 異動発生: 旧所属を終了、新所属を開始
            existing.end_date = date.today()
            create_new_assignment(user, org)
        elif not existing:
            create_new_assignment(user, org)
        else:
            update_assignment(existing, user)
```

#### 組織ツリーAPI
```
GET /api/organizations/tree

Response: {
  "organizations": [
    {
      "id": 1,
      "code": "HQ",
      "name": "本社",
      "member_count": 150,
      "children": [
        {
          "id": 2,
          "code": "SALES",
          "name": "営業本部",
          "member_count": 50,
          "children": [
            { "id": 3, "code": "SALES1", "name": "営業1部", "member_count": 25 },
            { "id": 4, "code": "SALES2", "name": "営業2部", "member_count": 25 }
          ]
        },
        {
          "id": 5,
          "code": "DEV",
          "name": "開発本部",
          "member_count": 80,
          "children": [...]
        }
      ]
    }
  ]
}
```

#### 部署メンバー取得API
```
GET /api/organizations/{id}/members?include_children=true

Response: {
  "organization": { "id": 2, "name": "営業本部" },
  "members": [
    { "email": "tanaka@company.com", "name": "田中太郎", "department": "営業1部" },
    { "email": "suzuki@company.com", "name": "鈴木一郎", "department": "営業2部" },
    ...
  ],
  "total_count": 50
}
```

#### フロントエンドUI
```
┌─────────────────────────────────────────────────────────────┐
│ 🏢 組織から宛先を選択                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ 本社                                              150名   │
│   ├─ ▼ 営業本部                                      50名   │
│   │    ├─ □ 営業1部                                  25名   │
│   │    ├─ ☑ 営業2部                                  25名   │← チェック済み
│   │    └─ □ 営業企画課                               10名   │
│   ├─ ▶ 開発本部                                      80名   │
│   └─ ▶ 管理本部                                      20名   │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ 選択中: 営業2部（25名）                                      │
│ [プレビュー] [To に追加] [Cc に追加] [キャンセル]             │
└─────────────────────────────────────────────────────────────┘
```

---

### 8.6 送信予約機能

#### 概要
指定した日時にメールを自動送信する予約機能。

#### データベース設計
```sql
-- 予約送信メール
CREATE TABLE scheduled_mails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    scheduled_at TIMESTAMP NOT NULL,      -- 送信予定日時
    to_addresses JSON NOT NULL,
    cc_addresses JSON,
    bcc_addresses JSON,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    body_type VARCHAR(10) DEFAULT 'text', -- text / html
    attachments JSON,                     -- 添付ファイル情報
    status VARCHAR(20) DEFAULT 'pending', -- pending / sent / failed / cancelled
    error_message TEXT,
    graph_message_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    cancelled_at TIMESTAMP
);
CREATE INDEX idx_scheduled_user ON scheduled_mails(user_id);
CREATE INDEX idx_scheduled_status ON scheduled_mails(status);
CREATE INDEX idx_scheduled_at ON scheduled_mails(scheduled_at);
```

#### API設計
```
# 予約送信作成
POST /api/mail/schedule
Body: {
  "to": ["tanaka@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "週次報告",
  "body": "...",
  "body_type": "text",
  "attachments": [...],
  "scheduled_at": "2025-02-15T09:00:00+09:00"  # 送信予定日時
}

Response: {
  "id": 123,
  "scheduled_at": "2025-02-15T09:00:00+09:00",
  "status": "pending"
}

# 予約一覧
GET /api/mail/schedule
Response: {
  "scheduled_mails": [
    { "id": 123, "subject": "週次報告", "scheduled_at": "...", "status": "pending" }
  ]
}

# 予約詳細
GET /api/mail/schedule/{id}

# 予約更新（日時変更、内容変更）
PUT /api/mail/schedule/{id}

# 予約キャンセル
DELETE /api/mail/schedule/{id}
```

#### バックグラウンドジョブ
```python
# APScheduler または Celery を使用

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

@scheduler.scheduled_job('interval', minutes=1)
async def process_scheduled_mails():
    """
    毎分実行: 送信予定時刻を過ぎた予約メールを送信
    """
    now = datetime.utcnow()
    pending_mails = db.query(ScheduledMail).filter(
        ScheduledMail.status == 'pending',
        ScheduledMail.scheduled_at <= now
    ).all()

    for mail in pending_mails:
        try:
            result = await send_mail_via_graph(mail)
            mail.status = 'sent'
            mail.sent_at = datetime.utcnow()
            mail.graph_message_id = result['message_id']
        except Exception as e:
            mail.status = 'failed'
            mail.error_message = str(e)
        db.commit()
```

#### フロントエンドUI
```
┌─────────────────────────────────────────────────────────────┐
│ 📅 送信予約                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 送信日時を選択:                                              │
│                                                             │
│ 日付: [2025-02-15      📅]                                  │
│ 時刻: [09] : [00]                                           │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ ⚡ クイック選択:                                             │
│ [明日 9:00] [明後日 9:00] [来週月曜 9:00] [1時間後]          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    [キャンセル] [予約送信を設定]              │
└─────────────────────────────────────────────────────────────┘
```

#### 送信ボタンの変更
```
通常: [送信]
予約設定時: [▼ 送信] → ドロップダウン
            ├─ 今すぐ送信
            └─ 送信日時を指定...
```

#### 送信結果通知機能

##### 概要
予約送信が失敗した場合に、ユーザーにメールで通知する機能。

##### 設計方針
- **通知タイミング**: 送信失敗時のみ
- **通知方式**: メール通知（ユーザー自身のアカウントから自分宛に送信）
- **送信元**: ユーザーのGraph APIトークンを使用して自分自身に送信

##### 通知メール仕様
```
件名: 【送信失敗】予約メールの送信に失敗しました

本文:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
予約メールの送信に失敗しました
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 失敗したメールの情報
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
件名: {subject}
宛先: {to_addresses}
予約日時: {scheduled_at}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ エラー内容
{error_message}

■ 対処方法
予約送信ページから再度送信を試みるか、内容を確認してください。
{app_url}/scheduled
```

##### 実装箇所
`backend/services/scheduler_service.py` の `_process_single_mail` 関数内で、
送信失敗時に通知メール送信処理を追加。

```python
async def _send_failure_notification(
    db: Session,
    mail: ScheduledMail,
    token_store: TokenStore,
    error_message: str
):
    """
    送信失敗時の通知メールを送信

    ユーザー自身のアカウントから自分宛に通知メールを送信する。
    トークン切れなどで通知も送れない場合はログに記録して終了。
    """
    try:
        # ユーザーのメールアドレスを取得
        user = db.query(User).filter(User.id == mail.user_id).first()
        if not user or not user.email:
            logger.warning(f"Cannot send failure notification: user email not found")
            return

        notification_subject = "【送信失敗】予約メールの送信に失敗しました"
        notification_body = f"""
予約メールの送信に失敗しました

■ 失敗したメールの情報
件名: {mail.subject}
宛先: {', '.join(mail.to_addresses)}
予約日時: {mail.scheduled_at.isoformat()}

■ エラー内容
{error_message}

■ 対処方法
予約送信ページから再度送信を試みるか、内容を確認してください。
        """.strip()

        await send_mail_via_graph(
            settings=settings,
            to=[user.email],
            subject=notification_subject,
            body=notification_body,
            access_token=token_store.access_token,
            refresh_token=token_store.refresh_token,
            token_expires_at=token_store.token_expires_at,
        )
        logger.info(f"Failure notification sent for scheduled mail {mail.id}")
    except Exception as e:
        # 通知メール送信も失敗した場合はログのみ
        logger.error(f"Failed to send failure notification for mail {mail.id}: {e}")
```

##### トークン切れ時の考慮
- 予約送信の実用的なユースケース（数時間〜数日後）では、リフレッシュトークン（90日有効）の期限切れはほぼ発生しない
- トークン切れで通知メールも送れない場合は、ログに記録し、ユーザーが予約送信ページを開いた際に失敗ステータスを確認できるようにする
- 万が一のケースはUI上のステータス表示でカバー

---

### 8.7 署名管理機能

#### 概要
メール本文に自動挿入する署名を管理する機能。ユーザーごとに複数の署名を登録し、メール作成時に選択・挿入できる。

#### データベース設計
```sql
-- 署名マスタ
CREATE TABLE signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,           -- 署名の名前（例：「通常」「社外向け」）
    content TEXT NOT NULL,                -- 署名本文
    is_default BOOLEAN DEFAULT FALSE,     -- デフォルト署名フラグ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_signatures_user ON signatures(user_id);
```

#### API設計
```
# 署名一覧取得
GET /api/signatures
Response: {
  "signatures": [
    { "id": 1, "name": "通常", "content": "...", "is_default": true },
    { "id": 2, "name": "社外向け", "content": "...", "is_default": false }
  ]
}

# 署名作成
POST /api/signatures
Body: {
  "name": "通常",
  "content": "---\n山田太郎\n株式会社サンプル\nTEL: 03-xxxx-xxxx",
  "is_default": true
}

# 署名更新
PUT /api/signatures/{id}
Body: {
  "name": "通常（更新）",
  "content": "...",
  "is_default": true
}

# 署名削除
DELETE /api/signatures/{id}
```

#### フロントエンドUI

##### ダッシュボードレイアウト
```
┌─────────────────────────────────────────────────────────────┐
│                      AI Mail Agent                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │              ✉️ メール新規作成                          │ │
│  │              メールを作成・送信                         │ │
│  │                      (75%)                             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │📋        │ │👥        │ │📅        │ │📤        │ │✍️        │ │
│  │テンプレート│ │宛先管理  │ │予約送信  │ │送信履歴  │ │署名管理  │ │
│  │  (15%)   │ │  (15%)   │ │  (15%)   │ │  (15%)   │ │  (15%)   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

##### 署名管理画面
```
┌─────────────────────────────────────────────────────────────┐
│ ← ホーム              ✍️ 署名管理                    [+ 新規] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📝 通常                                    ⭐ [編集]│   │
│  │ ---                                                 │   │
│  │ 山田太郎                                            │   │
│  │ 株式会社サンプル                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📝 社外向け                               [編集]   │   │
│  │ ---                                                 │   │
│  │ 山田太郎 / Taro Yamada                             │   │
│  │ Sample Corporation                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

##### メール作成画面での署名挿入
- メール本文エリアの下部に「署名を挿入」ボタンを配置
- クリックで署名選択ドロップダウンを表示
- 選択した署名を本文末尾に挿入
- デフォルト署名がある場合は新規作成時に自動挿入

---

## 9. 今後の拡張（Phase3以降）

- 送信テンプレートのチーム共有
- 送信承認ワークフロー
- メール開封トラッキング

---

## 変更履歴

| 日付 | 版 | 変更内容 |
|------|-----|----------|
| 2025-02-10 | 1.0 | 初版作成 |
| 2025-02-12 | 1.1 | フェーズ9追加機能を追加（①AI名前挿入、②ファジー検索、③候補ウインドウ、④SharePoint連携(保留)、⑤部署単位宛先指定、⑥送信予約機能） |
| 2025-02-12 | 1.2 | ④SharePoint連携の詳細設計を追加（Microsoft Graph API連携、リスト読み込みAPI、同期スケジュール） |
| 2025-02-12 | 1.3 | ⑤部署単位宛先指定を本番環境対応版に拡張（マルチテナント対応、テナントマスタ、同期ログ、異動履歴、デプロイチェックリスト） |
| 2025-02-12 | 1.4 | ⑤部署単位宛先指定の開発環境実装完了（バックエンドAPI、DBモデル、フロントエンドUI、同期バッチ基本構造） |
| 2025-02-12 | 1.5 | ⑥送信予約機能：送信結果通知機能を追加（失敗時メール通知、ユーザー自身→自分宛方式） |
| 2025-02-12 | 1.6 | ⑦署名管理機能を追加（署名CRUD API、署名管理UI、メール作成画面への署名挿入、ダッシュボード5項目レイアウト） |
