"""
APIエンドポイントのテスト
"""
import pytest
import io
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


class TestHealthEndpoint:
    """ヘルスチェックエンドポイントのテスト"""

    def test_health_check(self, client):
        """ヘルスチェック成功"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data


class TestExcelConfigEndpoint:
    """Excel設定エンドポイントのテスト"""

    def test_get_config(self, client):
        """設定取得成功"""
        response = client.get("/excel/config")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        # 想定されるファイルキーが存在することを確認
        expected_keys = ["schedule_input", "punches", "days_items", "tim_daily", "person_progress", "org_info"]
        for key in expected_keys:
            assert key in data


class TestExcelUploadEndpoint:
    """Excelアップロードエンドポイントのテスト"""

    def test_upload_invalid_file_key(self, client):
        """無効なファイルキー"""
        # 空のファイルを作成
        file_content = b"dummy content"
        files = {"file": ("test.xlsx", io.BytesIO(file_content), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}

        response = client.post("/excel/invalid_key/upload", files=files)
        assert response.status_code in [400, 422]  # バリデーションエラー

    def test_upload_invalid_file_format(self, client):
        """無効なファイル形式"""
        file_content = b"dummy content"
        files = {"file": ("test.txt", io.BytesIO(file_content), "text/plain")}

        response = client.post("/excel/schedule_input/upload", files=files)
        assert response.status_code == 400
        data = response.json()
        assert "code" in data["detail"]  # エラーコードが含まれる

    def test_upload_missing_file(self, client):
        """ファイル未指定"""
        response = client.post("/excel/schedule_input/upload")
        assert response.status_code == 422  # バリデーションエラー


class TestExcelAsyncUploadEndpoint:
    """Excel非同期アップロードエンドポイントのテスト"""

    @pytest.mark.skip(reason="実際の有効なExcelファイルが必要なため、統合テストで実行")
    def test_async_upload_returns_job_id(self, client, test_db):
        """非同期アップロードがジョブIDを返す"""
        # 最小限のExcelファイル（実際にはバリデーションでエラーになる可能性あり）
        file_content = b"PK"  # ZIPマジックナンバー（.xlsxはZIP形式）
        files = {"file": ("test.xlsx", io.BytesIO(file_content), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}

        response = client.post("/excel/schedule_input/upload-async", files=files)
        # 202 Accepted または エラー
        if response.status_code == 202:
            data = response.json()
            assert "job_id" in data
            assert data["status"] == "pending"


class TestJobsEndpoint:
    """ジョブエンドポイントのテスト"""

    def test_get_nonexistent_job(self, client):
        """存在しないジョブの取得"""
        response = client.get("/jobs/nonexistent-job-id")
        assert response.status_code == 404
        data = response.json()
        assert "code" in data["detail"]
        assert data["detail"]["code"] == "E401"  # JOB_NOT_FOUND

    def test_list_jobs(self, client):
        """ジョブ一覧取得"""
        response = client.get("/jobs/")
        assert response.status_code == 200
        data = response.json()
        assert "jobs" in data
        assert "total" in data
        assert isinstance(data["jobs"], list)

    def test_list_jobs_with_invalid_status(self, client):
        """無効なステータスでのフィルタリング"""
        response = client.get("/jobs/?status=invalid_status")
        assert response.status_code == 422  # バリデーションエラー


class TestExportCacheEndpoint:
    """エクスポートキャッシュエンドポイントのテスト"""

    def test_get_export_cache_empty(self, client, test_db):
        """空のキャッシュ取得"""
        response = client.get("/excel/export-cache")
        assert response.status_code == 200
        data = response.json()
        assert "payload" in data

    def test_set_export_cache_invalid(self, client, test_db):
        """無効なキャッシュ設定"""
        response = client.post(
            "/excel/export-cache",
            json={"invalid": "data"}  # rowsがない
        )
        assert response.status_code == 422  # バリデーションエラー

    def test_set_export_cache_valid(self, client, test_db):
        """有効なキャッシュ設定"""
        response = client.post(
            "/excel/export-cache",
            json={"rows": [{"id": 1, "name": "test"}]}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestRateLimiting:
    """レート制限のテスト"""

    def test_rate_limit_not_triggered_on_health(self, client):
        """ヘルスチェックはレート制限対象外"""
        # 複数回リクエストしてもレート制限に引っかからない
        for _ in range(20):
            response = client.get("/health")
            assert response.status_code == 200


class TestOpenAPIEndpoint:
    """OpenAPIエンドポイントのテスト"""

    def test_openapi_json(self, client):
        """OpenAPIスキーマ取得"""
        response = client.get("/api/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data
        assert "info" in data
        assert "paths" in data

    def test_docs_page(self, client):
        """Swagger UIページ"""
        response = client.get("/api/docs")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    def test_redoc_page(self, client):
        """ReDocページ"""
        response = client.get("/api/redoc")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
