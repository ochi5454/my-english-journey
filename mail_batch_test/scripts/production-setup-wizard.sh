#!/bin/bash
# 本番運用開始セットアップウィザード

set -e

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear

echo -e "${CYAN}======================================"
echo "メール一括送信システム"
echo "本番運用開始セットアップウィザード"
echo -e "======================================${NC}"
echo ""

echo "このウィザードでは、本番運用に必要な設定を順番に行います。"
echo ""

# ステップ1: .env 設定
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ステップ1: SMTP設定${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}! .env ファイルが存在しません${NC}"
    echo "  .env.example からコピーします..."
    cp .env.example .env
    echo -e "${GREEN}✓${NC} .env ファイルを作成しました"
    echo ""
fi

echo "現在の .env ファイルの設定を確認します..."
echo ""

# 現在の設定を表示
if grep -q "^SMTP_HOST=" .env; then
    CURRENT_HOST=$(grep "^SMTP_HOST=" .env | cut -d= -f2)
    echo "  SMTP_HOST: $CURRENT_HOST"
fi

echo ""
echo -e "${YELLOW}SMTP設定を更新しますか？ (y/N)${NC}"
read -r UPDATE_SMTP

if [[ "$UPDATE_SMTP" =~ ^[Yy]$ ]]; then
    echo ""
    echo "SMTP設定を入力してください:"
    echo ""

    # SMTP_HOST
    echo -n "SMTP_HOST (例: smtp.office365.com): "
    read -r SMTP_HOST
    if [ -n "$SMTP_HOST" ]; then
        sed -i.bak "s|^SMTP_HOST=.*|SMTP_HOST=$SMTP_HOST|" .env
    fi

    # SMTP_PORT
    echo -n "SMTP_PORT (デフォルト: 587): "
    read -r SMTP_PORT
    if [ -n "$SMTP_PORT" ]; then
        sed -i.bak "s|^SMTP_PORT=.*|SMTP_PORT=$SMTP_PORT|" .env
    fi

    # SMTP_USER
    echo -n "SMTP_USER (メールアドレス): "
    read -r SMTP_USER
    if [ -n "$SMTP_USER" ]; then
        sed -i.bak "s|^SMTP_USER=.*|SMTP_USER=$SMTP_USER|" .env
    fi

    # SMTP_PASS
    echo -n "SMTP_PASS (パスワード): "
    read -rs SMTP_PASS
    echo ""
    if [ -n "$SMTP_PASS" ]; then
        sed -i.bak "s|^SMTP_PASS=.*|SMTP_PASS=$SMTP_PASS|" .env
    fi

    # FROM_ADDRESS
    echo -n "FROM_ADDRESS (送信元アドレス): "
    read -r FROM_ADDRESS
    if [ -n "$FROM_ADDRESS" ]; then
        sed -i.bak "s|^FROM_ADDRESS=.*|FROM_ADDRESS=$FROM_ADDRESS|" .env
    fi

    # DRY_RUN
    echo ""
    echo -e "${RED}重要: DRY_RUNモードを無効化しますか？${NC}"
    echo "  (false にすると実際にメールが送信されます)"
    echo -n "DRY_RUN=false にする (y/N): "
    read -r DISABLE_DRY_RUN

    if [[ "$DISABLE_DRY_RUN" =~ ^[Yy]$ ]]; then
        sed -i.bak "s|^DRY_RUN=.*|DRY_RUN=false|" .env
        echo -e "${YELLOW}! DRY_RUN=false に設定しました（実際に送信されます）${NC}"
    else
        sed -i.bak "s|^DRY_RUN=.*|DRY_RUN=true|" .env
        echo -e "${GREEN}✓${NC} DRY_RUN=true のまま（テストモード）"
    fi

    # バックアップファイルを削除
    rm -f .env.bak

    echo ""
    echo -e "${GREEN}✓${NC} SMTP設定を更新しました"
