# メール送信安全機能 設計書

**作成日**: 2026-02-17
**バージョン**: 1.0
**目的**: メール誤送信防止のための追加安全機能

---

## 進捗管理チェックリスト

### Phase 1: 外部送信警告機能
- [x] `backend/core/config.py` に `company_domains` 設定を追加
- [x] `backend/routers/mail.py` に `/mail/check-external` エンドポイント追加
- [x] `frontend/app/compose/page.tsx` に外部送信チェックロジック追加
- [x] `frontend/app/components/ExternalWarningDialog.tsx` 新規作成

### Phase 2: 警告メッセージの改善
- [x] `frontend/app/components/RecipientValidationDialog.tsx` のメッセージを改善
- [x] `backend/services/entra_validation_service.py` のメッセージを改善

### Phase 3: 送信履歴からリスト作成機能
- [x] `frontend/app/history/page.tsx` に「リストに保存」ボタン追加
- [x] `frontend/app/recipients/page.tsx` に履歴からの事前入力機能追加

### Phase 4: 個人メーリングリストの注意書き
- [x] `frontend/app/recipients/page.tsx` に注意書きを追加
- [x] `frontend/app/compose/page.tsx` のリスト選択モーダルに注意書きを追加

---

## 1. 外部送信警告機能

### 1.1 概要

メール送信時に、社外（外部ドメイン）の宛先が含まれている場合に警告を表示する機能。

### 1.2 処理フロー

```
1. ユーザーが「送信」をクリック
2. 宛先のメールアドレスをチェック
3. 会社ドメイン以外のアドレスがあれば警告ダイアログを表示
4. ユーザーが確認後、送信を続行
```

### 1.3 バックエンド実装

**設定追加 (`backend/core/config.py`):**
```python
# 会社ドメイン（カンマ区切り）
company_domains: str = ""  # 例: "example.co.jp,example.com"

@property
def company_domains_list(self) -> list[str]:
    """会社ドメインのリスト"""
    return [d.strip().lower() for d in self.company_domains.split(",") if d.strip()]
```

**API追加 (`backend/routers/mail.py`):**
```python
class CheckExternalRequest(BaseModel):
    to: List[str]
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None

class ExternalRecipient(BaseModel):
    email: str
    domain: str

class CheckExternalResponse(BaseModel):
    has_external: bool
    external_recipients: List[ExternalRecipient]
    internal_count: int
    external_count: int

@router.post("/check-external", response_model=CheckExternalResponse)
async def check_external_recipients(data: CheckExternalRequest):
    """外部宛先をチェック"""
    company_domains = settings.company_domains_list
    all_emails = list(data.to) + (data.cc or []) + (data.bcc or [])

    external = []
    internal_count = 0

    for email in all_emails:
        domain = email.split("@")[-1].lower()
        if domain not in company_domains:
            external.append(ExternalRecipient(email=email, domain=domain))
        else:
            internal_count += 1

    return CheckExternalResponse(
        has_external=len(external) > 0,
        external_recipients=external,
        internal_count=internal_count,
        external_count=len(external),
    )
```

### 1.4 フロントエンド実装

**新規コンポーネント (`frontend/app/components/ExternalWarningDialog.tsx`):**

```tsx
interface ExternalWarningDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  externalRecipients: { email: string; domain: string }[]
}

export function ExternalWarningDialog({
  isOpen,
  onClose,
  onConfirm,
  externalRecipients,
}: ExternalWarningDialogProps) {
  // ダイアログUI実装
}
```

### 1.5 警告メッセージ

```
⚠️ 社外への送信確認

以下の宛先は社外（外部）のメールアドレスです：
- external@gmail.com
- partner@other-company.co.jp

このまま送信してもよろしいですか？

[キャンセル] [確認して送信]
```

---

## 2. 警告メッセージの改善

### 2.1 概要

Entra比較機能の警告メッセージを、より分かりやすく親しみやすい表現に改善する。

### 2.2 メッセージ変更

**変更前:**
```
情報が最新でない可能性があります
このメールアドレスの情報を確認できませんでした
```

**変更後:**
```
🤔 これって最新情報じゃなさそうだけど、本当に送りますか？
（登録された情報と現在の情報が異なる可能性があります）

⚠️ このメールアドレス、確認できなかったけど大丈夫？
（システムに登録されていないアドレスです）
```

### 2.3 実装箇所

**バックエンド (`backend/services/entra_validation_service.py`):**
```python
# メッセージ定数
MESSAGES = {
    "info_mismatch": "これって最新情報じゃなさそうだけど、本当に送りますか？",
    "not_found": "このメールアドレス、確認できなかったけど大丈夫？",
}
```

**フロントエンド (`frontend/app/components/RecipientValidationDialog.tsx`):**
- ダイアログタイトル、説明文、ボタンテキストの改善

---

## 3. 送信履歴からリスト作成機能

### 3.1 概要

送信履歴の宛先を参考に、ユーザーが自分で宛先リストを作成できる機能。
**注意**: システムは自動でリストを生成しない。履歴を見て、ユーザー自身がリストを作成する。

### 3.2 UI追加

**履歴詳細画面に追加:**
- 「この宛先をリストに保存」ボタン
- クリックで宛先管理画面に遷移

**注意書き:**
```
📋 送信履歴からリストを作成

この送信履歴の宛先を元に、新しい宛先リストを作成できます。
※ システムからメールアドレスのリストは自動生成しません
※ この履歴を参考に、ご自身でリストを作成・管理してください
```

### 3.3 実装方法

1. 履歴詳細モーダルにボタン追加
2. ボタンクリックで `/recipients?from_history={log_id}` に遷移
3. 宛先管理画面で履歴IDを受け取り、宛先を事前入力

---

## 4. 個人メーリングリストの注意書き

### 4.1 概要

ユーザーが作成した宛先リストは、あくまで「個人の責任」で管理・使用することを明示する。

### 4.2 注意書き

**宛先リスト管理画面:**
```
⚠️ 宛先リストの管理について

このリストはあなた個人が作成・管理するメーリングリストです。
• 送信先の選択・確認はご自身の責任で行ってください
• システムは送信前にチェックを行いますが、最終判断はあなたが行います
• 定期的にリストの内容を見直すことをお勧めします
```

**メール作成画面のリスト選択時:**
```
📋 宛先リストから追加

選択したリストの全メンバーを宛先に追加します。
※ このリストはあなたが管理しています
※ 送信前に内容をご確認ください
```

### 4.3 表示タイミング

- 宛先リスト管理画面のヘッダー下
- リスト選択モーダルの上部

---

## 5. 関連ファイル

| カテゴリ | ファイルパス |
|----------|-------------|
| 設定 | `backend/core/config.py` |
| メールAPI | `backend/routers/mail.py` |
| バリデーションサービス | `backend/services/entra_validation_service.py` |
| メール作成画面 | `frontend/app/compose/page.tsx` |
| 送信履歴画面 | `frontend/app/history/page.tsx` |
| 宛先管理画面 | `frontend/app/recipients/page.tsx` |
| バリデーションダイアログ | `frontend/app/components/RecipientValidationDialog.tsx` |
| 外部警告ダイアログ（新規） | `frontend/app/components/ExternalWarningDialog.tsx` |

---

## 6. 実装順序

1. **Phase 1**: 外部送信警告（最も重要な誤送信防止機能）
2. **Phase 2**: 警告メッセージの改善（UX向上）
3. **Phase 3**: 送信履歴からリスト作成（利便性向上）
4. **Phase 4**: 注意書き追加（責任明確化）

---

**作成者**: Claude Code
**最終更新**: 2026-02-17
