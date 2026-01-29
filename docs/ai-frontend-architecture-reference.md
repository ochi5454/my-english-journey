# フロントエンドアーキテクチャ設計ガイド（AI開発アシスタント用）
## Vite + React + TypeScript

> **このドキュメントの目的**  
> このプロジェクトにおけるフロントエンドアーキテクチャの設計原則、ディレクトリ構造、責務分離、およびコーディング規約を定義します。  
> コード生成・提案時は、必ずこのガイドに従ってください。

---

## 📐 アーキテクチャの基本構造

### 全体の流れ

フロントエンドは以下の流れで動作します：

```
ユーザー操作
  ↓
Component（画面）
  ↓
Hook（状態・副作用）
  ↓
API（通信）
  ↓
Data（取得した中身）
  ↓
Component（再描画）
```

### ディレクトリ構成

```
src/
├── api/              # API通信層
├── components/       # 再利用可能なUIコンポーネント
├── pages/            # ページ単位のコンポーネント
├── hooks/            # カスタムHook
├── types/            # 型定義
├── styles/           # スタイル定義
├── assets/           # 静的素材
└── utils/            # ユーティリティ関数
```

---

## 🎯 各要素の責務定義

### API層（`api/`）

**責務**：
- バックエンドとのHTTP通信
- エンドポイント呼び出し
- エラーハンドリング
- レスポンスの型変換

**許可されること**：
- axios、fetchなどのHTTPクライアント使用
- エンドポイントURLの定義
- リクエスト/レスポンスのインターセプター
- 通信エラーの捕捉と変換

**禁止事項**：
- UIロジック（画面表示・状態管理）
- 直接的なstate操作
- React Hooksの使用
- JSX/TSXの記述

**典型的なパターン**：

```typescript
// ✅ 良い例
export async function fetchSlides(): Promise<Slide[]> {
  try {
    const response = await axios.get<Slide[]>('/api/slides')
    return response.data
  } catch (error) {
    throw new APIError('スライドの取得に失敗しました', error)
  }
}

export async function createSlide(data: SlideCreateData): Promise<Slide> {
  const response = await axios.post<Slide>('/api/slides', data)
  return response.data
}

// ❌ 悪い例
export function useSlides() {
  const [slides, setSlides] = useState([])  // Hookを使っている
  // ...
}
```

**命名規則**：
- ファイル名：`{entity}.ts`（例：`slides.ts`, `users.ts`）
- 関数名：`{verb}{Entity}`（例：`fetchSlides`, `createUser`, `updateProfile`）

---

### Component層（`components/`, `pages/`）

**責務**：
- UIの構造定義
- ユーザー操作の受付
- Hookを通じた状態管理
- propsを通じたデータ受け渡し

**許可されること**：
- JSX/TSXの記述
- React Hooksの使用（useState, useEffect, カスタムHook等）
- イベントハンドラーの定義
- 条件分岐による表示制御

**禁止事項**：
- 直接的なAPI呼び出し（axios.get等を直接記述）
- 複雑なビジネスロジック
- データ変換・計算ロジック（Utilityに委譲）
- グローバルstateの直接操作

**典型的なパターン**：

```tsx
// ✅ 良い例
type SlideCardProps = {
  slide: Slide
  onEdit: (id: number) => void
  onDelete: (id: number) => void
}

export function SlideCard({ slide, onEdit, onDelete }: SlideCardProps) {
  return (
    <div className="slide-card">
      <h3>{slide.title}</h3>
      <p>{slide.content}</p>
      <button onClick={() => onEdit(slide.id)}>編集</button>
      <button onClick={() => onDelete(slide.id)}>削除</button>
    </div>
  )
}

// ✅ 良い例（ページコンポーネント）
export function SlidesPage() {
  const { slides, loading, error } = useSlides()
  const navigate = useNavigate()
  
  if (loading) return <Loading />
  if (error) return <ErrorMessage error={error} />
  
  return (
    <div>
      <h1>スライド一覧</h1>
      {slides.map(slide => (
        <SlideCard 
          key={slide.id} 
          slide={slide}
          onEdit={(id) => navigate(`/slides/${id}/edit`)}
        />
      ))}
    </div>
  )
}

// ❌ 悪い例
export function SlidesList() {
  const [slides, setSlides] = useState([])
  
  useEffect(() => {
    // Component内で直接API呼び出し
    axios.get('/api/slides').then(res => setSlides(res.data))
  }, [])
  
  // 複雑なビジネスロジック
  const validSlides = slides.filter(s => {
    const date = new Date(s.createdAt)
    const now = new Date()
    return (now.getTime() - date.getTime()) / 1000 / 60 / 60 / 24 < 30
  })
  
  return <div>{/* ... */}</div>
}
```

**命名規則**：
- コンポーネントファイル：`{ComponentName}.tsx`（PascalCase）
- props型：`{ComponentName}Props`
- イベントハンドラー：`handle{Event}`（例：`handleClick`, `handleSubmit`）

---

### Hook層（`hooks/`）

