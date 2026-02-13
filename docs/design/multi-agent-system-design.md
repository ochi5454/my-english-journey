# AI Mail マルチエージェント設計書
> Tournament Ops MVP - AI Agent Integration Design | v1.1

---

## ⚠️ 最重要事項（実装ルール）

> **この設計書に基づいて実装を行う際は、以下のルールを厳守すること**

### 1. テストファーストの徹底

| ルール | 詳細 |
|--------|------|
| **各フェーズ完了条件** | 単体テスト・結合テストを作成し、**全件パス**した場合のみ次フェーズに進む |
| **テスト自動作成** | コード作成と同時にテストコードも作成する（後回し禁止） |
| **テスト実行** | `pytest` を実行し、全テストがパスすることを確認してから次に進む |
| **カバレッジ** | 新規作成コードは最低80%のカバレッジを目標とする |

### 2. 未完成コードの禁止

| 禁止事項 | 説明 |
|----------|------|
| **TODO コメント** | `# TODO: 後で実装` のような未実装マーカーを残さない |
| **モック/スタブ放置** | テスト用のモック以外で、仮実装のまま放置しない |
| **pass 文** | 空の関数やクラスを `pass` で放置しない |
| **NotImplementedError** | 抽象メソッド以外で `raise NotImplementedError` を残さない |
| **ペンディング** | 「後で対応」として実装を先送りしない |

### 3. 例外的な中断が必要な場合

実装を中断せざるを得ない場合は、**必ずユーザーの許可を得る**こと：

```
❌ 禁止: 勝手に TODO を残して次に進む
❌ 禁止: 「この部分は後で実装します」と宣言して放置
❌ 禁止: テストをスキップして次フェーズに進む

✅ 必須: 「〇〇の理由で実装が困難です。中断してもよいですか？」とユーザーに確認
✅ 必須: 許可を得た場合のみ、明確な理由とともに中断を記録
```

### 4. フェーズ移行チェックリスト

各フェーズ完了時に以下を確認：

- [ ] 該当フェーズの全タスクが完了している
- [ ] 単体テストが作成され、全件パスしている
- [ ] 結合テストが作成され、全件パスしている
- [ ] TODO/FIXME/HACK コメントが残っていない
- [ ] 未実装の関数・メソッドがない
- [ ] `pytest` の出力が全て緑（PASSED）である

---

## 実装チェックリスト

### Phase 1: 基盤構築
- [x] 環境変数設定（Azure OpenAI）
- [x] 依存関係追加（langgraph, langchain-openai）
- [x] `backend/agents/` ディレクトリ構造作成
- [x] `AgentState` 型定義
- [x] `ServiceContainer` 実装（DI コンテナ）
- [x] `AgentRegistry` 実装
- [x] `BaseAgent` クラス実装（DB非依存）
- [x] `IntentRouter` 実装
- [x] **単体テスト作成・実行（全件パス）** ✅ 次フェーズ移行条件

### Phase 2: サービス層の整備
- [x] `DataQueryService` インターフェース定義
- [x] `OvertimeAnalysisService` インターフェース定義
- [x] `NotificationService` インターフェース定義
- [x] `ReportGenerationService` インターフェース定義
- [x] 既存サービスのラッパー実装
- [x] **単体テスト作成・実行（全件パス）** ✅ 次フェーズ移行条件

### Phase 3: ドメインエージェント
- [x] `IntentClassifier` 実装
- [x] `DataAgent` 実装（Service経由のみ）
- [x] `AnalysisAgent` 実装（Service経由のみ）
- [x] `ChatAgent` 実装
- [x] `SynthesizeResultsNode` 実装
- [x] **単体テスト作成・実行（全件パス）** ✅ 次フェーズ移行条件

### Phase 4: 通知・レポートエージェント
- [x] `NotifyAgent` 実装（Service経由のみ）
- [x] `ReportAgent` 実装（Service経由のみ）
- [x] 確認フロー実装（プレビュー→実行）
- [x] **単体テスト作成・実行（全件パス）** ✅ 次フェーズ移行条件

### Phase 5: APIルーター層
- [x] `/api/agent/chat` エンドポイント作成
- [x] `/api/agent/chat/confirm` エンドポイント作成
- [x] `AgentOrchestrator` 統合
- [x] セッション管理（Router層のみ）
- [x] **単体テスト作成・実行（全件パス）**
- [x] **結合テスト作成・実行（全件パス）** ✅ 次フェーズ移行条件

### Phase 6: フロントエンド
- [x] `ChatInterface` コンポーネント作成
- [x] `/chat` ページ作成
- [x] Sidebar にナビゲーション追加
- [x] WebSocket対応（オプション） - ポーリング方式で実装済み
- [x] **コンポーネントテスト作成・実行（全件パス）**
- [x] **E2Eテスト作成・実行（全件パス）** ✅ 次フェーズ移行条件

