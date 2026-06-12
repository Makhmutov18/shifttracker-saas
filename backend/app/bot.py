from aiogram import Bot, Router, types
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session as SyncSession

from app.config import settings
from app.models import Base, User

router = Router()

# Sync engine for bot operations (avoids greenlet_spawn issues in webhook context)
_sync_engine = create_engine(
    settings.DATABASE_URL.replace("+asyncpg", "").replace("postgresql+asyncpg", "postgresql"),
    pool_pre_ping=True,
    pool_size=2,
)


def _get_sync_session() -> SyncSession:
    return SyncSession(bind=_sync_engine)


@router.message(Command("start"))
async def cmd_start(message: types.Message):
    telegram_id = message.from_user.id
    username = message.from_user.full_name or "User"

    with _get_sync_session() as session:
        user = session.execute(
            select(User).where(User.telegram_id == telegram_id)
        ).scalar_one_or_none()

        if user:
            webapp_url = f"{settings.WEBAPP_URL}?tg_id={telegram_id}"
            keyboard = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="🚀 Открыть приложение",
                            web_app=WebAppInfo(url=webapp_url),
                        )
                    ]
                ]
            )
            await message.answer(
                f"👋 С возвращением, {user.name}!\n"
                f"🏪 Заведение: {user.venue.name if user.venue else '—'}\n"
                f"💰 Ставка: {user.hourly_rate} ₽/час",
                reply_markup=keyboard,
            )
        else:
            await message.answer(
                f"👋 Привет, {username}!\n\n"
                "Ты ещё не привязан к системе. Пожалуйста, введи код авторизации, "
                "который выдал тебе администратор.\n\n"
                "Пример: `/auth ABC123`",
                parse_mode="Markdown",
            )


@router.message(Command("auth"))
async def cmd_auth(message: types.Message):
    telegram_id = message.from_user.id
    args = message.text.split(maxsplit=1)

    if len(args) < 2:
        await message.answer("❌ Пожалуйста, укажи код авторизации.\nПример: `/auth ABC123`")
        return

    auth_code = args[1].strip()

    with _get_sync_session() as session:
        user = session.execute(
            select(User).where(User.auth_code == auth_code)
        ).scalar_one_or_none()

        if not user:
            await message.answer("❌ Неверный код авторизации. Попробуй ещё раз.")
            return

        if user.telegram_id is not None:
            await message.answer("❌ Этот код уже использован.")
            return

        user.telegram_id = telegram_id
        session.commit()

        webapp_url = f"{settings.WEBAPP_URL}?tg_id={telegram_id}"
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🚀 Открыть приложение",
                        web_app=WebAppInfo(url=webapp_url),
                    )
                ]
            ]
        )

        await message.answer(
            f"✅ Успешно! Ты привязан как {user.name}.\n"
            f"🏪 Заведение: {user.venue.name if user.venue else '—'}\n"
            f"💰 Ставка: {user.hourly_rate} ₽/час",
            reply_markup=keyboard,
        )


async def setup_bot() -> Bot:
    """Initialize and return the bot instance."""
    bot = Bot(token=settings.BOT_TOKEN)
    return bot