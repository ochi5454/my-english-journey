# メール一括送信システム

既存システムから独立した汎用メール送信システムです。Excel ファイルベースでリクエストを受け取り、宛先マスタと突合して個別メールを送信します。

## 特徴

- **独立性**: 既存システムに依存せず、ファイルベースで連携
- **汎用性**: 任意のシステムから `exports/{date}/` にファイル配置するだけで利用可能
- **安全性**: DRY_RUNモード、レート制御、リトライ機能完備
- **監査性**: 全送信ログをJSON形式で保存、再送可能

## 必要環境

- Node.js 20 以上
- npm

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env` ファイルを編集してSMTP設定を行います：

```bash
# SMTP設定
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@company.com
SMTP_PASS=your-password
FROM_ADDRESS=no-reply@company.com

# 送信設定
DRY_RUN=true                # false にすると実際に送信されます
RATE_LIMIT_PER_MIN=15       # 1分あたりの送信数上限

# ディレクトリ設定
OUTPUT_DIR=output
```

### 3. ディレクトリ構造

```
mail_batch_test/
├─ data/
│  └─ recipients.xlsx        # 宛先マスタ
├─ exports/                  # 送信対象配置場所
│  └─ YYYY-MM-DD/           # 日付ごとのディレクトリ
│     ├─ file1.xlsx
│     └─ file2.xlsx
├─ output/                   # 実行結果出力
│  └─ YYYY-MM-DD/
│     ├─ plan.json
│     ├─ preview.json
│     ├─ send_result.json
│     └─ resend_result.json
└─ logs/                     # アプリケーションログ
   └─ app.log
```

## 宛先マスタ（recipients.xlsx）の形式

Excel ファイルに以下の列を含める必要があります：

| 列名 | 必須 | 説明 |
|------|------|------|
| 所属名称6 | ✓ | 部署・組織名（完全一致キー） |
| メールアドレス | ✓ | 送信先メールアドレス |
| 氏名 | - | 担当者名（ログ用） |
| 備考 | - | メモ欄 |

例：
```
所属名称6    | メールアドレス           | 氏名      | 備考
営業本部     | sales1@example.com      | 山田太郎  | 部長
営業本部     | sales2@example.com      | 佐藤花子  | 課長
開発部       | dev1@example.com        | 鈴木一郎  |
```

## 送信対象Excel（exports/{date}/）の形式

- **必須列**: `所属名称6` （または `所属名称６`, `所属6`）
- **重要**: 1ファイル内の所属名称6は単一値のみ（混在禁止）
- **拡張子**: `.xlsx`

例：
```
所属名称6 | 氏名   | 実所定外時間
営業本部  | 社員A  | 10.5
営業本部  | 社員B  | 15.0
```

## コマンド使用方法

### 1. plan コマンド - 配送リスト生成

送信対象のExcelファイルを読み込み、宛先マスタと突合して配送リストを生成します。

```bash
npm run plan -- --date 2025-02-05
```

**オプション:**
- `--date`: 実行日（YYYY-MM-DD形式、必須）
- `--recipients`: 宛先マスタのパス（デフォルト: `data/recipients.xlsx`）
- `--exports`: 送信対象ディレクトリ（デフォルト: `exports`）
- `--output`: 出力ディレクトリ（デフォルト: `.env` の `OUTPUT_DIR`）

**出力:** `output/{date}/plan.json`

### 2. preview コマンド - プレビュー表示

配送リストの概要を確認します。

```bash
npm run preview -- --date 2025-02-05
```

**出力:** `output/{date}/preview.json`

サマリー情報:
- 総ファイル数
- 総送信数
- 所属ごとの送信数
- 警告件数

### 3. send コマンド - メール送信

実際にメールを送信します。

```bash
# DRY_RUN モードでテスト（デフォルト）
npm run send -- --date 2025-02-05

# 実際に送信する場合
npm run send -- --date 2025-02-05 --dry-run=false
```

**オプション:**
- `--date`: 実行日（YYYY-MM-DD形式、必須）
- `--dry-run`: DRY_RUNモードを上書き（true/false）
- `--rate`: レート制限を上書き（数値、1分あたりの送信数）
- `--recipients`, `--exports`, `--output`: plan と同様

**出力:** `output/{date}/send_result.json`

### 4. resend コマンド - 失敗分再送

送信に失敗したメールのみを再送します。

```bash
npm run resend -- --date 2025-02-05
```

**前提条件:** `send_result.json` に失敗レコード（status: "failed"）が存在すること

**出力:** `output/{date}/resend_result.json`

## 運用フロー例

### 定常運用（毎月 5日 / 15日 / 25日）

```bash
# 1. 対象Excelが配置されているか確認
ls exports/2025-02-05/

# 2. 宛先マスタが最新か確認
open data/recipients.xlsx

# 3. DRY_RUNで動作確認
npm run plan -- --date 2025-02-05
npm run preview -- --date 2025-02-05
npm run send -- --date 2025-02-05 --dry-run=true

# 4. 問題なければ本番実行
npm run send -- --date 2025-02-05 --dry-run=false

# 5. 結果確認
cat output/2025-02-05/send_result.json

# 6. 失敗があれば再送
npm run resend -- --date 2025-02-05 --dry-run=false
```

## メール内容

### 件名

```
{YYYY}年{MM}月{DD}日現在_実所定外時間
```

例: `2025年02月05日現在_実所定外時間`

### 本文

```
お疲れ様です。
{所属名称6}の皆様、

{YYYY}年{MM}月{DD}日現在の実所定外時間を送付いたします。（対象：{所属名称6}）
添付ファイルをご確認ください。
```

### 添付ファイル

送信対象のExcelファイルが添付されます。

## レート制御

デフォルトで **15通/分** のレート制御が有効です。これはExchange Onlineの制限を考慮した設定です。

`.env` の `RATE_LIMIT_PER_MIN` で変更可能です。

## テストデータの生成

テスト用のデータファイルを生成するスクリプトを用意しています：

```bash
npx tsx scripts/create-test-data.ts
```

以下が生成されます：
- `data/recipients.xlsx`: テスト用宛先マスタ（6件）
- `exports/2025-02-05/*.xlsx`: テスト用送信対象ファイル（3ファイル）

## TypeScript ビルド確認

```bash
npm run build
```

このコマンドは型チェックのみを行います（実際のビルドは不要、tsxで直接実行）。

## トラブルシューティング

### エラー: "Recipients file not found"

→ `data/recipients.xlsx` が存在するか確認してください。

### エラー: "Missing required headers in recipients.xlsx"

→ 宛先マスタに「所属名称6」と「メールアドレス」列があるか確認してください。

### エラー: "Multiple group keys found in file"

→ 送信対象Excelファイル内に複数の所属が混在しています。1ファイル1所属になるよう修正してください。

### エラー: "No recipients found for group"

→ 送信対象Excelの所属名称6が宛先マスタに登録されていません。宛先マスタを更新してください。

### 送信されない

→ `.env` の `DRY_RUN=true` になっていないか確認してください。実際に送信するには `false` に設定するか、`--dry-run=false` オプションを使用してください。

## セキュリティ

- `.env` ファイルは **絶対にGitにコミットしないでください**（`.gitignore` に含まれています）
- SMTPパスワードは平文で保存されます。本番環境では適切なアクセス制御を行ってください

## ライセンス

Private

## 変更履歴

| 日付 | 版 | 変更内容 |
|------|-----|----------|
| 2025-02-02 | 1.0 | 初版作成 |
