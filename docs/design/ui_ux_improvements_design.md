# UI/UX改善設計書

## チェックリスト

- [x] **1. 件名フィールドの視認性改善**
  - [x] 件名ラベルの追加
  - [x] 背景色・ボーダーによる差別化（To/Cc/Bccと同じ形式に統一）
  - [x] フォントサイズ・ウェイトの調整
  - [x] テスト確認

---

## 1. 件名フィールドの視認性改善

### 背景・課題
ユーザーテストで「件名欄が本文だと思っていた」「見えづらい」という指摘があった。
現状の件名欄はラベルがなく、本文との視覚的な区別が不十分。

### 改善内容

#### Before（現状）
```tsx
<div className="px-4 py-3 border-b border-white/5">
  <input
    type="text"
    value={subject}
    onChange={e => setSubject(e.target.value)}
    placeholder="件名"
    className="w-full bg-transparent outline-none text-base text-white placeholder-slate-500 font-medium"
  />
</div>
```

#### After（改善後）
```tsx
<div className="px-4 py-3 border-b border-white/5">
  <div className="flex items-center gap-3">
    <span className="text-slate-400 text-sm w-12">件名:</span>
    <input
      type="text"
      value={subject}
      onChange={e => setSubject(e.target.value)}
      placeholder="件名を入力..."
      className="flex-1 bg-transparent outline-none text-base text-white placeholder-slate-500 font-medium"
    />
  </div>
</div>
```

### デザイン要件
- To/Cc/Bccと同じ形式でラベル「件名:」を左側に配置
- ラベル幅をTo/Cc/Bccと揃える（w-12）
- 視覚的一貫性を保つ

### 対象ファイル
- `frontend/app/compose/page.tsx`

---

## 2. AI初回ドラフト生成機能

### 背景・課題
現状のAIアシスタントは以下のフローで動作：
1. ユーザーが要件を入力
2. AIが質問を返す（会議の目的は？参加者は？など）
3. ユーザーが回答
4. AIがドラフトを生成

ユーザーテストで「1ラリーでドラフトが欲しい」「質問が多くて面倒」という指摘があった。

### 改善内容

#### 新しいフロー
1. ユーザーが要件を入力（例：「会議調整をしたい」）
2. AIが**即座にドラフトを生成**して提示
3. ユーザーが修正点を指示（例：「もう少し丁寧に」「日時を追加して」）
4. AIが修正版を生成

#### バックエンド変更

**`backend/services/langchain_mail_generator.py`**

プロンプトを修正し、初回メッセージでドラフト生成するように変更：

```python
SYSTEM_PROMPT_IMMEDIATE_DRAFT = """
あなたはビジネスメール作成のアシスタントです。
ユーザーからの要件を受けたら、**質問せずに**まずドラフトを作成してください。

不明な点があっても、一般的な内容で仮のドラフトを作成し、
「以下の点を調整できます」と提案してください。

例：
- 会議の具体的な日時
- 参加者の名前
- 会議の目的の詳細

ドラフトを先に見せることで、ユーザーが修正点を指示しやすくなります。
"""
```

#### フロントエンド変更

**`frontend/app/compose/page.tsx`**

AIパネルの初期表示にヒントを追加：

```tsx
{aiMessages.length === 0 && (
  <div className="text-slate-500 text-sm space-y-3 text-center py-8">
    <div className="w-16 h-16 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
      <span className="text-3xl">🤖</span>
    </div>
    <p>どのようなメールを作成しますか？</p>
    <p className="text-xs text-slate-600">
      例: 「会議の日程調整をお願いしたい」<br/>
      → すぐにドラフトを作成します
    </p>
  </div>
)}
```

### 対象ファイル
- `backend/services/langchain_mail_generator.py`
- `backend/routers/ai_generate.py`
- `frontend/app/compose/page.tsx`

---

## 4. 丁寧語サジェスチョン機能

### 背景・課題
ユーザーがメール本文を入力中に「相談したく」→「ご相談したく」のように、
より丁寧な表現をリアルタイムで提案してほしいという要望。

### 機能概要
- 本文入力中にカジュアルな表現を検出
- インラインまたはポップアップで丁寧な代替表現を提案
- ワンクリックで置換可能

### 敬語変換辞書（例）

```json
{
  "変換ルール": [
    { "from": "相談したく", "to": "ご相談したく", "level": "polite" },
    { "from": "確認したく", "to": "ご確認いただきたく", "level": "formal" },
    { "from": "送ります", "to": "お送りいたします", "level": "polite" },
    { "from": "見てください", "to": "ご確認ください", "level": "polite" },
    { "from": "教えてください", "to": "ご教示ください", "level": "formal" },
    { "from": "お願いします", "to": "お願いいたします", "level": "polite" },
    { "from": "思います", "to": "存じます", "level": "formal" },
    { "from": "わかりました", "to": "承知いたしました", "level": "formal" },
    { "from": "できません", "to": "いたしかねます", "level": "formal" },
    { "from": "ありがとうございます", "to": "誠にありがとうございます", "level": "formal" }
  ],
  "NGワード（ビジネスメール）": [
    { "word": "境内", "suggestion": "件内 または 本件", "reason": "誤変換の可能性" },
    { "word": "よろしくお願い申し上げます。よろしくお願い申し上げます。", "suggestion": "重複を削除", "reason": "重複表現" }
  ]
}
```

### API設計

**エンドポイント**: `POST /api/mail/suggest-polite`

**リクエスト**:
```json
{
  "text": "確認したく連絡しました",
  "tone": "formal"  // formal | polite | casual
}
```

