# 実装TODO（進捗チェック）
- [ ] `.env.example` を作成し、SMTP/Graph・レート制御・DRY_RUN のキーを定義
- [ ] `src/config` に設定読み込みとバリデーションを実装（dotenv + zod）
- [ ] `src/io/recipients.ts` で `data/recipients.xlsx` を読み込み、重複除去・必須列検証
- [ ] `src/io/exports.ts` で `exports/{run_date}/` の Excel をパースし、所属名称6 単一性を検証
- [ ] `src/core/planner.ts` で plan 結果（配送リスト）生成ロジックを実装
- [ ] `src/core/mailer.ts` で送信（SMTP→Graph差し替え可能なポート）とレート制御を実装
- [ ] `src/cli/*.ts` に `plan/preview/send/resend` コマンドを実装し、出力を `output/{date}/` へ保存
- [ ] エラー/警告ロギング・失敗リスト保存を実装（JSON/CSV）
- [ ] E2E想定のサンプルデータで `plan→preview→send` の通しテストを実行

# メール送付バッチ 実装設計（手動CLI版）

本書は `docs/mail_batch_design.md` の要件を踏まえ、実装者向けに具体的な構成とインターフェースを定義する。

## 1. 技術スタック
- Node.js 20 系（ts-node/tsx 実行）
- TypeScript
- パッケージ: `xlsx`, `nodemailer`, `zod`, `dotenv`, `pino`, `yargs` or `commander`, `bottleneck`（レート制御）
- テスト: `vitest`（最低限のユニットと軽い結合）

## 2. ディレクトリ/主要ファイル
```
mail_batch_test/
├─ src/
│  ├─ config/
│  │  └─ index.ts         # .env 読み込み & zod バリデーション
│  ├─ io/
│  │  ├─ recipients.ts    # 宛先マスタ読み込み
│  │  └─ exports.ts       # 送付対象 Excel 読み込み
│  ├─ core/
│  │  ├─ planner.ts       # plan 生成
│  │  ├─ previewer.ts     # preview 用フォーマット
│  │  ├─ mailer.ts        # SMTP/Graph 送信ポート + レート制御
│  │  └─ resend.ts        # 失敗分再送
│  ├─ types.ts            # 共通型定義（Recipient, AttachmentTask, SendResult 等）
│  ├─ logger.ts           # pino ラッパ
│  └─ utils/date.ts       # 営業日前倒し計算・フォーマット
├─ scripts/               # 将来の運用スクリプト置き場
├─ output/                # コマンド出力（git ignore）
└─ docs/                  # 本書ほか
```

## 3. 環境変数・設定
`.env.example` に最低限以下を定義：
```
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
FROM_ADDRESS=
RATE_LIMIT_PER_MIN=15
DRY_RUN=true
OUTPUT_DIR=output
```
Graph 化を想定する場合は `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` を追加し、`mailer.ts` にポート切替フラグを用意する（例: `MAIL_TRANSPORT=SMTP|GRAPH`）。

`config/index.ts` で dotenv 読込 → zod で型付き設定オブジェクトを生成。

## 4. データモデル
- `Recipient`: `{ groupKey: string; email: string; }`
- `AttachmentTask`: `{ groupKey: string; filePath: string; recipients: Recipient[] }`
- `Plan`: `{ date: string; tasks: AttachmentTask[]; warnings: string[] }`
- `SendResult`: `{ email: string; status: 'sent'|'skipped'|'failed'; reason?: string; task: AttachmentTask }`

## 5. 入力処理
### recipients.ts
- `loadRecipients(path)`:
  - 必須列 `所属名称6`, `メールアドレス` を確認（不足は fatal）。
  - 空行除外・メール正規性を軽くチェック。
  - `groupKey` × `email` で重複除去。

### exports.ts
- `loadExports(dir)`:
  - ディレクトリ内の `.xlsx` を列挙。
  - 各ファイルで `groupKey` を判定（ヘッダ名 or 固定セル想定、必要ならオプションで列/セル指定）。
  - 0バイト・所属混在を fatal とし、空データは fatal。

## 6. コアロジック
### planner.ts
- 入力: `runDate`, `recipients`, `exportFiles`
- 出力: `Plan`
- 振る舞い: export ファイルの `groupKey` ごとに宛先を紐付け。宛先なしは warning とし、task から除外。

### previewer.ts
- Plan を人間可読な JSON/CSV に整形。件数サマリと警告を含む。

### mailer.ts
- 送信ポート: 初期は Nodemailer SMTP。`MAIL_TRANSPORT` で差し替え可能な interface を定義。
- レート制御: `bottleneck` で `RATE_LIMIT_PER_MIN` を適用。
- DRY_RUN: true ならメール送信をスキップし、ログだけ記録。
- 送信ログ: 成功/失敗を `SendResult[]` に蓄積。

### resend.ts
- `send_result.json` の失敗エントリを入力に再送。再送後は新しい結果を保存。

## 7. CLI インターフェース
`yargs` または `commander` で以下コマンドを提供（`src/cli/*.ts` に分割）。
```
plan    --date 2025-05-15 --output output/2025-05-15
preview --date 2025-05-15 --output output/2025-05-15
send    --date 2025-05-15 --rate 15 --dry-run=false --output output/2025-05-15
resend  --date 2025-05-15 --output output/2025-05-15
```
- 共通オプション: `--date`, `--dry-run`, `--rate`, `--output`, `--log-level`.
- 出力ファイル例: `plan.json`, `preview.json`, `send_result.json`, `resend_result.json`.

## 8. エラー/ログ方針
- fatal: マスタ欠落、必須列欠落、所属混在、認証不足。
- warning: 宛先なし所属、添付なし所属。警告件数を preview に表示。
- ログ: `pino` で console + ファイル（必要なら）。CLI 成功時に出力パスを表示。

## 9. テスト
- `recipients.spec.ts`: 必須列検証・重複除去。
- `exports.spec.ts`: 所属混在/0バイト検知。
- `planner.spec.ts`: 宛先なしの場合の warning 処理。
- `mailer.spec.ts`: DRY_RUN で送信しないこと、レート制御の呼び出し回数。
- 軽い結合テスト: サンプルExcel/マスタで plan→preview→send(DRY_RUN)。

## 10. 運用メモ
- 初回は `DRY_RUN=true` で実行し、実メールは確認済み宛先で限定。
- 送信ログと失敗リストは日付ディレクトリで保管し、再送時に流用。
- 将来 Graph へ移行する場合、`mailer.ts` の transport 実装を差し替えるだけで CLI は不変。