### Phase 7: 最終検証・最適化
- [x] 全テストスイート実行（単体・結合・E2E）
- [x] LLMプロンプト最適化
- [x] エラーハンドリング強化
- [x] レート制限実装
- [x] パフォーマンステスト
- [x] **全テスト再実行・全件パス確認** ✅ デプロイ準備移行条件

### デプロイ準備
- [ ] 本番環境変数設定
- [ ] Azure OpenAI リソース確認
- [ ] セキュリティレビュー
- [ ] ドキュメント更新

---

## 1. 概要

### 1.1 目的
既存の勤怠管理・残業時間追跡システムに、自然言語インターフェースを通じたAIエージェント機能を追加する。ユーザーは日本語で質問・指示を行い、システムが適切なエージェントを選択して処理を実行する。

### 1.2 期待される効果
- 複雑なUI操作なしでデータ検索・分析が可能
- 定型業務（残業アラート送信、レポート生成）の自動化
- 管理者の業務効率向上

### 1.3 設計原則

| 原則 | 説明 |
|------|------|
| **DB非依存エージェント** | エージェントはDBセッションを直接持たない |
| **サービス層経由** | データアクセスは必ずサービス層を経由 |
| **責務の分離** | Router → Registry → Agent → Service → DB |
| **テスト容易性** | サービスをモック可能な設計 |

### 1.4 レイヤードアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 14)                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP/WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Router Layer                                │  │
│  │  /api/agent/chat  ←  DBセッション管理はここのみ               │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │                                  │
│  ┌───────────────────────────────▼───────────────────────────────┐  │
│  │                  Agent Registry                                │  │
│  │  エージェントの登録・取得・ライフサイクル管理                 │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │                                  │
│  ┌───────────────────────────────▼───────────────────────────────┐  │
│  │              Domain Agents (DB非依存)                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│  │  │  Data    │ │ Analysis │ │  Notify  │ │  Report  │  ...    │  │
│  │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │         │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │  │
│  │       │            │            │            │                │  │
│  └───────┼────────────┼────────────┼────────────┼────────────────┘  │
│          │            │            │            │                   │
│  ┌───────▼────────────▼────────────▼────────────▼────────────────┐  │
│  │                   Service Layer                                │  │
│  │  DataQueryService │ OvertimeService │ MailService │ ...       │  │
│  │  (インターフェース経由でのみアクセス可能)                      │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │                                  │
│  ┌───────────────────────────────▼───────────────────────────────┐  │
│  │                   Database Layer                               │  │
│  │  SQLAlchemy AsyncSession (サービス層のみがアクセス)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. アーキテクチャ詳細

### 2.1 データフロー

```
User Request
     │
     ▼
┌─────────────────┐
│  Router Layer   │  ← DBセッション生成、認証
│  (FastAPI)      │
└────────┬────────┘
         │ ServiceContainer (DIコンテナ) を生成
         ▼
┌─────────────────┐
│  Intent Router  │  ← LLMで意図分類
└────────┬────────┘
         │ intent に基づいてエージェント選択
         ▼
┌─────────────────┐
│ Agent Registry  │  ← エージェントを取得
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Domain Agent   │  ← DBアクセスなし、サービス呼び出しのみ
│  (e.g. DataAgent)│
└────────┬────────┘
         │ サービスインターフェース経由
         ▼
┌─────────────────┐
│  Service Layer  │  ← DBアクセスはここのみ
│  (DataQueryService) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Database      │
└─────────────────┘
```

### 2.2 コンポーネント責務

| コンポーネント | 責務 | DBアクセス |
|---------------|------|-----------|
| **Router** | HTTPリクエスト処理、認証、DBセッション管理 | あり（生成のみ） |
| **IntentRouter** | 意図分類、エージェント選択 | なし |
| **AgentRegistry** | エージェントの登録・取得 | なし |
| **DomainAgent** | LLM処理、パラメータ解析、サービス呼び出し | **なし** |
| **Service** | ビジネスロジック、データアクセス | あり |

---

## 3. 実装詳細

### 3.1 ServiceContainer（DIコンテナ）

