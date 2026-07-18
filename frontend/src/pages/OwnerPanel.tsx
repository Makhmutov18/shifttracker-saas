import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calculator,
  Check,
  CheckCircle,
  ChevronRight,
  Copy,
  Gift,
  History,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  UserPlus,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import {
  AdminCreateUserResponse,
  AuditLog,
  PayrollPreview,
  PayrollRunDetail,
  PayrollRunItem,
  PayrollRunListItem,
  Shift,
  User,
  Venue,
  VenueStatsRow,
  createAdjustment,
  createUser,
  createVenue,
  createPayrollRun,
  cancelPayrollRun,
  createPayrollPayment,
  deactivateVenue,
  deleteUser,
  getAuditLogs,
  getActiveVenues,
  getPendingShifts,
  getPayrollRun,
  getPayrollRunPreview,
  getPayrollRuns,
  finalizePayrollRun,
  getUsers,
  getVenues,
  getVenueStats,
  updateShift,
  updatePayrollRunRevenue,
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
  venue_id: string;
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
    <div className="owner-permissions-list">
      {MANAGEMENT_PERMISSION_OPTIONS.map(({ key, label }) => (
        <label
          key={key}
          className={`owner-permission-row ${disabled ? 'opacity-60' : ''}`}
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
    <div className="owner-form-section space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-tg-text">Доступ к управлению</p>
        <p className="text-xs text-tg-hint">Выберите уровень доступа сотрудника.</p>
      </div>

      <div className="owner-segmented-control owner-management-access-control" role="group" aria-label="Доступ к управлению">
        <button
          type="button"
          aria-pressed={!enabled}
          data-active={!enabled}
          disabled={disabled}
          onClick={() => {
            if (enabled) onEnabledChange(false);
          }}
        >
          Обычный сотрудник
        </button>
        <button
          type="button"
          aria-pressed={enabled}
          data-active={enabled}
          disabled={disabled}
          onClick={() => {
            if (!enabled) onEnabledChange(true);
          }}
        >
          Доступ к управлению
        </button>
      </div>

      <p className="owner-section-note">
        {enabled
          ? 'Получает доступ к разделу управления командой'
          : 'Видит только свои смены, историю и профиль'}
      </p>

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
    <div className="owner-form-section space-y-3">
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

function EmployeeStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="owner-inline-stat">
      <span>{label}</span>
      <strong>{value}</strong>
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
  const hasManagementAccess = canAccessOwnerPanel(employee);
  const managementRoleLabel = getManagementRoleLabel(employee);
  const showRoleBadge = managementRoleLabel === 'Старший'
    || managementRoleLabel === 'Администратор'
    || managementRoleLabel === 'Владелец';
  const hasRevenueShare = (employee.pay_model === 'revenue' || employee.pay_model === 'hybrid')
    && Number(employee.revenue_percentage) > 0;

  return (
    <article className="owner-employee-card" data-archived={archived ? 'true' : 'false'}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <UserAvatar
            name={employee.name || 'Сотрудник'}
            photoUrl={employee.telegram_photo_url}
            sizeClassName="h-10 w-10"
            textClassName="text-xs"
          />
          <div className="min-w-0 flex-1">
            <div className="owner-employee-heading">
              <p>{employee.name || 'Сотрудник'}</p>
              {archived && <span className="owner-status-badge" data-status="archived">В архиве</span>}
            </div>
            <p className="owner-employee-position">{getPositionLabel(employee)}</p>
            {(showRoleBadge || hasManagementAccess) && (
              <div className="owner-employee-badges" aria-label="Роль и доступ">
                {showRoleBadge && <span className="owner-employee-badge">{managementRoleLabel}</span>}
                {hasManagementAccess && (
                  <span className="owner-employee-badge" data-access="management">
                    Управление
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onEdit(employee)}
          className="owner-icon-button"
          aria-label={`Редактировать ${employee.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="owner-employee-details">
        <p><span>Основная точка</span><span className="owner-employee-value">{getShortVenueLabel(employee.venue)}</span></p>
        <p>
          <span>Оплата</span>
          <span className="owner-employee-value owner-employee-pay">
            <small>{getPayModelLabel(employee.pay_model)}</small>
            <b>{getPayRateLabel(employee)}{hasRevenueShare ? ` + ${employee.revenue_percentage}%` : ''}</b>
          </span>
        </p>
      </div>

      <div className="owner-danger-zone">
        {!isSelf ? (
          <button
            type="button"
            onClick={() => onToggleStatus(employee)}
            disabled={busy}
            className="owner-status-action"
            data-action={archived ? 'restore' : 'archive'}
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
          <span className="owner-self-label">
            Это вы
          </span>
        )}
      </div>
    </article>
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
  const [tab, setTab] = useState<Tab | null>(initialTab ?? null);
  const canApprove = hasPermission(user, 'can_approve_shifts') || hasPermission(user, 'can_edit_team_shifts');
  const canManageTeam = hasPermission(user, 'can_manage_team');
  const canManageAdjustments = hasPermission(user, 'can_manage_adjustments');
  const canViewPayroll = hasPermission(user, 'can_view_team_payroll');
  const canCreatePayroll = user.role === 'owner' || user.role === 'admin';
  const canViewAudit = canManageTeam;

  const visibleTabs: { id: Tab; label: string; description: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: 'invite', label: 'Приглашение', description: 'Добавить сотрудника и настроить доступ', icon: <UserPlus />, visible: canManageTeam },
    { id: 'approve', label: 'Подтверждение смен', description: 'Проверить новые смены команды', icon: <CheckCircle />, visible: canApprove },
    { id: 'adjust', label: 'Бонусы и удержания', description: 'Добавить корректировку начислений', icon: <Gift />, visible: canManageAdjustments },
    { id: 'audit', label: 'История действий', description: 'Посмотреть изменения в команде', icon: <History />, visible: canViewAudit },
    { id: 'team', label: 'Команда', description: 'Сотрудники, ставки и права', icon: <Users />, visible: canManageTeam },
    { id: 'venues', label: 'Точки', description: 'Рабочие точки и архив', icon: <Building2 />, visible: canManageTeam },
    { id: 'payroll', label: 'Расчёты', description: 'Начисления и фактические выплаты', icon: <Calculator />, visible: canViewPayroll },
  ];

  const activeTabs = visibleTabs.filter((item) => item.visible);

  useEffect(() => {
    if (tab && !activeTabs.some((item) => item.id === tab)) {
      setTab(null);
    }
  }, [activeTabs, tab]);

  useEffect(() => {
    if (!initialTab) {
      return;
    }
    setTab(activeTabs.some((item) => item.id === initialTab) ? initialTab : null);
    onInitialTabConsumed?.();
  }, [activeTabs, initialTab, onInitialTabConsumed]);

  const activeTab = tab ? activeTabs.find((item) => item.id === tab) ?? null : null;

  return (
    <div className="owner-panel-page mx-auto max-w-lg px-4 pb-5 pt-5">
      <div key={activeTab?.id ?? 'hub'} className="owner-panel-view">
        {activeTab ? (
          <header className="owner-section-header">
            <button type="button" className="owner-section-back" onClick={() => setTab(null)} aria-label="Вернуться к управлению">
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1>{activeTab.label}</h1>
              <p>{activeTab.description}</p>
            </div>
          </header>
        ) : (
          <header className="owner-hub-header">
            <div>
              <h1>Управление</h1>
              <p>Команда, смены и начисления</p>
            </div>
          </header>
        )}

        {!activeTab ? (
          activeTabs.length > 0 ? (
            <nav className="owner-management-hub" aria-label="Разделы управления">
              {activeTabs.map((item) => (
                <button key={item.id} type="button" onClick={() => setTab(item.id)}>
                  <span className="owner-hub-row-icon" aria-hidden="true">{item.icon}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-tg-hint" aria-hidden="true" />
                </button>
              ))}
            </nav>
          ) : (
            <div className="owner-empty-state">Доступных разделов управления нет</div>
          )
        ) : (
          <OwnerPanelBoundary>
            {tab === 'invite' && canManageTeam && <InviteTab />}
            {tab === 'approve' && canApprove && <ApproveTab />}
            {tab === 'adjust' && canManageAdjustments && <AdjustTab user={user} />}
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
        )}
      </div>
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

function parseDisplayDate(value?: string | null) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPayrollPeriod(periodStart?: string | null, periodEnd?: string | null) {
  const start = parseDisplayDate(periodStart);
  const end = parseDisplayDate(periodEnd);
  if (!start || !end) return 'период не указан';

  const yearsDiffer = start.getFullYear() !== end.getFullYear();
  const formatPart = (date: Date) => date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(yearsDiffer ? { year: 'numeric' as const } : {}),
  });
  return `${formatPart(start)} — ${formatPart(end)}`;
}

function getPayrollRunDisplayTitle(run: Pick<PayrollRunListItem, 'title' | 'period_start' | 'period_end'>) {
  const title = run.title?.trim();
  if (title && !/^payroll\b/i.test(title)) return title;
  return `Расчёт за ${formatPayrollPeriod(run.period_start, run.period_end)}`;
}

function formatCreatedAt(value?: string | null) {
  const date = parseDisplayDate(value);
  if (!date) return null;
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parsePayrollRevenue(value: string): number | null | undefined {
  const normalized = value.replace(/\s/g, '').replace(',', '.').trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function formatPayrollShare(value?: string | number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function PayrollRunsTab({ canCreate, userVenueId, restrictToVenue }: { canCreate: boolean; userVenueId: string; restrictToVenue: boolean }) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = now.toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [venueId, setVenueId] = useState('');
  const [revenueInput, setRevenueInput] = useState('');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [revenueSaving, setRevenueSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paymentItem, setPaymentItem] = useState<PayrollRunItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentComment, setPaymentComment] = useState('');
  const [revenueEditOpen, setRevenueEditOpen] = useState(false);
  const [revenueDraft, setRevenueDraft] = useState('');
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const selectedPreviewVenueName = venueId
    ? venues.find((venue) => venue.id === venueId)?.name || 'Точка не указана'
    : 'Несколько точек';
  const previewRevenue = venueId ? parsePayrollRevenue(revenueInput) : null;
  const previewPayrollShare = preview && previewRevenue != null && previewRevenue > 0
    ? Number(preview.total_amount || 0) / previewRevenue * 100
    : null;

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

  useEffect(() => {
    if (!venueId) setRevenueInput('');
  }, [venueId]);

  const handlePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPreview(null);
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      setError('Проверьте даты периода.');
      return;
    }
    if (venueId && parsePayrollRevenue(revenueInput) === undefined) {
      setError('Введите выручку числом не меньше нуля или оставьте поле пустым.');
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
    if (venueId && previewRevenue === undefined) {
      setError('Введите выручку числом не меньше нуля или оставьте поле пустым.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      setSaving(true);
      await createPayrollRun({
        period_start: periodStart,
        period_end: periodEnd,
        venue_id: venueId || undefined,
        ...(venueId && previewRevenue != null ? { revenue_total: previewRevenue } : {}),
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
    setRevenueEditOpen(false);
    setRevenueError(null);
    try {
      setDetailsLoading(true);
      setSelectedRun(await getPayrollRun(runId));
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setDetailsLoading(false);
    }
  };

  const refreshSelectedRun = async (runId: string) => {
    const updated = await getPayrollRun(runId);
    setSelectedRun(updated);
    await loadRuns();
    return updated;
  };

  const openRevenueEditor = () => {
    if (!selectedRun || selectedRun.status !== 'draft' || !selectedRun.venue_id) return;
    setRevenueDraft(selectedRun.revenue_total == null ? '' : String(selectedRun.revenue_total));
    setRevenueError(null);
    setRevenueEditOpen(true);
  };

  const saveRevenue = async (clear = false) => {
    if (!selectedRun || !canCreate || selectedRun.status !== 'draft' || !selectedRun.venue_id) return;
    const nextRevenue = clear ? null : parsePayrollRevenue(revenueDraft);
    if (nextRevenue === undefined) {
      setRevenueError('Введите выручку числом не меньше нуля.');
      hapticError();
      return;
    }
    setRevenueError(null);
    setError(null);
    setSuccess(null);
    try {
      setRevenueSaving(true);
      const updated = await updatePayrollRunRevenue(selectedRun.id, nextRevenue);
      setSelectedRun(updated);
      setRevenueEditOpen(false);
      setRevenueDraft('');
      await loadRuns();
      setSuccess(nextRevenue == null ? 'Выручка удалена из черновика.' : 'Выручка за период сохранена.');
      hapticSuccess();
    } catch (err) {
      setRevenueError(getPayrollRunError(err));
      hapticError();
    } finally {
      setRevenueSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedRun || !canCreate || selectedRun.status !== 'draft') return;
    if (!window.confirm('Зафиксировать расчёт? После этого изменения смен не повлияют на сохранённые суммы.')) return;
    setError(null);
    setSuccess(null);
    try {
      setActionLoading(true);
      await finalizePayrollRun(selectedRun.id);
      await refreshSelectedRun(selectedRun.id);
      setSuccess('Расчёт зафиксирован.');
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedRun || !canCreate || selectedRun.status !== 'draft') return;
    if (!window.confirm('Отменить расчёт? Он останется в истории и не будет доступен для оплаты.')) return;
    setError(null);
    setSuccess(null);
    try {
      setActionLoading(true);
      await cancelPayrollRun(selectedRun.id);
      await refreshSelectedRun(selectedRun.id);
      setSuccess('Расчёт отменён.');
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const openPaymentForm = (item: PayrollRunItem) => {
    setPaymentItem(item);
    setPaymentAmount(String(item.remaining_amount || '0'));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('');
    setPaymentComment('');
    setError(null);
    setSuccess(null);
  };

  const handlePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRun || !paymentItem || !canCreate || selectedRun.status !== 'finalized') return;
    const amount = Number(paymentAmount);
    const remaining = Number(paymentItem.remaining_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Введите сумму выплаты больше нуля.');
      return;
    }
    if (amount > remaining) {
      setError('Сумма выплаты не может быть больше остатка.');
      return;
    }
    if (!paymentDate) {
      setError('Укажите дату выплаты.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      setActionLoading(true);
      await createPayrollPayment(selectedRun.id, {
        user_id: paymentItem.user_id,
        amount,
        payment_date: paymentDate,
        method: paymentMethod.trim() || undefined,
        comment: paymentComment.trim() || undefined,
      });
      await refreshSelectedRun(selectedRun.id);
      setPaymentItem(null);
      setSuccess('Выплата записана.');
    } catch (err) {
      setError(getPayrollRunError(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="owner-payroll-page pb-6">
      <section className="owner-payroll-create surface-card">
        <div>
          <h2 className="text-base font-semibold text-tg-text">Расчёты выплат</h2>
          <p className="mt-1 text-sm text-tg-hint">Сформируйте расчёт начислений за выбранный период</p>
        </div>
        <form onSubmit={handlePreview} className="owner-payroll-form">
          <div className="owner-date-grid">
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
              onChange={(event) => {
                setVenueId(event.target.value);
                setPreview(null);
              }}
              className="mt-1.5 w-full appearance-none rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none"
            >
              <option value="">Все точки</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
          </label>
          {venueId ? (
            <label className="block text-xs text-tg-hint">
              Выручка точки за период <span>(необязательно)</span>
              <input
                type="text"
                inputMode="decimal"
                value={revenueInput}
                onChange={(event) => setRevenueInput(event.target.value)}
                placeholder="Например: 850 000"
                className="mt-1.5 w-full rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none placeholder:text-tg-hint"
              />
              <span className="owner-payroll-field-help">Используется только для расчёта доли ФОТ и не влияет на начисления сотрудникам.</span>
            </label>
          ) : (
            <p className="owner-payroll-field-help">Выручка указывается в расчёте по конкретной точке.</p>
          )}
          <button
            type="submit"
            disabled={previewLoading}
            className="owner-payroll-primary"
          >
            {previewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Предварительный расчёт
          </button>
        </form>
      </section>

      {error && <div className="surface-card rounded-xl p-3 text-sm text-rose-600 dark:text-rose-200">{error}</div>}
      {success && <div className="surface-card rounded-xl p-3 text-sm text-emerald-600 dark:text-emerald-200">{success}</div>}

      {preview && (
        <section className="owner-payroll-preview surface-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-tg-text">Предварительный расчёт</h3>
              <p className="mt-1 text-xs text-tg-hint">{formatPayrollPeriod(preview.period_start, preview.period_end)}</p>
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
          <div className="owner-payroll-preview-summary">
            <div><p>Сотрудники</p><strong>{preview.employees_count}</strong></div>
            <div><p>Смены</p><strong>{preview.shifts_count}</strong></div>
            <div><p>Часы</p><strong>{formatHours(preview.total_hours)}</strong></div>
            <div><p>Начислено</p><strong>{formatCurrency(preview.total_amount)}</strong></div>
          </div>
          {previewRevenue !== null && previewRevenue !== undefined && (
            <div className="owner-payroll-economics">
              <p>Экономика периода</p>
              <dl>
                <div><dt>ФОТ</dt><dd>{formatCurrency(preview.total_amount)}</dd></div>
                <div><dt>Выручка</dt><dd>{formatCurrency(previewRevenue)}</dd></div>
                <div><dt>Доля ФОТ</dt><dd>{previewPayrollShare == null ? '—' : formatPayrollShare(previewPayrollShare)}</dd></div>
              </dl>
            </div>
          )}
          <div className="owner-payroll-adjustments">
            <span>База <b>{formatCurrency(preview.total_base_amount)}</b></span>
            <span>Бонусы <b>{formatCurrency(preview.total_bonuses)}</b></span>
            <span data-deduction={Number(preview.total_deductions || 0) > 0}>Удержания <b>{Number(preview.total_deductions || 0) > 0 ? '−' : ''}{formatCurrency(preview.total_deductions)}</b></span>
          </div>
          {preview.rows.length === 0 ? (
            <div className="surface-muted rounded-xl px-4 py-6 text-center text-sm text-tg-hint">За выбранный период начислений нет</div>
          ) : (
            <div className="owner-payroll-preview-list">
              {preview.rows.map((row) => (
                <div key={row.user_id} className="owner-payroll-preview-row">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-tg-text">{row.user_name || 'Сотрудник'}</p>
                      <p className="mt-1 text-xs text-tg-hint">{row.venue_name || selectedPreviewVenueName}</p>
                    </div>
                    <p className="owner-money-value shrink-0 text-sm font-semibold text-tg-text">{formatCurrency(row.total_amount)}</p>
                  </div>
                  <div className="owner-payroll-row-breakdown">
                    <span>{row.shifts_count} смен · {formatHours(row.total_hours)}</span>
                    <span>База {formatCurrency(row.base_amount)}</span>
                    <span>Бонусы {formatCurrency(row.bonuses)}</span>
                    <span data-deduction={Number(row.deductions || 0) > 0}>Удержания {Number(row.deductions || 0) > 0 ? '−' : ''}{formatCurrency(row.deductions)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="owner-payroll-runs-section">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-tg-text">Сохранённые расчёты</h3>
          <button type="button" onClick={loadRuns} className="text-xs font-medium text-tg-primary">Обновить</button>
        </div>
        {loading ? (
          <div className="animate-pulse space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl surface-card" />)}</div>
        ) : runs.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-8 text-center text-sm text-tg-hint">Расчётов пока нет</div>
        ) : (
          <div className="owner-payroll-runs-list">
          {runs.map((run) => {
            const remaining = Math.max(0, Number(run.total_amount || 0) - Number(run.total_paid || 0));
            return (
            <button
              key={run.id}
              type="button"
              onClick={() => handleOpenDetails(run.id)}
              className="owner-payroll-run surface-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tg-text">{getPayrollRunDisplayTitle(run)}</p>
                  <p className="mt-1 text-xs text-tg-hint">{run.venue_name || 'Все точки'} · {formatPayrollPeriod(run.period_start, run.period_end)}</p>
                </div>
                <span className="owner-status-badge shrink-0" data-status={run.status}>{getPayrollRunStatusLabel(run.status)}</span>
              </div>
              <div className="owner-payroll-run-facts">
                <span>Сотрудники <b>{run.employees_count}</b></span>
                <span>Начислено <b>{formatCurrency(run.total_amount)}</b></span>
                <span>Выплачено <b>{formatCurrency(run.total_paid)}</b></span>
                <span data-remaining={remaining > 0}>Осталось <b>{formatCurrency(remaining)}</b></span>
              </div>
              {run.payroll_share_percent != null && (
                <p className="owner-payroll-run-share">ФОТ {formatPayrollShare(run.payroll_share_percent)}</p>
              )}
              <p className="mt-3 text-[11px] text-tg-hint">
                {formatCreatedAt(run.created_at) ? `Создано: ${formatCreatedAt(run.created_at)} · ${run.created_by_name || 'Пользователь'}` : 'Дата создания не указана'}
              </p>
            </button>
            );
          })}
          </div>
        )}
      </section>

      {detailsLoading && <div className="surface-card rounded-2xl p-4 text-sm text-tg-hint">Загружаем детали…</div>}
      {selectedRun && !detailsLoading && (
        <section className="owner-payroll-details surface-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-tg-text">{getPayrollRunDisplayTitle(selectedRun)}</h3>
              <p className="mt-1 text-xs text-tg-hint">{formatPayrollPeriod(selectedRun.period_start, selectedRun.period_end)} · {selectedRun.venue_name || 'Все точки'}</p>
            </div>
            <button type="button" onClick={() => setSelectedRun(null)} className="text-xs text-tg-hint">Закрыть</button>
          </div>
          {canCreate && selectedRun.status === 'draft' && (
            <div className="flex flex-col gap-2 border-t border-tg-hint/10 pt-3 sm:flex-row">
              <button
                type="button"
                onClick={handleFinalize}
                disabled={actionLoading}
                className="flex-1 rounded-xl bg-tg-primary px-3 py-2.5 text-xs font-semibold text-tg-button-text disabled:opacity-60"
              >
                {actionLoading ? 'Сохраняем…' : 'Зафиксировать расчёт'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 rounded-xl surface-muted px-3 py-2.5 text-xs font-semibold text-tg-text disabled:opacity-60"
              >
                Отменить расчёт
              </button>
            </div>
          )}
          <div className="owner-payroll-detail-status">
            <span className="owner-status-badge" data-status={selectedRun.status}>{getPayrollRunStatusLabel(selectedRun.status)}</span>
            <span>{selectedRun.employees_count} сотрудников</span>
          </div>
          <div className="owner-payroll-totals">
            <div><p>Начислено</p><strong>{formatCurrency(selectedRun.total_amount)}</strong></div>
            <div><p>Выплачено</p><strong>{formatCurrency(selectedRun.total_paid)}</strong></div>
            <div data-remaining={(selectedRun.items || []).some((item) => Number(item.remaining_amount || 0) > 0)}><p>Осталось</p><strong>{formatCurrency((selectedRun.items || []).reduce((total, item) => total + Number(item.remaining_amount || 0), 0))}</strong></div>
          </div>
          {selectedRun.venue_id && (
            <div className="owner-payroll-economics owner-payroll-saved-economics">
              <div className="owner-payroll-economics-heading">
                <p>Экономика периода</p>
                {canCreate && selectedRun.status === 'draft' && !revenueEditOpen && (
                  <button type="button" onClick={openRevenueEditor}>
                    {selectedRun.revenue_total == null ? 'Указать выручку' : 'Изменить'}
                  </button>
                )}
              </div>
              {revenueEditOpen && canCreate && selectedRun.status === 'draft' ? (
                <div className="owner-payroll-revenue-editor">
                  <label className="text-xs text-tg-hint">
                    Выручка точки за период
                    <input
                      type="text"
                      inputMode="decimal"
                      value={revenueDraft}
                      onChange={(event) => setRevenueDraft(event.target.value)}
                      placeholder="Например: 850 000"
                      disabled={revenueSaving}
                    />
                  </label>
                  {revenueError && <p className="owner-payroll-inline-error">{revenueError}</p>}
                  <div className="owner-payroll-revenue-actions">
                    <button type="button" className="owner-payroll-primary" onClick={() => void saveRevenue(false)} disabled={revenueSaving}>
                      {revenueSaving ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                    {selectedRun.revenue_total != null && (
                      <button type="button" onClick={() => void saveRevenue(true)} disabled={revenueSaving}>Удалить</button>
                    )}
                    <button type="button" onClick={() => { setRevenueEditOpen(false); setRevenueError(null); }} disabled={revenueSaving}>Отмена</button>
                  </div>
                </div>
              ) : selectedRun.revenue_total != null ? (
                <dl>
                  <div><dt>ФОТ</dt><dd>{formatCurrency(selectedRun.total_amount)}</dd></div>
                  <div><dt>Выручка</dt><dd>{formatCurrency(selectedRun.revenue_total)}</dd></div>
                  <div><dt>Доля ФОТ</dt><dd>{formatPayrollShare(selectedRun.payroll_share_percent)}</dd></div>
                </dl>
              ) : (
                <p className="owner-payroll-economics-empty">
                  {selectedRun.status === 'draft' ? 'Выручка за период ещё не указана' : 'Выручка не была зафиксирована'}
                </p>
              )}
            </div>
          )}
          <div className="owner-payroll-items">
            {(selectedRun.items || []).map((item) => (
              <div key={item.id} className="owner-payroll-item">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-tg-text">{item.user_name || 'Сотрудник'}</p>
                  <p className="owner-money-value text-sm font-semibold text-tg-text">{formatCurrency(item.final_amount)}</p>
                </div>
                <p className="mt-1 text-xs text-tg-hint">{item.approved_shifts_count} смен · {formatHours(item.approved_hours)}</p>
                <div className="owner-payroll-item-breakdown">
                  <span>База <b>{formatCurrency(item.base_amount)}</b></span>
                  <span>Бонусы <b>{formatCurrency(item.bonus_amount)}</b></span>
                  <span data-deduction={Number(item.deduction_amount || 0) > 0}>Удержания <b>{Number(item.deduction_amount || 0) > 0 ? '−' : ''}{formatCurrency(item.deduction_amount)}</b></span>
                  <span>Начислено <b>{formatCurrency(item.final_amount)}</b></span>
                  <span>Выплачено <b>{formatCurrency(item.paid_amount)}</b></span>
                  <span data-remaining={Number(item.remaining_amount || 0) > 0}>Осталось <b>{formatCurrency(item.remaining_amount)}</b></span>
                </div>
                {canCreate && selectedRun.status === 'finalized' && Number(item.remaining_amount || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => openPaymentForm(item)}
                    disabled={actionLoading}
                    className="mt-3 w-full rounded-xl bg-tg-primary px-3 py-2.5 text-xs font-semibold text-tg-button-text disabled:opacity-60"
                  >
                    Записать выплату
                  </button>
                )}
              </div>
            ))}
          </div>
          {paymentItem && selectedRun.status === 'finalized' && canCreate && (
            <form onSubmit={handlePayment} className="owner-payroll-payment-form">
              <div>
                <h4 className="text-sm font-semibold text-tg-text">Записать выплату</h4>
                <p className="mt-1 text-xs text-tg-hint">{paymentItem.user_name || 'Сотрудник'} · остаток {formatCurrency(paymentItem.remaining_amount)}</p>
              </div>
              <label className="block text-xs text-tg-hint">
                Сумма
                <input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1.5 w-full rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none" disabled={actionLoading} />
              </label>
              <label className="block text-xs text-tg-hint">
                Дата выплаты
                <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1.5 w-full rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none" disabled={actionLoading} />
              </label>
              <label className="block text-xs text-tg-hint">
                Способ выплаты <span className="text-tg-hint">(необязательно)</span>
                <input type="text" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="Например: наличные или перевод" className="mt-1.5 w-full rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none placeholder:text-tg-hint" disabled={actionLoading} />
              </label>
              <label className="block text-xs text-tg-hint">
                Комментарий <span className="text-tg-hint">(необязательно)</span>
                <textarea value={paymentComment} onChange={(event) => setPaymentComment(event.target.value)} placeholder="Комментарий к выплате" rows={2} className="mt-1.5 w-full resize-none rounded-xl bg-tg-secondary-bg px-3 py-2.5 text-sm text-tg-text outline-none placeholder:text-tg-hint" disabled={actionLoading} />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={actionLoading} className="flex-1 rounded-xl bg-tg-primary px-3 py-2.5 text-xs font-semibold text-tg-button-text disabled:opacity-60">{actionLoading ? 'Сохраняем…' : 'Записать выплату'}</button>
                <button type="button" onClick={() => setPaymentItem(null)} disabled={actionLoading} className="rounded-xl surface-card px-3 py-2.5 text-xs font-semibold text-tg-text disabled:opacity-60">Отмена</button>
              </div>
            </form>
          )}
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
      <form onSubmit={handleSubmit} className="owner-form-surface space-y-3">
        <EmployeeFormSection title="Основное">
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
            <label className="block text-sm text-tg-hint mb-1.5">Основная точка</label>
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
          className="owner-primary-action w-full"
        >
          {loading ? (
            <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Сгенерировать инвайт
            </>
          )}
        </button>
      </form>

      {result && (
        <div className="surface-card rounded-xl p-4 space-y-3">
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
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [savingShiftId, setSavingShiftId] = useState<string | null>(null);

  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const safeUserNames = userNames ?? {};
  const safeVenues = Array.isArray(venues) ? venues : [];
  const venueNames = safeVenues.reduce<Record<string, string>>((acc, venue) => {
    if (venue?.id) acc[venue.id] = venue.name || 'Точка не указана';
    return acc;
  }, {});
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
    venue_id: shift.venue_id || '',
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
      const [shiftsResult, usersResult, venuesResult] = await Promise.allSettled([
        getPendingShifts(),
        getUsers(true),
        getActiveVenues(),
      ]);

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
      } else {
        setUserNames({});
      }
      setVenues(venuesResult.status === 'fulfilled' && Array.isArray(venuesResult.value) ? venuesResult.value : []);
    } catch (err: any) {
      setShifts([]);
      setUserNames({});
      setVenues([]);
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
        venue_id: draft.venue_id || undefined,
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
      <div className="owner-empty-state owner-approval-empty">
        <p className="text-sm font-medium text-tg-text">Смен на подтверждении нет</p>
        <p className="mt-1 text-sm text-tg-hint">Новые заявки сотрудников появятся здесь.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="owner-summary-panel">
        <div>
          <p className="text-sm font-medium text-tg-text">Ожидают решения</p>
          <p className="mt-1 text-sm text-tg-hint">Проверьте время, точку и начисление перед подтверждением.</p>
        </div>

        <div className="owner-inline-stats">
          <EmployeeStat label="Смен" value={safeShifts.length} />
          <EmployeeStat label="Сотрудников" value={pendingEmployeesCount} />
          <EmployeeStat label="Предварительно" value={formatCurrency(preliminaryAmount)} />
        </div>

        <div className="owner-summary-footer">
          <p>Смены обновляются автоматически</p>
          <button
            onClick={fetchShifts}
            className="owner-text-button"
          >
            <RefreshCw className="w-3 h-3" />
            Обновить
          </button>
        </div>
      </section>

      {safeShifts.map((shift, index) => {
        const shiftId = shift?.id || `pending-${index}`;
        const isEditing = editingShiftId === shiftId && Boolean(draft);
        const isSaving = savingShiftId === shiftId;
        const employeeName =
          (shift?.user_id && safeUserNames[shift.user_id]) ||
          'Сотрудник не указан';
        const venueName =
          shift?.venue_name?.trim() ||
          (shift?.venue_id && venueNames[shift.venue_id]) ||
          'Точка не указана';
        const revenueLabel = getShiftRevenue(shift?.revenue);
        const commentText = typeof shift?.comment === 'string' && shift.comment.trim() ? shift.comment.trim() : 'Комментария нет';

        return (
          <article key={shiftId} className="owner-approval-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-tg-text">{employeeName}</p>
                  <span className="owner-status-badge" data-status="pending">
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

            <div className="owner-approval-facts">
              <p><span>Время</span><strong>{getShiftFallbackTimeText(shift)}</strong></p>
              <p><span>Часы</span><strong>{getShiftHours(shift?.total_hours)}</strong></p>
              <p><span>Выручка</span><strong>{revenueLabel || 'Не указана'}</strong></p>
            </div>

            {isEditing ? (
              <div className="owner-edit-panel">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Начало</label>
                    <input
                      type="time"
                      value={draft?.start_time ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, start_time: e.target.value } : prev))}
                      className="owner-field-control"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Конец</label>
                    <input
                      type="time"
                      value={draft?.end_time ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, end_time: e.target.value } : prev))}
                      className="owner-field-control"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Точка смены</label>
                    <select
                      value={draft?.venue_id ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, venue_id: e.target.value } : prev))}
                      className="owner-field-control"
                    >
                      {safeVenues.length === 0 && (
                        <option value={draft?.venue_id ?? ''}>{venueName}</option>
                      )}
                      {safeVenues.map((venue) => (
                        <option key={venue.id} value={venue.id}>{venue.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-tg-hint">Выручка</label>
                    <input
                      type="number"
                      value={draft?.revenue ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, revenue: e.target.value } : prev))}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="owner-field-control"
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
                    className="owner-field-control resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(shiftId)}
                    disabled={isSaving}
                    className="flex-1 bg-tg-primary text-tg-button-text py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isSaving ? (
                      <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
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
                    className="owner-secondary-action flex-1"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <p className="owner-comment">{commentText}</p>
            )}

            {!isEditing && Boolean(shift?.id) && (
              <button
                onClick={() => startEdit(shift)}
                className="owner-secondary-action w-full"
              >
                <Pencil className="w-4 h-4" />
                Исправить перед утверждением
              </button>
            )}

            <div className="owner-approval-actions">
              <button
                onClick={() => handleApprove(shiftId)}
                disabled={!shift?.id || isSaving || Boolean(editingShiftId === shiftId && draft)}
                className="owner-primary-action flex-1"
              >
                <CheckCircle className="w-4 h-4" />
                Утвердить
              </button>
              <button
                onClick={() => handleReject(shiftId)}
                disabled={!shift?.id || isSaving}
                className="owner-reject-action flex-1"
              >
                <XCircle className="w-4 h-4" />
                Отклонить
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function VenuesTab() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [venueStats, setVenueStats] = useState<VenueStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
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
      setStatsError(false);
      const now = new Date();
      const [venuesData, usersData, statsData] = await Promise.allSettled([
        getVenues(true),
        getUsers(true),
        getVenueStats(now.getMonth() + 1, now.getFullYear(), true),
      ]);
      if (venuesData.status === 'fulfilled') {
        setVenues(Array.isArray(venuesData.value) ? venuesData.value : []);
      } else {
        setVenues([]);
        setError('Не удалось загрузить точки');
      }
      setUsers(usersData.status === 'fulfilled' && Array.isArray(usersData.value) ? usersData.value : []);
      if (statsData.status === 'fulfilled') {
        setVenueStats(Array.isArray(statsData.value) ? statsData.value : []);
      } else {
        setVenueStats([]);
        setStatsError(true);
      }
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

  const activeVenues = venues.filter((venue) => venue.is_active);
  const archivedVenues = venues.filter((venue) => !venue.is_active);
  const visibleVenues = showVenueArchive ? archivedVenues : activeVenues;
  const venueStatsMap = new Map(venueStats.map((row) => [row.venue_id, row]));
  const activeAssignedFallback = users.filter((userItem) => userItem.is_active && Boolean(userItem.venue_id || userItem.venue?.id)).length;
  const activeAssignedCount = venueStats.length > 0
    ? activeVenues.reduce((total, venue) => total + (venueStatsMap.get(venue.id)?.assigned_employees_count ?? 0), 0)
    : activeAssignedFallback;
  const statsMonthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date());

  return (
    <div className="space-y-3">
      <div className="owner-compact-summary">
        <div className="owner-inline-stats">
          <EmployeeStat label="Активных" value={venues.filter((venue) => venue.is_active).length} />
          <EmployeeStat label="В архиве" value={venues.filter((venue) => !venue.is_active).length} />
          <EmployeeStat
            label="Закреплено"
            value={activeAssignedCount}
          />
        </div>
      </div>

      <form onSubmit={handleCreateVenue} className="owner-form-surface space-y-2">
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
          className="owner-primary-action w-full"
        >
          {submitting ? <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> : <Plus className="w-4 h-4" />}
          Добавить точку
        </button>
      </form>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
      {statsError && <p className="owner-inline-warning">Статистика точек временно недоступна. Управление точками продолжает работать.</p>}
      {success && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200">{success}</p>}

      {venues.length === 0 ? (
        <div className="owner-empty-state">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-tg-hint opacity-50" />
          <p className="text-sm font-medium text-tg-text">Точек пока нет</p>
          <p className="mt-1 text-sm text-tg-hint">Добавьте первую точку, чтобы привязывать к ней сотрудников и смены.</p>
        </div>
      ) : (
        <>
          <div className="owner-segmented-control owner-list-tabs" role="tablist" aria-label="Статус точек">
            <button type="button" role="tab" aria-selected={!showVenueArchive} data-active={!showVenueArchive} onClick={() => setShowVenueArchive(false)}>
              Активные · {activeVenues.length}
            </button>
            <button type="button" role="tab" aria-selected={showVenueArchive} data-active={showVenueArchive} onClick={() => setShowVenueArchive(true)}>
              Архив · {archivedVenues.length}
            </button>
          </div>
          <div className="owner-list-surface owner-disclosure-content">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-tg-text">{showVenueArchive ? 'Архив точек' : 'Активные точки'}</p>
              <p className="text-xs text-tg-hint">{visibleVenues.length}</p>
            </div>
            {visibleVenues.length === 0 ? (
              <div className="px-4 py-5">
                <p className="text-sm font-medium text-tg-text">{showVenueArchive ? 'Архив точек пуст' : 'Активных точек пока нет'}</p>
                <p className="mt-1 text-sm text-tg-hint">{showVenueArchive ? 'Неактивные точки появятся здесь после перевода в архив.' : 'Переведите точку из архива или добавьте новую.'}</p>
              </div>
            ) : (
              <div className="owner-list-items">
                 {visibleVenues.map((venue) => {
                  const isEditing = editingVenueId === venue.id;
                  const isBusy = statusVenueId === venue.id;
                  const stats = venueStatsMap.get(venue.id);
                  const assignedFallback = users.filter(
                    (userItem) => userItem.is_active && (userItem.venue_id === venue.id || userItem.venue?.id === venue.id)
                  ).length;
                  const assignedCount = stats?.assigned_employees_count ?? assignedFallback;
                  return (
                    <div key={venue.id} className="owner-employee-card owner-list-row" data-archived={showVenueArchive ? 'true' : 'false'}>
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
                          <div className="owner-venue-heading">
                            <p>{venue.name}</p>
                          {showVenueArchive && <span className="owner-status-badge" data-status="archived">В архиве</span>}
                        </div>
                      )}
                    </div>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingVenueId(venue.id);
                            setEditingName(venue.name);
                          }}
                        className="owner-icon-button"
                          aria-label={`Редактировать ${venue.name}`}
                        >
                          <Pencil className="w-4 h-4 text-tg-hint" />
                        </button>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="owner-venue-stats">
                        <p className="owner-venue-period">Статистика за {statsMonthLabel}</p>
                        <div className="owner-venue-stats-grid">
                          <div><span>Закреплено</span><strong>{assignedCount}</strong></div>
                          {stats ? (
                            <>
                              <div><span>Работали</span><strong>{stats.worked_employees_count}</strong></div>
                              <div><span>Смены</span><strong>{stats.approved_shifts_count}</strong></div>
                              <div><span>Часы</span><strong>{formatHours(stats.approved_hours)}</strong></div>
                              <div className="owner-venue-accrual"><span>Начислено</span><strong>{formatCurrency(stats.total_accruals)}</strong></div>
                            </>
                          ) : null}
                        </div>
                        {stats ? (
                          stats.pending_shifts_count > 0 && <p className="owner-venue-pending">Ожидают подтверждения: {stats.pending_shifts_count}</p>
                        ) : (
                          <p className="owner-venue-stats-unavailable">Рабочая статистика недоступна</p>
                        )}
                      </div>
                    )}

                    <div className="owner-venue-row-actions">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleRenameVenue(venue.id)}
                            disabled={isBusy}
                        className="owner-primary-action flex-1"
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
                        className="owner-secondary-action flex-1"
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleToggleVenue(venue)}
                          disabled={isBusy}
                          className="owner-status-action"
                          data-action={showVenueArchive ? 'restore' : 'archive'}
                        >
                          {isBusy ? (
                            <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                          ) : showVenueArchive ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          {showVenueArchive ? 'Восстановить' : 'В архив'}
                        </button>
                      )}
                    </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
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
  const visibleUsers = showArchive ? archivedUsers : activeUsers;
  const activeVenueCount = venues.filter((venue) => venue?.is_active).length;

  return (
    <div className="owner-team-tab space-y-3">
      <div className="owner-compact-summary">
        <div className="owner-inline-stats">
          <EmployeeStat label="Активных" value={activeUsers.length} />
          <EmployeeStat label="В архиве" value={archivedUsers.length} />
          <EmployeeStat label="Точек" value={activeVenueCount} />
        </div>
      </div>

      {teamError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">{teamError}</p>}
      {teamSuccess && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200">{teamSuccess}</p>}

      <div className={editingUser ? 'owner-form-surface space-y-3' : 'hidden'}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Редактирование сотрудника</p>
          </div>
        </div>

        {editingUser ? (
          <div className="space-y-3">
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
                <label className="block text-sm text-tg-hint">Основная точка</label>
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
                className="owner-primary-action flex-1"
              >
                {saving ? (
                  <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Сохранить
                  </>
                )}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="owner-secondary-action flex-1"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="owner-segmented-control owner-list-tabs" role="tablist" aria-label="Статус сотрудников">
        <button type="button" role="tab" aria-selected={!showArchive} data-active={!showArchive} onClick={() => setShowArchive(false)}>
          Активные · {activeUsers.length}
        </button>
        <button type="button" role="tab" aria-selected={showArchive} data-active={showArchive} onClick={() => setShowArchive(true)}>
          Архив · {archivedUsers.length}
        </button>
      </div>

      <div className="owner-list-surface owner-team-surface owner-disclosure-content">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-tg-text">{showArchive ? 'Архив сотрудников' : 'Активные сотрудники'}</p>
          <p className="text-xs text-tg-hint">{visibleUsers.length}</p>
        </div>

        {visibleUsers.length === 0 ? (
          <div className="px-4 py-5">
            <p className="text-sm font-medium text-tg-text">{showArchive ? 'Архив сотрудников пуст' : 'Активных сотрудников пока нет'}</p>
            <p className="mt-1 text-sm text-tg-hint">{showArchive ? 'Деактивированные сотрудники появятся здесь и останутся с историей смен.' : 'Перенесите сотрудника из архива или добавьте нового через приглашение.'}</p>
          </div>
        ) : (
          <div className="owner-list-items owner-team-list">
            {visibleUsers.map((u) => (
              <TeamEmployeeCard
                key={u.id}
                employee={u}
                currentUser={user}
                archived={showArchive}
                onEdit={startEdit}
                onToggleStatus={handleStatusChange}
                busy={statusUserId === u.id}
              />
            ))}
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

function AdjustTab({ user }: { user: User }) {
  const [userId, setUserId] = useState('');
  const [venueId, setVenueId] = useState(user.venue_id || '');
  const [type, setType] = useState<'bonus' | 'penalty'>('bonus');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<Venue[]>(() => user.venue ? [user.venue] : []);
  const canChooseVenue = user.role === 'owner' || user.role === 'admin';

  useEffect(() => {
    const fetchOptions = async () => {
      const [usersResult, venuesResult] = await Promise.allSettled([
        getUsers(),
        canChooseVenue ? getActiveVenues() : Promise.resolve(user.venue ? [user.venue] : []),
      ]);
      setUsers(usersResult.status === 'fulfilled' && Array.isArray(usersResult.value) ? usersResult.value : []);
      const nextVenues = venuesResult.status === 'fulfilled' && Array.isArray(venuesResult.value) ? venuesResult.value : [];
      setVenues(nextVenues);
      setVenueId((current) => current || user.venue_id || nextVenues[0]?.id || '');
    };
    fetchOptions();
  }, [canChooseVenue, user.venue, user.venue_id]);

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
        venue_id: venueId || undefined,
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
    <div className="owner-form-surface">
      <form onSubmit={handleSubmit} className="space-y-3">
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
          <label className="block text-sm text-tg-hint mb-1.5">Отнести к точке</label>
          {canChooseVenue ? (
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="owner-field-control"
            >
              {venues.length === 0 ? (
                <option value={venueId}>{user.venue?.name || 'Основная точка'}</option>
              ) : (
                venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)
              )}
            </select>
          ) : (
            <div className="owner-field-readonly">{user.venue?.name || 'Основная точка'}</div>
          )}
          <p className="mt-1.5 text-xs text-tg-hint">Корректировка войдёт в начисления выбранной точки.</p>
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Тип</label>
          <div className="owner-segmented-control">
            <button
              type="button"
              onClick={() => setType('bonus')}
              data-active={type === 'bonus' ? 'true' : 'false'}
            >
              <Gift className="w-4 h-4" />
              Бонус
            </button>
            <button
              type="button"
              onClick={() => setType('penalty')}
              data-active={type === 'penalty' ? 'true' : 'false'}
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
            className="owner-field-control"
          />
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Причина</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              type === 'bonus'
                ? 'Например: премия за смену, выход в выходной, помощь команде'
                : 'Например: зерно домой, аванс, дриппы'
            }
            rows={2}
            className="owner-field-control resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-400 text-sm">Создано</p>}

        <button
          type="submit"
          disabled={loading}
          className="owner-primary-action w-full"
        >
              {loading ? (
                <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
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
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAuditLogs(1, 50);
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        setLogs([]);
        setError(err instanceof Error ? err.message : 'Не удалось загрузить историю действий');
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

  if (error) {
    return (
      <div className="owner-empty-state" role="alert">
        <p className="font-medium text-tg-text">Не удалось загрузить историю</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="owner-empty-state">
        <History className="mx-auto mb-2 h-8 w-8 text-tg-hint opacity-60" />
        <p className="font-medium text-tg-text">История действий пока пуста</p>
        <p className="mt-1">Изменения команды появятся здесь.</p>
      </div>
    );
  }

  const visibleLogs = showAll ? logs : logs.slice(0, 20);
  const groupedLogs = visibleLogs.reduce<Record<string, AuditLog[]>>((acc, log) => {
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
    <div className="space-y-3 pb-2">
      <p className="owner-section-note">События сгруппированы по датам.</p>
      {Object.entries(groupedLogs).map(([dateLabel, items]) => (
        <section key={dateLabel} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm font-medium text-tg-text">{dateLabel}</p>
              <p className="text-xs text-tg-hint">{items.length}</p>
          </div>
          <div className="owner-audit-list">
              {items.map((log) => {
                const label = ACTION_LABELS[log.action] || 'Действие';
                const createdAt = formatCreatedAt(log.created_at);
                return (
                  <div
                    key={log.id}
                    className="owner-audit-row"
                  >
                    <div className="owner-audit-icon">
                      <History className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-tg-text">
                        <span className="font-medium">{log.user_name || 'Пользователь'}</span>{' '}
                        <span className="text-tg-hint">{label}</span>
                        {log.target_user_name && (
                          <> <span className="text-tg-hint">для</span> <span className="font-medium">{log.target_user_name}</span></>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-tg-hint">
                        {createdAt || 'Время не указано'}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
      {logs.length > 20 && (
        <button type="button" className="owner-secondary-action w-full" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'Показать последние 20' : `Показать ещё ${logs.length - 20}`}
        </button>
      )}
    </div>
  );
}
