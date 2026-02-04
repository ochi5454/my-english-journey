# バックエンドアーキテクチャ設計ガイド（AI開発アシスタント用）

> **このドキュメントの目的**  
> このプロジェクトにおけるバックエンドアーキテクチャの設計原則、レイヤー構造、命名規則、およびコーディング規約を定義します。  
> コード生成・提案時は、必ずこのガイドに従ってください。

---

## 📐 アーキテクチャの基本構造

### 2つの軸

このプロジェクトは以下の2軸で構成されます：

1. **縦軸（処理の責務）**: Route → Service → Repository
2. **横軸（データの形）**: Schema → DTO → Model → VO

### ディレクトリ構成

```
project/
├── routers/        # Route層
├── schemas/        # Schema / DTO定義
├── services/       # Service層（業務ロジック）
└── database/       # Repository + ORM Model
```

---

## 🔷 縦軸：レイヤーの責務定義

### Route層（`routers/`）

**責務**：
- HTTPリクエストの受信とレスポンスの返却
- Schemaによる入力バリデーション
- 認証・認可のチェック
- Serviceへの処理委譲

**許可されること**：
- HTTPステータスコードの設定
- ヘッダーの操作
- Schemaを使った入出力の型定義
- 例外ハンドリング（HTTPエラーへの変換）

**禁止事項**：
- 業務ロジックの実装
- 直接的なDB操作
- 複雑な計算やデータ変換
- Modelを直接レスポンスとして返す

**典型的なパターン**：
```python
# ✅ 良い例
@router.post("/users")
async def create_user(user_data: UserCreateSchema, service: UserService):
    result = await service.create_user(user_data)
    return UserResponseSchema.from_model(result)

# ❌ 悪い例
@router.post("/users")
async def create_user(user_data: UserCreateSchema, db: Session):
    # Routeで業務ロジックを書いてはいけない
    if user_data.age < 18:
        raise HTTPException(400, "未成年は登録できません")
    # 直接DBを操作してはいけない
    db_user = User(**user_data.dict())
    db.add(db_user)
```

---

### Service層（`services/`）

**責務**：
- 業務ロジックの実装
- トランザクション管理
- 複数Repositoryの組み合わせ
- DTO/Model間の変換

**許可されること**：
- 業務ルールの判定
- 計算処理
- 複数のRepositoryメソッドの呼び出し
- エラー時のビジネス例外の送出
- DTO・Model・VOの操作

**禁止事項**：
- SQLの直接記述
- HTTPに関する処理
- ORMのクエリビルダーの直接使用（Repositoryに委譲すること）

**典型的なパターン**：
```python
# ✅ 良い例
class UserService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo
    
    async def create_user(self, data: UserCreateDTO) -> User:
        # 業務ルールのチェック
        if data.age < 18:
            raise BusinessError("未成年は登録できません")
        
        # Modelの組み立て
        user = User(
            name=data.name,
            email=Email(data.email),  # VO使用
            age=data.age
        )
        
        # Repositoryに保存を委譲
        return await self.user_repo.save(user)

# ❌ 悪い例
class UserService:
    async def create_user(self, data: UserCreateDTO) -> User:
        # SQLを直接書いてはいけない
        result = await db.execute(
            "INSERT INTO users (name, email) VALUES (?, ?)",
            data.name, data.email
        )
```

---

### Repository層（`database/`）

**責務**：
- データの永続化・取得
- クエリの実装
- トランザクションの実行

**許可されること**：
- ORM（SQLAlchemy等）の使用
- クエリビルダーの使用
- 複雑な検索条件の実装
- インデックスやパフォーマンス最適化

**禁止事項**：
- 業務ロジックの実装
- HTTPレスポンスの生成
- 複数のRepositoryを呼び出す処理（Serviceの責務）

**典型的なパターン**：
```python
# ✅ 良い例
class UserRepository:
    def __init__(self, session: Session):
        self.session = session
    
    async def save(self, user: User) -> User:
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user
    
    async def find_by_email(self, email: str) -> Optional[User]:
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

# ❌ 悪い例
class UserRepository:
    async def create_user_if_valid(self, user: User) -> User:
        # 業務ロジックはServiceで行うべき
        if user.age < 18:
            raise ValueError("未成年は登録できません")
        return await self.save(user)
```

---

## 🔶 横軸：データ型の定義

### Schema（`schemas/`）

