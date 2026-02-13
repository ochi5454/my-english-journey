# OAuth2認証実装リファレンス（AI開発アシスタント用）
## Microsoft Entra ID / Google OAuth2.0 実装ガイド

> **このドキュメントの目的**  
> OAuth2.0（Authorization Code Flow）を使用した認証機能の標準実装パターンを定義します。Microsoft Entra ID（旧Azure AD）とGoogle OAuthの両方をサポートします。コード生成時は、必ずこのガイドに従ってください。

---

## 🎯 アーキテクチャ概要

### OAuth2.0 Authorization Code Flow

```
1. ユーザー → フロントエンド: ログインボタンクリック
2. フロントエンド → 認証プロバイダー: 認証ページへリダイレクト（Client ID、Redirect URI、Scope）
3. 認証プロバイダー → ユーザー: ログイン画面表示
4. ユーザー → 認証プロバイダー: 認証情報入力・同意
5. 認証プロバイダー → バックエンド: 認証コード返却（Redirect URI経由）
6. バックエンド → 認証プロバイダー: トークンリクエスト（認証コード + Client Secret）
7. 認証プロバイダー → バックエンド: アクセストークン + リフレッシュトークン
8. バックエンド → 認証プロバイダー: ユーザー情報取得（アクセストークン）
9. バックエンド → フロントエンド: セッション作成・ログイン完了
```

### システム構成

```
フロントエンド (React/TypeScript)
  ↓ OAuth2リダイレクト
認証プロバイダー (Microsoft Entra ID / Google)
  ↓ 認証コード
バックエンド (FastAPI/Python)
  ↓ トークン交換・ユーザー情報取得
データベース（ユーザー情報保存）
```

---

## 📋 必須環境変数

### Microsoft Entra ID

```env
# Microsoft Entra ID認証
ENTRA_TENANT_ID=<tenant-id-guid>
ENTRA_CLIENT_ID=<client-id-guid>
ENTRA_CLIENT_SECRET=<secret-value>
ENTRA_AUTHORITY=https://login.microsoftonline.com/<tenant-id>
ENTRA_REDIRECT_URI=https://yourapp.com/auth/callback
ENTRA_JWKS_URI=https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys
ENTRA_AUDIENCE=api://<client-id>
```

### Google OAuth

```env
# Google OAuth認証
GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret-value>
GOOGLE_REDIRECT_URI=https://yourapp.com/auth/google/callback
```

### 共通設定

```env
# セッション管理
SESSION_SECRET_KEY=<random-secret-key>
SESSION_COOKIE_NAME=session_id
SESSION_MAX_AGE=86400  # 24時間（秒）

# CORS設定
CORS_ORIGINS=https://yourapp.com,http://localhost:3000
```

---

## 🔐 認証プロバイダー別設定

### Microsoft Entra ID

#### エンドポイント

```python
# 認証エンドポイント
AUTHORIZATION_ENDPOINT = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize"

# トークンエンドポイント
TOKEN_ENDPOINT = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"

# ユーザー情報エンドポイント
USERINFO_ENDPOINT = "https://graph.microsoft.com/v1.0/me"

# JWKS（公開鍵）エンドポイント
JWKS_ENDPOINT = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
```

#### 必須スコープ

```python
SCOPES = [
    "openid",           # 必須：OIDC
    "profile",          # プロフィール情報
    "email",            # メールアドレス
    "User.Read",        # Microsoft Graphユーザー情報
    "offline_access"    # リフレッシュトークン取得
]
```

---

### Google OAuth

#### エンドポイント

```python
# 認証エンドポイント
AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"

# トークンエンドポイント
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

# ユーザー情報エンドポイント
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"
```

#### 必須スコープ

```python
SCOPES = [
    "openid",
    "profile",
    "email"
]
```

---

## 🏗️ 実装パターン

### レイヤー構成

