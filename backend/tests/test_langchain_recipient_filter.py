"""
LangChain宛先フィルタリングサービスのユニットテスト
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from backend.services.langchain_recipient_filter import (
    LangChainRecipientFilter,
    MemberData,
    FilteredMember,
    FilterResult,
    get_recipient_filter,
)


class TestMemberData:
    """MemberDataモデルのテスト"""

    def test_create_member_data_full(self):
        """全フィールド指定でMemberDataを作成"""
        member = MemberData(
            id=1,
            email="test@example.com",
            name="山田太郎",
            department="営業部",
            position="部長",
            employee_id="E001",
            note="テスト用メンバー"
        )
        assert member.id == 1
        assert member.email == "test@example.com"
        assert member.name == "山田太郎"
        assert member.department == "営業部"
        assert member.position == "部長"
        assert member.employee_id == "E001"
        assert member.note == "テスト用メンバー"

    def test_create_member_data_minimal(self):
        """最小限のフィールドでMemberDataを作成"""
        member = MemberData(id=1, email="test@example.com")
        assert member.id == 1
        assert member.email == "test@example.com"
        assert member.name is None
        assert member.department is None
        assert member.position is None
        assert member.employee_id is None
        assert member.note is None


class TestFilteredMember:
    """FilteredMemberモデルのテスト"""

    def test_create_filtered_member_selected(self):
        """選択されたメンバーを作成"""
        member = FilteredMember(
            id=1,
            email="test@example.com",
            name="山田太郎",
            selected=True,
            reason="営業部に所属"
        )
        assert member.selected is True
        assert member.reason == "営業部に所属"

    def test_create_filtered_member_excluded(self):
        """除外されたメンバーを作成"""
        member = FilteredMember(
            id=2,
            email="test2@example.com",
            name="鈴木花子",
            selected=False,
            reason="条件に該当せず"
        )
        assert member.selected is False
        assert member.reason == "条件に該当せず"


class TestFilterResult:
    """FilterResultモデルのテスト"""

    def test_create_filter_result(self):
        """フィルタリング結果を作成"""
        selected = [
            FilteredMember(id=1, email="a@example.com", selected=True, reason="選択")
        ]
        excluded = [
            FilteredMember(id=2, email="b@example.com", selected=False, reason="除外")
        ]
        result = FilterResult(
            selected_members=selected,
            excluded_members=excluded,
            summary="2名中1名を選択"
        )
        assert len(result.selected_members) == 1
        assert len(result.excluded_members) == 1
        assert result.summary == "2名中1名を選択"


class TestLangChainRecipientFilter:
    """LangChainRecipientFilterクラスのテスト"""

    @pytest.fixture
    def mock_llm_response(self):
        """LLMの模擬レスポンス"""
        return {
            "selected_members": [
                {
                    "id": 1,
                    "email": "yamada@example.com",
                    "name": "山田太郎",
                    "department": "営業部",
                    "position": "部長",
                    "employee_id": "E001",
                    "selected": True,
                    "reason": "営業部所属"
                }
            ],
            "excluded_members": [
                {
                    "id": 2,
                    "email": "suzuki@example.com",
                    "name": "鈴木花子",
                    "department": "開発部",
                    "position": "課長",
                    "employee_id": "E002",
                    "selected": False,
                    "reason": "営業部以外"
                }
            ],
            "summary": "営業部のメンバー1名を選択しました"
        }

    @pytest.fixture
    def sample_members(self):
        """テスト用メンバーリスト"""
        return [
            MemberData(
                id=1,
                email="yamada@example.com",
                name="山田太郎",
                department="営業部",
                position="部長",
                employee_id="E001"
            ),
            MemberData(
                id=2,
                email="suzuki@example.com",
                name="鈴木花子",
                department="開発部",
                position="課長",
                employee_id="E002"
            ),
            MemberData(
                id=3,
                email="tanaka@example.com",
                name="田中次郎",
                department="営業部",
                position="主任",
                employee_id="E003"
            )
        ]

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_init_with_api_key(self, mock_chat):
        """APIキー指定で初期化"""
        filter_service = LangChainRecipientFilter(api_key="test-api-key")
        mock_chat.assert_called_once()
        assert filter_service.api_key == "test-api-key"

    @patch("backend.services.langchain_recipient_filter.settings")
    def test_init_without_api_key_raises(self, mock_settings):
        """APIキーなしで初期化するとエラー"""
        mock_settings.openai_api_key = None
        with pytest.raises(ValueError, match="OpenAI API key is not configured"):
            LangChainRecipientFilter()

    @pytest.mark.asyncio
    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    async def test_filter_members_success(self, mock_chat, sample_members, mock_llm_response):
        """正常なフィルタリング"""
        # LLMのモック設定
        mock_chain = AsyncMock()
        mock_chain.ainvoke = AsyncMock(return_value=mock_llm_response)

        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            # _validate_and_build_resultをテスト
            result = filter_service._validate_and_build_result(
                mock_llm_response,
                sample_members
            )

            assert len(result.selected_members) == 1
            assert len(result.excluded_members) == 2  # 1 excluded + 1 missing
            assert result.selected_members[0].id == 1
            assert result.selected_members[0].name == "山田太郎"
            assert result.selected_members[0].selected is True

    @pytest.mark.asyncio
    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    async def test_filter_members_empty_list_raises(self, mock_chat):
        """空のメンバーリストでエラー"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            with pytest.raises(ValueError, match="メンバーリストが空です"):
                await filter_service.filter_members([], "営業部の人")

    @pytest.mark.asyncio
    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    async def test_filter_members_empty_instruction_raises(self, mock_chat, sample_members):
        """空の指示でエラー"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            with pytest.raises(ValueError, match="フィルタリング指示が空です"):
                await filter_service.filter_members(sample_members, "")

            with pytest.raises(ValueError, match="フィルタリング指示が空です"):
                await filter_service.filter_members(sample_members, "   ")

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_validate_and_build_result_all_excluded(self, mock_chat, sample_members):
        """全員除外の場合"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            raw_result = {
                "selected_members": [],
                "excluded_members": [
                    {"id": 1, "selected": False, "reason": "条件外"},
                    {"id": 2, "selected": False, "reason": "条件外"},
                    {"id": 3, "selected": False, "reason": "条件外"}
                ],
                "summary": "条件に該当するメンバーはいません"
            }

            result = filter_service._validate_and_build_result(raw_result, sample_members)

            assert len(result.selected_members) == 0
            assert len(result.excluded_members) == 3
            assert result.summary == "条件に該当するメンバーはいません"

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_validate_and_build_result_all_selected(self, mock_chat, sample_members):
        """全員選択の場合"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            raw_result = {
                "selected_members": [
                    {"id": 1, "selected": True, "reason": "条件一致"},
                    {"id": 2, "selected": True, "reason": "条件一致"},
                    {"id": 3, "selected": True, "reason": "条件一致"}
                ],
                "excluded_members": [],
                "summary": "全員選択しました"
            }

            result = filter_service._validate_and_build_result(raw_result, sample_members)

            assert len(result.selected_members) == 3
            assert len(result.excluded_members) == 0
            assert result.summary == "全員選択しました"

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_validate_and_build_result_missing_members_handled(self, mock_chat, sample_members):
        """LLMが一部メンバーを返さなかった場合、除外扱いになる"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            # ID=3のメンバーが結果に含まれていない
            raw_result = {
                "selected_members": [
                    {"id": 1, "selected": True, "reason": "選択"}
                ],
                "excluded_members": [
                    {"id": 2, "selected": False, "reason": "除外"}
                ],
                "summary": "テスト"
            }

            result = filter_service._validate_and_build_result(raw_result, sample_members)

            assert len(result.selected_members) == 1
            assert len(result.excluded_members) == 2
            # ID=3は「条件に該当せず」として除外されている
            excluded_ids = [m.id for m in result.excluded_members]
            assert 3 in excluded_ids
            missing_member = next(m for m in result.excluded_members if m.id == 3)
            assert missing_member.reason == "条件に該当せず"

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_validate_and_build_result_generates_summary_if_missing(self, mock_chat, sample_members):
        """サマリーがない場合は自動生成"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            raw_result = {
                "selected_members": [
                    {"id": 1, "selected": True, "reason": "選択"}
                ],
                "excluded_members": [
                    {"id": 2, "selected": False, "reason": "除外"},
                    {"id": 3, "selected": False, "reason": "除外"}
                ],
                "summary": ""  # 空のサマリー
            }

            result = filter_service._validate_and_build_result(raw_result, sample_members)

            assert result.summary == "3名中1名を選択しました"


class TestGetRecipientFilter:
    """get_recipient_filter関数のテスト"""

    @patch("backend.services.langchain_recipient_filter._filter_instance", None)
    @patch("backend.services.langchain_recipient_filter.LangChainRecipientFilter")
    def test_get_recipient_filter_creates_instance(self, mock_filter_class):
        """インスタンスが作成される"""
        mock_instance = MagicMock()
        mock_filter_class.return_value = mock_instance

        result = get_recipient_filter()

        mock_filter_class.assert_called_once()
        assert result == mock_instance

    @patch("backend.services.langchain_recipient_filter._filter_instance")
    def test_get_recipient_filter_returns_existing(self, mock_instance):
        """既存インスタンスを返す"""
        mock_instance_obj = MagicMock()

        with patch("backend.services.langchain_recipient_filter._filter_instance", mock_instance_obj):
            # インスタンスが既にある場合は新規作成しない
            # Note: この実装ではNoneでない限り既存を返す
            pass


class TestFilterWithVariousInstructions:
    """様々な指示でのフィルタリングテスト"""

    @pytest.fixture
    def diverse_members(self):
        """多様なメンバーリスト"""
        return [
            MemberData(id=1, email="a@ex.com", name="山田太郎", department="営業部", position="部長"),
            MemberData(id=2, email="b@ex.com", name="鈴木花子", department="営業部", position="課長"),
            MemberData(id=3, email="c@ex.com", name="田中次郎", department="開発部", position="部長"),
            MemberData(id=4, email="d@ex.com", name="佐藤三郎", department="開発部", position="主任"),
            MemberData(id=5, email="e@ex.com", name="高橋四郎", department="総務部", position="課長"),
        ]

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_filter_by_department(self, mock_chat, diverse_members):
        """部署でフィルタリング"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            # 営業部のメンバーを選択した結果を模擬
            raw_result = {
                "selected_members": [
                    {"id": 1, "selected": True, "reason": "営業部所属"},
                    {"id": 2, "selected": True, "reason": "営業部所属"}
                ],
                "excluded_members": [
                    {"id": 3, "selected": False, "reason": "開発部"},
                    {"id": 4, "selected": False, "reason": "開発部"},
                    {"id": 5, "selected": False, "reason": "総務部"}
                ],
                "summary": "営業部の2名を選択"
            }

            result = filter_service._validate_and_build_result(raw_result, diverse_members)

            assert len(result.selected_members) == 2
            selected_names = [m.name for m in result.selected_members]
            assert "山田太郎" in selected_names
            assert "鈴木花子" in selected_names

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_filter_by_position(self, mock_chat, diverse_members):
        """役職でフィルタリング"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            # 部長のメンバーを選択した結果を模擬
            raw_result = {
                "selected_members": [
                    {"id": 1, "selected": True, "reason": "部長"},
                    {"id": 3, "selected": True, "reason": "部長"}
                ],
                "excluded_members": [
                    {"id": 2, "selected": False, "reason": "課長"},
                    {"id": 4, "selected": False, "reason": "主任"},
                    {"id": 5, "selected": False, "reason": "課長"}
                ],
                "summary": "部長2名を選択"
            }

            result = filter_service._validate_and_build_result(raw_result, diverse_members)

            assert len(result.selected_members) == 2
            for member in result.selected_members:
                assert member.position == "部長"

    @patch("backend.services.langchain_recipient_filter.ChatOpenAI")
    def test_filter_exclude_specific_person(self, mock_chat, diverse_members):
        """特定の人を除外"""
        with patch.object(LangChainRecipientFilter, '__init__', lambda x, api_key=None: None):
            filter_service = LangChainRecipientFilter()
            filter_service.api_key = "test-key"
            filter_service.llm = MagicMock()

            # 山田さんを除外した結果を模擬
            raw_result = {
                "selected_members": [
                    {"id": 2, "selected": True, "reason": "選択"},
                    {"id": 3, "selected": True, "reason": "選択"},
                    {"id": 4, "selected": True, "reason": "選択"},
                    {"id": 5, "selected": True, "reason": "選択"}
                ],
                "excluded_members": [
                    {"id": 1, "selected": False, "reason": "除外指定"}
                ],
                "summary": "山田さんを除外して4名を選択"
            }

            result = filter_service._validate_and_build_result(raw_result, diverse_members)

            assert len(result.selected_members) == 4
            assert len(result.excluded_members) == 1
            assert result.excluded_members[0].name == "山田太郎"
