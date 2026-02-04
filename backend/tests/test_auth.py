"""
認証機能のテスト
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.app import app
from backend.core.database import Base, engine, SessionLocal
from backend.models.user import User
from backend.utils.security import hash_password


@pytest.fixture(scope="function")
def test_db():
    """テスト用データベースセットアップ"""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()
    # テスト後にテーブルをクリア
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture
def client():
    """テストクライアント"""
    return TestClient(app)


@pytest.fixture
def test_user(test_db):
    """テスト用ユーザー"""
    password_hash, password_salt = hash_password("testpassword123")
    user = User(
        email="test@example.com",
        name="Test User",
        password_hash=password_hash,
        password_salt=password_salt,
        is_admin=False,
        is_active=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


class TestBasicAuth:
    """基本認証のテスト"""

    def test_login_success(self, client, test_user):
        """正常ログイン"""
        response = client.post(
            "/auth/login/basic",
            json={"email": "test@example.com", "password": "testpassword123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"

    def test_login_invalid_email(self, client, test_user):
        """存在しないメールアドレス"""
        response = client.post(
            "/auth/login/basic",
            json={"email": "wrong@example.com", "password": "testpassword123"}
        )
        assert response.status_code == 401

    def test_login_invalid_password(self, client, test_user):
        """間違ったパスワード"""
        response = client.post(
            "/auth/login/basic",
            json={"email": "test@example.com", "password": "wrongpassword"}
        )
        assert response.status_code == 401

    def test_login_missing_fields(self, client):
        """必須フィールド不足"""
        response = client.post(
            "/auth/login/basic",
            json={"email": "test@example.com"}
        )
        assert response.status_code == 422  # Validation error


class TestSessionAuth:
    """セッション認証のテスト"""

    def test_me_without_session(self, client):
        """未認証でのユーザー情報取得"""
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_me_with_session(self, client, test_user):
        """認証済みでのユーザー情報取得"""
        # ログイン
        login_response = client.post(
            "/auth/login/basic",
            json={"email": "test@example.com", "password": "testpassword123"}
        )
        assert login_response.status_code == 200

        # ユーザー情報取得（Cookieが自動的に送信される）
        response = client.get("/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["user"]["email"] == "test@example.com"

    def test_logout(self, client, test_user):
        """ログアウト"""
        # ログイン
        client.post(
            "/auth/login/basic",
            json={"email": "test@example.com", "password": "testpassword123"}
        )

        # ログアウト
        response = client.post("/auth/logout")
        assert response.status_code == 200

        # セッションが無効になっていることを確認
        me_response = client.get("/auth/me")
        assert me_response.status_code == 401


class TestInactiveUser:
    """非アクティブユーザーのテスト"""

    def test_login_inactive_user(self, client, test_db):
        """非アクティブユーザーのログイン"""
        password_hash, password_salt = hash_password("testpassword123")
        user = User(
            email="inactive@example.com",
            name="Inactive User",
            password_hash=password_hash,
            password_salt=password_salt,
            is_admin=False,
            is_active=False,  # 非アクティブ
        )
        test_db.add(user)
        test_db.commit()

        response = client.post(
            "/auth/login/basic",
            json={"email": "inactive@example.com", "password": "testpassword123"}
        )
        # 非アクティブユーザーはログイン不可
        assert response.status_code == 401
