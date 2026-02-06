# MS Entra ID 認証実装設計書

## 1. 概要

### 1.1 目的
PROTHENTIA案件管理システムにMicrosoft Entra ID（旧Azure AD）による認証機能を実装し、組織のシングルサインオン（SSO）環境と統合する。

### 1.2 認証フロー
OAuth 2.0 Authorization Code Flow with PKCE（Proof Key for Code Exchange）を採用し、セキュアなトークンベース認証を実現する。

### 1.3 スコープ
- フロントエンド（React）：MSAL.js v3を使用したMS Entra ID認証
- バックエンド（FastAPI）：JWTトークン検証とロールベースアクセス制御（RBAC）
- セッション管理：トークンベース（Cookieレス）

---

## 2. アーキテクチャ

### 2.1 認証フロー図

```
┌─────────────┐                    ┌──────────────────┐                  ┌─────────────┐
│   Browser   │                    │   Entra ID       │                  │  FastAPI    │
│  (React +   │                    │  (Microsoft)     │                  │  Backend    │
│   MSAL.js)  │                    │                  │                  │             │
└──────┬──────┘                    └────────┬─────────┘                  └──────┬──────┘
       │                                    │                                   │
       │  1. Login Request                  │                                   │
       ├────────────────────────────────────>                                   │
       │                                    │                                   │
       │  2. Redirect to Login Page         │                                   │
       <────────────────────────────────────┤                                   │
       │                                    │                                   │
       │  3. User Login                     │                                   │
       ├────────────────────────────────────>                                   │
       │                                    │                                   │
       │  4. Authorization Code             │                                   │
       <────────────────────────────────────┤                                   │
       │                                    │                                   │
       │  5. Exchange Code for Tokens       │                                   │
       ├────────────────────────────────────>                                   │
       │                                    │                                   │
       │  6. ID Token + Access Token        │                                   │
       <────────────────────────────────────┤                                   │
       │                                    │                                   │
       │  7. API Request + Bearer Token     │                                   │
       ├───────────────────────────────────────────────────────────────────────>│
       │                                    │                                   │
       │                                    │  8. Validate Token                │
       │                                    <───────────────────────────────────┤
       │                                    │                                   │
       │                                    │  9. User Info + Claims            │
       │                                    ├───────────────────────────────────>│
       │                                    │                                   │
       │  10. API Response                  │                                   │
       <───────────────────────────────────────────────────────────────────────┤
       │                                    │                                   │
```

### 2.2 コンポーネント構成

```
frontend/
├── src/
│   ├── auth/
│   │   ├── authConfig.ts          # MSAL設定
│   │   ├── AuthProvider.tsx       # 認証コンテキストプロバイダー
│   │   └── ProtectedRoute.tsx     # 認証が必要なルート
│   ├── api/
│   │   └── api.ts                 # 修正: トークンをヘッダーに付与
│   └── App.tsx                    # 修正: MsalProviderでラップ

backend/
├── app/
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── jwt_validator.py       # JWTトークン検証
│   │   ├── dependencies.py        # FastAPI依存性
│   │   └── roles.py               # ロール定義とRBAC
│   ├── models/
│   │   └── models.py              # 修正: Userテーブル追加
│   └── main.py                    # 修正: 認証ミドルウェア追加
```

---

## 3. MS Entra ID 設定

### 3.1 アプリケーション登録

#### 3.1.1 Azure Portal での設定手順

1. **Azure Portal にアクセス**
   - https://portal.azure.com にアクセス
   - Microsoft Entra ID を選択

2. **アプリケーションの登録**
   - 「アプリの登録」→「新規登録」
   - アプリケーション名: `PROTHENTIA 案件管理システム`
   - サポートされているアカウントの種類: `この組織ディレクトリのみのアカウント（PROTHENTIA のみ - シングル テナント）`
   - リダイレクト URI:
     - プラットフォーム: `シングルページアプリケーション (SPA)`
     - URI: `http://localhost:5173/` (開発環境)
     - URI: `https://prothentia.com/hr-agent/` (本番環境)

3. **アプリケーション ID の確認**
   - 登録後に表示される「アプリケーション (クライアント) ID」をメモ
   - 「ディレクトリ (テナント) ID」もメモ

#### 3.1.2 API アクセス許可の設定

1. **API のアクセス許可** セクションで「アクセス許可の追加」
2. **Microsoft Graph** を選択
3. **委任されたアクセス許可** を選択
4. 以下のアクセス許可を追加:

**基本認証権限:**
   - `User.Read` - サインインとユーザープロファイルの読み取り
   - `email` - メールアドレスの取得
   - `profile` - 基本プロファイル情報の取得
   - `openid` - OpenID Connect サインイン

**カレンダー・メール統合権限（面談設定機能用）:**
   - `Mail.Send` - ユーザーに代わってメールを送信（面談招待メール送信）【委任されたアクセス許可】

4. **アプリケーションの許可** を選択（他ユーザーのカレンダーアクセス用）
5. 以下のアクセス許可を追加:

**カレンダー権限（アプリケーション権限 - 他ユーザーのカレンダーアクセス用）:**
   - `Calendars.Read` - 全ユーザーのカレンダーを読み取る（面接官の空き時間確認）
   - `Calendars.ReadWrite` - 全ユーザーのカレンダーイベントを作成・更新（面談イベント作成）

**⚠️ 重要**: `Calendars.Read` と `Calendars.ReadWrite` は**アプリケーション権限**として追加する必要があります。
委任されたアクセス許可（Delegated）ではログインユーザー自身のカレンダーにしかアクセスできません。
面接官（他のユーザー）のカレンダーにアクセスするには、アプリケーション権限（Application）が必要です。

**ユーザー検索権限（面接官選択機能用）:**
   - `User.Read.All` - テナント内の全ユーザーを検索・取得（Azure ADユーザーを面接官として選択）

6. **管理者の同意を付与** をクリック

#### 3.1.3 クライアントシークレットの作成（必須）

アプリケーション権限（Calendars.Read, Calendars.ReadWrite）を使用するには、**クライアントシークレット**が必要です。
これにより、バックエンドがClient Credentials Flowを使用して、他ユーザーのカレンダーにアクセスできるようになります。

##### クライアントシークレットの作成手順

