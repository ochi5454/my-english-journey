# 暗号化データ実装ガイド（AI開発アシスタント用）
## AES-256-GCM + SHA-256検索ハッシュ方式

> **このドキュメントの目的**  
> 暗号化データを扱うシステムにおける設計原則と実装ルールを定義します。このプロジェクトは **AES-256-GCM暗号化 + SHA-256検索ハッシュのハイブリッド方式** を採用しています。コード生成時は必ずこのガイドに従ってください。

---

## 🔐 暗号化方式の基本原則

### プロジェクトの暗号化仕様

- **暗号化アルゴリズム**: AES-256-GCM
- **検索用ハッシュ**: SHA-256
- **暗号化対象**: PII（個人識別情報）- メールアドレス、氏名、電話番号など
- **キー管理**: 環境変数経由（コードに埋め込まない）

### 重要な技術的制約

AES-256-GCMは**ランダムIV（12バイト初期化ベクトル）**を使用するため：

```
同じ平文 → 暗号化 → 異なる暗号文
"yamada" → encrypt → "v0:AAA..."
"yamada" → encrypt → "v0:BBB..."  (毎回異なる)
```

**結果として以下が不可能**：
- 暗号文での一致検索
- 暗号文をJOINキーとして使用
- 暗号文での部分一致検索
- 暗号文へのインデックス作成

---

## 📐 データベーススキーマ設計ルール

### 必須パターン：暗号化列 + 検索ハッシュ列のペア

暗号化が必要なフィールドには、必ず以下の2列をセットで作成：

| カラム名パターン | 型 | 用途 | インデックス |
|---|---|---|---|
| `{field}` | TEXT | 暗号化データ保存 | 不要 |
| `{field}_hash` | TEXT | 検索用ハッシュ | **必須** |
| `id` | INTEGER/UUID | 参照・更新キー | PRIMARY KEY |

### テーブル定義例

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 暗号化フィールド + 検索ハッシュのペア
    email TEXT NOT NULL,              -- AES-256-GCM暗号文
    email_hash TEXT NOT NULL,         -- SHA-256ハッシュ
    
    name TEXT NOT NULL,               -- AES-256-GCM暗号文
    name_hash TEXT NOT NULL,          -- SHA-256ハッシュ
    
    phone TEXT,                       -- AES-256-GCM暗号文
    phone_hash TEXT,                  -- SHA-256ハッシュ
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 検索用ハッシュにインデックス（必須）
CREATE INDEX idx_users_email_hash ON users(email_hash);
CREATE INDEX idx_users_name_hash ON users(name_hash);
CREATE INDEX idx_users_phone_hash ON users(phone_hash);
```

---

## 🔄 データフロー

### 保存時のフロー

```
入力（平文）
  ↓
正規化（normalize_for_search）
  ↓
  ├→ SHA-256ハッシュ生成 → {field}_hash列に保存
  └→ AES-256-GCM暗号化 → {field}列に保存
```

### 検索時のフロー

```
検索入力（平文）
  ↓
正規化（normalize_for_search）※保存時と同じ関数
  ↓
SHA-256ハッシュ生成
  ↓
{field}_hash列で検索（インデックス使用）
  ↓
該当レコード取得
  ↓
必要な暗号化列のみ復号
  ↓
平文を返す
```

---

## 🏗️ レイヤー別実装ルール

### Crypto Module（共通暗号化モジュール）

**配置**: `shared/crypto/` または `utils/crypto/`

**責務**：
- 暗号化・復号の実装
- 検索用ハッシュ生成
- 正規化処理の統一

**必須実装関数**：

```python
def normalize_for_search(value: str) -> str:
    """検索用正規化（保存時・検索時で統一）"""
    return value.strip().lower()

def generate_search_hash(value: str) -> str:
    """SHA-256検索ハッシュ生成"""
    normalized = normalize_for_search(value)
    return hashlib.sha256(normalized.encode()).hexdigest()