else
    echo -e "${GREEN}✓${NC} SMTP設定をスキップしました"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ステップ2: 宛先マスタの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "data/recipients.xlsx" ]; then
    FILE_SIZE=$(ls -lh data/recipients.xlsx | awk '{print $5}')
    echo -e "${GREEN}✓${NC} data/recipients.xlsx が存在します (サイズ: $FILE_SIZE)"

    # テストデータかどうか確認
    if strings data/recipients.xlsx 2>/dev/null | grep -q "example\.com"; then
        echo -e "${YELLOW}! 警告: テストデータ（example.com）が含まれています${NC}"
        echo ""
        echo "本番データに置き換えてください:"
        echo "  1. Excelで data/recipients.xlsx を開く"
        echo "  2. テストデータを削除"
        echo "  3. 実際の宛先データを入力"
        echo "  4. 保存して閉じる"
        echo ""
        echo -e "${YELLOW}宛先マスタを更新しましたか？ (y/N)${NC}"
        read -r UPDATED_RECIPIENTS

        if [[ ! "$UPDATED_RECIPIENTS" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}! 後で必ず更新してください${NC}"
        fi
    else
        echo -e "${GREEN}✓${NC} 本番データが設定されているようです"
    fi
else
    echo -e "${RED}✗${NC} data/recipients.xlsx が存在しません"
    echo ""
    echo "テストデータを生成しますか？ (y/N)"
    read -r CREATE_TEST

    if [[ "$CREATE_TEST" =~ ^[Yy]$ ]]; then
        echo "テストデータを生成中..."
        npx tsx scripts/create-test-data.ts
        echo -e "${GREEN}✓${NC} テストデータを生成しました"
        echo -e "${YELLOW}! 本番運用前に実データに置き換えてください${NC}"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ステップ3: 送信対象Excelの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -n "送信実行日を入力してください (YYYY-MM-DD): "
read -r RUN_DATE

if [ -z "$RUN_DATE" ]; then
    RUN_DATE=$(date +%Y-%m-%d)
    echo "デフォルトの日付を使用: $RUN_DATE"
fi

EXPORTS_DIR="exports/$RUN_DATE"

if [ ! -d "$EXPORTS_DIR" ]; then
    echo -e "${YELLOW}! $EXPORTS_DIR が存在しません${NC}"
    echo ""
    echo "ディレクトリを作成しますか？ (y/N)"
    read -r CREATE_DIR

    if [[ "$CREATE_DIR" =~ ^[Yy]$ ]]; then
        mkdir -p "$EXPORTS_DIR"
        echo -e "${GREEN}✓${NC} $EXPORTS_DIR を作成しました"

        echo ""
        echo "テストデータを生成しますか？ (y/N)"
        read -r CREATE_TEST_EXCEL

        if [[ "$CREATE_TEST_EXCEL" =~ ^[Yy]$ ]]; then
            echo "テストデータを生成中..."
            npx tsx scripts/create-test-data.ts
            echo -e "${GREEN}✓${NC} テストデータを生成しました"
        else
            echo ""
            echo "送信対象のExcelファイルを $EXPORTS_DIR に配置してください"
            echo ""
            echo "配置後、Enterキーを押してください..."
            read -r
        fi
    fi
else
    XLSX_COUNT=$(find "$EXPORTS_DIR" -name "*.xlsx" -type f | wc -l | tr -d ' ')
    if [ "$XLSX_COUNT" -eq 0 ]; then
        echo -e "${RED}✗${NC} $EXPORTS_DIR に .xlsx ファイルがありません"
        echo ""
        echo "Excelファイルを配置してください"
        echo "配置後、Enterキーを押してください..."
        read -r
    else
        echo -e "${GREEN}✓${NC} $EXPORTS_DIR に $XLSX_COUNT 個のExcelファイルがあります"

        # ファイル一覧を表示
        echo ""
        echo "ファイル一覧:"
        find "$EXPORTS_DIR" -name "*.xlsx" -type f -exec basename {} \;
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ステップ4: 送信前確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "送信前の最終チェックを実行します..."
echo ""

if ./scripts/check-production-ready.sh "$RUN_DATE"; then
    echo ""
    echo -e "${GREEN}✓${NC} すべての準備が整いました"
else
    echo ""
    echo -e "${RED}! チェックに失敗しました${NC}"
    echo "エラーを修正してから再度実行してください"
    echo ""
    echo "このまま続行しますか？ (y/N)"
    read -r FORCE_CONTINUE

    if [[ ! "$FORCE_CONTINUE" =~ ^[Yy]$ ]]; then
        echo "セットアップを中断しました"
        exit 1
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ステップ5: 送信実行${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# DRY_RUN確認
if grep -q "^DRY_RUN=true" .env; then
    echo -e "${YELLOW}現在 DRY_RUN=true です（実際には送信されません）${NC}"
    echo ""
    echo "DRY_RUNモードで送信テストを実行しますか？ (Y/n)"
    read -r RUN_DRY

    if [[ ! "$RUN_DRY" =~ ^[Nn]$ ]]; then
        echo ""
        echo "DRY_RUNモードで送信を実行中..."
        echo ""

        npx tsx src/cli/plan.ts --date "$RUN_DATE"
        npx tsx src/cli/preview.ts --date "$RUN_DATE"
        npx tsx src/cli/send.ts --date "$RUN_DATE" --dry-run=true

        echo ""
        echo -e "${GREEN}✓${NC} DRY_RUN送信が完了しました"
        echo ""
        echo "結果を確認:"
        cat "output/$RUN_DATE/send_result.json" | jq '.[] | "\(.status): \(.email)"' | sort | uniq -c || cat "output/$RUN_DATE/send_result.json"
        echo ""

        echo -e "${YELLOW}本番送信を実行する場合は、.env で DRY_RUN=false に設定してください${NC}"
    fi
else
    echo -e "${RED}警告: DRY_RUN=false です（実際にメールが送信されます）${NC}"
    echo ""
    echo -e "${RED}本当に送信を実行しますか？ (yes と入力してください)${NC}"
    read -r CONFIRM_SEND

    if [ "$CONFIRM_SEND" = "yes" ]; then
        echo ""
        echo "本番送信を実行中..."
        echo ""

        npx tsx src/cli/plan.ts --date "$RUN_DATE"
        npx tsx src/cli/preview.ts --date "$RUN_DATE"
        npx tsx src/cli/send.ts --date "$RUN_DATE"

        echo ""
        echo -e "${GREEN}✓${NC} 送信が完了しました"
        echo ""

        # 結果を表示
        echo "送信結果:"
        if command -v jq &> /dev/null; then
            cat "output/$RUN_DATE/send_result.json" | jq -r '.[] | "\(.status): \(.email)"' | sort | uniq -c
            echo ""
            echo "詳細:"
            cat "output/$RUN_DATE/send_result.json" | jq '{total: length, sent: [.[] | select(.status == "sent")] | length, failed: [.[] | select(.status == "failed")] | length, skipped: [.[] | select(.status == "skipped")] | length}'
        else
            cat "output/$RUN_DATE/send_result.json"
        fi

        # 失敗があれば表示
        FAILED_COUNT=$(cat "output/$RUN_DATE/send_result.json" | jq '[.[] | select(.status == "failed")] | length' 2>/dev/null || echo "0")

        if [ "$FAILED_COUNT" -gt 0 ]; then
            echo ""
            echo -e "${YELLOW}! $FAILED_COUNT 件の送信に失敗しました${NC}"
            echo ""
            echo "失敗メールを再送しますか？ (y/N)"
            read -r RESEND

            if [[ "$RESEND" =~ ^[Yy]$ ]]; then
                echo ""
                echo "再送中..."
                npx tsx src/cli/resend.ts --date "$RUN_DATE"
                echo -e "${GREEN}✓${NC} 再送が完了しました"
            fi
        fi
    else
        echo "送信をキャンセルしました"
    fi
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}ステップ6: バックアップ取得${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "バックアップを取得しますか？ (Y/n)"
read -r DO_BACKUP

if [[ ! "$DO_BACKUP" =~ ^[Nn]$ ]]; then
    echo ""
    echo "バックアップを作成中..."
    ./scripts/backup.sh "$RUN_DATE"
    echo ""
    echo -e "${GREEN}✓${NC} バックアップが完了しました"
fi

echo ""
echo -e "${GREEN}======================================"
echo "セットアップ完了"
echo -e "======================================${NC}"
echo ""

echo "次のステップ:"
echo ""
echo "1. 送信結果を確認"
echo "   cat output/$RUN_DATE/send_result.json"
echo ""
echo "2. バックアップを確認"
echo "   ls -lh backups/"
echo ""
echo "3. 定期バックアップの設定（オプション）"
echo "   ./scripts/setup-cron.sh"
echo ""
echo "4. 運用カレンダーを確認"
echo "   cat docs/OPERATIONS_CALENDAR.md"
echo ""

echo -e "${GREEN}お疲れ様でした！${NC}"
