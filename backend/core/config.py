from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    openai_api_key: str = ""
    database_url: str = "sqlite:///./data/app.db"
    # OAuth (Microsoft Entra ID)
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_redirect_uri: str = ""
    entra_scope: str = "openid profile email offline_access User.Read Mail.Send"
    # Session
    session_secret_key: str = "dev-session-secret-change"
    session_cookie_name: str = "session"
    session_max_age: int = 86400
    encryption_key: str = ""  # base64-encoded 32-byte key
    # Built-in admin (for local/dev use)
    admin_email: str = "admin"
    admin_password: str = "admin123!"
    admin_name: str = "Admin"
    admin_bootstrap_enabled: bool = True
    # Mail settings
    mail_use_graph: bool = True  # True: Microsoft Graph API, False: SMTP
    mail_from: str = ""
    mail_from_name: str = ""
    mail_company: str = ""
    mail_department: str = ""
    mail_sender_name: str = ""
    # SMTP (fallback if mail_use_graph is False)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 100  # per minute
    rate_limit_upload: int = 10  # uploads per minute
    # Redis
    redis_url: str = ""  # e.g., "redis://localhost:6379/0"
    redis_job_ttl: int = 604800  # 7 days in seconds
    # Company domains for external mail warning
    company_domains: str = ""  # カンマ区切り例: "example.co.jp,example.com"

    @property
    def company_domains_list(self) -> list[str]:
        """会社ドメインのリスト（外部送信警告用）"""
        return [d.strip().lower() for d in self.company_domains.split(",") if d.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINSをリストに変換"""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=[BASE_DIR / ".env", BASE_DIR.parent / ".env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Settings の依存性注入用キャッシュ付きヘルパー"""
    s = Settings()
    # Debug: Print if OpenAI key is loaded
    if s.openai_api_key:
        print(f"[Config] OpenAI API key loaded (length: {len(s.openai_api_key)})")
    else:
        print(f"[Config] WARNING: OpenAI API key is NOT loaded!")
        print(f"[Config] Checked env files: {BASE_DIR / '.env'}, {BASE_DIR.parent / '.env'}")
    return s


DATA_DIR = (BASE_DIR.parent / "data").resolve()
DB_PATH = DATA_DIR / "app.db"
