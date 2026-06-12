import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from decimal import Decimal

from app.database import get_session
from app.models import User, UserRole, AuditLog, PayModel
from app.schemas import AdminCreateUser, AdminCreateUserResponse, UserOut
from app.auth import validate_init_data, extract_user_from_init_data
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def get_admin_user(
    init_data: str = Header(..., alias="X-Init-Data"),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Dependency: validates initData and returns the admin user."""
    if not validate_init_data(init_data):
        raise HTTPException(status_code=401, detail="Invalid init data")

    user_data = extract_user_from_init_data(init_data)
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found in init data")

    telegram_id = user_data.get("id")
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Telegram ID not found")

    result = await session.execute(
        select(User).where(User.telegram_id == int(telegram_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role not in (UserRole.owner, UserRole.admin):
        raise HTTPException(status_code=403, detail="Admin access required")

    return user


@router.post("/users", response_model=AdminCreateUserResponse)
async def create_user(
    body: AdminCreateUser,
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new user (barista or admin) and return an invite link."""
    # Generate invite token
    invite_token = secrets.token_urlsafe(6)

    # Determine role
    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    new_user = User(
        name=body.first_name,
        role=role,
        venue_id=admin.venue_id,
        hourly_rate=body.hourly_rate,
        revenue_percentage=body.revenue_percentage,
        pay_model=PayModel(body.pay_model),
        invite_token=invite_token,
        is_active=False,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    invite_link = f"https://t.me/{settings.BOT_USERNAME}?start={invite_token}"

    # Audit log
    log = AuditLog(
        user_id=admin.id,
        target_user_id=new_user.id,
        venue_id=admin.venue_id,
        action="user_created",
        entity_type="user",
        entity_id=new_user.id,
        new_value={"name": new_user.name, "role": role.value, "hourly_rate": str(body.hourly_rate), "pay_model": body.pay_model},
    )
    session.add(log)
    await session.commit()

    logger.info(
        f"Admin {admin.name} created user {new_user.name} "
        f"(role={role.value}, invite_token={invite_token})"
    )

    return AdminCreateUserResponse(
        token=invite_token,
        invite_link=invite_link,
        user_id=new_user.id,
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """List all active users for the admin's venue."""
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(User)
        .options(selectinload(User.venue))
        .where(User.venue_id == admin.venue_id, User.is_active == True)
        .order_by(User.name)
    )
    users = result.scalars().all()
    return users