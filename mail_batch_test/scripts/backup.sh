#!/bin/bash
# バックアップスクリプト

set -e

if [ -z "$1" ]; then
    echo "使用法: $0 <実行日>"
    echo "例: $0 2025-02-05"
    exit 1
fi

RUN_DATE=$1
DATE=$(date +%Y-%m-%d_%H%M%S)
BACKUP_DIR="backups/${DATE}_run${RUN_DATE}"

echo "======================================"
echo "バックアップ実行"
echo "======================================"
echo "実行日: $RUN_DATE"
echo "バックアップ先: $BACKUP_DIR"
echo ""

# バックアップディレクトリ作成
mkdir -p "${BACKUP_DIR}"

# 1. 宛先マスタ
if [ -f "data/recipients.xlsx" ]; then
    cp data/recipients.xlsx "${BACKUP_DIR}/recipients.xlsx"
    echo "✓ 宛先マスタをバックアップしました"
fi

# 2. 送信結果
if [ -d "output/${RUN_DATE}" ]; then
    cp -r "output/${RUN_DATE}" "${BACKUP_DIR}/output"
    echo "✓ 送信結果をバックアップしました"
fi

# 3. 送信対象Excel
if [ -d "exports/${RUN_DATE}" ]; then
    cp -r "exports/${RUN_DATE}" "${BACKUP_DIR}/exports"
    echo "✓ 送信対象Excelをバックアップしました"
fi

# 4. .env (パスワードをマスク)
if [ -f ".env" ]; then
    grep -v "SMTP_PASS" .env > "${BACKUP_DIR}/env.txt" || true
    echo "✓ 環境設定をバックアップしました"
fi

# 5. ログ
if [ -f "logs/app.log" ]; then
    cp logs/app.log "${BACKUP_DIR}/app.log"
    echo "✓ ログをバックアップしました"
fi

# 6. 圧縮
echo ""
echo "圧縮中..."
cd backups
tar -czf "${DATE}_run${RUN_DATE}.tar.gz" "${DATE}_run${RUN_DATE}"
rm -rf "${DATE}_run${RUN_DATE}"
cd ..

echo ""
echo "======================================"
echo "✓ バックアップ完了"
echo "======================================"
echo "ファイル: backups/${DATE}_run${RUN_DATE}.tar.gz"

# バックアップサイズを表示
SIZE=$(ls -lh "backups/${DATE}_run${RUN_DATE}.tar.gz" | awk '{print $5}')
echo "サイズ: $SIZE"
echo ""