**責務**：
- 状態管理（useState）
- 副作用管理（useEffect）
- API呼び出しのオーケストレーション
- ロジックの再利用

**許可されること**：
- React Hooksの使用
- API関数の呼び出し
- state管理
- エラーハンドリング
- データ変換（軽度）

**禁止事項**：
- JSX/TSXの返却
- DOMの直接操作
- グローバル変数の直接操作

**典型的なパターン**：

```typescript
// ✅ 良い例
export function useSlides() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    const loadSlides = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchSlides()
        setSlides(data)
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    
    loadSlides()
  }, [])
  
  return { slides, loading, error }
}

// ✅ 良い例（操作も含む）
export function useSlideOperations() {
  const [slides, setSlides] = useState<Slide[]>([])
  
  const addSlide = async (data: SlideCreateData) => {
    const newSlide = await createSlide(data)
    setSlides(prev => [...prev, newSlide])
  }
  
  const removeSlide = async (id: number) => {
    await deleteSlide(id)
    setSlides(prev => prev.filter(s => s.id !== id))
  }
  
  return { slides, addSlide, removeSlide }
}

// ❌ 悪い例
export function useSlideList() {
  const slides = [/* ... */]
  // JSXを返している
  return <ul>{slides.map(s => <li key={s.id}>{s.title}</li>)}</ul>
}
```

**命名規則**：
- ファイル名：`use{Feature}.ts`（例：`useSlides.ts`, `useAuth.ts`）
- Hook名：`use{Feature}`（必ず`use`で始める）

---

### Type層（`types/`）

**責務**：
- データ構造の定義
- APIレスポンス/リクエストの型定義
- Component propsの型定義
- ドメインモデルの型定義

**許可されること**：
- TypeScript型定義（type, interface）
- 型ガード関数
- Enum定義
- ジェネリック型

**禁止事項**：
- ロジックの実装
- 関数の実装（型ガード以外）
- 状態管理

**典型的なパターン**：

```typescript
// ✅ 良い例
export type Slide = {
  id: number
  title: string
  content: string
  imageUrl?: string
  createdAt: string
  updatedAt: string
}

export type SlideCreateData = Omit<Slide, 'id' | 'createdAt' | 'updatedAt'>

export type SlideUpdateData = Partial<SlideCreateData>

export type APIResponse<T> = {
  data: T
  message?: string
  status: number
}

// 型ガードは許可
export function isSlide(obj: unknown): obj is Slide {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj
  )
}

// ❌ 悪い例
export type Slide = {
  id: number
  title: string
  // ロジックを含めてはいけない
  getTitleWithPrefix(): string
}
```

**命名規則**：
- ファイル名：`{entity}.ts`（例：`slide.ts`, `user.ts`）
- 型名：PascalCase（例：`Slide`, `UserProfile`）
- APIリクエスト型：`{Entity}CreateData`, `{Entity}UpdateData`
- APIレスポンス型：`{Entity}Response`, `{Entity}ListResponse`

---

### Style層（`styles/`）

**責務**：
- スタイル定義
- デザイントークン管理
- テーマ設定

**推奨方法**：
- CSS Modules
- styled-components
- Tailwind CSS

**禁止事項**：
- ロジックとスタイルの混在
- インラインスタイルの乱用

**典型的なパターン**：

```css
/* ✅ 良い例（CSS Modules） */
.slideCard {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-background);
}

.slideCard:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.slideTitle {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}
```

```typescript
// ✅ 良い例（styled-components）
import styled from 'styled-components'

export const SlideCard = styled.div`
  padding: 16px;
  border: 1px solid ${props => props.theme.borderColor};
  border-radius: 8px;
`
```

---

### Asset層（`assets/`）

**責務**：
- 静的ファイルの管理
- 画像・アイコン・フォント等

**典型的なパターン**：

```typescript
// ✅ 良い例
import logo from '@/assets/logo.png'
import Icon from '@/assets/icons/edit.svg'

export function Header() {
  return (
    <header>
      <img src={logo} alt="ロゴ" />
      <Icon />
    </header>
  )
}
```

---

### Utility層（`utils/`）

**責務**：
- 純粋関数の提供
- 共通処理の実装
- データ変換・フォーマット

**許可されること**：
- 純粋関数（同じ入力 → 同じ出力）
- データ変換
- バリデーション
- フォーマット処理

**禁止事項**：
- 状態の保持
- React Hooksの使用
- DOM操作
- API呼び出し

**典型的なパターン**：

```typescript
// ✅ 良い例
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

// ❌ 悪い例
let count = 0  // 状態を持っている
export function incrementCount() {
  return ++count
}
```

**命名規則**：
- ファイル名：`{category}.ts`（例：`format.ts`, `validate.ts`, `array.ts`）
- 関数名：`{verb}{Noun}`（例：`formatDate`, `validateEmail`）

---

## 🔗 レイヤー間のデータフロー

### 推奨フロー

```
User Action
  ↓
Component（イベントハンドラー）
  ↓
Hook（状態更新・API呼び出し）
  ↓
API（HTTP通信）
  ↓
Backend
  ↓
API（レスポンス受信）
  ↓
Hook（state更新）
  ↓
Component（再レンダリング）
```

