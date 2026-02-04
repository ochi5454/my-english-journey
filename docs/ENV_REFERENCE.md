# 環境変数リファレンス

本ドキュメントでは、RAGTestingシステムで使用する環境変数について説明します。

---

## バックエンド環境変数

### 必須設定

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `OPENAI_API_KEY` | OpenAI APIキー | **必須** | `sk-xxx...` |
| `DATABASE_URL` | データベース接続URL | `sqlite:///./data/app.db` | `postgresql://user:pass@host/db` |

### 認証設定 (Microsoft Entra ID)

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `ENTRA_TENANT_ID` | Azure ADテナントID | 空文字 | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `ENTRA_CLIENT_ID` | アプリケーションクライアントID | 空文字 | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `ENTRA_CLIENT_SECRET` | クライアントシークレット | 空文字 | `xxx...` |
| `ENTRA_REDIRECT_URI` | OAuth2コールバックURL | 空文字 | `http://localhost:3000/auth/callback` |
| `ENTRA_SCOPE` | 要求するスコープ | `openid profile email offline_access User.Read` | - |

### セッション設定

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `SESSION_SECRET_KEY` | セッション署名用シークレット | `dev-session-secret-change` | ランダムな32文字以上の文字列 |
| `SESSION_COOKIE_NAME` | Cookieの名前 | `session` | - |
| `SESSION_MAX_AGE` | セッション有効期限（秒） | `86400` (24時間) | `604800` (7日間) |
| `ENCRYPTION_KEY` | AES暗号化キー（Base64エンコード32バイト） | 空文字 | `base64エンコード済みキー` |

### 管理者設定 (ローカル開発用)

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `ADMIN_EMAIL` | 管理者メールアドレス | `admin` | `admin@example.com` |
| `ADMIN_PASSWORD` | 管理者パスワード | `admin123!` | 強力なパスワード |
| `ADMIN_NAME` | 管理者表示名 | `Admin` | `システム管理者` |
| `ADMIN_BOOTSTRAP_ENABLED` | 起動時に管理者を自動作成するか | `true` | `false` |

### メール設定 (SMTP)

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `SMTP_HOST` | SMTPサーバーホスト | 空文字 | `smtp.office365.com` |
| `SMTP_PORT` | SMTPポート | `587` | `465` |
| `SMTP_USERNAME` | SMTP認証ユーザー名 | 空文字 | `user@example.com` |
| `SMTP_PASSWORD` | SMTP認証パスワード | 空文字 | `xxx...` |
| `SMTP_USE_TLS` | TLS使用フラグ | `true` | `false` |
| `MAIL_FROM` | 送信元メールアドレス | `hi3-ochi@aeondelight.jp` | `noreply@example.com` |
| `MAIL_FROM_NAME` | 送信元表示名 | 空文字 | `勤怠管理システム` |
| `MAIL_COMPANY` | 会社名（メール本文用） | 空文字 | `株式会社Example` |
| `MAIL_DEPARTMENT` | 部署名（メール本文用） | 空文字 | `人事部` |
| `MAIL_SENDER_NAME` | 送信者名（メール本文用） | 空文字 | `山田太郎` |

### CORS設定

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `CORS_ORIGINS` | 許可するオリジン（カンマ区切り） | `http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001` | `https://app.example.com` |

### レート制限設定

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `RATE_LIMIT_ENABLED` | レート制限を有効にするか | `true` | `false` |
| `RATE_LIMIT_REQUESTS` | 1分間あたりの最大リクエスト数 | `100` | `200` |
| `RATE_LIMIT_UPLOAD` | 1分間あたりの最大アップロード数 | `10` | `20` |

---

## フロントエンド環境変数

| 変数名 | 説明 | デフォルト値 | 例 |
|--------|------|-------------|-----|
| `NEXT_PUBLIC_API_BASE` | バックエンドAPIのベースURL | - | `http://127.0.0.1:8000` |

---

## 環境別設定例

### 開発環境 (.env.development)

```env
# バックエンド
OPENAI_API_KEY=sk-xxx...
DATABASE_URL=sqlite:///./data/app.db
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_EMAIL=admin
ADMIN_PASSWORD=admin123!
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
RATE_LIMIT_ENABLED=false

# フロントエンド
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

### 本番環境 (.env.production)

```env
# バックエンド
OPENAI_API_KEY=sk-xxx...
DATABASE_URL=postgresql://user:password@host:5432/ragtesting
SESSION_SECRET_KEY=<ランダムな64文字の文字列>
ENCRYPTION_KEY=<Base64エンコードした32バイトのキー>
ADMIN_BOOTSTRAP_ENABLED=false

# Entra ID認証
ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=xxx...
ENTRA_REDIRECT_URI=https://app.example.com/auth/callback

# CORS (本番ドメインのみ)
CORS_ORIGINS=https://app.example.com

# レート制限
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_UPLOAD=10

# メール
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USERNAME=service@example.com
SMTP_PASSWORD=xxx...
MAIL_FROM=noreply@example.com
MAIL_FROM_NAME=勤怠管理システム

# フロントエンド
NEXT_PUBLIC_API_BASE=https://api.example.com
```

---

## セキュリティ上の注意

1. **シークレットキーの生成**
   ```bash
   # SESSION_SECRET_KEY生成例
   python -c "import secrets; print(secrets.token_hex(32))"

   # ENCRYPTION_KEY生成例（32バイトをBase64エンコード）
   python -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
   ```

2. **本番環境での注意点**
   - `ADMIN_BOOTSTRAP_ENABLED=false` に設定
   - デフォルトの管理者パスワードを変更
   - `CORS_ORIGINS` を本番ドメインのみに制限
   - すべてのシークレットは環境変数またはシークレットマネージャーで管理

3. **.envファイルは必ず.gitignoreに追加**
   ```gitignore
   .env
   .env.local
   .env.production
   ```

---

**作成日**: 2026-02-03
**更新日**: 2026-02-03
