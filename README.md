# AIメール送信エージェント

Next.js（App Router）フロントエンドとFastAPIバックエンドで構成された、AIアシスト付きメール送信システムです。

## 主要機能

- **ファジー検索**: タイプミス許容の宛先検索（Entra ID + ローカル宛先リスト）
- **AIメール生成**: Langchain連携によるメール本文・件名の自動生成
- **予約送信**: 指定日時にメールを自動送信
- **組織管理**: 部署単位での宛先指定
- **署名管理**: 複数署名の登録・切り替え
- **テンプレート**: メールテンプレートの管理・適用

## 構成

```
├── backend/          # FastAPI + SQLite
├── frontend/         # Next.js 14 (App Router) + TypeScript + Tailwind
├── docs/
│   ├── deployment/   # デプロイ手順
│   │   ├── AD/
│   │   └── PROTHENTIA/
│   ├── setup/        # セットアップ手順
│   ├── design/       # 設計ドキュメント
│   ├── manuals/      # 運用マニュアル
│   ├── auth/         # 認証関連
│   └── ai-reference/ # AI向けリファレンス
└── scripts/          # ユーティリティスクリプト
```

## セットアップ

### 1. 環境変数を用意

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. 依存インストール

```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

## 起動方法

### ローカル起動

```bash
# Backend
cd backend && uvicorn app:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

- Backend: http://localhost:8000/docs
- Frontend: http://localhost:3000

### Docker Compose

```bash
docker-compose up --build
```

## 環境変数

### Backend (.env)

```
# OpenAI (AIメール生成用)
OPENAI_API_KEY=<your_openai_api_key>

# Microsoft Entra ID
ENTRA_TENANT_ID=<your_tenant_id>
ENTRA_CLIENT_ID=<app_client_id>
ENTRA_CLIENT_SECRET=<app_client_secret>
ENTRA_REDIRECT_URI=http://localhost:3000/auth/callback

# セッション
SESSION_SECRET_KEY=<random_session_secret>
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

## ドキュメント

| カテゴリ | 場所 |
|---------|------|
| 設計書 | `docs/design/` |
| デプロイ手順 | `docs/deployment/` |
| 運用マニュアル | `docs/manuals/` |
| 認証設定 | `docs/auth/` |
| AI向けリファレンス | `docs/ai-reference/` |

## 開発メモ

- DB: SQLite（`backend/data/app.db`）
- 認証: Microsoft Entra ID（OAuth2）
- AI: OpenAI GPT via Langchain
