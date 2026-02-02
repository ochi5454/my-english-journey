#!/bin/bash
# 本番送信前の最終チェックスクリプト

set -e

echo "======================================"
echo "本番送信前チェックリスト"
echo "======================================"
echo ""

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# 引数チェック
if [ -z "$1" ]; then
    echo "使用法: $0 <実行日>"
    echo "例: $0 2025-02-05"
    exit 1
fi

RUN_DATE=$1

echo "実行日: $RUN_DATE"
echo ""

# 1. .env チェック
echo "1. SMTP設定確認"
echo "==============="

if [ ! -f ".env" ]; then
    echo -e "${RED}✗${NC} .env ファイルが存在しません"
    ERRORS=$((ERRORS + 1))
else
    # SMTP_HOST
    if grep -q "^SMTP_HOST=smtp\.example\.com" .env; then
        echo -e "${RED}✗${NC} SMTP_HOST がデフォルト値のままです"
        ERRORS=$((ERRORS + 1))
    elif grep -q "^SMTP_HOST=" .env; then
        SMTP_HOST=$(grep "^SMTP_HOST=" .env | cut -d= -f2)
        echo -e "${GREEN}✓${NC} SMTP_HOST: $SMTP_HOST"
    else
        echo -e "${RED}✗${NC} SMTP_HOST が設定されていません"
        ERRORS=$((ERRORS + 1))
    fi

    # SMTP_USER
    if grep -q "^SMTP_USER=$" .env || grep -q "^SMTP_USER=\s*$" .env; then
        echo -e "${RED}✗${NC} SMTP_USER が空です"
        ERRORS=$((ERRORS + 1))
    elif grep -q "^SMTP_USER=" .env; then
        echo -e "${GREEN}✓${NC} SMTP_USER が設定されています"
    fi

    # FROM_ADDRESS
    if grep -q "^FROM_ADDRESS=" .env; then
        FROM_ADDRESS=$(grep "^FROM_ADDRESS=" .env | cut -d= -f2)
        echo -e "${GREEN}✓${NC} FROM_ADDRESS: $FROM_ADDRESS"
    else
        echo -e "${RED}✗${NC} FROM_ADDRESS が設定されていません"
        ERRORS=$((ERRORS + 1))
    fi

    # DRY_RUN
    if grep -q "^DRY_RUN=true" .env; then
        echo -e "${YELLOW}!${NC} 注意: DRY_RUN=true です（実際には送信されません）"
        WARNINGS=$((WARNINGS + 1))
    elif grep -q "^DRY_RUN=false" .env; then
        echo -e "${RED}!${NC} 警告: DRY_RUN=false です（実際にメールが送信されます）"
    fi
fi

echo ""

# 2. 宛先マスタチェック
echo "2. 宛先マスタ確認"
echo "================"

if [ ! -f "data/recipients.xlsx" ]; then
    echo -e "${RED}✗${NC} data/recipients.xlsx が存在しません"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✓${NC} data/recipients.xlsx が存在します"

    # テストデータチェック
    if strings data/recipients.xlsx 2>/dev/null | grep -q "example\.com"; then
        echo -e "${YELLOW}!${NC} 警告: テストデータ（example.com）が含まれています"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""

# 3. 送信対象Excelチェック
echo "3. 送信対象Excel確認"
echo "==================="

EXPORTS_DIR="exports/${RUN_DATE}"

if [ ! -d "$EXPORTS_DIR" ]; then
    echo -e "${RED}✗${NC} $EXPORTS_DIR が存在しません"
    ERRORS=$((ERRORS + 1))
else
    XLSX_COUNT=$(find "$EXPORTS_DIR" -name "*.xlsx" -type f | wc -l)

    if [ "$XLSX_COUNT" -eq 0 ]; then
        echo -e "${RED}✗${NC} $EXPORTS_DIR に .xlsx ファイルがありません"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✓${NC} $EXPORTS_DIR に $XLSX_COUNT 個のExcelファイルがあります"

        # ファイルサイズチェック（25MB以上は警告）
        while IFS= read -r file; do
            SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
            SIZE_MB=$((SIZE / 1024 / 1024))

            if [ "$SIZE_MB" -gt 25 ]; then
                echo -e "${RED}!${NC} 警告: $(basename "$file") が 25MB を超えています ($SIZE_MB MB)"
                WARNINGS=$((WARNINGS + 1))
            fi
        done < <(find "$EXPORTS_DIR" -name "*.xlsx" -type f)
    fi
fi

echo ""

# 4. plan実行チェック
echo "4. 配送計画確認"
echo "=============="

if npm run plan -- --date "$RUN_DATE" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} plan コマンドが正常に実行できました"

    # plan.json確認
    PLAN_FILE="output/${RUN_DATE}/plan.json"
    if [ -f "$PLAN_FILE" ]; then
        TASK_COUNT=$(cat "$PLAN_FILE" | grep -o '"tasks":\[' | wc -l)
        WARNING_COUNT=$(cat "$PLAN_FILE" | grep -o '"warnings":\[' | wc -l)

        echo -e "${GREEN}✓${NC} 配送計画が生成されました: $PLAN_FILE"

        # 警告確認
        if [ "$WARNING_COUNT" -gt 0 ]; then
            echo -e "${YELLOW}!${NC} 警告が含まれています。output/${RUN_DATE}/plan.json を確認してください"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
else
    echo -e "${RED}✗${NC} plan コマンドの実行に失敗しました"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 5. バックアップディレクトリチェック
echo "5. バックアップ確認"
echo "=================="

if [ -d "backups" ]; then
    echo -e "${GREEN}✓${NC} backups/ ディレクトリが存在します"
else
    echo -e "${YELLOW}!${NC} backups/ ディレクトリが存在しません（作成を推奨）"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -f "scripts/backup.sh" ]; then
    echo -e "${GREEN}✓${NC} scripts/backup.sh が存在します"
else
    echo -e "${YELLOW}!${NC} scripts/backup.sh が存在しません"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 最終判定
echo "======================================"
echo "チェック結果"
echo "======================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ すべてのチェックに合格しました${NC}"
    echo ""
    echo "本番送信を実行できます："
    echo "  npm run send -- --date $RUN_DATE"
    echo ""
    echo "送信後は必ずバックアップを取得してください："
    echo "  ./scripts/backup.sh $RUN_DATE"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}警告: $WARNINGS 件の警告があります${NC}"
    echo ""
    echo "警告を確認の上、問題なければ送信を実行できます"
    exit 0
else
    echo -e "${RED}エラー: $ERRORS 件のエラーがあります${NC}"
    echo -e "${YELLOW}警告: $WARNINGS 件の警告があります${NC}"
    echo ""
    echo "エラーを修正してから再実行してください"
    exit 1
fi