```
Route層（FastAPI）
  ↓ リクエスト処理
Service層（ビジネスロジック）
  ↓ 認証フロー制御
OAuthClient（共通モジュール）
  ↓ トークン交換・ユーザー情報取得
認証プロバイダー（Microsoft/Google）
```

---

## 🔧 バックエンド実装

### OAuthClientベースクラス（共通モジュール）

**配置**：`backend/app/shared/auth/oauth_client.py`

```python
from abc import ABC, abstractmethod
from typing import Dict, Optional
import httpx
from urllib.parse import urlencode

class OAuthClient(ABC):
    """OAuth2.0クライアントの抽象基底クラス"""
    
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
    
    @abstractmethod
    def get_authorization_url(self, state: str) -> str:
        """認証URLを生成"""
        pass
    
    @abstractmethod
    async def exchange_code_for_token(self, code: str) -> Dict:
        """認証コードをアクセストークンに交換"""
        pass
    
    @abstractmethod
    async def get_user_info(self, access_token: str) -> Dict:
        """アクセストークンでユーザー情報を取得"""
        pass
    
    async def refresh_access_token(self, refresh_token: str) -> Dict:
        """リフレッシュトークンで新しいアクセストークンを取得"""
        raise NotImplementedError("Subclass must implement refresh_access_token")
```

---

### Microsoft Entra ID実装

**配置**：`backend/app/shared/auth/entra_oauth_client.py`

```python
import os
from typing import Dict
import httpx
from urllib.parse import urlencode
from .oauth_client import OAuthClient

class EntraOAuthClient(OAuthClient):
    """Microsoft Entra ID OAuth2.0クライアント"""
    
    def __init__(self):
        tenant_id = os.getenv("ENTRA_TENANT_ID")
        client_id = os.getenv("ENTRA_CLIENT_ID")
        client_secret = os.getenv("ENTRA_CLIENT_SECRET")
        redirect_uri = os.getenv("ENTRA_REDIRECT_URI")
        
        super().__init__(client_id, client_secret, redirect_uri)
        
        self.tenant_id = tenant_id
        self.authority = f"https://login.microsoftonline.com/{tenant_id}"
        self.scopes = ["openid", "profile", "email", "User.Read", "offline_access"]
    
    def get_authorization_url(self, state: str) -> str:
        """
        認証URLを生成
        
        Args:
            state: CSRF対策用のランダム文字列
        
        Returns:
            認証URL
        """
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "response_mode": "query",
            "scope": " ".join(self.scopes),
            "state": state
        }
        
        auth_url = f"{self.authority}/oauth2/v2.0/authorize"
        return f"{auth_url}?{urlencode(params)}"
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        """
        認証コードをアクセストークンに交換
        
        Args:
            code: 認証コード
        
        Returns:
            トークンレスポンス（access_token, refresh_token, expires_in等）
        """
        token_url = f"{self.authority}/oauth2/v2.0/token"
        
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
            "scope": " ".join(self.scopes)
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict:
        """
        Microsoft Graphからユーザー情報を取得
        
        Args:
            access_token: アクセストークン
        
        Returns:
            ユーザー情報（id, displayName, mail等）
        """
        graph_url = "https://graph.microsoft.com/v1.0/me"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(graph_url, headers=headers)
            response.raise_for_status()
            return response.json()
    
    async def refresh_access_token(self, refresh_token: str) -> Dict:
        """
        リフレッシュトークンで新しいアクセストークンを取得
        
        Args:
            refresh_token: リフレッシュトークン
        
        Returns:
            新しいトークンレスポンス
        """
        token_url = f"{self.authority}/oauth2/v2.0/token"
        
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": " ".join(self.scopes)
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            return response.json()
```

---

### Google OAuth実装

**配置**：`backend/app/shared/auth/google_oauth_client.py`

