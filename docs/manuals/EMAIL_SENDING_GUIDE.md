# Microsoft Entra を使ったメール送信ガイド

**作成日**: 2026年2月5日
**プロジェクト**: ScheduleHub
**対象**: メール送信機能の実装・利用方法

---

## 概要

このシステムでは、Microsoft Entra ID（旧 Azure AD）と Microsoft Graph API を使用して、ユーザーの Outlook アカウントからメールを送信します。

### システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                    ScheduleHub Backend                       │
│                                                             │
│   [ミーティング作成] → [email_service.py] → [Graph API]    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Microsoft Graph API                            │
│                                                             │
│   POST /v1.0/me/sendMail                                    │
│   → 認証ユーザーのメールアドレスから送信                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 前提条件

1. **Azure Portal での設定が完了していること**
   - 詳細: [OAUTH_MICROSOFT.md](../setup/OAUTH_MICROSOFT.md)

2. **Mail.Send 権限が付与されていること**
   - Azure Portal > アプリの登録 > API のアクセス許可
   - `Mail.Send`（委任されたアクセス許可）が必要

3. **環境変数の設定**
   ```bash
   # backend/.env
   OUTLOOK_SCOPE=openid email profile offline_access User.Read Calendars.Read Calendars.ReadWrite Mail.Send
   ```

---

## 送信者メールアドレスの取得方法

### 仕組み

送信者のメールアドレスは、OAuth 認証時に Microsoft から取得され、データベースに保存されます。

```
[ユーザーが Outlook 接続]
    ↓
[Microsoft 認証画面でログイン]
    ↓
[Graph API: /me からユーザー情報取得]
    ↓
[provider_email として DB に保存]
```

### データベースの保存先

**テーブル**: `user_connections`

| カラム名 | 説明 |
|----------|------|
| `user_id` | ユーザーID |
| `provider` | `"outlook"` |
| `provider_email` | **送信者のメールアドレス** |
| `access_token` | 暗号化されたアクセストークン |
| `refresh_token` | 暗号化されたリフレッシュトークン |

### コードでの取得方法

```python
from backend.services.auth import get_user_connection

# ユーザーの Outlook 接続情報を取得
connection = get_user_connection(db, user_id, "outlook")

if connection:
    sender_email = connection.provider_email
    print(f"送信者メールアドレス: {sender_email}")
else:
    print("Outlook が接続されていません")
```

**ファイル**: [backend/services/auth.py](../../backend/services/auth.py) - `get_user_connection()` 関数

---

## メール送信の実装方法

### 基本的なメール送信

**ファイル**: [backend/services/email_service.py](../../backend/services/email_service.py)

```python
from backend.services.email_service import send_email_via_graph

# メール送信
success = send_email_via_graph(
    db=db,                          # データベースセッション
    user_id=sender_user_id,         # 送信者のユーザーID
    to_email="recipient@example.com",  # 宛先
    subject="件名",                 # 件名
    body_html="<p>本文（HTML形式）</p>"  # 本文
)

if success:
    print("メール送信成功")
else:
    print("メール送信失敗")
```

### 送信処理の内部フロー

```
1. user_id から Outlook 接続情報を取得
    ↓
2. アクセストークンの有効性を確認
   - 期限切れの場合は自動でリフレッシュ
    ↓
3. Microsoft Graph API にリクエスト
   POST https://graph.microsoft.com/v1.0/me/sendMail
    ↓
4. 結果を返却（HTTP 202 = 成功）
```

### Graph API リクエスト形式

```python
# 実際に送信されるリクエスト
email_message = {
    "message": {
        "subject": "件名",
        "body": {
            "contentType": "HTML",
            "content": "<p>本文</p>"
        },
        "toRecipients": [
            {
                "emailAddress": {
                    "address": "recipient@example.com"
                }
            }
        ]
    },
    "saveToSentItems": "true"  # 送信済みフォルダに保存
}

# API エンドポイント
POST https://graph.microsoft.com/v1.0/me/sendMail
Authorization: Bearer {access_token}
Content-Type: application/json
```

---

## 利用可能なメール送信関数

### 1. 基本メール送信

```python
send_email_via_graph(db, user_id, to_email, subject, body_html, body_text=None)
```

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| db | Session | データベースセッション |
| user_id | int | 送信者のユーザーID |
| to_email | str | 宛先メールアドレス |
| subject | str | 件名 |
| body_html | str | HTML形式の本文 |
| body_text | str (optional) | プレーンテキスト本文（ログ用） |

### 2. ミーティング通知メール

```python
send_meeting_notification(
    db, sender_user_id, to_email, to_name,
    meeting_title, meeting_date, meeting_start_time, meeting_end_time,
    meeting_location, meeting_description,
    organizer_name, participant_names, app_url=None
)
```

- 件名: `【ミーティング通知】{meeting_title}`
- スタイル付き HTML テンプレート使用

### 3. ミーティングキャンセル通知

