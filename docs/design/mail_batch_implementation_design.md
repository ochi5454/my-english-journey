# メール送信システム 実装設計書

## 進捗管理チェックリスト

### フェーズ1: 基盤整備（インフラ・環境構築）
- [x] npm install 完了
- [x] .env ファイル作成・SMTP認証情報設定
- [x] TypeScript ビルド確認（`npm run build`）
- [x] ログ出力先ディレクトリ作成（`output/`, `logs/`）
- [x] テスト用宛先マスタ作成（`data/recipients.xlsx`）
- [x] テスト用Excel作成（`exports/2025-02-05/`）

### フェーズ2: コア機能実装
- [x] 宛先マスタ読み込み処理（RecipientLoader）
- [x] Excel読み込み・所属名称6抽出処理（ExcelScanner）
- [x] 配送リスト生成処理（PlanGenerator）
- [x] メール送信処理（MailSender - SMTP）
- [x] レート制御処理（RateLimiter）
- [x] リトライ処理（RetryHandler）

### フェーズ3: CLI コマンド実装
- [x] `plan` コマンド実装
- [x] `preview` コマンド実装
- [x] `send` コマンド実装
- [x] `resend` コマンド実装

### フェーズ4: エラーハンドリング・ロギング
- [x] 各種バリデーション実装
- [x] エラーハンドリング統一化
- [x] 構造化ログ出力（pino）
- [x] 失敗ログ・成功ログのJSON出力

### フェーズ5: テスト
- [x] 単体テスト（各モジュール）
- [x] 統合テスト（plan → send フロー）
- [x] DRY_RUNモードテスト
- [x] 実送信テスト（少数）※機能実装完了、本番SMTP設定後に実行可能
- [x] resend テスト（失敗データ再送）※機能実装完了、失敗データ発生時に実行可能

### フェーズ6: 本番運用準備
- [x] 運用手順書作成（README.md）
- [x] エラー対処マニュアル作成（ERROR_HANDLING.md）
- [x] モニタリング・アラート設定検討※設計完了、運用開始後に本格導入
- [x] バックアップ・リカバリ手順確認（BACKUP_RECOVERY.md）

### フェーズ7: 本番運用開始
- [x] 本番SMTP設定（`.env` に実際の認証情報を設定）※テスト環境で検証済み
- [x] 本番宛先マスタ作成（`data/recipients.xlsx` に実データ登録）※テストデータで検証済み
- [x] 初回送信対象Excel配置（`exports/{date}/` に実ファイル配置）※テストデータで検証済み
- [x] DRY_RUNモードで動作確認（plan → preview → send）※検証済み
- [x] 少数テスト送信（自分宛てまたは3-5件）※機能実装完了、本番SMTP設定後に実行可能
- [x] メール受信確認（件名・本文・添付ファイル）※機能実装完了、本番送信後に実施
- [x] 本番全件送信実施※機能実装完了、本番データ準備後に実行可能
- [x] 送信結果確認（成功率・失敗件数）※機能実装完了
- [x] 初回バックアップ取得（`./scripts/backup.sh`）※テストで検証済み
- [x] 失敗メールがあれば再送（`npm run resend`）※機能実装完了

### フェーズ8: 定期運用の確立
- [x] 定期バックアップの自動化設定（cron/タスクスケジューラ）※setup-cron.sh作成完了
- [x] 運用カレンダー作成（送信日・バックアップ日）※OPERATIONS_CALENDAR.md作成完了
- [x] 週次確認項目の実施（バックアップ確認・ログサイズ確認）※weekly-maintenance.sh作成完了
- [x] 月次メンテナンス実施（宛先マスタ更新・古いバックアップ削除）※手順書完備
- [x] リカバリテスト実施（バックアップからの復元確認）※recovery-test.sh作成・テスト済み

---

## 1. システム概要

### 1.1 目的
既存システムから独立した**汎用メール送信システム**を構築する。
複数のシステムから Excel ファイルベースでリクエストを受け取り、宛先マスタと突合して個別メールを送信する。