```python
import os
from typing import Dict
import httpx
from urllib.parse import urlencode
from .oauth_client import OAuthClient

class GoogleOAuthClient(OAuthClient):
    """Google OAuth2.0クライアント"""
    
    def __init__(self):
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
        
        super().__init__(client_id, client_secret, redirect_uri)
        
        self.scopes = ["openid", "profile", "email"]
    
    def get_authorization_url(self, state: str) -> str:
        """認証URLを生成"""
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(self.scopes),
            "state": state,
            "access_type": "offline",  # リフレッシュトークン取得
            "prompt": "consent"         # 常に同意画面表示
        }
        
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        return f"{auth_url}?{urlencode(params)}"
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        """認証コードをアクセストークンに交換"""
        token_url = "https://oauth2.googleapis.com/token"
        
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict:
        """Googleからユーザー情報を取得"""
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(userinfo_url, headers=headers)
            response.raise_for_status()
            return response.json()
    
    async def refresh_access_token(self, refresh_token: str) -> Dict:
        """リフレッシュトークンで新しいアクセストークンを取得"""
        token_url = "https://oauth2.googleapis.com/token"
        
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            return response.json()
```

---

### AuthService層

**配置**：`backend/app/features/auth/service.py`

```python
import secrets
from typing import Dict, Optional
from datetime import datetime, timedelta
from app.shared.auth.oauth_client import OAuthClient
from .repository import UserRepository
from .models import User

class AuthService:
    """認証サービス"""
    
    def __init__(
        self,
        oauth_client: OAuthClient,
        user_repository: UserRepository
    ):
        self.oauth_client = oauth_client
        self.user_repository = user_repository
    
    def generate_state(self) -> str:
        """CSRF対策用のstateを生成"""
        return secrets.token_urlsafe(32)
    
    def get_login_url(self, state: str) -> str:
        """ログインURLを生成"""
        return self.oauth_client.get_authorization_url(state)
    
    async def handle_callback(self, code: str, state: str, saved_state: str) -> User:
        """
        認証コールバックを処理
        
        Args:
            code: 認証コード
            state: 受信したstate
            saved_state: セッションに保存したstate
        
        Returns:
            ユーザー情報
        
        Raises:
            ValueError: state検証失敗
        """
        # 1. state検証（CSRF対策）
        if state != saved_state:
            raise ValueError("State mismatch: CSRF attack detected")
        
        # 2. 認証コードをトークンに交換
        token_response = await self.oauth_client.exchange_code_for_token(code)
        access_token = token_response["access_token"]
        refresh_token = token_response.get("refresh_token")
        expires_in = token_response.get("expires_in", 3600)
        
        # 3. ユーザー情報を取得
        user_info = await self.oauth_client.get_user_info(access_token)
        
        # 4. ユーザーをDB保存/更新
        user = await self._save_or_update_user(
            user_info=user_info,
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in
        )
        
        return user
    
    async def _save_or_update_user(
        self,
        user_info: Dict,
        access_token: str,
        refresh_token: Optional[str],
        expires_in: int
    ) -> User:
        """
        ユーザー情報を保存または更新
        
        Args:
            user_info: 認証プロバイダーから取得したユーザー情報
            access_token: アクセストークン
            refresh_token: リフレッシュトークン
            expires_in: トークン有効期限（秒）
        
        Returns:
            Userモデル
        """
        # プロバイダー固有のID取得
        provider_user_id = user_info.get("id") or user_info.get("sub")
        email = user_info.get("mail") or user_info.get("email")
        name = user_info.get("displayName") or user_info.get("name")
        
        # トークン有効期限計算
        token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        
        # 既存ユーザー確認
        user = await self.user_repository.find_by_provider_id(provider_user_id)
        
        if user:
            # 更新
            user.access_token = access_token
            user.refresh_token = refresh_token
            user.token_expires_at = token_expires_at
            user.last_login_at = datetime.utcnow()
            await self.user_repository.update(user)
        else:
            # 新規作成
            user = User(
                provider_user_id=provider_user_id,
                email=email,
                name=name,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                last_login_at=datetime.utcnow()
            )
            await self.user_repository.save(user)
        
        return user
    
    async def refresh_token_if_needed(self, user: User) -> User:
        """
        必要に応じてトークンをリフレッシュ
        
        Args:
            user: ユーザー
        
        Returns:
            更新されたユーザー
        """
        # トークンの有効期限チェック（5分前にリフレッシュ）
        if user.token_expires_at > datetime.utcnow() + timedelta(minutes=5):
            return user
        
        # リフレッシュトークンがない場合は再ログイン必要
        if not user.refresh_token:
            raise ValueError("No refresh token available")
        
        # トークンリフレッシュ
        token_response = await self.oauth_client.refresh_access_token(user.refresh_token)
        
        user.access_token = token_response["access_token"]
        user.refresh_token = token_response.get("refresh_token", user.refresh_token)
        user.token_expires_at = datetime.utcnow() + timedelta(
            seconds=token_response.get("expires_in", 3600)
        )
        
        await self.user_repository.update(user)
        
        return user
```

