# My English Journey

iPhone向けモバイルファーストの英語学習進捗管理Webアプリ。
チャットで学習内容を入力すると、Claude APIが自動でカテゴリと時間を判断して記録する。

## チェックリスト

### Phase 1: 基盤構築
- [ ] 不要ファイル削除・プロジェクト初期化
- [ ] DB スキーマ作成（study_records / study_goals）
- [ ] BE: FastAPI エンドポイント実装（records CRUD / progress / goals）
- [ ] FE: Next.js 4画面の骨組み作成

### Phase 2: コア画面
- [ ] ホーム画面（富士山SVG + 総進捗 + 基礎/運用内訳）
- [ ] 定義画面（目標時間の設定・変更）
- [ ] 記録画面（チャット入力 + 確認カード + 編集フォーム）
- [ ] 履歴画面（日/週/月タブ + 編集・削除）

### Phase 3: Claude API チャット記録
- [ ] BE: Claude API 連携エンドポイント（POST /api/chat）
- [ ] BE: プロンプト設計（カテゴリ判定・時間抽出・聞き返し）
- [ ] FE: チャット入力UI → 確認カード → 保存フロー
- [ ] FE: 修正時の編集フォーム

### Phase 4: 仕上げ
- [ ] ダークテーマ・ゴールドアクセント（#c9a84c）適用
- [ ] モバイル最適化（480px）
- [ ] iPhoneからの動作確認

---

## 技術スタック
- FE: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- BE: FastAPI + SQLite
- AI: Claude API（Anthropic）
- デプロイ: ローカル（Mac → iPhone 同一Wi-Fi）

## カテゴリ体系

| 大カテゴリ | サブカテゴリ | 目標 |
|---|---|---|
| 基礎学習 | 発音, 単語, 文法 | 設定可能（初期500h） |
| 運用学習 | スピーキング, リスニング, リーディング, ライティング | 設定可能（初期800h） |

- 目標設定: 大カテゴリ単位
- 進捗表示: サブカテゴリごとの内訳あり

## 画面構成（4画面 + 下部タブナビ）

### ホーム (/)
- 富士山SVGプログレスビジュアル
- 総進捗バー（1,300h目標）
- 基礎/運用の内訳表示
- サブカテゴリごとの累計時間

### 定義 (/define)
- 基礎学習の目標時間設定
- 運用学習の目標時間設定

### 記録 (/record)
- チャット入力欄（メイン機能）
- Claude APIが判定 → 確認カード表示
  - 日付 / カテゴリ / サブカテゴリ / 時間
  - [記録する] [修正する]
- 修正時: 編集フォーム（カテゴリ・サブカテゴリ・時間・日付を手動修正）
- 判定不能時: Claudeが聞き返す

### 履歴 (/history)
- 日 / 週 / 月 タブ切替
- 記録一覧（編集・削除可能）

## チャット入力→記録フロー

```
ユーザー: 「昨日TOEICリスニング1時間やった」
    ↓
FE → BE POST /api/chat { message, date_context }
    ↓
BE → Claude API（カテゴリ判定・時間抽出）
    ↓
BE ← Claude: { category, subcategory, minutes, date }
    ↓（判定不能なら { needs_clarification: true, question: "..." }）
FE ← 確認カード表示
    ↓
ユーザー [記録する] → BE POST /api/records → DB保存
```

### 判定ルール
- 1メッセージ = 1記録
- 日付指定なし = 当日
- 「昨日」「3/10」等 = 該当日
- カテゴリ不明 = 聞き返す

## DB スキーマ

```sql
study_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        DATE NOT NULL,
  category    TEXT NOT NULL,      -- "基礎" or "運用"
  subcategory TEXT NOT NULL,      -- "発音","単語","文法","スピーキング","リスニング","リーディング","ライティング"
  minutes     INTEGER NOT NULL,
  note        TEXT,               -- 元のチャット入力文
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)

study_goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL UNIQUE,  -- "基礎" or "運用"
  target_hours INTEGER NOT NULL,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## API エンドポイント

| Method | Path | 説明 |
|---|---|---|
| POST | /api/chat | チャット入力 → Claude判定 |
| GET | /api/records | 記録一覧（日付フィルタ対応） |
| POST | /api/records | 記録保存 |
| PUT | /api/records/:id | 記録更新 |
| DELETE | /api/records/:id | 記録削除 |
| GET | /api/progress | 進捗集計（カテゴリ・サブカテゴリ別） |
| GET | /api/goals | 目標取得 |
| PUT | /api/goals/:category | 目標更新 |

## UI デザイン
- ダークテーマ
- ゴールドアクセント: #c9a84c
- モバイルファースト: 480px基準
- 下部タブナビゲーション

## セットアップ

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm run dev -- --hostname 0.0.0.0 --port 3000
```

iPhoneからは同一Wi-Fi上で `http://<MacのIP>:3000` にアクセス。

## 環境変数

```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=sqlite:///data/journey.db
```