**目的**：API境界での契約を定義

**用途**：
- リクエストボディの定義
- レスポンスの定義
- バリデーションルールの定義

**特徴**：
- Pydantic等のバリデーションライブラリを使用
- 外部向けのフィールド名・形式
- APIバージョンごとに分離可能

**命名規則**：
- リクエスト：`{Entity}CreateSchema`, `{Entity}UpdateSchema`
- レスポンス：`{Entity}ResponseSchema`, `{Entity}ListResponseSchema`

---

### DTO (Data Transfer Object)

**目的**：層をまたいでデータを運ぶ

**用途**：
- Route → Service へのデータ受け渡し
- Service → Repository へのデータ受け渡し
- 外部APIからのデータ受け取り

**特徴**：
- ロジックを持たない（純粋なデータ容器）
- 不変（immutable）であることが望ましい

**命名規則**：
- `{Entity}DTO`, `{Entity}CreateDTO`, `{Entity}UpdateDTO`

**小規模プロジェクトでの扱い**：
- SchemaとDTOを分離せず、Schemaをそのまま使用してもOK

---

### Model / Entity

**目的**：業務の実体を表現

**用途**：
- 業務ロジックの中心
- データベースのテーブルと対応（ORM）
- ドメインルールの実装

**特徴**：
- 業務に関するメソッドを持つ
- VOを含むことができる
- 永続化可能

**命名規則**：
- `{Entity}`, `{Entity}Model`（例：`User`, `Order`）

**配置**：
- `database/models/` または `models/`

---

### VO (Value Object)

**目的**：意味のある値を表現し、業務ルールを守る

**用途**：
- メールアドレス、電話番号、金額など
- バリデーションを内包
- 不変オブジェクト

**特徴**：
- 等価性は値で判断
- 生成時にバリデーション
- イミュータブル

**命名規則**：
- `{Concept}` または `{Concept}VO`（例：`Email`, `Money`, `PhoneNumber`）

**実装例**：
```python
# ✅ 良い例
class Email:
    def __init__(self, value: str):
        if not self._is_valid(value):
            raise ValueError(f"Invalid email: {value}")
        self._value = value
    
    @property
    def value(self) -> str:
        return self._value
    
    @staticmethod
    def _is_valid(email: str) -> bool:
        return "@" in email and "." in email.split("@")[1]
```

---

## ✅ コーディング規約

### レイヤー間のデータフロー

```
Client
  ↓ JSON
Route (Schema)
  ↓ Schema/DTO
Service (DTO, Model, VO)
  ↓ Model
Repository (Model)
  ↓ ORM
Database
```

**ルール**：
1. Route → Service：SchemaまたはDTOで渡す
2. Service内：Model、VO、DTOを使用
3. Service → Repository：Modelで渡す
4. Repository → Service：Modelで返す
5. Service → Route：Modelで返す
6. Route → Client：Schemaで返す（Modelを直接返さない）

---

### 依存関係のルール

**依存の方向**：
```
Route → Service → Repository → Model
```

**禁止される依存**：
- Repository → Service
- Service → Route
- Model → Route/Service/Repository

---

### 命名規則

#### ファイル名
- `{entity}_router.py` - Routeファイル
- `{entity}_service.py` - Serviceファイル
- `{entity}_repository.py` - Repositoryファイル
- `{entity}_schema.py` - Schemaファイル
- `{entity}_model.py` - Modelファイル

#### クラス名
- `{Entity}Router` - ただしFastAPIの場合は不要（`router`変数で十分）
- `{Entity}Service`
- `{Entity}Repository`
- `{Entity}Schema`, `{Entity}CreateSchema`, `{Entity}ResponseSchema`
- `{Entity}` - Model

#### メソッド名
- Repository：`save`, `find_by_id`, `find_all`, `delete`, `update`
- Service：業務を表す名前（`create_user`, `calculate_total`, `approve_order`）

---

## ❌ アンチパターン集

### 1. Route層で業務ロジック

```python
# ❌ NG
@router.post("/orders")
async def create_order(order: OrderCreateSchema):
    if order.total < 1000:
        tax = order.total * 0.08
    else:
        tax = order.total * 0.10
    # ...
```

**理由**：業務ルールはServiceで管理すべき

---

### 2. Service層でSQL直書き

```python
# ❌ NG
class OrderService:
    async def get_orders(self):
        return await db.execute("SELECT * FROM orders")
```