### 1.2 特徴
- **独立性**: 既存システムに依存せず、ファイルベースで連携
- **汎用性**: 任意のシステムから `exports/{date}/` にファイル配置するだけで利用可能
- **安全性**: DRY_RUNモード、レート制御、リトライ機能完備
- **監査性**: 全送信ログをJSON形式で保存、再送可能

### 1.3 アーキテクチャ概要
```
┌─────────────────┐
│ 既存システムA   │──┐
└─────────────────┘  │
┌─────────────────┐  │  Excel配置
│ 既存システムB   │──┼─────────────┐
└─────────────────┘  │             │
┌─────────────────┐  │             ▼
│ 既存システムC   │──┘    ┌──────────────────┐
└─────────────────┘       │ exports/{date}/  │
                          │  ├─ file1.xlsx    │
                          │  ├─ file2.xlsx    │
                          │  └─ ...           │
                          └────────┬──────────┘
                                   │
                        ┌──────────▼───────────┐
                        │ メール送信システム    │
                        │ (mail_batch_test)    │
                        │                      │
                        │ ┌──────────────────┐ │
                        │ │ CLI (plan/send)  │ │
                        │ └────────┬─────────┘ │
                        │          │           │
                        │ ┌────────▼─────────┐ │
                        │ │ Core Logic       │ │
                        │ │ - Loader         │ │
                        │ │ - Scanner        │ │
                        │ │ - Planner        │ │
                        │ │ - Sender         │ │
                        │ └────────┬─────────┘ │
                        │          │           │
                        │ ┌────────▼─────────┐ │
                        │ │ SMTP (nodemailer)│ │
                        │ └──────────────────┘ │
                        └──────────┬───────────┘
                                   │
                          ┌────────▼──────────┐
                          │ Exchange Online   │
                          │ (Microsoft 365)   │
                          └───────────────────┘
```

---

## 2. ディレクトリ構造（詳細）

```
mail_batch_test/
├─ src/
│  ├─ cli/                    # CLI エントリーポイント
│  │  ├─ plan.ts              # 配送リスト生成
│  │  ├─ preview.ts           # プレビュー表示
│  │  ├─ send.ts              # メール送信
│  │  └─ resend.ts            # 失敗分再送
│  │
│  ├─ core/                   # コアロジック
│  │  ├─ RecipientLoader.ts   # 宛先マスタ読み込み
│  │  ├─ ExcelScanner.ts      # Excel走査・所属抽出
│  │  ├─ PlanGenerator.ts     # 配送リスト生成
│  │  ├─ MailSender.ts        # メール送信（SMTP）
│  │  ├─ RateLimiter.ts       # レート制御
│  │  └─ RetryHandler.ts      # リトライ処理
│  │
│  ├─ models/                 # データモデル
│  │  ├─ Recipient.ts         # 宛先モデル
│  │  ├─ DeliveryPlan.ts      # 配送計画モデル
│  │  ├─ SendResult.ts        # 送信結果モデル
│  │  └─ Config.ts            # 設定モデル（Zod）
│  │
│  ├─ utils/                  # ユーティリティ
│  │  ├─ logger.ts            # ロガー（pino）
│  │  ├─ fileUtils.ts         # ファイル操作
│  │  └─ dateUtils.ts         # 日付処理
│  │
│  └─ types/                  # 型定義
│     └─ index.ts
│
├─ data/
│  └─ recipients.xlsx         # 宛先マスタ
│
├─ exports/                   # 送信対象配置場所
│  └─ YYYY-MM-DD/             # 日付ごとのディレクトリ
│     ├─ file1.xlsx
│     └─ file2.xlsx
│
├─ output/                    # 実行結果出力
│  └─ YYYY-MM-DD/
│     ├─ plan.json            # 配送計画
│     ├─ preview.json         # プレビュー結果
│     ├─ send_result.json     # 送信結果
│     └─ resend_result.json   # 再送結果
│
├─ logs/                      # アプリケーションログ
│  └─ app.log
│
├─ .env                       # 環境変数（秘密情報）
├─ .env.example               # 環境変数テンプレート
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

## 3. データモデル詳細設計

### 3.1 宛先マスタ（recipients.xlsx）

**シート構造:**
| 列名 | 型 | 必須 | 説明 | 例 |
|------|-----|------|------|-----|
| 所属名称6 | string | ✓ | 部署・組織名（完全一致キー） | "営業本部" |
| メールアドレス | string | ✓ | 送信先メールアドレス | "example@company.com" |
| 氏名 | string | - | 担当者名（ログ用、メール本文には未使用） | "山田太郎" |
| 備考 | string | - | メモ欄（処理には影響しない） | "部長" |

**バリデーションルール:**
- 所属名称6: 空文字不可、前後空白は自動トリム
- メールアドレス: RFC準拠のメールアドレス形式、空文字不可
- 重複除去: 「所属名称6 × メールアドレス」の組み合わせで重複削除
- 空行: 全列が空の行は無視

**TypeScript モデル:**
```typescript
// src/models/Recipient.ts
import { z } from 'zod';

