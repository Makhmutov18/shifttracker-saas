import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, MapPin, Clock, Wallet, Gift, AlertTriangle, History } from 'lucide-react';
import { User as UserType, AuditLog, Adjustment, getAuditLogs, getAdjustments, getMonthlyStats, MonthlyStats } from '../utils/api';
import { formatCurrency, formatHours, getMonthName, getCurrentMonth, getCurrentYear } from '../utils/helpers';

interface Props {
  user: UserType;
  onBack: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Админ',
  senior: 'Старший',
  barista: 'Бариста',
  cook: 'Повар',
  senior_cook: 'Шеф-повар',
};

const PAY_MODEL_LABELS: Record<string, string> = {
  hourly: 'Почасовая',
  revenue: '% от выручки',
  hybrid: 'Смешанная',
};

export default function Profile({ user, onBack }: Props) {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, adjData, logsData] = await Promise.all([
          getMonthlyStats(),
          getAdjustments(),
          getAuditLogs(1, 20),
        ]);
        setStats(statsData);
        setAdjustments(adjData);
        setAuditLogs(logsData);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const netIncome = stats
    ? (
        parseFloat(stats.total_earned) +
        parseFloat(stats.total_bonuses) -
        parseFloat(stats.total_penalties) -
        parseFloat(stats.total_expenses)
      ).toFixed(2)
    : '0.00';

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-tg-secondary-bg transition-colors">
          <ArrowLeft className="w-5 h-5 text-tg-text" />
        </button>
        <h1 className="text-lg font-semibold">Профиль</h1>
      </div>

      {/* Profile card */}
      <div className="bg-tg-secondary-bg rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-tg-primary flex items-center justify-center text-white text-xl font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-tg-text">{user.name}</h2>
            <p className="text-sm text-tg-hint">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-tg-hint">
            <MapPin className="w-4 h-4" />
            <span>{user.venue?.name || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-tg-hint">
            <Wallet className="w-4 h-4" />
            <span>
              {user.pay_model === 'hourly'
                ? `${formatCurrency(user.hourly_rate)}/ч`
                : user.pay_model === 'revenue'
                ? `${user.revenue_percentage}% от выручки`
                : `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage}%`
              }
            </span>
          </div>
          <div className="flex items-center gap-2 text-tg-hint">
            <Clock className="w-4 h-4" />
            <span>Модель: {PAY_MODEL_LABELS[user.pay_model] || user.pay_model}</span>
          </div>
        </div>
      </div>

      {/* Monthly stats */}
      {loading ? (
        <div className="animate-pulse space-y-3 mb-4">
          <div className="h-32 bg-tg-secondary-bg rounded-2xl" />
        </div>
      ) : stats && (
        <div className="bg-gradient-to-br from-tg-primary to-blue-600 rounded-2xl p-5 text-white mb-4">
          <p className="text-sm opacity-80 mb-1">Итого за {getMonthName(getCurrentMonth())}</p>
          <p className="text-3xl font-bold">{formatCurrency(netIncome)}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-70">Часы</p>
              <p className="font-semibold">{formatHours(stats.total_hours)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-70">Смены</p>
              <p className="font-semibold">{stats.shifts_count}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-70">Бонусы</p>
              <p className="font-semibold text-emerald-200">+{formatCurrency(stats.total_bonuses)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-70">Штрафы</p>
              <p className="font-semibold text-rose-200">-{formatCurrency(stats.total_penalties)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Adjustments */}
      {adjustments.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-tg-hint mb-2">Бонусы и штрафы за месяц</h3>
          <div className="space-y-2">
            {adjustments.map((adj) => (
              <div key={adj.id} className="bg-tg-secondary-bg rounded-xl p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  adj.type === 'bonus'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                    : 'bg-rose-50 dark:bg-rose-900/20'
                }`}>
                  {adj.type === 'bonus' ? (
                    <Gift className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-tg-text text-sm">{adj.reason}</p>
                  <p className="text-tg-hint text-xs">
                    {adj.creator_name && `от ${adj.creator_name} · `}
                    {new Date(adj.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <p className={`font-semibold text-sm ${
                  adj.type === 'bonus' ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  {adj.type === 'bonus' ? '+' : '-'}{formatCurrency(adj.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal audit log */}
      {auditLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-tg-hint mb-2">Последние действия</h3>
          <div className="space-y-2">
            {auditLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="bg-tg-secondary-bg rounded-xl p-3 flex items-start gap-3">
                <History className="w-4 h-4 text-tg-hint mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-tg-text text-sm">
                    {log.action === 'shift_created' && 'Создал смену'}
                    {log.action === 'shift_approved' && 'Смена одобрена'}
                    {log.action === 'shift_edited' && 'Смена отредактирована'}
                    {log.action === 'bonus_added' && 'Начислен бонус'}
                    {log.action === 'penalty_added' && 'Наложен штраф'}
                  </p>
                  <p className="text-tg-hint text-xs">
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
        </div>
      )}
    </div>
  );
}