1. **Azure Portal** (https://portal.azure.com) にアクセス
2. **Microsoft Entra ID** → **アプリの登録** → 対象アプリを選択
3. 左メニューから **「証明書とシークレット」** をクリック
4. **「+ 新しいクライアント シークレット」** をクリック
5. 以下を設定:
   - **説明**: `Backend API Secret`（任意の名前）
   - **有効期限**: 24か月（推奨）
6. **「追加」** をクリック

**⚠️ 重要**: 作成直後に表示される **「値」** を必ずコピーしてください！
この値は一度しか表示されません。後から確認することはできません。

| 項目 | 説明 | 例 |
|------|------|-----|
| **値 (Value)** | クライアントシークレットの値（.envに設定） | `D5G8Q~NmaCPuXMba9...` |
| **シークレット ID** | シークレットの識別子（参照用、.envには不要） | `9ddd1e72-7eb3-41f1-...` |

##### バックエンド環境変数への設定

コピーした「値」を `backend/.env` に追加してください:

```bash
# Microsoft Entra ID Authentication
ENTRA_TENANT_ID=your_tenant_id_here
ENTRA_CLIENT_ID=your_client_id_here
ENTRA_CLIENT_SECRET=D5G8Q~NmaCPuXMba9...  # ← ここに「値」を設定
```

##### クライアントシークレットが必要な理由

| 認証フロー | トークンの取得元 | アクセス範囲 |
|-----------|----------------|-------------|
| **委任されたアクセス許可 (Delegated)** | フロントエンド（MSAL.js） | ログインユーザー自身のリソースのみ |
| **アプリケーション権限 (Application)** | バックエンド（Client Credentials Flow） | テナント内の全ユーザーのリソース |

カレンダー操作は、ログインユーザー以外のユーザー（面接官）のカレンダーにアクセスする必要があるため、
バックエンドでClient Credentials Flowを使用して、アプリケーション自身のトークンを取得します。

#### 3.1.4 管理者の同意について

**重要**: カレンダー・メール統合機能を使用するには、以下の権限について**管理者の同意(Admin Consent)**が必要です。

##### 管理者の同意が必要な権限

以下の権限は、組織のセキュリティ保護のため、管理者の承認が必要です:

**委任されたアクセス許可（Delegated）:**
| 権限名 | 理由 | 用途 |
|--------|------|------|
| `offline_access` | リフレッシュトークンの取得（自動トークン更新） | ユーザーが毎回ログインし直さなくても、バックグラウンドでトークンを自動更新できるようにする |
| `Mail.Send` | ユーザーに代わってメールを送信 | 面談招待メールやリマインダーメールを自動送信する |
| `User.Read.All` | テナント内の全ユーザーを検索・取得 | Azure ADユーザーを面接官として検索・選択できるようにする |

**アプリケーション権限（Application）:**
| 権限名 | 理由 | 用途 |
|--------|------|------|
| `Calendars.Read` | 全ユーザーのカレンダーを読み取る | 面接官（他ユーザー）の空き時間を確認して、面談のダブルブッキングを防ぐ |
| `Calendars.ReadWrite` | 全ユーザーのカレンダーイベントを作成・更新 | 面談確定時に面接官のOutlookカレンダーに予定を自動で追加する |

**⚠️ なぜアプリケーション権限が必要か:**
- 委任されたアクセス許可（Delegated）は、ログインユーザー自身のリソースにのみアクセスできます
- 面接官選択機能では、ログインユーザー以外のユーザー（面接官）のカレンダーにアクセスする必要があります
- そのため、`Calendars.Read` と `Calendars.ReadWrite` はアプリケーション権限として設定する必要があります

**基本認証権限**（`User.Read`, `email`, `profile`, `openid`）は管理者の同意は不要です。

##### 管理者の同意を付与する方法

###### 方法1: Azure Portal から付与

1. **Azure Portal** (https://portal.azure.com) にアクセス
2. **Microsoft Entra ID** → **アプリの登録** → 対象アプリを選択
3. **APIのアクセス許可** セクションを開く
4. **"{組織名} に管理者の同意を与えます"** ボタンをクリック
5. 確認ダイアログで **"はい"** をクリック

**必要な役割**:
- グローバル管理者 (Global Administrator)
- アプリケーション管理者 (Application Administrator)

###### 方法2: 管理者同意URLを使用

管理者に以下のURLを共有して、ブラウザでアクセスしてもらうことで同意を付与できます:

```
https://login.microsoftonline.com/{TENANT_ID}/adminconsent?client_id={CLIENT_ID}
```

**実際のURL** (このアプリケーション用):
```
https://login.microsoftonline.com/febf07b6-5e9e-4ff8-ad73-25df1c2ff94c/adminconsent?client_id=93d49b59-f3a8-40fe-a9ec-a8f1424f17f9
```

管理者がこのURLにアクセスすると:
1. Microsoftのログイン画面が表示される
2. 管理者権限でログイン
3. アプリケーションが要求している権限のリストが表示される
4. **"承認"** をクリックすると、組織全体に対して権限が付与される

##### 管理者権限を持っていない場合

もしあなたが管理者権限を持っていない場合:

1. **上記の管理者同意URLを上司またはIT管理者に共有**
2. 以下の情報を伝える:
   - **アプリケーション名**: PROTHENTIA 案件管理システム
   - **必要な理由**: Outlookカレンダーとの連携により、面談スケジュール管理を自動化するため
   - **要求される権限（委任されたアクセス許可）**:
     - `offline_access` - 自動ログイン維持
     - `Mail.Send` - 面談招待メールの自動送信
     - `User.Read.All` - Azure ADユーザーの検索
   - **要求される権限（アプリケーション権限）**:
     - `Calendars.Read` - 面接官の空き時間確認（他ユーザーのカレンダーアクセス）
     - `Calendars.ReadWrite` - 面談予定の自動登録（他ユーザーのカレンダーへの書き込み）

##### 管理者の同意なしでできること・できないこと

| 機能 | 管理者の同意なし | 管理者の同意あり |
|------|----------------|----------------|
| ログイン・認証 | ✅ 可能 | ✅ 可能 |
| ユーザー情報の取得 | ✅ 可能 | ✅ 可能 |
| 基本的な案件管理機能 | ✅ 可能 | ✅ 可能 |
| 面接官の空き時間確認 | ❌ 不可 | ✅ 可能 |
| カレンダーへの面談予定追加 | ❌ 不可 | ✅ 可能 |
| 面談招待メールの自動送信 | ❌ 不可 | ✅ 可能 |
| リフレッシュトークン（自動ログイン維持） | ❌ 不可 | ✅ 可能 |
| Azure ADユーザーを面接官として検索 | ❌ 不可 | ✅ 可能 |

##### トラブルシューティング

**エラー: "AADSTS65001: The user or administrator has not consented"**
- **原因**: 管理者の同意が付与されていない
- **解決策**: 上記の方法1または方法2で管理者の同意を付与する

**エラー: "Need admin approval" とログイン画面に表示される**
- **原因**: `authConfig.ts` で管理者同意が必要な権限をリクエストしているが、まだ承認されていない
- **一時的な回避策**: 該当する権限を `authConfig.ts` からコメントアウトする（基本機能は使用可能）
- **恒久的な解決策**: 管理者に同意を付与してもらう

**"Grant admin consent" ボタンがグレーアウトしている**
- **原因**: ログインしているユーザーが管理者権限を持っていない
- **解決策**: グローバル管理者またはアプリケーション管理者に依頼するか、管理者同意URLを共有する

#### 3.1.4 トークン構成

1. **トークン構成** セクションで「オプションの要求」を追加
2. **ID トークン** を選択し、以下を追加:
   - `email`
   - `family_name`
   - `given_name`
   - `upn` (User Principal Name)

3. **アクセストークン** を選択し、以下を追加:
   - `email`
   - `groups` (グループメンバーシップ)

#### 3.1.5 アプリロールの定義

1. **アプリロール** セクションで「アプリロールの作成」
2. 以下のロールを作成:

| 表示名 | 値 | 説明 | 許可されるメンバーの種類 |
|--------|-----|------|------------------------|
| 管理者 | Admin | システム全体の管理権限 | ユーザー/グループ |
| 代表社員 | Partner | 全データ閲覧・編集権限 | ユーザー/グループ |
| 正社員 | Employee | 担当案件の閲覧・編集権限 | ユーザー/グループ |
| 閲覧者 | Viewer | 読み取り専用権限 | ユーザー/グループ |

### 3.2 環境変数

#### フロントエンド (.env)

```env
VITE_ENTRA_CLIENT_ID=<アプリケーション(クライアント)ID>
VITE_ENTRA_TENANT_ID=<ディレクトリ(テナント)ID>
VITE_ENTRA_REDIRECT_URI=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8000
```

#### バックエンド (.env)

```env
ENTRA_TENANT_ID=<ディレクトリ(テナント)ID>
ENTRA_CLIENT_ID=<アプリケーション(クライアント)ID>
ENTRA_AUTHORITY=https://login.microsoftonline.com/<テナントID>
ENTRA_JWKS_URI=https://login.microsoftonline.com/<テナントID>/discovery/v2.0/keys
ENTRA_AUDIENCE=api://<クライアントID>
```

---

## 4. フロントエンド実装

### 4.1 必要なパッケージ

```bash
cd frontend
npm install @azure/msal-browser @azure/msal-react
```

### 4.2 ファイル構成と実装

#### 4.2.1 `frontend/src/auth/authConfig.ts`

```typescript
import { Configuration, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI,
  },
  cache: {
    cacheLocation: "localStorage", // sessionStorage も選択可能
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
    },
  },
};

export const loginRequest = {
  scopes: [
    "User.Read",
    "User.Read.All",  // Azure ADユーザー検索用（面接官選択）
    "email",
    "profile",
    "openid",
    "Calendars.Read",
    "Calendars.ReadWrite",
    "Mail.Send"
  ],
};

export const apiRequest = {
  scopes: [`api://${import.meta.env.VITE_ENTRA_CLIENT_ID}/access_as_user`],
};
```

#### 4.2.2 `frontend/src/auth/AuthProvider.tsx`

```typescript
import { ReactNode } from 'react';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig';

const msalInstance = new PublicClientApplication(msalConfig);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  return (
    <MsalProvider instance={msalInstance}>
      {children}
    </MsalProvider>
  );
};
```

#### 4.2.3 `frontend/src/auth/ProtectedRoute.tsx`

```typescript
import { ReactNode } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest } from './authConfig';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: string[];
}

