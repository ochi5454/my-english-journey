# 自然言語による宛先フィルタリング機能 設計書

**作成日**: 2026-02-17
**バージョン**: 1.0
**目的**: 自然言語の指示で宛先リストから必要なメンバーを抽出する機能

---

## 進捗管理チェックリスト

### Phase 1: データモデル準備
- [x] `backend/models/recipient.py` に `employee_id`（社員番号）フィールド追加
- [x] マイグレーションファイル作成（`007_add_employee_id_to_recipient_members.py`）
- [x] マイグレーション実行（`alembic upgrade head`）

### Phase 2: バックエンド - LangChainフィルタリングサービス
- [x] `backend/services/langchain_recipient_filter.py` 新規作成
- [x] Pydanticモデル定義（MemberData, FilteredMember, FilterResult）
- [x] フィルタリング用プロンプトテンプレート作成
- [x] JsonOutputParser による構造化出力実装
- [x] エラーハンドリング実装

### Phase 3: バックエンド - API実装
- [x] `backend/routers/recipients.py` に `/recipients/lists/{list_id}/filter` エンドポイント追加
- [x] リクエスト/レスポンススキーマ定義（FilterMembersRequest, FilterMembersResponse, FilteredMemberResponse）
- [x] バリデーション実装（空リスト、空指示チェック）

### Phase 4: フロントエンド実装
- [x] `frontend/app/compose/page.tsx` のリスト追加モーダルにAIフィルタUI追加
- [x] `frontend/app/components/AIRecipientFilter.tsx` コンポーネント新規作成
- [x] AIフィルタリングAPI呼び出し実装
- [x] フィルタ結果プレビューUI実装（選択/除外リスト、チェックボックス）
- [x] 選択確定・宛先追加機能

### Phase 5: テスト・調整
- [x] バックエンド単体テスト作成（`backend/tests/test_langchain_recipient_filter.py` - 19テスト）
- [x] フロントエンド動作確認
- [x] エッジケース対応（空リスト、全除外など）
  - 空の指示時はボタン無効化
  - 全員除外時に警告メッセージ表示
  - 0件選択時は確定ボタン無効化

---

## 1. 概要

### 1.1 背景

現在のメール作成画面では、宛先リストから全メンバーを追加することしかできない。
大きなリストから一部のメンバーだけを選びたい場合、手動で1人ずつ削除する必要がある。

### 1.2 解決策

自然言語で「営業部の人だけ」「課長以上」などと指示することで、AIがリストをフィルタリングし、条件に合うメンバーだけを抽出する。

### 1.3 ユースケース例

| 自然言語指示 | 期待される動作 |
|-------------|---------------|
| 「営業部の人だけ選んで」 | department = "営業部" のメンバーを抽出 |
| 「課長以上の役職の人」 | position に「課長」「部長」「マネージャー」等を含むメンバーを抽出 |
| 「山田さんを除いて」 | name に「山田」を含まないメンバーを抽出 |
| 「社員番号がAで始まる人」 | employee_id が "A" で始まるメンバーを抽出 |
| 「東京オフィスのエンジニア」 | 複合条件でフィルタリング |

---

## 2. データモデル

### 2.1 対象フィールド

`RecipientListMember` テーブルの以下のフィールドをフィルタリング対象とする：

| フィールド | 型 | 説明 | フィルタ例 |
|-----------|-----|------|-----------|
| `name` | String(255) | 氏名 | 「田中さんだけ」 |
| `email` | String(255) | メールアドレス | 「@sales.example.comの人」 |
| `department` | String(255) | 部署 | 「営業部の人」 |
| `position` | String(255) | 役職 | 「マネージャー以上」 |
| `employee_id` | String(50) | 社員番号 **【新規追加】** | 「社員番号がAで始まる」 |
| `note` | Text | 備考 | 「VIP対応の人」 |

### 2.2 マイグレーション

```sql
-- 007_add_employee_id_to_recipient_members.py
ALTER TABLE recipient_list_members ADD COLUMN employee_id VARCHAR(50);
CREATE INDEX ix_recipient_list_members_employee_id ON recipient_list_members(employee_id);
```