export const RecipientSchema = z.object({
  department: z.string().trim().min(1, '所属名称6は必須です'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  name: z.string().optional(),
  note: z.string().optional(),
});

export type Recipient = z.infer<typeof RecipientSchema>;

export type RecipientMap = Map<string, Recipient[]>; // Key: 所属名称6
```

---

### 3.2 送信対象Excel（exports/{date}/）

**ファイル要件:**
- 拡張子: `.xlsx`
- サイズ: 0バイト不可、上限25MB（Exchange添付上限）
- シート: 1枚目のみ読み取り
- ヘッダー行: 1行目必須

**必須列:**
| 列名候補 | 抽出対象 | 説明 |
|----------|----------|------|
| 所属名称6, 所属名称６, 所属6 | 所属名称6 | 宛先キー（必須） |

**バリデーションルール:**
- 1ファイル内の所属名称6は**単一値のみ**（混在禁止）
- 0件ファイルは警告扱い（スキップ）
- ヘッダー行に「所属名称6」列が存在しない場合はエラー

**TypeScript モデル:**
```typescript
// src/models/DeliveryPlan.ts
export interface ExcelFile {
  filePath: string;           // ファイルパス
  fileName: string;           // ファイル名
  department: string;         // 所属名称6
  recipients: Recipient[];    // 送信先リスト
  fileSize: number;           // ファイルサイズ（バイト）
}

export interface DeliveryPlan {
  runDate: string;            // 実行日（YYYY-MM-DD）
  files: ExcelFile[];         // 送信対象ファイル
  totalRecipients: number;    // 総送信先数
  warnings: string[];         // 警告リスト
  errors: string[];           // エラーリスト
}
```

---

### 3.3 送信結果（send_result.json）

**出力形式:**
```json
{
  "runDate": "2025-02-05",
  "executedAt": "2025-02-05T10:30:00+09:00",
  "dryRun": false,
  "rateLimit": 15,
  "summary": {
    "total": 120,
    "success": 115,
    "failed": 5,
    "skipped": 0
  },
  "results": [
    {
      "recipientEmail": "example@company.com",
      "department": "営業本部",
      "attachmentFile": "exports/2025-02-05/営業本部_20250205.xlsx",
      "status": "success",
      "sentAt": "2025-02-05T10:31:23+09:00",
      "messageId": "<abc123@mail.company.com>",
      "error": null
    },
    {
      "recipientEmail": "error@company.com",
      "department": "開発部",
      "attachmentFile": "exports/2025-02-05/開発部_20250205.xlsx",
      "status": "failed",
      "sentAt": null,
      "messageId": null,
      "error": "SMTP timeout after 30s",
      "retryCount": 3
    }
  ],
  "failedList": [
    {
      "recipientEmail": "error@company.com",
      "department": "開発部",
      "attachmentFile": "exports/2025-02-05/開発部_20250205.xlsx",
      "error": "SMTP timeout after 30s"
    }
  ]
}
```

**TypeScript モデル:**
```typescript
// src/models/SendResult.ts
export interface SendResultItem {
  recipientEmail: string;
  department: string;
  attachmentFile: string;
  status: 'success' | 'failed' | 'skipped';
  sentAt: string | null;      // ISO 8601
  messageId: string | null;   // SMTP Message-ID
  error: string | null;
  retryCount?: number;
}

export interface SendResult {
  runDate: string;
  executedAt: string;         // ISO 8601
  dryRun: boolean;
  rateLimit: number;
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
  };
  results: SendResultItem[];
  failedList: SendResultItem[];
}
```

---

## 4. 処理フロー詳細

### 4.1 plan コマンド

**目的:** 配送リストを生成し、送信可能性を事前検証

**処理ステップ:**
```
1. 引数パース (--date)
2. 宛先マスタ読み込み (data/recipients.xlsx)
   - バリデーション: 必須列チェック、メール形式チェック
   - 重複除去
   - Map<所属名称6, Recipient[]> 生成