```python
# backend/agents/container.py
from dataclasses import dataclass
from typing import Protocol
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_openai import AzureChatOpenAI

# ============================================
# サービスインターフェース（Protocol）
# ============================================

class IDataQueryService(Protocol):
    """データ検索サービスインターフェース"""
    async def query_data(
        self,
        file_key: str,
        filters: dict,
        limit: int = 100
    ) -> list[dict]:
        ...

    async def get_file_keys(self) -> list[str]:
        ...


class IOvertimeAnalysisService(Protocol):
    """残業分析サービスインターフェース"""
    async def calculate_summary(
        self,
        period: str | None = None,
        department: str | None = None
    ) -> list[dict]:
        ...

    async def detect_alerts(
        self,
        data: list[dict]
    ) -> list[dict]:
        ...


class INotificationService(Protocol):
    """通知サービスインターフェース"""
    async def preview_overtime_alerts(
        self,
        filters: dict
    ) -> list[dict]:
        ...

    async def send_overtime_alerts(
        self,
        recipients: list[str],
        attach_excel: bool = True
    ) -> list[dict]:
        ...


class IReportGenerationService(Protocol):
    """レポート生成サービスインターフェース"""
    async def generate_overtime_report(
        self,
        period: str | None = None
    ) -> str:
        ...

    async def generate_attendance_report(
        self,
        filters: dict
    ) -> str:
        ...


# ============================================
# ServiceContainer（DIコンテナ）
# ============================================

@dataclass
class ServiceContainer:
    """
    サービスのDIコンテナ
    エージェントはこのコンテナ経由でのみサービスにアクセス可能
    """
    data_query: IDataQueryService
    overtime_analysis: IOvertimeAnalysisService
    notification: INotificationService
    report_generation: IReportGenerationService
    llm: AzureChatOpenAI

    @classmethod
    def create(cls, db: AsyncSession, user_id: str, llm: AzureChatOpenAI) -> "ServiceContainer":
        """
        Router層でのみ呼び出される
        DBセッションはサービス層に注入され、エージェントには渡されない
        """
        from services.dataset_service import DatasetService
        from services.overtime import OvertimeService
        from services.overtime_alert import OvertimeAlertService
        from services.mail_service import MailService
        from services.excel import ExcelService

        return cls(
            data_query=DataQueryServiceImpl(DatasetService(db)),
            overtime_analysis=OvertimeAnalysisServiceImpl(
                OvertimeService(db),
                OvertimeAlertService(db)
            ),
            notification=NotificationServiceImpl(
                MailService(db),
                user_id
            ),
            report_generation=ReportGenerationServiceImpl(
                ExcelService(db)
            ),
            llm=llm
        )
```

### 3.2 サービス実装（既存サービスのラッパー）

```python
# backend/agents/services/data_query_service.py
from agents.container import IDataQueryService

class DataQueryServiceImpl(IDataQueryService):
    """データ検索サービス実装"""

    def __init__(self, dataset_service):
        self._dataset_service = dataset_service

    async def query_data(
        self,
        file_key: str,
        filters: dict,
        limit: int = 100
    ) -> list[dict]:
        """データを検索"""
        return await self._dataset_service.query_data(
            file_key=file_key,
            filters=filters,
            limit=limit
        )

    async def get_file_keys(self) -> list[str]:
        """利用可能なファイルキーを取得"""
        return [
            "schedule_input",
            "punches",
            "days_items",
            "tim_daily",
            "person_progress",
            "org_info"
        ]
```

```python
# backend/agents/services/overtime_analysis_service.py
from agents.container import IOvertimeAnalysisService

class OvertimeAnalysisServiceImpl(IOvertimeAnalysisService):
    """残業分析サービス実装"""

    def __init__(self, overtime_service, alert_service):
        self._overtime_service = overtime_service
        self._alert_service = alert_service

    async def calculate_summary(
        self,
        period: str | None = None,
        department: str | None = None
    ) -> list[dict]:
        """残業サマリーを計算"""
        return await self._overtime_service.calculate_summary(
            period=period,
            department=department
        )

    async def detect_alerts(self, data: list[dict]) -> list[dict]:
        """アラートを検出"""
        return await self._alert_service.detect_alerts(data)
```

### 3.3 AgentRegistry

```python
# backend/agents/registry.py
from typing import Dict, Type
from agents.base import BaseAgent
from agents.container import ServiceContainer

class AgentRegistry:
    """
    エージェントの登録と取得を管理
    シングルトンパターンで実装
    """

    _instance = None
    _agents: Dict[str, Type[BaseAgent]] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def register(cls, intent: str):
        """エージェントをデコレータで登録"""
        def decorator(agent_class: Type[BaseAgent]):
            cls._agents[intent] = agent_class
            return agent_class
        return decorator

    @classmethod
    def get_agent(cls, intent: str, container: ServiceContainer) -> BaseAgent:
        """意図に対応するエージェントを取得"""
        if intent not in cls._agents:
            # フォールバック: ChatAgent
            intent = "chat"

        agent_class = cls._agents[intent]
        return agent_class(container)

    @classmethod
    def list_intents(cls) -> list[str]:
        """登録されている意図一覧を取得"""
        return list(cls._agents.keys())
```

### 3.4 BaseAgent（DB非依存）

