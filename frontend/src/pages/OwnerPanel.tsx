import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, XCircle, UserPlus, Copy, Check, History, Gift, AlertTriangle, RefreshCw } from 'lucide-react';
import { User, Shift, AuditLog, Adjustment, getPendingShifts, updateShift, createUser, getAuditLogs, createAdjustment, getUsers, AdminCreateUserResponse } from '../utils/api';
import { formatDate, formatTime, formatCurrency, formatHours } from '../utils/helpers';
import { hapticSuccess, hapticError } from '../utils/telegram';

interface Props {
  user: User;
}

type Tab = 'invite' | 'approve' | 'audit' | 'adjust';

export default function OwnerPanel({ user }: Props) {
  const [tab, setTab] = useState<Tab>('invite');

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-tg-primary" />
        <h1 className="text-lg font-semibold">Управление</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-tg-secondary-bg rounded-xl p-1 mb-6 overflow-x-auto">
        <button
          onClick={() => setTab('invite')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'invite'
              ? 'bg-tg-bg text-tg-text shadow-sm'
              : 'text-tg-hint'
          }`}
        >
          <UserPlus className="w-4 h-4 inline mr-1" />
          Пригласить
        </button>
        <button
          onClick={() => setTab('approve')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'approve'
              ? 'bg-tg-bg text-tg-text shadow-sm'
              : 'text-tg-hint'
          }`}
        >
          <CheckCircle className="w-4 h-4 inline mr-1" />
          Утвердить
        </button>
        <button
          onClick={() => setTab('adjust')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'adjust'
              ? 'bg-tg-bg text-tg-text shadow-sm'
              : 'text-tg-hint'
          }`}
        >
          <Gift className="w-4 h-4 inline mr-1" />
          Бонусы
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'audit'
              ? 'bg-tg-bg text-tg-text shadow-sm'
              : 'text-tg-hint'
          }`}
        >
          <History className="w-4 h-4 inline mr-1" />
          История
        </button>
      </div>

      {tab === 'invite' && <InviteTab />}
      {tab === 'approve' && <ApproveTab />}
      {tab === 'adjust' && <AdjustTab venueId={user.venue_id} />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

// ─── Invite Tab ─────────────────────────────────────────────────────────────

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
      await       navigator.clipboard.writeText(result.invite_link);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
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
        {/* First name */}
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

        {/* Role */}
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
                  role === r.value
                    ? 'bg-tg-primary text-white'
                    : 'bg-tg-secondary-bg text-tg-hint'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hourly rate */}
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

        {/* Pay model */}
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
                  payModel === m.value
                    ? 'bg-tg-primary text-white'
                    : 'bg-tg-secondary-bg text-tg-hint'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Revenue percentage (for revenue/hybrid models) */}
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

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

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

      {/* Result */}
      {result && (
        <div className="mt-6 bg-tg-secondary-bg rounded-xl p-4 space-y-3">
          <p className="text-sm text-tg-hint">Сотрудник создан! Отправь ему эту ссылку:</p>
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
                Скопировано!
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

// ─── Approve Tab ────────────────────────────────────────────────────────────

function ApproveTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const fetchShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPendingShifts();
      setShifts(data);

      // Fetch user names for each unique user_id
      const userIds = [...new Set(data.map(s => s.user_id))];
      const names: Record<string, string> = {};
      for (const uid of userIds) {
        try {
          // We'll use the getUsers endpoint and find by id
          const users = await getUsers();
          for (const u of users) {
            names[u.id] = u.name;
          }
        } catch {}
      }
      setUserNames(names);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchShifts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (shiftId: string) => {
    try {
      await updateShift(shiftId, { status: 'approved' });
      hapticSuccess();
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
    } catch {
      hapticError();
    }
  };

  const handleReject = async (shiftId: string) => {
    try {
      await updateShift(shiftId, { status: 'rejected' });
      hapticSuccess();
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
    } catch {
      hapticError();
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
        <p className="text-tg-text font-medium mb-1">Всё чисто</p>
        <p className="text-tg-hint text-sm">Нет смен, ожидающих утверждения</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-tg-hint text-sm">
          Ожидают утверждения: {shifts.length}
        </p>
        <button
          onClick={fetchShifts}
          className="text-tg-primary text-xs font-medium flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Обновить
        </button>
      </div>
      {shifts.map((shift) => (
        <div
          key={shift.id}
          className="bg-tg-secondary-bg rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-tg-text font-medium text-sm">
                {userNames[shift.user_id] || 'Сотрудник'}
              </p>
              <p className="text-tg-hint text-xs">
                {formatDate(shift.date)} · {formatTime(shift.start_time)} — {formatTime(shift.end_time)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-tg-text font-semibold text-sm">
                {formatCurrency(shift.salary_earned)}
              </p>
              <p className="text-tg-hint text-xs">
                {formatHours(shift.total_hours)}
              </p>
            </div>
          </div>

          {shift.comment && (
            <p className="text-tg-hint text-xs mb-3 bg-tg-bg rounded-lg px-3 py-2">
              {shift.comment}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => handleApprove(shift.id)}
              className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <CheckCircle className="w-4 h-4" />
              Утвердить
            </button>
            <button
              onClick={() => handleReject(shift.id)}
              className="flex-1 bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform"
            >
              <XCircle className="w-4 h-4" />
              Отклонить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Adjust Tab ─────────────────────────────────────────────────────────────

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
        {/* User selector */}
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

        {/* Type toggle */}
        <div>
          <label className="block text-sm text-tg-hint mb-1.5">Тип</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('bonus')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                type === 'bonus'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              <Gift className="w-4 h-4" />
              Бонус
            </button>
            <button
              type="button"
              onClick={() => setType('penalty')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                type === 'penalty'
                  ? 'bg-rose-500 text-white'
                  : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Штраф
            </button>
          </div>
        </div>

        {/* Amount */}
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

        {/* Reason */}
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
        {success && <p className="text-emerald-400 text-sm">Создано!</p>}

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

// ─── Audit Tab ──────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  shift_created: 'Создал смену',
  shift_approved: 'Утвердил смену',
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
              : log.action.includes('penalty')
              ? 'bg-rose-50 dark:bg-rose-900/20'
              : 'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            {log.action.includes('penalty') ? (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            ) : log.action.includes('bonus') ? (
              <Gift className="w-4 h-4 text-emerald-500" />
            ) : (
              <History className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-tg-text text-sm">
              <span className="font-medium">{log.user_name || 'Пользователь'}</span>
              {' '}
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