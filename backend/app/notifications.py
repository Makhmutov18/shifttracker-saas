import logging
from aiogram import Bot
from app.config import settings

logger = logging.getLogger(__name__)


async def _send_message(telegram_id: int, text: str):
    """Send a text message to a Telegram user."""
    if not settings.BOT_TOKEN:
        return
    try:
        bot = Bot(token=settings.BOT_TOKEN)
        await bot.send_message(chat_id=telegram_id, text=text)
    except Exception as e:
        logger.warning(f"Failed to send Telegram message to {telegram_id}: {e}")


async def notify_shift_approved(telegram_id: int, date: str, salary: str):
    await _send_message(
        telegram_id,
        f"✅ Твоя смена за {date} одобрена.\n"
        f"💰 Начислено: {salary} ₽"
    )


async def notify_shift_rejected(telegram_id: int, date: str, reason: str = ""):
    text = f"❌ Твоя смена за {date} отклонена."
    if reason:
        text += f"\nПричина: {reason}"
    await _send_message(telegram_id, text)


async def notify_bonus_added(telegram_id: int, amount: str, reason: str):
    await _send_message(
        telegram_id,
        f"🎁 Тебе начислен бонус: {amount} ₽\n"
        f"Причина: {reason}"
    )


async def notify_penalty_added(telegram_id: int, amount: str, reason: str):
    await _send_message(
        telegram_id,
        f"⚠️ Тебе начислен штраф: {amount} ₽\n"
        f"Причина: {reason}"
    )


async def notify_user_activated(telegram_id: int, name: str):
    """Notify admin that a user activated their invite."""
    await _send_message(
        telegram_id,
        f"👤 Сотрудник {name} активировал приглашение и привязал аккаунт."
    )


async def send_shift_reminder(telegram_id: int):
    await _send_message(
        telegram_id,
        "⏰ Напоминание: ты не записал смену за сегодня.\n"
        "Не забудь внести часы в приложении!"
    )
