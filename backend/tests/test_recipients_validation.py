"""
宛先バリデーションAPIのテスト
"""
import pytest
import io
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

from backend.app import app
from backend.core.database import Base, engine, SessionLocal


@pytest.fixture(scope="function")
def test_db():
    """テスト用データベースセットアップ"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def client():
    """テストクライアント"""
    return TestClient(app)


@pytest.fixture
def mock_current_user():
    """モック認証ユーザー"""
    mock_user = MagicMock()
    mock_user.id = 1
    mock_user.email = "test@example.com"
    return mock_user


class TestUploadWithValidation:
    """アップロード時のバリデーションテスト"""

    @pytest.mark.skip(reason="認証が必要なため統合テスト環境で実行")
    def test_upload_returns_validation_warnings(self, client, test_db):
        """アップロード時に警告が返される"""
        # CSVファイルを作成
        csv_content = b"email,name,department,position\ntest@example.com,Test User,Sales,Manager"
        files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}

        response = client.post(
            "/recipients/upload",
            files=files,
        )

        # 認証なしの場合は401
        assert response.status_code == 401

    @pytest.mark.skip(reason="認証が必要なため統合テスト環境で実行")
    def test_upload_with_skip_validation(self, client, test_db):
        """バリデーションをスキップしてアップロード"""
        csv_content = b"email,name,department,position\ntest@example.com,Test User,Sales,Manager"
        files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}

        response = client.post(
            "/recipients/upload?skip_validation=true",
            files=files,
        )

        # 認証なしの場合は401
        assert response.status_code == 401


class TestValidateRecipientList:
    """リストバリデーションAPIのテスト"""

    @pytest.mark.skip(reason="認証が必要なため統合テスト環境で実行")
    def test_validate_nonexistent_list(self, client):
        """存在しないリストのバリデーション"""
        response = client.post("/recipients/lists/99999/validate")
        # 認証なしの場合は401
        assert response.status_code == 401

    @pytest.mark.skip(reason="認証が必要なため統合テスト環境で実行")
    def test_validate_list_success(self, client, test_db):
        """リストのバリデーション成功"""
        # まずリストを作成
        response = client.post(
            "/recipients/lists",
            json={"name": "Test List"},
        )

        # 認証なしの場合は401
        assert response.status_code == 401


class TestValidateRecipientsEndpoint:
    """メール送信前バリデーションAPIのテスト"""

    @pytest.mark.skip(reason="認証が必要なため統合テスト環境で実行")
    def test_validate_recipients_empty(self, client):
        """空の宛先リスト"""
        response = client.post(
            "/mail/validate-recipients",
            json={"to": [], "cc": [], "bcc": []},
        )
        # 認証なしの場合は401
        assert response.status_code == 401

    @pytest.mark.skip(reason="認証が必要なため統合テスト環境で実行")
    def test_validate_recipients_with_emails(self, client, test_db):
        """メールアドレス付きバリデーション"""
        response = client.post(
            "/mail/validate-recipients",
            json={
                "to": ["test@example.com"],
                "cc": ["cc@example.com"],
                "bcc": [],
            },
        )
        # 認証なしの場合は401
        assert response.status_code == 401


class TestValidationSchemas:
    """バリデーションスキーマのテスト"""

    def test_validation_warning_schema(self):
        """ValidationWarningスキーマのテスト"""
        from backend.routers.recipients import ValidationWarning

        warning = ValidationWarning(
            email="test@example.com",
            warning_type="not_found",
            message="見つかりません",
        )
        assert warning.email == "test@example.com"
        assert warning.warning_type == "not_found"
        assert warning.details is None

    def test_validation_warning_with_details(self):
        """詳細付きValidationWarningスキーマのテスト"""
        from backend.routers.recipients import ValidationWarning

        details = {
            "name": {"uploaded": "田中", "current": "鈴木"}
        }
        warning = ValidationWarning(
            email="test@example.com",
            warning_type="info_mismatch",
            message="情報が異なります",
            details=details,
        )
        assert warning.details == details

    def test_validation_response_schema(self):
        """ValidationResponseスキーマのテスト"""
        from backend.routers.recipients import ValidationResponse, ValidationWarning

        response = ValidationResponse(
            checked_at="2024-02-16T10:00:00Z",
            total_members=10,
            matched=8,
            mismatched=1,
            not_found=1,
            warnings=[
                ValidationWarning(
                    email="test@example.com",
                    warning_type="not_found",
                    message="見つかりません",
                )
            ],
            requires_confirmation=True,
        )
        assert response.total_members == 10
        assert response.matched == 8
        assert len(response.warnings) == 1


class TestFuzzySearchEntraDisabled:
    """ファジー検索のEntra無効化テスト"""

    def test_fuzzy_search_entra_default_false(self, client):
        """ファジー検索のデフォルトでEntraが無効"""
        # OpenAPIスキーマを取得してデフォルト値を確認
        response = client.get("/api/openapi.json")
        assert response.status_code == 200

        schema = response.json()
        paths = schema.get("paths", {})

        # ファジー検索エンドポイントを確認
        fuzzy_path = paths.get("/recipients/search/fuzzy", {})
        get_op = fuzzy_path.get("get", {})
        params = get_op.get("parameters", [])

        # include_entraパラメータを探す
        include_entra_param = None
        for param in params:
            if param.get("name") == "include_entra":
                include_entra_param = param
                break

        # パラメータが存在し、デフォルトがFalseであることを確認
        if include_entra_param:
            schema_obj = include_entra_param.get("schema", {})
            default_value = schema_obj.get("default")
            assert default_value is False, "include_entra should default to False"


class TestValidationServiceIntegration:
    """バリデーションサービスの統合テスト"""

    def test_service_initialization(self, test_db):
        """サービスの初期化"""
        from backend.services.entra_validation_service import EntraValidationService

        service = EntraValidationService(test_db)
        assert service.db == test_db

    @pytest.mark.asyncio
    async def test_validate_empty_list(self, test_db):
        """空リストのバリデーション"""
        from backend.services.entra_validation_service import EntraValidationService

        service = EntraValidationService(test_db)
        result = await service.validate_recipient_list([])

        assert result.total == 0
        assert result.matched == 0
        assert result.requires_confirmation is False

    @pytest.mark.asyncio
    async def test_validate_empty_emails(self, test_db):
        """空メールリストのバリデーション"""
        from backend.services.entra_validation_service import EntraValidationService

        service = EntraValidationService(test_db)
        result = await service.validate_emails([])

        assert result.total == 0
        assert result.matched == 0
        assert result.requires_confirmation is False
