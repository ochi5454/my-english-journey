# Excelテンプレートダウンロード＆To/Cc/Bcc振り分けインポート機能 設計書

## 実装チェックリスト

### Phase 1: データモデル・バックエンド
- [x] `recipient_type` カラム追加のマイグレーション作成・実行
- [x] Pydantic schemas 更新（RecipientMemberCreate, RecipientMemberResponse, RecipientListResponse）
- [x] `POST /recipients/upload` に recipient_type 対応追加
- [x] `GET /recipients/lists` に to_count/cc_count/bcc_count 追加
- [x] `GET /recipients/lists/{list_id}` に recipient_type 追加
- [x] `GET /recipients/templates/simple` 実装（シンプル版テンプレートDL）
- [x] `GET /recipients/templates/with-types` 実装（振り分け版テンプレートDL）
- [x] `POST /recipients/lists/{list_id}/import` 実装（既存リストへの追加インポート）

### Phase 2: フロントエンド - リスト画面
- [x] テンプレートダウンロードセクションのUI実装（💡メッセージの下に配置）
- [x] ダウンロードボタンのAPI連携
- [x] リスト一覧に To/Cc/Bcc 件数表示
- [x] リスト詳細モーダルにバッジ表示（To=青, Cc=紫, Bcc=グレー）
- [x] 既存リストへのインポート機能追加

### Phase 3: フロントエンド - メール作成画面
- [x] リスト選択時の To/Cc/Bcc 自動振り分けロジック実装
- [x] 振り分け結果のプレビュー表示

### Phase 4: テスト・検証
- [x] バックエンドユニットテスト
- [x] インポート機能の結合テスト
- [x] E2Eテスト（リスト作成〜メール作成の一連フロー）

---

## 1. 概要

### 1.1 目的
メーリングリスト画面に2種類のExcelテンプレートダウンロード機能を追加し、To/Cc/Bcc振り分けに対応したインポート機能を実装する。

### 1.2 背景
現状、ユーザーはExcel/CSVファイルからメンバーをインポートできるが、To/Cc/Bccの振り分け情報を持たせることができない。メール作成時に手動で振り分ける必要があり、繰り返し同じ宛先構成でメールを送る場合に手間がかかる。

---

## 2. 機能要件

### 2.1 テンプレートダウンロード機能

#### 2.1.1 フォーマット1: シンプル版（全員To）
| 名前 | 所属 | 職位 | メアド | 社員番号 |
|------|------|------|--------|----------|
|      |      |      |        |          |

- インポート時、全メンバーを `recipient_type = 'to'` として登録

#### 2.1.2 フォーマット2: 振り分け版（To/Cc/Bcc対応）
| 宛先種別 | 名前 | 所属 | 職位 | メアド | 社員番号 |
|----------|------|------|------|--------|----------|
| To       |      |      |      |        |          |
| Cc       |      |      |      |        |          |
| Bcc      |      |      |      |        |          |

- 「宛先種別」列に `To`, `Cc`, `Bcc` のいずれかを記入
- 空欄または無効な値の場合は `To` として扱う

### 2.2 インポート機能拡張

#### 2.2.1 対応パターン
1. **新規リスト作成時**: ファイルアップロードでリストを新規作成
2. **既存リストへの追加**: 既存リストにメンバーを追加インポート

#### 2.2.2 バリデーションルール
| 項目 | ルール |
|------|--------|
| メールアドレス | **必須** - 空欄または無効な形式の行はスキップ |
| 宛先種別 | 任意 - 空欄または無効な値は `To` として扱う |
| 名前 | 任意 |
| 所属 | 任意 |
| 職位 | 任意 |
| 社員番号 | 任意 |

### 2.3 表示機能

#### 2.3.1 リスト一覧画面
各リストのサマリーに To/Cc/Bcc の件数を表示

```
テンプレートデータ
To: 2件 | Cc: 1件 | Bcc: 0件
```

#### 2.3.2 リスト詳細画面
メンバー一覧でバッジによりTo/Cc/Bccを区別

```
[To]  田中太郎  tanaka@example.com  営業部  部長
[To]  鈴木花子  suzuki@example.com  開発部  課長
[Cc]  山田次郎  yamada@example.com  総務部  係長
```

### 2.4 メール作成時の振り分け

メール作成画面でリストを選択した際、`recipient_type` に基づいて自動的に To/Cc/Bcc フィールドに振り分ける。

---

## 3. UI設計

### 3.1 メーリングリスト画面（/recipients）

```
┌─────────────────────────────────────────────────────────┐
│ ← ホーム    👥 メーリングリスト         [+ 新規作成]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   💡 リストを作っておくと入力の手間が省けます           │
│                                                         │
│   📥 テンプレートをダウンロード                         │
│   ┌───────────────────┐ ┌───────────────────┐          │
│   │ シンプル版        │ │ 振り分け版        │          │
│   │ (全員To)          │ │ (To/Cc/Bcc)       │          │
│   │      [DL]         │ │      [DL]         │          │
│   └───────────────────┘ └───────────────────┘          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 宛先リスト                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 👤 テンプレートデータ                               │ │
│ │    To: 2件 | Cc: 1件 | Bcc: 0件          🗑️  >    │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 👤 営業部連絡先                                     │ │
│ │    To: 5件 | Cc: 0件 | Bcc: 0件          🗑️  >    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 リスト詳細モーダル

```
┌─────────────────────────────────────────────────────────┐
│ テンプレートデータ                          [編集] [×]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 説明: 営業部向けの定例連絡用リスト                      │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ メンバーを追加                                      │ │
│ │ [ファイルをインポート] または [手動で追加]          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ メンバー一覧 (3件)                                      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [To]  田中太郎                                  [×] │ │
│ │       tanaka@example.com | 営業部 | 部長            │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ [To]  鈴木花子                                  [×] │ │
│ │       suzuki@example.com | 開発部 | 課長            │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ [Cc]  山田次郎                                  [×] │ │
│ │       yamada@example.com | 総務部 | 係長            │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.3 バッジデザイン

