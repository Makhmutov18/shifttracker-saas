import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import (
    WEB_CSRF_COOKIE,
    WEB_SESSION_COOKIE,
    WEB_SESSION_MAX_AGE,
    create_signed_state,
    ensure_user_is_active,
    ensure_web_csrf,
    get_web_session_user,
    hash_secret,
    new_web_session_tokens,
    read_signed_state,
    safe_return_to,
    web_auth_is_configured,
    web_cookie_secure,
)
from app.config import settings
from app.database import get_session
from app.models import User, UserRole, WebSession
from app.permissions import has_permission
from app.schemas import UserOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/web-auth", tags=["web-auth"])

OIDC_AUTH_URL = "https://oauth.telegram.org/auth"
OIDC_TOKEN_URL = "https://oauth.telegram.org/token"
OIDC_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json"
STATE_COOKIE = "shifttracker_web_auth_state"


def _admin_public_url(path: str = "/admin/") -> str:
    base = settings.WEB_ADMIN_PUBLIC_URL.rstrip("/")
    if base.endswith("/admin"):
        return f"{base}{path.removeprefix('/admin')}"
    return f"{base}{path}"


def _auth_error_redirect(code: str) -> RedirectResponse:
    return RedirectResponse(url=f"{_admin_public_url('/admin/')}?auth_error={code}", status_code=303)


def _has_web_admin_access(user: User) -> bool:
    return user.role in (UserRole.owner, UserRole.admin) or any(
        has_permission(user, permission)
        for permission in (
            "can_manage_team",
            "can_view_team_payroll",
            "can_approve_shifts",
            "can_view_team_shifts",
            "can_edit_team_shifts",
        )
    )