export const ProtectedRoute = ({ children, requiredRoles }: ProtectedRouteProps) => {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const handleLogin = () => {
    instance.loginRedirect(loginRequest);
  };

  if (!isAuthenticated) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <h2>認証が必要です</h2>
        <button onClick={handleLogin} style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#0078d4',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Microsoft アカウントでサインイン
        </button>
      </div>
    );
  }

  // ロールチェック
  if (requiredRoles && requiredRoles.length > 0) {
    const account = accounts[0];
    const roles = account?.idTokenClaims?.roles as string[] | undefined;

    if (!roles || !requiredRoles.some(role => roles.includes(role))) {
      return (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>アクセス権限がありません</h2>
          <p>このページへのアクセスには適切な権限が必要です。</p>
        </div>
      );
    }
  }

  return <>{children}</>;
};
```

#### 4.2.4 `frontend/src/api/api.ts` の修正

```typescript
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig, apiRequest } from '../auth/authConfig';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const msalInstance = new PublicClientApplication(msalConfig);

// トークン取得ヘルパー
async function getAccessToken(): Promise<string | null> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...apiRequest,
      account: accounts[0],
    });
    return response.accessToken;
  } catch (error) {
    console.error('Token acquisition failed:', error);
    // トークン取得失敗時は再ログインを促す
    await msalInstance.acquireTokenRedirect(apiRequest);
    return null;
  }
}

// 既存のfetch関数を拡張
async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // トークン期限切れ - 再ログイン
    await msalInstance.acquireTokenRedirect(apiRequest);
  }

  return response;
}

