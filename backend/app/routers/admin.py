import secrets
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

from app.database import get_session
from app.models import User, UserRole, AuditLog, PayModel, Venue, Shift
from app.schemas import AdminCreateUser, AdminCreateUserResponse, UserOut, VenueOut, VenueCreate, VenueUpdate
from app.auth import validate_init_data, extract_user_from_init_data
from app.config import settings
from app.permissions import has_permission, validate_permission_map

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _can_manage_team_access(user: User) -> bool:
    return user.role in (UserRole.owner, UserRole.admin) or has_permission(user, "can_manage_team")


async def _ensure_user_can_be_deactivated(
    session: AsyncSession,
    venue_id,
    target_user: User,
    admin_user: User,
) -> None:
    if target_user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    active_users_result = await session.execute(
        select(User).where(User.venue_id == venue_id, User.is_active == True)
    )
    active_users = active_users_result.scalars().all()

    if target_user.role in (UserRole.owner, UserRole.admin):
        remaining_owner_admins = [
            user for user in active_users
            if user.id != target_user.id and user.role in (UserRole.owner, UserRole.admin)
        ]
        if not remaining_owner_admins:
            raise HTTPException(
                status_code=400,
                detail="Cannot deactivate the last owner/admin",
            )

    if _can_manage_team_access(target_user):
        remaining_team_managers = [
            user for user in active_users
            if user.id != target_user.id and _can_manage_team_access(user)
        ]
        if not remaining_team_managers:
            raise HTTPException(
                status_code=400,
                detail="Cannot deactivate the last user who can manage the team",
            )


async def _get_venue_or_404(
    session: AsyncSession,
    venue_id: uuid.UUID,
    *,
    allow_inactive: bool = False,
) -> Venue:
    result = await session.execute(select(Venue).where(Venue.id == venue_id))
    venue = result.scalar_one_or_none()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    if not allow_inactive and not venue.is_active:
        raise HTTPException(status_code=400, detail="Venue is inactive")
    return venue


async def _ensure_venue_can_be_deactivated(
    session: AsyncSession,
    venue: Venue,
) -> None:
    active_users_result = await session.execute(
        select(func.count())
        .select_from(User)
        .where(User.venue_id == venue.id, User.is_active == True)
    )
    active_users_count = active_users_result.scalar_one() or 0
    if active_users_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot deactivate a venue with active employees",
        )

    active_venues_result = await session.execute(
        select(func.count())
        .select_from(Venue)
        .where(Venue.is_active == True)
    )
    active_venues_count = active_venues_result.scalar_one() or 0
    if active_venues_count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot deactivate the last active venue",
        )


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

    if not has_permission(user, "can_manage_team"):
        raise HTTPException(status_code=403, detail="Team management access required")

    return user


