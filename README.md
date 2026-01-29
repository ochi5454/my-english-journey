# 時間外労働管理システム / Tournament Ops MVP

Next.js（App Router）フロントと FastAPI バックエンドで構成された、勤務データのインポート・集計・エクスポートを行うアプリです。docker-compose で一括起動、またはそれぞれローカル起動できます。

## 構成とスタック
- frontend: Next.js 14 (App Router) + TypeScript + Tailwind
- backend: FastAPI + SQLite（`backend/data/app.db`）
- docker-compose: frontend 5175→3000, backend 8000→8000
- 認証なしのローカル開発前提（API ベース URL は `NEXT_PUBLIC_API_BASE`）

## セットアップ
1) 環境変数を用意  
   ```
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   backend 側 `.env` に `OPENAI_API_KEY` を設定（必要な場合のみ）。

2) 依存インストール  
   - backend: `pip install -r requirements.txt`（または `pip install -r backend/requirements.txt`）  
   - frontend: `cd frontend && npm install`

## 起動方法
### docker-compose で起動
```
docker-compose up --build
```
- Backend: http://localhost:8000/docs  
- Frontend: http://localhost:5175/

### ローカル個別起動
Backend:
```
cd backend
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```
Frontend:
```
cd frontend
npm run dev
```
API ベース URL は `.env` の `NEXT_PUBLIC_API_BASE` で指定（デフォルト http://127.0.0.1:8000）。

## 主要機能
- Excel/CSV アップロード（複数シート：勤務予定入力、出退社時刻、日数項目、日次実績、勤務予定進捗一覧、所属情報）
- 実所定外時間 推計データの集計・表示・Excelダウンロード
- 残業時間詳細の表示・Excelダウンロード
- バックエンド `/export/all` でカーソル型エクスポート（JSON/CSV/ZIP）
- ローカルストレージを使ったインポートプレビューの保持

## よく使うコマンド
- フロント開発サーバ: `cd frontend && npm run dev`
- Lint: `cd frontend && npm run lint`
- バックエンド起動: `cd backend && uvicorn app:app --reload`
- エクスポート API 例: `curl "http://localhost:8000/export/all?format=json&limit=5"`

## データファイル
サンプル入力は `docs/11_TIM_勤務予定入力.xlsx` などに配置。エクスポート結果はブラウザから Excel ダウンロードまたは API 経由で取得できます。

## 参考ドキュメント（docs/）
- `ai-architecture-reference.md` バックエンド設計ガイド
- `ai-frontend-architecture-reference.md` フロント設計ガイド
- `ai-encryption-implementation-reference.md` 暗号化データ実装
- `ai-oauth2-implementation-reference.md` OAuth2 実装
- `ai-azure-deployment-reference.md` Azure へのデプロイ
- `ai-sharepoint-integration-reference.md` SharePoint 連携
- `ai-design-fundamentals-reference.md` 設計基礎ガイド

## 開発メモ
- DB は SQLite。マイグレーション未導入（必要なら Alembic を追加）。
- API プロンプトは backend `PROMPTS` に集約。
- OpenAI キーは環境変数でのみ扱い、ソースにハードコードしない。
