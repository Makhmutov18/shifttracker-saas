import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
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
  Shift,
  User,
  Venue,
  createAdjustment,
  createUser,
  createVenue,
  deactivateVenue,
  deleteUser,
  getAuditLogs,
  getPendingShifts,
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
  PERMISSION_LABELS,
  PermissionMap,
  getDefaultPermissionsForRole,
  hasPermission,
  normalizePermissionMap,
} from '../utils/permissions';

interface Props {
  user: User;
}

type Tab = 'invite' | 'approve' | 'adjust' | 'audit' | 'team' | 'venues';

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
    <div className="space-y-3 rounded-2xl border border-tg-border bg-tg-secondary-bg p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">Права доступа</p>
      <div className="grid gap-2">
        {PERMISSION_KEYS.map((key) => (
          <label
            key={key}
            className={`flex items-center justify-between gap-3 rounded-xl border border-tg-border px-3 py-3 text-sm ${
              disabled ? 'opacity-60' : 'bg-tg-bg'
            }`}
          >
            <span className="text-tg-text">{PERMISSION_LABELS[key]}</span>
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
    </div>
  );
}

export default function OwnerPanel({ user }: Props) {
  const [tab, setTab] = useState<Tab>('invite');
  const canApprove = hasPermission(user, 'can_approve_shifts') || hasPermission(user, 'can_edit_team_shifts');
  const canManageTeam = hasPermission(user, 'can_manage_team');
  const canManageAdjustments = hasPermission(user, 'can_manage_adjustments');
  const canViewAudit = canManageTeam;

  const visibleTabs: { id: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: 'invite', label: 'Пригласить', icon: <UserPlus className="w-4 h-4 inline mr-1" />, visible: canManageTeam },
    { id: 'approve', label: 'Утвердить', icon: <CheckCircle className="w-4 h-4 inline mr-1" />, visible: canApprove },
    { id: 'adjust', label: 'Бонусы', icon: <Gift className="w-4 h-4 inline mr-1" />, visible: canManageAdjustments },
    { id: 'audit', label: 'История', icon: <History className="w-4 h-4 inline mr-1" />, visible: canViewAudit },
    { id: 'team', label: 'Команда', icon: <Users className="w-4 h-4 inline mr-1" />, visible: canManageTeam },
    { id: 'venues', label: 'Точки', icon: <Building2 className="w-4 h-4 inline mr-1" />, visible: canManageTeam },
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
      </OwnerPanelBoundary>
    </div>
  );
}