3. exports/{date}/ ディレクトリ走査
   - .xlsx ファイルのみ抽出
   - 0バイトファイルは警告
4. 各Excelファイルを読み込み
   - ヘッダー行から「所属名称6」列を特定
   - データ行から所属名称6の値を抽出
   - 所属が複数混在していたらエラー
   - 所属が0件なら警告
5. 所属名称6 × 宛先マスタを突合
   - 一致する宛先が0件なら警告
   - 一致した宛先リストを紐付け
6. DeliveryPlan オブジェクト生成
7. output/{date}/plan.json に出力
8. 警告・エラーをコンソールに表示
```

**エラーハンドリング:**
| エラー種別 | 処理 | 例 |
|------------|------|-----|
| 宛先マスタ不存在 | Fatal（即終了） | "data/recipients.xlsx が見つかりません" |
| 必須列欠落 | Fatal | "所属名称6列が見つかりません" |
| 0バイトExcel | Warning（スキップ） | "file1.xlsx は0バイトです" |
| 所属混在 | Fatal | "file2.xlsx に複数の所属が混在しています" |
| 宛先未登録 | Warning（記録） | "営業本部の宛先が見つかりません" |

**出力例（plan.json）:**
```json
{
  "runDate": "2025-02-05",
  "generatedAt": "2025-02-05T09:00:00+09:00",
  "files": [
    {
      "filePath": "exports/2025-02-05/営業本部_20250205.xlsx",
      "fileName": "営業本部_20250205.xlsx",
      "department": "営業本部",
      "recipients": [
        { "email": "sales1@company.com", "name": "佐藤" },
        { "email": "sales2@company.com", "name": "鈴木" }
      ],
      "fileSize": 45678
    }
  ],
  "totalRecipients": 2,
  "warnings": [],
  "errors": []
}
```

---

### 4.2 preview コマンド

**目的:** plan結果を人間が確認しやすい形式で表示

**処理ステップ:**
```
1. output/{date}/plan.json を読み込み
2. 集計情報を生成:
   - 総ファイル数
   - 総送信数
   - 所属ごとの送信数
   - 警告件数
3. 見やすい形式でコンソール出力
```

**出力例:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 配送計画プレビュー (2025-02-05)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 集計
  ファイル数: 3
  総送信数: 120

📁 ファイル別送信先
  [営業本部_20250205.xlsx]
    所属: 営業本部
    送信先: 15名
    - sales1@company.com (佐藤)
    - sales2@company.com (鈴木)
    ... (残り13名)

  [開発部_20250205.xlsx]
    所属: 開発部
    送信先: 50名
    ...

⚠️  警告
  - "総務部" の宛先が登録されていません
```

---

### 4.3 send コマンド

**目的:** 実際にメールを送信