**レスポンス**:
```json
{
  "suggestions": [
    {
      "original": "確認したく",
      "suggested": "ご確認いただきたく",
      "position": { "start": 0, "end": 5 },
      "reason": "より丁寧な表現"
    }
  ]
}
```

### フロントエンド実装

#### UI案1: インラインハイライト
本文内の該当箇所をハイライトし、クリックで変換候補を表示

#### UI案2: サイドパネル提案
本文右側に提案リストを表示し、ワンクリックで適用

#### 推奨: UI案2（サイドパネル）
- 入力を邪魔しない
- 複数の提案を一覧できる
- 適用/無視を選択しやすい

### 対象ファイル
- `backend/routers/mail.py` - 新規エンドポイント追加
- `backend/services/politeness_checker.py` - 新規サービス作成
- `frontend/app/compose/page.tsx` - サジェスチョンUI追加
- `frontend/app/components/PolitenessSuggestions.tsx` - 新規コンポーネント

---

## 5. 宛先による敬語レベル自動判定（AIアシスタント機能）

### 背景・課題
- 社外の取引先には「ございます」を使うなど、宛先によって適切な敬語レベルが異なる
- 現状は手動でトーン（フォーマル/丁寧/カジュアル）を選択する必要がある
- メーリングリストに登録されている宛先であれば、自動判定が可能

### 機能概要
1. メーリングリストにカテゴリ（敬語レベル）を追加
2. 宛先選択時に自動でトーンを判定
3. AIアシスタントのトーン設定に自動反映

### データベース変更

**recipient_lists テーブルに追加**:
```sql
ALTER TABLE recipient_lists ADD COLUMN formality_level VARCHAR(20) DEFAULT 'polite';
-- 値: 'formal' (社外・上位), 'polite' (社内・一般), 'casual' (社内・親しい)

ALTER TABLE recipient_lists ADD COLUMN category VARCHAR(50);
-- 値: 'external_client' (社外顧客), 'external_vendor' (社外取引先),
--      'internal_management' (社内上位), 'internal_team' (社内チーム)
```

### 自動判定ロジック

```python
def determine_tone_from_recipients(to: List[str], cc: List[str], bcc: List[str]) -> str:
    """
    宛先からトーンを自動判定
    優先度: formal > polite > casual
    """
    all_recipients = to + cc + bcc

    # 各宛先のメーリングリスト情報を取得
    formality_levels = []
    for email in all_recipients:
        # メーリングリストに登録されているか確認
        list_info = get_recipient_list_info(email)
        if list_info and list_info.formality_level:
            formality_levels.append(list_info.formality_level)

    # 最も丁寧なレベルを採用（安全側に倒す）
    if 'formal' in formality_levels:
        return 'formal'
    elif 'polite' in formality_levels:
        return 'polite'
    elif 'casual' in formality_levels:
        return 'casual'

    # デフォルトは polite
    return 'polite'
```

### フロントエンド変更

**AIアシスタントのトーン自動設定**:

```tsx
// 宛先が変更されたらトーンを自動判定
useEffect(() => {
  const determineTone = async () => {
    if (to.length === 0 && cc.length === 0 && bcc.length === 0) return

    try {
      const res = await fetch(`${API_BASE}/ai/determine-tone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: to.map(r => r.email),
          cc: cc.map(r => r.email),
          bcc: bcc.map(r => r.email),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.suggested_tone) {
          setAiTone(data.suggested_tone)
          // ユーザーに通知（オプション）
          // setToneAutoSet(true)
        }
      }
    } catch (e) {
      console.error('Failed to determine tone:', e)
    }
  }

  determineTone()
}, [to, cc, bcc])
```

**UI表示**:
トーンが自動設定された場合、ユーザーに通知：

```tsx
{toneAutoSet && (
  <div className="text-xs text-blue-400 mt-1">
    💡 宛先に基づいてトーンを「{aiTone === 'formal' ? 'フォーマル' : aiTone === 'polite' ? '丁寧' : 'カジュアル'}」に設定しました
  </div>
)}
```

### API設計

**エンドポイント**: `POST /api/ai/determine-tone`

**リクエスト**:
```json
{
  "to": ["tanaka@example.com"],
  "cc": ["yamada@example.com"],
  "bcc": []
}
```

**レスポンス**:
```json
{
  "suggested_tone": "formal",
  "reason": "社外取引先 (伊藤忠商事) が含まれています",
  "details": [
    { "email": "tanaka@example.com", "category": "external_client", "formality": "formal" }
  ]
}
```

### 対象ファイル
- `backend/models/recipient.py` - カラム追加
- `backend/routers/ai_generate.py` - 新規エンドポイント
- `backend/services/tone_detector.py` - 新規サービス
- `frontend/app/compose/page.tsx` - 自動トーン設定
- `frontend/app/recipients/page.tsx` - カテゴリ設定UI

---

## 優先度

| 優先度 | 項目 | 理由 |
|--------|------|------|
| **高** | 1. 件名の視認性改善 | 実装が簡単、即効性あり |
| **高** | 2. AI初回ドラフト生成 | UX大幅改善、プロンプト変更のみ |
| **中** | 4. 丁寧語サジェスチョン | 新規機能、辞書作成が必要 |
| **中** | 5. 宛先によるトーン自動判定 | DB変更あり、段階的実装可能 |

---

## 参考：ユーザーテストでの発言

> 「件名見えづらい、本文だと思ってた」

> 「もっと早めに1回メールドラフト欲しい」「1ラリーでドラフト出してほしい」

> 「相談したく」→「ご相談したく」のように提案してくれると嬉しい

> 「社外の取引先には『ございます』をちゃんと使う」など宛先によって敬語レベルを変えたい