```python
# backend/agents/base.py
from abc import ABC, abstractmethod
from agents.state import AgentState
from agents.container import ServiceContainer

class BaseAgent(ABC):
    """
    エージェント基底クラス

    重要: このクラスはDBセッションを持たない
    データアクセスは必ずServiceContainer経由で行う
    """

    def __init__(self, container: ServiceContainer):
        """
        Args:
            container: サービスコンテナ（DBセッションは含まない）
        """
        self._container = container
        self._llm = container.llm

    @property
    def services(self) -> ServiceContainer:
        """サービスコンテナへのアクセス"""
        return self._container

    @abstractmethod
    async def execute(self, state: AgentState) -> AgentState:
        """
        エージェント処理を実行

        Args:
            state: 現在の状態

        Returns:
            更新された状態
        """
        raise NotImplementedError

    async def _handle_error(self, error: Exception, state: AgentState) -> AgentState:
        """標準エラーハンドリング"""
        return {
            **state,
            "error": f"{self.__class__.__name__}: {str(error)}"
        }
```

### 3.5 State Schema

```python
# backend/agents/state.py
from typing import TypedDict, Literal

class AgentState(TypedDict):
    """
    エージェント間で共有される状態
    DBセッションは含まない（Router層で管理）
    """

    # 入力
    query: str                              # ユーザーの自然言語入力
    user_id: str                            # 認証済みユーザーID

    # 意図分類
    intent: Literal[
        "data_search",      # データ検索
        "overtime_analyze", # 残業分析
        "send_email",       # メール送信
        "generate_report",  # レポート生成
        "chat"              # 一般会話/ヘルプ
    ]

    # 処理結果
    context: dict                           # リクエストメタデータ
    intermediate_results: list[dict]        # 各エージェントの出力
    final_response: str                     # ユーザーへの最終応答

    # エラー
    error: str | None
```

---

## 4. ドメインエージェント実装

### 4.1 DataAgent（データ検索エージェント）

```python
# backend/agents/domain/data_agent.py
import json
from agents.base import BaseAgent
from agents.registry import AgentRegistry
from agents.state import AgentState

@AgentRegistry.register("data_search")
class DataAgent(BaseAgent):
    """
    勤怠データ検索エージェント

    注意: DBへの直接アクセスは行わない
    データ取得はself.services.data_query経由
    """

    SUPPORTED_FILE_KEYS = {
        "schedule_input": "勤務予定入力",
        "punches": "出退社時刻",
        "days_items": "日数項目",
        "tim_daily": "日次実績",
        "person_progress": "勤務予定進捗",
        "org_info": "所属情報"
    }

    async def execute(self, state: AgentState) -> AgentState:
        try:
            # 1. LLMでクエリをパース
            params = await self._parse_query(state["query"])

            # 2. サービス経由でデータ取得（DB直接アクセスなし）
            results = await self.services.data_query.query_data(
                file_key=params["file_key"],
                filters=params["filters"],
                limit=params.get("limit", 100)
            )

            # 3. 結果を整形
            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {
                        "type": "data_search",
                        "count": len(results),
                        "data": results[:20],
                        "query_params": params
                    }
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)

    async def _parse_query(self, query: str) -> dict:
        """LLMでクエリパラメータを抽出"""
        file_keys = await self.services.data_query.get_file_keys()

        prompt = f"""
以下のユーザー質問から検索パラメータを抽出してください。

質問: {query}

対象ファイル種別:
{chr(10).join(f'- {k}: {v}' for k, v in self.SUPPORTED_FILE_KEYS.items())}

JSONで返答: {{"file_key": "...", "filters": {{}}, "limit": 100}}
"""
        response = await self._llm.ainvoke(prompt)
        return json.loads(response.content)
```

### 4.2 AnalysisAgent（残業分析エージェント）

```python
# backend/agents/domain/analysis_agent.py
import json
from agents.base import BaseAgent
from agents.registry import AgentRegistry
from agents.state import AgentState

@AgentRegistry.register("overtime_analyze")
class AnalysisAgent(BaseAgent):
    """
    残業時間分析エージェント

    注意: DBへの直接アクセスは行わない
    データ取得はself.services.overtime_analysis経由
    """

    async def execute(self, state: AgentState) -> AgentState:
        try:
            # 1. LLMで分析対象を特定
            params = await self._parse_analysis_request(state["query"])

            # 2. サービス経由で残業データ取得
            overtime_data = await self.services.overtime_analysis.calculate_summary(
                period=params.get("period"),
                department=params.get("department")
            )

            # 3. サービス経由でアラート判定
            alerts = await self.services.overtime_analysis.detect_alerts(overtime_data)

            # 4. 統計サマリー生成（エージェント内で計算）
            summary = self._generate_summary(overtime_data, alerts)

            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {
                        "type": "overtime_analysis",
                        "summary": summary,
                        "alerts": alerts,
                        "top_overtime": overtime_data[:10]
                    }
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)

    async def _parse_analysis_request(self, query: str) -> dict:
        """LLMで分析パラメータを抽出"""
        prompt = f"""
以下の質問から残業分析のパラメータを抽出してください。

質問: {query}

JSONで返答: {{"period": "2026-02" | null, "department": "部門名" | null}}
"""
        response = await self._llm.ainvoke(prompt)
        return json.loads(response.content)

    def _generate_summary(self, data: list, alerts: list) -> dict:
        """統計サマリーを生成（DB不要の純粋な計算）"""
        if not data:
            return {
                "total_employees": 0,
                "total_overtime_hours": 0,
                "average_overtime": 0,
                "warning_count": 0,
                "critical_count": 0
            }

        total_hours = sum(d.get("overtime_hours", 0) for d in data)
        return {
            "total_employees": len(data),
            "total_overtime_hours": total_hours,
            "average_overtime": total_hours / len(data),
            "warning_count": len([a for a in alerts if a.get("level") == "warning"]),
            "critical_count": len([a for a in alerts if a.get("level") == "critical"])
        }
```