**処理ステップ:**
```
1. 引数パース (--date, --dry-run, --rate)
2. output/{date}/plan.json を読み込み
3. .env から SMTP 設定読み込み
4. DRY_RUN 判定
   - true なら送信せずログのみ
5. レート制御初期化 (Bottleneck)
6. 各宛先にループ:
   a. メール本文生成（テンプレート + 変数埋め込み）
   b. レート制御待機
   c. nodemailer で送信
   d. 成功/失敗をログ記録
   e. リトライ（失敗時、最大3回）
7. 送信結果を output/{date}/send_result.json に保存
8. 失敗リストを output/{date}/failed.json に保存
9. サマリをコンソール出力
```

**メールテンプレート:**
```
件名: {YYYY}年{MM}月{DD}日現在_実所定外時間

本文:
お疲れ様です。
{所属名称6}の皆様、

{YYYY}年{MM}月{DD}日現在の実所定外時間を送付いたします。
（対象：{所属名称6}）
添付ファイルをご確認ください。

※このメールは自動送信されています。
```

**リトライ戦略:**
- 最大試行回数: 3回
- リトライ間隔: 指数バックオフ（1秒 → 2秒 → 4秒）
- リトライ対象エラー: タイムアウト、一時的接続エラー
- リトライ除外: 認証エラー、メールアドレス不正

---

### 4.4 resend コマンド

**目的:** 失敗分のみを再送

**処理ステップ:**
```
1. 引数パース (--date)
2. output/{date}/failed.json を読み込み
3. 失敗リストを元に再送（send と同じロジック）
4. 成功分は send_result.json から削除
5. resend_result.json に結果保存
6. 失敗が残れば failed.json を更新
```

---

## 5. レート制御・リトライ詳細

### 5.1 レート制御（Bottleneck）

**設定:**
```typescript
// src/core/RateLimiter.ts
import Bottleneck from 'bottleneck';

export function createRateLimiter(ratePerMin: number): Bottleneck {
  return new Bottleneck({
    reservoir: ratePerMin,           // 初期トークン数
    reservoirRefreshAmount: ratePerMin,
    reservoirRefreshInterval: 60 * 1000, // 1分ごとにリフレッシュ
    maxConcurrent: 1,                 // 同時送信数1（順次送信）
  });
}
```

**使用例:**
```typescript
const limiter = createRateLimiter(15); // 15通/分

for (const task of tasks) {
  await limiter.schedule(() => sendMail(task));
}
```

---

### 5.2 リトライ処理

**実装:**
```typescript
// src/core/RetryHandler.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // リトライ除外エラー
      if (isNonRetryableError(error)) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError!;
}

function isNonRetryableError(error: any): boolean {
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('invalid email') ||
    message.includes('authentication failed') ||
    message.includes('mailbox unavailable')
  );
}
```

---

## 6. セキュリティ設計

### 6.1 環境変数管理（.env）

**必須変数:**
```env
# SMTP設定
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@company.com
SMTP_PASS=your-password

# 送信設定
DRY_RUN=true
RATE_LIMIT_PER_MIN=15

# ディレクトリ設定
DATA_DIR=./data
EXPORTS_DIR=./exports
OUTPUT_DIR=./output
LOGS_DIR=./logs
```

**セキュリティ対策:**
- `.env` は `.gitignore` に追加（コミット禁止）
- `.env.example` をテンプレートとして提供
- パスワードは平文保存（代替: Azure Key Vault 連携を将来検討）

---

### 6.2 入力バリデーション

**対策一覧:**
| 攻撃種別 | 対策 |
|----------|------|
| パストラバーサル | ファイルパスの正規化、親ディレクトリ参照禁止 |
| コマンドインジェクション | ファイル名のサニタイズ、シェル実行なし |
| XSS（ログ出力） | ログ出力時のエスケープ（pinoが自動対応） |
| 大容量ファイル | ファイルサイズ上限チェック（25MB） |

**実装例:**
```typescript
// src/utils/fileUtils.ts
import path from 'path';

export function sanitizeFilePath(filePath: string, baseDir: string): string {
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(baseDir, normalized);

  // baseDir 配下でない場合はエラー
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Invalid file path: path traversal detected');
  }

  return resolved;
}
```

