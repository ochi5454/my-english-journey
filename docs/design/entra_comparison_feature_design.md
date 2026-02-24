# Entra比較機能 設計書

## 進捗管理チェックリスト

### Phase 1: 既存機能の隠蔽
- [x] `RecipientInput.tsx` からEntra検索UIを非表示（バックエンド側でEntra結果を返さないことで対応）
- [x] ファジー検索のデフォルトを `include_entra=false` に変更
- [x] フロントエンドからEntra検索API呼び出しを削除（フォールバック削除）

### Phase 2: Entra比較サービスの実装
- [x] `EntraValidationService` クラス作成（`backend/services/entra_validation_service.py`）
- [x] ローカルキャッシュ検索ロジック実装（EmployeeAssignmentテーブル優先検索）
- [x] Entra API呼び出しロジック実装（Graph API連携）
- [x] フィールド比較ロジック実装（名前・部署・役職の柔軟なマッチング）

### Phase 3: API実装
- ~~[x] `/api/recipients/upload` レスポンス拡張（警告情報追加）~~ → Phase 6で削除
- [x] `/api/recipients/lists/{list_id}/validate` 新規作成
- [x] `/api/mail/validate-recipients` 新規作成

### Phase 4: フロントエンド実装
- [x] `RecipientValidationDialog` コンポーネント作成
- ~~[x] アップロード時の警告表示実装~~ → Phase 6で削除
- [x] 送信前チェック実装

### Phase 5: テスト・調整
- [x] 単体テスト作成（`backend/tests/test_entra_validation_service.py`）
- [x] 統合テスト（`backend/tests/test_recipients_validation.py`）
- [ ] UI/UX調整（実際の動作確認で調整）

---

## 【修正】Phase 6: バリデーションタイミングの変更

### 6.1 変更概要

**変更前:**
```
CSVアップロード時 → Entra比較 → 警告ダイアログ → リスト保存
```

**変更後:**
```
CSVアップロード時 → そのままリスト保存（Entra比較なし）
        ↓
メール作成時にリストを宛先に追加 → Entra比較 → 警告ダイアログ → 宛先に追加
```

### 6.2 変更理由

- アップロードしたExcel/CSVが「正」であり、Entraは「参考情報」という位置付け
- Entraの情報が常に最新とは限らない（月1回更新など）
- 宛先として実際に使用するタイミングでチェックする方が適切
- ユーザーに「本当にこれでいい？」と確認を促すタイミングは送信に近い方が効果的

### 6.3 チェックリスト

#### バックエンド修正
- [x] `/api/recipients/upload` からバリデーション呼び出しを削除
- [x] レスポンスから `validation_warnings`, `requires_confirmation` を削除

#### フロントエンド修正（recipients/page.tsx）
- [x] `handleFileUpload` からバリデーションダイアログ表示ロジックを削除
- [x] `pendingUploadData`, `validationWarnings` 関連のstate削除
- [x] `RecipientValidationDialog` のインポートと使用を削除

#### フロントエンド修正（compose/page.tsx）
- [x] リスト追加時のバリデーション用stateを追加
  - `showListValidationDialog`: ダイアログ表示フラグ
  - `listValidationWarnings`: 警告リスト
  - `pendingListMembers`: 確認待ちのメンバーリスト
- [x] `importFromList` 関数を修正してバリデーションAPIを呼び出し
- [x] バリデーション確認後に宛先追加する `handleListValidationConfirm` 関数を追加
- [x] `RecipientValidationDialog` をリスト追加用に追加

#### テスト
- [ ] アップロード時にバリデーションが実行されないことを確認
- [ ] リスト追加時にバリデーションが実行されることを確認
- [ ] 警告があった場合にダイアログが表示されることを確認
- [ ] 確認後に正しく宛先に追加されることを確認

---

## 【追加】Phase 7: 宛先チップの分類表示改善

### 7.1 変更概要

宛先追加時に、ログインユーザーのメールドメインをベースに社外/社内を判定し、カテゴリ別にチップを表示する。

**判定ロジック:**
```
入力されたメールアドレスの@以降 と ログインユーザーのメールの@以降 を比較
  ↓
【異なる場合】→ 社外アドレス（amber色 + ⚠️アイコン）
  ↓
【同じ場合】→ Entra検証を実行
  ├→ Entra確認済み → 緑色 + ✅アイコン
  └→ Entra未登録 → 赤色 + 🛡️アイコン
```

### 7.2 チェックリスト

#### 設計書更新
- [x] 判定ロジックを設計書に追記