### 4.3 NotifyAgent（通知エージェント）

```python
# backend/agents/domain/notify_agent.py
import json
from agents.base import BaseAgent
from agents.registry import AgentRegistry
from agents.state import AgentState

@AgentRegistry.register("send_email")
class NotifyAgent(BaseAgent):
    """
    メール送信エージェント

    注意: DBへの直接アクセスは行わない
    メール送信はself.services.notification経由
    """

    async def execute(self, state: AgentState) -> AgentState:
        try:
            # 1. LLMで送信内容をパース
            params = await self._parse_notification_request(state["query"])

            # 2. 常にプレビューを先に返す
            preview = await self.services.notification.preview_overtime_alerts(
                filters=params.get("filters", {})
            )

            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {
                        "type": "notification_preview",
                        "preview": preview,
                        "params": params,
                        "requires_confirmation": True
                    }
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)

    async def execute_confirmed(self, state: AgentState, params: dict) -> AgentState:
        """確認後の実行（Router層から呼び出される）"""
        try:
            results = await self.services.notification.send_overtime_alerts(
                recipients=params["recipients"],
                attach_excel=params.get("attach_excel", True)
            )

            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {
                        "type": "notification_sent",
                        "sent_count": len(results),
                        "recipients": [r["email"] for r in results]
                    }
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)

    async def _parse_notification_request(self, query: str) -> dict:
        """LLMで通知パラメータを抽出"""
        prompt = f"""
以下の質問からメール送信のパラメータを抽出してください。

質問: {query}

JSONで返答: {{"filters": {{"level": "warning" | "critical" | null}}, "attach_excel": true}}
"""
        response = await self._llm.ainvoke(prompt)
        return json.loads(response.content)
```

### 4.4 ReportAgent（レポート生成エージェント）

```python
# backend/agents/domain/report_agent.py
import json
from agents.base import BaseAgent
from agents.registry import AgentRegistry
from agents.state import AgentState

@AgentRegistry.register("generate_report")
class ReportAgent(BaseAgent):
    """
    レポート生成エージェント

    注意: DBへの直接アクセスは行わない
    レポート生成はself.services.report_generation経由
    """

    REPORT_TYPES = {
        "overtime_monthly": "月次残業レポート",
        "attendance_summary": "勤怠サマリー",
        "department_summary": "部門別集計"
    }

    async def execute(self, state: AgentState) -> AgentState:
        try:
            # 1. LLMでレポート種別を判定
            report_type = await self._detect_report_type(state["query"])

            # 2. サービス経由でレポート生成
            if report_type == "overtime_monthly":
                file_path = await self.services.report_generation.generate_overtime_report()
            else:
                file_path = await self.services.report_generation.generate_attendance_report(
                    filters={}
                )

            # 3. ダウンロードURLを生成
            download_url = f"/api/export/download/{file_path}"

            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {
                        "type": "report_generated",
                        "report_type": report_type,
                        "title": self.REPORT_TYPES.get(report_type, "レポート"),
                        "download_url": download_url
                    }
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)

    async def _detect_report_type(self, query: str) -> str:
        """LLMでレポート種別を判定"""
        prompt = f"""
以下の質問から生成すべきレポートの種類を判定してください。

質問: {query}

種類:
- overtime_monthly: 残業レポート
- attendance_summary: 勤怠サマリー
- department_summary: 部門別集計

種類名のみを返答してください（例: overtime_monthly）
"""
        response = await self._llm.ainvoke(prompt)
        return response.content.strip()
```

### 4.5 ChatAgent（一般会話エージェント）