def encrypt(plaintext: str) -> str:
    """AES-256-GCM暗号化（バージョンプレフィックス付き）"""
    # v0: プレフィックスで将来のキーローテーションに対応
    pass

def decrypt(ciphertext: str) -> str:
    """AES-256-GCM復号（バージョンチェック付き）"""
    # v0: プレフィックスを確認
    pass
```

**実装例**：

```python
# shared/crypto/encryption.py
import hashlib
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')  # 環境変数から取得

def normalize_for_search(value: str) -> str:
    """検索用正規化"""
    if not value:
        return ""
    return value.strip().lower()

def generate_search_hash(value: str) -> str:
    """SHA-256検索ハッシュ生成"""
    normalized = normalize_for_search(value)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def encrypt(plaintext: str) -> str:
    """AES-256-GCM暗号化"""
    if not plaintext:
        return ""
    
    key = base64.b64decode(ENCRYPTION_KEY)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # ランダムIV
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    
    # バージョンプレフィックス + base64エンコード
    combined = nonce + ciphertext
    return f"v0:{base64.b64encode(combined).decode('ascii')}"

def decrypt(ciphertext: str) -> str:
    """AES-256-GCM復号"""
    if not ciphertext:
        return ""
    
    # バージョンチェック
    if not ciphertext.startswith('v0:'):
        raise ValueError(f"Unknown encryption version: {ciphertext[:10]}")
    
    key = base64.b64decode(ENCRYPTION_KEY)
    aesgcm = AESGCM(key)
    
    # base64デコード
    combined = base64.b64decode(ciphertext[3:])
    nonce = combined[:12]
    actual_ciphertext = combined[12:]
    
    plaintext = aesgcm.decrypt(nonce, actual_ciphertext, None)
    return plaintext.decode('utf-8')
```

---

### Repository層

**責務**：
- `{field}_hash`列での検索のみ
- 暗号文の保存・取得
- **復号は行わない**（Serviceの責務）

**禁止事項**：
- 暗号化列（`{field}`）をWHERE条件に使用
- 暗号化列をJOINキーに使用
- Repository内での復号処理

**実装パターン**：

```python
# features/user/repository.py
from sqlalchemy.orm import Session
from .models import User

class UserRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def find_by_email_hash(self, email_hash: str) -> User | None:
        """検索ハッシュでユーザーを検索"""
        return self.db.query(User).filter(
            User.email_hash == email_hash
        ).first()
    
    def find_by_id(self, user_id: int) -> User | None:
        """IDでユーザーを取得"""
        return self.db.query(User).filter(
            User.id == user_id
        ).first()
    
    def find_all(self, limit: int = 100) -> list[User]:
        """ユーザー一覧取得（復号なし）"""
        return self.db.query(User).limit(limit).all()
    
    def save(self, user: User) -> User:
        """ユーザー保存"""
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def update(self, user: User) -> User:
        """ユーザー更新"""
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def delete(self, user_id: int) -> bool:
        """ユーザー削除"""
        result = self.db.query(User).filter(
            User.id == user_id
        ).delete()
        self.db.commit()
        return result > 0
```

**NG例**：

```python
# ❌ 絶対にNG
class UserRepository:
    def find_by_email(self, email: str):
        # 暗号化列で直接検索（不可能）
        return self.db.query(User).filter(User.email == email).first()
    
    def find_by_name_pattern(self, pattern: str):
        # 暗号化列でLIKE検索（不可能）
        return self.db.query(User).filter(User.name.like(f"%{pattern}%")).all()
```

---

### Service層

**責務**：
- 正規化の実行
- 検索ハッシュの生成
- 暗号化の実行
- Repository経由での検索
- **必要最小限の復号**

**実装パターン**：

```python
# features/user/service.py
from shared.crypto.encryption import (
    normalize_for_search,
    generate_search_hash,
    encrypt,
    decrypt
)
from .repository import UserRepository
from .models import User
from .schemas import UserCreateDTO