### データの流れ方

| 元 | 先 | 渡すもの |
|---|---|---|
| Component → Hook | - | 引数（ID、フィルター条件等） |
| Hook → API | - | リクエストデータ |
| API → Backend | HTTP | JSON |
| Backend → API | HTTP | JSON |
| API → Hook | Promise | 型付きデータ |
| Hook → Component | return値 | state、関数 |

---

## ✅ コーディング規約

### Componentの原則

1. **単一責任の原則**：1つのComponentは1つの責務
2. **props は読み取り専用**：受け取ったpropsを変更しない
3. **軽量に保つ**：ロジックはHookに委譲
4. **再利用性**：汎用的に設計

### Hookの原則

1. **必ず `use` で始める**：命名規則を守る
2. **ロジックのカプセル化**：関連するロジックをまとめる
3. **依存配列を明示**：useEffectの依存は正確に
4. **エラーハンドリング**：必ず実装

### API層の原則

1. **型安全**：レスポンスは必ず型定義
2. **エラー処理**：すべてのAPIでtry-catch
3. **一貫性**：命名・戻り値の形式を統一

---

## ❌ アンチパターン集

### 1. Component内で直接API呼び出し

```tsx
// ❌ NG
export function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    axios.get('/api/users').then(res => setUsers(res.data))
  }, [])
  
  return <div>{/* ... */}</div>
}

// ✅ OK
export function UserList() {
  const { users, loading } = useUsers()  // Hookに委譲
  return <div>{/* ... */}</div>
}
```

---

### 2. Hook内でJSXを返す

```typescript
// ❌ NG
export function useUserList() {
  const users = [/* ... */]
  return <ul>{users.map(u => <li>{u.name}</li>)}</ul>
}

// ✅ OK
export function useUsers() {
  const [users, setUsers] = useState([])
  return { users }  // データだけ返す
}
```

---

### 3. any型の乱用

```typescript
// ❌ NG
const data: any = await fetchSlides()
const user: any = getUserInfo()

// ✅ OK
const data: Slide[] = await fetchSlides()
const user: User = getUserInfo()
```

---

### 4. Utility関数に状態を持たせる

```typescript
// ❌ NG
let cache: Record<string, any> = {}

export function getCached(key: string) {
  return cache[key]
}

// ✅ OK（状態が必要ならHookに）
export function useCache<T>(key: string) {
  const [cache, setCache] = useState<Record<string, T>>({})
  return { cache, setCache }
}
```

---

## 🎯 コード生成時のチェックリスト

コードを生成・提案する際は、以下を確認してください：

- [ ] 適切なディレクトリに配置されているか
- [ ] 責務が明確で単一か
- [ ] 型定義が適切か（anyを使っていないか）
- [ ] Component内にビジネスロジックがないか
- [ ] Hook内にJSXがないか
- [ ] API層が通信処理のみか
- [ ] 命名規則に従っているか
- [ ] propsの型定義があるか
- [ ] 依存の方向が正しいか（循環依存がないか）

---

## 🔧 実装時の判断基準

### 「この処理はどこに書くべき？」

| 処理内容 | 配置先 |
|---|---|
| HTTP通信 | API層 |
| 状態管理 | Hook |
| 画面表示 | Component |
| データ変換・フォーマット | Utility |
| 型定義 | Type層 |
| スタイル | Style層 |
| 条件分岐による表示制御 | Component |
| 複雑なビジネスロジック | Hook |
| イベントハンドラー | Component |

---

### 「新しいHookを作るべき？」

以下の場合は新しいHookを作成：
- 複数のComponentで同じロジックを使う
- Component内のロジックが複雑になってきた（50行超え）
- 状態管理とAPI呼び出しがセット
- テストしやすくしたい

以下の場合は既存Componentに含める：
- そのComponentでしか使わないシンプルなstate
- 1-2行程度の軽いロジック

---

### 「Componentを分割すべき？」

以下の場合はComponentを分割：
- 100行を超えた
- 明確に異なる責務がある（Header、Footer、Contentなど）
- 再利用したい部分がある
- 可読性が下がってきた

---

## 📚 バックエンドとの対応関係

| フロントエンド | バックエンド | 役割 |
|---|---|---|
| API層 | Route層 | 外部との窓口 |
| Type定義 | Schema | データの契約 |
| Hook | Service | ロジック担当 |
| Utility | Utility | 共通処理 |
| Component | （対応なし） | 表示専用 |

---

## ⚡ クイックリファレンス

### 各層の一言まとめ

| 層 | 一言 | キーワード |
|---|---|---|
| **API** | データを取る | HTTP、通信、エラー |
| **Component** | 表示する | JSX、UI、イベント |
| **Hook** | つなぐ | 状態、副作用、ロジック |
| **Type** | 約束する | 型、契約、安全 |
| **Utility** | 補助する | 純粋関数、変換 |

---

**このガイドを常に参照し、一貫性のあるコードを生成してください。**
