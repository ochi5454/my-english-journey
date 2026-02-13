# SharePoint連携実装リファレンス（AI開発アシスタント用）
## Microsoft Graph API によるファイル保存実装ガイド

> **このドキュメントの目的**  
> SharePointへのファイルアップロード機能を実装する際の標準パターンと必須要件を定義します。コード生成時は、必ずこのガイドに従ってください。

---

## 🎯 アーキテクチャ概要

### システム構成

```
クライアント（React）
  ↓ ファイルアップロード
バックエンド（FastAPI）
  ↓ Microsoft Graph API
SharePoint Online
  ↓ 保存
ドキュメントライブラリ/フォルダ構造
```

### 認証フロー

```
1. Azure AD認証（既存のEntra ID統合）
2. アクセストークン取得（delegated permissions）
3. Graph APIリクエスト（Sites.ReadWrite.All scope）
```

---

## 📋 必須環境変数

### 環境変数定義

```env
# SharePoint連携設定（必須）
SHAREPOINT_SITE_ID=domain.sharepoint.com,guid1,guid2
SHAREPOINT_DRIVE_ID=b!base64encodedid
SHAREPOINT_RECEIPT_BASE_FOLDER=社内ワークフロー_経費精算
SHAREPOINT_RECEIPT_FOLDER_PREFIX=領収書画像格納フォルダ_経費精算
```

### 各変数の仕様

| 変数名 | 型 | 必須 | 説明 | 取得方法 |
|---|---|---|---|---|
| `SHAREPOINT_SITE_ID` | string | ✅ | SharePointサイトの完全識別子 | Graph API: `GET /sites?search={siteName}` |
| `SHAREPOINT_DRIVE_ID` | string | ✅ | ドキュメントライブラリID | Graph API: `GET /sites/{siteId}/drives` |
| `SHAREPOINT_RECEIPT_BASE_FOLDER` | string | ✅ | 領収書保存先の親フォルダパス | SharePointで確認 |
| `SHAREPOINT_RECEIPT_FOLDER_PREFIX` | string | ✅ | 会計年度フォルダ名のプレフィックス | 命名規則に従う |

### Site ID形式の重要事項

**必須形式**：`{domain}.sharepoint.com,{guid1},{guid2}`

```python
# ✅ 正しい
SHAREPOINT_SITE_ID = "prothentia.sharepoint.com,30971bf8-f033-4420-8b12-27f327a06c1c,6c27475d-2264-43e9-af98-fd5c1b1c4ed3"

# ❌ 間違い（ドメイン名が欠落）
SHAREPOINT_SITE_ID = "30971bf8-f033-4420-8b12-27f327a06c1c,6c27475d-2264-43e9-af98-fd5c1b1c4ed3"
```

---

## 🏗️ フォルダ構造とパス設計

### 標準フォルダ構造

```
SharePoint ドキュメントライブラリ/
└── {SHAREPOINT_RECEIPT_BASE_FOLDER}/              # 例: 社内ワークフロー_経費精算
    ├── {PREFIX}_YYYYMM-YYYYMM/                   # 会計年度フォルダ（自動作成）
    │   ├── receipt_20260115_001.jpg
    │   ├── receipt_20260115_002.pdf
    │   └── receipt_20260115_003.png
    └── {PREFIX}_YYYYMM-YYYYMM/                   # 次年度フォルダ
        └── ...
```

### 会計年度フォルダ命名規則

**パターン**：`{PREFIX}_YYYYMM-YYYYMM`

**例**：
- 2025年8月〜2026年7月：`領収書画像格納フォルダ_経費精算_202508-202607`
- 2026年8月〜2027年7月：`領収書画像格納フォルダ_経費精算_202608-202707`

**計算ロジック**：
```python
def get_fiscal_year_folder_name(date: datetime, prefix: str) -> str:
    """
    会計年度フォルダ名を生成（8月始まり）
    
    Args:
        date: 対象日付
        prefix: フォルダ名プレフィックス（環境変数から取得）
    
    Returns:
        フォルダ名（例: "領収書画像格納フォルダ_経費精算_202508-202607"）
    """
    if date.month >= 8:
        # 8月以降：当年8月〜翌年7月
        start_year = date.year
        end_year = date.year + 1
    else:
        # 1-7月：前年8月〜当年7月
        start_year = date.year - 1
        end_year = date.year
    
    return f"{prefix}_{start_year:04d}08-{end_year:04d}07"
```