def _set_session_cookies(response: Response, raw_token: str, csrf_token: str) -> None:
    secure = web_cookie_secure()
    response.set_cookie(
        WEB_SESSION_COOKIE,
        raw_token,
        max_age=WEB_SESSION_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        WEB_CSRF_COOKIE,
        csrf_token,
        max_age=WEB_SESSION_MAX_AGE,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(WEB_SESSION_COOKIE, path="/")
    response.delete_cookie(WEB_CSRF_COOKIE, path="/")
    response.delete_cookie(STATE_COOKIE, path="/")


async def _exchange_code(code: str, code_verifier: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            OIDC_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "client_id": settings.TELEGRAM_OIDC_CLIENT_ID,
                "client_secret": settings.TELEGRAM_OIDC_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.TELEGRAM_OIDC_REDIRECT_URI,
                "code_verifier": code_verifier,
            },
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Telegram временно недоступен.")
    payload = response.json()
    if not isinstance(payload, dict) or not payload.get("id_token"):
        raise HTTPException(status_code=401, detail="Telegram не подтвердил вход.")
    return payload


async def _validate_id_token(id_token: str, expected_nonce: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(OIDC_JWKS_URL)
        response.raise_for_status()
        jwks = response.json().get("keys", [])
        header = jwt.get_unverified_header(id_token)
        jwk = next((key for key in jwks if key.get("kid") == header.get("kid")), None)
        if not jwk:
            raise ValueError("unknown signing key")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.TELEGRAM_OIDC_CLIENT_ID,
            issuer="https://oauth.telegram.org",
            options={"require": ["iss", "aud", "exp"]},
        )
        if claims.get("nonce") and not hmac.compare_digest(str(claims["nonce"]), expected_nonce):
            raise ValueError("invalid nonce")
        return claims
    except (httpx.HTTPError, jwt.PyJWTError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        logger.warning("Telegram web auth token validation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Telegram не подтвердил вход.") from exc


@router.get("/telegram/start")
async def telegram_login_start(return_to: str = Query("/admin/")):
    if not web_auth_is_configured():
        raise HTTPException(status_code=503, detail="Вход через Telegram ещё не настроен.")
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode("ascii")
    nonce = secrets.token_urlsafe(32)
    state = secrets.token_urlsafe(32)
    state_cookie = create_signed_state(
        {
            "state": state,
            "verifier": verifier,
            "nonce": nonce,
            "return_to": safe_return_to(return_to),
            "expires_at": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
        }
    )
    params = urlencode(
        {
            "client_id": settings.TELEGRAM_OIDC_CLIENT_ID,
            "redirect_uri": settings.TELEGRAM_OIDC_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    response = RedirectResponse(url=f"{OIDC_AUTH_URL}?{params}", status_code=303)
    response.set_cookie(
        STATE_COOKIE,
        state_cookie,
        max_age=300,
        httponly=True,
        secure=web_cookie_secure(),
        samesite="lax",
        path="/",
    )
    return response


@router.get("/telegram/callback")
async def telegram_login_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    if error:
        return _auth_error_redirect("cancelled")
    state_payload = read_signed_state(request.cookies.get(STATE_COOKIE, ""))
    if not code or not state or not state_payload or not hmac.compare_digest(state, str(state_payload.get("state", ""))):
        return _auth_error_redirect("invalid_state")
    try:
        token_payload = await _exchange_code(code, str(state_payload["verifier"]))
        claims = await _validate_id_token(str(token_payload["id_token"]), str(state_payload["nonce"]))
        telegram_id = claims.get("sub") or claims.get("id")
        if not telegram_id:
            return _auth_error_redirect("invalid_account")
        result = await session.execute(
            select(User).options(selectinload(User.venue)).where(User.telegram_id == int(telegram_id))
        )
        user = result.scalar_one_or_none()
        if not user:
            return _auth_error_redirect("not_registered")
        ensure_user_is_active(user)
        if not _has_web_admin_access(user):
            return _auth_error_redirect("no_access")
        raw_token, csrf_token = new_web_session_tokens()
        session.add(
            WebSession(
                user_id=user.id,
                token_hash=hash_secret(raw_token),
                csrf_token_hash=hash_secret(csrf_token),
                expires_at=datetime.now(timezone.utc) + timedelta(days=settings.WEB_SESSION_DAYS),
            )
        )
        await session.commit()
        response = RedirectResponse(url=_admin_public_url(safe_return_to(state_payload.get("return_to"))), status_code=303)
        _set_session_cookies(response, raw_token, csrf_token)
        response.delete_cookie(STATE_COOKIE, path="/")
        return response
    except HTTPException as exc:
        if exc.status_code == 403:
            return _auth_error_redirect("inactive")
        return _auth_error_redirect("telegram_error")
    except (ValueError, TypeError):
        return _auth_error_redirect("invalid_account")
    except Exception:
        await session.rollback()
        logger.exception("Telegram web auth callback failed")
        return _auth_error_redirect("telegram_error")


@router.get("/session")
async def web_session_info(request: Request, session: AsyncSession = Depends(get_session)):
    session_result = await get_web_session_user(request, session)
    if not session_result:
        response = Response(content=json.dumps({"authenticated": False}), media_type="application/json")
        _clear_session_cookies(response)
        return response
    web_session, user = session_result
    csrf_token = request.cookies.get(WEB_CSRF_COOKIE, "")
    if not csrf_token or not hmac.compare_digest(hash_secret(csrf_token), web_session.csrf_token_hash):
        csrf_token = ""
    return {"authenticated": True, "user": UserOut.model_validate(user).model_dump(mode="json"), "csrf_token": csrf_token}


@router.post("/logout")
async def web_logout(request: Request, session: AsyncSession = Depends(get_session)):
    session_result = await get_web_session_user(request, session)
    response = Response(content=json.dumps({"ok": True}), media_type="application/json")
    if session_result:
        web_session, _ = session_result
        ensure_web_csrf(request, web_session)
        web_session.revoked_at = datetime.now(timezone.utc)
        await session.commit()
    _clear_session_cookies(response)
    return response