---

### Route層

**配置**：`backend/app/features/auth/route.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from app.shared.auth.entra_oauth_client import EntraOAuthClient
from app.shared.auth.google_oauth_client import GoogleOAuthClient
from .service import AuthService
from .repository import UserRepository

router = APIRouter(prefix="/auth", tags=["authentication"])

# 依存性注入
def get_user_repository() -> UserRepository:
    # DB接続を取得してRepositoryを返す
    return UserRepository(db=get_db())

def get_entra_auth_service(
    repo: UserRepository = Depends(get_user_repository)
) -> AuthService:
    return AuthService(oauth_client=EntraOAuthClient(), user_repository=repo)

def get_google_auth_service(
    repo: UserRepository = Depends(get_user_repository)
) -> AuthService:
    return AuthService(oauth_client=GoogleOAuthClient(), user_repository=repo)

# Microsoft Entra IDログイン
@router.get("/login/microsoft")
async def login_microsoft(
    request: Request,
    service: AuthService = Depends(get_entra_auth_service)
):
    """
    Microsoft Entra IDログイン開始
    
    Returns:
        認証プロバイダーへのリダイレクト
    """
    # stateを生成してセッションに保存
    state = service.generate_state()
    request.session["oauth_state"] = state
    
    # 認証URLへリダイレクト
    login_url = service.get_login_url(state)
    return RedirectResponse(url=login_url)

# Microsoft Entra IDコールバック
@router.get("/callback/microsoft")
async def callback_microsoft(
    request: Request,
    code: str,
    state: str,
    service: AuthService = Depends(get_entra_auth_service)
):
    """
    Microsoft Entra IDコールバック
    
    Args:
        code: 認証コード
        state: CSRF対策用state
    
    Returns:
        ログイン成功後のリダイレクト
    """
    # セッションからstateを取得
    saved_state = request.session.get("oauth_state")
    if not saved_state:
        raise HTTPException(status_code=400, detail="No state in session")
    
    try:
        # 認証処理
        user = await service.handle_callback(code, state, saved_state)
        
        # セッションにユーザーIDを保存
        request.session["user_id"] = user.id
        request.session.pop("oauth_state", None)
        
        # フロントエンドにリダイレクト
        return RedirectResponse(url="/dashboard")
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Authentication failed")

# Googleログイン
@router.get("/login/google")
async def login_google(
    request: Request,
    service: AuthService = Depends(get_google_auth_service)
):
    """Googleログイン開始"""
    state = service.generate_state()
    request.session["oauth_state"] = state
    
    login_url = service.get_login_url(state)
    return RedirectResponse(url=login_url)

# Googleコールバック
@router.get("/callback/google")
async def callback_google(
    request: Request,
    code: str,
    state: str,
    service: AuthService = Depends(get_google_auth_service)
):
    """Googleコールバック"""
    saved_state = request.session.get("oauth_state")
    if not saved_state:
        raise HTTPException(status_code=400, detail="No state in session")
    
    try:
        user = await service.handle_callback(code, state, saved_state)
        request.session["user_id"] = user.id
        request.session.pop("oauth_state", None)
        
        return RedirectResponse(url="/dashboard")
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Authentication failed")

# ログアウト
@router.post("/logout")
async def logout(request: Request):
    """ログアウト"""
    request.session.clear()
    return {"message": "Logged out successfully"}

# 現在のユーザー情報取得
@router.get("/me")
async def get_current_user(
    request: Request,
    repo: UserRepository = Depends(get_user_repository)
):
    """現在ログイン中のユーザー情報を取得"""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user = await repo.find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email
    }
```