---

## 🔧 実装パターン

### レイヤー構成

```
Route層（FastAPI）
  ↓ ファイル受信
Service層
  ↓ ビジネスロジック（会計年度計算、ファイル名生成）
SharePointClient（共通モジュール）
  ↓ Graph API呼び出し
SharePoint Online
```

---

### SharePointClient実装（共通モジュール）

**配置**：`backend/app/shared/clients/sharepoint_client.py`

```python
from typing import Optional
from datetime import datetime
import os
import httpx
from fastapi import HTTPException

class SharePointClient:
    """Microsoft Graph API経由でSharePointにアクセスするクライアント"""
    
    def __init__(self, access_token: str):
        """
        Args:
            access_token: Microsoft Graph APIアクセストークン（delegated）
        """
        self.access_token = access_token
        self.base_url = "https://graph.microsoft.com/v1.0"
        self.site_id = os.getenv("SHAREPOINT_SITE_ID")
        self.drive_id = os.getenv("SHAREPOINT_DRIVE_ID")
        self.base_folder = os.getenv("SHAREPOINT_RECEIPT_BASE_FOLDER")
        self.folder_prefix = os.getenv("SHAREPOINT_RECEIPT_FOLDER_PREFIX")
        
        # 環境変数検証
        if not all([self.site_id, self.drive_id, self.base_folder, self.folder_prefix]):
            raise ValueError("SharePoint environment variables are not set")
    
    def _get_headers(self) -> dict:
        """Graph APIリクエストヘッダー"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
    
    def _get_fiscal_year_folder_name(self, date: datetime) -> str:
        """
        会計年度フォルダ名を生成（8月始まり）
        
        Args:
            date: 対象日付
        
        Returns:
            フォルダ名（例: "領収書画像格納フォルダ_経費精算_202508-202607"）
        """
        if date.month >= 8:
            start_year = date.year
            end_year = date.year + 1
        else:
            start_year = date.year - 1
            end_year = date.year
        
        return f"{self.folder_prefix}_{start_year:04d}08-{end_year:04d}07"
    
    async def ensure_fiscal_year_folder(self, date: datetime) -> str:
        """
        会計年度フォルダを確認・作成
        
        Args:
            date: 対象日付
        
        Returns:
            フォルダパス（例: "社内ワークフロー_経費精算/領収書画像格納フォルダ_経費精算_202508-202607"）
        """
        folder_name = self._get_fiscal_year_folder_name(date)
        folder_path = f"{self.base_folder}/{folder_name}"
        
        # フォルダ存在確認
        check_url = f"{self.base_url}/sites/{self.site_id}/drives/{self.drive_id}/root:/{folder_path}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(check_url, headers=self._get_headers())
            
            if response.status_code == 200:
                # フォルダ存在
                return folder_path
            elif response.status_code == 404:
                # フォルダ作成
                await self._create_folder(folder_path)
                return folder_path
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to check folder: {response.text}"
                )
    
    async def _create_folder(self, folder_path: str) -> None:
        """
        フォルダを作成
        
        Args:
            folder_path: 作成するフォルダパス
        """
        # 親フォルダパスと新規フォルダ名を分離
        parts = folder_path.split("/")
        parent_path = "/".join(parts[:-1])
        new_folder_name = parts[-1]
        
        # 親フォルダ内に新規フォルダを作成
        create_url = f"{self.base_url}/sites/{self.site_id}/drives/{self.drive_id}/root:/{parent_path}:/children"
        
        payload = {
            "name": new_folder_name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "fail"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                create_url,
                headers=self._get_headers(),
                json=payload
            )
            
            if response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to create folder: {response.text}"
                )
    
    async def upload_receipt(
        self,
        file_content: bytes,
        file_name: str,
        upload_date: datetime
    ) -> dict:
        """
        領収書画像をSharePointにアップロード
        
        Args:
            file_content: ファイルのバイナリデータ
            file_name: ファイル名（例: "receipt_20260115_001.jpg"）
            upload_date: アップロード日時（会計年度フォルダ判定用）
        
        Returns:
            アップロード結果（id, webUrl, name等）
        """
        # 1. 会計年度フォルダ確認・作成
        folder_path = await self.ensure_fiscal_year_folder(upload_date)
        
        # 2. ファイルアップロード
        upload_url = f"{self.base_url}/sites/{self.site_id}/drives/{self.drive_id}/root:/{folder_path}/{file_name}:/content"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/octet-stream"
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.put(
                upload_url,
                headers=headers,
                content=file_content
            )
            
            if response.status_code not in [200, 201]:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to upload file: {response.text}"
                )
            
            return response.json()
    
    async def get_file_info(self, file_path: str) -> dict:
        """
        ファイル情報を取得
        
        Args:
            file_path: ファイルパス（例: "社内ワークフロー_経費精算/.../file.jpg"）
        
        Returns:
            ファイル情報（id, webUrl, size等）
        """
        url = f"{self.base_url}/sites/{self.site_id}/drives/{self.drive_id}/root:/{file_path}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers())
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to get file info: {response.text}"
                )
            
            return response.json()
    
    async def delete_file(self, file_path: str) -> None:
        """
        ファイルを削除
        
        Args:
            file_path: ファイルパス
        """
        url = f"{self.base_url}/sites/{self.site_id}/drives/{self.drive_id}/root:/{file_path}"
        
        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=self._get_headers())
            
            if response.status_code not in [200, 204]:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to delete file: {response.text}"
                )
```

