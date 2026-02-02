# 設計基礎ガイド（AI開発アシスタント用）
## フロントエンド・バックエンド共通原則

> **このドキュメントの目的**  
> フレームワークに依存しない普遍的な設計原則を定義します。コード生成・提案時は、必ずこのガイドに従ってください。

---

## 📐 核心原則（最優先事項）

コード生成時は、常にこの3原則を守ってください：

1. **責務が単純**：1ファイル/関数は1つの仕事のみ
2. **依存が片方向**：上位→下位の流れを厳守
3. **ファイルが適度**：目安を超えたら分割を提案

---

## 🎯 責任の分離：3層アーキテクチャ

### 基本構造

すべてのシステムは以下の3層で構成されます：

```
入口層（Route/Controller）
  ↓
ロジック層（Service/UseCase）
  ↓
データ層（Repository/Gateway）
```

### 各層の責務定義

| 層 | 責務 | 許可されること | 禁止事項 |
|---|---|---|---|
| **Route/Controller** | 入出力 | - HTTPリクエスト受付<br/>- Schema検証<br/>- レスポンス返却<br/>- 認証チェック | - 業務判断<br/>- データベース操作<br/>- 複雑な計算 |
| **Service/UseCase** | 業務フロー | - 業務ルール判定<br/>- 処理の流れ制御<br/>- Repository呼び出し<br/>- トランザクション管理 | - HTTP処理<br/>- SQL直接実行<br/>- レスポンス生成 |
| **Repository/Gateway** | 永続化・外部I/O | - データ保存/取得<br/>- クエリ実装<br/>- 外部API呼び出し | - 業務判断<br/>- 複数Repositoryの組み合わせ<br/>- HTTPレスポンス生成 |

### コード生成時の判断フロー

コードを生成する際、以下のフローで配置先を決定してください：

```
このコードは何をする？
├─ 入力の整形・バリデーション → Route/Controller
├─ 業務として正しいかの判断 → Service/UseCase
└─ データの読み書き・外部呼び出し → Repository/Gateway
```

### 実装例

#### ✅ 正しい分離

```python
# Route層：入力受付とレスポンス
@router.post("/orders")
async def create_order(
    order_data: OrderCreateSchema,
    service: OrderService = Depends()
):
    result = await service.create_order(order_data)
    return OrderResponseSchema.from_model(result)

# Service層：業務ロジック
class OrderService:
    def __init__(self, repository: OrderRepository):
        self.repository = repository
    
    async def create_order(self, data: OrderCreateDTO) -> Order:
        # 業務ルール判定
        if data.total < 0:
            raise BusinessError("注文金額は0以上である必要があります")
        
        # 税金計算（業務ロジック）
        tax = self._calculate_tax(data.total)
        
        # Modelの組み立て
        order = Order(total=data.total, tax=tax)
        
        # Repositoryに保存を委譲
        return await self.repository.save(order)

# Repository層：データ永続化
class OrderRepository:
    def __init__(self, session: Session):
        self.session = session
    
    async def save(self, order: Order) -> Order:
        self.session.add(order)
        await self.session.commit()
        return order
```

#### ❌ 責務違反の例

```python
# ❌ Routeで業務ロジックとDB操作
@router.post("/orders")
async def create_order(order_data: dict, db: Session):
    # 業務判断（Serviceの責務）
    if order_data["total"] < 1000:
        tax = order_data["total"] * 0.08
    else:
        tax = order_data["total"] * 0.10
    
    # DB操作（Repositoryの責務）
    db.execute("INSERT INTO orders ...")

# ❌ Repositoryでビジネスロジック
class OrderRepository:
    async def save(self, order: Order):
        # 業務判断をしている
        if order.total < 0:
            raise ValueError("金額は0以上")
        db.save(order)

# ❌ ServiceでSQL直書き
class OrderService:
    async def get_orders(self):
        # SQL直接実行
        return await db.execute("SELECT * FROM orders")
```

---

## 📦 共通部材の分類と配置

### 分類基準

| 名称 | 役割 | 状態保持 | 依存度 | ディレクトリ |
|---|---|---|---|---|
| **コンポーネント** | UIの部品（FE） | あり得る | 中 | `components/` |
| **モジュール** | 機能のまとまり | あり得る | 中〜高 | `features/`, `modules/` |
| **ユーティリティ** | 純粋関数 | なし | 低 | `utils/` |

