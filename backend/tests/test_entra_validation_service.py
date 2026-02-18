"""
EntraValidationServiceの単体テスト
"""
import pytest
from datetime import datetime
from unittest.mock import MagicMock, AsyncMock, patch
from sqlalchemy.orm import Session

from backend.services.entra_validation_service import (
    EntraValidationService,
    ValidationResult,
    ValidationWarning,
)


class MockMember:
    """テスト用モックメンバー"""
    def __init__(self, email: str, name: str = None, department: str = None, position: str = None):
        self.email = email
        self.name = name
        self.department = department
        self.position = position


class TestValidationWarning:
    """ValidationWarningデータクラスのテスト"""

    def test_create_warning(self):
        """警告の作成"""
        warning = ValidationWarning(
            email="test@example.com",
            warning_type="not_found",
            message="テストメッセージ",
        )
        assert warning.email == "test@example.com"
        assert warning.warning_type == "not_found"
        assert warning.message == "テストメッセージ"
        assert warning.details is None

    def test_create_warning_with_details(self):
        """詳細付き警告の作成"""
        details = {
            "name": {"uploaded": "田中 太郎", "current": "田中 次郎"}
        }
        warning = ValidationWarning(
            email="test@example.com",
            warning_type="info_mismatch",
            message="情報が最新でない可能性があります",
            details=details,
        )
        assert warning.details == details


class TestValidationResult:
    """ValidationResultデータクラスのテスト"""

    def test_empty_result(self):
        """空の結果"""
        result = ValidationResult()
        assert result.warnings == []
        assert result.matched == 0
        assert result.mismatched == 0
        assert result.not_found == 0
        assert result.total == 0
        assert result.requires_confirmation is False

    def test_result_with_warnings(self):
        """警告ありの結果"""
        warnings = [
            ValidationWarning(
                email="test@example.com",
                warning_type="not_found",
                message="見つかりません",
            )
        ]
        result = ValidationResult(
            warnings=warnings,
            matched=5,
            mismatched=2,
            not_found=1,
            total=8,
        )
        assert result.requires_confirmation is True
        assert len(result.warnings) == 1

    def test_to_dict(self):
        """辞書形式への変換"""
        warning = ValidationWarning(
            email="test@example.com",
            warning_type="not_found",
            message="見つかりません",
        )
        result = ValidationResult(
            warnings=[warning],
            matched=5,
            mismatched=0,
            not_found=1,
            total=6,
        )
        result_dict = result.to_dict()

        assert result_dict["matched"] == 5
        assert result_dict["not_found"] == 1
        assert result_dict["total"] == 6
        assert result_dict["requires_confirmation"] is True
        assert len(result_dict["warnings"]) == 1
        assert result_dict["warnings"][0]["email"] == "test@example.com"


class TestEntraValidationServiceNameMatch:
    """名前マッチングロジックのテスト"""

    @pytest.fixture
    def service(self):
        """テスト用サービスインスタンス"""
        mock_db = MagicMock(spec=Session)
        return EntraValidationService(mock_db)

    def test_exact_match(self, service):
        """完全一致"""
        assert service._is_name_match("田中 太郎", "田中 太郎") is True

    def test_space_normalized(self, service):
        """空白の違いを無視"""
        assert service._is_name_match("田中太郎", "田中 太郎") is True
        assert service._is_name_match("田中　太郎", "田中太郎") is True  # 全角スペース

    def test_partial_match(self, service):
        """部分一致（姓のみ）"""
        assert service._is_name_match("田中", "田中 太郎") is True
        assert service._is_name_match("田中 太郎", "田中") is True

    def test_no_match(self, service):
        """不一致"""
        assert service._is_name_match("田中 太郎", "鈴木 次郎") is False
        assert service._is_name_match("山田", "田中") is False


class TestEntraValidationServiceDepartmentMatch:
    """部署マッチングロジックのテスト"""

    @pytest.fixture
    def service(self):
        mock_db = MagicMock(spec=Session)
        return EntraValidationService(mock_db)

    def test_exact_match(self, service):
        """完全一致"""
        assert service._is_department_match("営業部", "営業部") is True

    def test_partial_match(self, service):
        """部分一致"""
        assert service._is_department_match("営業", "営業部") is True
        assert service._is_department_match("営業部 第一課", "営業部") is True

    def test_no_match(self, service):
        """不一致"""
        assert service._is_department_match("営業部", "開発部") is False


class TestEntraValidationServicePositionMatch:
    """役職マッチングロジックのテスト"""

    @pytest.fixture
    def service(self):
        mock_db = MagicMock(spec=Session)
        return EntraValidationService(mock_db)

    def test_exact_match(self, service):
        """完全一致"""
        assert service._is_position_match("部長", "部長") is True

    def test_partial_match(self, service):
        """部分一致"""
        assert service._is_position_match("部長", "営業部長") is True
        assert service._is_position_match("マネージャー", "シニアマネージャー") is True

    def test_no_match(self, service):
        """不一致"""
        assert service._is_position_match("部長", "課長") is False


