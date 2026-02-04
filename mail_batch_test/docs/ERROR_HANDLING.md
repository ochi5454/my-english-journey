# エラー対処マニュアル

メール一括送信システムで発生する可能性のあるエラーと、その対処方法をまとめたマニュアルです。

## 目次

1. [起動時エラー](#起動時エラー)
2. [設定関連エラー](#設定関連エラー)
3. [ファイル読み込みエラー](#ファイル読み込みエラー)
4. [メール送信エラー](#メール送信エラー)
5. [ネットワークエラー](#ネットワークエラー)
6. [その他のエラー](#その他のエラー)

---

## 起動時エラー

### エラー: `command not found: npm`

**原因:** Node.js/npm がインストールされていない、またはPATHが通っていない

**対処法:**
```bash
# macOSの場合
PATH=/usr/local/bin:$PATH npm run plan -- --date 2025-02-05

# または、Node.jsを再インストール
brew install node
```

### エラー: `Cannot find module`

**原因:** 依存パッケージがインストールされていない

**対処法:**
```bash
cd mail_batch_test
npm install
```

---

## 設定関連エラー

### エラー: `Invalid configuration: SMTP_HOST is required`

**原因:** `.env` ファイルに必要な設定が記載されていない

**対処法:**
1. `.env` ファイルが存在するか確認
   ```bash
   ls -la .env
   ```

2. `.env.example` からコピー
   ```bash
   cp .env.example .env
   ```

3. 必須項目を設定
   ```env
   SMTP_HOST=smtp.office365.com
   SMTP_PORT=587
   SMTP_USER=your-email@company.com
   SMTP_PASS=your-password
   FROM_ADDRESS=no-reply@company.com
   ```

### エラー: `SMTP authentication failed`

**原因:** SMTPの認証情報が間違っている

**対処法:**
1. `.env` ファイルの `SMTP_USER` と `SMTP_PASS` を確認
2. Exchange Onlineの場合、アプリパスワードが必要な場合があります
3. 多要素認証(MFA)が有効な場合は、アプリパスワードを生成して使用

**アプリパスワードの生成方法:**
- Microsoft 365: https://account.microsoft.com/ → セキュリティ → アプリパスワード

---

## ファイル読み込みエラー

### エラー: `Recipients file not found: data/recipients.xlsx`

**原因:** 宛先マスタファイルが存在しない

**対処法:**
1. ファイルの存在を確認
   ```bash
   ls -la data/recipients.xlsx
   ```

2. テストデータを生成
   ```bash
   npx tsx scripts/create-test-data.ts
   ```

3. 本番データを配置
   - 正しい形式のExcelファイルを `data/recipients.xlsx` として配置

### エラー: `Missing required headers in recipients.xlsx: 所属名称6, メールアドレス`

**原因:** 宛先マスタに必須列が存在しない

**対処法:**
1. Excelファイルを開いて、1行目に以下の列があるか確認
   - `所属名称6`
   - `メールアドレス`

2. 列名が完全に一致していることを確認（スペースや全角/半角に注意）

### エラー: `Export directory not found: exports/2025-02-05`

**原因:** 指定した日付のディレクトリが存在しない

**対処法:**
1. ディレクトリを作成
   ```bash
   mkdir -p exports/2025-02-05
   ```

2. 送信対象のExcelファイルを配置

3. テストデータを生成
   ```bash
   npx tsx scripts/create-test-data.ts
   ```

### エラー: `No .xlsx files found in exports/2025-02-05`

**原因:** 指定ディレクトリに.xlsxファイルが存在しない

**対処法:**
1. ディレクトリ内を確認
   ```bash
   ls -la exports/2025-02-05/
   ```

2. Excelファイルが `.xlsx` 形式であることを確認（`.xls` は非対応）

3. 必要なファイルを配置

### エラー: `File is empty: 営業本部.xlsx`

**原因:** Excelファイルのサイズが0バイト

**対処法:**
1. ファイルが正しく保存されているか確認
2. 破損していないExcelファイルで置き換える
3. 元のシステムからのエクスポート処理を再実行

### エラー: `Multiple group keys found in file: 営業本部.xlsx`

**原因:** 1つのExcelファイル内に複数の所属名称6が混在している

**対処法:**
1. Excelファイルを開いて「所属名称6」列を確認
2. 1ファイルには1つの所属のみを含めるように分割
3. 元のシステムのエクスポート設定を見直す

### エラー: `Group key not found in file: sample.xlsx`

**原因:** Excelファイルに「所属名称6」列が存在しない、または値が空

**対処法:**
1. Excelファイルを開いて確認
2. ヘッダー行に「所属名称6」列があるか確認
3. データ行に値が入っているか確認

---

## メール送信エラー

### エラー: `SMTP timeout after 30s`

**原因:** SMTPサーバーへの接続がタイムアウト

**対処法:**
1. ネットワーク接続を確認
2. ファイアウォール設定を確認（ポート587が開いているか）
3. SMTPサーバーの稼働状況を確認
4. `resend` コマンドで再送を試みる
   ```bash
   npm run resend -- --date 2025-02-05
   ```

### エラー: `Mailbox unavailable`

**原因:** 宛先メールアドレスが存在しない、または無効

**対処法:**
1. `send_result.json` で失敗したメールアドレスを確認
2. 宛先マスタ (`data/recipients.xlsx`) のメールアドレスを修正
3. 該当レコードを削除して再実行

### エラー: `Message size exceeds fixed maximum message size`

**原因:** 添付ファイルが大きすぎる（Exchange Onlineは通常25MB制限）

**対処法:**
1. Excelファイルのサイズを確認
   ```bash
   ls -lh exports/2025-02-05/
   ```

2. ファイルサイズを削減
   - 不要なシートを削除
   - 画像やオブジェクトを削除
   - データを圧縮

3. ファイルを分割して送信

### エラー: `Rate limit exceeded`

**原因:** 送信速度制限に違反（通常はレート制御で防止）

**対処法:**
1. `.env` の `RATE_LIMIT_PER_MIN` を下げる
   ```env
   RATE_LIMIT_PER_MIN=10
   ```

2. しばらく待ってから再実行

3. Exchange Onlineの制限を確認
   - 1分あたり30通
   - 1日あたり10,000通

---

## ネットワークエラー

### エラー: `ECONNREFUSED`

**原因:** SMTPサーバーに接続できない

**対処法:**
1. ネットワーク接続を確認
   ```bash
   ping smtp.office365.com
   ```

2. `.env` の `SMTP_HOST` と `SMTP_PORT` を確認

3. プロキシ設定が必要な場合は環境変数を設定
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

### エラー: `ETIMEDOUT`

**原因:** ネットワーク接続がタイムアウト

**対処法:**
1. インターネット接続を確認
2. VPN接続が必要な場合は接続
3. ファイアウォールでSMTPポート(587)がブロックされていないか確認

---

## その他のエラー

### エラー: `No recipients found for group "総務部"`

**警告レベル:** 送信はスキップされますが処理は継続

**原因:** 送信対象Excelの所属が宛先マスタに登録されていない

**対処法:**
1. 宛先マスタに該当部署を追加
2. または、該当Excelファイルを削除
3. `plan` コマンドで警告を事前確認
   ```bash
   npm run plan -- --date 2025-02-05
   ```

### エラー: TypeScript型エラー

**原因:** ビルド時の型チェックエラー

**対処法:**
```bash
npm run build
```

エラーメッセージを確認して該当ファイルを修正

### エラー: `Permission denied`

**原因:** ファイルやディレクトリへのアクセス権限がない

**対処法:**
```bash
# ディレクトリの権限を確認
ls -la

# 必要に応じて権限を変更（慎重に）
chmod 755 mail_batch_test
chmod 644 .env
```

---

## ログの確認方法

### アプリケーションログ

```bash
# リアルタイムで確認
tail -f logs/app.log

# 最新100行を確認
tail -n 100 logs/app.log

# エラーのみ抽出
grep -i error logs/app.log
```

### 送信結果ログ

```bash
# 結果をJSON形式で確認
cat output/2025-02-05/send_result.json | jq

# 失敗のみ抽出
cat output/2025-02-05/send_result.json | jq '.[] | select(.status == "failed")'

# 成功数をカウント
cat output/2025-02-05/send_result.json | jq '[.[] | select(.status == "sent")] | length'
```

---

## トラブルシューティングフロー

### 送信が全く実行されない場合

```
1. DRY_RUNモードになっていないか確認
   → .env の DRY_RUN=false を確認

2. SMTP設定が正しいか確認
   → .env のSMTP_*, FROM_ADDRESSを確認

3. ネットワーク接続を確認
   → ping smtp.office365.com

4. 認証情報を確認
   → SMTP_USER, SMTP_PASSを確認
```

### 一部のメールだけ送信失敗する場合

```
1. send_result.json で失敗メールを確認
   → cat output/2025-02-05/send_result.json | jq '.[] | select(.status == "failed")'

2. エラーメッセージを確認
   → reason フィールドを確認

3. メールアドレスを確認
   → 宛先マスタで該当アドレスを確認

4. resend で再送
   → npm run resend -- --date 2025-02-05
```

### パフォーマンスが遅い場合

```
1. レート制限を確認
   → .env の RATE_LIMIT_PER_MIN を確認（デフォルト15）

2. ネットワーク速度を確認
   → ping時間を確認

3. ログで処理時間を確認
   → logs/app.log で elapsedMs を確認
```

---

## サポート連絡先

問題が解決しない場合は、以下の情報をまとめて担当者に連絡してください：

- エラーメッセージの全文
- 実行したコマンド
- `send_result.json` の内容（個人情報は除く）
- `logs/app.log` の関連部分
- 環境情報（OS、Node.jsバージョン）

---

## 参考資料

- [README.md](../README.md) - 基本的な使用方法
- [mail_batch_implementation_design.md](../../docs/mail_batch_implementation_design.md) - システム設計書
- [Nodemailer Documentation](https://nodemailer.com/) - SMTPライブラリのドキュメント
- [Microsoft 365 SMTP設定](https://learn.microsoft.com/ja-jp/exchange/mail-flow-best-practices/how-to-set-up-a-multifunction-device-or-application-to-send-email-using-microsoft-365-or-office-365)