---

### Service層実装

**配置**：`backend/app/features/expense/service.py`

```python
from datetime import datetime
from fastapi import UploadFile
from app.shared.clients.sharepoint_client import SharePointClient

class ExpenseService:
    def __init__(self, sharepoint_client: SharePointClient):
        self.sharepoint_client = sharepoint_client
    
    async def upload_receipt(
        self,
        file: UploadFile,
        expense_id: int,
        upload_date: datetime
    ) -> dict:
        """
        領収書画像をアップロード
        
        Args:
            file: アップロードファイル
            expense_id: 経費ID
            upload_date: アップロード日時
        
        Returns:
            SharePoint上のファイル情報
        """
        # 1. ファイル名生成
        file_name = self._generate_receipt_filename(expense_id, upload_date, file.filename)
        
        # 2. ファイル読み込み
        file_content = await file.read()
        
        # 3. SharePointにアップロード
        result = await self.sharepoint_client.upload_receipt(
            file_content=file_content,
            file_name=file_name,
            upload_date=upload_date
        )
        
        return {
            "id": result.get("id"),
            "name": result.get("name"),
            "web_url": result.get("webUrl"),
            "size": result.get("size")
        }
    
    def _generate_receipt_filename(
        self,
        expense_id: int,
        upload_date: datetime,
        original_filename: str
    ) -> str:
        """
        領収書ファイル名を生成
        
        パターン: receipt_{YYYYMMDD}_{expense_id}.{ext}
        例: receipt_20260115_001.jpg
        
        Args:
            expense_id: 経費ID
            upload_date: アップロード日時
            original_filename: 元のファイル名
        
        Returns:
            生成されたファイル名
        """
        date_str = upload_date.strftime("%Y%m%d")
        ext = original_filename.split(".")[-1] if "." in original_filename else "jpg"
        return f"receipt_{date_str}_{expense_id:03d}.{ext}"
```

---

### Route層実装

**配置**：`backend/app/features/expense/route.py`

```python
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from datetime import datetime
from app.shared.clients.sharepoint_client import SharePointClient
from .service import ExpenseService

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

async def get_sharepoint_client(access_token: str = Depends(get_access_token)) -> SharePointClient:
    """SharePointクライアントのDI"""
    return SharePointClient(access_token)

async def get_expense_service(
    client: SharePointClient = Depends(get_sharepoint_client)
) -> ExpenseService:
    """経費サービスのDI"""
    return ExpenseService(client)

@router.post("/{expense_id}/receipts/upload")
async def upload_receipt(
    expense_id: int,
    file: UploadFile = File(...),
    service: ExpenseService = Depends(get_expense_service)
):
    """
    領収書画像をアップロード
    
    Args:
        expense_id: 経費ID
        file: アップロードファイル
    
    Returns:
        アップロード結果
    """
    # ファイル検証
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    if file.size > 10 * 1024 * 1024:  # 10MB制限
        raise HTTPException(status_code=400, detail="File size exceeds 10MB")
    
    # アップロード実行
    upload_date = datetime.now()
    result = await service.upload_receipt(file, expense_id, upload_date)
    
    return {
        "message": "Receipt uploaded successfully",
        "file": result
    }
```

