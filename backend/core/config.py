from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    openai_api_key: str = Field(..., env="OPENAI_API_KEY")
    database_url: str = Field("sqlite:///./data/app.db", env="DATABASE_URL")

    class Config:
        # Look for .env inside backend/ first, then repo root.
        env_file = [BASE_DIR / ".env", BASE_DIR.parent / ".env"]


DATA_DIR = (BASE_DIR.parent / "data").resolve()
DB_PATH = DATA_DIR / "app.db"
