from urllib.parse import urlparse
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/shiftapp"

    # Telegram
    BOT_TOKEN: str = ""
    BOT_USERNAME: str = ""
    WEBAPP_URL: str = "https://localhost:8000"
    TELEGRAM_OIDC_CLIENT_ID: str = ""
    TELEGRAM_OIDC_CLIENT_SECRET: str = ""
    TELEGRAM_OIDC_REDIRECT_URI: str = ""
    WEB_ADMIN_PUBLIC_URL: str = ""
    WEB_SESSION_SECRET: str = ""
    WEB_SESSION_DAYS: int = 14

    # Railway auto-provided public domain (e.g. shifttracker-saas-production.up.railway.app)
    RAILWAY_PUBLIC_DOMAIN: Optional[str] = None

    # Security
    SECRET_KEY: str = "change-me-in-production"
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def webhook_base_url(self) -> str:
        """Return the public HTTPS base URL for Telegram webhook.
        Prefers RAILWAY_PUBLIC_DOMAIN, falls back to WEBAPP_URL hostname.
        """
        if self.RAILWAY_PUBLIC_DOMAIN:
            return f"https://{self.RAILWAY_PUBLIC_DOMAIN}"
        parsed = urlparse(self.WEBAPP_URL)
        return f"https://{parsed.hostname}"

    @property
    def effective_webapp_url(self) -> str:
        """Return the public WebApp URL for Telegram inline keyboard buttons.
        Prefers RAILWAY_PUBLIC_DOMAIN, falls back to WEBAPP_URL as-is.
        """
        if self.RAILWAY_PUBLIC_DOMAIN:
            return f"https://{self.RAILWAY_PUBLIC_DOMAIN}"
        return self.WEBAPP_URL

    @classmethod
    def _validate_database_url(cls, v: str) -> str:
        """Force asyncpg driver for SQLAlchemy async engine.
        Railway provides DATABASE_URL as postgresql://... which defaults to sync psycopg2.
        """
        if v.startswith("postgresql+asyncpg://"):
            return v
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.DATABASE_URL = self._validate_database_url(self.DATABASE_URL)


settings = Settings()