**理由**：データアクセスはRepositoryに委譲すべき

---

### 3. ModelをそのままAPIレスポンス

```python
# ❌ NG
@router.get("/users/{id}")
async def get_user(id: int, repo: UserRepository):
    user = await repo.find_by_id(id)
    return user  # Modelを直接返している
```

**理由**：Schemaを通してレスポンスを制御すべき

---

### 4. Repositoryで業務判定

```python
# ❌ NG
class UserRepository:
    async def save(self, user: User):
        if user.age < 18:  # 業務ルール
            raise ValueError("未成年は登録不可")
        # ...
```

**理由**：業務ルールはServiceで判定すべき

---

### 5. 循環依存

```python
# ❌ NG
# user_service.py
from order_service import OrderService

class UserService:
    def __init__(self, order_service: OrderService):
        pass

# order_service.py
from user_service import UserService

class OrderService:
    def __init__(self, user_service: UserService):
        pass
```

**理由**：依存は一方向にすべき。共通処理は別のServiceに切り出す

---

## 🎯 コード生成時のチェックリスト

コードを生成・提案する際は、以下を確認してください：

- [ ] 適切なレイヤーに配置されているか
- [ ] レイヤーの責務を逸脱していないか
- [ ] 依存の方向が正しいか
- [ ] 命名規則に従っているか
- [ ] DTO/Schema/Modelを適切に使い分けているか
- [ ] 業務ロジックがServiceに集約されているか
- [ ] Repositoryがデータアクセスのみに専念しているか
- [ ] RouteがHTTP処理のみに専念しているか

---

## 🔧 実装時の判断基準

### 「この処理はどこに書くべき？」

| 処理内容 | 配置先 |
|---|---|
| HTTPリクエストのパース | Route |
| バリデーション | Schema（形式）/ Service（業務） |
| 業務ルールの判定 | Service |
| 計算・集計 | Service |
| データの保存・取得 | Repository |
| 複数テーブルの結合 | Repository |
| トランザクション管理 | Service |
| メール送信 | Service（外部サービス呼び出し） |

---

### 「Schemaを分けるべき？」

| ケース | 判断 |
|---|---|
| 作成と更新で必須項目が違う | 分ける |
| 一覧と詳細で返す項目が違う | 分ける |
| 外部公開APIと内部API | 分ける |
| シンプルなCRUD | 分けなくてもOK |

---

### 「新しいServiceを作るべき？」

以下の場合は新しいServiceを作成：
- 明確に異なる業務領域（User、Order、Productなど）
- 責務が大きくなりすぎた（1クラス500行超えが目安）
- 複数のチームで並行開発する必要がある

以下の場合は既存Serviceにメソッド追加：
- 同じ業務領域内の操作
- 既存メソッドと強い関連がある
- クラスがまだ小さい（数百行以内）

---

## 📚 参考：よくある質問

### Q1: DTOとSchemaは必ず分けるべき？

**A**: プロジェクトの規模による
- **小規模**（数十API、数ヶ月）: Schemaのみで十分
- **中〜大規模**（数百API、年単位）: 分けると安全

---

### Q2: Modelにロジックを入れるべき？

**A**: 入れてもOKだが、制限付き
- **OK**: そのModelに閉じたロジック（例：フルネーム生成、年齢計算）
- **NG**: 他のModelやRepositoryが必要なロジック → Serviceへ

---

### Q3: Repositoryの粒度は？

**A**: 基本は1 Entity = 1 Repository
- 巨大になりそうなら、読み取り用と書き込み用に分割も検討
- 共通クエリは基底クラスに実装

---

## ⚡ クイックリファレンス

### 各層の一言まとめ

| 層 | 一言 | キーワード |
|---|---|---|
| **Route** | 受けて返す | HTTP、JSON、Schema |
| **Service** | 考える | 業務、ロジック、ルール |
| **Repository** | 保存する | DB、クエリ、永続化 |

### データ型の一言まとめ

| 型 | 一言 | キーワード |
|---|---|---|
| **Schema** | 約束 | API、契約、バリデーション |
| **DTO** | 箱 | 運搬、層間、受け渡し |
| **Model** | 実体 | 業務、DB、中心 |
| **VO** | 意味 | ルール、不変、値 |

---

**このガイドを常に参照し、一貫性のあるコードを生成してください。**
