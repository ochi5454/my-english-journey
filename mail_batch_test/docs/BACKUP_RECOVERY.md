# バックアップ・リカバリ手順書

メール一括送信システムのデータバックアップとリカバリの手順をまとめた文書です。

## 目次

1. [バックアップ対象](#バックアップ対象)
2. [バックアップ手順](#バックアップ手順)
3. [リカバリ手順](#リカバリ手順)
4. [定期バックアップの設定](#定期バックアップの設定)
5. [災害復旧計画](#災害復旧計画)

---

## バックアップ対象

### 必須バックアップ項目

| 項目 | パス | 重要度 | 保管期間 | 理由 |
|------|------|--------|----------|------|
| 宛先マスタ | `data/recipients.xlsx` | ★★★ | 永久 | 送信先情報の唯一のマスタ |
| 送信結果ログ | `output/{date}/send_result.json` | ★★★ | 1年 | 監査証跡、再送に必要 |
| 送信対象Excel | `exports/{date}/*.xlsx` | ★★☆ | 3ヶ月 | 再送時に必要 |
| 環境設定 | `.env` | ★★☆ | 永久 | SMTP設定等（パスワード除く） |
| アプリケーションログ | `logs/app.log` | ★☆☆ | 1ヶ月 | トラブルシューティング用 |

### オプションバックアップ項目

| 項目 | パス | 保管期間 | 理由 |
|------|------|----------|------|
| 配送計画 | `output/{date}/plan.json` | 1ヶ月 | デバッグ用 |
| プレビュー結果 | `output/{date}/preview.json` | 1ヶ月 | デバッグ用 |
| 再送結果 | `output/{date}/resend_result.json` | 1年 | 監査証跡 |

---

## バックアップ手順

### 手動バックアップ（推奨：実行後すぐ）

送信完了後、すぐに以下を実行してください：

```bash
#!/bin/bash
# バックアップスクリプト例

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="backups/${DATE}"
RUN_DATE="2025-02-05"  # 実行日を指定

# バックアップディレクトリ作成
mkdir -p "${BACKUP_DIR}"

# 1. 宛先マスタをバックアップ
cp data/recipients.xlsx "${BACKUP_DIR}/recipients_${DATE}.xlsx"

# 2. 送信結果をバックアップ
cp -r "output/${RUN_DATE}" "${BACKUP_DIR}/output_${RUN_DATE}"

# 3. 送信対象Excelをバックアップ
cp -r "exports/${RUN_DATE}" "${BACKUP_DIR}/exports_${RUN_DATE}"

# 4. .envをバックアップ（パスワードをマスク）
grep -v "SMTP_PASS" .env > "${BACKUP_DIR}/env_${DATE}.txt"

# 5. ログをバックアップ
cp logs/app.log "${BACKUP_DIR}/app_${DATE}.log"

# 6. バックアップを圧縮
cd backups
tar -czf "${DATE}.tar.gz" "${DATE}"
cd ..

echo "✓ Backup completed: backups/${DATE}.tar.gz"
```

### バックアップスクリプトの作成と実行

```bash
# スクリプトを作成
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="backups/${DATE}"
RUN_DATE=$1

if [ -z "$RUN_DATE" ]; then
  echo "Usage: $0 <run-date>"
  echo "Example: $0 2025-02-05"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
cp data/recipients.xlsx "${BACKUP_DIR}/recipients_${DATE}.xlsx"
cp -r "output/${RUN_DATE}" "${BACKUP_DIR}/output_${RUN_DATE}"
cp -r "exports/${RUN_DATE}" "${BACKUP_DIR}/exports_${RUN_DATE}"
grep -v "SMTP_PASS" .env > "${BACKUP_DIR}/env_${DATE}.txt"
cp logs/app.log "${BACKUP_DIR}/app_${DATE}.log"

cd backups
tar -czf "${DATE}.tar.gz" "${DATE}"
rm -rf "${DATE}"
cd ..

echo "✓ Backup completed: backups/${DATE}.tar.gz"
EOF

# 実行権限を付与
chmod +x scripts/backup.sh

# 実行
./scripts/backup.sh 2025-02-05
```

### リモートバックアップ

重要なバックアップは、別のサーバーやクラウドストレージにコピーしてください：

```bash
# 例1: 社内ファイルサーバーへコピー
scp backups/2025-02-05.tar.gz user@fileserver:/backups/mail_batch/

# 例2: AWS S3へアップロード
aws s3 cp backups/2025-02-05.tar.gz s3://company-backups/mail_batch/

# 例3: rsyncで同期
rsync -avz backups/ user@backup-server:/backups/mail_batch/
```

---

## リカバリ手順

### シナリオ1: 送信失敗からの復旧

**状況:** 送信途中でシステムが停止し、一部のメールが送信されていない

**手順:**
```bash
# 1. 送信結果を確認
cat output/2025-02-05/send_result.json | jq '.[] | select(.status == "failed")'

# 2. 失敗件数を確認
cat output/2025-02-05/send_result.json | jq '[.[] | select(.status == "failed")] | length'

# 3. resend コマンドで再送
npm run resend -- --date 2025-02-05

# 4. 再送結果を確認
cat output/2025-02-05/resend_result.json
```

### シナリオ2: 宛先マスタの誤削除

**状況:** `data/recipients.xlsx` を誤って削除または上書きしてしまった

**手順:**
```bash
# 1. バックアップから復元
cd mail_batch_test

# 2. 最新のバックアップを探す
ls -lt backups/*.tar.gz | head -n 1

# 3. バックアップを展開
tar -xzf backups/2025-02-02.tar.gz -C backups/

# 4. 宛先マスタを復元
cp backups/2025-02-02/recipients_2025-02-02.xlsx data/recipients.xlsx

# 5. 復元を確認
head -n 10 data/recipients.xlsx
```

### シナリオ3: 送信済みデータの再確認

**状況:** 「いつ・誰に・何を送ったか」を確認する必要がある

**手順:**
```bash
# 1. バックアップディレクトリを確認
ls -la backups/

# 2. 該当日付のバックアップを展開
tar -xzf backups/2025-02-05.tar.gz -C backups/

# 3. 送信結果を確認
cat backups/2025-02-05/output_2025-02-05/send_result.json | jq

# 4. 成功リストを抽出
cat backups/2025-02-05/output_2025-02-05/send_result.json | \
  jq '.[] | select(.status == "sent") | {email, task}'

# 5. 添付ファイルを確認
ls -la backups/2025-02-05/exports_2025-02-05/
```

### シナリオ4: 完全なシステム再構築

**状況:** サーバー障害やディスク故障で全データが失われた

**手順:**
```bash
# 1. システムを再セットアップ
git clone <repository-url>
cd mail_batch_test
npm install

# 2. 最新のバックアップを取得
scp user@backup-server:/backups/mail_batch/latest.tar.gz .

# 3. バックアップを展開
tar -xzf latest.tar.gz

# 4. データを復元
mkdir -p data exports output logs
cp <backup-dir>/recipients_*.xlsx data/recipients.xlsx
cp -r <backup-dir>/exports_*/ exports/
cp -r <backup-dir>/output_*/ output/

# 5. .env を再作成（パスワードは手動で設定）
cp .env.example .env
# .env を編集してSMTP設定を入力

# 6. 動作確認
npm run plan -- --date 2025-02-05
```

---

## 定期バックアップの設定

### cron による自動バックアップ（Linux/macOS）

```bash
# crontab を編集
crontab -e

# 毎日深夜2時に実行
0 2 * * * cd /path/to/mail_batch_test && ./scripts/backup.sh $(date -d yesterday +\%Y-\%m-\%d) >> logs/backup.log 2>&1

# 毎週日曜日に古いバックアップを削除（90日以前）
0 3 * * 0 find /path/to/mail_batch_test/backups -name "*.tar.gz" -mtime +90 -delete
```

### タスクスケジューラによる自動バックアップ（Windows）

1. タスクスケジューラを起動
2. 「基本タスクの作成」を選択
3. トリガー: 毎日、2:00 AM
4. 操作: プログラムの起動
   - プログラム: `C:\Windows\System32\cmd.exe`
   - 引数: `/c cd /d C:\path\to\mail_batch_test && scripts\backup.bat`

### バックアップ監視

バックアップが正常に実行されているか定期的に確認：

```bash
# 最新のバックアップを確認
ls -lth backups/*.tar.gz | head -n 5

# バックアップログを確認
tail -n 50 logs/backup.log

# バックアップサイズを確認（異常に小さい場合は失敗の可能性）
du -sh backups/*.tar.gz
```

---

## 災害復旧計画（DRP）

### 目標復旧時間（RTO）

| シナリオ | 目標復旧時間 | 優先度 |
|----------|-------------|--------|
| 宛先マスタのみ消失 | 30分 | 高 |
| 送信結果ログのみ消失 | 1時間 | 中 |
| システム全体の再構築 | 4時間 | 高 |

### 目標復旧時点（RPO）

| データ種別 | 許容データ損失 |
|-----------|---------------|
| 宛先マスタ | 0（即時バックアップ） |
| 送信結果 | 0（送信直後にバックアップ） |
| 送信対象Excel | 当日分のみ（再生成可能） |

### 緊急連絡先

災害復旧時の連絡先リストを作成してください：

```
システム管理者: [名前] [メール] [電話]
バックアップ責任者: [名前] [メール] [電話]
インフラ担当: [名前] [メール] [電話]
```

### 復旧優先順位

1. **最優先**: 宛先マスタの復元
2. **高優先**: 送信結果ログの復元（監査証跡）
3. **中優先**: .env 設定ファイルの復元
4. **低優先**: 送信対象Excelの復元（再生成可能な場合）

---

## バックアップ確認チェックリスト

定期的に以下を確認してください（推奨：月次）：

- [ ] バックアップファイルが存在する
- [ ] バックアップファイルが破損していない（展開テスト）
- [ ] リモートバックアップが正常に同期されている
- [ ] バックアップから実際にデータを復元できる（リハーサル）
- [ ] 古いバックアップが削除されている（ストレージ圧迫防止）
- [ ] バックアップログにエラーがない

---

## ベストプラクティス

### 3-2-1 ルール

- **3** つのコピー: オリジナル + バックアップ2つ
- **2** つの異なる媒体: ローカルディスク + ネットワークストレージ
- **1** つはオフサイト: クラウドまたは遠隔地

### 送信実行後の必須作業

```bash
# 送信完了後、必ず以下を実行
npm run send -- --date 2025-02-05

# ↓ 送信完了したら即座に実行 ↓
./scripts/backup.sh 2025-02-05

# リモートにもコピー
scp backups/$(date +%Y-%m-%d).tar.gz user@backup-server:/backups/
```

### バックアップのテスト

少なくとも **四半期に1回** はリカバリテストを実施してください：

```bash
# テスト手順
1. テスト用ディレクトリに復元
2. 宛先マスタが開けるか確認
3. 送信結果JSONが読めるか確認
4. plan コマンドが実行できるか確認
```

---

## トラブルシューティング

### バックアップが失敗する

```bash
# ディスク容量を確認
df -h

# 権限を確認
ls -la backups/

# ディレクトリを手動で作成
mkdir -p backups
chmod 755 backups
```

### バックアップファイルが大きすぎる

```bash
# 古いログを削除
find logs -name "*.log" -mtime +30 -delete

# 古い送信対象Excelを削除（バックアップ済みのもの）
find exports -type d -mtime +90 -exec rm -rf {} \;
```

### 復元したファイルが開けない

```bash
# ファイルが破損していないか確認
file data/recipients.xlsx

# 別のバックアップから試す
tar -xzf backups/2025-02-01.tar.gz -C backups/
cp backups/2025-02-01/recipients_*.xlsx data/recipients.xlsx
```

---

## 関連ドキュメント

- [README.md](../README.md) - 基本的な使用方法
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - エラー対処マニュアル
- [mail_batch_implementation_design.md](../../docs/mail_batch_implementation_design.md) - システム設計書

---

**最終更新日:** 2025-02-02