#### フロントエンド修正
- [x] `RecipientInput.tsx` に `userDomain` props を追加
- [x] `compose/page.tsx` から `internalDomains` ハードコードを削除
- [x] `compose/page.tsx` でログインユーザーのドメインを取得して渡す
- [x] `isInternalDomain` 関数をユーザードメインベースに変更

#### 動作確認
- [x] ビルド成功（TypeScript型チェック・Lint通過）
- [ ] ログインユーザーと同じドメイン → Entra検証が実行される（要実機確認）
- [ ] ログインユーザーと異なるドメイン → 社外として即座に表示（要実機確認）
- [ ] 各カテゴリが正しく分類表示される（要実機確認）

---

## 1. 概要

### 1.1 背景
- Entra ID（Azure AD）の情報は月1回更新されるが、人事情報として必ずしも正確とは限らない
- ユーザーが作成したExcelリストをそのまま信用してメール送信すると、送っちゃいけない人に送る可能性がある
- **AIの使い方として「人間の作業をチェックしてダメ出しする」アプローチが適切**

### 1.2 方針
| 項目 | 方針 |
|------|------|
| Entra検索機能 | **UIから隠す**（機能自体は残すが非表示） |
| リスト作成 | ユーザーが自分でExcel/CSVを作成してアップロード |
| Entra比較 | **裏側で実行**（UIには「Entraと比較」とは表示しない） |
| 警告表示 | 「最新情報じゃなさそうな項目があります」という確認を表示 |
| リスト管理 | 一度取り込んだリストは個人のメーリングリストとして登録 |
| 送信責任 | ユーザー自身の判断・責任で送信 |

---

## 2. 機能要件

### 2.1 隠蔽する既存機能

以下の機能はUIから非表示にする（バックエンドのAPIは残す）:

| 機能 | ファイル | 対応方法 |
|------|----------|----------|
| Entra IDユーザー検索 | `frontend/app/components/RecipientInput.tsx` | 検索UIを非表示 |
| Entra検索API呼び出し | `backend/routers/recipients.py` の `/recipients/search` | フロントエンドから呼び出さない |
| ファジー検索のEntra含む | `/recipients/search/fuzzy` の `include_entra` | デフォルトを `false` に |
| 統合検索のEntra含む | `/recipients/search/unified` | Entra結果を除外 |

### 2.2 新規実装する機能

#### A. Excelアップロード時のEntra比較チェック

**処理フロー:**
```
1. ユーザーがExcel/CSVをアップロード
2. バックエンドでパース
3. 各メンバーのメールアドレスをEntraデータと比較
4. 不一致項目を検出
5. 警告情報と共にレスポンスを返す
6. フロントエンドで確認ダイアログを表示
7. ユーザーが確認後、リストを保存
```

**比較項目:**
| 項目 | 比較方法 | 警告条件 |
|------|----------|----------|
| メールアドレス | Entraに存在するか | Entraに存在しない |
| 氏名 | Entraの`displayName`と一致するか | 名前が異なる |
| 部署 | Entraの`department`と一致するか | 部署が異なる |
| 役職 | Entraの`jobTitle`と一致するか | 役職が異なる |

#### B. 警告表示UI

**警告メッセージ例（Entraとは言わない）:**
```
以下の宛先について確認が必要です：

⚠️ 情報が最新でない可能性があります
  - tanaka@example.com:
    登録された部署「営業部」が現在の情報と異なる可能性があります
  - suzuki@example.com:
    このメールアドレスは現在有効でない可能性があります

続行しますか？ [確認して送信] [キャンセル]
```

#### C. 送信時の最終チェック

メール送信直前にも再度Entraと比較し、最新情報と異なる場合は警告を表示。

---

## 3. データモデル

### 3.1 既存モデル（変更なし）

```python
# RecipientList - 宛先リスト
class RecipientList(Base):
    id: int
    user_id: int
    name: str
    description: str
    created_at: datetime

# RecipientListMember - 宛先リストメンバー
class RecipientListMember(Base):
    id: int
    list_id: int
    email: str
    name: str
    department: str
    position: str
    note: str
```

### 3.2 新規追加フィールド

```python
# RecipientListMember に追加
class RecipientListMember(Base):
    # ... 既存フィールド ...

    # Entra比較結果（内部管理用）
    entra_check_status: str  # 'matched', 'mismatched', 'not_found', 'unchecked'
    entra_check_at: datetime  # 最終チェック日時
    entra_check_details: JSON  # 不一致詳細 {"name": "異なる", "department": "異なる"}
```

---

## 4. API設計

### 4.1 既存APIの変更

#### POST /api/recipients/upload （変更）

**リクエスト:** 変更なし

