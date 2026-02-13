# ローカル開発ガイド

このガイドは、GitHub からプロジェクトを取得して、ローカルで実行・編集する開発者向けのガイドです。

---

## 概要

ローカル開発には3つのオプションがあります：

| オプション | 最適な用途 | Docker で動作するもの | データ永続化 |
|-----------|----------|---------------------|-------------|
| **オプション A: 分離コンテナ** | 本番環境に近い環境でのテスト | すべて（FE + BE + DB）別々 | ボリュームで永続 |
| **オプション B: ハイブリッド** | ホットリロードでのアクティブ開発 | PostgreSQL のみ | ボリュームで永続 |
| **オプション C: All-in-One** | Azure 本番環境のテスト | すべて（単一コンテナ） | コンテナ内（リセット可能） |

> 💡 **Tip**: オプション C（All-in-One）は現在未実装です。ローカル開発にはオプション A または B を使用してください。

---

## Docker アーキテクチャ

ローカル開発では分離コンテナ構成を使用します。

| 構成 | 説明 | Dockerfile |
|------|------|------------|
| **分離コンテナ** | BE + FE + DB を別々のコンテナで実行 | `docker-compose.yml` |

詳細は [DOCKER_ARCHITECTURE.md](DOCKER_ARCHITECTURE.md) を参照してください。

---

## 前提条件

- Docker Desktop がインストール済みで起動中
- Python 3.11+
- Node.js 20+
- Git
- VS Code（推奨）

---

## ステップ 1: リポジトリのクローン

```bash
git clone [repository-url]
cd ragtesting
```

---

## ステップ 2: 環境ファイルのセットアップ

```bash
# バックエンド .env
cp backend/.env.example backend/.env

# フロントエンド .env
cp frontend/.env.example frontend/.env.local
```

詳細な環境ファイル構成については [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) を参照してください。

### backend/.env を編集

必須の値を設定してください：

```env
# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here

# データベース接続（PostgreSQL 移行後）
DATABASE_URL=postgresql://mailagent_user:mailagent_password@localhost:5432/mailagent_db

# 暗号化キー
ENCRYPTION_KEY=your_encryption_key_here

# 管理者（ローカル開発用）
ADMIN_EMAIL=admin
ADMIN_PASSWORD=admin123!
ADMIN_NAME=Admin User
ADMIN_BOOTSTRAP_ENABLED=true

# セッション
SESSION_SECRET_KEY=change-me-to-a-long-random-string

# Microsoft Entra ID 認証
ENTRA_TENANT_ID=your_tenant_id
ENTRA_CLIENT_ID=your_client_id
ENTRA_CLIENT_SECRET=your_client_secret
ENTRA_REDIRECT_URI=http://localhost:3000/auth/callback

# メール設定
MAIL_USE_GRAPH=true
MAIL_FROM_NAME=AI Mail
```

**キーの生成方法：**

```bash
# ENCRYPTION_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# SESSION_SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## オプション A: 分離コンテナ（docker-compose）

すべてを Docker コンテナで実行します（各サービスは別々のコンテナ）。

### すべてのサービスを起動

```bash
docker-compose up --build -d
```

### アプリケーションへのアクセス

| サービス | URL |
|---------|-----|
| フロントエンド | http://localhost:3000 |
| バックエンド API | http://localhost:8000 |
| API ドキュメント | http://localhost:8000/docs |

### ログの表示

```bash
# すべてのサービス
docker-compose logs -f

# 特定のサービス
docker-compose logs -f backend
docker-compose logs -f frontend
```

### サービスの停止

```bash
docker-compose down
```

### コード変更後

```bash
# 再ビルドと再起動
docker-compose build
docker-compose up -d
```

---

## オプション B: ハイブリッド（開発推奨）

PostgreSQL は Docker で実行し、バックエンドとフロントエンドはホットリロードのためローカルで実行します。

### 1. PostgreSQL のみを起動

```bash
docker-compose up postgres -d
```

### 2. バックエンドのセットアップと実行

```bash
# 仮想環境の作成
python3 -m venv venv

# 仮想環境の有効化
source venv/bin/activate  # Mac/Linux
# または: venv\Scripts\activate  # Windows

# 依存関係のインストール
pip install -r requirements.txt

# ホットリロードでバックエンドを実行
uvicorn backend.app:app --reload --port 8000
```

バックエンドは http://localhost:8000 で起動します。

### 3. フロントエンドのセットアップと実行

新しいターミナルを開いてください：

```bash
cd frontend

# 依存関係のインストール
npm install

