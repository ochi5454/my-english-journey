# My English Journey

iPhone向けモバイルファーストの英語学習進捗管理Webアプリ。
チャットで学習内容を入力すると、キーワード解析で自動でカテゴリと時間を判断して記録する。

## チェックリスト

### Phase 1: 基盤構築
- [x] 不要ファイル削除・プロジェクト初期化
- [x] DB スキーマ作成（study_records / study_goals）
- [x] BE: FastAPI エンドポイント実装（records CRUD / progress / goals）
- [x] FE: Next.js 4画面の骨組み作成

### Phase 2: コア画面
- [x] ホーム画面（BE連携 + 総進捗 + 基礎/運用内訳 + サブカテゴリ内訳）
- [x] 定義画面（目標時間の編集・保存）
- [x] 記録画面（手動入力フォーム + 保存 / チャット入力はPhase 3）
- [x] 履歴画面（日/週/月タブ + 編集・削除）
- [ ] ホーム画面に富士山SVGプログレスビジュアル追加

### Phase 3: チャット記録（キーワード解析）
- [x] FE: チャット入力UI → 確認カード → 保存フロー
- [x] FE: 修正時の編集フォーム
- [x] BE: キーワードベースのカテゴリ自動判定（Claude API不要）
- [x] 実動作確認

### Phase 4: 仕上げ
- [x] ダークテーマ・ゴールドアクセント（#c9a84c）適用
- [x] モバイル最適化（viewport-fit cover / safe area / PWA対応）
- [x] iPhoneからの動作確認

### Phase 5: 機能改善
- [x] ホーム: サブカテゴリごとの目標時間と進捗表示（Xh / Yh）
- [x] BE: サブカテゴリ目標のDB・API追加（study_subcategory_goals）
- [x] 定義ページ: 「英語ができる」の定義ページに変更（定性・定量）
- [x] BE: 定義内容のDB・API追加（study_definitions）
- [x] 履歴: 年タブ追加 + 期間別の棒グラフ表示

---

## 技術スタック
- FE: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- BE: FastAPI + SQLite
- AI: キーワード解析（API不要）
- デプロイ: ローカル（Mac → iPhone 同一Wi-Fi）

## カテゴリ体系と目標時間配分

| 大カテゴリ | サブカテゴリ | サブカテゴリ目標 | 合計 |
|---|---|---|---|
| 基礎学習 | 発音 50h, 単語 200h, 文法 250h | サブカテゴリ単位で設定可能 | 500h |
| 運用学習 | スピーキング 400h, リスニング 200h, リーディング 100h, ライティング 100h | サブカテゴリ単位で設定可能 | 800h |

- 目標設定: サブカテゴリ単位（大カテゴリ合計は自動計算）
- 進捗表示: サブカテゴリごとに Xh / Yh 形式で表示

## 画面構成（4画面 + 下部タブナビ）

### ホーム (/)
- 総進捗バー（1,300h目標）
- 基礎/運用の内訳表示（カテゴリ合計 Xh / Yh）
- サブカテゴリごとの進捗（Xh / Yh + プログレスバー）
  - 基礎: 発音 0h/50h, 単語 0h/200h, 文法 0h/250h
  - 運用: スピーキング 0h/400h, リスニング 0h/200h, リーディング 0h/100h, ライティング 0h/100h

### 定義 (/define)
- 「英語ができる」の定義を表示するページ
- 定性的な定義: 自分の意見を正確に伝えることができ、かつ相手が話す内容を明確に理解できること
- 定量的な定義: IELTS 7.0/9.0 以上、TOEFL iBT 90/120 以上
- ユーザーが定義内容を編集・保存可能

### 記録 (/record)
- チャット入力欄（メイン機能）
- キーワード解析で自動判定 → 確認カード表示
  - 日付 / カテゴリ / サブカテゴリ / 時間
  - [記録する] [修正する]
- 修正時: 編集フォーム（カテゴリ・サブカテゴリ・時間・日付を手動修正）
- 判定不能時: 聞き返しメッセージ表示

### 履歴 (/history)
- 週 / 月 / 年 タブ切替
- ← → で過去の期間に遡れるナビゲーション（未来には進めない）
- 期間ごとの学習時間グラフ（棒グラフで視覚化）
  - 週: 7日間の日別棒グラフ（目盛線: 1h, 3h, 5h）
  - 月: 月内の日別棒グラフ（目盛線: 1h, 3h, 5h）
  - 年: 12ヶ月の月別棒グラフ（目盛線: 20h, 40h, 60h）
- 横向きの目盛線3本で目安を表示
- 記録一覧（編集・削除可能）

## チャット入力→記録フロー

```
ユーザー: 「昨日TOEICリスニング1時間やった」
    ↓
FE → BE POST /api/chat { message }
    ↓
BE: キーワード解析（カテゴリ判定・時間抽出）
    ↓
BE → FE: { category, subcategory, minutes, date }
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

study_subcategory_goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,       -- "基礎" or "運用"
  subcategory   TEXT NOT NULL,       -- "発音","単語" etc.
  target_hours  INTEGER NOT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category, subcategory)
)
-- 初期値: 発音50, 単語200, 文法250, スピーキング400, リスニング200, リーディング100, ライティング100

study_definitions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,   -- "qualitative" or "quantitative"
  content    TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
-- 初期値:
-- qualitative: "自分の意見を正確に伝えることができ、かつ相手が話す内容を明確に理解できること"
-- quantitative: "IELTS 7.0/9.0 以上\nTOEFL iBT 90/120 以上"
```

## API エンドポイント

| Method | Path | 説明 |
|---|---|---|
| POST | /api/chat | チャット入力 → キーワード判定 |
| GET | /api/records | 記録一覧（日付フィルタ対応） |
| POST | /api/records | 記録保存 |
| PUT | /api/records/:id | 記録更新 |
| DELETE | /api/records/:id | 記録削除 |
| GET | /api/progress | 進捗集計（カテゴリ・サブカテゴリ別） |
| GET | /api/goals | 目標取得 |
| PUT | /api/goals/:category | 目標更新 |
| GET | /api/subcategory-goals | サブカテゴリ目標取得 |
| PUT | /api/subcategory-goals/:category/:subcategory | サブカテゴリ目標更新 |
| GET | /api/definitions | 定義取得 |
| PUT | /api/definitions/:key | 定義更新 |

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
DATABASE_URL=sqlite:///data/journey.db
```

※ Claude API は使用しません（キーワード解析で代替）
