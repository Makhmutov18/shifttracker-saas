from aiogram import Bot, Dispatcher, Router, types
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models import User

router = Router()


@router.message(Command("start"))
async def cmd_start(message: types.Message):
    telegram_id = message.from_user.id
    username = message.from_user.full_name or "User"

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        user = result.scalar_one_or_none()

        if user:
            # User exists — show WebApp button
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
            # User not found — ask for auth code
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

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.auth_code == auth_code)
        )
        user = result.scalar_one_or_none()

        if not user:
            await message.answer("❌ Неверный код авторизации. Попробуй ещё раз.")
            return

        if user.telegram_id is not None:
            await message.answer("❌ Этот код уже использован.")
            return

        # Link telegram_id to user
        user.telegram_id = telegram_id
        await session.commit()

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