# ホットリロードで実行
npm run dev
```

フロントエンドは http://localhost:3000 で起動します。

### ハイブリッドモードの利点

- **ホットリロード**: 再ビルドなしで変更が即座に反映
- **高速な反復**: Docker イメージの再ビルドが不要
- **優れたデバッグ**: ログとデバッガーに直接アクセス

---

## プロジェクト構造

```
ragtesting/
├── backend/              # FastAPI Python バックエンド
│   ├── app.py           # エントリーポイント
│   ├── routers/         # API エンドポイント
│   ├── services/        # ビジネスロジック
│   ├── models/          # データベースモデル
│   ├── core/            # 設定・認証
│   └── utils/           # ユーティリティ
│
├── frontend/            # Next.js TypeScript フロントエンド
│   ├── app/             # App Router ページ
│   │   ├── components/  # React コンポーネント
│   │   ├── compose/     # メール作成ページ
│   │   ├── templates/   # テンプレート管理
│   │   └── ...
│   └── public/          # 静的ファイル
│
├── docker/              # Docker 関連ファイル
│   └── init-db/         # PostgreSQL 初期化 SQL
│
├── docker-compose.yml   # Docker サービス設定
└── docs/                # ドキュメント
```

---

## データベース

Docker 環境では PostgreSQL を使用します。データベースは Docker コンテナの起動時に自動的に初期化されます。

### 初期データ

`docker/init-db/` ディレクトリに以下の SQL ファイルがあります：

| ファイル | 内容 |
|---------|------|
| `01-schema.sql` | テーブル定義 |
| `02-seed.sql` | 初期データ（管理者ユーザー、サンプルテンプレート） |
| `03-sample-data.sql` | サンプル宛先リスト |

### データベースのリセット

```bash
# ボリュームを削除して再作成
docker-compose down -v
docker-compose up -d
```

---

## 認証方式

**このシステムは Microsoft Entra ID（Azure AD）認証と Basic 認証をサポートします。**

### ローカル開発でのログイン

1. **Basic 認証（開発用）**
   - ユーザー名: `admin`
   - パスワード: `admin123!`

2. **Microsoft Entra ID 認証**
   - Microsoft アカウントでのシングルサインオン
   - 初回ログイン時に自動的にユーザーアカウントが作成されます

### 認証設定

`backend/.env` で Microsoft Entra ID の設定を確認してください：

```env
ENTRA_TENANT_ID=your_tenant_id
ENTRA_CLIENT_ID=your_client_id
ENTRA_CLIENT_SECRET=your_client_secret
ENTRA_REDIRECT_URI=http://localhost:3000/auth/callback
```

---

## 便利なコマンド

### データベースコマンド

```bash
# PostgreSQL CLI に接続
docker exec -it mailagent_postgres psql -U mailagent_user -d mailagent_db

# すべてのテーブルをリスト
docker exec -it mailagent_postgres psql -U mailagent_user -d mailagent_db -c "\dt"

# データベースをリセット（警告: すべてのデータが削除されます）
docker-compose down -v
docker-compose up postgres -d
```

### Docker コマンド

```bash
# コンテナの状態を確認
docker-compose ps

# ログを表示
docker-compose logs -f backend

# 特定のサービスを再ビルド
docker-compose build backend
docker-compose up -d backend

# すべて停止
docker-compose down
```

### バックエンドコマンド

```bash
# 仮想環境を有効化
source venv/bin/activate

# ホットリロードで実行
uvicorn backend.app:app --reload --port 8000

# 特定のポートで実行
uvicorn backend.app:app --reload --port 8001
```

### フロントエンドコマンド

```bash
cd frontend

# ホットリロードで開発
npm run dev

# 本番用ビルド
npm run build

# 本番ビルドをプレビュー
npm run start
```

---

## 変更を加える

### バックエンドの変更

1. `backend/` の Python ファイルを編集
2. ハイブリッドモードの場合: 変更が自動リロード
3. Docker 使用の場合: `docker-compose build backend` で再ビルド

### フロントエンドの変更

1. `frontend/app/` の TSX/CSS ファイルを編集
2. ハイブリッドモードの場合: 変更が自動リロード
3. Docker 使用の場合: `docker-compose build frontend` で再ビルド

### データベーススキーマの変更

Alembic を使用してマイグレーションを管理：

```bash
# マイグレーションを作成
cd backend
alembic revision --autogenerate -m "description"

# マイグレーションを実行
alembic upgrade head
```

---

## トラブルシューティング

### "OPENAI_API_KEY environment variable is not set"
- `backend/.env` が存在することを確認
- OPENAI_API_KEY が正しく設定されているか確認

### PostgreSQL への "Connection refused"
- Docker が起動しているか確認: `docker-compose ps`
- PostgreSQL コンテナが正常か確認

### ポートが既に使用中
```bash
# ポートを使用しているプロセスを検索
lsof -i :3000
lsof -i :8000

# プロセスを終了
kill <PID>
```

### Module not found（バックエンド）
```bash
# 仮想環境が有効化されているか確認
source venv/bin/activate

# 依存関係を再インストール
pip install -r requirements.txt
```

### npm エラー（フロントエンド）
```bash
# node_modules をクリアして再インストール
rm -rf node_modules
npm install
```

### Next.js で 404 エラー
```bash
# .next ディレクトリを削除して再ビルド
rm -rf .next
npm run dev
```

---

## IDE セットアップ（VS Code）

### 推奨拡張機能

- Python
- Pylance
- ES7+ React/Redux/React-Native snippets
- TypeScript
- Docker
- GitLens
- Tailwind CSS IntelliSense

### 設定

`.vscode/settings.json` に追加:

```json
{
  "python.defaultInterpreterPath": "./venv/bin/python",
  "editor.formatOnSave": true,
  "python.formatting.provider": "black"
}
```

---

## 次のステップ

### Azure へのデプロイ
ローカル開発の後、Azure にデプロイする必要がある場合は以下を参照してください：
- [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md)

### 認証システムの詳細
Microsoft Entra ID 認証の設定や実装について詳しく知りたい場合：
- [MICROSOFT_ENTRA_ID.md](MICROSOFT_ENTRA_ID.md) - Azure Portal での設定方法

---

**最終更新日**: 2026-02-13