// 既存のAPIメソッドを修正 (例)
export const contractApi = {
  getClientAnnualSummary: async (fiscalYearId: number): Promise<any[]> => {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/api/contracts/dashboard/client-annual-summary?fiscal_year_id=${fiscalYearId}`
    );
    if (!response.ok) throw new Error('Failed to fetch client annual summary');
    return response.json();
  },

  // ... 他のAPIメソッドも同様にauthenticatedFetchを使用
};

export default authenticatedFetch;
```

#### 4.2.5 `frontend/src/App.tsx` の修正

```typescript
import { useState } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useMsal } from '@azure/msal-react';
import './App.css';
// ... 既存のインポート

function AppContent() {
  const { instance, accounts } = useMsal();
  const [currentView, setCurrentView] = useState<string>('landing');

  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: '/',
    });
  };

  const userName = accounts[0]?.name || 'ユーザー';
  const userEmail = accounts[0]?.username || '';

  return (
    <ProtectedRoute>
      <div className="app">
        {/* ヘッダーにログアウトボタンとユーザー情報を追加 */}
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 20px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #ddd'
        }}>
          <h1>PROTHENTIA 案件管理システム</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500' }}>{userName}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{userEmail}</div>
            </div>
            <button onClick={handleLogout} style={{
              padding: '8px 16px',
              backgroundColor: '#d32f2f',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              ログアウト
            </button>
          </div>
        </header>

        {/* 既存のコンテンツ */}
        {currentView === 'landing' && (
          <DashboardLanding
            onNavigateToPaymentDashboard={() => setCurrentView('payment')}
            // ... 他のナビゲーション
          />
        )}
        {/* ... 他のビュー */}
      </div>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
```

---

## 5. バックエンド実装

### 5.1 必要なパッケージ

```bash
cd backend
pip install PyJWT cryptography python-jose[cryptography] requests
```

requirements.txt に追加:
```
PyJWT==2.8.0
cryptography==42.0.0
python-jose[cryptography]==3.3.0
requests==2.31.0
```

### 5.2 ファイル構成と実装

#### 5.2.1 `backend/app/models/models.py` の修正

既存のEmployeeテーブルに認証関連フィールドを追加:

```python
from sqlalchemy import Column, Integer, String, DateTime, Enum as SQLEnum
from datetime import datetime
import enum

class UserRole(str, enum.Enum):
    ADMIN = "Admin"
    PARTNER = "Partner"
    EMPLOYEE = "Employee"
    VIEWER = "Viewer"

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    employee_no = Column(String, unique=True, index=True, nullable=False)

    # 既存フィールド
    classification = Column(String)
    last_name_ja = Column(String)
    first_name_ja = Column(String)
    last_name_en = Column(String)
    first_name_en = Column(String)
    email = Column(String, unique=True, index=True, nullable=False)
    mobile_phone = Column(String)

    # 認証関連フィールド (新規追加)
    entra_object_id = Column(String, unique=True, index=True)  # Entra IDのオブジェクトID
    entra_upn = Column(String, unique=True, index=True)        # User Principal Name
    role = Column(SQLEnum(UserRole), default=UserRole.EMPLOYEE)  # ロール
    is_active = Column(Boolean, default=True)                  # アカウント有効/無効
    last_login = Column(DateTime(timezone=True))               # 最終ログイン日時

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
```

#### 5.2.2 `backend/app/auth/jwt_validator.py`

```python
import os
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import requests
from jose import jwt, JWTError
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)

class JWTValidator:
    def __init__(self):
        self.tenant_id = os.getenv("ENTRA_TENANT_ID")
        self.client_id = os.getenv("ENTRA_CLIENT_ID")
        self.jwks_uri = f"https://login.microsoftonline.com/{self.tenant_id}/discovery/v2.0/keys"
        self.issuer = f"https://login.microsoftonline.com/{self.tenant_id}/v2.0"
        self._jwks_cache: Optional[Dict] = None
        self._jwks_cache_time: Optional[datetime] = None
        self._cache_duration = timedelta(hours=24)

    def _get_jwks(self) -> Dict:
        """JWKS (JSON Web Key Set) を取得 (24時間キャッシュ)"""
        now = datetime.utcnow()

        if (self._jwks_cache is None or
            self._jwks_cache_time is None or
            now - self._jwks_cache_time > self._cache_duration):

            try:
                response = requests.get(self.jwks_uri, timeout=10)
                response.raise_for_status()
                self._jwks_cache = response.json()
                self._jwks_cache_time = now
                logger.info("JWKS cache updated")
            except Exception as e:
                logger.error(f"Failed to fetch JWKS: {e}")
                if self._jwks_cache is None:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Unable to fetch authentication keys"
                    )

        return self._jwks_cache

    def _get_signing_key(self, token: str) -> str:
        """トークンのヘッダーからkidを取得し、対応する公開鍵を返す"""
        try:
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing 'kid' in header"
                )

            jwks = self._get_jwks()

            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    return key

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find appropriate signing key"
            )

        except JWTError as e:
            logger.error(f"JWT header error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token header"
            )

    def validate_token(self, token: str) -> Dict[str, Any]:
        """JWTトークンを検証してペイロードを返す"""
        try:
            # 署名鍵を取得
            signing_key = self._get_signing_key(token)

            # トークンを検証・デコード
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience=self.client_id,
                issuer=self.issuer,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_nbf": True,
                    "verify_iat": True,
                    "verify_aud": True,
                    "verify_iss": True,
                }
            )

            logger.info(f"Token validated for user: {payload.get('email', 'unknown')}")
            return payload

        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )

        except jwt.JWTClaimsError as e:
            logger.error(f"JWT claims error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims",
                headers={"WWW-Authenticate": "Bearer"},
            )

        except JWTError as e:
            logger.error(f"JWT validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        except Exception as e:
            logger.error(f"Unexpected error during token validation: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service error"
            )

# シングルトンインスタンス
jwt_validator = JWTValidator()
```

#### 5.2.3 `backend/app/auth/dependencies.py`

```python
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.models import Employee, UserRole
from app.auth.jwt_validator import jwt_validator
from datetime import datetime

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Employee:
    """
    Bearerトークンから現在のユーザーを取得
    """
    token = credentials.credentials

    # トークン検証
    payload = jwt_validator.validate_token(token)

    # ユーザー情報を取得
    email = payload.get("email") or payload.get("preferred_username")
    object_id = payload.get("oid")  # Entra ID object ID
    upn = payload.get("upn")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials - email missing"
        )

    # データベースからユーザーを検索
    user = db.query(Employee).filter(Employee.email == email).first()

    if not user:
        # 初回ログイン時は自動的にユーザーを作成
        user = Employee(
            employee_no=f"AUTO_{object_id[:8]}",  # 自動採番
            email=email,
            entra_object_id=object_id,
            entra_upn=upn,
            first_name_ja=payload.get("given_name", ""),
            last_name_ja=payload.get("family_name", ""),
            role=UserRole.VIEWER,  # デフォルトは閲覧者
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 最終ログイン日時を更新
    user.last_login = datetime.utcnow()

    # Entra IDの情報を更新（変更があった場合）
    if user.entra_object_id != object_id:
        user.entra_object_id = object_id
    if user.entra_upn != upn:
        user.entra_upn = upn

    db.commit()

    # アカウントが無効化されている場合
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )

    return user

def require_role(allowed_roles: list[UserRole]):
    """
    指定されたロールを持つユーザーのみアクセスを許可するデコレーター用の依存性
    """
    async def role_checker(current_user: Employee = Depends(get_current_user)) -> Employee:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in allowed_roles]}"
            )
        return current_user

    return role_checker

# 便利なエイリアス
require_admin = require_role([UserRole.ADMIN])
require_partner = require_role([UserRole.ADMIN, UserRole.PARTNER])
require_employee = require_role([UserRole.ADMIN, UserRole.PARTNER, UserRole.EMPLOYEE])
```

#### 5.2.4 `backend/app/auth/roles.py`

```python
from enum import Enum
from app.models.models import UserRole

class Permission(str, Enum):
    """権限定義"""
    # TOF管理
    TOF_READ = "tof:read"
    TOF_WRITE = "tof:write"
    TOF_DELETE = "tof:delete"

    # OPPs管理
    OPPS_READ = "opps:read"
    OPPS_WRITE = "opps:write"
    OPPS_DELETE = "opps:delete"

    # 契約管理
    CONTRACT_READ = "contract:read"
    CONTRACT_WRITE = "contract:write"
    CONTRACT_DELETE = "contract:delete"

    # マスター管理
    MASTER_READ = "master:read"
    MASTER_WRITE = "master:write"

    # ダッシュボード
    DASHBOARD_VIEW = "dashboard:view"

# ロールごとの権限マッピング
ROLE_PERMISSIONS = {
    UserRole.ADMIN: [p for p in Permission],  # 全権限
    UserRole.PARTNER: [
        Permission.TOF_READ, Permission.TOF_WRITE, Permission.TOF_DELETE,
        Permission.OPPS_READ, Permission.OPPS_WRITE, Permission.OPPS_DELETE,
        Permission.CONTRACT_READ, Permission.CONTRACT_WRITE, Permission.CONTRACT_DELETE,
        Permission.MASTER_READ, Permission.MASTER_WRITE,
        Permission.DASHBOARD_VIEW,
    ],
    UserRole.EMPLOYEE: [
        Permission.TOF_READ, Permission.TOF_WRITE,
        Permission.OPPS_READ, Permission.OPPS_WRITE,
        Permission.CONTRACT_READ, Permission.CONTRACT_WRITE,
        Permission.MASTER_READ,
        Permission.DASHBOARD_VIEW,
    ],
    UserRole.VIEWER: [
        Permission.TOF_READ,
        Permission.OPPS_READ,
        Permission.CONTRACT_READ,
        Permission.MASTER_READ,
        Permission.DASHBOARD_VIEW,
    ],
}

def has_permission(user_role: UserRole, permission: Permission) -> bool:
    """ユーザーが特定の権限を持っているか確認"""
    return permission in ROLE_PERMISSIONS.get(user_role, [])
```

#### 5.2.5 `backend/app/main.py` の修正

```python
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from datetime import datetime
from app.models.database import engine, SessionLocal, Base
from app.models.models import Client, TOFStatus, Employee, FiscalYear, ContractStatus, BillingStatus, UserRole
from app.routes import tof_routes, master_routes, opps_routes, history_routes, contract_routes, billing_status_routes, outsourcing_contract_routes, unit_price_routes
from app.auth.dependencies import get_current_user  # 追加

# ... CustomJSONResponse は既存のまま

app = FastAPI(
    title="PROTHENTIA 案件管理システム",
    default_response_class=CustomJSONResponse
)

# APIルート登録 (認証が必要なエンドポイントには dependencies を追加)
app.include_router(tof_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(master_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(opps_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(history_routes.router, prefix="/api/histories", tags=["histories"], dependencies=[Depends(get_current_user)])
app.include_router(contract_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(billing_status_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(outsourcing_contract_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(unit_price_routes.router, dependencies=[Depends(get_current_user)])

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # 本番環境のURLを追加
        # "https://prothentia.yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_database():
    """データベースとマスターデータの初期化"""
    # ... 既存のコードは維持

    # 管理者ユーザーの初期登録 (新規追加)
    admin_email = "k.emoto@prothentia.com"  # 代表社員をAdminに
    admin_user = db.query(Employee).filter(Employee.email == admin_email).first()
    if admin_user:
        admin_user.role = UserRole.ADMIN
        db.commit()

# ... 既存のstartup_event, root, health_check エンドポイントは維持

@app.get("/api/auth/me")
async def get_me(current_user: Employee = Depends(get_current_user)):
    """現在ログイン中のユーザー情報を取得"""
    return {
        "id": current_user.id,
        "employee_no": current_user.employee_no,
        "email": current_user.email,
        "name": f"{current_user.last_name_ja} {current_user.first_name_ja}",
        "role": current_user.role.value,
        "is_active": current_user.is_active,
    }
```

---

## 6. データベースマイグレーション

### 6.1 マイグレーションスクリプト

`backend/scripts/add_entra_auth_fields.py`:

```python
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.models.database import engine

def add_entra_auth_fields():
    """Employeeテーブルに認証関連フィールドを追加"""

    with engine.connect() as conn:
        # entra_object_id カラム追加
        conn.execute(text("""
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS entra_object_id VARCHAR UNIQUE
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_employees_entra_object_id ON employees(entra_object_id)"))

        # entra_upn カラム追加
        conn.execute(text("""
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS entra_upn VARCHAR UNIQUE
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_employees_entra_upn ON employees(entra_upn)"))

        # role カラム追加 (ENUM型)
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE user_role AS ENUM ('Admin', 'Partner', 'Employee', 'Viewer');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """))

        conn.execute(text("""
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'Employee'
        """))

        # is_active カラム追加
        conn.execute(text("""
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
        """))

        # last_login カラム追加
        conn.execute(text("""
            ALTER TABLE employees
            ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE
        """))

        conn.commit()
        print("✅ Entra auth fields added successfully")

if __name__ == "__main__":
    add_entra_auth_fields()
```

実行:
```bash
cd backend
python scripts/add_entra_auth_fields.py
```

---

## 7. 使用例：ロールベースアクセス制御

### 7.1 エンドポイントでのロールチェック

```python
from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_user, require_admin, require_partner
from app.models.models import Employee

router = APIRouter()

# 全認証ユーザーがアクセス可能
@router.get("/api/contracts")
async def get_contracts(current_user: Employee = Depends(get_current_user)):
    return {"message": "All authenticated users can access"}

# パートナー以上のみアクセス可能
@router.post("/api/contracts")
async def create_contract(current_user: Employee = Depends(require_partner)):
    return {"message": "Only Partner and Admin can create"}

# 管理者のみアクセス可能
@router.delete("/api/contracts/{contract_id}")
async def delete_contract(
    contract_id: int,
    current_user: Employee = Depends(require_admin)
):
    return {"message": "Only Admin can delete"}
```

### 7.2 フロントエンドでのロール表示制御

```typescript
import { useMsal } from '@azure/msal-react';

function DashboardLanding() {
  const { accounts } = useMsal();
  const roles = accounts[0]?.idTokenClaims?.roles as string[] | undefined;

  const isAdmin = roles?.includes('Admin');
  const isPartner = roles?.includes('Partner');

  return (
    <div>
      {/* 管理者のみ表示 */}
      {isAdmin && (
        <ManagementCard
          icon="⚙️"
          title="システム管理"
          description="ユーザー管理・権限設定"
          onClick={() => navigate('/admin')}
        />
      )}

      {/* パートナー以上のみ表示 */}
      {(isAdmin || isPartner) && (
        <ManagementCard
          icon="💰"
          title="請求ダッシュボード"
          description="全社請求状況"
          onClick={() => navigate('/billing')}
        />
      )}
    </div>
  );
}
```

---

## 8. テスト手順

### 8.1 ローカル開発環境でのテスト

1. **環境変数の設定**
   - フロントエンド: `frontend/.env`
   - バックエンド: `backend/.env`

2. **バックエンド起動**
   ```bash
   cd backend
   python scripts/add_entra_auth_fields.py  # 初回のみ
   uvicorn app.main:app --reload
   ```

3. **フロントエンド起動**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **ログインフロー確認**
   - http://localhost:5173 にアクセス
   - Microsoftサインイン画面にリダイレクト
   - 認証後、ダッシュボードが表示される

5. **API呼び出し確認**
   - ブラウザの開発者ツールで Network タブを開く
   - APIリクエストのHeadersに `Authorization: Bearer <token>` が含まれることを確認

### 8.2 トークン検証のテスト

```bash
# トークンの取得（ブラウザの開発者ツールから）
TOKEN="eyJ0eXAiOiJKV1QiLCJhbG..."

# curlでAPIをテスト
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/auth/me
```

---

## 9. セキュリティ考慮事項

### 9.1 トークン管理

- **保存場所**: localStorage（XSS対策としてhttpOnlyは不可）
- **有効期限**: Entra IDのデフォルト（通常1時間）
- **リフレッシュ**: MSAL.jsが自動的にサイレントリフレッシュを実行

### 9.2 HTTPS必須

本番環境では必ずHTTPSを使用:
- フロントエンド: `https://prothentia.yourdomain.com`
- バックエンド: `https://api.prothentia.yourdomain.com`

### 9.3 CORS設定

本番環境用のCORS設定:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://prothentia.yourdomain.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

### 9.4 ログ記録

- 認証失敗のログを記録
- 異常なトークンアクセスを検知
- 定期的にログを監査

---

## 10. デプロイメント

### 10.1 Azure Container Apps へのデプロイ（推奨）

#### バックエンド

Container Apps デプロイの詳細は以下を参照してください：
- PROTHENTIA Azure: [deployment_prothentia_prod/DEPLOYMENT.md](../deployment_prothentia_prod/DEPLOYMENT.md)
- AD Azure: [deployment_ad_test/app-release-procedure.md](../deployment_ad_test/app-release-procedure.md)

**環境変数設定例**:
```bash
az containerapp update \
  --name recruiting-hr-app \
  --resource-group prothentia-hr \
  --set-env-vars \
    ENTRA_TENANT_ID="<テナントID>" \
    ENTRA_CLIENT_ID="<クライアントID>" \
    ENTRA_CLIENT_SECRET="<クライアントシークレット>"
```

#### フロントエンド

1. **Static Web Apps作成**
   ```bash
   az staticwebapp create \
     --name prothentia-web \
     --resource-group prothentia-rg \
     --source . \
     --location "East Asia" \
     --branch main \
     --app-location "/frontend" \
     --output-location "dist"
   ```

2. **環境変数設定**（GitHub Actionsで自動デプロイ時）
   - `VITE_ENTRA_CLIENT_ID`
   - `VITE_ENTRA_TENANT_ID`
   - `VITE_ENTRA_REDIRECT_URI`
   - `VITE_API_BASE_URL`

---

## 11. トラブルシューティング

### 11.1 よくあるエラー

#### エラー: `AADSTS50011: The redirect URI specified in the request does not match`

**原因**: リダイレクトURIがAzure Portal の設定と一致していない

**解決策**:
- Azure Portal → アプリの登録 → 認証 → リダイレクトURI を確認
- `frontend/.env` の `VITE_ENTRA_REDIRECT_URI` と一致させる

#### エラー: `Token validation failed`

**原因**: JWKSの取得失敗、またはトークンの改ざん

**解決策**:
- バックエンドのログを確認
- `ENTRA_TENANT_ID` と `ENTRA_CLIENT_ID` が正しいか確認
- ネットワーク環境でMicrosoftのエンドポイントへのアクセスが許可されているか確認

#### エラー: `CORS policy blocked`

**原因**: バックエンドのCORS設定が不適切

**解決策**:
- `app/main.py` の `allow_origins` にフロントエンドのURLを追加
- `allow_credentials=True` を確認

---

## 12. Microsoft Graph API - カレンダー・メール統合

### 12.1 概要

面談設定機能にOutlookカレンダーとメール送信を統合することで、以下が実現できます:

- **面接官の空き時間確認**: Outlookカレンダーから他のユーザーの予定を確認
- **カレンダーイベント自動作成**: 面談が確定したら面接官と候補者のカレンダーにイベントを作成
- **招待メール送信**: Microsoft Graph API経由でメール送信（SMTP不要）

### 12.2 Microsoft Graph Service の拡張

#### 12.2.1 `backend/services/auth/graph.py` の拡張

既存の `MicrosoftGraphService` クラスに以下のメソッドを追加:

```python
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import requests
from fastapi import HTTPException

class MicrosoftGraphService:
    BASE_URL = "https://graph.microsoft.com/v1.0"

    # 既存のメソッド (get_user_profile, get_user_groups) はそのまま

    @staticmethod
    def get_calendar_view(
        access_token: str,
        user_email: str,
        start_datetime: datetime,
        end_datetime: datetime
    ) -> List[Dict[str, Any]]:
        """
        指定ユーザーのカレンダービューを取得（空き時間確認用）

        Args:
            access_token: Microsoft Graph APIアクセストークン
            user_email: 対象ユーザーのメールアドレス
            start_datetime: 検索開始日時
            end_datetime: 検索終了日時

        Returns:
            カレンダーイベントのリスト
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        # ISO 8601フォーマットに変換
        start_iso = start_datetime.strftime("%Y-%m-%dT%H:%M:%S")
        end_iso = end_datetime.strftime("%Y-%m-%dT%H:%M:%S")

        # 他のユーザーのカレンダーを取得する場合は /users/{email}/calendarView
        url = f"{MicrosoftGraphService.BASE_URL}/users/{user_email}/calendarView"
        params = {
            "startDateTime": start_iso,
            "endDateTime": end_iso,
            "$select": "subject,start,end,isAllDay,showAs"
        }

        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            return response.json().get("value", [])
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                raise HTTPException(
                    status_code=403,
                    detail="Calendar access denied. User may not have granted Calendars.Read permission."
                )
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Failed to fetch calendar: {e.response.text}"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Calendar API error: {str(e)}")

    @staticmethod
    def create_calendar_event(
        access_token: str,
        user_email: str,
        subject: str,
        start_datetime: datetime,
        end_datetime: datetime,
        location: str,
        body: str,
        attendees: List[str]
    ) -> Dict[str, Any]:
        """
        カレンダーイベントを作成

        Args:
            access_token: Microsoft Graph APIアクセストークン
            user_email: イベント作成者（面接官）のメールアドレス
            subject: イベントのタイトル
            start_datetime: 開始日時
            end_datetime: 終了日時
            location: 場所
            body: 説明
            attendees: 参加者のメールアドレスリスト

        Returns:
            作成されたイベント情報
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        url = f"{MicrosoftGraphService.BASE_URL}/users/{user_email}/events"

        event_data = {
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": body
            },
            "start": {
                "dateTime": start_datetime.isoformat(),
                "timeZone": "Asia/Tokyo"
            },
            "end": {
                "dateTime": end_datetime.isoformat(),
                "timeZone": "Asia/Tokyo"
            },
            "location": {
                "displayName": location
            },
            "attendees": [
                {
                    "emailAddress": {"address": email},
                    "type": "required"
                }
                for email in attendees
            ],
            "isOnlineMeeting": False,  # Teamsミーティングを自動作成する場合は True
            "reminderMinutesBeforeStart": 15
        }

        try:
            response = requests.post(url, headers=headers, json=event_data, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                raise HTTPException(
                    status_code=403,
                    detail="Calendar write access denied. User may not have granted Calendars.ReadWrite permission."
                )
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Failed to create calendar event: {e.response.text}"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Calendar API error: {str(e)}")

    @staticmethod
    def send_mail(
        access_token: str,
        from_email: str,
        to_emails: List[str],
        subject: str,
        body: str,
        cc_emails: Optional[List[str]] = None
    ) -> None:
        """
        メールを送信

        Args:
            access_token: Microsoft Graph APIアクセストークン
            from_email: 送信者のメールアドレス（現在ログインしているユーザー）
            to_emails: 宛先メールアドレスのリスト
            subject: 件名
            body: メール本文（HTML可）
            cc_emails: CCメールアドレスのリスト（オプション）
        """
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }

        url = f"{MicrosoftGraphService.BASE_URL}/users/{from_email}/sendMail"

        mail_data = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": body
                },
                "toRecipients": [
                    {"emailAddress": {"address": email}}
                    for email in to_emails
                ]
            },
            "saveToSentItems": "true"
        }

        if cc_emails:
            mail_data["message"]["ccRecipients"] = [
                {"emailAddress": {"address": email}}
                for email in cc_emails
            ]

        try:
            response = requests.post(url, headers=headers, json=mail_data, timeout=10)
            response.raise_for_status()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                raise HTTPException(
                    status_code=403,
                    detail="Mail send access denied. User may not have granted Mail.Send permission."
                )
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Failed to send email: {e.response.text}"
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Mail API error: {str(e)}")
```

### 12.3 面談設定APIエンドポイントの更新

#### 12.3.1 `backend/routers/interview_schedule.py` の更新

```python
from fastapi import APIRouter, Depends, HTTPException, Header
from services.auth.graph import MicrosoftGraphService
from services.interview_schedule.email import render_email_template
from datetime import datetime, timedelta

router = APIRouter()

@router.post("/interview/setup")
async def setup_interview(
    request: InterviewSetupRequest,
    current_user: Employee = Depends(get_current_user),
    x_ms_access_token: str = Header(None, alias="X-MS-Access-Token"),
    db: Session = Depends(get_db)
):
    """
    面談を設定し、カレンダーイベントを作成してメールを送信
    """

    if not x_ms_access_token:
        raise HTTPException(status_code=401, detail="Microsoft access token required")

    # 1. 面接官の空き時間を確認
    interview_start = request.interviewDate
    interview_end = interview_start + timedelta(hours=1)  # デフォルト1時間

    try:
        # 面接官のカレンダーを確認
        calendar_events = MicrosoftGraphService.get_calendar_view(
            access_token=x_ms_access_token,
            user_email=request.interviewer,
            start_datetime=interview_start,
            end_datetime=interview_end
        )

        # 予定が入っているか確認
        if calendar_events:
            # 空き時間ではない場合は警告を返す
            return {
                "success": False,
                "warning": "The interviewer has existing appointments during this time",
                "conflicts": calendar_events
            }

    except HTTPException as e:
        # カレンダーアクセス権限がない場合はスキップして続行
        if e.status_code == 403:
            pass  # 権限がない場合は空き時間チェックをスキップ
        else:
            raise

    # 2. データベースに面談情報を保存
    schedule = InterviewSchedule(
        candidate_id=request.candidate,
        interview_stage=request.stage,
        scheduled_at=request.interviewDate,
        interview_location=request.interviewLocation,
        interviewer=request.interviewer,
        last_updated=datetime.now()
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    # 3. カレンダーイベントを作成
    try:
        calendar_body = f"""
        <h3>{request.stage} - {request.candidateName}</h3>
        <p><strong>候補者:</strong> {request.candidateName}</p>
        <p><strong>場所:</strong> {request.interviewLocation or 'オンライン'}</p>
        <p><strong>メモ:</strong></p>
        <p>{request.interviewerMail}</p>
        """

        event = MicrosoftGraphService.create_calendar_event(
            access_token=x_ms_access_token,
            user_email=request.interviewer,
            subject=f"{request.stage} - {request.candidateName}",
            start_datetime=interview_start,
            end_datetime=interview_end,
            location=request.interviewLocation or "オンライン",
            body=calendar_body,
            attendees=[request.candidateMail]  # 候補者をイベントに追加
        )

    except HTTPException as e:
        # カレンダー作成失敗時はログに記録して続行
        print(f"Calendar event creation failed: {e.detail}")

    # 4. メールを送信
    try:
        # 候補者向けメール
        candidate_body = render_email_template(
            template_key="interview_to_candidate",
            variables={
                "candidate_name": request.candidateName,
                "interviewer_name": current_user.name,
                "interview_date": request.interviewDate.strftime("%Y年%m月%d日 %H:%M"),
                "stage": request.stage,
                "location": request.interviewLocation or "オンライン"
            }
        )

        MicrosoftGraphService.send_mail(
            access_token=x_ms_access_token,
            from_email=current_user.email,
            to_emails=[request.candidateMail],
            subject=f"【{request.stage}】面談日程のご案内",
            body=candidate_body
        )

        # 面接官向けメール
        interviewer_body = render_email_template(
            template_key="interview_to_interviewer",
            variables={
                "candidate_name": request.candidateName,
                "interviewer_name": current_user.name,
                "interview_date": request.interviewDate.strftime("%Y年%m月%d日 %H:%M"),
                "stage": request.stage,
                "location": request.interviewLocation or "オンライン"
            }
        )

        MicrosoftGraphService.send_mail(
            access_token=x_ms_access_token,
            from_email=current_user.email,
            to_emails=[request.interviewer],
            subject=f"【{request.stage}】面接官アサインのお知らせ - {request.candidateName}",
            body=interviewer_body
        )

    except HTTPException as e:
        # メール送信失敗時はログに記録して続行
        print(f"Email sending failed: {e.detail}")

    return {
        "success": True,
        "schedule_id": schedule.id,
        "message": "Interview scheduled successfully"
    }
```

### 12.4 フロントエンドの更新

#### 12.4.1 `frontend/src/api/api.ts` の更新

```typescript
// Microsoft Access Token をヘッダーに追加
async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const accounts = msalInstance.getAllAccounts();

  if (accounts.length === 0) {
    throw new Error("No authenticated user");
  }

  // Microsoft Graph API用のトークンを取得
  const msTokenResponse = await msalInstance.acquireTokenSilent({
    scopes: [
      "User.Read",
      "Calendars.Read",
      "Calendars.ReadWrite",
      "Mail.Send"
    ],
    account: accounts[0],
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${msTokenResponse.accessToken}`,
    'X-MS-Access-Token': msTokenResponse.accessToken,  // Microsoft Graph API用
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}
```

### 12.5 使用例

#### 面談設定時の流れ

1. **ユーザーが面談日時を選択**
2. **バックエンドが面接官のカレンダーをチェック**
   - 空いていない場合は警告を表示
3. **面談情報をデータベースに保存**
4. **面接官のカレンダーにイベントを作成**
   - 候補者も参加者として追加
5. **候補者と面接官にメールを送信**

### 12.6 注意事項

#### 権限の委任

- ログインユーザーの権限で他のユーザーのカレンダーを読み取るには、組織の設定で**カレンダーの共有**が有効になっている必要があります
- または、**Application Permissions**（アプリケーション権限）を使用することで、管理者同意のもとですべてのユーザーのカレンダーにアクセスできます

#### Application Permissions（推奨）

より強力な権限が必要な場合:

1. Azure Portal → アプリの登録 → APIのアクセス許可
2. 「アプリケーションの許可」を選択
3. 以下を追加:
   - `Calendars.ReadWrite` (Application)
   - `Mail.Send` (Application)
4. 管理者の同意を付与

この場合、バックエンドでClient Credentials Flowを使用します。

---

## 13. 今後の拡張

### 12.1 条件付きアクセス

Entra IDの条件付きアクセスポリシーを設定し、以下を実現:
- 多要素認証（MFA）の強制
- 特定IPアドレスからのみアクセス許可
- 管理操作時の追加認証要求

### 12.2 監査ログ

すべてのAPI操作をログに記録:
```python
from app.models.models import AuditLog

@router.post("/api/contracts")
async def create_contract(
    data: ContractCreate,
    current_user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ビジネスロジック
    contract = create_contract_logic(data)

    # 監査ログ記録
    audit_log = AuditLog(
        user_id=current_user.id,
        action="CREATE_CONTRACT",
        resource_type="Contract",
        resource_id=contract.id,
        details={"contract_no": contract.contract_no}
    )
    db.add(audit_log)
    db.commit()

    return contract
```

### 12.3 APIスコープの細分化

より細かい権限制御のため、APIスコープを追加:
- `api://prothentia/TOF.Read`
- `api://prothentia/TOF.Write`
- `api://prothentia/Contract.Read`
- `api://prothentia/Contract.Write`

---

## 13. チェックリスト

### 開発環境セットアップ

- [ ] Azure Portal でアプリケーション登録
- [ ] アプリロールを定義
- [ ] ユーザーにロールを割り当て
- [ ] フロントエンドに環境変数を設定
- [ ] バックエンドに環境変数を設定
- [ ] 必要なパッケージをインストール
- [ ] DBマイグレーション実行
- [ ] ローカルでログインフローをテスト
- [ ] API呼び出しのテスト

### 本番環境デプロイ

- [ ] HTTPSの設定
- [ ] 本番用リダイレクトURIの登録
- [ ] CORS設定の更新
- [ ] 環境変数の設定（本番）
- [ ] セキュリティスキャン実施
- [ ] 負荷テスト実施
- [ ] バックアップ設定
- [ ] 監視・アラート設定

---

## 14. 参考資料

- [Microsoft identity platform documentation](https://learn.microsoft.com/en-us/azure/active-directory/develop/)
- [MSAL.js documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [PyJWT documentation](https://pyjwt.readthedocs.io/)

---

**作成日**: 2026年1月20日
**バージョン**: 1.0
**作成者**: Claude Code (PROTHENTIA)
