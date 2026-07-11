import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calculator,
  Check,
  CheckCircle,
  Copy,
  Gift,
  History,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import {
  AdminCreateUserResponse,
  AuditLog,
  PayrollPreview,
  PayrollRunDetail,
  PayrollRunListItem,
  Shift,
  User,
  Venue,
  createAdjustment,
  createUser,
  createVenue,
  createPayrollRun,
  deactivateVenue,
  deleteUser,
  getAuditLogs,
  getPendingShifts,
  getPayrollRun,
  getPayrollRunPreview,
  getPayrollRuns,
  getUsers,
  getVenues,
  updateShift,
  updateUser,
  updateVenue,
} from '../utils/api';
import { formatCurrency, formatDate, formatHours, formatTime } from '../utils/helpers';
import { hapticError, hapticSuccess } from '../utils/telegram';
import {
  PERMISSION_KEYS,
  PermissionKey,
  PermissionMap,
  canAccessOwnerPanel,
  getDefaultPermissionsForRole,
  hasPermission,
  normalizePermissionMap,
} from '../utils/permissions';

interface Props {
  user: User;
  initialTab?: Tab | null;
  onInitialTabConsumed?: () => void;
}

type Tab = 'invite' | 'approve' | 'adjust' | 'audit' | 'team' | 'venues' | 'payroll';

type ShiftDraft = {
  start_time: string;
  end_time: string;
  cashier_hours: string;
  revenue: string;
  comment: string;
};

type PermissionToggleProps = {
  value: PermissionMap;
  onChange: (value: PermissionMap) => void;
  disabled?: boolean;
};

type OwnerPanelBoundaryProps = {
  children: React.ReactNode;
};

type OwnerPanelBoundaryState = {
  hasError: boolean;
};

class OwnerPanelBoundary extends React.Component<OwnerPanelBoundaryProps, OwnerPanelBoundaryState> {
  state: OwnerPanelBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('OwnerPanel render failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          Не удалось открыть этот раздел. Обновите экран и попробуйте ещё раз.
        </div>
      );
    }

    return this.props.children;
  }
}

function PermissionsChecklist({ value, onChange, disabled = false }: PermissionToggleProps) {
  const safeValue = value ?? {};

  return (
    <div className="grid gap-2">
      {MANAGEMENT_PERMISSION_OPTIONS.map(({ key, label }) => (
        <label
          key={key}
          className={`flex items-center justify-between gap-3 rounded-xl bg-tg-bg px-3 py-3 text-sm ${
            disabled ? 'opacity-60' : 'hover:bg-tg-bg/90'
          }`}
        >
          <span className="text-tg-text">{label}</span>
          <input
            type="checkbox"
            checked={Boolean(safeValue[key])}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...safeValue,
                [key]: event.target.checked,
              })
            }
            className="h-4 w-4 rounded border-gray-300 text-tg-primary focus:ring-tg-primary"
          />
        </label>
      ))}
    </div>
  );
}

function ManagementAccessSection({
  enabled,
  onEnabledChange,
  permissions,
  onPermissionsChange,
  disabled = false,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  permissions: PermissionMap;
  onPermissionsChange: (permissions: PermissionMap) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-tg-secondary-bg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-tg-text">Доступ к управлению</p>
          <p className="text-xs text-tg-hint">
            Если выключено, сотрудник видит только свои смены, историю и профиль.
          </p>
        </div>
        <label className={`inline-flex items-center gap-2 text-sm ${disabled ? 'opacity-60' : ''}`}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-tg-primary focus:ring-tg-primary"
          />
          <span className="text-tg-text">{enabled ? 'Включён' : 'Обычный сотрудник'}</span>
        </label>
      </div>

      {enabled ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Права доступа</p>
          <PermissionsChecklist value={permissions} onChange={onPermissionsChange} disabled={disabled} />
        </div>
      ) : null}
    </div>
  );
}