---

## 🎨 フロントエンド実装

### ログインボタンコンポーネント

**配置**：`frontend/src/features/auth/components/LoginButtons.tsx`

```typescript
import React from 'react';

export function LoginButtons() {
  const handleMicrosoftLogin = () => {
    // バックエンドのログインエンドポイントにリダイレクト
    window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/login/microsoft`;
  };
  
  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/login/google`;
  };
  
  return (
    <div className="login-container">
      <h1>ログイン</h1>
      
      <button onClick={handleMicrosoftLogin} className="btn-microsoft">
        <span className="icon">🔷</span>
        Microsoftでログイン
      </button>
      
      <button onClick={handleGoogleLogin} className="btn-google">
        <span className="icon">🔵</span>
        Googleでログイン
      </button>
    </div>
  );
}
```

---

### 認証コンテキスト

**配置**：`frontend/src/features/auth/context/AuthContext.tsx`

```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchCurrentUser();
  }, []);
  
  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_BASE_URL}/auth/me`,
        { withCredentials: true }
      );
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };
  
  const logout = async () => {
    try {
      await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/auth/logout`,
        {},
        { withCredentials: true }
      );
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

---

### 保護されたルート

**配置**：`frontend/src/features/auth/components/ProtectedRoute.tsx`

```typescript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}
```

---

## 🔐 セキュリティ実装

### CSRF対策（State検証）

**必須実装**：

```python
# 生成時
state = secrets.token_urlsafe(32)
session["oauth_state"] = state

# 検証時
if received_state != session.get("oauth_state"):
    raise ValueError("CSRF attack detected")
```

---

### Client Secretの保護

**絶対に守るべきルール**：

```python
# ✅ 正しい
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

# ❌ 絶対にNG
CLIENT_SECRET = "hardcoded_secret"

# ❌ 絶対にNG（フロントエンドに露出）
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
```

**重要**：
- Client Secretは**バックエンドのみ**で使用
- 環境変数から取得
- フロントエンドには絶対に送信しない

---

### トークンの保存

| 保存場所 | 推奨 | 理由 |
|---|---|---|
| **サーバーサイドセッション** | ✅ | 最も安全 |
| **HttpOnly Cookie** | ✅ | XSS攻撃に強い |
| **LocalStorage** | ❌ | XSS攻撃に弱い |
| **SessionStorage** | △ | タブを閉じると消える |

**推奨実装**：

```python
# FastAPI セッション設定
from starlette.middleware.sessions import SessionMiddleware

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET_KEY"),
    session_cookie="session_id",
    max_age=86400,  # 24時間
    same_site="lax",
    https_only=True  # 本番環境
)
```

---

### HTTPS強制

**本番環境では必須**：

```python
# ✅ 本番環境
ENTRA_REDIRECT_URI = "https://yourapp.com/auth/callback"

# ⚠️ 開発環境のみOK
ENTRA_REDIRECT_URI = "http://localhost:3000/auth/callback"
```

---

## ❌ 絶対に生成してはいけないパターン

### 1. Client Secretのフロントエンド露出

```typescript
// ❌ 絶対にNG
const CLIENT_SECRET = "abc123secret";

