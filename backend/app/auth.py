import hmac
import hashlib
import json
from urllib.parse import parse_qsl, unquote

from fastapi import HTTPException

from app.config import settings


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
