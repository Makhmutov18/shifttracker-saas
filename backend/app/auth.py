import hmac
import hashlib
import json
import base64
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, unquote

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import User, WebSession

WEB_SESSION_COOKIE = "shifttracker_web_session"
WEB_CSRF_COOKIE = "shifttracker_web_csrf"
WEB_SESSION_MAX_AGE = max(1, settings.WEB_SESSION_DAYS) * 24 * 60 * 60


def _web_session_secret() -> str:
    return settings.WEB_SESSION_SECRET or settings.SECRET_KEY


def web_auth_is_configured() -> bool:
    return all(
        (
            settings.TELEGRAM_OIDC_CLIENT_ID,
            settings.TELEGRAM_OIDC_CLIENT_SECRET,
            settings.TELEGRAM_OIDC_REDIRECT_URI,
            settings.WEB_ADMIN_PUBLIC_URL,
            settings.WEB_SESSION_SECRET,
        )
    )


def web_cookie_secure() -> bool:
    return not settings.DEBUG


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_signed_state(payload: dict) -> str:
    raw_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw_payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(_web_session_secret().encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def read_signed_state(value: str) -> dict | None:
    try:
        encoded, signature = value.split(".", 1)
        expected = hmac.new(_web_session_secret().encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        if not isinstance(payload, dict) or int(payload.get("expires_at", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError, base64.binascii.Error):
        return None


def safe_return_to(value: str | None) -> str:
    if not value or not value.startswith("/admin") or value.startswith("//"):
        return "/admin/"
    return value


def new_web_session_tokens() -> tuple[str, str]:
    return secrets.token_urlsafe(48), secrets.token_urlsafe(32)


async def get_web_session_user(
    request: Request,
    session: AsyncSession,
) -> tuple[WebSession, User] | None:
    raw_token = request.cookies.get(WEB_SESSION_COOKIE)
    if not raw_token:
        return None
    result = await session.execute(
        select(WebSession)
        .options(selectinload(WebSession.user).selectinload(User.venue))
        .where(WebSession.token_hash == hash_secret(raw_token))
    )
    web_session = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not web_session or web_session.revoked_at is not None or web_session.expires_at <= now:
        return None
    ensure_user_is_active(web_session.user)
    web_session.last_used_at = now
    return web_session, web_session.user


def ensure_web_csrf(request: Request, web_session: WebSession) -> None:
    if request.method.upper() in {"GET", "HEAD", "OPTIONS"}:
        return
    token = request.headers.get("X-CSRF-Token") or request.cookies.get(WEB_CSRF_COOKIE)
    if not token or not hmac.compare_digest(hash_secret(token), web_session.csrf_token_hash):
        raise HTTPException(status_code=403, detail="Проверка безопасности не пройдена. Обновите страницу.")


async def authenticate_request(
    request: Request,
    init_data: str | None,
    session: AsyncSession,
) -> User:
    """Authenticate either the existing Telegram Mini App request or web-session cookie."""
    if init_data is not None:
        if not init_data or not validate_init_data(init_data):
            raise HTTPException(status_code=401, detail="Invalid init data")
        user_data = extract_user_from_init_data(init_data)
        if not user_data:
            raise HTTPException(status_code=401, detail="User not found in init data")
        telegram_id = user_data.get("id")
        if not telegram_id:
            raise HTTPException(status_code=401, detail="Telegram ID not found")
        result = await session.execute(
            select(User)
            .options(selectinload(User.venue))
            .where(User.telegram_id == int(telegram_id))
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found. Please start the bot first.")
        ensure_user_is_active(user)
        return user

    web_session_result = await get_web_session_user(request, session)
    if not web_session_result:
        raise HTTPException(status_code=401, detail="Веб-сессия не найдена или истекла. Войдите через Telegram.")
    web_session, user = web_session_result
    ensure_web_csrf(request, web_session)
    return user


def validate_init_data(init_data: str) -> bool:
    """
    Validates Telegram WebApp initData using the bot token as secret key.
    Returns True if valid, False otherwise.
    """
    try:
        parsed = dict(parse_qsl(init_data))
        received_hash = parsed.pop("hash", None)
        if not received_hash:
            return False

        # Sort keys alphabetically and build data_check_string
        items = sorted(parsed.items())
        data_check_string = "\n".join(f"{k}={v}" for k, v in items)

        # Create secret key from bot token
        secret_key = hmac.new(
            b"WebAppData",
            settings.BOT_TOKEN.encode(),
            hashlib.sha256,
        ).digest()

        # Compute expected hash
        computed_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(computed_hash, received_hash)
    except Exception:
        return False


def extract_user_from_init_data(init_data: str) -> dict | None:
    """
    Extracts and validates user JSON from initData.
    Returns user dict or None.
    """
    try:
        parsed = dict(parse_qsl(init_data))
        user_str = parsed.get("user")
        if user_str:
            return json.loads(unquote(user_str))
    except Exception:
        return None
    return None


def ensure_user_is_active(user: object) -> None:
    """Reject archived users from every authenticated API flow."""
    if not getattr(user, "is_active", False):
        raise HTTPException(
            status_code=403,
            detail="Пользователь деактивирован. Обратитесь к администратору.",
        )