```python
# backend/agents/domain/chat_agent.py
from agents.base import BaseAgent
from agents.registry import AgentRegistry
from agents.state import AgentState

@AgentRegistry.register("chat")
class ChatAgent(BaseAgent):
    """
    一般会話・ヘルプエージェント

    DBアクセス不要、LLMのみ使用
    """

    SYSTEM_PROMPT = """あなたはAI Mailのアシスタントです。

## システムの機能
- 勤怠データのアップロード（Excel/CSV）
- 残業時間の自動計算と集計
- 残業アラートの検出と通知
- 部門別・個人別のレポート生成

## 対応可能な指示例
- 「今月の残業状況を教えて」→ 残業分析
- 「開発部の勤怠データを見せて」→ データ検索
- 「残業アラートを送信して」→ メール送信
- 「月次レポートを作成して」→ レポート生成

ユーザーの質問に対して、簡潔かつ丁寧に回答してください。
"""

    async def execute(self, state: AgentState) -> AgentState:
        try:
            response = await self._llm.ainvoke([
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": state["query"]}
            ])

            return {
                **state,
                "intermediate_results": [
                    *state["intermediate_results"],
                    {
                        "type": "chat",
                        "response": response.content
                    }
                ]
            }
        except Exception as e:
            return await self._handle_error(e, state)
```

---

## 5. オーケストレーター設計

### 5.1 IntentRouter

```python
# backend/agents/intent_router.py
from agents.state import AgentState
from langchain_openai import AzureChatOpenAI

class IntentRouter:
    """
    意図分類ルーター

    LLMを使用してユーザー入力の意図を分類
    DBアクセスなし
    """

    CLASSIFICATION_PROMPT = """
ユーザーの入力を以下の5つのインテントに分類してください。

インテント:
- data_search: データの検索・表示・一覧取得
- overtime_analyze: 残業時間の分析・集計・アラート確認
- send_email: メール送信・通知
- generate_report: レポート生成・Excel出力
- chat: システムの使い方・ヘルプ・その他

ユーザー入力: {query}

インテント名のみを返答してください（例: data_search）
"""

    VALID_INTENTS = [
        "data_search",
        "overtime_analyze",
        "send_email",
        "generate_report",
        "chat"
    ]

    def __init__(self, llm: AzureChatOpenAI):
        self._llm = llm

    async def classify(self, state: AgentState) -> AgentState:
        """意図を分類"""
        prompt = self.CLASSIFICATION_PROMPT.format(query=state["query"])
        response = await self._llm.ainvoke(prompt)
        intent = response.content.strip().lower()

        # バリデーション
        if intent not in self.VALID_INTENTS:
            intent = "chat"

        return {**state, "intent": intent}
```

### 5.2 AgentOrchestrator

```python
# backend/agents/orchestrator.py
from agents.state import AgentState
from agents.container import ServiceContainer
from agents.registry import AgentRegistry
from agents.intent_router import IntentRouter
from agents.synthesizer import ResultSynthesizer

class AgentOrchestrator:
    """
    エージェントオーケストレーター

    処理フロー:
    1. IntentRouter で意図分類
    2. AgentRegistry からエージェント取得
    3. エージェント実行
    4. ResultSynthesizer で結果統合
    """

    def __init__(self, container: ServiceContainer):
        self._container = container
        self._intent_router = IntentRouter(container.llm)
        self._synthesizer = ResultSynthesizer(container.llm)

    async def process(self, state: AgentState) -> AgentState:
        """
        リクエストを処理

        Args:
            state: 初期状態（DBセッションは含まない）

        Returns:
            処理結果を含む状態
        """
        # 1. 意図分類
        state = await self._intent_router.classify(state)

        # 2. エージェント取得・実行
        agent = AgentRegistry.get_agent(state["intent"], self._container)
        state = await agent.execute(state)

        # 3. 結果統合
        state = await self._synthesizer.synthesize(state)

        return state
```

### 5.3 ResultSynthesizer

```python
# backend/agents/synthesizer.py
from agents.state import AgentState
from langchain_openai import AzureChatOpenAI

class ResultSynthesizer:
    """
    結果統合

    各エージェントの出力を自然言語応答に変換
    """

    def __init__(self, llm: AzureChatOpenAI):
        self._llm = llm

    async def synthesize(self, state: AgentState) -> AgentState:
        """結果を統合"""
        results = state["intermediate_results"]

        if not results:
            return {
                **state,
                "final_response": "処理結果がありません。もう一度お試しください。"
            }

        result = results[-1]
        response = await self._format_response(result)

        return {**state, "final_response": response}

    async def _format_response(self, result: dict) -> str:
        """結果を自然言語応答に変換"""
        result_type = result.get("type")

        if result_type == "data_search":
            return f"検索結果: {result['count']}件のデータが見つかりました。"

        elif result_type == "overtime_analysis":
            summary = result["summary"]
            return f"""残業分析結果:
- 対象者数: {summary['total_employees']}名
- 総残業時間: {summary['total_overtime_hours']:.1f}時間
- 平均残業時間: {summary['average_overtime']:.1f}時間
- 警告レベル: {summary['warning_count']}名
- 危険レベル: {summary['critical_count']}名"""

        elif result_type == "notification_preview":
            preview = result["preview"]
            return f"メール送信プレビュー:\n対象: {len(preview)}名\n送信を実行しますか？"

        elif result_type == "notification_sent":
            return f"メール送信完了: {result['sent_count']}件送信しました。"

        elif result_type == "report_generated":
            return f"レポート「{result['title']}」を生成しました。\nダウンロード: {result['download_url']}"

        elif result_type == "chat":
            return result["response"]

        return "処理が完了しました。"
```

