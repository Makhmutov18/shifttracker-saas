import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Gift,
  History,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  AdminCreateUserResponse,
  AuditLog,
  Shift,
  User,
  createAdjustment,
  createUser,
  getAuditLogs,
  getPendingShifts,
  getUsers,
  updateShift,
  updateUser,
} from '../utils/api';
import { formatCurrency, formatDate, formatHours, formatTime } from '../utils/helpers';
import { hapticError, hapticSuccess } from '../utils/telegram';

interface Props {
  user: User;
}

type Tab = 'invite' | 'approve' | 'adjust' | 'audit' | 'team';

type ShiftDraft = {
  start_time: string;
  end_time: string;
  cashier_hours: string;
  revenue: string;
  comment: string;
};

export default function OwnerPanel({ user }: Props) {
  const [tab, setTab] = useState<Tab>('invite');

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-tg-primary" />
        <h1 className="text-lg font-semibold">Управление</h1>
      </div>

      <div className="flex bg-tg-secondary-bg rounded-xl p-1 mb-6 overflow-x-auto">
        <button
          onClick={() => setTab('invite')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'invite' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <UserPlus className="w-4 h-4 inline mr-1" />
          Пригласить
        </button>
        <button
          onClick={() => setTab('approve')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'approve' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <CheckCircle className="w-4 h-4 inline mr-1" />
          Утвердить
        </button>
        <button
          onClick={() => setTab('adjust')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'adjust' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <Gift className="w-4 h-4 inline mr-1" />
          Бонусы
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'audit' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <History className="w-4 h-4 inline mr-1" />
          История
        </button>
        <button
          onClick={() => setTab('team')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'team' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <Users className="w-4 h-4 inline mr-1" />
          Команда
        </button>
      </div>

      {tab === 'invite' && <InviteTab />}
      {tab === 'approve' && <ApproveTab />}
      {tab === 'adjust' && <AdjustTab venueId={user.venue_id} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'team' && <TeamTab />}
    </div>
  );
}

function InviteTab() {
  const [firstName, setFirstName] = useState('');
  const [role, setRole] = useState<'barista' | 'admin' | 'senior' | 'cook' | 'senior_cook'>('barista');
  const [hourlyRate, setHourlyRate] = useState('');
  const [payModel, setPayModel] = useState<'hourly' | 'revenue' | 'hybrid'>('hourly');
  const [revenuePercentage, setRevenuePercentage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdminCreateUserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        role,
        hourly_rate: rate || 0,
        pay_model: payModel,
        revenue_percentage: parseFloat(revenuePercentage) || 0,
      });
      setResult(res);
      setFirstName('');
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
          <label className="block text-sm text-tg-hint mb-1.5">Роль</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'barista' as const, label: 'Бариста' },
              { value: 'cook' as const, label: 'Повар' },
              { value: 'senior' as const, label: 'Старший' },
              { value: 'senior_cook' as const, label: 'Шеф-повар' },
              { value: 'admin' as const, label: 'Админ' },
            ].map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
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
          <label className="block text-sm text-tg-hint mb-1.5">Почасовая ставка (₽)</label>
          <input
            type="number"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="Например: 350"
            min="0"
            step="0.01"
            disabled={payModel === 'revenue'}
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Модель оплаты</label>
          <div className="flex gap-2">
            {[
              { value: 'hourly' as const, label: 'Почасовая' },
              { value: 'revenue' as const, label: '% от выручки' },
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
            className="w-full bg-tg-primary/10 text-tg-primary py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Скопировано
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Скопировать ссылку
              </>
            )}
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
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [savingShiftId, setSavingShiftId] = useState<string | null>(null);

  const buildDraft = (shift: Shift): ShiftDraft => ({
    start_time: shift.start_time.slice(0, 5),
    end_time: shift.end_time.slice(0, 5),
    cashier_hours: shift.cashier_hours ? String(shift.cashier_hours) : '',
    revenue: shift.revenue ? String(shift.revenue) : '',
    comment: shift.comment || '',
  });

  const fetchShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, users] = await Promise.all([getPendingShifts(), getUsers()]);
      setShifts(data);
      setUserNames(
        users.reduce<Record<string, string>>((acc, current) => {
          acc[current.id] = current.name;
          return acc;
        }, {})
      );
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
    const interval = setInterval(fetchShifts, 30000);
    return () => clearInterval(interval);
  }, []);

  const startEdit = (shift: Shift) => {
    setEditingShiftId(shift.id);
    setDraft(buildDraft(shift));
  };

  const cancelEdit = () => {
    setEditingShiftId(null);
    setDraft(null);
  };

  const saveEdit = async (shiftId: string) => {
    if (!draft) return;

    try {
      setSavingShiftId(shiftId);
      const updated = await updateShift(shiftId, {
        start_time: draft.start_time || undefined,
        end_time: draft.end_time || undefined,
        cashier_hours: draft.cashier_hours === '' ? undefined : parseFloat(draft.cashier_hours),
        revenue: draft.revenue === '' ? undefined : parseFloat(draft.revenue),
        comment: draft.comment.trim() || undefined,
      });
      setShifts((prev) => prev.map((shift) => (shift.id === shiftId ? updated : shift)));
      hapticSuccess();
      cancelEdit();
    } catch {
      hapticError();
    } finally {
      setSavingShiftId(null);
    }
  };

  const handleApprove = async (shiftId: string) => {
    try {
      setSavingShiftId(shiftId);
      await updateShift(shiftId, { status: 'approved' });
      hapticSuccess();
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
      if (editingShiftId === shiftId) {
        cancelEdit();
      }
    } catch {
      hapticError();
    } finally {
      setSavingShiftId(null);
    }
  };

  const handleReject = async (shiftId: string) => {
    try {
      setSavingShiftId(shiftId);
      await updateShift(shiftId, { status: 'rejected' });
      hapticSuccess();
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
      if (editingShiftId === shiftId) {
        cancelEdit();
      }
    } catch {
      hapticError();
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
      <div className="text-center py-12">
        <p className="text-red-400 text-sm mb-2">Ошибка загрузки</p>
        <p className="text-tg-hint text-xs mb-4">{error}</p>
        <button
          onClick={fetchShifts}
          className="text-tg-primary text-sm font-medium flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Повторить
        </button>
      </div>
    );
  }

  if (shifts.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <p className="text-tg-text font-medium mb-1">Все чисто</p>
        <p className="text-tg-hint text-sm">Нет смен, ожидающих утверждения</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-tg-hint text-sm">Ожидают утверждения: {shifts.length}</p>
        <button
          onClick={fetchShifts}
          className="text-tg-primary text-xs font-medium flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Обновить
        </button>
      </div>

      {shifts.map((shift) => {
        const isEditing = editingShiftId === shift.id && draft;
        const isSaving = savingShiftId === shift.id;

        return (
          <div key={shift.id} className="bg-tg-secondary-bg rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-tg-text font-medium text-sm">
                  {userNames[shift.user_id] || 'Сотрудник'}
                </p>
                <p className="text-tg-hint text-xs">
                  {formatDate(shift.date)} · {formatTime(shift.start_time)} — {formatTime(shift.end_time)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-tg-text font-semibold text-sm">{formatCurrency(shift.salary_earned)}</p>
                <p className="text-tg-hint text-xs">{formatHours(shift.total_hours)}</p>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-3 bg-tg-bg rounded-xl p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Начало</label>
                    <input
                      type="time"
                      value={draft.start_time}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, start_time: e.target.value } : prev))}
                      className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Конец</label>
                    <input
                      type="time"
                      value={draft.end_time}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, end_time: e.target.value } : prev))}
                      className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Часы кассы</label>
                    <input
                      type="number"
                      value={draft.cashier_hours}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, cashier_hours: e.target.value } : prev))}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-tg-hint mb-1">Выручка</label>
                    <input
                      type="number"
                      value={draft.revenue}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, revenue: e.target.value } : prev))}
                      min="0"
                      step="0.01"
                      placeholder="0"
                      className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-3 py-2.5 text-sm outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-tg-hint mb-1">Комментарий</label>
                  <textarea
                    value={draft.comment}
                    onChange={(e) => setDraft((prev) => (prev ? { ...prev, comment: e.target.value } : prev))}
                    rows={2}
                    placeholder="Комментарий к смене"
                    className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(shift.id)}
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
            ) : shift.comment ? (
              <p className="text-tg-hint text-xs bg-tg-bg rounded-lg px-3 py-2">{shift.comment}</p>
            ) : null}

            {!isEditing && (
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
                onClick={() => handleApprove(shift.id)}
                disabled={isSaving || Boolean(editingShiftId === shift.id && draft)}
                className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <CheckCircle className="w-4 h-4" />
                Утвердить
              </button>
              <button
                onClick={() => handleReject(shift.id)}
                disabled={isSaving}
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

const ROLE_OPTIONS = [
  { value: 'barista', label: 'Бариста' },
  { value: 'cook', label: 'Повар' },
  { value: 'senior', label: 'Старший' },
  { value: 'senior_cook', label: 'Шеф-повар' },
  { value: 'admin', label: 'Админ' },
];

function TeamTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editRole, setEditRole] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const startEdit = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditRate(user.hourly_rate);
    setEditRole(user.role);
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const updated = await updateUser(editingUser.id, {
        name: editName,
        hourly_rate: parseFloat(editRate) || 0,
        role: editRole as any,
      });
      hapticSuccess();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
    } catch {
      hapticError();
    } finally {
      setSaving(false);
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
    <div className="space-y-3">
      <p className="text-tg-hint text-sm mb-2">Сотрудников: {users.length}</p>

      {users.map((u) => (
        <div key={u.id} className="bg-tg-secondary-bg rounded-xl p-4">
          {editingUser?.id === u.id ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                placeholder="Имя"
              />
              <input
                type="number"
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none"
                placeholder="Ставка ₽/ч"
                min="0"
                step="0.01"
              />
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full bg-tg-bg text-tg-text rounded-xl px-4 py-2.5 text-sm outline-none appearance-none"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-tg-primary flex items-center justify-center text-white font-bold text-sm">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-tg-text font-medium text-sm">{u.name}</p>
                  <p className="text-tg-hint text-xs">
                    {ROLE_OPTIONS.find((r) => r.value === u.role)?.label || u.role} · {formatCurrency(u.hourly_rate)}/ч
                  </p>
                </div>
              </div>
              <button
                onClick={() => startEdit(u)}
                className="p-2 rounded-xl hover:bg-tg-bg transition-colors"
              >
                <Pencil className="w-4 h-4 text-tg-hint" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
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
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
          />
        </div>

        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Причина</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: Отличная работа на смене"
            rows={2}
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none resize-none placeholder:text-tg-hint"
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