function InviteTab() {
  const [firstName, setFirstName] = useState('');
  const [position, setPosition] = useState(POSITION_DEFAULTS.barista);
  const [role, setRole] = useState<'barista' | 'admin' | 'senior' | 'cook' | 'senior_cook'>('barista');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [payModel, setPayModel] = useState<'hourly' | 'revenue' | 'hybrid'>('hourly');
  const [revenuePercentage, setRevenuePercentage] = useState('');
  const [permissions, setPermissions] = useState<PermissionMap>(() => getDefaultPermissionsForRole('barista'));
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
        revenue_percentage: parseFloat(revenuePercentage) || 0,
        permissions,
      });
      setResult(res);
      setFirstName('');
      setPosition(POSITION_DEFAULTS[role]);
      setVenueId((current) => current || venues[0]?.id || '');
      setHourlyRate('');
      setRevenuePercentage('');
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
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Имя сотрудника</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Например: Анна"
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Должность</label>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Бариста, повар, кассир, администратор зала"
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Точка</label>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
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

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Уровень доступа</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'barista' as const, label: 'Бариста' },
              { value: 'cook' as const, label: 'Повар' },
              { value: 'senior' as const, label: 'Старший' },
              { value: 'senior_cook' as const, label: 'Шеф-повар' },
              { value: 'admin' as const, label: 'Администратор' },
            ].map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setRole(r.value);
                  setPermissions(getDefaultPermissionsForRole(r.value));
                  setPosition(POSITION_DEFAULTS[r.value]);
                }}
                className={`py-3 rounded-xl text-sm font-medium transition-all ${
                  role === r.value ? 'bg-tg-primary text-white' : 'bg-tg-secondary-bg text-tg-hint'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Модель оплаты</label>
          <div className="flex gap-2">
            {[
              { value: 'hourly' as const, label: 'Почасовая' },
              { value: 'revenue' as const, label: 'От выручки' },
              { value: 'hybrid' as const, label: 'Смешанная' },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setPayModel(m.value)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  payModel === m.value ? 'bg-tg-primary text-white' : 'bg-tg-secondary-bg text-tg-hint'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">
            Ставка <span className="ml-2 text-xs text-tg-hint/80">{getRateLabel(payModel)}</span>
          </label>
          <input
            type="number"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="Например: 250"
            min="0"
            step="0.01"
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
          />
        </div>

        {payModel !== 'hourly' && (
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
              className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
            />
          </div>
        )}

        <PermissionsChecklist value={permissions} onChange={setPermissions} />

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

  const getShiftDateLabel = (date: string) => {
    if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return 'Дата не указана';
    }
    return formatDate(date);
  };

  const getShiftTimeLabel = (time: string) => {
    return typeof time === 'string' && time.length >= 5 ? formatTime(time) : '00:00';
  };

  const getShiftAmount = (amount: string | number | null | undefined) => {
    if (amount == null || amount === '') return formatCurrency(0);
    return formatCurrency(amount);
  };

  const getShiftHours = (hours: string | number | null | undefined) => {
    if (hours == null || hours === '') return formatHours(0);
    return formatHours(hours);
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
        <p className="text-sm font-medium text-tg-text">Нет смен на утверждение</p>
        <p className="mt-1 text-sm text-tg-hint">Новые заявки сотрудников появятся здесь.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-tg-hint text-sm">Ожидают утверждения: {safeShifts.length}</p>
        <button
          onClick={fetchShifts}
          className="text-tg-primary text-xs font-medium flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Обновить
        </button>
      </div>

      {safeShifts.map((shift, index) => {
        const shiftId = shift?.id || `pending-${index}`;
        const isEditing = editingShiftId === shiftId && Boolean(draft);
        const isSaving = savingShiftId === shiftId;
        const employeeName =
          (shift?.user_id && safeUserNames[shift.user_id]) ||
          'Сотрудник';
        const venueName =
          (shift?.user_id && safeUserVenues[shift.user_id]) ||
          'Основная точка';

        return (
          <div key={shiftId} className="bg-tg-secondary-bg rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-tg-text font-medium text-sm">{employeeName}</p>
                <p className="text-tg-hint text-xs">{venueName}</p>
                <p className="text-tg-hint text-xs">
                  {getShiftDateLabel(shift?.date || '')} · {getShiftTimeLabel(shift?.start_time || '')} — {getShiftTimeLabel(shift?.end_time || '')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-tg-text font-semibold text-sm">{getShiftAmount(shift?.salary_earned)}</p>
                <p className="text-tg-hint text-xs">{getShiftHours(shift?.total_hours)}</p>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-3 bg-tg-bg rounded-xl p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Начало</label>
                    <input
                      type="time"
                      value={draft?.start_time ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, start_time: e.target.value } : prev))}
                      className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none border border-black/5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Конец</label>
                    <input
                      type="time"
                      value={draft?.end_time ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, end_time: e.target.value } : prev))}
                      className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none border border-black/5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Часы кассы</label>
                    <input
                      type="number"
                      value={draft?.cashier_hours ?? ''}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, cashier_hours: e.target.value } : prev))}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="w-full bg-white text-[#111827] rounded-xl px-3 py-2.5 text-sm outline-none border border-black/5 placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Выручка</label>
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
                  <label className="block text-xs text-tg-hint mb-1">Комментарий</label>
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
                    className="flex-1 bg-tg-secondary-bg text-tg-text py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 disabled:opacity-60"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : shift?.comment ? (
              <p className="text-tg-hint text-xs bg-tg-bg rounded-lg px-3 py-2">{shift.comment}</p>
            ) : null}

            {!isEditing && Boolean(shift?.id) && (
              <button
                onClick={() => startEdit(shift)}
                className="w-full bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform"
              >
                <Pencil className="w-4 h-4" />
                Исправить перед утверждением
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(shiftId)}
                disabled={!shift?.id || isSaving || Boolean(editingShiftId === shiftId && draft)}
                className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <CheckCircle className="w-4 h-4" />
                Утвердить
              </button>
              <button
                onClick={() => handleReject(shiftId)}
                disabled={!shift?.id || isSaving}
                className="flex-1 bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform disabled:opacity-60"
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newVenueName, setNewVenueName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [statusVenueId, setStatusVenueId] = useState<string | null>(null);

  const fetchVenuesList = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getVenues(true);
      setVenues(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setVenues([]);
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
          <div key={i} className="h-20 bg-tg-secondary-bg rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreateVenue} className="rounded-2xl bg-tg-secondary-bg p-4 space-y-3">
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
        <div className="rounded-2xl bg-tg-secondary-bg px-4 py-5">
          <p className="text-sm font-medium text-tg-text">Точки ещё не добавлены</p>
          <p className="mt-1 text-sm text-tg-hint">Создайте первую точку, чтобы распределять по ней сотрудников.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((venue) => {
            const isEditing = editingVenueId === venue.id;
            const isBusy = statusVenueId === venue.id;
            return (
              <div key={venue.id} className={`rounded-2xl p-4 ${venue.is_active ? 'bg-tg-secondary-bg' : 'bg-tg-secondary-bg/60 opacity-85'}`}>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-tg-text">{venue.name}</p>
                        <span className={`text-[11px] px-2 py-1 rounded-full ${venue.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'}`}>
                          {venue.is_active ? 'Активна' : 'Неактивна'}
                        </span>
                      </div>
                    )}
                    {!isEditing && <p className="mt-2 text-xs text-tg-hint">Статус точки можно менять без удаления истории сотрудников и смен.</p>}
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
                        Сохранить
                      </button>
                      <button
                        onClick={() => {
                          setEditingVenueId(null);
                          setEditingName('');
                        }}
                        disabled={isBusy}
                        className="flex-1 bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 disabled:opacity-60"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleToggleVenue(venue)}
                      disabled={isBusy}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                        venue.is_active ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {isBusy ? (
                        <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                      ) : venue.is_active ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      {venue.is_active ? 'Деактивировать' : 'Активировать'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamTab({ user }: { user: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editVenueId, setEditVenueId] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editRole, setEditRole] = useState<User['role']>('barista');
  const [editPayModel, setEditPayModel] = useState<User['pay_model']>('hourly');
  const [editRevenuePercentage, setEditRevenuePercentage] = useState('');
  const [editPermissions, setEditPermissions] = useState<PermissionMap>(getDefaultPermissionsForRole('barista'));
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
    setEditPermissions({
      ...getDefaultPermissionsForRole(target.role),
      ...normalizePermissionMap(target.permissions),
    });
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
        revenue_percentage: editPayModel === 'hourly' ? 0 : parseFloat(editRevenuePercentage) || 0,
        permissions: editingUser.id === user.id && user.role !== 'owner' ? undefined : editPermissions,
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
        const confirmed = window.confirm(`Деактивировать сотрудника ${target.name}? Его смены и выплаты сохранятся.`);
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
          <div key={i} className="h-20 bg-tg-secondary-bg rounded-xl" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl bg-tg-secondary-bg px-4 py-5">
        <p className="text-sm font-medium text-tg-text">Сотрудников пока нет</p>
        <p className="mt-1 text-sm text-tg-hint">Добавьте сотрудника через вкладку приглашения, и он появится здесь.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-tg-hint text-sm mb-2">Сотрудников: {users.length}</p>

      {teamError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">{teamError}</p>}
      {teamSuccess && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-200">{teamSuccess}</p>}

      <div className="rounded-2xl bg-tg-secondary-bg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Редактирование сотрудника</p>
            <p className="text-xs text-tg-hint">Выберите человека из списка ниже, чтобы обновить его данные.</p>
          </div>
          <RefreshCw className="w-4 h-4 text-tg-hint" />
        </div>

        {editingUser ? (
          <div className="space-y-4">
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

            <div className="space-y-1.5">
              <label className="block text-sm text-tg-hint">Уровень доступа</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => {
                      const nextRole = r.value as User['role'];
                      setEditRole(nextRole);
                      setEditPermissions(getDefaultPermissionsForRole(nextRole));
                      setEditPosition(POSITION_DEFAULTS[nextRole]);
                    }}
                    className={`py-3 rounded-xl text-sm font-medium transition-all ${
                      editRole === r.value ? 'bg-tg-primary text-white' : 'bg-tg-bg text-tg-hint'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-tg-hint">Должность показывает роль человека в команде, а права задаются отдельно.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm text-tg-hint">Модель оплаты</label>
              <div className="flex gap-2">
                {[
                  { value: 'hourly' as const, label: 'Почасовая' },
                  { value: 'revenue' as const, label: 'От выручки' },
                  { value: 'hybrid' as const, label: 'Смешанная' },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setEditPayModel(m.value)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      editPayModel === m.value ? 'bg-tg-primary text-white' : 'bg-tg-bg text-tg-hint'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm text-tg-hint">
                Ставка <span className="ml-2 text-xs text-tg-hint/80">{getRateLabel(editPayModel)}</span>
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

            {editPayModel !== 'hourly' && (
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

            <PermissionsChecklist
              value={editPermissions}
              onChange={setEditPermissions}
              disabled={user.role !== 'owner' && editingUser.id === user.id}
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
                className="flex-1 bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-tg-hint">Нажмите на иконку редактирования у нужного сотрудника.</p>
        )}
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className={`rounded-2xl p-4 ${u.is_active ? 'bg-tg-secondary-bg' : 'bg-tg-secondary-bg/60 opacity-85'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-tg-text font-medium text-sm truncate">{u.name}</p>
                  <span className={`text-[11px] px-2 py-1 rounded-full ${u.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'}`}>
                    {u.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
                <div className="mt-2 grid gap-1.5 text-xs text-tg-hint">
                  <p>Точка: {getVenueName(u.venue)}</p>
                  <p>Должность: {getPositionLabel(u)}</p>
                  <p>Уровень доступа: {ROLE_LABELS[u.role] ?? u.role}</p>
                  <p>Модель оплаты: {PAY_MODEL_LABELS[u.pay_model]}</p>
                  <p>Ставка: {u.pay_model === 'revenue' ? 'Индивидуально' : `${formatCurrency(u.hourly_rate)} ${getRateLabel(u.pay_model)}`}</p>
                  {u.pay_model !== 'hourly' && Number(u.revenue_percentage) > 0 && (
                    <p>Процент от выручки: {u.revenue_percentage}%</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => startEdit(u)}
                className="p-2 rounded-xl hover:bg-tg-bg transition-colors"
                aria-label={`Редактировать ${u.name}`}
              >
                <Pencil className="w-4 h-4 text-tg-hint" />
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              {u.id !== user.id ? (
                <button
                  onClick={() => handleStatusChange(u)}
                  disabled={statusUserId === u.id}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                    u.is_active
                      ? 'bg-rose-500/10 text-rose-600'
                      : 'bg-emerald-500/10 text-emerald-600'
                  }`}
                >
                  {statusUserId === u.id ? (
                    <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                  ) : u.is_active ? (
                    <UserX className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  {u.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
              ) : (
                <span className="inline-flex items-center rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-tg-hint">
                  Это вы
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<User['role'], string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  senior: 'Старший',
  barista: 'Бариста',
  cook: 'Повар',
  senior_cook: 'Шеф-повар',
};

const POSITION_DEFAULTS: Record<User['role'], string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  senior: 'Старший смены',
  barista: 'Бариста',
  cook: 'Повар',
  senior_cook: 'Шеф-повар',
};

const ROLE_OPTIONS = [
  { value: 'barista', label: 'Бариста' },
  { value: 'cook', label: 'Повар' },
  { value: 'senior', label: 'Старший' },
  { value: 'senior_cook', label: 'Шеф-повар' },
  { value: 'admin', label: 'Администратор' },
] as const;

const PAY_MODEL_LABELS: Record<User['pay_model'], string> = {
  hourly: 'Почасовая',
  revenue: 'От выручки',
  hybrid: 'Смешанная',
};

const PAY_MODEL_HINTS: Record<User['pay_model'], string> = {
  hourly: '₽/час',
  revenue: 'индивидуально',
  hybrid: '₽/час + %',
};

function getPositionLabel(user: Pick<User, 'position' | 'role'>) {
  return user.position?.trim() || POSITION_DEFAULTS[user.role];
}

function getRateLabel(payModel: User['pay_model']) {
  return PAY_MODEL_HINTS[payModel];
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
              Штраф
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
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: Отличная работа на смене"
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
              {type === 'bonus' ? 'Начислить бонус' : 'Наложить штраф'}
            </>
          )}
        </button>
      </form>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  shift_created: 'Создал смену',
  shift_approved: 'Утвердил смену',
  shift_rejected: 'Отклонил смену',
  shift_edited: 'Отредактировал смену',
  user_created: 'Создал сотрудника',
  bonus_added: 'Начислил бонус',
  penalty_added: 'Наложил штраф',
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
      <div className="text-center py-12">
        <History className="w-12 h-12 text-tg-hint mx-auto mb-3 opacity-50" />
        <p className="text-tg-hint text-sm">Пока нет записей</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="bg-tg-secondary-bg rounded-xl p-3 flex items-start gap-3"
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            log.action.includes('approved') || log.action.includes('created')
              ? 'bg-emerald-50 dark:bg-emerald-900/20'
              : log.action.includes('penalty') || log.action.includes('rejected')
              ? 'bg-rose-50 dark:bg-rose-900/20'
              : 'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            {log.action.includes('penalty') || log.action.includes('rejected') ? (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            ) : log.action.includes('bonus') ? (
              <Gift className="w-4 h-4 text-emerald-500" />
            ) : (
              <History className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-tg-text text-sm">
              <span className="font-medium">{log.user_name || 'Пользователь'}</span>{' '}
              <span className="text-tg-hint">{ACTION_LABELS[log.action] || log.action}</span>
              {log.target_user_name && (
                <> <span className="text-tg-hint">для</span> <span className="font-medium">{log.target_user_name}</span></>
              )}
            </p>
            <p className="text-tg-hint text-xs mt-0.5">
              {new Date(log.created_at).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