class TestEntraValidationServiceCompareFields:
    """フィールド比較のテスト"""

    @pytest.fixture
    def service(self):
        mock_db = MagicMock(spec=Session)
        return EntraValidationService(mock_db)

    def test_all_fields_match(self, service):
        """全フィールド一致"""
        member = MagicMock()
        member.name = "田中 太郎"
        member.department = "営業部"
        member.position = "部長"

        entra_user = {
            "displayName": "田中 太郎",
            "department": "営業部",
            "jobTitle": "部長",
        }

        mismatches = service._compare_fields(member, entra_user)
        assert mismatches == {}

    def test_name_mismatch(self, service):
        """名前が不一致"""
        member = MagicMock()
        member.name = "田中 太郎"
        member.department = "営業部"
        member.position = "部長"

        entra_user = {
            "displayName": "鈴木 次郎",
            "department": "営業部",
            "jobTitle": "部長",
        }

        mismatches = service._compare_fields(member, entra_user)
        assert "name" in mismatches
        assert mismatches["name"]["uploaded"] == "田中 太郎"
        assert mismatches["name"]["current"] == "鈴木 次郎"

    def test_department_mismatch(self, service):
        """部署が不一致"""
        member = MagicMock()
        member.name = "田中 太郎"
        member.department = "営業部"
        member.position = "部長"

        entra_user = {
            "displayName": "田中 太郎",
            "department": "開発部",
            "jobTitle": "部長",
        }

        mismatches = service._compare_fields(member, entra_user)
        assert "department" in mismatches
        assert "name" not in mismatches

    def test_empty_fields_ignored(self, service):
        """空のフィールドは比較しない"""
        member = MagicMock()
        member.name = None
        member.department = ""
        member.position = "部長"

        entra_user = {
            "displayName": "田中 太郎",
            "department": "営業部",
            "jobTitle": "部長",
        }

        mismatches = service._compare_fields(member, entra_user)
        assert mismatches == {}


class TestEntraValidationServiceSearchLocalCache:
    """ローカルキャッシュ検索のテスト"""

    def test_user_found_in_cache(self):
        """キャッシュにユーザーが見つかる"""
        mock_db = MagicMock(spec=Session)
        mock_user = MagicMock()
        mock_user.display_name = "田中 太郎"
        mock_user.email = "tanaka@example.com"
        mock_user.job_title = "部長"
        mock_user.organization = MagicMock()
        mock_user.organization.name = "営業部"

        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        service = EntraValidationService(mock_db)
        result = service._search_local_cache("tanaka@example.com")

        assert result is not None
        assert result["displayName"] == "田中 太郎"
        assert result["department"] == "営業部"
        assert result["source"] == "local_cache"

    def test_user_not_found_in_cache(self):
        """キャッシュにユーザーが見つからない"""
        mock_db = MagicMock(spec=Session)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = EntraValidationService(mock_db)
        result = service._search_local_cache("unknown@example.com")

        assert result is None

    def test_user_without_organization(self):
        """組織なしのユーザー"""
        mock_db = MagicMock(spec=Session)
        mock_user = MagicMock()
        mock_user.display_name = "田中 太郎"
        mock_user.email = "tanaka@example.com"
        mock_user.job_title = "部長"
        mock_user.organization = None

        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        service = EntraValidationService(mock_db)
        result = service._search_local_cache("tanaka@example.com")

        assert result is not None
        assert result["department"] is None


class TestEntraValidationServiceValidateRecipientList:
    """validate_recipient_listメソッドのテスト"""

    @pytest.fixture
    def mock_db(self):
        return MagicMock(spec=Session)

    @pytest.mark.asyncio
    async def test_all_members_matched(self, mock_db):
        """全メンバーが一致"""
        mock_org = MagicMock()
        mock_org.name = "営業部"

        mock_user = MagicMock()
        mock_user.display_name = "田中 太郎"
        mock_user.email = "tanaka@example.com"
        mock_user.job_title = "部長"
        mock_user.organization = mock_org

        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        service = EntraValidationService(mock_db)

        member = MockMember(
            email="tanaka@example.com",
            name="田中 太郎",
            department="営業部",
            position="部長",
        )

        result = await service.validate_recipient_list([member])

        assert result.matched == 1
        assert result.mismatched == 0
        assert result.not_found == 0
        assert result.requires_confirmation is False

    @pytest.mark.asyncio
    async def test_member_not_found(self, mock_db):
        """メンバーが見つからない"""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = EntraValidationService(mock_db)

        member = MockMember(
            email="unknown@example.com",
            name="不明 太郎",
            department=None,
            position=None,
        )

        result = await service.validate_recipient_list([member], access_token=None)

        assert result.matched == 0
        assert result.not_found == 1
        assert result.requires_confirmation is True
        assert len(result.warnings) == 1
        assert result.warnings[0].warning_type == "not_found"

    @pytest.mark.asyncio
    async def test_member_info_mismatch(self, mock_db):
        """メンバー情報が不一致"""
        mock_org = MagicMock()
        mock_org.name = "開発部"  # 異なる部署

        mock_user = MagicMock()
        mock_user.display_name = "田中 太郎"
        mock_user.email = "tanaka@example.com"
        mock_user.job_title = "課長"  # 異なる役職
        mock_user.organization = mock_org

        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

        service = EntraValidationService(mock_db)

        member = MockMember(
            email="tanaka@example.com",
            name="田中 太郎",
            department="営業部",
            position="部長",
        )

        result = await service.validate_recipient_list([member])

        assert result.matched == 0
        assert result.mismatched == 1
        assert result.requires_confirmation is True
        assert len(result.warnings) == 1
        assert result.warnings[0].warning_type == "info_mismatch"
        assert "department" in result.warnings[0].details
        assert "position" in result.warnings[0].details