### コード生成時の判断基準

```
何を作る？
├─ 画面の部品・再利用UI → components/
├─ 業務機能のまとまり → features/ または modules/
└─ どこでも使える小関数 → utils/
```

### ユーティリティの制約

**ユーティリティは必ず以下を満たすこと：**

- 純粋関数（同じ入力 → 同じ出力）
- 状態を持たない
- 副作用がない
- 特定機能に依存しない

```typescript
// ✅ 正しいユーティリティ
export function formatDate(date: Date): string {
  return date.toLocaleDateString('ja-JP')
}

// ❌ 状態を持っている
let count = 0
export function getCount() {
  return ++count
}

// ❌ 特定機能に依存
import { User } from '@/features/user'
export function formatUser(user: User) { }
```

---

## ⏰ 共通化のタイミング：3回ルール

### 基本方針

コード生成時は、以下のルールに従ってください：

| 出現回数 | 対応 |
|---|---|
| **1回目** | そのまま実装（コピーOK） |
| **2回目** | 共通化を検討・実装 |
| **3回目** | 設計を見直す（粒度がズレている可能性） |

### 判断フロー

```
同じようなコードが出現
├─ 1回目 → そのまま実装
├─ 2回目 → 共通化を提案
└─ 3回目 → 設計見直しを提案
```

### 共通化の境界

**「一緒に変わるもの」は一緒に、「別々に変わるもの」は別々に**

```typescript
// ✅ 変化が同期するものを共通化
// ユーザーの表示形式は全体で統一
export function formatUserName(user: User): string {
  return `${user.lastName} ${user.firstName}`
}

// ❌ 変化が独立しているものを無理に共通化
// 機能Aと機能Bで異なる変更が頻繁に発生する場合は分ける
export function processData(data: any, type: string) {
  if (type === 'featureA') { /* ... */ }
  else if (type === 'featureB') { /* ... */ }
  // 分岐が増え続ける → 共通化すべきではなかった
}
```

---

## 📏 ファイルサイズ管理

### サイズ目安

コード生成時は、以下の目安を守ってください：

| 単位 | 警戒ライン | 分割推奨 |
|---|---|---|
| **ファイル** | 200〜400行 | 600行超 |
| **関数/メソッド** | 30〜60行 | 100行超 |
| **Componentのrender** | 画面1〜2スクロール | 画面3スクロール超 |

### 分割が必要な兆候

以下の場合は、ファイル分割を提案してください：

1. **条件分岐が深い**（ネスト3層以上）
2. **複数の責務が混在**（UI + データ取得 + 整形 + 保存）
3. **スクロールしないと全体が見えない**
4. **コメントで「セクション」を分けている**

### 分割例

#### ❌ 分割前（大きすぎる）

```typescript
// UserManagement.tsx - 800行
export function UserManagement() {
  // 状態管理
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({})
  
  // API呼び出し
  useEffect(() => {
    fetchUsers().then(setUsers)
  }, [])
  
  // フィルタリングロジック
  const filteredUsers = users.filter(/* ... */)
  
  // ソートロジック
  const sortedUsers = filteredUsers.sort(/* ... */)
  
  // 大量のJSX
  return (
    <div>
      {/* 500行のJSX */}
    </div>
  )
}
```

#### ✅ 分割後（適切なサイズ）

```typescript
// hooks/useUsers.ts - 80行
export function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    fetchUsers().then(setUsers)
  }, [])
  
  return { users, loading }
}

// hooks/useUserFilters.ts - 60行
export function useUserFilters(users: User[]) {
  const [filters, setFilters] = useState({})
  const filteredUsers = useMemo(() => 
    users.filter(/* ... */), [users, filters]
  )
  return { filteredUsers, filters, setFilters }
}

// components/UserManagement.tsx - 150行
export function UserManagement() {
  const { users, loading } = useUsers()
  const { filteredUsers, filters } = useUserFilters(users)
  
  return (
    <div>
      <UserFilters filters={filters} />
      <UserList users={filteredUsers} />
    </div>
  )
}

// components/UserList.tsx - 100行
export function UserList({ users }) {
  return <div>{/* 表示ロジック */}</div>
}
```

---

## 🏗️ ディレクトリ構造

### 推奨構造：機能単位 + レイヤー

コード生成時は、以下の構造に従ってください：

