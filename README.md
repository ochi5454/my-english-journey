# Tournament Ops MVP (並置構成)

`frontend/` (Next.js) と `backend/` (FastAPI+SQLite) の2つで構成しています。`docker-compose` で両方起動できます。

## 構成
- `backend/`: FastAPI + SQLite。大会/タスク/ドキュメント生成/遅延アラート/サンプル投入。
- `frontend/`: Next.js (App Router) + Tailwind。大会一覧→詳細→生成ボタン→結果表示。
- `docker-compose.yml`: ポート `8000:8000`(backend), `5175:3000`(frontend)。

## セットアップ
1. 環境変数を用意  
   - `cp backend/.env.example backend/.env`  
   - `cp frontend/.env.example frontend/.env`  
   - `.env` に `OPENAI_API_KEY` を設定（backend側）。
2. Dockerビルド・起動  
   ```bash
   docker-compose up --build
   ```
3. アクセス  
   - Backend: http://localhost:8000/docs  
   - Frontend: http://localhost:5175/

## 使い方（MVP）
1) フロントトップで大会を登録。  
2) 大会カードをクリック → 詳細画面へ。  
3) ボタンで以下を生成:  
   - ToDo自動生成（テンプレートからSQLite保存）  
   - 進行表（ローカルテンプレ or OpenAI JSON）  
   - 会場手配メール / 審判手配メール（OpenAI JSON）  
4) 生成結果はDBに保存され、詳細画面の「生成結果」で確認。  
5) タスク期限が過ぎて未完の場合、詳細読み込み時に遅延アラートを生成し表示。  
6) サンプルデータ: `POST http://localhost:8000/seed` で大会1件+タスクを投入。  
7) 進行表: OpenAIキーが無くてもローカルテンプレでタイムラインJSONを生成し保存（キーがあればAI版で上書き）。

## 開発メモ
- Backend: `backend/app.py` を uvicorn で起動。データは `backend/data/app.db`（volumeに永続化）。  
- Frontend: `frontend` で `npm install && npm run dev` でも起動可（APIは `NEXT_PUBLIC_API_BASE` で指定）。  
- AIプロンプトは backend の `PROMPTS` に集約。OpenAI APIキーは環境変数のみで扱う。  
- DB: SQLite / SQLAlchemy (Base), マイグレーションは未導入（必要なら Alembic）。  
