#!/bin/bash
# リカバリテストスクリプト

set -e

echo "======================================"
echo "バックアップ・リカバリテスト"
echo "======================================"
echo ""

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# テスト用ディレクトリ
TEST_DIR="recovery_test_$(date +%Y%m%d_%H%M%S)"

echo "テストディレクトリ: $TEST_DIR"
echo ""

# 1. バックアップファイルの確認
echo "1. バックアップファイル確認"
echo "============================"

if [ ! -d "backups" ]; then
    echo -e "${RED}✗${NC} backups/ ディレクトリが存在しません"
    exit 1
fi

BACKUP_COUNT=$(ls backups/*.tar.gz 2>/dev/null | wc -l)
echo "バックアップファイル数: $BACKUP_COUNT"

if [ "$BACKUP_COUNT" -eq 0 ]; then
    echo -e "${RED}✗${NC} バックアップファイルが存在しません"
    echo ""
    echo "バックアップを作成してください:"
    echo "  ./scripts/backup.sh $(date +%Y-%m-%d)"
    exit 1
fi

# 最新のバックアップを取得
LATEST_BACKUP=$(ls -t backups/*.tar.gz | head -1)
echo -e "${GREEN}✓${NC} 最新バックアップ: $LATEST_BACKUP"

BACKUP_SIZE=$(ls -lh "$LATEST_BACKUP" | awk '{print $5}')
echo "  サイズ: $BACKUP_SIZE"

echo ""

# 2. バックアップの展開テスト
echo "2. バックアップ展開テスト"
echo "=========================="

mkdir -p "$TEST_DIR"

echo "展開中..."
if tar -xzf "$LATEST_BACKUP" -C "$TEST_DIR"; then
    echo -e "${GREEN}✓${NC} バックアップファイルの展開に成功しました"
else
    echo -e "${RED}✗${NC} バックアップファイルの展開に失敗しました"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 展開されたディレクトリを探す
EXTRACTED_DIR=$(find "$TEST_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)

if [ -z "$EXTRACTED_DIR" ]; then
    echo -e "${RED}✗${NC} 展開されたディレクトリが見つかりません"
    exit 1
fi

echo "展開先: $EXTRACTED_DIR"
echo ""

# 3. ファイル整合性チェック
echo "3. ファイル整合性チェック"
echo "=========================="

# 3.1 宛先マスタ
echo "3.1 宛先マスタ (recipients.xlsx)"
if [ -f "$EXTRACTED_DIR/recipients.xlsx" ]; then
    echo -e "${GREEN}✓${NC} recipients.xlsx が存在します"

    FILE_SIZE=$(ls -lh "$EXTRACTED_DIR/recipients.xlsx" | awk '{print $5}')
    echo "  サイズ: $FILE_SIZE"

    # ファイルが開けるか確認（file コマンドで形式チェック）
    FILE_TYPE=$(file "$EXTRACTED_DIR/recipients.xlsx")
    if echo "$FILE_TYPE" | grep -q "Microsoft Excel\|Zip archive"; then
        echo -e "${GREEN}✓${NC} Excelファイル形式が正常です"
    else
        echo -e "${YELLOW}!${NC} 警告: ファイル形式が想定と異なります"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}✗${NC} recipients.xlsx が存在しません"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 3.2 送信結果
echo "3.2 送信結果 (output/)"
if [ -d "$EXTRACTED_DIR/output" ]; then
    echo -e "${GREEN}✓${NC} output/ ディレクトリが存在します"

    JSON_COUNT=$(find "$EXTRACTED_DIR/output" -name "*.json" | wc -l)
    echo "  JSONファイル数: $JSON_COUNT"

    # JSONファイルの検証
    for json_file in "$EXTRACTED_DIR/output"/*.json; do
        if [ -f "$json_file" ]; then
            if jq empty "$json_file" 2>/dev/null; then
                echo -e "${GREEN}✓${NC} $(basename "$json_file") は有効なJSONです"
            else
                echo -e "${RED}✗${NC} $(basename "$json_file") は無効なJSONです"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done
else
    echo -e "${YELLOW}!${NC} 警告: output/ ディレクトリが存在しません"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 3.3 送信対象Excel
echo "3.3 送信対象Excel (exports/)"
if [ -d "$EXTRACTED_DIR/exports" ]; then
    echo -e "${GREEN}✓${NC} exports/ ディレクトリが存在します"

    XLSX_COUNT=$(find "$EXTRACTED_DIR/exports" -name "*.xlsx" | wc -l)
    echo "  Excelファイル数: $XLSX_COUNT"

    if [ "$XLSX_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} 送信対象Excelが保存されています"
    else
        echo -e "${YELLOW}!${NC} 警告: Excelファイルが見つかりません"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}!${NC} 警告: exports/ ディレクトリが存在しません"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 3.4 環境設定
echo "3.4 環境設定 (env.txt)"
if [ -f "$EXTRACTED_DIR/env.txt" ]; then
    echo -e "${GREEN}✓${NC} env.txt が存在します"

    # 主要設定項目の確認
    if grep -q "SMTP_HOST" "$EXTRACTED_DIR/env.txt"; then
        echo -e "${GREEN}✓${NC} SMTP設定が記録されています"
    else
        echo -e "${YELLOW}!${NC} 警告: SMTP設定が見つかりません"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}!${NC} 警告: env.txt が存在しません"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 4. データ復元テスト
echo "4. データ復元テスト"
echo "===================="

echo "テスト用の復元ディレクトリを作成します..."
RESTORE_DIR="restore_test"
mkdir -p "$RESTORE_DIR/data"
mkdir -p "$RESTORE_DIR/output"
mkdir -p "$RESTORE_DIR/exports"

# 宛先マスタを復元
if [ -f "$EXTRACTED_DIR/recipients.xlsx" ]; then
    cp "$EXTRACTED_DIR/recipients.xlsx" "$RESTORE_DIR/data/recipients.xlsx"
    echo -e "${GREEN}✓${NC} 宛先マスタを復元しました"
fi

# 送信結果を復元
if [ -d "$EXTRACTED_DIR/output" ]; then
    cp -r "$EXTRACTED_DIR/output"/* "$RESTORE_DIR/output/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 送信結果を復元しました"
fi

# Excelを復元
if [ -d "$EXTRACTED_DIR/exports" ]; then
    cp -r "$EXTRACTED_DIR/exports"/* "$RESTORE_DIR/exports/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 送信対象Excelを復元しました"
fi

echo ""

# 5. 復元データの動作確認
echo "5. 復元データの動作確認"
echo "========================"

if [ -f "$RESTORE_DIR/data/recipients.xlsx" ]; then
    echo "復元した宛先マスタでplanコマンドをテスト..."

    # テスト用の日付を取得
    if [ -d "$RESTORE_DIR/exports" ]; then
        TEST_DATE=$(ls "$RESTORE_DIR/exports" | head -1)

        if [ -n "$TEST_DATE" ]; then
            echo "テスト日付: $TEST_DATE"

            # 一時的に data と exports を入れ替えてテスト
            mv data data.backup 2>/dev/null || true
            mv exports exports.backup 2>/dev/null || true

            cp -r "$RESTORE_DIR/data" data
            cp -r "$RESTORE_DIR/exports" exports

            if npx tsx src/cli/plan.ts --date "$TEST_DATE" > /dev/null 2>&1; then
                echo -e "${GREEN}✓${NC} 復元データでplanコマンドが正常に動作しました"
            else
                echo -e "${RED}✗${NC} planコマンドの実行に失敗しました"
                ERRORS=$((ERRORS + 1))
            fi

            # 元に戻す
            rm -rf data exports
            mv data.backup data 2>/dev/null || true
            mv exports.backup exports 2>/dev/null || true
        fi
    fi
fi

echo ""

# 6. クリーンアップ
echo "6. クリーンアップ"
echo "================="

echo "テストディレクトリを削除しますか？ (y/N)"
read -r -t 5 response || response="y"

if [[ "$response" =~ ^[Yy]$ ]]; then
    rm -rf "$TEST_DIR"
    rm -rf "$RESTORE_DIR"
    echo -e "${GREEN}✓${NC} テストディレクトリを削除しました"
else
    echo "テストディレクトリを保持します: $TEST_DIR, $RESTORE_DIR"
fi

echo ""

# 最終結果
echo "======================================"
echo "リカバリテスト結果"
echo "======================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ すべてのテストに合格しました${NC}"
    echo ""
    echo "バックアップからのリカバリは正常に動作します"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}警告: $WARNINGS 件の警告があります${NC}"
    echo ""
    echo "重大な問題はありませんが、警告を確認してください"
    exit 0
else
    echo -e "${RED}エラー: $ERRORS 件のエラーがあります${NC}"
    echo -e "${YELLOW}警告: $WARNINGS 件の警告があります${NC}"
    echo ""
    echo "バックアップに問題がある可能性があります"
    exit 1
fi