```
src/
├── features/              # 機能単位で分割
│   ├── user/
│   │   ├── api.ts         # API通信
│   │   ├── hooks.ts       # Hook（FE）
│   │   ├── service.py     # Service（BE）
│   │   ├── repository.py  # Repository（BE）
│   │   ├── types.ts       # 型定義
│   │   ├── components/    # UI部品
│   │   └── utils.ts       # 機能専用ユーティリティ
│   ├── upload/
│   └── auth/
└── shared/                # 共通部材
    ├── components/        # 共通UI
    ├── types/             # 共通型
    ├── utils/             # 共通ユーティリティ
    └── constants/         # 定数
```

### ファイル配置ルール

| コードの性質 | 配置先 |
|---|---|
| 特定機能専用 | `features/{feature}/` |
| 2つ以上の機能で使用 | `shared/` |
| 将来的に共通化の可能性 | 一旦 `features/` に置く |

---

## ⬇️ 依存の向き：厳格なルール

### 基本ルール

**必ず上位→下位の方向で依存させること**

```
UI層（Route/Component）
  ↓ 呼び出しOK
ロジック層（Service/Hook）
  ↓ 呼び出しOK
データ層（Repository/API）
```

### 禁止パターン

以下のインポートは**絶対に生成しないこと**：

```typescript
// ❌ 下位が上位をimport
// repository.ts
import { UserService } from './service'  // NG

// ❌ sharedがfeaturesをimport
// shared/utils/format.ts
import { User } from '@/features/user/types'  // NG

// ❌ 循環依存
// userService.ts
import { OrderService } from './orderService'
// orderService.ts
import { UserService } from './userService'  // NG
```

### 正しいパターン

```typescript
// ✅ 上位が下位をimport
// service.ts
import { UserRepository } from './repository'  // OK

// ✅ 同階層のimport
// features/user/service.ts
import { UserRepository } from './repository'  // OK

// ✅ sharedのimport
// features/user/service.ts
import { formatDate } from '@/shared/utils/format'  // OK
```

### 共通処理が必要な場合

複数のServiceで共通処理が必要な場合：

```typescript
// ✅ 共通Serviceを作る
// shared/services/commonService.ts
export class CommonService {
  static validateEmail(email: string): boolean { }
}

// features/user/service.ts
import { CommonService } from '@/shared/services/commonService'

// features/auth/service.ts
import { CommonService } from '@/shared/services/commonService'
```

---

## 🧪 テスト・ログ・例外の配置

### 配置ルール

| 要素 | 配置場所 | 理由 |
|---|---|---|
| **入力バリデーション** | Route/Controller | 不正データを早期に弾く |
| **業務例外定義** | Service | 業務ルールの違反を表現 |
| **例外のHTTP変換** | Route/Controller | 業務エラー→HTTPステータス |
| **ログ出力** | I/O境界 | API、DB、外部連携 |
| **テスト重点** | Service | 最も壊れやすいロジック |

### 実装例

```python
# ✅ 入力バリデーション：Route
@router.post("/users")
async def create_user(user: UserCreateSchema):  # Schema自動検証
    return await service.create_user(user)

# ✅ 業務例外定義：Service
class UserService:
    async def create_user(self, data: UserCreateDTO):
        if data.age < 18:
            raise BusinessError("未成年は登録できません")
        return await self.repository.save(User.from_dto(data))

# ✅ 例外のHTTP変換：Route（ミドルウェア/例外ハンドラー）
@app.exception_handler(BusinessError)
async def business_error_handler(request, exc):
    return JSONResponse(
        status_code=400,
        content={"message": str(exc)}
    )

# ✅ ログ：I/O境界（Repository）
class UserRepository:
    async def save(self, user: User):
        logger.info(f"保存開始: user_id={user.id}")
        try:
            result = await self.session.commit()
            logger.info(f"保存完了: user_id={user.id}")
            return result
        except Exception as e:
            logger.error(f"保存失敗: user_id={user.id}, error={e}")
            raise
```

---

## 🏷️ 命名規則

### 接尾辞による役割の明示

コード生成時は、必ず以下の接尾辞を使用してください：