@router.get("/venues", response_model=list[VenueOut])
async def list_venues(
    admin: User = Depends(get_admin_user),
    include_inactive: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    filters = []
    if not include_inactive:
        filters.append(Venue.is_active == True)

    result = await session.execute(
        select(Venue)
        .where(*filters)
        .order_by(Venue.is_active.desc(), Venue.name)
    )
    return result.scalars().all()


@router.post("/venues", response_model=VenueOut)
async def create_venue(
    body: VenueCreate,
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    name = body.name.strip()
    existing_result = await session.execute(
        select(Venue).where(func.lower(Venue.name) == name.lower())
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Venue with this name already exists")

    venue = Venue(name=name, is_active=True)
    session.add(venue)
    await session.commit()
    await session.refresh(venue)

    log = AuditLog(
        user_id=admin.id,
        target_user_id=None,
        venue_id=admin.venue_id,
        action="venue_created",
        entity_type="venue",
        entity_id=venue.id,
        new_value={"name": venue.name, "is_active": venue.is_active},
    )
    session.add(log)
    await session.commit()

    return venue


@router.patch("/venues/{venue_id}", response_model=VenueOut)
async def update_venue(
    venue_id: str,
    body: VenueUpdate,
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    venue = await _get_venue_or_404(session, uuid.UUID(venue_id), allow_inactive=True)
    old_values = {}

    if body.name is not None:
        next_name = body.name.strip()
        existing_result = await session.execute(
            select(Venue).where(
                func.lower(Venue.name) == next_name.lower(),
                Venue.id != venue.id,
            )
        )
        if existing_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Venue with this name already exists")
        old_values["name"] = venue.name
        venue.name = next_name

    if body.is_active is not None and body.is_active != venue.is_active:
        old_values["is_active"] = venue.is_active
        if body.is_active is False:
            await _ensure_venue_can_be_deactivated(session, venue)
        venue.is_active = body.is_active

    await session.commit()
    await session.refresh(venue)

    log = AuditLog(
        user_id=admin.id,
        target_user_id=None,
        venue_id=admin.venue_id,
        action="venue_updated",
        entity_type="venue",
        entity_id=venue.id,
        old_value=old_values if old_values else None,
        new_value={k: v for k, v in body.model_dump(exclude_none=True).items()},
    )
    session.add(log)
    await session.commit()

    return venue


@router.delete("/venues/{venue_id}")
async def deactivate_venue(
    venue_id: str,
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    venue = await _get_venue_or_404(session, uuid.UUID(venue_id), allow_inactive=True)
    if not venue.is_active:
        return {"ok": True}

    await _ensure_venue_can_be_deactivated(session, venue)
    venue.is_active = False
    await session.commit()

    log = AuditLog(
        user_id=admin.id,
        target_user_id=None,
        venue_id=admin.venue_id,
        action="venue_deactivated",
        entity_type="venue",
        entity_id=venue.id,
    )
    session.add(log)
    await session.commit()

    return {"ok": True}


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

    try:
        permissions = validate_permission_map(body.permissions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target_venue = await _get_venue_or_404(
        session,
        body.venue_id or admin.venue_id,
    )

    new_user = User(
        name=body.first_name,
        position=(body.position.strip() if body.position and body.position.strip() else None),
        role=role,
        venue_id=target_venue.id,
        hourly_rate=body.hourly_rate,
        revenue_percentage=body.revenue_percentage,
        permissions=permissions,
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
        venue_id=target_venue.id,
        action="user_created",
        entity_type="user",
        entity_id=new_user.id,
        new_value={
            "name": new_user.name,
            "position": new_user.position,
            "role": role.value,
            "venue_id": str(new_user.venue_id),
            "hourly_rate": str(body.hourly_rate),
            "pay_model": body.pay_model,
        },
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
    include_inactive: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """List users across all venues."""
    filters = []
    if not include_inactive:
        filters.append(User.is_active == True)
    result = await session.execute(
        select(User)
        .options(selectinload(User.venue))
        .where(*filters)
        .order_by(User.venue_id, User.name)
    )
    users = result.scalars().all()
    return users


class AdminUpdateUser(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    position: Optional[str] = Field(None, max_length=255)
    role: Optional[str] = Field(None, pattern="^(owner|admin|senior|barista|cook|senior_cook)$")
    venue_id: Optional[uuid.UUID] = None
    hourly_rate: Optional[Decimal] = Field(None, ge=0)
    revenue_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    pay_model: Optional[str] = Field(None, pattern="^(hourly|fixed_shift|revenue|hybrid)$")
    is_active: Optional[bool] = None
    permissions: Optional[dict[str, bool]] = None


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: AdminUpdateUser,
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a user's information."""
    target = await session.execute(
        select(User)
        .options(selectinload(User.venue))
        .where(User.id == uuid.UUID(user_id))
    )
    user = target.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None and user.id == admin.id and body.role not in ("owner", "admin"):
        other_admins_result = await session.execute(
            select(func.count())
            .select_from(User)
            .where(
                User.venue_id == admin.venue_id,
                User.id != admin.id,
                User.role.in_((UserRole.owner, UserRole.admin)),
                User.is_active == True,
            )
        )
        other_admins_count = other_admins_result.scalar_one() or 0
        if other_admins_count == 0:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner/admin access from yourself")

    if body.permissions is not None and user.id == admin.id and admin.role != UserRole.owner:
            raise HTTPException(status_code=403, detail="Cannot change your own permissions")

    old_values = {}
    if body.name is not None:
        old_values["name"] = user.name
        user.name = body.name
    if body.position is not None:
        old_values["position"] = user.position
        user.position = body.position.strip() or None
    if body.role is not None:
        old_values["role"] = user.role.value
        user.role = UserRole(body.role)
    if body.venue_id is not None and body.venue_id != user.venue_id:
        venue = await _get_venue_or_404(session, body.venue_id)
        old_values["venue_id"] = str(user.venue_id)
        user.venue_id = venue.id
    if body.hourly_rate is not None:
        old_values["hourly_rate"] = str(user.hourly_rate)
        user.hourly_rate = body.hourly_rate
    if body.revenue_percentage is not None:
        old_values["revenue_percentage"] = str(user.revenue_percentage)
        user.revenue_percentage = body.revenue_percentage
    if body.pay_model is not None:
        old_values["pay_model"] = user.pay_model.value
        user.pay_model = PayModel(body.pay_model)
    if body.is_active is not None:
        old_values["is_active"] = user.is_active
        if body.is_active is False:
            await _ensure_user_can_be_deactivated(session, user.venue_id, user, admin)
        user.is_active = body.is_active
    if body.permissions is not None:
        old_values["permissions"] = user.permissions
        try:
            user.permissions = validate_permission_map(body.permissions)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    await session.commit()
    await session.refresh(user)

    # Audit log
    log = AuditLog(
        user_id=admin.id,
        target_user_id=user.id,
        venue_id=user.venue_id,
        action="user_updated",
        entity_type="user",
        entity_id=user.id,
        old_value=old_values if old_values else None,
        new_value={k: str(v) for k, v in body.model_dump(exclude_none=True).items()},
    )
    session.add(log)
    await session.commit()

    return user


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    admin: User = Depends(get_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Deactivate a user (soft delete)."""
    target = await session.execute(
        select(User)
        .options(selectinload(User.venue))
        .where(User.id == uuid.UUID(user_id))
    )
    user = target.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await _ensure_user_can_be_deactivated(session, user.venue_id, user, admin)

    user.is_active = False
    await session.commit()

    # Audit log
    log = AuditLog(
        user_id=admin.id,
        target_user_id=user.id,
        venue_id=user.venue_id,
        action="user_deactivated",
        entity_type="user",
        entity_id=user.id,
    )
    session.add(log)
    await session.commit()

    return {"ok": True}
