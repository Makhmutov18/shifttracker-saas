import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import User, UserRole
from app.routers.api import get_current_user
from app.schemas import AiWeeklySummaryRequest, AiWeeklySummaryResponse
from app.services.ai_summary import (
    AiSummaryProviderError,
    collect_weekly_summary_context,
    generate_weekly_summary,
)


router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)


def ensure_ai_summary_access(user: User) -> None:
    if user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Умная сводка доступна только владельцу и администратору")


def ensure_ai_summary_available() -> None:
    reason = None
    if not settings.AI_FEATURE_ENABLED:
        reason = "feature_disabled"
    elif settings.AI_PROVIDER != "deepseek":
        reason = "unsupported_provider"
    elif not settings.DEEPSEEK_API_KEY:
        reason = "missing_api_key"
    elif not settings.AI_MODEL:
        reason = "missing_model"
    if reason:
        logger.warning("AI weekly summary unavailable reason=%s", reason)
        raise HTTPException(status_code=503, detail="Умная сводка сейчас недоступна")


@router.post("/weekly-summary", response_model=AiWeeklySummaryResponse)
async def create_weekly_summary(
    request_data: AiWeeklySummaryRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    ensure_ai_summary_access(user)
    ensure_ai_summary_available()
    context, metrics = await collect_weekly_summary_context(
        session,
        request_data.period_start,
        request_data.period_end,
    )
    try:
        content = await generate_weekly_summary(context)
    except AiSummaryProviderError as error:
        logger.warning("AI weekly summary failed status=%s", error.status_code)
        raise HTTPException(status_code=error.status_code, detail=error.public_message) from error

    logger.info("AI weekly summary generated model=%s", settings.AI_MODEL)
    return AiWeeklySummaryResponse(
        period_start=request_data.period_start,
        period_end=request_data.period_end,
        generated_at=datetime.now(timezone.utc),
        metrics=metrics,
        **content.model_dump(),
    )