---

## 3. バックエンド設計

### 3.1 新規サービス: LangChainRecipientFilter

**ファイル:** `backend/services/langchain_recipient_filter.py`

```python
from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser


class MemberData(BaseModel):
    """フィルタリング対象のメンバーデータ"""
    id: int
    email: str
    name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    employee_id: Optional[str] = None
    note: Optional[str] = None


class FilteredMember(BaseModel):
    """フィルタリング結果の各メンバー"""
    id: int
    email: str
    name: Optional[str] = None
    selected: bool = Field(description="このメンバーを選択するかどうか")
    reason: str = Field(description="選択/除外の理由（日本語で簡潔に）")


class FilterResult(BaseModel):
    """フィルタリング結果全体"""
    selected_members: List[FilteredMember] = Field(description="選択されたメンバーのリスト")
    excluded_members: List[FilteredMember] = Field(description="除外されたメンバーのリスト")
    summary: str = Field(description="フィルタリング結果の要約（日本語）")


# フィルタリング用プロンプトテンプレート
FILTER_SYSTEM_TEMPLATE = """あなたは宛先リストのフィルタリングを行うアシスタントです。

ユーザーの指示に従って、与えられたメンバーリストから条件に合うメンバーを選択してください。

【ルール】
1. ユーザーの指示を正確に解釈する
2. 各メンバーについて、選択(selected=true)か除外(selected=false)かを判定する
3. 判定理由を日本語で簡潔に説明する
4. 曖昧な指示の場合は、最も合理的な解釈を行う

【メンバーデータのフィールド】
- id: メンバーID
- email: メールアドレス
- name: 氏名
- department: 部署
- position: 役職
- employee_id: 社員番号
- note: 備考

【出力形式】
JSON形式で出力してください。
"""

FILTER_HUMAN_TEMPLATE = """【フィルタリング指示】
{instruction}

【メンバーリスト】
{members_json}

上記の指示に従って、メンバーを選択/除外してください。
"""


class LangChainRecipientFilter:
    """自然言語による宛先フィルタリングサービス"""

    def __init__(self, api_key: Optional[str] = None):
        from backend.core.config import Settings
        settings = Settings()
        self.api_key = api_key or settings.openai_api_key

        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,  # フィルタリングは確定的に
            api_key=self.api_key,
        )
        self.parser = JsonOutputParser(pydantic_object=FilterResult)

    async def filter_members(
        self,
        members: List[MemberData],
        instruction: str,
    ) -> FilterResult:
        """
        自然言語指示に基づいてメンバーをフィルタリング

        Args:
            members: フィルタリング対象のメンバーリスト
            instruction: 自然言語によるフィルタリング指示

        Returns:
            FilterResult: フィルタリング結果
        """
        # メンバーリストをJSON文字列に変換
        members_json = [m.model_dump() for m in members]

        # プロンプト構築
        prompt = ChatPromptTemplate.from_messages([
            ("system", FILTER_SYSTEM_TEMPLATE),
            ("human", FILTER_HUMAN_TEMPLATE),
        ])

        # チェイン構築
        chain = prompt | self.llm | self.parser

        # 実行
        result = await chain.ainvoke({
            "instruction": instruction,
            "members_json": members_json,
        })

        return FilterResult(**result)
```

### 3.2 API エンドポイント

**ファイル:** `backend/routers/recipients.py` に追加

