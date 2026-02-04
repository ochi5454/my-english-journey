#!/bin/bash
# 最終完全確認スクリプト

set -e

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
PASS=0

echo -e "${CYAN}======================================"
echo "完全最終確認"
echo -e "======================================${NC}"
echo ""

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        PASS=$((PASS + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $1 が存在しません"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        PASS=$((PASS + 1))
        return 0
    else
        echo -e "${YELLOW}!${NC} $1/ が存在しません"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

# 1. コア実装
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}1. コア実装の確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "1.1 CLIコマンド:"
check_file "src/cli/plan.ts"
check_file "src/cli/preview.ts"
check_file "src/cli/send.ts"
check_file "src/cli/resend.ts"
check_file "src/cli/helpers.ts"

echo ""
echo "1.2 コアロジック:"
check_file "src/core/planner.ts"
check_file "src/core/previewer.ts"
check_file "src/core/mailer.ts"
check_file "src/core/resend.ts"

echo ""
echo "1.3 I/O処理:"
check_file "src/io/recipients.ts"
check_file "src/io/exports.ts"

echo ""
echo "1.4 ユーティリティ:"
check_file "src/utils/date.ts"
check_file "src/utils/fs.ts"

echo ""
echo "1.5 設定・型定義:"
check_file "src/config/index.ts"
check_file "src/types.ts"
check_file "src/logger.ts"

echo ""

# 2. テスト
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}2. テストの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "2.1 単体テスト:"
check_file "src/io/recipients.test.ts"
check_file "src/io/exports.test.ts"
check_file "src/core/planner.test.ts"

echo ""
echo "2.2 テスト設定:"
check_file "vitest.config.ts"

echo ""
echo "2.3 テスト実行:"
if npm test > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} npm test が成功"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗${NC} npm test が失敗"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 3. スクリプト
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}3. スクリプトの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "3.1 基本スクリプト:"
check_file "scripts/create-test-data.ts"
check_file "scripts/backup.sh"

echo ""
echo "3.2 本番運用スクリプト:"
check_file "scripts/setup-production.sh"
check_file "scripts/check-production-ready.sh"
check_file "scripts/production-setup-wizard.sh"

echo ""
echo "3.3 定期運用スクリプト:"
check_file "scripts/setup-cron.sh"
check_file "scripts/recovery-test.sh"

