from aiogram import Bot, Router, types
from aiogram.filters import Command, CommandObject
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


def _webapp_keyboard(telegram_id: int) -> InlineKeyboardMarkup:
    """Build inline keyboard with WebApp button."""
    webapp_url = f"{settings.effective_webapp_url}?tg_id={telegram_id}"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Открыть приложение",
                    web_app=WebAppInfo(url=webapp_url),
                )
            ]
        ]
    )


@router.message(Command("start"))
async def cmd_start(message: types.Message, command: CommandObject):
    telegram_id = message.from_user.id
    username = message.from_user.full_name or "User"
    args = command.args

    with _get_sync_session() as session:
        # ─── If invite token provided → activate user ────────────────────────
        if args:
            user = session.execute(
                select(User).where(User.invite_token == args)
            ).scalar_one_or_none()

            if not user:
                await message.answer(
                    "❌ Неверная или устаревшая ссылка приглашения.\n"
                    "Пожалуйста, попроси администратора создать новую."
                )
                return

            if user.telegram_id is not None:
                await message.answer(
                    "❌ Эта ссылка уже была использована другим пользователем."
                )
                return

            # Activate user
            user.telegram_id = telegram_id
            user.is_active = True
            user.invite_token = None
            session.commit()

            await message.answer(
                f"✅ Привет, {user.name}!\n"
                f"Ты успешно привязан к системе.\n"
                f"🏪 Заведение: {user.venue.name if user.venue else '—'}\n"
                f"💰 Ставка: {user.hourly_rate} ₽/час",
                reply_markup=_webapp_keyboard(telegram_id),
            )
            return

        # ─── No token → check if user exists ─────────────────────────────────
        user = session.execute(
            select(User).where(User.telegram_id == telegram_id)
        ).scalar_one_or_none()

        if user:
            await message.answer(
                f"👋 С возвращением, {user.name}!\n"
                f"🏪 Заведение: {user.venue.name if user.venue else '—'}\n"
                f"💰 Ставка: {user.hourly_rate} ₽/час",
                reply_markup=_webapp_keyboard(telegram_id),
            )
        else:
            await message.answer(
                f"👋 Привет, {username}!\n\n"
                "Ты ещё не привязан к системе. Попроси администратора "
                "создать приглашение, и перейди по ссылке.",
            )


async def setup_bot() -> Bot:
    """Initialize and return the bot instance."""
    bot = Bot(token=settings.BOT_TOKEN)
    return bot