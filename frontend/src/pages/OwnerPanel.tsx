import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, Edit3, UserPlus, Copy, Check } from 'lucide-react';
import { User, Shift, getPendingShifts, updateShift, createUser, AdminCreateUserResponse } from '../utils/api';
import { formatDate, formatTime, formatCurrency, formatHours } from '../utils/helpers';

interface Props {
  user: User;
}

type Tab = 'invite' | 'approve';

export default function OwnerPanel({ user }: Props) {
  const [tab, setTab] = useState<Tab>('invite');

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-tg-primary" />
        <h1 className="text-lg font-semibold">Управление</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-tg-secondary-bg rounded-xl p-1 mb-6">
        <button
          onClick={() => setTab('invite')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'invite'
              ? 'bg-tg-bg text-tg-text shadow-sm'
              : 'text-tg-hint'
          }`}
        >
          <UserPlus className="w-4 h-4 inline mr-1.5" />
          Пригласить
        </button>
        <button
          onClick={() => setTab('approve')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'approve'
              ? 'bg-tg-bg text-tg-text shadow-sm'
              : 'text-tg-hint'
          }`}
        >
          <CheckCircle className="w-4 h-4 inline mr-1.5" />
          Утвердить
        </button>
      </div>

      {tab === 'invite' ? <InviteTab /> : <ApproveTab />}
    </div>
  );
}

// ─── Invite Tab ─────────────────────────────────────────────────────────────

function InviteTab() {
  const [firstName, setFirstName] = useState('');
  const [role, setRole] = useState<'barista' | 'admin'>('barista');
  const [hourlyRate, setHourlyRate] = useState('');
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
    if (isNaN(rate) || rate < 0) {
      setError('Введите корректную ставку');
      return;
    }

    try {
      setLoading(true);
      const res = await createUser({
        first_name: firstName.trim(),
        role,
        hourly_rate: rate,
      });
      setResult(res);
      setFirstName('');
      setHourlyRate('');
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRole('barista')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                role === 'barista'
                  ? 'bg-tg-primary text-white'
                  : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              Бариста
            </button>
            <button
              type="button"
              onClick={() => setRole('admin')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                role === 'admin'
                  ? 'bg-tg-primary text-white'
                  : 'bg-tg-secondary-bg text-tg-hint'
              }`}
            >
              Админ
            </button>
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
            className="w-full bg-tg-secondary-bg text-tg-text rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-tg-primary/50 transition-shadow"
          />
        </div>

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

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const data = await getPendingShifts();
      setShifts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  const handleApprove = async (shiftId: string) => {
    try {
      await updateShift(shiftId, { status: 'approved' });
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
    } catch {
      // ignore
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
      <p className="text-tg-hint text-sm mb-2">
        Ожидают утверждения: {shifts.length}
      </p>
      {shifts.map((shift) => (
        <div
          key={shift.id}
          className="bg-tg-secondary-bg rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-tg-text font-medium text-sm">
                {formatDate(shift.date)}
              </p>
              <p className="text-tg-hint text-xs">
                {formatTime(shift.start_time)} — {formatTime(shift.end_time)}
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
            <button className="flex-1 bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform">
              <Edit3 className="w-4 h-4" />
              Редактировать
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}