```python
from pydantic import BaseModel
from typing import List, Optional


class FilterMembersRequest(BaseModel):
    """フィルタリングリクエスト"""
    instruction: str  # 自然言語指示（例：「営業部の人だけ」）


class FilteredMemberResponse(BaseModel):
    """フィルタリング結果のメンバー"""
    id: int
    email: str
    name: Optional[str]
    department: Optional[str]
    position: Optional[str]
    employee_id: Optional[str]
    selected: bool
    reason: str


class FilterMembersResponse(BaseModel):
    """フィルタリングレスポンス"""
    selected_members: List[FilteredMemberResponse]
    excluded_members: List[FilteredMemberResponse]
    summary: str
    selected_count: int
    excluded_count: int
    total_count: int


@router.post("/lists/{list_id}/filter", response_model=FilterMembersResponse)
async def filter_list_members(
    list_id: int,
    request: FilterMembersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    自然言語指示でリストメンバーをフィルタリング

    - list_id: 対象リストID
    - instruction: フィルタリング指示（例：「営業部の人だけ選んで」）
    """
    # リスト取得・権限チェック
    recipient_list = db.query(RecipientList).filter(
        RecipientList.id == list_id,
        RecipientList.user_id == current_user.id,
    ).first()

    if not recipient_list:
        raise HTTPException(status_code=404, detail="リストが見つかりません")

    # メンバー取得
    members = db.query(RecipientListMember).filter(
        RecipientListMember.list_id == list_id
    ).all()

    if not members:
        raise HTTPException(status_code=400, detail="リストにメンバーがいません")

    # フィルタリング実行
    filter_service = LangChainRecipientFilter()
    member_data = [
        MemberData(
            id=m.id,
            email=m.email,
            name=m.name,
            department=m.department,
            position=m.position,
            employee_id=m.employee_id,
            note=m.note,
        )
        for m in members
    ]

    result = await filter_service.filter_members(member_data, request.instruction)

    return FilterMembersResponse(
        selected_members=result.selected_members,
        excluded_members=result.excluded_members,
        summary=result.summary,
        selected_count=len(result.selected_members),
        excluded_count=len(result.excluded_members),
        total_count=len(members),
    )
```

---

## 4. フロントエンド設計

### 4.1 UI設計

**変更前（現在）:**
```
┌─────────────────────────────────────┐
│ TOに追加                              │
├─────────────────────────────────────┤
│ リストを選択                          │
│                                     │
│ テンプレートデータ（3名）              │
│                                     │
│ [プレビュー] [宛先に追加]              │
└─────────────────────────────────────┘
```

**変更後（新UI）:**
```
┌─────────────────────────────────────┐
│ TOに追加                              │
├─────────────────────────────────────┤
│ リストを選択                          │
│                                     │
│ テンプレートデータ（3名）              │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🤖 AIで絞り込み                   │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ 営業部の人だけ選んで          │ │ │
│ │ └─────────────────────────────┘ │ │
│ │              [絞り込む]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ─── フィルタ結果 ───                  │
│ 3名中 2名を選択                       │
│                                     │
│ ☑ 田中太郎（営業部）                  │
│   → 営業部所属のため選択              │
│ ☑ 鈴木花子（営業部）                  │
│   → 営業部所属のため選択              │
│ ☐ 山田次郎（開発部）                  │
│   → 開発部所属のため除外              │
│                                     │
│ [プレビュー] [選択したメンバーを追加]   │
└─────────────────────────────────────┘
```

### 4.2 コンポーネント設計

**ファイル:** `frontend/app/compose/page.tsx` に追加

```tsx
// State追加
const [filterInstruction, setFilterInstruction] = useState('')
const [filterResult, setFilterResult] = useState<FilterResult | null>(null)
const [isFiltering, setIsFiltering] = useState(false)

// フィルタリング実行
const handleFilter = async () => {
  if (!selectedListId || !filterInstruction.trim()) return

  setIsFiltering(true)
  try {
    const response = await fetch(`/api/recipients/lists/${selectedListId}/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: filterInstruction }),
    })
    const result = await response.json()
    setFilterResult(result)
  } catch (error) {
    console.error('Filter error:', error)
    // エラートースト表示
  } finally {
    setIsFiltering(false)
  }
}

