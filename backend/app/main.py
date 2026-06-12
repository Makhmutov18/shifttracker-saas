import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers.api import router as api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: init DB and bot on startup."""
    logger.info("Starting up...")
    await init_db()
    logger.info("Database initialized")

    # Start bot polling in background if token is set
    bot_task = None
    if settings.BOT_TOKEN:
        from app.bot import setup_bot, router as bot_router
        from aiogram import Dispatcher

        bot = await setup_bot()
        dp = Dispatcher()
        dp.include_router(bot_router)

        async def start_bot():
            try:
                await dp.start_polling(bot)
            except Exception as e:
                logger.error(f"Bot polling error: {e}")

        bot_task = asyncio.create_task(start_bot())
        logger.info("Bot polling started")

    yield

    # Shutdown
    if bot_task:
        bot_task.cancel()
        try:
            await bot_task
        except asyncio.CancelledError:
            pass
    logger.info("Shutdown complete")


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

# API routes
app.include_router(api_router)

# Serve frontend static files in production
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    logger.info(f"Serving frontend from {frontend_dist}")
else:
    logger.warning(f"Frontend dist not found at {frontend_dist}. API only mode.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)