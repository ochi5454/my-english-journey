#!/bin/bash
# 本番環境セットアップスクリプト

set -e

echo "======================================"
echo "メール一括送信システム 本番環境セットアップ"
echo "======================================"
echo ""

# 色の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 現在のディレクトリを確認
if [ ! -f "package.json" ]; then
    echo -e "${RED}エラー: mail_batch_test ディレクトリで実行してください${NC}"
    exit 1
fi

echo "ステップ1: 環境確認"
echo "===================="

# Node.js確認
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js がインストールされていません"
    exit 1
fi

# npm確認
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓${NC} npm: $NPM_VERSION"
else
    echo -e "${RED}✗${NC} npm がインストールされていません"
    exit 1
fi

echo ""
echo "ステップ2: 依存パッケージ確認"
echo "=============================="

if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules が存在します"
else
    echo -e "${YELLOW}!${NC} node_modules が存在しません。npm install を実行します..."
    npm install
fi

echo ""
echo "ステップ3: ビルド確認"
echo "===================="

if npm run build; then
    echo -e "${GREEN}✓${NC} TypeScriptビルドが成功しました"
else
    echo -e "${RED}✗${NC} TypeScriptビルドに失敗しました"
    exit 1
fi

echo ""
echo "ステップ4: .env ファイル確認"
echo "============================"

if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env ファイルが存在します"

    # 必須項目チェック
    if grep -q "SMTP_HOST=" .env && grep -q "SMTP_USER=" .env && grep -q "FROM_ADDRESS=" .env; then
        echo -e "${GREEN}✓${NC} 必須設定項目が存在します"
    else
        echo -e "${YELLOW}!${NC} .env に必須項目が不足している可能性があります"
    fi

    # DRY_RUN確認
    if grep -q "DRY_RUN=true" .env; then
        echo -e "${YELLOW}!${NC} 注意: DRY_RUN=true です（実際には送信されません）"
    elif grep -q "DRY_RUN=false" .env; then
        echo -e "${RED}!${NC} 警告: DRY_RUN=false です（実際にメールが送信されます）"
    fi
else
    echo -e "${RED}✗${NC} .env ファイルが存在しません"
    echo ""
    echo "以下のコマンドで作成してください："
    echo "  cp .env.example .env"
    echo "  vi .env  # SMTP設定を編集"
    exit 1
fi

echo ""
echo "ステップ5: ディレクトリ確認"
echo "=========================="

# 必要なディレクトリ
REQUIRED_DIRS=("data" "exports" "output" "logs")

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $dir/ が存在します"
    else
        echo -e "${YELLOW}!${NC} $dir/ が存在しません。作成します..."
        mkdir -p "$dir"
    fi
done

echo ""
echo "ステップ6: 宛先マスタ確認"
echo "========================"

if [ -f "data/recipients.xlsx" ]; then
    FILE_SIZE=$(ls -lh data/recipients.xlsx | awk '{print $5}')
    echo -e "${GREEN}✓${NC} data/recipients.xlsx が存在します (サイズ: $FILE_SIZE)"

    # テストデータかどうか確認
    if grep -q "example.com" <(strings data/recipients.xlsx 2>/dev/null || echo ""); then
        echo -e "${YELLOW}!${NC} 警告: テストデータ（example.com）が含まれている可能性があります"
        echo "   本番データに置き換えてください"
    fi
else
    echo -e "${RED}✗${NC} data/recipients.xlsx が存在しません"
    echo ""
    echo "テストデータを生成する場合："
    echo "  npx tsx scripts/create-test-data.ts"
    echo ""
    echo "本番データを配置する場合："
    echo "  実際の宛先マスタを data/recipients.xlsx として配置してください"
fi

echo ""
echo "ステップ7: テスト実行"
echo "===================="

if npm test; then
    echo -e "${GREEN}✓${NC} すべてのテストが成功しました"
else
    echo -e "${RED}✗${NC} テストに失敗しました"
    exit 1
fi

echo ""
echo "======================================"
echo "セットアップ確認完了"
echo "======================================"
echo ""

# 次のステップを表示
echo "次のステップ:"
echo ""
echo "1. .env ファイルを編集して本番SMTP設定を行う"
echo "   vi .env"
echo ""
echo "2. 宛先マスタに本番データを配置"
echo "   data/recipients.xlsx を編集"
echo ""
echo "3. 送信対象Excelを配置（例: 2025-02-05）"
echo "   mkdir -p exports/2025-02-05"
echo "   # Excelファイルをコピー"
echo ""
echo "4. DRY_RUNモードで動作確認"
echo "   npm run plan -- --date 2025-02-05"
echo "   npm run preview -- --date 2025-02-05"
echo "   npm run send -- --date 2025-02-05 --dry-run=true"
echo ""
echo "5. 少数テスト送信"
echo "   # .env で DRY_RUN=false に設定"
echo "   npm run send -- --date 2025-02-05"
echo ""

exit 0
