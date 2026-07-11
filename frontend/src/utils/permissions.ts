import type { User } from './api';

export const PERMISSION_KEYS = [
  'can_approve_shifts',
  'can_edit_team_shifts',
  'can_view_team_shifts',
  'can_view_team_payroll',
  'can_export_payroll',
  'can_manage_team',
  'can_manage_adjustments',
  'can_manage_expenses',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_approve_shifts: 'Утверждать смены',
  can_edit_team_shifts: 'Редактировать смены сотрудников',
  can_view_team_shifts: 'Смотреть смены команды',
  can_view_team_payroll: 'Смотреть сводку начислений',
  can_export_payroll: 'Экспортировать расчёт выплат',
  can_manage_team: 'Управлять сотрудниками',
  can_manage_adjustments: 'Выдавать бонусы/удержания',
  can_manage_expenses: 'Управлять расходами',
};

export const ROLE_DEFAULT_PERMISSIONS: Record<User['role'], PermissionMap> = {
  owner: {
    can_approve_shifts: true,
    can_edit_team_shifts: true,
    can_view_team_shifts: true,
    can_view_team_payroll: true,
    can_export_payroll: true,
    can_manage_team: true,
    can_manage_adjustments: true,
    can_manage_expenses: true,
  },
  admin: {
    can_approve_shifts: true,
    can_edit_team_shifts: true,
    can_view_team_shifts: true,
    can_view_team_payroll: true,
    can_export_payroll: true,
    can_manage_team: true,
    can_manage_adjustments: true,
    can_manage_expenses: true,
  },
  senior: {
    can_approve_shifts: true,
    can_edit_team_shifts: true,
    can_view_team_shifts: true,
    can_view_team_payroll: false,
    can_export_payroll: false,
    can_manage_team: false,
    can_manage_adjustments: false,
    can_manage_expenses: false,
  },
  barista: {
    can_approve_shifts: false,
    can_edit_team_shifts: false,
    can_view_team_shifts: false,
    can_view_team_payroll: false,
    can_export_payroll: false,
    can_manage_team: false,
    can_manage_adjustments: false,
    can_manage_expenses: false,
  },
  cook: {
    can_approve_shifts: false,
    can_edit_team_shifts: false,
    can_view_team_shifts: false,
    can_view_team_payroll: false,
    can_export_payroll: false,
    can_manage_team: false,
    can_manage_adjustments: false,
    can_manage_expenses: false,
  },
  senior_cook: {
    can_approve_shifts: false,
    can_edit_team_shifts: false,
    can_view_team_shifts: false,
    can_view_team_payroll: false,
    can_export_payroll: false,
    can_manage_team: false,
    can_manage_adjustments: false,
    can_manage_expenses: false,
  },
};

export function getDefaultPermissionsForRole(role: User['role']): PermissionMap {
  return { ...(ROLE_DEFAULT_PERMISSIONS[role] ?? ROLE_DEFAULT_PERMISSIONS.barista) };
}

export function normalizePermissionMap(permissions?: Record<string, boolean> | null): PermissionMap {
  if (!permissions) {
    return {};
  }

  return PERMISSION_KEYS.reduce<PermissionMap>((acc, key) => {
    if (key in permissions) {
      acc[key] = Boolean(permissions[key]);
    }
    return acc;
  }, {});
}

export function getEffectivePermissions(user: Pick<User, 'role' | 'permissions'>): Record<PermissionKey, boolean> {
  if (user.role === 'owner') {
    return { ...ROLE_DEFAULT_PERMISSIONS.owner } as Record<PermissionKey, boolean>;
  }

  const defaults = ROLE_DEFAULT_PERMISSIONS[user.role] ?? ROLE_DEFAULT_PERMISSIONS.barista;
  const explicit = normalizePermissionMap(user.permissions);

  return PERMISSION_KEYS.reduce<Record<PermissionKey, boolean>>((acc, key) => {
    const defaultValue = defaults[key] ?? false;
    acc[key] = typeof explicit[key] === 'boolean' ? explicit[key] : defaultValue;
    return acc;
  }, {} as Record<PermissionKey, boolean>);
}

export function hasPermission(user: Pick<User, 'role' | 'permissions'>, permission: PermissionKey): boolean {
  return getEffectivePermissions(user)[permission];
}

export function canAccessOwnerPanel(user: Pick<User, 'role' | 'permissions'>): boolean {
  const effective = getEffectivePermissions(user);
  return (
    effective.can_approve_shifts ||
    effective.can_edit_team_shifts ||
    effective.can_manage_team ||
    effective.can_manage_adjustments
  );
}
