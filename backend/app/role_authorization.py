def _role_value(role: object | None) -> str | None:
    if role is None:
        return None
    value = getattr(role, "value", role)
    return str(value)


def can_assign_owner_role(
    actor_role: object,
    requested_role: object,
    current_role: object | None = None,
) -> bool:
    """Only an owner may create or promote another user to owner."""
    requested_value = _role_value(requested_role)
    if requested_value != "owner":
        return True

    if _role_value(current_role) == "owner":
        return True

    return _role_value(actor_role) == "owner"
