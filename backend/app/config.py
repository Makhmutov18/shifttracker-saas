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


settings = Settings()