| 接尾辞 | 役割 | 例 |
|---|---|---|
| **Service** | フロー・判断 | `UserService`, `OrderService` |
| **Repository** | CRUD | `UserRepository`, `OrderRepository` |
| **Client** | 外部API | `StripeClient`, `EmailClient` |
| **Mapper** | 変換 | `UserMapper`, `OrderMapper` |
| **DTO** | データ転送 | `UserCreateDTO`, `OrderResponseDTO` |
| **Schema** | 検証定義 | `UserCreateSchema`, `OrderSchema` |
| **Model/Entity** | ドメインモデル | `User`, `Order` |
| **VO** | 値オブジェクト | `Email`, `Money`, `UserId` |

### 避けるべき命名

- `Utils`（役割が不明確・肥大化しやすい）
- `Helper`（同上）
- `Manager`（責務が広すぎる傾向）
- `Handler`（曖昧）

### ファイル名規則

```
# BE
{entity}_service.py
{entity}_repository.py
{entity}_schema.py
{entity}_model.py

# FE
{Entity}Component.tsx
use{Feature}.ts
{entity}.api.ts
{entity}.types.ts
```

---

## ✅ コード生成時チェックリスト

コードを生成する前に、以下を確認してください：

### 責務の確認
- [ ] このファイル/関数の責務は1つに限定されているか
- [ ] 責務を1文で説明できるか

### レイヤーの確認
- [ ] Route/Controllerに業務ロジックが含まれていないか
- [ ] Serviceに直接SQL/HTTP処理が含まれていないか
- [ ] Repositoryに業務判断が含まれていないか

### 依存の確認
- [ ] 依存の向きは上位→下位か
- [ ] 循環依存は発生していないか
- [ ] sharedがfeaturesに依存していないか

### サイズの確認
- [ ] ファイルは600行以下か
- [ ] 関数/メソッドは100行以下か
- [ ] 超える場合、分割を提案したか

### 共通化の確認
- [ ] 1回目の出現でいきなり共通化していないか
- [ ] 共通化は2回目以降か
- [ ] 共通化した要素は「一緒に変わる」ものか

### 命名の確認
- [ ] 接尾辞で役割が明確か
- [ ] Utils, Helper, Managerを使っていないか

---

## 🚫 絶対に生成してはいけないパターン

### 1. 責務混在

```typescript
// ❌ 絶対にNG
@router.post("/orders")
async def create_order(data: dict, db: Session):
    # 業務ロジック + DB操作 + HTTP処理が混在
    if data["total"] < 0:
        return JSONResponse({"error": "Invalid"})
    tax = calculate_tax(data["total"])
    db.execute("INSERT INTO orders ...")
    return {"status": "ok"}
```

### 2. 依存逆流

```typescript
// ❌ 絶対にNG
// repository.ts
import { OrderService } from './service'  // 下位→上位

// shared/utils.ts
import { User } from '@/features/user/types'  // shared→features
```

### 3. 巨大ファイル

```typescript
// ❌ 絶対にNG
// service.ts - 2000行
// 分割を提案すること
```

### 4. 状態を持つユーティリティ

```typescript
// ❌ 絶対にNG
// utils/counter.ts
let count = 0
export function increment() {
  return ++count
}
```

### 5. 早すぎる共通化

```typescript
// ❌ 絶対にNG（1回目の出現で共通化）
// まだパターンが見えていない段階での抽象化
```

---

## 📊 判断フローチャート

### コード配置の判断

```
コードを書く前に確認：

このコードは何をする？
├─ HTTPリクエスト処理・バリデーション → Route/Controller
├─ 業務判断・フロー制御 → Service/UseCase
├─ データ永続化・外部API → Repository/Gateway
└─ どこでも使える純粋関数 → Utility

どこに置く？
├─ 1つの機能だけで使う → features/{feature}/
├─ 2つ以上の機能で使う → shared/
└─ 迷ったら → features/に置く（後で共通化）

サイズは適切？
├─ 600行超 → 分割を提案
├─ 400〜600行 → 警告を出す
└─ 400行以下 → OK

依存の向きは？
├─ 上位→下位 → OK
├─ 下位→上位 → NG（設計を見直す）
└─ 循環依存 → NG（共通Serviceに抽出）
```

---

## 🎯 コード生成の優先順位

複数の要件が競合する場合、以下の優先順位で判断してください：

1. **依存の向き** > サイズ > 共通化
2. **責務の単純さ** > パフォーマンス
3. **明示的** > 暗黙的
4. **分割** > 統合

---

**このガイドを常に参照し、一貫性のある高品質なコードを生成してください。**
