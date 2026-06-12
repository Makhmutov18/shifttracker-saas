from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/shiftapp"

    # Telegram
    BOT_TOKEN: str = ""
    WEBAPP_URL: str = "https://localhost:8000"

    # Security
    SECRET_KEY: str = "change-me-in-production"
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @classmethod
    def _validate_database_url(cls, v: str) -> str:
        """Force asyncpg driver for SQLAlchemy async engine.
        Railway provides DATABASE_URL as postgresql://... which defaults to sync psycopg2.
        """
        if v and v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.DATABASE_URL = self._validate_database_url(self.DATABASE_URL)


settings = Settings()