**レスポンス（拡張）:**
```json
{
  "list_id": 123,
  "name": "営業部リスト",
  "members_count": 10,
  "validation_warnings": [
    {
      "email": "tanaka@example.com",
      "warning_type": "info_mismatch",
      "message": "登録された部署が現在の情報と異なる可能性があります",
      "details": {
        "field": "department",
        "uploaded_value": "営業部",
        "current_value": "マーケティング部"
      }
    },
    {
      "email": "unknown@example.com",
      "warning_type": "not_found",
      "message": "このメールアドレスの情報を確認できませんでした"
    }
  ],
  "requires_confirmation": true
}
```

### 4.2 新規API

#### POST /api/recipients/lists/{list_id}/validate

リストを再度Entraと比較してチェック結果を返す。

**レスポンス:**
```json
{
  "list_id": 123,
  "checked_at": "2024-02-16T10:00:00Z",
  "total_members": 10,
  "matched": 7,
  "mismatched": 2,
  "not_found": 1,
  "warnings": [
    {
      "email": "tanaka@example.com",
      "warning_type": "info_mismatch",
      "message": "情報が最新でない可能性があります",
      "details": { ... }
    }
  ]
}
```

#### POST /api/mail/validate-recipients

送信前に宛先をチェック。

**リクエスト:**
```json
{
  "to": ["tanaka@example.com", "suzuki@example.com"],
  "cc": [],
  "bcc": []
}
```

**レスポンス:**
```json
{
  "valid": false,
  "warnings": [
    {
      "email": "tanaka@example.com",
      "message": "情報が最新でない可能性があります"
    }
  ],
  "requires_confirmation": true
}
```

---

## 5. バックエンド実装

### 5.1 Entra比較サービス

**ファイル:** `backend/services/entra_validation_service.py`

```python
class EntraValidationService:
    """
    アップロードされた宛先リストをEntraデータと比較するサービス。
    ※ UI上では「Entra」という言葉は使用しない
    """

    async def validate_recipient_list(
        self,
        members: List[RecipientListMember],
        access_token: str
    ) -> ValidationResult:
        """
        宛先リストの各メンバーをEntraデータと比較
        """
        warnings = []

        for member in members:
            # Entraからユーザー情報を取得
            entra_user = await self._fetch_entra_user_by_email(
                member.email, access_token
            )

            if entra_user is None:
                warnings.append(ValidationWarning(
                    email=member.email,
                    warning_type="not_found",
                    message="このメールアドレスの情報を確認できませんでした"
                ))
            else:
                # 各フィールドを比較
                mismatches = self._compare_fields(member, entra_user)
                if mismatches:
                    warnings.append(ValidationWarning(
                        email=member.email,
                        warning_type="info_mismatch",
                        message="情報が最新でない可能性があります",
                        details=mismatches
                    ))

        return ValidationResult(
            warnings=warnings,
            requires_confirmation=len(warnings) > 0
        )

    def _compare_fields(
        self,
        member: RecipientListMember,
        entra_user: dict
    ) -> dict:
        """フィールド比較"""
        mismatches = {}

        # 名前の比較
        if member.name and entra_user.get("displayName"):
            if member.name != entra_user["displayName"]:
                mismatches["name"] = {
                    "uploaded": member.name,
                    "current": entra_user["displayName"]
                }

        # 部署の比較
        if member.department and entra_user.get("department"):
            if member.department != entra_user["department"]:
                mismatches["department"] = {
                    "uploaded": member.department,
                    "current": entra_user["department"]
                }

        # 役職の比較
        if member.position and entra_user.get("jobTitle"):
            if member.position != entra_user["jobTitle"]:
                mismatches["position"] = {
                    "uploaded": member.position,
                    "current": entra_user["jobTitle"]
                }

        return mismatches
```

### 5.2 ローカルキャッシュの活用

Entra APIを毎回呼び出すとコストがかかるため、`EmployeeAssignment`テーブル（既存）のデータを優先的に使用。

```python
async def _fetch_entra_user_by_email(
    self,
    email: str,
    access_token: str
) -> Optional[dict]:
    """
    1. まずローカルDB（EmployeeAssignment）を検索
    2. なければEntra APIを呼び出し
    """
    # ローカルキャッシュから検索
    local_user = self.db.query(EmployeeAssignment).filter(
        EmployeeAssignment.email == email
    ).first()

    if local_user:
        return {
            "displayName": local_user.display_name,
            "mail": local_user.email,
            "department": local_user.organization.name if local_user.organization else None,
            "jobTitle": local_user.job_title
        }

    # ローカルになければEntra APIを呼び出し
    return await self._call_graph_api_for_user(email, access_token)
```

---

## 6. フロントエンド実装

