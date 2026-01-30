from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    openai_api_key: str = Field(..., env="OPENAI_API_KEY")
    database_url: str = Field("sqlite:///./data/app.db", env="DATABASE_URL")
    # OAuth (Microsoft Entra ID)
    entra_tenant_id: str = Field(default="", env="ENTRA_TENANT_ID")
    entra_client_id: str = Field(default="", env="ENTRA_CLIENT_ID")
    entra_client_secret: str = Field(default="", env="ENTRA_CLIENT_SECRET")
    entra_redirect_uri: str = Field(default="", env="ENTRA_REDIRECT_URI")
    entra_scope: str = Field(default="openid profile email offline_access User.Read", env="ENTRA_SCOPE")
    # Session
    session_secret_key: str = Field(default="dev-session-secret-change", env="SESSION_SECRET_KEY")
    session_cookie_name: str = Field(default="session", env="SESSION_COOKIE_NAME")
    session_max_age: int = Field(default=86400, env="SESSION_MAX_AGE")
    encryption_key: str = Field(default="", env="ENCRYPTION_KEY")  # base64-encoded 32-byte key
    # Built-in admin (for local/dev use)
    admin_email: str = Field(default="admin", env="ADMIN_EMAIL")
    admin_password: str = Field(default="admin123!", env="ADMIN_PASSWORD")
    admin_name: str = Field(default="Admin", env="ADMIN_NAME")
    admin_bootstrap_enabled: bool = Field(default=True, env="ADMIN_BOOTSTRAP_ENABLED")
    # Mail / SMTP
    smtp_host: str = Field(default="", env="SMTP_HOST")
    smtp_port: int = Field(default=587, env="SMTP_PORT")
    smtp_username: str = Field(default="", env="SMTP_USERNAME")
    smtp_password: str = Field(default="", env="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(default=True, env="SMTP_USE_TLS")
    mail_from: str = Field(default="hi3-ochi@aeondelight.jp", env="MAIL_FROM")
    mail_from_name: str = Field(default="", env="MAIL_FROM_NAME")
    mail_company: str = Field(default="", env="MAIL_COMPANY")
    mail_department: str = Field(default="", env="MAIL_DEPARTMENT")
    mail_sender_name: str = Field(default="", env="MAIL_SENDER_NAME")

    class Config:
        # Look for .env inside backend/ first, then repo root.
        env_file = [BASE_DIR / ".env", BASE_DIR.parent / ".env"]


DATA_DIR = (BASE_DIR.parent / "data").resolve()
DB_PATH = DATA_DIR / "app.db"