```python
send_meeting_cancellation(
    db, sender_user_id, to_email, to_name,
    meeting_title, meeting_date, meeting_start_time, meeting_end_time,
    meeting_location, organizer_name,
    cancellation_reason=None, app_url=None
)
```

- 件名: `【キャンセル】{meeting_title}`
- キャンセル理由を含めることが可能

### 4. ミーティング変更通知

```python
send_meeting_update(
    db, sender_user_id, to_email, to_name,
    meeting_title, meeting_date, meeting_start_time, meeting_end_time,
    meeting_location, meeting_description,
    organizer_name, participant_names,
    custom_email_content=None, app_url=None
)
```

- 件名: `【変更】{meeting_title}`
- カスタムメール内容を指定可能

---

## Outlook 接続の確認方法

### コードでの確認

```python
from backend.services.email_service import has_outlook_connection

# ユーザーが Outlook 接続済みか確認
if has_outlook_connection(db, user_id):
    print("Outlook 接続済み - メール送信可能")
else:
    print("Outlook 未接続 - メール送信不可")
```

### API での確認

```bash
# 接続情報を取得
curl http://localhost:8001/auth/connections \
  -H "Cookie: access_token=YOUR_JWT_TOKEN"
```

レスポンス例:
```json
{
  "connections": [
    {
      "provider": "outlook",
      "provider_email": "user@example.com",
      "connected_at": "2026-02-05T10:00:00Z"
    }
  ]
}
```

---

## トークンの自動更新

アクセストークンは通常1時間で期限切れになります。このシステムでは自動更新機能が実装されています。

### 仕組み

```python
# backend/services/token_refresh.py

def get_valid_access_token(db, user_id, provider):
    """
    有効なアクセストークンを取得
    - 期限切れの場合は自動でリフレッシュ
    - 5分のバッファを設けて事前更新
    """
    connection = get_user_connection(db, user_id, provider)

    if is_token_expired(connection):
        # リフレッシュトークンで新しいアクセストークンを取得
        return refresh_outlook_token(db, connection)
    else:
        return decrypt_access_token(connection)
```

詳細: [TOKEN_REFRESH.md](../technical/TOKEN_REFRESH.md)

---

## 実装例: ミーティング作成時のメール送信

```python
# backend/services/scheduler_service.py より

# ミーティング作成後、参加者全員にメールを送信
for user_id in participant_user_ids:
    user = get_user_by_id(db, user_id)

    if user and user.email:
        send_meeting_notification(
            db=db,
            sender_user_id=organizer.id,    # 主催者から送信
            to_email=user.email,            # 参加者へ
            to_name=user.name,
            meeting_title=proposal.title,
            meeting_date=meeting_date,
            meeting_start_time=start_time,
            meeting_end_time=end_time,
            meeting_location=proposal.location,
            meeting_description=email_content,
            organizer_name=organizer.name,
            participant_names=all_participant_names
        )
```

---

## エラーハンドリング

### 送信失敗時のログ

```
❌ Failed to send email. Status: 401
   Response: {"error": {"code": "InvalidAuthenticationToken", ...}}
```

### よくあるエラーと対処法

| エラー | 原因 | 対処法 |
|--------|------|--------|
| `InvalidAuthenticationToken` | トークン期限切れ | 自動更新されるはず。されない場合は再接続 |
| `MailboxNotEnabledForRESTAPI` | メールボックスが無効 | Exchange Online ライセンスを確認 |
| `ErrorAccessDenied` | Mail.Send 権限なし | Azure Portal で権限を追加 |
| `No valid Outlook connection` | Outlook 未接続 | ユーザーに Outlook 接続を促す |

---

## セキュリティ考慮事項

1. **トークンの暗号化**
   - アクセストークン・リフレッシュトークンは Fernet 暗号化で保存
   - 環境変数 `ENCRYPTION_KEY` で暗号化キーを管理

2. **委任されたアクセス許可**
   - アプリケーション権限ではなく、ユーザーに委任された権限を使用
   - ユーザーが明示的に許可したスコープのみ使用可能

3. **送信元の信頼性**
   - `/me/sendMail` エンドポイントを使用
   - 送信者は必ず認証されたユーザーのメールアドレス

---

## 関連ドキュメント

- [OAUTH_MICROSOFT.md](../setup/OAUTH_MICROSOFT.md) - Azure Portal 設定手順
- [TOKEN_REFRESH.md](../technical/TOKEN_REFRESH.md) - トークン自動更新機能
- [AUTHENTICATION_FLOW.md](../technical/AUTHENTICATION_FLOW.md) - 認証フローの詳細

### 外部リソース

- [Microsoft Graph API - メール送信](https://learn.microsoft.com/ja-jp/graph/api/user-sendmail)
- [Mail.Send 権限について](https://learn.microsoft.com/ja-jp/graph/permissions-reference#mail-permissions)

---

**作成日**: 2026年2月5日
**バージョン**: 1.0
**作成者**: Claude Code