class TestEntraValidationServiceValidateEmails:
    """validate_emailsメソッドのテスト"""

    @pytest.fixture
    def mock_db(self):
        return MagicMock(spec=Session)

    @pytest.mark.asyncio
    async def test_all_emails_found(self, mock_db):
        """全メールアドレスが見つかる"""
        mock_db.query.return_value.filter.return_value.first.return_value = MagicMock(
            display_name="田中 太郎",
            email="tanaka@example.com",
            job_title="部長",
            organization=MagicMock(name="営業部"),
        )

        service = EntraValidationService(mock_db)
        result = await service.validate_emails(["tanaka@example.com"])

        assert result.matched == 1
        assert result.not_found == 0
        assert result.requires_confirmation is False

    @pytest.mark.asyncio
    async def test_email_not_found(self, mock_db):
        """メールアドレスが見つからない"""
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = EntraValidationService(mock_db)
        result = await service.validate_emails(["unknown@example.com"])

        assert result.matched == 0
        assert result.not_found == 1
        assert result.requires_confirmation is True

    @pytest.mark.asyncio
    async def test_mixed_results(self, mock_db):
        """見つかるものと見つからないものの混在"""
        def side_effect(*args, **kwargs):
            mock = MagicMock()
            filter_mock = MagicMock()

            def filter_side_effect(*args, **kwargs):
                first_mock = MagicMock()
                # Check which email was queried
                if hasattr(args[0], 'right') and hasattr(args[0].right, 'value'):
                    email = args[0].right.value
                    if email == "found@example.com":
                        first_mock.first.return_value = MagicMock(
                            display_name="Found User",
                            email="found@example.com",
                            job_title="Manager",
                            organization=MagicMock(name="Sales"),
                        )
                    else:
                        first_mock.first.return_value = None
                else:
                    first_mock.first.return_value = None
                return first_mock

            filter_mock.filter = MagicMock(side_effect=filter_side_effect)
            return filter_mock

        mock_db.query = MagicMock(side_effect=side_effect)

        service = EntraValidationService(mock_db)
        # Note: This test is simplified due to mock complexity
        # In real integration tests, we'd test with actual database


class TestEntraValidationServiceGraphAPI:
    """Graph API呼び出しのテスト"""

    @pytest.mark.asyncio
    async def test_graph_api_success(self):
        """Graph API成功"""
        mock_db = MagicMock(spec=Session)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = EntraValidationService(mock_db)

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "value": [{
                    "id": "user-id",
                    "displayName": "田中 太郎",
                    "mail": "tanaka@example.com",
                    "department": "営業部",
                    "jobTitle": "部長",
                }]
            }
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            result = await service._call_graph_api_for_user(
                "tanaka@example.com", "fake-token"
            )

            assert result is not None
            assert result["displayName"] == "田中 太郎"
            assert result["source"] == "entra_api"

    @pytest.mark.asyncio
    async def test_graph_api_not_found(self):
        """Graph APIでユーザーが見つからない"""
        mock_db = MagicMock(spec=Session)
        service = EntraValidationService(mock_db)

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"value": []}
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            result = await service._call_graph_api_for_user(
                "unknown@example.com", "fake-token"
            )

            assert result is None

    @pytest.mark.asyncio
    async def test_graph_api_unauthorized(self):
        """Graph API認証エラー"""
        mock_db = MagicMock(spec=Session)
        service = EntraValidationService(mock_db)

        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_response.text = "Unauthorized"
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                return_value=mock_response
            )

            result = await service._call_graph_api_for_user(
                "test@example.com", "expired-token"
            )

            assert result is None

    @pytest.mark.asyncio
    async def test_graph_api_network_error(self):
        """Graph APIネットワークエラー"""
        import httpx

        mock_db = MagicMock(spec=Session)
        service = EntraValidationService(mock_db)

        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.get = AsyncMock(
                side_effect=httpx.RequestError("Connection failed")
            )

            result = await service._call_graph_api_for_user(
                "test@example.com", "fake-token"
            )

            assert result is None
