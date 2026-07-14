import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, ShieldCheck, Wallet } from 'lucide-react';
import { User as UserType } from '../utils/api';
import { getPayrollSummary, type PayrollSummary } from '../utils/api';
import { useStats } from '../hooks/useStats';
import { formatCurrency, formatDate } from '../utils/helpers';
import { useShifts } from '../hooks/useShifts';
import { getTelegramUser } from '../utils/telegram';
import UserAvatar from '../components/UserAvatar';
import { canAccessOwnerPanel } from '../utils/permissions';
import { hasPermission } from '../utils/permissions';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';
type OwnerPanelTab = 'invite' | 'approve' | 'adjust' | 'audit' | 'team' | 'venues';
type NavigationOptions = {
  ownerTab?: OwnerPanelTab;
};

interface Props {
  user: UserType;
  onNavigate: (page: Page, options?: NavigationOptions) => void;
}

const SHIFT_STATUS_LABELS: Record<string, string> = {
  pending: 'На подтверждении',
  approved: 'Утверждена',
  rejected: 'Отклонена',
};

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

function getShiftStatusLabel(status?: string) {
  return SHIFT_STATUS_LABELS[status || ''] || 'Статус обновляется';
}

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading, error } = useStats();
  const { shifts, loading: shiftsLoading } = useShifts();
  const telegramUser = getTelegramUser();
  const showManagement = canAccessOwnerPanel(user);
  const canApproveShifts = showManagement || hasPermission(user, 'can_approve_shifts');
  const [summary, setSummary] = useState<Pick<PayrollSummary, 'pending_shifts_count' | 'approved_shifts_count'> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const payout = stats ? toNumber(stats.total_payout).toFixed(2) : '0.00';
  const statusLabel = loading ? 'Сводка обновляется' : error ? 'Сводка недоступна' : 'За текущий месяц';
  const latestShift = useMemo(() => {
    return [...(shifts || [])]
      .filter((shift) => Boolean(shift && shift.date))
      .sort((left, right) => {
        const rightCreated = new Date(right.created_at || right.date || 0).getTime();
        const leftCreated = new Date(left.created_at || left.date || 0).getTime();
        return rightCreated - leftCreated;
      })[0] || null;
  }, [shifts]);

  useEffect(() => {
    if (!canApproveShifts) {
      return;
    }

    let cancelled = false;
    const now = new Date();

    setSummaryLoading(true);
    getPayrollSummary(now.getMonth() + 1, now.getFullYear())
      .then((data) => {
        if (!cancelled) {
          setSummary({
            pending_shifts_count: data.pending_shifts_count ?? 0,
            approved_shifts_count: data.approved_shifts_count ?? 0,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canApproveShifts]);

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-6 pt-6">
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
              <p className="text-sm text-tg-hint">Начислено за {formatPeriodLabel()}</p>
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

      <section className="surface-card rounded-[1.4rem] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-tg-primary/10 text-tg-primary">
            {canApproveShifts ? <ShieldCheck className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate text-sm font-semibold text-tg-text">
                {canApproveShifts ? 'Смены ждут подтверждения' : 'Что дальше'}
              </h2>
              <span className="shrink-0 rounded-full bg-tg-secondary-bg px-2.5 py-1 text-[11px] font-medium text-tg-hint">
                {canApproveShifts ? 'Для вас' : 'Личный статус'}
              </span>
            </div>

            {canApproveShifts ? (
              <>
                {summaryLoading ? (
                  <p className="mt-2 text-sm text-tg-hint">Проверяем сводку на текущий месяц…</p>
                ) : (summary?.pending_shifts_count ?? 0) > 0 ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-tg-text">
                      {summary?.pending_shifts_count} смен{summary?.pending_shifts_count === 1 ? 'а' : ''} ждут подтверждения.
                    </p>
                    <p className="text-xs text-tg-hint">Можно открыть утверждение и быстро проверить новые заявки.</p>
                    <button
                      type="button"
                      onClick={() => onNavigate('owner', { ownerTab: 'approve' })}
                      className="inline-flex items-center justify-center rounded-full bg-tg-primary px-3.5 py-2 text-xs font-medium text-tg-button-text transition-transform active:scale-[0.98]"
                    >
                      Открыть утверждение
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-tg-hint">Смен на подтверждении нет.</p>
                )}
              </>
            ) : shiftsLoading ? (
              <p className="mt-2 text-sm text-tg-hint">Последние данные обновляются после сохранения смены.</p>
            ) : latestShift ? (
              <div className="mt-2 space-y-1.5 text-sm">
                <p className="text-tg-text">
                  Последняя смена: {formatDate(latestShift.date)} · {getShiftStatusLabel(latestShift.status)}
                </p>
                <p className="text-tg-hint">
                  {latestShift.status === 'approved'
                    ? 'Смена учтена в начислениях.'
                    : latestShift.status === 'rejected'
                      ? 'Смена не входит в начисления.'
                      : 'После подтверждения она войдёт в начисления.'}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-tg-hint">Создайте смену после рабочего дня — так сводка будет точнее.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