---

## 🔐 認証とトークン取得

### アクセストークンの取得

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def get_access_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """
    リクエストヘッダーからアクセストークンを取得
    
    フロントエンドはEntra ID認証後のトークンをBearerトークンとして送信
    
    Returns:
        アクセストークン
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    return credentials.credentials
```

### 必須スコープ

**委任されたアクセス許可**：
- `Sites.ReadWrite.All`：SharePointサイトへの読み書き

**アプリケーション許可**（使用しない）：
- 個人のアカウントでファイルをアップロードするため、委任許可のみ使用

---

## 📊 エラーハンドリング

### Graph APIエラーレスポンス

```json
{
  "error": {
    "code": "ErrorCode",
    "message": "Error message",
    "innerError": {
      "request-id": "...",
      "date": "..."
    }
  }
}
```

### 主要エラーコード

| HTTPステータス | エラーコード | 原因 | 対処法 |
|---|---|---|---|
| 400 | `BadRequest` | リクエストパラメータが不正 | URLパス、Site ID形式を確認 |
| 401 | `Unauthorized` | トークン無効・期限切れ | トークン再取得 |
| 403 | `Forbidden` | 権限不足 | `Sites.ReadWrite.All`スコープを確認 |
| 404 | `NotFound` | パス・ファイルが存在しない | フォルダパス、Site ID、Drive IDを確認 |
| 409 | `Conflict` | ファイル名の重複 | `@microsoft.graph.conflictBehavior`を指定 |
| 429 | `TooManyRequests` | レート制限 | リトライロジック実装 |

### エラーハンドリングパターン

```python
async def upload_with_retry(self, file_content: bytes, file_name: str) -> dict:
    """
    リトライ付きアップロード
    """
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            return await self.upload_receipt(file_content, file_name, datetime.now())
        except HTTPException as e:
            if e.status_code == 429:
                # レート制限：待機後リトライ
                retry_count += 1
                await asyncio.sleep(2 ** retry_count)  # 指数バックオフ
            else:
                # その他のエラー：即座に再送出
                raise
    
    raise HTTPException(status_code=429, detail="Rate limit exceeded after retries")
```

---

## ✅ 実装チェックリスト

### 環境変数

- [ ] `SHAREPOINT_SITE_ID`が設定されている（ドメイン名を含む完全形式）
- [ ] `SHAREPOINT_DRIVE_ID`が設定されている
- [ ] `SHAREPOINT_RECEIPT_BASE_FOLDER`が設定されている
- [ ] `SHAREPOINT_RECEIPT_FOLDER_PREFIX`が設定されている

### SharePointClient

- [ ] アクセストークンを受け取る
- [ ] 環境変数の検証を行う
- [ ] 会計年度フォルダ名を正しく計算する
- [ ] フォルダ存在確認・作成を行う
- [ ] ファイルアップロードを実装
- [ ] エラーハンドリングを実装

### Service層

- [ ] ファイル名生成ロジックを実装
- [ ] SharePointClientを呼び出す
- [ ] ビジネスロジック（会計年度判定など）を実装

### Route層

- [ ] ファイルサイズ制限を実装（10MB推奨）
- [ ] ファイルタイプ検証を実装
- [ ] アクセストークンを取得・渡す
- [ ] 適切なHTTPステータスコードを返す

---

## 🚫 絶対に生成してはいけないパターン

### 1. Site IDのドメイン名欠落

```python
# ❌ 絶対にNG
SHAREPOINT_SITE_ID = "30971bf8-f033-4420-8b12-27f327a06c1c,6c27475d-2264-43e9-af98-fd5c1b1c4ed3"

# ✅ 正しい
SHAREPOINT_SITE_ID = "prothentia.sharepoint.com,30971bf8-f033-4420-8b12-27f327a06c1c,6c27475d-2264-43e9-af98-fd5c1b1c4ed3"
```

### 2. URLパスの区切り文字間違い

```python
# ❌ 絶対にNG
url = f"{base_url}/sites/{site_id}/drives/{drive_id}/root/{folder_path}"

# ✅ 正しい
url = f"{base_url}/sites/{site_id}/drives/{drive_id}/root:/{folder_path}:/children"
#                                                          ↑          ↑
#                                                      コロン必須  コロン必須
```

### 3. トークンのハードコーディング

```python
# ❌ 絶対にNG
self.access_token = "hardcoded_token_here"

# ✅ 正しい
self.access_token = access_token  # 引数から受け取る
```

### 4. 日本語パスのURLエンコード

```python
# ❌ 不要
folder_path = urllib.parse.quote("社内ワークフロー_経費精算")

# ✅ 正しい（そのまま使用）
folder_path = "社内ワークフロー_経費精算"
```

### 5. 会計年度計算の誤り

```python
# ❌ 絶対にNG（単純な年計算）
def get_fiscal_year(date: datetime) -> str:
    return f"{date.year}08-{date.year + 1}07"

# ✅ 正しい（8月で切り替え）
def get_fiscal_year(date: datetime) -> str:
    if date.month >= 8:
        return f"{date.year}08-{date.year + 1}07"
    else:
        return f"{date.year - 1}08-{date.year}07"
```

---

## 📝 テストケース

### ユニットテスト例

```python
import pytest
from datetime import datetime
from app.shared.clients.sharepoint_client import SharePointClient

class TestSharePointClient:
    def test_fiscal_year_folder_name_august_to_july(self):
        """会計年度フォルダ名生成（8月〜7月）"""
        client = SharePointClient(access_token="dummy")
        
        # 2025年8月 → 202508-202607
        date1 = datetime(2025, 8, 1)
        result1 = client._get_fiscal_year_folder_name(date1)
        assert result1 == "領収書画像格納フォルダ_経費精算_202508-202607"
        
        # 2026年7月 → 202508-202607（同じ会計年度）
        date2 = datetime(2026, 7, 31)
        result2 = client._get_fiscal_year_folder_name(date2)
        assert result2 == "領収書画像格納フォルダ_経費精算_202508-202607"
        
        # 2026年8月 → 202608-202707（次の会計年度）
        date3 = datetime(2026, 8, 1)
        result3 = client._get_fiscal_year_folder_name(date3)
        assert result3 == "領収書画像格納フォルダ_経費精算_202608-202707"
```

---

## 🔍 Graph APIエンドポイント早見表

### サイト・ドライブ取得

```
# サイト検索
GET /v1.0/sites?search={siteName}

# 特定サイト取得
GET /v1.0/sites/{hostname}:/{relative-path}

# サイトのドライブ一覧
GET /v1.0/sites/{siteId}/drives

# 特定ドライブ取得
GET /v1.0/sites/{siteId}/drives/{driveId}
```

### フォルダ・ファイル操作

```
# フォルダ内容取得
GET /v1.0/sites/{siteId}/drives/{driveId}/root:/{folderPath}:/children

# フォルダ作成
POST /v1.0/sites/{siteId}/drives/{driveId}/root:/{parentPath}:/children
Body: { "name": "新規フォルダ名", "folder": {} }

# ファイルアップロード（10MB以下）
PUT /v1.0/sites/{siteId}/drives/{driveId}/root:/{filePath}:/content
Body: <binary file content>

# ファイル情報取得
GET /v1.0/sites/{siteId}/drives/{driveId}/root:/{filePath}

# ファイル削除
DELETE /v1.0/sites/{siteId}/drives/{driveId}/root:/{filePath}
```

---

## 📊 デプロイ時の環境変数設定

### Azure Container Apps

```bash
az containerapp update \
  --name <APP_NAME> \
  --resource-group <RESOURCE_GROUP> \
  --set-env-vars \
    SHAREPOINT_SITE_ID="domain.sharepoint.com,guid1,guid2" \
    SHAREPOINT_DRIVE_ID="b!base64id" \
    SHAREPOINT_RECEIPT_BASE_FOLDER="社内ワークフロー_経費精算" \
    SHAREPOINT_RECEIPT_FOLDER_PREFIX="領収書画像格納フォルダ_経費精算"
```

### ローカル開発

```bash
# backend/.env
SHAREPOINT_SITE_ID=domain.sharepoint.com,guid1,guid2
SHAREPOINT_DRIVE_ID=b!base64id
SHAREPOINT_RECEIPT_BASE_FOLDER=社内ワークフロー_経費精算
SHAREPOINT_RECEIPT_FOLDER_PREFIX=領収書画像格納フォルダ_経費精算
```

---

**このガイドに従って、一貫性のある安全なSharePoint連携機能を実装してください。**