function EmployeeFormSection({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl bg-tg-secondary-bg p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-tg-text">{title}</p>
        {description ? <p className="text-xs text-tg-hint">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function getEmptyManagementPermissions(): PermissionMap {
  return PERMISSION_KEYS.reduce<PermissionMap>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
}

function getManagementEnabledState(role: User['role'], permissions?: PermissionMap) {
  if (role === 'owner' || role === 'admin') {
    return true;
  }
  return canAccessOwnerPanel({ role, permissions: permissions ?? {} });
}

function getManagementBadge(user: Pick<User, 'role' | 'permissions'>) {
  return canAccessOwnerPanel(user) ? 'Есть доступ к управлению' : 'Обычный сотрудник';
}

function getManagementRoleLabel(user: Pick<User, 'role' | 'permissions'>) {
  if (user.role === 'owner') return 'Владелец';
  if (user.role === 'admin') return 'Администратор';
  if (user.role === 'senior') return 'Старший';
  return 'Сотрудник';
}

function getPayModelLabel(payModel: User['pay_model']) {
  return PAY_MODEL_LABELS[payModel];
}

function getPayRateLabel(user: Pick<User, 'hourly_rate' | 'pay_model' | 'revenue_percentage'>) {
  if (user.pay_model === 'revenue') {
    return 'Индивидуально';
  }
  if (user.pay_model === 'fixed_shift') {
    return `${formatCurrency(user.hourly_rate)} / смена`;
  }
  if (user.pay_model === 'hybrid') {
    return `${formatCurrency(user.hourly_rate)} / час`;
  }
  return `${formatCurrency(user.hourly_rate)} / час`;
}

function getShortVenueLabel(venue?: Venue) {
  return venue?.name?.trim() || 'Основная точка';
}

type VenueDetails = Venue & {
  address?: string | null;
  description?: string | null;
  notes?: string | null;
};

function getVenueAddressLabel(venue?: Venue) {
  const raw = venue as VenueDetails | undefined;
  return raw?.address?.trim() || 'Адрес не указан';
}

function getVenueDescriptionLabel(venue?: Venue) {
  const raw = venue as VenueDetails | undefined;
  return raw?.description?.trim() || raw?.notes?.trim() || 'Описание не добавлено';
}

function EmployeeStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-tg-bg px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-tg-hint">{label}</p>
      <p className="mt-1 text-sm text-tg-text">{value}</p>
    </div>
  );
}

function TeamEmployeeCard({
  employee,
  currentUser,
  archived = false,
  onEdit,
  onToggleStatus,
  busy,
}: {
  employee: User;
  currentUser: User;
  archived?: boolean;
  onEdit: (user: User) => void;
  onToggleStatus: (user: User) => void;
  busy?: boolean;
}) {
  const isSelf = employee.id === currentUser.id;

  return (
    <div className={`rounded-[1.35rem] p-3.5 ${archived ? 'surface-card opacity-90' : 'surface-muted'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-tg-text">{employee.name}</p>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                archived
                  ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              }`}
            >
              {archived ? 'В архиве' : 'Активен'}
            </span>
            <span className="rounded-full bg-tg-bg px-2 py-1 text-[11px] font-medium text-tg-hint">
              {getManagementBadge(employee)}
            </span>
            <span className="rounded-full bg-tg-bg px-2 py-1 text-[11px] font-medium text-tg-hint">
              {getManagementRoleLabel(employee)}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-tg-hint">
            {getPositionLabel(employee)} · {getShortVenueLabel(employee.venue)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEdit(employee)}
          className="rounded-xl p-2 transition-colors hover:bg-tg-bg"
          aria-label={`Редактировать ${employee.name}`}
        >
          <Pencil className="w-4 h-4 text-tg-hint" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <EmployeeStat label="Должность" value={getPositionLabel(employee)} />
        <EmployeeStat label="Точка" value={getShortVenueLabel(employee.venue)} />
        <EmployeeStat label="Оплата" value={getPayModelLabel(employee.pay_model)} />
        <EmployeeStat label="Ставка" value={getPayRateLabel(employee)} />
        {(employee.pay_model === 'revenue' || employee.pay_model === 'hybrid') && Number(employee.revenue_percentage) > 0 && (
          <div className="col-span-2 rounded-xl bg-tg-bg px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-tg-hint">Процент от выручки</p>
            <p className="mt-1 text-sm text-tg-text">{employee.revenue_percentage}%</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {!isSelf ? (
          <button
            type="button"
            onClick={() => onToggleStatus(employee)}
            disabled={busy}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
              archived
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                : 'bg-rose-500/10 text-rose-600'
            }`}
          >
            {busy ? (
              <span className="animate-spin h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" />
            ) : archived ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <UserX className="h-3.5 w-3.5" />
            )}
            {archived ? 'Восстановить' : 'В архив'}
          </button>
        ) : (
          <span className="inline-flex flex-1 items-center justify-center rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-tg-hint">
            Это вы
          </span>
        )}
      </div>
    </div>
  );
}

const MANAGEMENT_PERMISSION_OPTIONS: { key: PermissionKey; label: string }[] = [
  { key: 'can_approve_shifts', label: 'Утверждать смены' },
  { key: 'can_view_team_shifts', label: 'Видеть смены команды' },
  { key: 'can_edit_team_shifts', label: 'Редактировать смены команды' },
  { key: 'can_view_team_payroll', label: 'Видеть сводку начислений' },
  { key: 'can_export_payroll', label: 'Экспортировать расчёт выплат' },
  { key: 'can_manage_team', label: 'Управлять командой и точками' },
  { key: 'can_manage_adjustments', label: 'Управлять корректировками' },
  { key: 'can_manage_expenses', label: 'Управлять расходами' },
];

export default function OwnerPanel({ user, initialTab, onInitialTabConsumed }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'invite');
  const canApprove = hasPermission(user, 'can_approve_shifts') || hasPermission(user, 'can_edit_team_shifts');
  const canManageTeam = hasPermission(user, 'can_manage_team');
  const canManageAdjustments = hasPermission(user, 'can_manage_adjustments');
  const canViewPayroll = hasPermission(user, 'can_view_team_payroll');
  const canCreatePayroll = user.role === 'owner' || user.role === 'admin';
  const canViewAudit = canManageTeam;

  const visibleTabs: { id: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: 'invite', label: 'Пригласить', icon: <UserPlus className="w-4 h-4 inline mr-1" />, visible: canManageTeam },
    { id: 'approve', label: 'Утвердить', icon: <CheckCircle className="w-4 h-4 inline mr-1" />, visible: canApprove },
    { id: 'adjust', label: 'Бонусы', icon: <Gift className="w-4 h-4 inline mr-1" />, visible: canManageAdjustments },
    { id: 'audit', label: 'История', icon: <History className="w-4 h-4 inline mr-1" />, visible: canViewAudit },
    { id: 'team', label: 'Команда', icon: <Users className="w-4 h-4 inline mr-1" />, visible: canManageTeam },
    { id: 'venues', label: 'Точки', icon: <Building2 className="w-4 h-4 inline mr-1" />, visible: canManageTeam },
    { id: 'payroll', label: 'Расчёты', icon: <Calculator className="w-4 h-4 inline mr-1" />, visible: canViewPayroll },
  ];

  const activeTabs = visibleTabs.filter((item) => item.visible);

  useEffect(() => {
    if (activeTabs.length === 0) {
      return;
    }
    if (!activeTabs.some((item) => item.id === tab)) {
      setTab(activeTabs[0].id);
    }
  }, [activeTabs, tab]);

  useEffect(() => {
    if (!initialTab) {
      return;
    }
    if (activeTabs.some((item) => item.id === initialTab)) {
      setTab(initialTab);
      onInitialTabConsumed?.();
    }
  }, [activeTabs, initialTab, onInitialTabConsumed]);

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-tg-primary" />
        <h1 className="text-lg font-semibold">Управление</h1>
      </div>

      <div className="flex bg-tg-secondary-bg rounded-xl p-1 mb-6 overflow-x-auto">
        {activeTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === item.id ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <OwnerPanelBoundary>
        {tab === 'invite' && canManageTeam && <InviteTab />}
        {tab === 'approve' && canApprove && <ApproveTab />}
        {tab === 'adjust' && canManageAdjustments && <AdjustTab venueId={user.venue_id} />}
        {tab === 'audit' && canViewAudit && <AuditTab />}
        {tab === 'team' && canManageTeam && <TeamTab user={user} />}
        {tab === 'venues' && canManageTeam && <VenuesTab />}
        {tab === 'payroll' && canViewPayroll && (
          <PayrollRunsTab
            canCreate={canCreatePayroll}
            userVenueId={user.venue_id}
            restrictToVenue={!canCreatePayroll}
          />
        )}
      </OwnerPanelBoundary>
    </div>
  );
}

function getPayrollRunStatusLabel(status: string) {
  return {
    draft: 'Черновик',
    finalized: 'Зафиксирован',
    paid: 'Выплачен',
    cancelled: 'Отменён',
  }[status] || 'Статус не указан';
}

function getPayrollRunError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/already included|already exists|conflict|duplicate/i.test(message)) {
    return 'Часть источников уже включена в другой активный расчёт.';
  }
  return message || 'Не удалось выполнить операцию.';
}

function PayrollRunsTab({ canCreate, userVenueId, restrictToVenue }: { canCreate: boolean; userVenueId: string; restrictToVenue: boolean }) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = now.toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [venueId, setVenueId] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRuns = async () => {
    try {
      const data = await getPayrollRuns(venueId || (restrictToVenue ? userVenueId : undefined));
      setRuns(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(getPayrollRunError(err));
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [runsResult, venuesResult] = await Promise.allSettled([
        getPayrollRuns(restrictToVenue ? userVenueId : undefined),
        getVenues(false),
      ]);
      if (!active) return;
      if (runsResult.status === 'fulfilled') {
        setRuns(Array.isArray(runsResult.value) ? runsResult.value : []);
      } else {
        setError(getPayrollRunError(runsResult.reason));
      }
      if (venuesResult.status === 'fulfilled') {
        setVenues(Array.isArray(venuesResult.value) ? venuesResult.value.filter((venue) => venue.is_active) : []);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [restrictToVenue, userVenueId]);

  const handlePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPreview(null);
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      setError('Проверьте даты периода.');
      return;
    }
    try {
      setPreviewLoading(true);
      const data = await getPayrollRunPreview(periodStart, periodEnd, venueId || undefined);
      setPreview(data);
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!preview || !canCreate) return;
    setError(null);
    setSuccess(null);
    try {
      setSaving(true);
      await createPayrollRun({
        period_start: periodStart,
        period_end: periodEnd,
        venue_id: venueId || undefined,
      });
      setSuccess('Черновик расчёта сформирован.');
      await loadRuns();
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDetails = async (runId: string) => {
    setError(null);
    try {
      setDetailsLoading(true);
      setSelectedRun(await getPayrollRun(runId));
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <section className="surface-card rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="surface-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-tg-primary">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-tg-text">Расчёты выплат</h2>
            <p className="mt-1 text-sm text-tg-hint">Сформируйте расчёт начислений за выбранный период</p>
          </div>
        </div>
        <form onSubmit={handlePreview} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-tg-hint">
              Начало периода
              <input
                type="date"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
                className="mt-1.5 w-full rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none"
              />
            </label>
            <label className="text-xs text-tg-hint">
              Конец периода
              <input
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
                className="mt-1.5 w-full rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none"
              />
            </label>
          </div>
          <label className="block text-xs text-tg-hint">
            Точка
            <select
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              className="mt-1.5 w-full appearance-none rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none"
            >
              <option value="">Все точки</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={previewLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-primary py-3 text-sm font-semibold text-tg-button-text disabled:opacity-60"
          >
            {previewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Предварительный расчёт
          </button>
        </form>
      </section>

      {error && <div className="surface-card rounded-xl p-3 text-sm text-rose-600 dark:text-rose-200">{error}</div>}
      {success && <div className="surface-card rounded-xl p-3 text-sm text-emerald-600 dark:text-emerald-200">{success}</div>}

      {preview && (
        <section className="surface-card space-y-3 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-tg-text">Предварительный расчёт</h3>
              <p className="mt-1 text-xs text-tg-hint">{formatDate(preview.period_start)} — {formatDate(preview.period_end)}</p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="shrink-0 rounded-xl bg-tg-primary px-3 py-2.5 text-xs font-semibold text-tg-button-text disabled:opacity-60"
              >
                {saving ? 'Сохраняем…' : 'Сформировать черновик'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="surface-muted rounded-xl p-3"><p className="text-xs text-tg-hint">Сотрудники</p><p className="mt-1 font-semibold text-tg-text">{preview.employees_count}</p></div>
            <div className="surface-muted rounded-xl p-3"><p className="text-xs text-tg-hint">Смены</p><p className="mt-1 font-semibold text-tg-text">{preview.shifts_count}</p></div>
            <div className="surface-muted rounded-xl p-3"><p className="text-xs text-tg-hint">Часы</p><p className="mt-1 font-semibold text-tg-text">{formatHours(preview.total_hours)}</p></div>
            <div className="surface-muted rounded-xl p-3"><p className="text-xs text-tg-hint">Начислено</p><p className="mt-1 font-semibold text-tg-text">{formatCurrency(preview.total_amount)}</p></div>
          </div>
          <div className="grid gap-2 text-sm text-tg-hint sm:grid-cols-3">
            <span>База: <b className="text-tg-text">{formatCurrency(preview.total_base_amount)}</b></span>
            <span>Бонусы: <b className="text-tg-text">{formatCurrency(preview.total_bonuses)}</b></span>
            <span>Удержания: <b className="text-tg-text">{formatCurrency(preview.total_deductions)}</b></span>
          </div>
          {preview.rows.length === 0 ? (
            <div className="surface-muted rounded-xl px-4 py-6 text-center text-sm text-tg-hint">За выбранный период начислений нет</div>
          ) : (
            <div className="space-y-2">
              {preview.rows.map((row) => (
                <div key={row.user_id} className="surface-muted rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-tg-text">{row.user_name || 'Сотрудник'}</p>
                      <p className="mt-1 text-xs text-tg-hint">{row.venue_name || 'Основная точка'}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-tg-text">{formatCurrency(row.total_amount)}</p>
                  </div>
                  <p className="mt-2 text-xs text-tg-hint">{row.shifts_count} смен · {formatHours(row.total_hours)} · База {formatCurrency(row.base_amount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-tg-text">Сохранённые расчёты</h3>
          <button type="button" onClick={loadRuns} className="text-xs font-medium text-tg-primary">Обновить</button>
        </div>
        {loading ? (
          <div className="animate-pulse space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl surface-card" />)}</div>
        ) : runs.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-8 text-center text-sm text-tg-hint">Расчётов пока нет</div>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => handleOpenDetails(run.id)}
              className="surface-card block w-full rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-tg-text">{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</p>
                  <p className="mt-1 text-xs text-tg-hint">{run.venue_name || 'Все точки'} · {formatDate(run.period_start)} — {formatDate(run.period_end)}</p>
                </div>
                <span className="shrink-0 rounded-full surface-muted px-2.5 py-1 text-[11px] font-medium text-tg-text">{getPayrollRunStatusLabel(run.status)}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <span className="text-tg-hint">Сотрудники <b className="block mt-0.5 text-tg-text">{run.employees_count}</b></span>
                <span className="text-tg-hint">Начислено <b className="block mt-0.5 text-tg-text">{formatCurrency(run.total_amount)}</b></span>
                <span className="text-tg-hint">Выплачено <b className="block mt-0.5 text-tg-text">{formatCurrency(run.total_paid)}</b></span>
              </div>
              <p className="mt-3 text-[11px] text-tg-hint">Создано: {formatDate(run.created_at)} · {run.created_by_name || 'Пользователь'}</p>
            </button>
          ))
        )}
      </section>

      {detailsLoading && <div className="surface-card rounded-2xl p-4 text-sm text-tg-hint">Загружаем детали…</div>}
      {selectedRun && !detailsLoading && (
        <section className="surface-card space-y-3 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-tg-text">{selectedRun.title}</h3>
              <p className="mt-1 text-xs text-tg-hint">{getPayrollRunStatusLabel(selectedRun.status)} · {selectedRun.venue_name || 'Все точки'}</p>
            </div>
            <button type="button" onClick={() => setSelectedRun(null)} className="text-xs text-tg-hint">Закрыть</button>
          </div>
          <div className="space-y-2">
            {(selectedRun.items || []).map((item) => (
              <div key={item.id} className="surface-muted rounded-xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-tg-text">{item.user_name || 'Сотрудник'}</p>
                  <p className="text-sm font-semibold text-tg-text">{formatCurrency(item.final_amount)}</p>
                </div>
                <p className="mt-1 text-xs text-tg-hint">{item.approved_shifts_count} смен · {formatHours(item.approved_hours)} · Выплачено {formatCurrency(item.paid_amount)} · Осталось {formatCurrency(item.remaining_amount)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-tg-hint/10 pt-3 text-sm">
            <span className="text-tg-hint">Итого начислено</span>
            <b className="text-tg-text">{formatCurrency(selectedRun.total_amount)}</b>
          </div>
        </section>
      )}
    </div>
  );
}

function InviteTab() {
  const [firstName, setFirstName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<'barista' | 'admin' | 'senior' | 'cook' | 'senior_cook'>('barista');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [payModel, setPayModel] = useState<User['pay_model']>('hourly');
  const [revenuePercentage, setRevenuePercentage] = useState('');
  const [permissions, setPermissions] = useState<PermissionMap>(() => getEmptyManagementPermissions());
  const [managementEnabled, setManagementEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdminCreateUserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const data = await getVenues();
        setVenues(data);
        setVenueId((current) => current || data[0]?.id || '');
      } catch {
        setVenues([]);
      }
    };
    fetchVenues();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const rate = parseFloat(hourlyRate);
    if (!firstName.trim()) {
      setError('Введите имя сотрудника');
      return;
    }
    if (payModel !== 'revenue' && (isNaN(rate) || rate < 0)) {
      setError('Введите корректную ставку');
      return;
    }

    try {
      setLoading(true);
      const res = await createUser({
        first_name: firstName.trim(),
        position: position.trim() || POSITION_DEFAULTS[role],
        role,
        venue_id: venueId || undefined,
        hourly_rate: rate || 0,
        pay_model: payModel,
        revenue_percentage: payModel === 'revenue' || payModel === 'hybrid' ? parseFloat(revenuePercentage) || 0 : 0,
        permissions: managementEnabled ? permissions : getEmptyManagementPermissions(),
      });
      setResult(res);
      setFirstName('');
      setPosition('');
      setVenueId((current) => current || venues[0]?.id || '');
      setHourlyRate('');
      setRevenuePercentage('');
      setPermissions(getEmptyManagementPermissions());
      setManagementEnabled(false);
    } catch (err: any) {
      setError(err.message || 'Ошибка при создании пользователя');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.invite_link);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = result.invite_link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <EmployeeFormSection title="Основное" description="Только базовые данные сотрудника. Управленческий доступ можно включить отдельно ниже.">
          <div>
            <label className="block text-sm text-tg-hint mb-1.5">Имя сотрудника</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Например: Анна"
              className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm text-tg-hint mb-1.5">Должность</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Бариста, повар, кассир, администратор зала"
              className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm text-tg-hint mb-1.5">Точка</label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
            >
              {venues.length === 0 ? (
                <option value="">Основная точка</option>
              ) : (
                venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {getVenueLabel(venue)}
                  </option>
                ))
              )}
            </select>
          </div>
        </EmployeeFormSection>

        <EmployeeFormSection title="Оплата">
          <div>
            <label className="block text-sm text-tg-hint mb-1.5">Модель оплаты</label>
            <select
              value={payModel}
              onChange={(e) => setPayModel(e.target.value as User['pay_model'])}
              className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
            >
              <option value="hourly">Почасовая</option>
              <option value="fixed_shift">Фикс за смену</option>
              <option value="revenue">От выручки</option>
              <option value="hybrid">Почасовая + процент</option>
            </select>
          </div>

          <div>
              <label className="block text-sm text-tg-hint mb-1.5">
              {getRateFieldLabel(payModel)} <span className="ml-2 text-xs text-tg-hint/80">{getRateLabel(payModel)}</span>
              </label>
            <input
              type="number"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="Например: 250"
              min="0"
              step="0.01"
              className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
            />
          </div>

          {(payModel === 'revenue' || payModel === 'hybrid') && (
            <div>
              <label className="block text-sm text-tg-hint mb-1.5">% от выручки</label>
              <input
                type="number"
                value={revenuePercentage}
                onChange={(e) => setRevenuePercentage(e.target.value)}
                placeholder="Например: 2"
                min="0"
                max="100"
                step="0.1"
                className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
              />
            </div>
          )}
        </EmployeeFormSection>

        <ManagementAccessSection
          enabled={managementEnabled}
          onEnabledChange={(enabled) => {
            setManagementEnabled(enabled);
            setRole(enabled ? 'senior' : 'barista');
            setPermissions(enabled ? getDefaultPermissionsForRole('senior') : getEmptyManagementPermissions());
          }}
          permissions={permissions}
          onPermissionsChange={setPermissions}
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-tg-primary text-white py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {loading ? (
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Сгенерировать инвайт
            </>
          )}
        </button>
      </form>

      {result && (
        <div className="mt-6 bg-tg-secondary-bg rounded-xl p-4 space-y-3">
          <p className="text-sm text-tg-hint">Сотрудник создан. Отправьте ему эту ссылку:</p>
          <div className="bg-tg-bg rounded-lg px-3 py-2.5 text-sm text-tg-text break-all select-all font-mono">
            {result.invite_link}
          </div>
          <button
            onClick={handleCopy}
            className="w-full bg-tg-primary/10 text-tg-primary py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Скопировано' : 'Скопировать ссылку'}
          </button>
        </div>
      )}
    </div>
  );
}

function ApproveTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userVenues, setUserVenues] = useState<Record<string, string>>({});
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [savingShiftId, setSavingShiftId] = useState<string | null>(null);

  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const safeUserNames = userNames ?? {};
  const safeUserVenues = userVenues ?? {};
  const pendingEmployeesCount = new Set(
    safeShifts.map((shift) => shift?.user_id).filter((userId): userId is string => Boolean(userId))
  ).size;
  const preliminaryAmount = safeShifts.reduce((sum, shift) => {
    const nextAmount = Number(shift?.salary_earned);
    return sum + (Number.isFinite(nextAmount) ? nextAmount : 0);
  }, 0);

  const getShiftDateLabel = (date: string) => {
    if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return 'Дата не указана';
    }
    return formatDate(date);
  };

  const getShiftTimeLabel = (time: string) => {
    return typeof time === 'string' && time.length >= 5 ? formatTime(time) : '—';
  };

  const getShiftAmount = (amount: string | number | null | undefined) => {
    if (amount == null || amount === '') return formatCurrency(0);
    return formatCurrency(amount);
  };

  const getShiftHours = (hours: string | number | null | undefined) => {
    if (hours == null || hours === '') return formatHours(0);
    return formatHours(hours);
  };

  const getShiftRevenue = (revenue: string | number | null | undefined) => {
    if (revenue == null || revenue === '') return null;
    const nextRevenue = Number(revenue);
    if (!Number.isFinite(nextRevenue)) return null;
    return formatCurrency(nextRevenue);
  };

  const getShiftFallbackTimeText = (shift: Shift) => {
    const hasStartTime = typeof shift?.start_time === 'string' && shift.start_time.length >= 5;
    const hasEndTime = typeof shift?.end_time === 'string' && shift.end_time.length >= 5;

    if (!hasStartTime && !hasEndTime) {
      return 'Время не указано';
    }

    return `${hasStartTime ? formatTime(shift.start_time) : '—'} · ${hasEndTime ? formatTime(shift.end_time) : '—'}`;
  };

  const buildDraft = (shift: Shift): ShiftDraft => ({
    start_time: typeof shift.start_time === 'string' ? shift.start_time.slice(0, 5) : '',
    end_time: typeof shift.end_time === 'string' ? shift.end_time.slice(0, 5) : '',
    cashier_hours: shift.cashier_hours ? String(shift.cashier_hours) : '',
    revenue: shift.revenue ? String(shift.revenue) : '',
    comment: shift.comment || '',
  });

  const fetchShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      const [shiftsResult, usersResult] = await Promise.allSettled([getPendingShifts(), getUsers(true)]);

      if (shiftsResult.status === 'rejected') {
        throw shiftsResult.reason;
      }

      const nextShifts = Array.isArray(shiftsResult.value) ? shiftsResult.value : [];
      setShifts(nextShifts);

      if (usersResult.status === 'fulfilled' && Array.isArray(usersResult.value)) {
        setUserNames(
          usersResult.value.reduce<Record<string, string>>((acc, current) => {
            if (current?.id) {
              acc[current.id] = current.name || 'Сотрудник';
            }
            return acc;
          }, {})
        );
        setUserVenues(
          usersResult.value.reduce<Record<string, string>>((acc, current) => {
            if (current?.id) {
              acc[current.id] = current.venue?.name || 'Основная точка';
            }
            return acc;
          }, {})
        );
      } else {
        setUserNames({});
        setUserVenues({});
      }
    } catch (err: any) {
      setShifts([]);
      setUserNames({});
      setUserVenues({});
      setError(err instanceof Error ? err.message : 'Не удалось загрузить смены на подтверждение');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
    const interval = window.setInterval(fetchShifts, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const startEdit = (shift: Shift) => {
    if (!shift?.id) return;
    setEditingShiftId(shift.id);
    setDraft(buildDraft(shift));
  };

  const cancelEdit = () => {
    setEditingShiftId(null);
    setDraft(null);
  };

  const saveEdit = async (shiftId: string) => {
    if (!draft || !shiftId) return;

    try {
      setSavingShiftId(shiftId);
      setError(null);
      const updated = await updateShift(shiftId, {
        start_time: draft.start_time || undefined,
        end_time: draft.end_time || undefined,
        cashier_hours: draft.cashier_hours === '' ? undefined : parseFloat(draft.cashier_hours),
        revenue: draft.revenue === '' ? undefined : parseFloat(draft.revenue),
        comment: draft.comment.trim() || undefined,
      });
      setShifts((prev) => (Array.isArray(prev) ? prev.map((shift) => (shift.id === shiftId ? updated : shift)) : [updated]));
      hapticSuccess();
      cancelEdit();
    } catch (err: any) {
      hapticError();
      setError(err instanceof Error ? err.message : 'Не удалось сохранить правки');
    } finally {
      setSavingShiftId(null);
    }
  };

  const handleApprove = async (shiftId: string) => {
    if (!shiftId) return;

    try {
      setSavingShiftId(shiftId);
      setError(null);
      await updateShift(shiftId, { status: 'approved' });
      hapticSuccess();
      setShifts((prev) => (Array.isArray(prev) ? prev.filter((shift) => shift.id !== shiftId) : []));
      if (editingShiftId === shiftId) {
        cancelEdit();
      }
    } catch (err: any) {
      hapticError();
      setError(err instanceof Error ? err.message : 'Не удалось утвердить смену');
    } finally {
      setSavingShiftId(null);
    }
  };

  const handleReject = async (shiftId: string) => {
    if (!shiftId) return;

    try {
      setSavingShiftId(shiftId);
      setError(null);
      await updateShift(shiftId, { status: 'rejected' });
      hapticSuccess();
      setShifts((prev) => (Array.isArray(prev) ? prev.filter((shift) => shift.id !== shiftId) : []));
      if (editingShiftId === shiftId) {
        cancelEdit();
      }
    } catch (err: any) {
      hapticError();
      setError(err instanceof Error ? err.message : 'Не удалось отклонить смену');
    } finally {
      setSavingShiftId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-tg-secondary-bg rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-tg-secondary-bg px-4 py-5 text-center">
        <p className="text-sm font-medium text-red-400">Ошибка загрузки</p>
        <p className="mt-1 text-sm text-tg-hint">{error}</p>
        <button
          onClick={fetchShifts}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-tg-primary"
        >
          <RefreshCw className="w-4 h-4" />
          Повторить
        </button>
      </div>
    );
  }

  if (safeShifts.length === 0) {
    return (
      <div className="rounded-2xl bg-tg-secondary-bg px-4 py-5 text-center">
        <p className="text-sm font-medium text-tg-text">Смен на подтверждении нет</p>
        <p className="mt-1 text-sm text-tg-hint">Новые заявки сотрудников появятся здесь.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-tg-secondary-bg p-4 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-tg-hint">Утвердить</p>
          <p className="mt-1 text-sm text-tg-hint">Проверьте смены и быстро подтвердите или отклоните их.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-tg-bg px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-tg-hint">Смен</p>
            <p className="mt-1 text-base font-semibold text-tg-text">{safeShifts.length}</p>
          </div>
          <div className="rounded-2xl bg-tg-bg px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-tg-hint">Сотрудников</p>
            <p className="mt-1 text-base font-semibold text-tg-text">{pendingEmployeesCount}</p>
          </div>
          <div className="rounded-2xl bg-tg-bg px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-tg-hint">Предварительно</p>
            <p className="mt-1 text-base font-semibold text-tg-text">{formatCurrency(preliminaryAmount)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-tg-bg px-3 py-2.5">
          <p className="text-sm text-tg-hint">Смены ждут подтверждения: {safeShifts.length}</p>
          <button
            onClick={fetchShifts}
            className="text-tg-primary text-xs font-medium flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Обновить
          </button>
        </div>
      </div>

      {safeShifts.map((shift, index) => {
        const shiftId = shift?.id || `pending-${index}`;
        const isEditing = editingShiftId === shiftId && Boolean(draft);
        const isSaving = savingShiftId === shiftId;
        const employeeName =
          (shift?.user_id && safeUserNames[shift.user_id]) ||
          'Сотрудник не указан';
        const venueName =
          (shift?.user_id && safeUserVenues[shift.user_id]) ||
          'Точка не указана';
        const revenueLabel = getShiftRevenue(shift?.revenue);
        const commentText = typeof shift?.comment === 'string' && shift.comment.trim() ? shift.comment.trim() : 'Комментария нет';

        return (
          <div key={shiftId} className="rounded-2xl bg-tg-secondary-bg p-4 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-tg-text">{employeeName}</p>
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500 dark:bg-amber-400/10 dark:text-amber-300">
                    На подтверждении
                  </span>
                </div>
                <p className="text-xs text-tg-hint">
                  {getShiftDateLabel(shift?.date || '')} · {venueName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-tg-text">{getShiftAmount(shift?.salary_earned)}</p>
                <p className="text-[11px] text-tg-hint">Предварительно</p>
              </div>
            </div>

            <div className="grid gap-2 text-xs text-tg-hint sm:grid-cols-2">
              <div className="rounded-xl bg-tg-bg px-3 py-2.5">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-tg-hint">Время</span>
                <span className="mt-1 block text-sm text-tg-text">{getShiftFallbackTimeText(shift)}</span>
              </div>
              <div className="rounded-xl bg-tg-bg px-3 py-2.5">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-tg-hint">Часы</span>
                <span className="mt-1 block text-sm text-tg-text">{getShiftHours(shift?.total_hours)}</span>
              </div>
              <div className="rounded-xl bg-tg-bg px-3 py-2.5">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-tg-hint">Выручка</span>
                <span className="mt-1 block text-sm text-tg-text">{revenueLabel || 'Выручка не указана'}</span>
              </div>
              <div className="rounded-xl bg-tg-bg px-3 py-2.5">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-tg-hint">Статус</span>
                <span className="mt-1 block text-sm text-tg-text">На подтверждении</span>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-3 rounded-2xl bg-tg-bg p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Начало</label>
                    <input
                      type="time"
                      value={draft?.start_time ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, start_time: e.target.value } : prev))}
                      className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none border border-black/5"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Конец</label>
                    <input
                      type="time"
                      value={draft?.end_time ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, end_time: e.target.value } : prev))}
                      className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none border border-black/5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Выручка</label>
                    <input
                      type="number"
                      value={draft?.revenue ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, revenue: e.target.value } : prev))}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none border border-black/5 placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-tg-hint">Комментарий</label>
                  <textarea
                    value={draft?.comment ?? ''}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, comment: e.target.value } : prev))}
                    rows={2}
                    placeholder="Комментарий к смене"
                    className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none resize-none border border-black/5 placeholder:text-gray-400"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(shiftId)}
                    disabled={isSaving}
                    className="flex-1 bg-tg-primary text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isSaving ? (
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Сохранить правки
                      </>
                    )}
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isSaving}
                    className="flex-1 rounded-xl border border-black/5 bg-tg-secondary-bg py-2.5 text-sm font-medium text-tg-text disabled:opacity-60 dark:border-white/10"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-tg-bg px-3 py-2 text-xs text-tg-hint">{commentText}</p>
            )}

            {!isEditing && Boolean(shift?.id) && (
              <button
                onClick={() => startEdit(shift)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/5 bg-tg-bg py-2.5 text-sm font-medium text-tg-text transition-transform active:scale-[0.98] dark:border-white/10"
              >
                <Pencil className="w-4 h-4" />
                Исправить перед утверждением
              </button>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => handleApprove(shiftId)}
                disabled={!shift?.id || isSaving || Boolean(editingShiftId === shiftId && draft)}
                className="flex-1 rounded-xl bg-tg-primary py-2.5 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                <CheckCircle className="w-4 h-4" />
                Утвердить
              </button>
              <button
                onClick={() => handleReject(shiftId)}
                disabled={!shift?.id || isSaving}
                className="flex-1 rounded-xl border border-black/5 bg-tg-bg py-2.5 text-sm font-medium text-tg-text transition-transform active:scale-[0.98] disabled:opacity-60 dark:border-white/10"
              >
                <XCircle className="w-4 h-4" />
                Отклонить
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VenuesTab() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newVenueName, setNewVenueName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [statusVenueId, setStatusVenueId] = useState<string | null>(null);
  const [showVenueArchive, setShowVenueArchive] = useState(false);

  const fetchVenuesList = async () => {
    try {
      setLoading(true);
      setError(null);
      const [venuesData, usersData] = await Promise.allSettled([getVenues(true), getUsers(true)]);
      setVenues(venuesData.status === 'fulfilled' && Array.isArray(venuesData.value) ? venuesData.value : []);
      setUsers(usersData.status === 'fulfilled' && Array.isArray(usersData.value) ? usersData.value : []);
    } catch (err: any) {
      setVenues([]);
      setUsers([]);
      setError(err.message || 'Не удалось загрузить точки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVenuesList();
  }, []);

  const handleCreateVenue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newVenueName.trim()) {
      setError('Введите название точки');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const created = await createVenue({ name: newVenueName.trim() });
      setVenues((prev) => [created, ...prev]);
      setNewVenueName('');
      setSuccess(`Точка "${created.name}" добавлена`);
      hapticSuccess();
    } catch (err: any) {
      setError(err.message || 'Не удалось создать точку');
      hapticError();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameVenue = async (venueId: string) => {
    if (!editingName.trim()) {
      setError('Введите название точки');
      return;
    }

    try {
      setStatusVenueId(venueId);
      setError(null);
      setSuccess(null);
      const updated = await updateVenue(venueId, { name: editingName.trim() });
      setVenues((prev) => prev.map((venue) => (venue.id === venueId ? updated : venue)));
      setEditingVenueId(null);
      setEditingName('');
      setSuccess(`Точка "${updated.name}" обновлена`);
      hapticSuccess();
    } catch (err: any) {
      setError(err.message || 'Не удалось обновить точку');
      hapticError();
    } finally {
      setStatusVenueId(null);
    }
  };

  const handleToggleVenue = async (venue: Venue) => {
    const nextActive = !venue.is_active;
    const confirmed = nextActive
      ? true
      : window.confirm(`Деактивировать точку "${venue.name}"?`);

    if (!confirmed) return;

    try {
      setStatusVenueId(venue.id);
      setError(null);
      setSuccess(null);
      if (nextActive) {
        const updated = await updateVenue(venue.id, { is_active: true });
        setVenues((prev) => prev.map((item) => (item.id === venue.id ? updated : item)));
        setSuccess(`Точка "${updated.name}" активирована`);
      } else {
        await deactivateVenue(venue.id);
        setVenues((prev) => prev.map((item) => (item.id === venue.id ? { ...item, is_active: false } : item)));
        setSuccess(`Точка "${venue.name}" деактивирована`);
      }
      hapticSuccess();
    } catch (err: any) {
      setError(err.message || 'Не удалось изменить статус точки');
      hapticError();
    } finally {
      setStatusVenueId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 surface-card rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="surface-card rounded-2xl p-4">
        <p className="text-sm font-medium text-tg-text">Точки</p>
        <p className="mt-1 text-sm text-tg-hint">Создавайте, переименовывайте и архивируйте точки без потери истории сотрудников и смен.</p>
        <p className="mt-2 text-xs text-tg-hint">Архив сохраняет смены, начисления и историю.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <EmployeeStat label="Активных" value={venues.filter((venue) => venue.is_active).length} />
          <EmployeeStat label="В архиве" value={venues.filter((venue) => !venue.is_active).length} />
          <EmployeeStat
            label="С точкой"
            value={users.filter((userItem) => Boolean(userItem.venue_id || userItem.venue?.id)).length}
          />
        </div>
      </div>

      <form onSubmit={handleCreateVenue} className="surface-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-tg-primary" />
          <p className="text-sm font-medium text-tg-text">Новая точка</p>
        </div>
        <input
          type="text"
          value={newVenueName}
          onChange={(e) => setNewVenueName(e.target.value)}
          placeholder="Например: Кафе на Баумана"
          className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-tg-primary text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Plus className="w-4 h-4" />}
          Добавить точку
        </button>
      </form>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
      {success && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200">{success}</p>}

      {venues.length === 0 ? (
        <div className="surface-card rounded-2xl px-4 py-5 text-center">
          <Building2 className="mx-auto mb-3 h-12 w-12 text-tg-hint opacity-50" />
          <p className="text-sm font-medium text-tg-text">Точек пока нет</p>
          <p className="mt-1 text-sm text-tg-hint">Добавьте первую точку, чтобы привязывать к ней сотрудников и смены.</p>
        </div>
      ) : (
        <div className="surface-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-tg-text">Активные точки</p>
              <p className="text-xs text-tg-hint">Основной список для работы со сменами и сотрудниками.</p>
            </div>
            <p className="text-xs text-tg-hint">Активных: {venues.filter((venue) => venue.is_active).length}</p>
          </div>

          {venues.filter((venue) => venue.is_active).length === 0 ? (
            <div className="rounded-2xl bg-tg-bg px-4 py-5">
              <p className="text-sm font-medium text-tg-text">Активных точек пока нет</p>
              <p className="mt-1 text-sm text-tg-hint">Переведите точку из архива или добавьте новую.</p>
            </div>
          ) : venues.filter((venue) => venue.is_active).map((venue) => {
            const isEditing = editingVenueId === venue.id;
            const isBusy = statusVenueId === venue.id;
            const employeeCount = users.filter(
              (userItem) => userItem?.venue_id === venue.id || userItem?.venue?.id === venue.id
            ).length;
            return (
              <div key={venue.id} className="rounded-[1.35rem] p-3.5 surface-muted">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                        placeholder="Название точки"
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-tg-text">{venue.name}</p>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
                          Активна
                        </span>
                        <span className="rounded-full bg-tg-bg px-2 py-1 text-[11px] font-medium text-tg-hint">
                          {employeeCount} сотрудников
                        </span>
                      </div>
                    )}
                    {!isEditing && (
                      <div className="mt-2 space-y-0.5 text-xs text-tg-hint">
                        <p>{getVenueAddressLabel(venue)}</p>
                        <p>{getVenueDescriptionLabel(venue)}</p>
                      </div>
                    )}
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => {
                        setEditingVenueId(venue.id);
                        setEditingName(venue.name);
                      }}
                      className="p-2 rounded-xl hover:bg-tg-bg transition-colors"
                      aria-label={`Редактировать ${venue.name}`}
                    >
                      <Pencil className="w-4 h-4 text-tg-hint" />
                    </button>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleRenameVenue(venue.id)}
                        disabled={isBusy}
                        className="flex-1 bg-tg-primary text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        <Check className="w-4 h-4" />
                        Сохранить изменения
                      </button>
                      <button
                        onClick={() => {
                          setEditingVenueId(null);
                          setEditingName('');
                        }}
                        disabled={isBusy}
                        className="flex-1 surface-muted text-tg-text py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleToggleVenue(venue)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 transition-colors disabled:opacity-60"
                    >
                      {isBusy ? <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" /> : <XCircle className="w-3.5 h-3.5" />}
                      В архив
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowVenueArchive((value) => !value)}
        className="surface-muted w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-tg-text"
      >
        <div className="flex items-center justify-between gap-3">
          <span>Архив точек</span>
          <span className="text-xs text-tg-hint">{venues.filter((venue) => !venue.is_active).length}</span>
        </div>
      </button>

      {showVenueArchive && (
        <div className="surface-card rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Архив точек</p>
            <p className="mt-1 text-xs text-tg-hint">Архив сохраняет смены, начисления и историю.</p>
          </div>

          {venues.filter((venue) => !venue.is_active).length === 0 ? (
            <div className="rounded-2xl bg-tg-bg px-4 py-5">
              <p className="text-sm font-medium text-tg-text">Архив точек пуст</p>
              <p className="mt-1 text-sm text-tg-hint">Неактивные точки появятся здесь после перевода в архив.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {venues.filter((venue) => !venue.is_active).map((venue) => {
                const isEditing = editingVenueId === venue.id;
                const isBusy = statusVenueId === venue.id;
                const employeeCount = users.filter(
                  (userItem) => userItem?.venue_id === venue.id || userItem?.venue?.id === venue.id
                ).length;
                return (
                  <div key={venue.id} className="rounded-[1.35rem] bg-tg-bg/80 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                            placeholder="Название точки"
                          />
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-tg-text">{venue.name}</p>
                            <span className="rounded-full bg-zinc-500/10 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                              В архиве
                            </span>
                            <span className="rounded-full bg-tg-bg px-2 py-1 text-[11px] font-medium text-tg-hint">
                              {employeeCount} сотрудников
                            </span>
                          </div>
                        )}
                        {!isEditing && (
                          <div className="mt-2 space-y-0.5 text-xs text-tg-hint">
                            <p>{getVenueAddressLabel(venue)}</p>
                            <p>{getVenueDescriptionLabel(venue)}</p>
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingVenueId(venue.id);
                            setEditingName(venue.name);
                          }}
                          className="p-2 rounded-xl hover:bg-tg-bg transition-colors"
                          aria-label={`Редактировать ${venue.name}`}
                        >
                          <Pencil className="w-4 h-4 text-tg-hint" />
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleRenameVenue(venue.id)}
                            disabled={isBusy}
                            className="flex-1 bg-tg-primary text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
                          >
                            <Check className="w-4 h-4" />
                            Сохранить изменения
                          </button>
                          <button
                            onClick={() => {
                              setEditingVenueId(null);
                              setEditingName('');
                            }}
                            disabled={isBusy}
                            className="flex-1 surface-muted text-tg-text py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleToggleVenue(venue)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 transition-colors disabled:opacity-60"
                        >
                          {isBusy ? (
                            <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          Восстановить
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamTab({ user }: { user: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchive, setShowArchive] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editVenueId, setEditVenueId] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editRole, setEditRole] = useState<User['role']>('barista');
  const [editPayModel, setEditPayModel] = useState<User['pay_model']>('hourly');
  const [editRevenuePercentage, setEditRevenuePercentage] = useState('');
  const [editPermissions, setEditPermissions] = useState<PermissionMap>(getDefaultPermissionsForRole('barista'));
  const [editManagementEnabled, setEditManagementEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUserId, setStatusUserId] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setTeamError(null);
      const [usersData, venuesData] = await Promise.allSettled([getUsers(true), getVenues(true)]);
      if (usersData.status === 'rejected') {
        throw usersData.reason;
      }
      setUsers(usersData.value);
      setVenues(venuesData.status === 'fulfilled' ? venuesData.value : []);
    } catch (err: any) {
      setTeamError(err.message || 'Не удалось загрузить сотрудников');
      setVenues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const startEdit = (target: User) => {
    setEditingUser(target);
    setEditName(target.name);
    setEditPosition(getPositionLabel(target));
    setEditVenueId(target.venue_id || target.venue?.id || '');
    setEditRate(target.hourly_rate);
    setEditRole(target.role);
    setEditPayModel(target.pay_model);
    setEditRevenuePercentage(target.revenue_percentage);
    const nextPermissions = {
      ...getDefaultPermissionsForRole(target.role),
      ...normalizePermissionMap(target.permissions),
    };
    setEditPermissions(nextPermissions);
    setEditManagementEnabled(getManagementEnabledState(target.role, nextPermissions));
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    setTeamError(null);
    setTeamSuccess(null);
    try {
      const updated = await updateUser(editingUser.id, {
        name: editName.trim(),
        position: editPosition.trim() || getPositionLabel(editingUser),
        venue_id: editVenueId || undefined,
        hourly_rate: parseFloat(editRate) || 0,
        role: editRole,
        pay_model: editPayModel,
        revenue_percentage: editPayModel === 'revenue' || editPayModel === 'hybrid' ? parseFloat(editRevenuePercentage) || 0 : 0,
        permissions:
          editingUser.id === user.id && user.role !== 'owner'
            ? undefined
            : editManagementEnabled
            ? editPermissions
            : getEmptyManagementPermissions(),
      });
      hapticSuccess();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setTeamSuccess('Сотрудник сохранён');
      setEditingUser(null);
    } catch (err: any) {
      hapticError();
      setTeamError(err.message || 'Не удалось сохранить сотрудника');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (target: User) => {
    if (target.id === user.id) {
      setTeamError('Нельзя менять статус самого себя');
      return;
    }

    try {
      setStatusUserId(target.id);
      setTeamError(null);
      setTeamSuccess(null);
      if (target.is_active) {
        const confirmed = window.confirm(`Деактивировать сотрудника ${target.name}? Его смены, начисления и история сохранятся.`);
        if (!confirmed) return;
        await deleteUser(target.id);
        setTeamSuccess(`${target.name} деактивирован`);
      } else {
        const updated = await updateUser(target.id, { is_active: true });
        setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setTeamSuccess(`${target.name} активирован`);
      }
      hapticSuccess();
      await fetchUsers();
      setEditingUser((current) => (current?.id === target.id ? null : current));
    } catch (err: any) {
      hapticError();
      setTeamError(err.message || 'Не удалось изменить статус сотрудника');
    } finally {
      setStatusUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 surface-card rounded-2xl" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="surface-card rounded-2xl px-4 py-5">
        <p className="text-sm font-medium text-tg-text">Активных сотрудников пока нет</p>
        <p className="mt-1 text-sm text-tg-hint">Добавьте сотрудника через вкладку приглашения, и он появится здесь.</p>
      </div>
    );
  }

  const activeUsers = users.filter((item) => item.is_active);
  const archivedUsers = users.filter((item) => !item.is_active);
  const activeVenueCount = venues.filter((venue) => venue?.is_active).length;

  return (
    <div className="space-y-4">
      <div className="surface-card rounded-2xl p-4">
        <p className="text-sm font-medium text-tg-text">Команда</p>
        <p className="mt-1 text-sm text-tg-hint">Управляйте сотрудниками, точками, оплатой и доступом без лишней формы.</p>
        <p className="mt-2 text-xs text-tg-hint">Архив сохраняет смены, начисления и историю.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <EmployeeStat label="Активных" value={activeUsers.length} />
          <EmployeeStat label="В архиве" value={archivedUsers.length} />
          <EmployeeStat label="Точек" value={activeVenueCount} />
        </div>
      </div>

      {teamError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">{teamError}</p>}
      {teamSuccess && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200">{teamSuccess}</p>}

      <div className="surface-card rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Сотрудники</p>
            <p className="text-xs text-tg-hint">Список, где можно быстро проверить точку, должность, оплату и доступ к управлению.</p>
          </div>
          <RefreshCw className="w-4 h-4 text-tg-hint" />
        </div>

        {editingUser ? (
          <div className="space-y-4 rounded-[1.35rem] bg-tg-bg/60 p-3.5">
            <EmployeeFormSection title="Основное" description="Имя, должность и точка сотрудника.">
              <div className="space-y-1.5">
                <label className="block text-sm text-tg-hint">Имя сотрудника</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                  placeholder="Например: Анна"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm text-tg-hint">Должность</label>
                <input
                  type="text"
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                  placeholder="Бариста, повар, кассир, администратор зала"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm text-tg-hint">Точка</label>
                <select
                  value={editVenueId}
                  onChange={(e) => setEditVenueId(e.target.value)}
                  className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                >
                  {venues.length === 0 ? (
                    <option value={editingUser.venue_id || ''}>{getVenueName(editingUser.venue)}</option>
                  ) : (
                    venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {getVenueLabel(venue)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </EmployeeFormSection>

            <EmployeeFormSection title="Оплата" description="Модель оплаты и ставка для расчёта начислений.">
              <div className="space-y-1.5">
                <label className="block text-sm text-tg-hint">Модель оплаты</label>
                <select
                  value={editPayModel}
                  onChange={(e) => setEditPayModel(e.target.value as User['pay_model'])}
                  className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                >
                  <option value="hourly">Почасовая</option>
                  <option value="fixed_shift">Фикс за смену</option>
                  <option value="revenue">От выручки</option>
                  <option value="hybrid">Почасовая + процент</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm text-tg-hint">
                  {getRateFieldLabel(editPayModel)} <span className="ml-2 text-xs text-tg-hint/80">{getRateLabel(editPayModel)}</span>
                </label>
                <input
                  type="number"
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                  placeholder="Например: 250"
                  min="0"
                  step="0.01"
                />
              </div>

              {(editPayModel === 'revenue' || editPayModel === 'hybrid') && (
                <div className="space-y-1.5">
                  <label className="block text-sm text-tg-hint">% от выручки</label>
                  <input
                    type="number"
                    value={editRevenuePercentage}
                    onChange={(e) => setEditRevenuePercentage(e.target.value)}
                    className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                    placeholder="Например: 2"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>
              )}
            </EmployeeFormSection>

            <ManagementAccessSection
              enabled={editManagementEnabled}
              onEnabledChange={(enabled) => {
                const locked = editingUser.role === 'owner' || (editingUser.id === user.id && user.role !== 'owner');
                if (locked) {
                  return;
                }
                setEditManagementEnabled(enabled);
                setEditRole(enabled ? 'senior' : 'barista');
                setEditPermissions(enabled ? getDefaultPermissionsForRole('senior') : getEmptyManagementPermissions());
              }}
              permissions={editPermissions}
              onPermissionsChange={setEditPermissions}
              disabled={editingUser.role === 'owner' || (editingUser.id === user.id && user.role !== 'owner')}
            />

            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 bg-tg-primary text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Сохранить
                  </>
                )}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 surface-muted text-tg-text py-2.5 rounded-xl text-sm font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-tg-bg px-4 py-5">
            <p className="text-sm font-medium text-tg-text">Редактирование сотрудника</p>
            <p className="mt-1 text-sm text-tg-hint">Нажмите на иконку редактирования у нужного сотрудника.</p>
          </div>
        )}
      </div>

      <div className="surface-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Активные сотрудники</p>
            <p className="text-xs text-tg-hint">Неактивные сотрудники убраны в архив, но история и начисления сохраняются.</p>
          </div>
          <p className="text-xs text-tg-hint">Активных: {activeUsers.length}</p>
        </div>

        {activeUsers.length === 0 ? (
          <div className="rounded-2xl bg-tg-bg px-4 py-5">
            <p className="text-sm font-medium text-tg-text">Активных сотрудников пока нет</p>
            <p className="mt-1 text-sm text-tg-hint">Перенесите сотрудника из архива или добавьте нового через приглашение.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeUsers.map((u) => (
              <TeamEmployeeCard
                key={u.id}
                employee={u}
                currentUser={user}
                onEdit={startEdit}
                onToggleStatus={handleStatusChange}
                busy={statusUserId === u.id}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowArchive((value) => !value)}
          className="surface-muted w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-tg-text"
        >
          <div className="flex items-center justify-between gap-3">
            <span>Архив сотрудников</span>
            <span className="text-xs text-tg-hint">{archivedUsers.length}</span>
          </div>
        </button>

        {showArchive && (
          <div className="space-y-2.5 pt-1">
            {archivedUsers.length === 0 ? (
              <div className="rounded-2xl bg-tg-bg px-4 py-5">
                <p className="text-sm font-medium text-tg-text">Архив сотрудников пуст</p>
                <p className="mt-1 text-sm text-tg-hint">Деактивированные сотрудники появятся здесь и останутся с историей смен.</p>
              </div>
            ) : (
              archivedUsers.map((u) => (
                <TeamEmployeeCard
                  key={u.id}
                  employee={u}
                  currentUser={user}
                  archived
                  onEdit={startEdit}
                  onToggleStatus={handleStatusChange}
                  busy={statusUserId === u.id}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const POSITION_DEFAULTS: Record<User['role'], string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  senior: 'Старший смены',
  barista: 'Бариста',
  cook: 'Повар',
  senior_cook: 'Шеф-повар',
};

const PAY_MODEL_LABELS: Record<User['pay_model'], string> = {
  hourly: 'Почасовая',
  fixed_shift: 'Фикс за смену',
  revenue: 'От выручки',
  hybrid: 'Почасовая + процент',
};

const PAY_MODEL_HINTS: Record<User['pay_model'], string> = {
  hourly: '₽/час',
  fixed_shift: '₽/смена',
  revenue: 'индивидуально',
  hybrid: '₽/час + %',
};

function getPositionLabel(user: Pick<User, 'position' | 'role'>) {
  return user.position?.trim() || POSITION_DEFAULTS[user.role];
}

function getRateLabel(payModel: User['pay_model']) {
  return PAY_MODEL_HINTS[payModel];
}

function getRateFieldLabel(payModel: User['pay_model']) {
  if (payModel === 'fixed_shift') {
    return 'Ставка за смену, ₽';
  }
  if (payModel === 'hourly' || payModel === 'hybrid') {
    return 'Ставка в час, ₽';
  }
  return 'Ставка';
}

function getVenueName(venue?: Venue) {
  return venue?.name?.trim() || 'Основная точка';
}

function getVenueLabel(venue: Venue) {
  const name = getVenueName(venue);
  return venue.is_active ? name : `${name} (неактивна)`;
}

function AdjustTab({ venueId }: { venueId: string }) {
  const [userId, setUserId] = useState('');
  const [type, setType] = useState<'bonus' | 'penalty'>('bonus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await getUsers();
        setUsers(data);
      } catch {}
    };
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!userId) {
      setError('Выберите сотрудника');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Введите корректную сумму');
      return;
    }
    if (!reason.trim()) {
      setError('Укажите причину');
      return;
    }

    try {
      setLoading(true);
      await createAdjustment({
        user_id: userId,
        type,
        amount: amt,
        reason: reason.trim(),
      });
      hapticSuccess();
      setSuccess(true);
      setAmount('');
      setReason('');
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: any) {
      hapticError();
      setError(err.message || 'Ошибка при создании');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Сотрудник</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none appearance-none"
          >
            <option value="">Выберите сотрудника</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Тип</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('bonus')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                type === 'bonus' ? 'bg-emerald-500 text-white' : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              <Gift className="w-4 h-4" />
              Бонус
            </button>
            <button
              type="button"
              onClick={() => setType('penalty')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                type === 'penalty' ? 'bg-rose-500 text-white' : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Удержание
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Сумма (₽)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Например: 500"
            min="0"
            step="0.01"
            className="w-full bg-white text-[#111827] rounded-xl px-4 py-3 text-sm outline-none border border-black/5 placeholder:text-gray-400 focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Причина</label>
          <p className="mb-1.5 text-xs text-tg-hint">
            {type === 'bonus'
              ? 'Например: премия за смену, выход в выходной, помощь команде'
              : 'Например: аванс, покупка зерна, дриппы в счёт зарплаты'}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              type === 'bonus'
                ? 'Например: премия за смену, выход в выходной, помощь команде'
                : 'Например: зерно домой, аванс, дриппы'
            }
            rows={2}
            className="w-full bg-white text-[#111827] rounded-xl px-4 py-3 text-sm outline-none resize-none border border-black/5 placeholder:text-gray-400"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">Создано</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-tg-primary text-white py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
              {loading ? (
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  {type === 'bonus' ? <Gift className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {type === 'bonus' ? 'Добавить бонус' : 'Добавить удержание'}
                </>
              )}
            </button>
      </form>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  venue_updated: 'Точка обновлена',
  user_updated: 'Сотрудник обновлён',
  shift_approved: 'Смена утверждена',
  shift_rejected: 'Смена отклонена',
  shift_updated: 'Смена отредактирована',
  shift_created: 'Создал смену',
  shift_edited: 'Отредактировал смену',
  user_created: 'Создал сотрудника',
  bonus_added: 'Начислил бонус',
  penalty_added: 'Добавил удержание',
};

function AuditTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const data = await getAuditLogs(1, 50);
        setLogs(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-tg-secondary-bg rounded-xl" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="surface-card rounded-2xl px-4 py-10 text-center">
        <History className="w-12 h-12 text-tg-hint mx-auto mb-3 opacity-50" />
        <p className="text-sm font-medium text-tg-text">История действий пока пуста</p>
        <p className="mt-1 text-xs text-tg-hint">Когда здесь появятся изменения, они будут сгруппированы по датам.</p>
      </div>
    );
  }

  const groupedLogs = logs.reduce<Record<string, AuditLog[]>>((acc, log) => {
    const dateKey = (() => {
      const parsed = new Date(log.created_at);
      if (Number.isNaN(parsed.getTime())) {
        return 'Без даты';
      }
      return parsed.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    })();
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(log);
    return acc;
  }, {});

  return (
    <div className="space-y-4 pb-6">
      <div className="surface-card rounded-2xl p-4">
        <p className="text-sm font-medium text-tg-text">История действий</p>
        <p className="mt-1 text-sm text-tg-hint">Изменения сгруппированы по датам, чтобы было проще просматривать события команды.</p>
      </div>

      <div className="surface-card rounded-2xl p-4 space-y-4">
        {Object.entries(groupedLogs).map(([dateLabel, items]) => (
          <div key={dateLabel} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-tg-text">{dateLabel}</p>
              <p className="text-xs text-tg-hint">{items.length}</p>
            </div>

            <div className="space-y-2">
              {items.map((log) => {
                const isEmphasis = log.action.includes('approved') || log.action.includes('created') || log.action.includes('updated');
                const tone = log.action.includes('penalty') || log.action.includes('rejected')
                  ? 'rose'
                  : log.action.includes('bonus')
                    ? 'emerald'
                    : 'blue';
                const label = ACTION_LABELS[log.action] || 'Действие';
                return (
                  <div
                    key={log.id}
                    className="surface-muted rounded-2xl p-3 flex items-start gap-3"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      tone === 'rose'
                        ? 'bg-rose-50 dark:bg-rose-900/20'
                        : tone === 'emerald'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20'
                          : 'bg-blue-50 dark:bg-blue-900/20'
                    }`}>
                      {tone === 'rose' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                      ) : tone === 'emerald' ? (
                        <Gift className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <History className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-tg-text">
                        <span className={`font-medium ${isEmphasis ? 'text-tg-text' : ''}`}>{log.user_name || 'Пользователь'}</span>{' '}
                        <span className="text-tg-hint">{label}</span>
                        {log.target_user_name && (
                          <> <span className="text-tg-hint">для</span> <span className="font-medium">{log.target_user_name}</span></>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-tg-hint">
                        {new Date(log.created_at).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