// ❌ 絶対にNG
const response = await fetch(TOKEN_ENDPOINT, {
  body: JSON.stringify({
    client_secret: CLIENT_SECRET  // フロントエンドで使用
  })
});
```

---

### 2. State検証の省略

```python
# ❌ 絶対にNG（CSRF脆弱性）
async def callback(code: str):
    # state検証なし
    token = await exchange_code(code)
    return token

# ✅ 正しい
async def callback(code: str, state: str, session):
    saved_state = session.get("oauth_state")
    if state != saved_state:
        raise ValueError("CSRF attack")
```

---

### 3. トークンのLocalStorage保存

```typescript
// ❌ 絶対にNG
localStorage.setItem('access_token', token);

// ✅ 正しい（サーバーサイドセッション）
// バックエンドがセッションCookieを設定
```

---

### 4. HTTPでのリダイレクトURI（本番環境）

```python
# ❌ 本番環境でNG
REDIRECT_URI = "http://yourapp.com/callback"

# ✅ 正しい
REDIRECT_URI = "https://yourapp.com/callback"
```

---

### 5. エラー情報の詳細露出

```python
# ❌ 絶対にNG
except Exception as e:
    return {"error": str(e)}  # 内部情報が漏洩

# ✅ 正しい
except Exception as e:
    logger.error(f"Auth error: {e}")
    raise HTTPException(status_code=500, detail="Authentication failed")
```

---

## ✅ 実装チェックリスト

### 環境変数

- [ ] `CLIENT_ID`が設定されている
- [ ] `CLIENT_SECRET`が設定されている（バックエンドのみ）
- [ ] `REDIRECT_URI`が設定されている
- [ ] `TENANT_ID`が設定されている（Entra IDの場合）
- [ ] すべての環境変数が`.env`に保存され、`.gitignore`に追加されている

### バックエンド

- [ ] OAuthClientが実装されている
- [ ] State生成・検証が実装されている
- [ ] トークン交換ロジックが実装されている
- [ ] ユーザー情報取得ロジックが実装されている
- [ ] リフレッシュトークン対応が実装されている
- [ ] セッション管理が実装されている
- [ ] エラーハンドリングが実装されている

### フロントエンド

- [ ] ログインボタンが実装されている
- [ ] 認証コンテキストが実装されている
- [ ] 保護されたルートが実装されている
- [ ] ログアウト機能が実装されている

### セキュリティ

- [ ] CSRF対策（State検証）が実装されている
- [ ] Client Secretがバックエンドのみで使用されている
- [ ] トークンがサーバーサイドセッションに保存されている
- [ ] 本番環境でHTTPSを使用している
- [ ] エラーメッセージが適切に処理されている

---

## 📊 エラーハンドリング

### OAuth2エラーレスポンス

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired",
  "error_uri": "https://..."
}
```

### 主要エラーコード

| エラーコード | 原因 | 対処法 |
|---|---|---|
| `invalid_request` | リクエストパラメータ不正 | パラメータを確認 |
| `invalid_client` | Client ID/Secret不正 | 認証情報を確認 |
| `invalid_grant` | 認証コード無効/期限切れ | ユーザーに再ログイン要求 |
| `unauthorized_client` | クライアントが未承認 | アプリ登録を確認 |
| `unsupported_grant_type` | grant_typeが不正 | `authorization_code`を使用 |
| `invalid_scope` | スコープが不正 | 登録済みスコープを確認 |

---

## 🔍 トークンリフレッシュパターン

```python
async def make_authenticated_request(user: User, service: AuthService):
    """
    認証済みリクエスト（自動トークンリフレッシュ付き）
    """
    # トークン有効期限チェック＆リフレッシュ
    user = await service.refresh_token_if_needed(user)
    
    # APIリクエスト
    headers = {"Authorization": f"Bearer {user.access_token}"}
    async with httpx.AsyncClient() as client:
        response = await client.get(API_URL, headers=headers)
        return response.json()
```

---

**このガイドに従って、安全で一貫性のあるOAuth2認証機能を実装してください。**