---

## 6. Router Layer（API層）

### 6.1 エンドポイント実装

```python
# backend/routers/agent_chat.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from agents.container import ServiceContainer
from agents.orchestrator import AgentOrchestrator
from agents.state import AgentState
from core.config import get_llm

router = APIRouter(prefix="/api/agent", tags=["agent"])


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None


class ChatResponse(BaseModel):
    response: str
    intent: str
    data: list | None = None
    requires_confirmation: bool = False
    error: str | None = None


@router.post("/chat", response_model=ChatResponse)
async def agent_chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),           # DBセッションはRouter層のみ
    current_user: User = Depends(get_current_user)
):
    """
    自然言語インターフェース

    DBセッションはここでのみ管理し、ServiceContainer経由でサービスに注入
    エージェントはDBセッションを直接受け取らない
    """

    # 1. LLMインスタンス取得
    llm = get_llm()

    # 2. ServiceContainer生成（DBセッションはサービスに注入）
    container = ServiceContainer.create(
        db=db,
        user_id=str(current_user.id),
        llm=llm
    )

    # 3. 初期状態を構築（DBセッションは含まない）
    initial_state = AgentState(
        query=request.message,
        user_id=str(current_user.id),
        intent="",
        context=request.context or {},
        intermediate_results=[],
        final_response="",
        error=None
    )

    # 4. オーケストレーター実行
    orchestrator = AgentOrchestrator(container)
    result = await orchestrator.process(initial_state)

    # 5. レスポンス構築
    return ChatResponse(
        response=result["final_response"],
        intent=result["intent"],
        data=result["intermediate_results"],
        requires_confirmation=any(
            r.get("requires_confirmation")
            for r in result["intermediate_results"]
        ),
        error=result["error"]
    )


@router.post("/chat/confirm")
async def confirm_action(
    action_id: str,
    confirmed: bool,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    確認が必要なアクションの実行/キャンセル
    """
    if not confirmed:
        return {"status": "cancelled"}

    # 保存されたアクションを取得して実行
    # （実装省略：アクション保存機構が必要）
    return {"status": "executed"}
```

### 6.2 main.py への統合

```python
# backend/main.py
from fastapi import FastAPI

app = FastAPI(title="Tournament Ops MVP")

# ============================================
# 既存API（変更なし）
# ============================================
app.include_router(auth.router)
app.include_router(excel.router)
app.include_router(datasets.router)
app.include_router(export.router)
app.include_router(jobs.router)
app.include_router(notifications.router)
app.include_router(api_keys.router)
app.include_router(tournament.router)

# ============================================
# 新規: エージェントAPI
# ============================================
from routers.agent_chat import router as agent_router
app.include_router(agent_router)
```

---

## 7. ディレクトリ構造

```
backend/
├── agents/
│   ├── __init__.py
│   ├── state.py              # AgentState 定義
│   ├── base.py               # BaseAgent（DB非依存）
│   ├── container.py          # ServiceContainer（DIコンテナ）
│   ├── registry.py           # AgentRegistry
│   ├── intent_router.py      # IntentRouter
│   ├── orchestrator.py       # AgentOrchestrator
│   ├── synthesizer.py        # ResultSynthesizer
│   │
│   ├── domain/               # ドメインエージェント
│   │   ├── __init__.py
│   │   ├── data_agent.py
│   │   ├── analysis_agent.py
│   │   ├── notify_agent.py
│   │   ├── report_agent.py
│   │   └── chat_agent.py
│   │
│   └── services/             # サービス実装（ラッパー）
│       ├── __init__.py
│       ├── data_query_service.py
│       ├── overtime_analysis_service.py
│       ├── notification_service.py
│       └── report_generation_service.py
│
├── routers/
│   ├── ...
│   └── agent_chat.py         # APIエンドポイント
│
├── services/                 # 既存サービス（変更なし）
│   ├── dataset_service.py
│   ├── overtime.py
│   ├── mail_service.py
│   └── ...
│
└── ...
```

---

## 8. セキュリティ設計

### 8.1 DB アクセス制御