| 種別 | 背景色 | テキスト色 |
|------|--------|------------|
| To   | `#3B82F6` (blue-500) | white |
| Cc   | `#8B5CF6` (violet-500) | white |
| Bcc  | `#6B7280` (gray-500) | white |

---

## 4. データモデル変更

### 4.1 RecipientListMember テーブル

**追加フィールド:**

```python
recipient_type: str = Column(String(3), default='to', nullable=False)
# 値: 'to', 'cc', 'bcc'
```

**マイグレーション:**

```python
# alembic/versions/xxx_add_recipient_type_to_members.py

def upgrade():
    op.add_column('recipient_list_members',
        sa.Column('recipient_type', sa.String(3), nullable=False, server_default='to'))

def downgrade():
    op.drop_column('recipient_list_members', 'recipient_type')
```

### 4.2 Pydantic Schemas 更新

```python
# schemas/recipient.py

class RecipientMemberCreate(BaseModel):
    email: str
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    employee_id: Optional[str] = None
    note: Optional[str] = None
    recipient_type: Optional[str] = 'to'  # 追加

class RecipientMemberResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    employee_id: Optional[str] = None
    note: Optional[str] = None
    recipient_type: str = 'to'  # 追加

class RecipientListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    member_count: int
    to_count: int      # 追加
    cc_count: int      # 追加
    bcc_count: int     # 追加
    created_at: datetime
```

---

## 5. API設計

### 5.1 新規エンドポイント

#### テンプレートダウンロード

```
GET /recipients/templates/simple
```
- Response: Excel file (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
- ファイル名: `recipient_template_simple.xlsx`

```
GET /recipients/templates/with-types
```
- Response: Excel file
- ファイル名: `recipient_template_with_types.xlsx`

#### 既存リストへのインポート（追加）

```
POST /recipients/lists/{list_id}/import
```
- Request: multipart/form-data (file)
- Response:
```json
{
  "added_count": 5,
  "skipped_count": 2,
  "skipped_reasons": [
    {"row": 3, "reason": "メールアドレスが無効です"},
    {"row": 7, "reason": "既に登録されています"}
  ]
}
```

### 5.2 既存エンドポイント変更

#### POST /recipients/upload（既存インポート）

**変更点:**
- 「宛先種別」列の認識を追加
- `recipient_type` フィールドを含めてメンバーを作成

**カラムマッピング追加:**
```python
RECIPIENT_TYPE_COLUMNS = ["宛先種別", "種別", "type", "recipient_type", "to/cc/bcc"]
```

**recipient_type 正規化:**
```python
def normalize_recipient_type(value: str) -> str:
    if not value:
        return 'to'
    value = value.strip().lower()
    if value in ['to', 'cc', 'bcc']:
        return value
    return 'to'
```

#### GET /recipients/lists（リスト一覧）

**Response変更:**
- `to_count`, `cc_count`, `bcc_count` フィールドを追加

#### GET /recipients/lists/{list_id}（リスト詳細）

**Response変更:**
- 各メンバーに `recipient_type` フィールドを含める

---

## 6. 実装計画

実装チェックリストは本ドキュメント冒頭を参照。

**実装順序:**
1. Phase 1（バックエンド）→ Phase 2（リスト画面）→ Phase 3（メール作成画面）→ Phase 4（テスト）
2. 各Phase内のタスクは依存関係に注意して順次実装

---

## 7. 既存機能との互換性

### 7.1 既存リストの扱い
- 既存のメンバーは全て `recipient_type = 'to'` として扱う
- マイグレーションで `server_default='to'` を設定

### 7.2 シンプル版テンプレートでのインポート
- 「宛先種別」列がない場合、全メンバーを `to` として登録
- 既存のインポート動作と同様

### 7.3 メール作成画面
- `recipient_type` が全て `to` のリストは従来通りの動作
- 混在リストの場合のみ自動振り分けが発動

---

## 8. エラーハンドリング

| ケース | 対応 |
|--------|------|
| ファイル形式が非対応 | エラーメッセージ表示「対応形式: xlsx, xls, csv」 |
| メールアドレス列が見つからない | エラーメッセージ表示「メールアドレス列が見つかりません」 |
| 全行スキップ | エラーメッセージ表示「有効なデータがありません」 |
| 一部スキップ | 成功メッセージ + スキップ理由を表示 |
| 重複メールアドレス | スキップして続行（スキップ理由に記録） |

---

## 9. 将来の拡張案（スコープ外）

- リストのエクスポート機能（Excel/CSV出力）
- メンバーの並び順（position/order）管理
- リストの共有機能（他ユーザーとの共有）
- インポート時のプレビュー機能
- ドラッグ&ドロップでの To/Cc/Bcc 変更

---

## 10. 参考: 現在のデータ構造

### RecipientListMember（現状）
```python
- id: int
- list_id: int
- email: str (必須)
- name: str
- department: str
- position: str       # 役職
- employee_id: str    # 社員番号
- note: str
```

### RecipientListMember（変更後）
```python
- id: int
- list_id: int
- email: str (必須)
- name: str
- department: str
- position: str       # 役職
- employee_id: str    # 社員番号
- note: str
- recipient_type: str # 'to', 'cc', 'bcc' (デフォルト: 'to') ← 追加
```
