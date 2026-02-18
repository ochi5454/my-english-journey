"""
自然言語による宛先フィルタリングサービス

LangChainを使用して、自然言語の指示に基づいて宛先リストから
条件に合うメンバーを抽出する。
"""
from typing import List, Optional, Any
import json
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from backend.core.config import Settings

settings = Settings()


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
    department: Optional[str] = None
    position: Optional[str] = None
    employee_id: Optional[str] = None
    selected: bool = Field(description="このメンバーを選択するかどうか")
    reason: str = Field(description="選択/除外の理由（日本語で簡潔に）")


class FilterResult(BaseModel):
    """フィルタリング結果全体"""
    selected_members: List[FilteredMember] = Field(
        description="選択されたメンバーのリスト"
    )
    excluded_members: List[FilteredMember] = Field(
        description="除外されたメンバーのリスト"
    )
    summary: str = Field(
        description="フィルタリング結果の要約（日本語）"
    )


# フィルタリング用システムプロンプト
FILTER_SYSTEM_TEMPLATE = """あなたは宛先リストのフィルタリングを行うアシスタントです。

ユーザーの指示に従って、与えられたメンバーリストから条件に合うメンバーを選択してください。

【ルール】
1. ユーザーの指示を正確に解釈する
2. 各メンバーについて、選択(selected=true)か除外(selected=false)かを判定する
3. 判定理由を日本語で簡潔に説明する（10文字以内）
4. 曖昧な指示の場合は、最も合理的な解釈を行う
5. 部分一致でも条件に合えば選択する（例：「営業」で「営業部」「営業企画部」も選択）

【メンバーデータのフィールド】
- id: メンバーID（内部用）
- email: メールアドレス
- name: 氏名
- department: 部署
- position: 役職
- employee_id: 社員番号
- note: 備考

【出力形式】
必ず以下のJSON形式で出力してください：
{{
  "selected_members": [
    {{"id": 1, "email": "...", "name": "...", "department": "...", "position": "...", "employee_id": "...", "selected": true, "reason": "..."}}
  ],
  "excluded_members": [
    {{"id": 2, "email": "...", "name": "...", "department": "...", "position": "...", "employee_id": "...", "selected": false, "reason": "..."}}
  ],
  "summary": "フィルタリング結果の要約"
}}

【重要】
- すべてのメンバーを selected_members か excluded_members のどちらかに必ず含めること
- JSON以外の文字は出力しないこと
"""

FILTER_HUMAN_TEMPLATE = """【フィルタリング指示】
{instruction}

【メンバーリスト】
{members_json}

上記の指示に従って、メンバーを選択/除外してJSON形式で出力してください。"""


class LangChainRecipientFilter:
    """自然言語による宛先フィルタリングサービス"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.openai_api_key
        if not self.api_key:
            raise ValueError("OpenAI API key is not configured")

        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,  # フィルタリングは確定的に
            api_key=self.api_key,
        )

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

        Raises:
            ValueError: メンバーリストが空の場合
            RuntimeError: LLMの応答が不正な場合
        """
        if not members:
            raise ValueError("メンバーリストが空です")

        if not instruction or not instruction.strip():
            raise ValueError("フィルタリング指示が空です")

        # メンバーリストをJSON文字列に変換（見やすい形式で）
        members_json = json.dumps(
            [m.model_dump() for m in members],
            ensure_ascii=False,
            indent=2
        )

        # プロンプト構築
        prompt = ChatPromptTemplate.from_messages([
            ("system", FILTER_SYSTEM_TEMPLATE),
            ("human", FILTER_HUMAN_TEMPLATE),
        ])

        # チェイン構築（JsonOutputParserを使用）
        parser = JsonOutputParser()
        chain = prompt | self.llm | parser

        try:
            # 実行
            result = await chain.ainvoke({
                "instruction": instruction,
                "members_json": members_json,
            })

            # 結果を検証・整形
            return self._validate_and_build_result(result, members)

        except json.JSONDecodeError as e:
            raise RuntimeError(f"LLMの応答をJSONとしてパースできませんでした: {e}")
        except Exception as e:
            raise RuntimeError(f"フィルタリング中にエラーが発生しました: {e}")

    def _validate_and_build_result(
        self,
        raw_result: dict,
        original_members: List[MemberData]
    ) -> FilterResult:
        """
        LLMの応答を検証し、FilterResultを構築

        Args:
            raw_result: LLMからの生のJSON応答
            original_members: 元のメンバーリスト（検証用）

        Returns:
            FilterResult: 検証済みのフィルタリング結果
        """
        selected_members = []
        excluded_members = []

        # 元のメンバーデータをIDでインデックス化
        member_map = {m.id: m for m in original_members}

        # selected_membersを処理
        for item in raw_result.get("selected_members", []):
            member_id = item.get("id")
            if member_id in member_map:
                orig = member_map[member_id]
                selected_members.append(FilteredMember(
                    id=orig.id,
                    email=orig.email,
                    name=orig.name,
                    department=orig.department,
                    position=orig.position,
                    employee_id=orig.employee_id,
                    selected=True,
                    reason=item.get("reason", "選択")
                ))

        # excluded_membersを処理
        for item in raw_result.get("excluded_members", []):
            member_id = item.get("id")
            if member_id in member_map:
                orig = member_map[member_id]
                excluded_members.append(FilteredMember(
                    id=orig.id,
                    email=orig.email,
                    name=orig.name,
                    department=orig.department,
                    position=orig.position,
                    employee_id=orig.employee_id,
                    selected=False,
                    reason=item.get("reason", "除外")
                ))

        # すべてのメンバーが処理されたか確認
        processed_ids = {m.id for m in selected_members} | {m.id for m in excluded_members}
        missing_ids = set(member_map.keys()) - processed_ids

        # 処理されなかったメンバーは除外扱いにする
        for mid in missing_ids:
            orig = member_map[mid]
            excluded_members.append(FilteredMember(
                id=orig.id,
                email=orig.email,
                name=orig.name,
                department=orig.department,
                position=orig.position,
                employee_id=orig.employee_id,
                selected=False,
                reason="条件に該当せず"
            ))

        # サマリーを生成
        summary = raw_result.get("summary", "")
        if not summary:
            total = len(original_members)
            selected = len(selected_members)
            summary = f"{total}名中{selected}名を選択しました"

        return FilterResult(
            selected_members=selected_members,
            excluded_members=excluded_members,
            summary=summary
        )

    def filter_members_sync(
        self,
        members: List[MemberData],
        instruction: str,
    ) -> FilterResult:
        """
        同期版のフィルタリングメソッド

        Args:
            members: フィルタリング対象のメンバーリスト
            instruction: 自然言語によるフィルタリング指示

        Returns:
            FilterResult: フィルタリング結果
        """
        import asyncio
        return asyncio.run(self.filter_members(members, instruction))


# シングルトンインスタンスを提供する関数
_filter_instance: Optional[LangChainRecipientFilter] = None


def get_recipient_filter() -> LangChainRecipientFilter:
    """宛先フィルタリングサービスのインスタンスを取得"""
    global _filter_instance
    if _filter_instance is None:
        _filter_instance = LangChainRecipientFilter()
    return _filter_instance