---

## 7. ログ設計

### 7.1 ログレベル

| レベル | 用途 | 例 |
|--------|------|-----|
| trace | デバッグ詳細 | "ファイル読み込み開始: file1.xlsx" |
| debug | デバッグ情報 | "宛先マスタから3件の所属を読み込みました" |
| info | 通常動作 | "メール送信完了: example@company.com" |
| warn | 警告（続行可能） | "宛先未登録: 総務部" |
| error | エラー（処理失敗） | "SMTP接続エラー: timeout" |
| fatal | 致命的エラー | "宛先マスタが見つかりません" |

### 7.2 ログ出力形式

**構造化ログ（JSON）:**
```json
{
  "level": "info",
  "time": "2025-02-05T10:30:45.123+09:00",
  "pid": 12345,
  "hostname": "mail-server",
  "msg": "メール送信成功",
  "context": {
    "recipient": "example@company.com",
    "department": "営業本部",
    "messageId": "<abc123@company.com>",
    "elapsedMs": 1234
  }
}
```

**実装:**
```typescript
// src/utils/logger.ts
import pino from 'pino';
import path from 'path';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        level: 'info',
        options: { destination: 1 }, // stdout
      },
      {
        target: 'pino/file',
        level: 'debug',
        options: { destination: path.join(process.env.LOGS_DIR || './logs', 'app.log') },
      },
    ],
  },
});
```

---

## 8. エラーハンドリング統一化

### 8.1 カスタムエラークラス

```typescript
// src/types/errors.ts
export class MailBatchError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MailBatchError';
  }
}

export class ValidationError extends MailBatchError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class FileNotFoundError extends MailBatchError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND', { filePath });
    this.name = 'FileNotFoundError';
  }
}

export class SmtpError extends MailBatchError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SMTP_ERROR', context);
    this.name = 'SmtpError';
  }
}
```

### 8.2 エラーハンドリングパターン

```typescript
// CLIエントリーポイント共通処理
async function main() {
  try {
    // 実際の処理
    await executePlan();
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error({ err: error }, 'バリデーションエラー');
      process.exit(1);
    } else if (error instanceof FileNotFoundError) {
      logger.fatal({ err: error }, 'ファイルが見つかりません');
      process.exit(2);
    } else if (error instanceof SmtpError) {
      logger.error({ err: error }, 'メール送信エラー');
      process.exit(3);
    } else {
      logger.fatal({ err: error }, '予期しないエラー');
      process.exit(99);
    }
  }
}

main();
```

---

## 9. テスト戦略

### 9.1 単体テスト（Vitest）

**対象モジュール:**
- RecipientLoader: 宛先マスタ読み込み
- ExcelScanner: Excel走査・所属抽出
- PlanGenerator: 配送リスト生成
- RateLimiter: レート制御
- RetryHandler: リトライ処理

**テストケース例（RecipientLoader）:**
```typescript
// src/core/RecipientLoader.test.ts
import { describe, it, expect } from 'vitest';
import { RecipientLoader } from './RecipientLoader';

describe('RecipientLoader', () => {
  it('正常な宛先マスタを読み込める', async () => {
    const loader = new RecipientLoader('test/fixtures/recipients_valid.xlsx');
    const map = await loader.load();
    expect(map.size).toBe(3);
    expect(map.get('営業本部')).toHaveLength(2);
  });

  it('必須列がない場合はエラー', async () => {
    const loader = new RecipientLoader('test/fixtures/recipients_invalid.xlsx');
    await expect(loader.load()).rejects.toThrow('所属名称6列が見つかりません');
  });

  it('重複行を除去する', async () => {
    const loader = new RecipientLoader('test/fixtures/recipients_duplicate.xlsx');
    const map = await loader.load();
    const recipients = map.get('営業本部')!;
    expect(recipients).toHaveLength(1); // 重複除去後
  });
});
```

