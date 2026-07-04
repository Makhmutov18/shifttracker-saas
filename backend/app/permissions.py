from __future__ import annotations

from typing import Any

from app.models import UserRole


PERMISSION_KEYS: tuple[str, ...] = (
    "can_approve_shifts",
    "can_edit_team_shifts",
    "can_view_team_shifts",
    "can_view_team_payroll",
    "can_export_payroll",
    "can_manage_team",
    "can_manage_adjustments",
    "can_manage_expenses",
)

OWNER_FULL_ACCESS = {key: True for key in PERMISSION_KEYS}
ADMIN_DEFAULT_PERMISSIONS = {key: True for key in PERMISSION_KEYS}
SENIOR_DEFAULT_PERMISSIONS = {
    "can_approve_shifts": True,
    "can_edit_team_shifts": True,
    "can_view_team_shifts": True,
    "can_view_team_payroll": False,
    "can_export_payroll": False,
    "can_manage_team": False,
    "can_manage_adjustments": False,
    "can_manage_expenses": False,
}
STAFF_DEFAULT_PERMISSIONS = {key: False for key in PERMISSION_KEYS}


def validate_permission_map(raw_permissions: Any) -> dict[str, bool]:
    if raw_permissions in (None, {}):
        return {}

    if not isinstance(raw_permissions, dict):
        raise ValueError("Permissions must be an object")

    unknown_keys = [key for key in raw_permissions.keys() if key not in PERMISSION_KEYS]
    if unknown_keys:
        raise ValueError(f"Unknown permission keys: {', '.join(sorted(unknown_keys))}")

    return {key: bool(raw_permissions[key]) for key in raw_permissions.keys()}


def default_permissions_for_role(role: UserRole | str) -> dict[str, bool]:
    role_value = role.value if isinstance(role, UserRole) else str(role)

    if role_value == UserRole.owner.value:
        return dict(OWNER_FULL_ACCESS)
    if role_value == UserRole.admin.value:
        return dict(ADMIN_DEFAULT_PERMISSIONS)
    if role_value == UserRole.senior.value:
        return dict(SENIOR_DEFAULT_PERMISSIONS)
    return dict(STAFF_DEFAULT_PERMISSIONS)


def effective_permissions(role: UserRole | str, permissions: dict[str, bool] | None) -> dict[str, bool]:
    if (role.value if isinstance(role, UserRole) else str(role)) == UserRole.owner.value:
        return dict(OWNER_FULL_ACCESS)

    effective = default_permissions_for_role(role)
    if permissions:
        for key, value in permissions.items():
            if key in PERMISSION_KEYS:
                effective[key] = bool(value)
    return effective


def has_permission(user: Any, permission_name: str) -> bool:
    if permission_name not in PERMISSION_KEYS:
        return False

    if getattr(user, "role", None) == UserRole.owner:
        return True

    permissions = getattr(user, "permissions", None)
    effective = effective_permissions(getattr(user, "role", ""), permissions)
    return bool(effective.get(permission_name, False))