echo ""
echo "3.4 実行権限確認:"
for script in scripts/*.sh; do
    if [ -x "$script" ]; then
        echo -e "${GREEN}✓${NC} $(basename $script) は実行可能"
        PASS=$((PASS + 1))
    else
        echo -e "${YELLOW}!${NC} $(basename $script) に実行権限がありません"
        WARNINGS=$((WARNINGS + 1))
    fi
done

echo ""

# 4. ドキュメント
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}4. ドキュメントの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

check_file "README.md"
check_file "docs/ERROR_HANDLING.md"
check_file "docs/BACKUP_RECOVERY.md"
check_file "docs/OPERATIONS_CALENDAR.md"

echo ""

# 5. 設定ファイル
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}5. 設定ファイルの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

check_file "package.json"
check_file "tsconfig.json"
check_file ".env.example"
check_file ".gitignore"

if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env (本番用設定ファイル)"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}!${NC} .env が未作成（本番運用時に必要）"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 6. ディレクトリ構造
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}6. ディレクトリ構造の確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

check_dir "src"
check_dir "src/cli"
check_dir "src/core"
check_dir "src/io"
check_dir "src/utils"
check_dir "scripts"
check_dir "docs"
check_dir "data"
check_dir "exports"
check_dir "output"
check_dir "logs"

echo ""

# 7. package.json スクリプト確認
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}7. npm スクリプトの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

REQUIRED_SCRIPTS=("plan" "preview" "send" "resend" "test" "test:watch" "test:coverage" "build")

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if grep -q "\"$script\":" package.json; then
        echo -e "${GREEN}✓${NC} npm run $script"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} npm run $script が定義されていません"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# 8. TypeScriptビルド確認
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}8. TypeScriptビルドの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} TypeScriptビルドが成功"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗${NC} TypeScriptビルドが失敗"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 9. テストデータ確認
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}9. テストデータの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "data/recipients.xlsx" ]; then
    echo -e "${GREEN}✓${NC} data/recipients.xlsx が存在"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}!${NC} data/recipients.xlsx が未作成"
    WARNINGS=$((WARNINGS + 1))
fi

if [ -d "exports/2025-02-05" ]; then
    XLSX_COUNT=$(find exports/2025-02-05 -name "*.xlsx" -type f | wc -l)
    echo -e "${GREEN}✓${NC} exports/2025-02-05/ に $XLSX_COUNT 個のExcelファイル"
    PASS=$((PASS + 1))
else
    echo -e "${YELLOW}!${NC} exports/2025-02-05/ が未作成"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 10. 依存パッケージ確認
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}10. 依存パッケージの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

REQUIRED_DEPS=("bottleneck" "dotenv" "nodemailer" "pino" "xlsx" "yargs" "zod")

for dep in "${REQUIRED_DEPS[@]}"; do
    if grep -q "\"$dep\":" package.json; then
        echo -e "${GREEN}✓${NC} $dep"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} $dep がインストールされていません"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# 11. 型定義パッケージ確認
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}11. 型定義パッケージの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

REQUIRED_TYPES=("@types/node" "@types/nodemailer" "@types/yargs")

for type_pkg in "${REQUIRED_TYPES[@]}"; do
    if grep -q "\"$type_pkg\":" package.json; then
        echo -e "${GREEN}✓${NC} $type_pkg"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} $type_pkg がインストールされていません"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# 12. 機能テスト
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}12. 機能テストの確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# テストデータが存在する場合のみ機能テスト
if [ -f "data/recipients.xlsx" ] && [ -d "exports/2025-02-05" ]; then
    echo "12.1 plan コマンド:"
    if npx tsx src/cli/plan.ts --date 2025-02-05 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} plan コマンドが動作"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} plan コマンドが失敗"
        ERRORS=$((ERRORS + 1))
    fi

    echo ""
    echo "12.2 preview コマンド:"
    if npx tsx src/cli/preview.ts --date 2025-02-05 > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} preview コマンドが動作"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} preview コマンドが失敗"
        ERRORS=$((ERRORS + 1))
    fi

    echo ""
    echo "12.3 出力ファイル確認:"
    if [ -f "output/2025-02-05/plan.json" ]; then
        echo -e "${GREEN}✓${NC} plan.json が生成されている"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} plan.json が生成されていない"
        ERRORS=$((ERRORS + 1))
    fi

    if [ -f "output/2025-02-05/preview.json" ]; then
        echo -e "${GREEN}✓${NC} preview.json が生成されている"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} preview.json が生成されていない"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}!${NC} テストデータが不足しているため機能テストをスキップ"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 13. 設計書チェックリスト確認
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}13. 設計書の確認${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

DESIGN_DOC="../../docs/mail_batch_implementation_design.md"

if [ -f "$DESIGN_DOC" ]; then
    echo -e "${GREEN}✓${NC} 設計書が存在"
    PASS=$((PASS + 1))

    # チェックリストの完了状況を確認
    TOTAL_CHECKS=$(grep -c "^- \[" "$DESIGN_DOC" 2>/dev/null || echo "0")
    COMPLETED_CHECKS=$(grep -c "^- \[x\]" "$DESIGN_DOC" 2>/dev/null || echo "0")

    echo "  チェックリスト: $COMPLETED_CHECKS / $TOTAL_CHECKS 完了"

    if [ "$COMPLETED_CHECKS" -eq "$TOTAL_CHECKS" ] && [ "$TOTAL_CHECKS" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} すべてのチェック項目が完了"
        PASS=$((PASS + 1))
    else
        UNCOMPLETED=$((TOTAL_CHECKS - COMPLETED_CHECKS))
        echo -e "${YELLOW}!${NC} $UNCOMPLETED 項目が未完了"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}!${NC} 設計書が見つかりません"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# 最終結果
echo -e "${CYAN}======================================"
echo "最終確認結果"
echo -e "======================================${NC}"
echo ""

echo "合格: ${GREEN}$PASS${NC} 項目"
echo "警告: ${YELLOW}$WARNINGS${NC} 項目"
echo "エラー: ${RED}$ERRORS${NC} 項目"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ 完璧です！すべての確認に合格しました${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "本番運用を開始できます："
    echo "  ./scripts/production-setup-wizard.sh"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}! 警告があります（重大な問題はありません）${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "警告内容を確認してください。"
    echo "多くの警告は本番運用時に設定する項目です。"
    echo ""
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}✗ エラーがあります${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "エラーを修正してから再実行してください"
    echo ""
    exit 1
fi