// 選択メンバーを宛先に追加
const handleAddFilteredMembers = () => {
  if (!filterResult) return

  const selectedEmails = filterResult.selected_members.map(m => ({
    email: m.email,
    name: m.name,
    department: m.department,
  }))

  // 既存の宛先追加ロジックに統合
  addToRecipients(selectedEmails)
  closeModal()
}
```

### 4.3 UIコンポーネント

**ファイル:** `frontend/app/components/AIRecipientFilter.tsx` 新規作成

```tsx
interface AIRecipientFilterProps {
  listId: number
  onFilterComplete: (result: FilterResult) => void
}

export function AIRecipientFilter({ listId, onFilterComplete }: AIRecipientFilterProps) {
  const [instruction, setInstruction] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<FilterResult | null>(null)

  const handleFilter = async () => {
    // フィルタリングAPI呼び出し
  }

  return (
    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🤖</span>
        <span className="font-medium text-blue-800">AIで絞り込み</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例：営業部の人だけ選んで"
          className="flex-1 px-3 py-2 border rounded-lg"
        />
        <button
          onClick={handleFilter}
          disabled={isLoading || !instruction.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? '処理中...' : '絞り込む'}
        </button>
      </div>

      {result && (
        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">
            {result.total_count}名中 {result.selected_count}名を選択
          </div>
          <div className="text-sm text-blue-700 mb-3">
            {result.summary}
          </div>

          {/* 選択されたメンバー */}
          <div className="space-y-2">
            {result.selected_members.map((member) => (
              <div key={member.id} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>{member.name || member.email}</span>
                <span className="text-xs text-gray-500">({member.department})</span>
                <span className="text-xs text-green-600 ml-auto">{member.reason}</span>
              </div>
            ))}

            {/* 除外されたメンバー */}
            {result.excluded_members.map((member) => (
              <div key={member.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded opacity-60">
                <XCircle className="w-4 h-4 text-gray-400" />
                <span className="line-through">{member.name || member.email}</span>
                <span className="text-xs text-gray-500">({member.department})</span>
                <span className="text-xs text-gray-500 ml-auto">{member.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## 5. エラーハンドリング

### 5.1 想定されるエラー

| エラー | 原因 | 対処 |
|-------|------|------|
| リストが空 | メンバーがいないリストを選択 | 「メンバーがいません」メッセージ |
| 全員除外 | フィルタ結果で誰も選択されない | 「条件に合うメンバーがいません」警告 |
| 曖昧な指示 | 解釈できない自然言語 | AIが最善の解釈を試み、結果を確認させる |
| API エラー | OpenAI API障害等 | リトライ or エラーメッセージ |

### 5.2 フォールバック

AIフィルタリングが失敗した場合、従来の「全員追加」機能は引き続き使用可能とする。

---

## 6. セキュリティ考慮

### 6.1 プロンプトインジェクション対策

- ユーザー入力（instruction）はシステムプロンプトと分離
- 出力形式をJSON構造化で強制
- 不正な出力はパース時にエラー

### 6.2 データ漏洩対策

- メンバーデータはAPIコール時のみLLMに送信
- ログにはメンバー情報を含めない
- LLMへの送信データは最小限（IDとフィルタ対象フィールドのみ）

---

## 7. 関連ファイル

| カテゴリ | ファイルパス |
|----------|-------------|
| モデル | `backend/models/recipient.py` |
| マイグレーション | `backend/alembic/versions/007_add_employee_id_to_recipient_members.py` |
| フィルタサービス（新規） | `backend/services/langchain_recipient_filter.py` |
| 既存LangChainサービス | `backend/services/langchain_mail_generator.py` |
| APIルーター | `backend/routers/recipients.py` |
| メール作成画面 | `frontend/app/compose/page.tsx` |
| フィルタコンポーネント（新規） | `frontend/app/components/AIRecipientFilter.tsx` |

---

## 8. 実装順序

1. **Phase 1**: データモデル準備（完了）
2. **Phase 2**: バックエンド - LangChainフィルタリングサービス
3. **Phase 3**: バックエンド - API実装
4. **Phase 4**: フロントエンド実装
5. **Phase 5**: テスト・調整

---

**作成者**: Claude Code
**最終更新**: 2026-02-18（全Phase完了）
