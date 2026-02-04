#!/bin/bash
# Cron自動バックアップ設定スクリプト

echo "======================================"
echo "定期バックアップの自動化設定"
echo "======================================"
echo ""

# 現在のディレクトリの絶対パスを取得
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "プロジェクトディレクトリ: $PROJECT_DIR"
echo ""

# 1. Cron用のラッパースクリプトを作成
echo "1. Cron用スクリプトを作成します..."

cat > "$PROJECT_DIR/scripts/cron-backup.sh" << EOF
#!/bin/bash
# Cron実行用バックアップスクリプト

# ログファイル
LOG_FILE="$PROJECT_DIR/logs/backup.log"

# 実行日（前日の日付を使用）
RUN_DATE=\$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d yesterday +%Y-%m-%d)

# プロジェクトディレクトリに移動
cd "$PROJECT_DIR" || exit 1

# バックアップ実行
echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Starting backup for \$RUN_DATE" >> "\$LOG_FILE"

if ./scripts/backup.sh "\$RUN_DATE" >> "\$LOG_FILE" 2>&1; then
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Backup completed successfully" >> "\$LOG_FILE"
else
    echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Backup failed" >> "\$LOG_FILE"
    exit 1
fi

# 古いバックアップの削除（90日以上前）
find "$PROJECT_DIR/backups" -name "*.tar.gz" -mtime +90 -delete
echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Old backups cleaned up" >> "\$LOG_FILE"
EOF

chmod +x "$PROJECT_DIR/scripts/cron-backup.sh"
echo "✓ scripts/cron-backup.sh を作成しました"
echo ""

# 2. 週次メンテナンス用スクリプト
echo "2. 週次メンテナンススクリプトを作成します..."

cat > "$PROJECT_DIR/scripts/weekly-maintenance.sh" << EOF
#!/bin/bash
# 週次メンテナンススクリプト

cd "$PROJECT_DIR" || exit 1

echo "======================================"
echo "週次メンテナンス: \$(date '+%Y-%m-%d')"
echo "======================================"
echo ""

# 1. バックアップ確認
echo "1. バックアップ確認"
echo "===================="
BACKUP_COUNT=\$(find backups -name "*.tar.gz" -mtime -7 | wc -l)
echo "過去7日間のバックアップ: \${BACKUP_COUNT}件"

if [ "\$BACKUP_COUNT" -eq 0 ]; then
    echo "警告: 直近7日間のバックアップがありません"
fi

# 最新のバックアップ
LATEST_BACKUP=\$(ls -t backups/*.tar.gz 2>/dev/null | head -1)
if [ -n "\$LATEST_BACKUP" ]; then
    echo "最新バックアップ: \$LATEST_BACKUP"
    ls -lh "\$LATEST_BACKUP"
fi

echo ""

# 2. ログサイズ確認
echo "2. ログサイズ確認"
echo "=================="
if [ -f "logs/app.log" ]; then
    LOG_SIZE=\$(du -h logs/app.log | cut -f1)
    echo "app.log サイズ: \$LOG_SIZE"

    # 1GB以上なら警告
    LOG_SIZE_MB=\$(du -m logs/app.log | cut -f1)
    if [ "\$LOG_SIZE_MB" -gt 1024 ]; then
        echo "警告: ログファイルが1GBを超えています。ローテーションを検討してください"
    fi
fi

echo ""

# 3. ディスク容量確認
echo "3. ディスク容量確認"
echo "=================="
df -h "$PROJECT_DIR" | tail -1

echo ""
echo "週次メンテナンス完了"
EOF

chmod +x "$PROJECT_DIR/scripts/weekly-maintenance.sh"
echo "✓ scripts/weekly-maintenance.sh を作成しました"
echo ""

# 3. Cron設定例を表示
echo "3. Cron設定例"
echo "=============="
echo ""
echo "以下のコマンドでcrontabを編集してください:"
echo "  crontab -e"
echo ""
echo "追加する設定例:"
echo ""
echo "# メール送信システム 定期バックアップ（毎日深夜2時）"
echo "0 2 * * * $PROJECT_DIR/scripts/cron-backup.sh"
echo ""
echo "# 週次メンテナンス（毎週月曜日 朝8時）"
echo "0 8 * * 1 $PROJECT_DIR/scripts/weekly-maintenance.sh > $PROJECT_DIR/logs/weekly-maintenance.log 2>&1"
echo ""
echo "# 古いログのローテーション（毎月1日 深夜3時）"
echo "0 3 1 * * cd $PROJECT_DIR && mv logs/app.log logs/app.log.\$(date +\\%Y\\%m\\%d) && gzip logs/app.log.*"
echo ""

# 4. macOS用のLaunchAgentも生成
if [[ "\$(uname)" == "Darwin" ]]; then
    echo "4. macOS用 LaunchAgent設定"
    echo "==========================="
    echo ""

    PLIST_DIR="\$HOME/Library/LaunchAgents"
    PLIST_FILE="\$PLIST_DIR/com.company.mail-batch-backup.plist"

    echo "LaunchAgent用のplistファイルを生成します..."
    echo "場所: \$PLIST_FILE"
    echo ""

    mkdir -p "\$PLIST_DIR"

    cat > "\$PLIST_FILE" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.company.mail-batch-backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PROJECT_DIR/scripts/cron-backup.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/launchd-backup.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/launchd-backup-error.log</string>
</dict>
</plist>
PLIST_EOF

    echo "✓ LaunchAgent plist を作成しました"
    echo ""
    echo "有効化するには以下を実行:"
    echo "  launchctl load \$PLIST_FILE"
    echo ""
    echo "無効化するには:"
    echo "  launchctl unload \$PLIST_FILE"
    echo ""
fi

echo "======================================"
echo "設定完了"
echo "======================================"
echo ""
echo "次のステップ:"
echo "1. crontab -e でcron設定を追加（Linux/macOS）"
echo "2. または launchctl load でLaunchAgentを有効化（macOS）"
echo "3. logs/backup.log でログを確認"
echo ""