```
┌─────────────────────────────────────────────────────────────────┐
│                      セキュリティ境界                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                               │
│  │   Router    │  ← DBセッション生成・管理                      │
│  │   Layer     │  ← 認証チェック                               │
│  └──────┬──────┘                                               │
│         │                                                       │
│         │ ServiceContainer（DBセッションはサービスに注入）       │
│         │                                                       │
│  ┌──────▼──────┐                                               │
│  │   Agent     │  ← DBアクセス不可                             │
│  │   Layer     │  ← サービスインターフェース経由のみ            │
│  └──────┬──────┘                                               │
│         │                                                       │
│         │ Protocol（インターフェース）                          │
│         │                                                       │
│  ┌──────▼──────┐                                               │
│  │  Service    │  ← DBアクセス可能                             │
│  │   Layer     │  ← 入力検証                                   │
│  └─────────────┘                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 入力検証

```python
# サービス層での検証例
class DataQueryServiceImpl(IDataQueryService):
    async def query_data(self, file_key: str, filters: dict, limit: int = 100) -> list[dict]:
        # バリデーション
        if file_key not in ALLOWED_FILE_KEYS:
            raise ValueError(f"Invalid file_key: {file_key}")

        if limit > 1000:
            limit = 1000  # 上限制限

        # フィルターのサニタイズ
        safe_filters = self._sanitize_filters(filters)

        return await self._dataset_service.query_data(
            file_key=file_key,
            filters=safe_filters,
            limit=limit
        )
```

---

## 9. テスト戦略

### 9.1 サービス層のモック

```python
# tests/agents/test_data_agent.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from agents.domain.data_agent import DataAgent
from agents.container import ServiceContainer
from agents.state import AgentState

@pytest.fixture
def mock_container():
    """モックServiceContainerを作成"""
    container = MagicMock(spec=ServiceContainer)

    # データクエリサービスのモック
    container.data_query = AsyncMock()
    container.data_query.query_data.return_value = [
        {"id": 1, "name": "田中"},
        {"id": 2, "name": "佐藤"}
    ]
    container.data_query.get_file_keys.return_value = ["punches", "org_info"]

    # LLMのモック
    container.llm = AsyncMock()
    container.llm.ainvoke.return_value = MagicMock(
        content='{"file_key": "punches", "filters": {}, "limit": 100}'
    )

    return container

@pytest.mark.asyncio
async def test_data_agent_search(mock_container):
    """DataAgentがサービス経由でデータを取得できることを確認"""
    agent = DataAgent(mock_container)

    state = AgentState(
        query="出退勤データを見せて",
        user_id="test-user",
        intent="data_search",
        context={},
        intermediate_results=[],
        final_response="",
        error=None
    )

    result = await agent.execute(state)

    # アサーション
    assert result["error"] is None
    assert len(result["intermediate_results"]) == 1
    assert result["intermediate_results"][0]["type"] == "data_search"
    assert result["intermediate_results"][0]["count"] == 2

    # サービスが呼び出されたことを確認
    mock_container.data_query.query_data.assert_called_once()
```

### 9.2 統合テスト

```python
# tests/test_agent_integration.py
@pytest.mark.asyncio
async def test_full_flow_without_db():
    """
    DBなしでエージェントフローをテスト
    サービス層をモックで置き換え
    """
    mock_container = create_mock_container()
    orchestrator = AgentOrchestrator(mock_container)

    state = AgentState(
        query="今月の残業状況を教えて",
        user_id="test-user",
        intent="",
        context={},
        intermediate_results=[],
        final_response="",
        error=None
    )

    result = await orchestrator.process(state)

    assert result["intent"] == "overtime_analyze"
    assert "残業" in result["final_response"]
```

---

## 10. 環境設定

### 10.1 追加の環境変数

```bash
# backend/.env (追加分)

# Azure OpenAI
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# LangSmith (オプション)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-key
LANGCHAIN_PROJECT=tournament-ops-agent
```

### 10.2 追加の依存関係

```txt
# requirements.txt (追加分)

# LangChain
langchain>=0.2.0
langchain-openai>=0.1.0

# オプション
langsmith>=0.1.0
```

---

## 11. 移行ガイド

### 11.1 既存コードへの影響

| コンポーネント | 変更 |
|---------------|------|
| 既存サービス | **変更なし** |
| 既存API | **変更なし** |
| 既存モデル | **変更なし** |
| 新規追加 | agents/, routers/agent_chat.py |

### 11.2 段階的導入

1. **Phase 1**: ServiceContainer + BaseAgent の骨組み
2. **Phase 2**: ChatAgent のみで動作確認
3. **Phase 3**: DataAgent + AnalysisAgent
4. **Phase 4**: NotifyAgent + ReportAgent
5. **Phase 5**: フロントエンド統合

---

**End of Design Document** | Version 1.1 | 2026-02-06

### 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2026-02-06 | 初版作成 |
| 1.1 | 2026-02-06 | DB非依存アーキテクチャへ変更、ServiceContainer導入、AgentRegistry追加 |
