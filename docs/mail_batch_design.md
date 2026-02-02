# 作業チェックリスト（ステータス付）
- [ ] `npm install` 済み／依存関係を解決（初回のみ） — ステータス: 未完了（2026-02-02 計3回トライ、ネットワーク到達せずタイムアウト）
- [ ] `.env` を `.env.example` から作成し、SMTP 認証・`DRY_RUN`・`RATE_LIMIT_PER_MIN` を設定 — ステータス: 未実施
- [ ] `exports/{run_date}/` に対象 Excel が揃っている（0バイト・所属混在なし） — ステータス: 未実施
- [ ] `data/recipients.xlsx` を最新宛先で更新済み（必須列・重複確認） — ステータス: 未実施
- [ ] `plan` → `preview` を実行し出力を目視確認（警告が許容範囲か判断） — ステータス: 未実施
- [ ] `send` を実行し、`output/{run_date}/send_result.json` を保存 — ステータス: 未実施
- [ ] 失敗分があれば `resend` を実行し、`resend_result.json` を保存 — ステータス: 未実施

## 実装との差分（2026-02-02時点）
- CLI オプション名: `--output-dir` ではなく `--output`。`log-level` オプション未実装。
- `plan`/`preview` コマンドに `--dry-run` は実装していない（送信系のみ `--dry-run` 上書き可）。
- 出力先ディレクトリは `.env` の `OUTPUT_DIR`（デフォルト `output`）配下に `/{runDate}` を作成して保存。
- メール送信は SMTP のみ実装。Graph 送信は未実装（呼び出すと例外）。
- 送信ログは JSON のみ（CSV 出力は未実装）。

# メール送付バッチ機能 設計書（手動実行版）

## 1. 目的
既存システムが生成した `exports/{run_date}/` 配下の Excel を読み取り、  
各ファイルの **所属名称6** ごとに宛先を引き当て、**1宛先=1通の個別メール**で送付する。  
運用開始フェーズは CLI 手動実行を前提とし、月次 3回（5/15/25）送付を想定する。

## 2. スコープと前提
- 実行形態: CLI 手動実行（自動スケジューラなし）
- 環境: Exchange Online (Microsoft 365) を送信基盤とする。初版は SMTP（Nodemailer）実装、将来 Graph 置換可能な構造。
- スケジュール: 5日 / 15日 / 25日。休日なら前営業日に繰り上げ。CLI引数で `--date` 指定。
- レート制御: 初期 5〜25 通/分（.env で調整可能にする）。
- 出力保存: 宛先別送信ログ・失敗リスト（JSON/CSV）を `output/` 相当へ保存。

## 3. ディレクトリ構成
```
mail_batch_test/
├─ src/                # アプリ本体
├─ data/
│  └─ recipients.xlsx  # 宛先マスタ
├─ exports/
│  └─ YYYY-MM-DD/      # 送付対象 Excel 配置場所
├─ output/             # plan/preview/send の結果出力（想定）
├─ .env                # 認証・送信設定
└─ package.json
```

## 4. 入力仕様
### 4.1 宛先マスタ（data/recipients.xlsx）
- 必須列: `所属名称6`, `メールアドレス`
- 形式: 1枚目シート、1行目ヘッダ行。空行は無視。
- 重複: 同一「所属名称6 × メールアドレス」は重複除去。所属が同一でも複数メール可。

### 4.2 送付対象 Excel（exports/{run_date}/）
- 1ファイル = 所属名称6 が1種類のみ。0件または混在はエラー。
- 0バイトファイルはエラー。
- ファイル名規約は限定しないが、拡張子は `.xlsx` を前提。

## 5. メール送信仕様
- 件名テンプレ: `YYYY年MM月DD日現在_実所定外時間`
- 本文テンプレ:
  ```
  お疲れ様です。
  {group_key}の皆様、

  {run_date(YYYY年MM月DD日)}現在の実所定外時間を送付いたします。（対象：{group_key}）
  添付ファイルをご確認ください。
  ```
- 添付: 対応する所属の Excel を 1通あたり1添付。ファイル容量上限は Exchange 既定に従う。
- 個別送信理由: 宛先が 1000件超となるため BCC ではなく 1宛先=1通。
- レート制御: `.env` で `RATE_LIMIT_PER_MIN` を可変化。送信間隔はトークンバケット想定。
- 送信モード: `DRY_RUN=true` でメール送信せずログのみ出力。

## 6. CLI インターフェース（案）
```
# 配送リスト作成
npm run plan -- --date 2025-05-15 --dry-run

# プレビュー（宛先・添付確認用）
npm run preview -- --date 2025-05-15

# 送信
npm run send -- --date 2025-05-15 --rate 15 --dry-run=false

# 失敗分再送
npm run resend -- --date 2025-05-15
```
- 主な引数: `--date`, `--dry-run`, `--rate`, `--output-dir`, `--log-level`.
- 出力: `plan.json`, `preview.json`, `send_result.json` 等を `output/{date}/` 配下へ。

## 7. 処理フロー
1. **plan**: `exports/{run_date}/` を走査し、各ファイルから所属名称6 を読み取り宛先を引き当てた配送リストを生成。
2. **preview**: plan 結果を人が確認しやすい形に整形（宛先数・添付ファイル名・警告一覧）。
3. **send**: DRY_RUN 判定後、レート制御付きで個別送信。成功/失敗をログ化。
4. **resend**: 失敗リストを入力に再送。成功分は結果を更新し、失敗は残す。

## 8. エラー処理
### 即停止（fatal）
- 宛先マスタ未存在または必須列欠落
- 送付対象 Excel のヘッダ不一致・0バイト・所属混在
- 認証情報不足（`.env` 未設定）

### 警告（continue）
- 宛先なし所属（メール未送信として記録）
- 添付なし所属（送信スキップとして記録）

### ログ
- レベル: info/warn/error。CLI出力 + ファイル出力。
- 失敗記録: 宛先・理由・リトライ回数を保持。

## 9. セキュリティ・設定
- 認証情報は `.env` 管理（例: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `RATE_LIMIT_PER_MIN`, `DRY_RUN`）。
- `.env.example` をリポジトリに置き、秘密値はコミットしない。
- 添付ファイルはローカルファイルのみ扱い、外部 URL 取得は行わない。

## 10. 運用手順（定常）
1. `exports/{run_date}/` に対象 Excel を配置。
2. `data/recipients.xlsx` を最新化（必須列・重複確認）。
3. `.env` を設定し、初回は必ず `DRY_RUN=true`。
4. `plan` → `preview` を実行し内容を確認。
5. `send` を実行。結果ログと失敗リストを `output/` に保存。
6. 必要なら `resend` で失敗分のみ再送し、最終結果を記録。

## 11. テスト計画（初回）
1. テスト用 `recipients.xlsx` を作成（少数宛先）。
2. テストデータを `exports/{run_date}/` に配置。
3. `plan` → `preview` で配送リストと警告を確認。
4. `send --dry-run=false` を少数レートで実送し、実メールを確認。
5. わざと失敗する宛先を混ぜ、`resend` の動作を確認。