### 6.1 隠蔽する機能

**ファイル:** `frontend/app/components/RecipientInput.tsx`

```tsx
// 変更前: Entra検索を含む
const handleSearch = async (query: string) => {
  // ファジー検索（Entra含む）
  const results = await fetch(`/api/recipients/search/fuzzy?q=${query}&include_entra=true`);
};

// 変更後: Entra検索を除外
const handleSearch = async (query: string) => {
  // ローカル検索のみ
  const results = await fetch(`/api/recipients/search/local?q=${query}`);
};
```

### 6.2 警告ダイアログコンポーネント

**ファイル:** `frontend/app/components/RecipientValidationDialog.tsx`

```tsx
interface ValidationWarning {
  email: string;
  message: string;
  details?: {
    field: string;
    uploaded: string;
    current: string;
  };
}

interface Props {
  warnings: ValidationWarning[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function RecipientValidationDialog({ warnings, onConfirm, onCancel }: Props) {
  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>宛先の確認</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <p className="text-amber-600">
          以下の宛先について確認が必要です：
        </p>
        <ul className="mt-4 space-y-2">
          {warnings.map((warning, index) => (
            <li key={index} className="p-3 bg-amber-50 rounded border border-amber-200">
              <div className="font-medium">{warning.email}</div>
              <div className="text-sm text-gray-600">{warning.message}</div>
              {warning.details && (
                <div className="text-xs text-gray-500 mt-1">
                  {warning.details.field}:
                  「{warning.details.uploaded}」→「{warning.details.current}」
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button onClick={onConfirm}>
          確認して続行
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
```

### 6.3 メール送信画面への統合

**ファイル:** `frontend/app/compose/page.tsx`

```tsx
const handleSend = async () => {
  // 送信前にバリデーション
  const validation = await fetch('/api/mail/validate-recipients', {
    method: 'POST',
    body: JSON.stringify({ to, cc, bcc })
  });

  const result = await validation.json();

  if (result.requires_confirmation) {
    // 警告ダイアログを表示
    setShowValidationDialog(true);
    setValidationWarnings(result.warnings);
  } else {
    // 直接送信
    await sendMail();
  }
};
```

---

## 7. 実装順序

### Phase 1: 既存機能の隠蔽
1. [ ] `RecipientInput.tsx` からEntra検索UIを非表示
2. [ ] ファジー検索のデフォルトを `include_entra=false` に変更
3. [ ] フロントエンドからEntra検索API呼び出しを削除

### Phase 2: Entra比較サービスの実装
4. [ ] `EntraValidationService` クラス作成
5. [ ] ローカルキャッシュ検索ロジック実装
6. [ ] Entra API呼び出しロジック実装
7. [ ] フィールド比較ロジック実装

### Phase 3: API実装
8. [ ] `/api/recipients/upload` レスポンス拡張
9. [ ] `/api/recipients/lists/{list_id}/validate` 新規作成
10. [ ] `/api/mail/validate-recipients` 新規作成

### Phase 4: フロントエンド実装
11. [ ] `RecipientValidationDialog` コンポーネント作成
12. [ ] アップロード時の警告表示実装
13. [ ] 送信前チェック実装

### Phase 5: テスト・調整
14. [ ] 単体テスト作成
15. [ ] 統合テスト
16. [ ] UI/UX調整

---

## 8. 注意事項

### 8.1 UIでの表現
- **「Entra」「Azure AD」「Graph API」という言葉はUIに表示しない**
- 「最新情報と異なる可能性があります」「情報を確認できませんでした」等の表現を使用

### 8.2 ユーザー責任
- 警告を表示した上で、ユーザーが「続行」を選択すれば送信可能
- システムは「確認を促す」のみで、送信をブロックしない

### 8.3 パフォーマンス
- Entra APIの呼び出しはコストがかかるため、ローカルキャッシュを優先
- 大量の宛先をチェックする場合はバッチ処理を検討

### 8.4 今後の検討事項（明日以降）
- データの暗号化
- 暗号化した後のLLMへの渡し方
- 名前を隠した状態での処理

---

## 9. 関連ファイル

| カテゴリ | ファイルパス |
|----------|-------------|
| 既存設計書 | `docs/design/ai_mail_agent_design.md` |
| 宛先管理API | `backend/routers/recipients.py` |
| 宛先モデル | `backend/models/recipient.py` |
| Graph APIサービス | `backend/services/graph_mail_service.py` |
| Entra同期サービス | `backend/services/entra_sync_service.py` |
| 宛先入力UI | `frontend/app/components/RecipientInput.tsx` |
| メール作成画面 | `frontend/app/compose/page.tsx` |