class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository
    
    def create_user(self, data: UserCreateDTO) -> User:
        """ユーザー作成"""
        # 1. 正規化
        normalized_email = normalize_for_search(data.email)
        normalized_name = normalize_for_search(data.name)
        
        # 2. 検索ハッシュ生成
        email_hash = generate_search_hash(normalized_email)
        name_hash = generate_search_hash(normalized_name)
        
        # 3. 暗号化
        encrypted_email = encrypt(normalized_email)
        encrypted_name = encrypt(normalized_name)
        
        # 4. モデル作成
        user = User(
            email=encrypted_email,
            email_hash=email_hash,
            name=encrypted_name,
            name_hash=name_hash
        )
        
        # 5. 保存
        return self.repository.save(user)
    
    def find_by_email(self, email: str) -> User | None:
        """メールアドレスで検索（復号あり）"""
        # 1. 正規化
        normalized = normalize_for_search(email)
        
        # 2. 検索ハッシュ生成
        search_hash = generate_search_hash(normalized)
        
        # 3. ハッシュで検索
        user = self.repository.find_by_email_hash(search_hash)
        
        # 4. 必要な項目のみ復号
        if user:
            user.decrypted_email = decrypt(user.email)
            user.decrypted_name = decrypt(user.name)
        
        return user
    
    def get_user_detail(self, user_id: int) -> User | None:
        """ユーザー詳細取得（復号あり）"""
        user = self.repository.find_by_id(user_id)
        
        if user:
            # 詳細表示時のみ復号
            user.decrypted_email = decrypt(user.email)
            user.decrypted_name = decrypt(user.name)
            if user.phone:
                user.decrypted_phone = decrypt(user.phone)
        
        return user
    
    def list_users(self, limit: int = 100) -> list[User]:
        """ユーザー一覧取得（復号なし）"""
        # 一覧表示では復号しない
        return self.repository.find_all(limit)
    
    def update_user(self, user_id: int, data: UserUpdateDTO) -> User | None:
        """ユーザー更新"""
        user = self.repository.find_by_id(user_id)
        if not user:
            return None
        
        # 更新対象フィールドのみ処理
        if data.email:
            normalized = normalize_for_search(data.email)
            user.email = encrypt(normalized)
            user.email_hash = generate_search_hash(normalized)
        
        if data.name:
            normalized = normalize_for_search(data.name)
            user.name = encrypt(normalized)
            user.name_hash = generate_search_hash(normalized)
        
        return self.repository.update(user)
```

**復号のルール**：

| シナリオ | 復号 | 理由 |
|---|---|---|
| 一覧表示 | ❌ しない | パフォーマンス・セキュリティ |
| 詳細表示 | ✅ する | 必要な情報 |
| 検索結果 | ✅ する | ユーザーに返す情報 |
| ログ出力 | ❌ しない | セキュリティ |
| 内部処理のみ | ❌ しない | 不要 |

---

### Route層

**責務**：
- Schema検証
- Serviceへの委譲
- **PIIをURLパスに含めない**

**実装パターン**：

```python
# features/user/route.py
from fastapi import APIRouter, Depends, HTTPException
from .service import UserService
from .schemas import (
    UserCreateSchema,
    UserUpdateSchema,
    UserResponseSchema,
    UserListResponseSchema
)

router = APIRouter(prefix="/users", tags=["users"])

@router.post("", response_model=UserResponseSchema)
async def create_user(
    data: UserCreateSchema,
    service: UserService = Depends()
):
    """ユーザー作成"""
    user = service.create_user(data)
    return UserResponseSchema.from_model(user)

@router.get("/search", response_model=UserResponseSchema)
async def search_by_email(
    email: str,
    service: UserService = Depends()
):
    """メールアドレスで検索"""
    user = service.find_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponseSchema.from_model(user)

