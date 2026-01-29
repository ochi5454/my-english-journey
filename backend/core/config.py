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

    class Config:
        # Look for .env inside backend/ first, then repo root.
        env_file = [BASE_DIR / ".env", BASE_DIR.parent / ".env"]


DATA_DIR = (BASE_DIR.parent / "data").resolve()
DB_PATH = DATA_DIR / "app.db"
