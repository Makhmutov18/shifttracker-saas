import React from 'react';
import { ArrowRight, Clock, History, PlusCircle, ShieldCheck, Wallet } from 'lucide-react';
import { User as UserType } from '../utils/api';
import { useStats } from '../hooks/useStats';
import { formatCurrency } from '../utils/helpers';
import { getTelegramUser } from '../utils/telegram';
import UserAvatar from '../components/UserAvatar';
import { canAccessOwnerPanel } from '../utils/permissions';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';

interface Props {
  user: UserType;
  onNavigate: (page: Page) => void;
}

function getPayModelSummary(user: UserType) {
  if (user.pay_model === 'hourly') {
    return `${formatCurrency(user.hourly_rate)}/ч`;
  }
  if (user.pay_model === 'fixed_shift') {
    return `${formatCurrency(user.hourly_rate)}/смена`;
  }
  if (user.pay_model === 'revenue') {
    return `${user.revenue_percentage}% от выручки`;
  }
  return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage}%`;
}

function toNumber(value: string | null | undefined) {
  const parsed = Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPeriodLabel() {
  const label = new Date().toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading, error } = useStats();
  const telegramUser = getTelegramUser();
  const showManagement = canAccessOwnerPanel(user);

  const totalEarned = stats ? toNumber(stats.total_earned) : 0;
  const totalBonuses = stats ? toNumber(stats.total_bonuses) : 0;
  const totalPenalties = stats ? toNumber(stats.total_penalties) : 0;
  const totalExpenses = stats ? toNumber(stats.total_expenses) : 0;
  const payout = (totalEarned + totalBonuses - totalPenalties - totalExpenses).toFixed(2);
  const statusLabel = loading ? 'Сводка обновляется' : error ? 'Сводка недоступна' : 'За текущий месяц';

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] pt-6">
      <button
        type="button"
        onClick={() => onNavigate('profile')}
        className="glass-header flex w-full items-center justify-between rounded-[1.4rem] p-4 text-left active:scale-[0.98] transition-transform"
      >
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar
            name={user.name}
            photoUrl={telegramUser?.photo_url}
            sizeClassName="h-12 w-12"
            textClassName="text-sm"
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-tg-text">{user.name}</h1>
            <p className="truncate text-sm text-tg-hint">
              {user.venue?.name?.trim() || 'Основная точка'} · {getPayModelSummary(user)}
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-tg-hint" />
      </button>

      <section className="hero-card rounded-[1.7rem] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-tg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-tg-primary">
              <Wallet className="h-3.5 w-3.5" />
              <span>{statusLabel}</span>
            </div>
            <div>
              <p className="text-sm text-tg-hint">Итого к выплате за {formatPeriodLabel()}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-tg-text">
                {loading ? '—' : formatCurrency(payout)}
              </p>
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tg-primary/10 text-tg-primary">
            <Wallet className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="surface-muted rounded-2xl px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-tg-hint">Часы</p>
            <p className="mt-1 text-sm font-semibold text-tg-text">{loading || !stats ? '—' : `${stats.total_hours} ч`}</p>
          </div>
          <div className="surface-muted rounded-2xl px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-tg-hint">Смены</p>
            <p className="mt-1 text-sm font-semibold text-tg-text">{loading || !stats ? '—' : stats.shifts_count}</p>
          </div>
          <div className="surface-muted rounded-2xl px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-tg-hint">Период</p>
            <p className="mt-1 truncate text-sm font-semibold text-tg-text">{formatPeriodLabel()}</p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-xs text-rose-500">{error}</p>
        ) : (
          <p className="mt-4 text-xs text-tg-hint">Данные за текущий месяц обновляются автоматически после сохранения смен.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('shift')}
          className="surface-card col-span-2 flex items-center justify-between gap-4 rounded-[1.45rem] px-4 py-4 text-left active:scale-[0.98] transition-transform"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-tg-text">Создать смену</p>
            <p className="mt-1 text-xs text-tg-hint">Быстрый вход в рабочий поток без лишних экранов.</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tg-primary text-white">
            <PlusCircle className="h-5 w-5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className="surface-card flex items-center gap-3 rounded-[1.35rem] px-4 py-4 text-left active:scale-[0.98] transition-transform"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-tg-primary/10 text-tg-primary">
            <History className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-tg-text">История</p>
            <p className="mt-0.5 text-xs text-tg-hint">Смены, расходы и выплаты</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className="surface-card flex items-center gap-3 rounded-[1.35rem] px-4 py-4 text-left active:scale-[0.98] transition-transform"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-tg-primary/10 text-tg-primary">
            <Clock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-tg-text">Выплаты</p>
            <p className="mt-0.5 text-xs text-tg-hint">Сводка за текущий месяц</p>
          </div>
        </button>

        {showManagement ? (
          <button
            type="button"
            onClick={() => onNavigate('owner')}
            className="surface-card col-span-2 flex items-center justify-between gap-4 rounded-[1.45rem] px-4 py-4 text-left active:scale-[0.98] transition-transform"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tg-text">Управление</p>
              <p className="mt-1 text-xs text-tg-hint">Команда, точки и approve flow</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tg-primary/10 text-tg-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </button>
        ) : null}
      </section>
    </div>
  );
}