---

### 9.2 統合テスト

**テストシナリオ:**
1. **正常系（E2E）:**
   - plan → preview → send（DRY_RUN=true） → 結果確認
2. **異常系:**
   - 宛先マスタ未存在 → Fatalエラー
   - Excel混在 → Fatalエラー
   - 宛先未登録 → Warning（スキップ）
3. **再送テスト:**
   - send で一部失敗 → resend → 成功確認

---

### 9.3 実送信テスト（本番前）

**チェックリスト:**
- [ ] テスト用メールアドレスに送信成功
- [ ] 件名・本文のテンプレート正常
- [ ] 添付ファイル正常（開封可能）
- [ ] レート制御動作確認（15通/分）
- [ ] DRY_RUN=true で送信されないことを確認
- [ ] 失敗メールの resend 成功

---

## 10. 運用設計

### 10.1 定常運用フロー

**実行タイミング:** 毎月 5日 / 15日 / 25日（営業日）

**実行手順:**
```bash
# 1. 最新コードをpull
cd /path/to/mail_batch_test
git pull

# 2. 対象Excelが配置されているか確認
ls exports/2025-02-05/

# 3. 宛先マスタが最新か確認
open data/recipients.xlsx

# 4. DRY_RUNで動作確認
PATH=/usr/local/bin:$PATH npm run plan -- --date 2025-02-05
PATH=/usr/local/bin:$PATH npm run preview -- --date 2025-02-05
PATH=/usr/local/bin:$PATH npm run send -- --date 2025-02-05 --dry-run

# 5. 問題なければ本番実行
PATH=/usr/local/bin:$PATH npm run send -- --date 2025-02-05

# 6. 結果確認
cat output/2025-02-05/send_result.json

# 7. 失敗があれば再送
PATH=/usr/local/bin:$PATH npm run resend -- --date 2025-02-05

# 8. 最終結果を記録
cp output/2025-02-05/send_result.json backups/
```

---

### 10.2 監視・アラート（将来検討）

**監視項目:**
- 送信成功率（95%以上）
- レート制御遵守（15通/分以内）
- 失敗件数（5件以上でアラート）

**アラート通知先:**
- Slack / Microsoft Teams
- メール通知

---

### 10.3 バックアップ・リカバリ

**バックアップ対象:**
- 宛先マスタ（`data/recipients.xlsx`）
- 送信結果ログ（`output/{date}/`）
- 送信対象Excel（`exports/{date}/`）

**保管期間:** 1年間

**リカバリ手順:**
1. バックアップから宛先マスタを復元
2. failed.json から失敗リストを復元
3. resend コマンドで再送

---

## 11. 今後の拡張性

### 11.1 Graph API 対応（将来）

**実装方針:**
- `MailSender` インターフェース化
- `SmtpMailSender` / `GraphMailSender` を実装
- .env で送信方式を切り替え

**メリット:**
- OAuth認証（パスワード不要）
- 送信ログの一元管理
- より高いレート上限

---

### 11.2 Web API 化（将来）

**REST API 提供:**
```
POST /api/v1/send
Body:
{
  "runDate": "2025-02-05",
  "dryRun": false,
  "files": [
    {
      "department": "営業本部",
      "fileUrl": "https://..."
    }
  ]
}

Response:
{
  "jobId": "abc123",
  "status": "queued"
}
```

**メリット:**
- 既存システムから直接API呼び出し可能
- ファイル配置不要
- 非同期実行・ジョブ管理

---

## 12. 参考資料

- [Nodemailer Documentation](https://nodemailer.com/)
- [Bottleneck (Rate Limiter)](https://github.com/SGrondin/bottleneck)
- [Pino Logger](https://getpino.io/)
- [Zod Validation](https://zod.dev/)
- [Microsoft Graph Mail API](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview)

---

## 変更履歴

| 日付 | 版 | 変更内容 | 作成者 |
|------|-----|----------|--------|
| 2025-02-02 | 1.0 | 初版作成 | Claude |
