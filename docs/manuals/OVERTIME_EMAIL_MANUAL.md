# 時間外労働状況メール送信システム マニュアル

## 概要

本システムは、組織（所属名称6）ごとに時間外労働状況のメールを自動送信する機能です。
毎月15日・20日・25日の定期発信を想定しています。

---

## 1. 事前準備

### 必要なデータセット

メール送信前に、以下の3つのデータセットがアップロードされている必要があります。

| データセット | 説明 | 必須列 |
|-------------|------|--------|
| **person_progress** | 送信先リスト | 従業員番号、氏名、メールアドレス、所属名称6 |
| **schedule_input** | 勤務予定データ | 従業員番号、勤務予定日、就業開始時刻、就業終了時刻 |
| **punches** | 出退勤データ | 従業員番号、勤務日付、出社時刻、退社時刻 |

※ `org_info`（組織情報）は任意ですが、あると所属名称の補完に使われます。

---

## 2. メール送信方法

### 2.1 基本的な送信（当日日付を使用）

```bash
curl -X POST http://localhost:8000/notifications/overtime-email
```

または空のJSONボディを送信：

```bash
curl -X POST http://localhost:8000/notifications/overtime-email \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2.2 基準日を指定して送信

15日のデータを16日（翌営業日）に送信する場合など：

```bash
curl -X POST http://localhost:8000/notifications/overtime-email \
  -H "Content-Type: application/json" \
  -d '{"data_date": "2025-02-15"}'
```

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `data_date` | 日付（YYYY-MM-DD） | データ基準日。指定しない場合は送信日が使われます |

---

## 3. メールの内容

### 3.1 件名

```
【毎月15･20･25日定期発信】時間外労働状況の進捗管理（{所属名称6}）
```

例：
- `【毎月15･20･25日定期発信】時間外労働状況の進捗管理（本社管理部）`
- `【毎月15･20･25日定期発信】時間外労働状況の進捗管理（東京営業所）`

### 3.2 本文

```
責任者および関係者各位

表題の件、{MM月DD日}時点での実所定外時間の速報値
（出退勤打刻による概算値、特別条項申請済者含）をお送りします。

本データ抽出後に勤怠を修正した場合、表示している実所定外時間数に乖離が発生します。
何卒ご了承くださいませ。

「【再掲】時間外及び休日労働のルールと運用の変更について」にあるように月間時間外は30時間で納めて下さい。
https://ms-bbs.coo-kai.jp/a/aeondelightjp.onmicrosoft.com/topic/4368531060

【　30時間超過が想定される場合　】
・レポートラインを通して30時間超過しない対策をお願いします。

