# 36協定アラート通知システム マニュアル

## 概要

本システムは、残業時間が36協定の閾値を超えている従業員を検出し、
アラート対象者リストを出力する機能です。

---

## 1. 事前準備

### 必要なデータセット

アラート検出前に、以下のデータセットがアップロードされている必要があります。

| データセット | 説明 | 必須列 |
|-------------|------|--------|
| **punches** | 出退勤データ | 従業員番号、勤務日付、退社時刻 |

---

## 2. アラートレベル

残業時間に応じて4段階のアラートレベルが設定されています。

| レベル | 名称 | 条件（月間残業時間） | 説明 |
|--------|------|-------------------|------|
| `info` | 情報 | 20時間以上 | 注意喚起 |
| `warning` | 警告 | 30時間以上 | 30時間超過の可能性 |
| `danger` | 危険 | 40時間以上 | 36協定上限に接近 |
| `critical` | 重大 | 45時間以上 | 36協定違反の恐れ |

---

## 3. アラート検出方法

### 3.1 基本的な検出（warningレベル以上）

```bash
curl -X POST http://localhost:8000/notifications/overtime-alerts \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3.2 検出レベルを指定

すべてのレベル（info以上）を検出：

```bash
curl -X POST http://localhost:8000/notifications/overtime-alerts \
  -H "Content-Type: application/json" \
  -d '{"min_level": "info"}'
```

危険レベル以上のみ検出：

```bash
curl -X POST http://localhost:8000/notifications/overtime-alerts \
  -H "Content-Type: application/json" \
  -d '{"min_level": "danger"}'
```

### 3.3 パラメータ一覧

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `min_level` | 文字列 | `warning` | 検出する最小アラートレベル |
| `send_email` | 真偽値 | `false` | メール送信するか（将来用） |
| `dry_run` | 真偽値 | `true` | ドライランモード |

---

## 4. レスポンス例

### 成功時

```json
{
  "dry_run": true,
  "min_level": "warning",
  "targets": [
    {
      "employee_id": "0123456",
      "employee_name": "山田 太郎",
      "department": "本社管理部",
      "current_hours": 35.5,
      "level": "warning",
      "message": "月間残業時間が30時間を超えています（現在: 35.5時間）",
      "would_notify": false
    },
    {
      "employee_id": "0234567",
      "employee_name": "佐藤 花子",
      "department": "東京営業所",
      "current_hours": 42.0,
      "level": "danger",
      "message": "月間残業時間が40時間を超えています（現在: 42.0時間）",
      "would_notify": false
    }
  ],
  "summary": {
    "total": 2,
    "by_level": {
      "warning": 1,
      "danger": 1
    }
  },
  "message": "ドライランモード: 実際の通知は送信されていません"
}
```

### 対象者なしの場合

```json
{
  "dry_run": true,
  "min_level": "warning",
  "targets": [],
  "summary": {
    "total": 0,
    "by_level": {}
  },
  "message": "ドライランモード: 実際の通知は送信されていません"
}
```

---

## 5. レスポンスフィールド説明

### targets（対象者リスト）

| フィールド | 説明 |
|-----------|------|
| `employee_id` | 従業員番号 |
| `employee_name` | 氏名 |
| `department` | 所属部署 |
| `current_hours` | 現在の月間残業時間（時間） |
| `level` | アラートレベル（info/warning/danger/critical） |
| `message` | アラートメッセージ |
| `would_notify` | 実際に通知されるか（dry_run=falseの場合true） |

### summary（集計情報）

| フィールド | 説明 |
|-----------|------|
| `total` | 対象者の総数 |
| `by_level` | レベルごとの人数 |

---

## 6. 残業時間の計算方法

残業時間は以下のルールで計算されます：

1. **基準時刻**: 17:30
2. **計算式**: 退社時刻 - 17:30 = 残業時間
3. **集計単位**: 従業員ごとに月間合計

### 例

| 退社時刻 | 残業時間 |
|---------|---------|
| 17:30 | 0分 |
| 18:30 | 60分（1時間） |
| 20:00 | 150分（2時間30分） |
| 22:00 | 270分（4時間30分） |

---

## 7. エラーと対処法

| エラー | 原因 | 対処法 |
|--------|------|--------|
| `出退社時刻ファイルがアップロードされていません` | punchesデータがない | punchesデータセットをアップロード |
| `必須列が見つかりません: emp_no` | 従業員番号列がない | データに「従業員番号」または「社員番号」列を追加 |
| `必須列が見つかりません: end_time` | 退社時刻列がない | データに「退社時刻」または「退勤時刻」列を追加 |

---

## 8. 活用例

### 8.1 日次チェック

毎日の終業後にアラート対象者を確認：

```bash
# warningレベル以上を検出
curl -X POST http://localhost:8000/notifications/overtime-alerts \
  -H "Content-Type: application/json" \
  -d '{"min_level": "warning"}'
```

### 8.2 週次レポート

週末にすべての注意対象者を確認：

```bash
# infoレベル以上を検出（20時間超過から）
curl -X POST http://localhost:8000/notifications/overtime-alerts \
  -H "Content-Type: application/json" \
  -d '{"min_level": "info"}'
```

### 8.3 緊急対応

36協定違反の恐れがある従業員のみを抽出：

```bash
# criticalレベルのみ検出（45時間超過）
curl -X POST http://localhost:8000/notifications/overtime-alerts \
  -H "Content-Type: application/json" \
  -d '{"min_level": "critical"}'
```

---

## 9. 他システムとの連携

### メール送信システムとの違い

| 機能 | アラート検出 | メール送信 |
|------|------------|----------|
| エンドポイント | `/notifications/overtime-alerts` | `/notifications/overtime-email` |
| 目的 | 閾値超過者の検出 | 組織への定期レポート送信 |
| 出力 | JSON（対象者リスト） | メール送信結果 |
| 対象 | 個人（閾値超過者） | 組織（所属名称6単位） |

### 使い分け

- **アラート検出**: 管理者が危険な状態の従業員を把握するため
- **メール送信**: 組織の責任者に定期的な残業状況を共有するため

---

## 10. よくある質問

### Q: アラート閾値を変更したい

A: 現在はコード内で固定されています。変更が必要な場合は開発チームに相談してください。

### Q: 特定の部署だけのアラートを見たい

A: レスポンスの `targets` をフィルタリングしてください。
APIレベルでの部署フィルタは現在未実装です。

### Q: 実際に通知メールを送信したい

A: `send_email` パラメータは将来用に予約されています。
現在はアラート検出のみで、通知送信は未実装です。

### Q: 月の途中でデータをリセットしたい

A: 新しいpunchesデータセットをアップロードしてください。
最新のデータセットが使用されます。

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2025-02-04 | 初版作成 |
