import os
import logging
import hmac
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.database import init_db
from app.routers.api import install_report_download_access_log_filter, router as api_router
from app.routers.admin import router as admin_router
from app.routers.web_auth import install_oidc_access_log_filter, router as web_auth_router
from app.routers.ai import router as ai_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Globals for bot webhook
_bot = None
_dispatcher = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the schema and bot without modifying existing user access."""
    global _bot, _dispatcher

    install_oidc_access_log_filter()
    install_report_download_access_log_filter()
    logger.info("Starting up...")
    await init_db()
    logger.info("Database initialized")

    # Setup bot webhook in production
    if settings.BOT_TOKEN:
        from aiogram import Bot, Dispatcher
        from aiogram.fsm.storage.memory import MemoryStorage
        from app.bot import router as bot_router

        _bot = Bot(token=settings.BOT_TOKEN)
        _dispatcher = Dispatcher(storage=MemoryStorage())
        _dispatcher.include_router(bot_router)

        # Set webhook — use public domain, skip for localhost
        webhook_url = f"{settings.webhook_base_url}/webhook"
        if "localhost" in webhook_url or "127.0.0.1" in webhook_url:
            logger.warning(f"Skipping webhook setup for local URL: {webhook_url}")
        else:
            await _bot.set_webhook(
                url=webhook_url, secret_token=settings.telegram_webhook_secret
            )
            logger.info(f"Bot webhook set to {webhook_url}")

    yield

    # Shutdown — intentionally NOT deleting webhook here.
    # Railway terminates the old container after the new one is healthy.
    # If we delete the webhook on shutdown, the new container's webhook
    # gets wiped out by the old container's shutdown sequence.
    if _bot:
        logger.info("Shutting down (webhook preserved for new container)")


app = FastAPI(
    title="ShiftTracker WebApp",
    description="Telegram WebApp for tracking work shifts and salary",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.effective_webapp_url,
        "https://localhost:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API routes — registered FIRST, highest priority ────────────────────────
app.include_router(api_router)
app.include_router(admin_router)
app.include_router(web_auth_router)
app.include_router(ai_router)


# ─── Telegram webhook endpoint ──────────────────────────────────────────────
@app.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram updates via webhook."""
    global _bot, _dispatcher

    expected_secret = settings.telegram_webhook_secret
    received_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not expected_secret or not hmac.compare_digest(
        received_secret.encode("utf-8"), expected_secret.encode("utf-8")
    ):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not _bot or not _dispatcher:
        logger.warning("Bot not initialized, skipping webhook update")
        raise HTTPException(status_code=503, detail="Bot unavailable")

    try:
        update_data = await request.json()
        from aiogram.types import Update
        update = Update.model_validate(update_data)
        await _dispatcher.feed_update(_bot, update)
        return {"ok": True}
    except Exception:
        # Exceptions may contain update contents or bot credentials; never log them.
        logger.error("Telegram webhook update failed")
        raise HTTPException(status_code=500, detail="Webhook processing failed") from None


# ─── Frontend static files ──────────────────────────────────────────────────
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
web_admin_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web-admin", "dist")
if os.path.isdir(frontend_dist):
    # Mount static assets (JS, CSS, images) at /assets
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    if os.path.isdir(web_admin_dist):
        app.mount("/admin/assets", StaticFiles(directory=os.path.join(web_admin_dist, "assets")), name="web_admin_assets")

        @app.get("/admin")
        @app.get("/admin/{full_path:path}")
        async def serve_web_admin(full_path: str = ""):
            return FileResponse(os.path.join(web_admin_dist, "index.html"))

    # SPA fallback: serve index.html for all non-API, non-webhook routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Never catch API or webhook routes
        if full_path.startswith("api/") or full_path == "webhook":
            raise HTTPException(status_code=404, detail="API endpoint not found")

        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Not found")

    logger.info(f"Serving frontend SPA from {frontend_dist}")
else:
    logger.warning(f"Frontend dist not found at {frontend_dist}. API only mode.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