【　上司の方々へ　】
・30時間超過の可能性がある報告を受けた場合は、配下で対応できる場合は、応援等対応頂き、その対応が難しい場合は、レポートラインを通じて上に報告相談をお願いします。時間外を発生させない取り組みを現場任せにせず、皆で対応し時間外を減らせるように対応をお願いいたします。
```

※ `{MM月DD日}` は `data_date` パラメータで指定した日付、または送信日が入ります。

### 3.3 添付ファイル

各メールには以下のファイルが添付されます：

| ファイル | 形式 | 内容 |
|---------|------|------|
| `overtime_{所属名称6}_{YYYYMMDD}.xlsx` | Excel | 残業明細データ |
| `overtime_{所属名称6}_{YYYYMMDD}.pdf` | PDF | 残業時間レポート（※） |

※ PDF添付はreportlabがインストールされている場合のみ

---

## 4. 送信先の決定ルール

1. `person_progress` データセットから、メールアドレスと所属名称6が両方存在するレコードを抽出
2. 所属名称6でグループ化
3. 各グループ（組織）に対して1通のメールを送信
4. 同じ組織のメンバー全員がTo（宛先）に入る

---

## 5. レスポンス例

### 成功時

```json
{
  "sent": [
    {
      "org6": "本社管理部",
      "emails": ["tanaka@example.com", "suzuki@example.com"],
      "recipient_count": 2,
      "rows": 15,
      "attachments": ["overtime_本社管理部_20250215.xlsx", "overtime_本社管理部_20250215.pdf"]
    }
  ],
  "skipped": []
}
```

### 一部スキップ時

```json
{
  "sent": [...],
  "skipped": [
    {
      "org6": "大阪支店",
      "emails": ["osaka@example.com"],
      "reason": "no overtime rows for org6"
    }
  ]
}
```

---

## 6. エラーと対処法

| エラー | 原因 | 対処法 |
|--------|------|--------|
| `datasets not ready: person_progress` | person_progressがアップロードされていない | データセットをアップロード |
| `datasets not ready: schedule_input` | schedule_inputがアップロードされていない | データセットをアップロード |
| `datasets not ready: punches` | punchesがアップロードされていない | データセットをアップロード |
| `ENTRA_TENANT_ID is not configured` | Entra ID設定が不足 | 環境変数を設定（下記参照） |
| `ENTRA_CLIENT_ID is not configured` | Entra ID設定が不足 | 環境変数を設定（下記参照） |
| `ENTRA_CLIENT_SECRET is not configured` | Entra ID設定が不足 | 環境変数を設定（下記参照） |
| `MAIL_FROM is not configured` | 送信元アドレスが未設定 | 環境変数 `MAIL_FROM` を設定 |
| `Failed to send mail: 403` | Mail.Send権限がない | Azure Portalで権限を追加 |
| `no overtime rows for org6` | その組織に残業データがない | 正常（該当データなしのためスキップ） |

---

## 7. Microsoft Graph API 設定

本システムでは **Microsoft Graph API** を使用してメールを送信します。SMTPサーバーの設定は不要です。

**送信元**: ログインしているユーザーのMicrosoftメールアドレスが使用されます。

### 認証要件

このエンドポイントは**認証が必要**です。メール送信前にMS Entra IDでログインしてください。

### 必要な環境変数

| 環境変数 | 説明 | 必須 | 例 |
|---------|------|:----:|-----|
| `ENTRA_TENANT_ID` | Azure ADテナントID | 必須 | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `ENTRA_CLIENT_ID` | アプリケーションクライアントID | 必須 | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `ENTRA_CLIENT_SECRET` | クライアントシークレット | 必須 | `xxxxxxxxxxxxxxxxxxxxx` |
| `MAIL_FROM_NAME` | 送信者名（任意） | 任意 | `AI Mail` |

※ `MAIL_FROM`は不要です。ログインユーザーのメールアドレスが自動的に使用されます。

### Azure Portal での設定

1. **アプリの登録** でアプリケーションを作成
2. **APIのアクセス許可** で `Mail.Send`（アプリケーション権限）を追加
3. **管理者の同意** を与える
4. **証明書とシークレット** でクライアントシークレットを作成

詳細は [ENTRA_ID_SETUP.md](./ENTRA_ID_SETUP.md) を参照してください。

### 注意事項

- ログインユーザーは組織内の有効なExchange Onlineメールボックスを持っている必要があります
- 送信されたメールはログインユーザーの「送信済みアイテム」に保存されます
- 共有メールボックスや配布リストからの送信はできません

---

## 8. 運用スケジュール例

| 日付 | アクション | コマンド例 |
|------|----------|-----------|
| 毎月15日 | 15日時点のデータを送信 | `curl -X POST .../overtime-email` |
| 毎月20日 | 20日時点のデータを送信 | `curl -X POST .../overtime-email` |
| 毎月25日 | 25日時点のデータを送信 | `curl -X POST .../overtime-email` |
| 休日明け | 前営業日のデータを送信 | `curl -X POST ... -d '{"data_date": "2025-02-15"}'` |

---

## 9. よくある質問

### Q: 特定の組織だけにメールを送りたい

A: 現在の実装では、person_progressに登録されている全組織に送信されます。
特定組織のみに送信したい場合は、person_progressデータを該当組織のみにフィルタしてアップロードしてください。

### Q: テスト送信したい

A: テスト用のメールアドレスを持つperson_progressデータを用意し、アップロードしてから送信してください。

### Q: 送信に失敗した組織を再送したい

A: 現在は全組織への一括送信のみです。再送する場合は再度APIを呼び出してください（送信済み組織にも再送されます）。

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2025-02-05 | ログインユーザーのメールを送信元として使用するように変更、認証必須化 |
| 2025-02-05 | SMTPからMicrosoft Graph APIに変更 |
| 2025-02-04 | 初版作成 |
