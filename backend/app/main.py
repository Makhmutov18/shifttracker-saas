import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.database import init_db
from app.routers.api import router as api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Globals for bot webhook
_bot = None
_dispatcher = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: init DB and setup bot webhook on startup."""
    global _bot, _dispatcher

    logger.info("Starting up...")
    await init_db()
    logger.info("Database initialized")

    # Setup bot webhook in production
    if settings.BOT_TOKEN:
        from aiogram import Bot, Dispatcher
        from app.bot import router as bot_router

        _bot = Bot(token=settings.BOT_TOKEN)
        _dispatcher = Dispatcher()
        _dispatcher.include_router(bot_router)

        # Set webhook
        webhook_url = f"{settings.WEBAPP_URL}/webhook"
        await _bot.set_webhook(url=webhook_url)
        logger.info(f"Bot webhook set to {webhook_url}")

    yield

    # Shutdown
    if _bot:
        await _bot.delete_webhook()
        logger.info("Bot webhook deleted")


app = FastAPI(
    title="ShiftTracker WebApp",
    description="Telegram WebApp for tracking work shifts and salary",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API routes — registered FIRST, highest priority ────────────────────────
app.include_router(api_router)


# ─── Telegram webhook endpoint ──────────────────────────────────────────────
@app.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram updates via webhook."""
    global _bot, _dispatcher

    if not _bot or not _dispatcher:
        logger.warning("Bot not initialized, skipping webhook update")
        return {"ok": False}

    try:
        update_data = await request.json()
        from aiogram.types import Update
        update = Update.model_validate(update_data)
        await _dispatcher.feed_update(_bot, update)
        return {"ok": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"ok": False}


# ─── Frontend static files ──────────────────────────────────────────────────
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(frontend_dist):
    # Mount static assets (JS, CSS, images) at /assets
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

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