@router.get("/{user_id}", response_model=UserResponseSchema)
async def get_user(
    user_id: int,
    service: UserService = Depends()
):
    """ユーザー詳細取得（IDで参照）"""
    user = service.get_user_detail(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponseSchema.from_model(user)

@router.get("", response_model=UserListResponseSchema)
async def list_users(
    limit: int = 100,
    service: UserService = Depends()
):
    """ユーザー一覧取得"""
    users = service.list_users(limit)
    return UserListResponseSchema(users=users)

@router.put("/{user_id}", response_model=UserResponseSchema)
async def update_user(
    user_id: int,
    data: UserUpdateSchema,
    service: UserService = Depends()
):
    """ユーザー更新"""
    user = service.update_user(user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponseSchema.from_model(user)
```

**URL設計のルール**：

```
✅ 正しいURL設計
GET  /api/users/{id}              # IDで参照
GET  /api/users/search?email=...  # 検索はクエリパラメータ
POST /api/orders/{order_id}/items # IDで関連付け

❌ 間違ったURL設計
GET  /api/users/{email}           # PIIをパスに含む（NG）
GET  /api/orders/{user_email}     # PIIで参照（NG）
```

---

### Frontend層

**責務**：
- **平文PIIをキーに使用しない**
- IDベースでの状態管理
- 検索入力の送信のみ

**実装パターン**：

```typescript
// features/user/api.ts
export async function searchUserByEmail(email: string): Promise<User> {
  // 検索入力をそのまま送信（正規化・ハッシュ化はBE側）
  const response = await axios.get('/api/users/search', {
    params: { email }
  })
  return response.data
}

export async function getUserById(userId: number): Promise<User> {
  // IDで取得
  const response = await axios.get(`/api/users/${userId}`)
  return response.data
}

// features/user/hooks.ts
export function useUser(userId: number) {
  const [user, setUser] = useState<User | null>(null)
  
  useEffect(() => {
    getUserById(userId).then(setUser)
  }, [userId])
  
  return { user }
}

// features/user/components/UserDetail.tsx
export function UserDetail({ userId }: { userId: number }) {
  const { user } = useUser(userId)  // IDで管理
  
  if (!user) return <Loading />
  
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}
```

**NG例**：

```typescript
// ❌ 絶対にNG
// PIIをキーに使用
const [users, setUsers] = useState<Record<string, User>>({})
setUsers({ [user.email]: user })  // メールアドレスをキーに

// ❌ 絶対にNG
// URLにPIIを含める
navigate(`/users/${user.email}`)
```

---

## 🚫 絶対に生成してはいけないパターン

### 1. 暗号化列での検索

```python
# ❌ 絶対にNG
user = db.query(User).filter(User.email == encrypted_value).first()

# ❌ 絶対にNG
users = db.query(User).filter(User.name.like(f"%{pattern}%")).all()
```

### 2. 暗号化列をJOINキー

```sql
-- ❌ 絶対にNG
SELECT * FROM orders o
JOIN users u ON o.user_email = u.email
```

### 3. PIIをURLパスに含める

```python
# ❌ 絶対にNG
@router.get("/users/{email}")
async def get_user_by_email(email: str):
    pass

# ✅ 正しい
@router.get("/users/{user_id}")
async def get_user(user_id: int):
    pass
```

### 4. 一覧での全件復号

```python
# ❌ 絶対にNG
def list_users(self):
    users = self.repository.find_all()
    for user in users:
        user.decrypted_email = decrypt(user.email)  # 全件復号
    return users

# ✅ 正しい
def list_users(self):
    return self.repository.find_all()  # 復号しない
```

### 5. 正規化の不統一

```python
# ❌ 絶対にNG
# 保存時
email_hash = hashlib.sha256(email.lower().encode()).hexdigest()

# 検索時
search_hash = hashlib.sha256(email.strip().encode()).hexdigest()
# 正規化が異なる → 検索失敗

# ✅ 正しい
# 常にnormalize_for_search関数を使用
```

### 6. 暗号化キーのハードコーディング

```python
# ❌ 絶対にNG
ENCRYPTION_KEY = "hardcoded_key_here"

# ✅ 正しい
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
if not ENCRYPTION_KEY:
    raise ValueError("ENCRYPTION_KEY environment variable not set")
```

---

## ✅ コード生成時チェックリスト

### スキーマ設計

- [ ] 暗号化列と`_hash`列がペアで存在
- [ ] `_hash`列にインデックスが張られている
- [ ] 主キーは`id`（PIIではない）

### Crypto Module

- [ ] `normalize_for_search`関数が定義されている
- [ ] `generate_search_hash`関数が定義されている
- [ ] `encrypt`関数がバージョンプレフィックスを付与
- [ ] `decrypt`関数がバージョンチェックを実行
- [ ] 暗号化キーは環境変数から取得

### Repository層

- [ ] 検索は`_hash`列のみ使用
- [ ] 暗号化列をWHERE条件に使用していない
- [ ] Repository内で復号していない
- [ ] IDベースの参照メソッドがある

### Service層

- [ ] 保存前に正規化→ハッシュ生成→暗号化の順で処理
- [ ] 検索時に正規化→ハッシュ生成→Repository呼び出し
- [ ] 復号は必要最小限
- [ ] 一覧取得で復号していない

### Route層

- [ ] URLパスにPIIを含めていない
- [ ] IDベースのエンドポイント設計
- [ ] 検索エンドポイントはクエリパラメータ使用

### Frontend層

- [ ] PIIをキー（状態管理）に使用していない
- [ ] IDベースで状態管理
- [ ] URLにPIIを含めていない

---

## 📊 判断フローチャート

### 検索機能実装時

```
検索機能を実装する

↓

検索対象は暗号化フィールド？
├─ YES → hash列で検索
│         ├─ 正規化関数適用
│         ├─ generate_search_hash呼び出し
│         ├─ Repository.find_by_*_hash実行
│         └─ 結果を復号して返す
│
└─ NO  → 通常の検索
          └─ WHERE句で直接検索
```

### データ保存時

```
データを保存する

↓

暗号化が必要なフィールド？
├─ YES → 暗号化 + ハッシュ生成
│         ├─ normalize_for_search適用
│         ├─ generate_search_hash → *_hash列
│         ├─ encrypt → *列
│         └─ 両方をDB保存
│
└─ NO  → 通常の保存
          └─ そのままDB保存
```

### データ取得時

```
データを取得する

↓

復号が必要？
├─ 詳細表示 → 復号する
├─ 検索結果 → 復号する
├─ 一覧表示 → 復号しない
└─ 内部処理 → 復号しない
```

---

## 🎯 コード生成の優先順位

1. **セキュリティ** > パフォーマンス > 利便性
2. **正規化の統一** > コードの簡潔さ
3. **IDベース参照** > PIIベース参照
4. **最小限の復号** > 全件復号

---

## 📝 テンプレート

### 新規暗号化フィールド追加時

```python
# 1. モデル定義
class Entity:
    {field} = Column(Text, nullable=False)           # 暗号化列
    {field}_hash = Column(Text, nullable=False)      # 検索ハッシュ列

# 2. マイグレーション
CREATE INDEX idx_{table}_{field}_hash ON {table}({field}_hash);

# 3. Repository
def find_by_{field}_hash(self, {field}_hash: str):
    return self.db.query(Entity).filter(
        Entity.{field}_hash == {field}_hash
    ).first()

# 4. Service
def find_by_{field}(self, {field}: str):
    normalized = normalize_for_search({field})
    search_hash = generate_search_hash(normalized)
    entity = self.repository.find_by_{field}_hash(search_hash)
    if entity:
        entity.decrypted_{field} = decrypt(entity.{field})
    return entity

# 5. Route
@router.get("/search")
async def search(
    {field}: str,
    service: EntityService = Depends()
):
    entity = service.find_by_{field}({field})
    if not entity:
        raise HTTPException(404)
    return EntityResponseSchema.from_model(entity)
```

---

**このガイドを常に参照し、セキュアで一貫性のある暗号化実装を生成してください。**
