import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { getPayrollSummary, type PayrollSummary, type User as UserType } from '../utils/api';
import { useStats } from '../hooks/useStats';
import { formatCurrency, formatDate, formatHours, formatTime } from '../utils/helpers';
import { useShifts } from '../hooks/useShifts';
import { getTelegramUser } from '../utils/telegram';
import UserAvatar from '../components/UserAvatar';
import { canAccessOwnerPanel, hasPermission } from '../utils/permissions';

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
    return `${user.revenue_percentage || '0'}% от выручки`;
  }
  return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage || '0'}%`;
}

function getCurrentMonthLabel() {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date());
}

function getShiftStatusLabel(status?: string) {
  return SHIFT_STATUS_LABELS[status || ''] || 'Статус обновляется';
}

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading: statsLoading, error: statsError } = useStats();
  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts();
  const telegramUser = getTelegramUser();
  const canApproveShifts = canAccessOwnerPanel(user) || hasPermission(user, 'can_approve_shifts');
  const [summary, setSummary] = useState<Pick<PayrollSummary, 'pending_shifts_count' | 'approved_shifts_count'> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  const latestShift = useMemo(() => {
    return [...(shifts || [])]
      .filter((shift) => Boolean(shift?.date) && shift.user_id === user.id)
      .sort((left, right) => {
        const dateOrder = (right.date || '').localeCompare(left.date || '');
        if (dateOrder !== 0) return dateOrder;
        return (right.created_at || '').localeCompare(left.created_at || '');
      })[0] || null;
  }, [shifts, user.id]);

  useEffect(() => {
    if (!canApproveShifts) {
      setSummary(null);
      setSummaryError(false);
      return;
    }

    let cancelled = false;
    const now = new Date();

    setSummaryLoading(true);
    setSummaryError(false);
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
          setSummaryError(true);
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

  const monthLabel = getCurrentMonthLabel();
  const venueName = user.venue?.name?.trim() || 'Основная точка';
  const personalAccrualLabel = canApproveShifts
    ? `Мои начисления за ${monthLabel}`
    : `Начислено за ${monthLabel}`;
  const pendingCount = summary?.pending_shifts_count ?? 0;
  const shiftTime = latestShift
    ? [latestShift.start_time && formatTime(latestShift.start_time), latestShift.end_time && formatTime(latestShift.end_time)]
        .filter(Boolean)
        .join('–')
    : '';

  return (
    <div className="dashboard-page mx-auto max-w-lg px-4 pb-6 pt-5">
      <header className="dashboard-profile-header">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-tg-text">{user.name || 'Сотрудник'}</h1>
          <p className="mt-1 truncate text-sm text-tg-hint">
            {venueName} · {getPayModelSummary(user)}
          </p>
        </div>
        <button
          type="button"
          className="dashboard-avatar-button"
          onClick={() => onNavigate('profile')}
          aria-label="Открыть профиль"
        >
          <UserAvatar
            name={user.name || 'Сотрудник'}
            photoUrl={user.telegram_photo_url || telegramUser?.photo_url}
            sizeClassName="h-11 w-11"
            textClassName="text-sm"
          />
        </button>
      </header>

      {canApproveShifts && (summaryLoading || summaryError || pendingCount > 0) && (
        <section aria-label="Смены на подтверждении">
          {summaryLoading ? (
            <div className="dashboard-compact-state">
              <span>Проверяем сводку команды…</span>
            </div>
          ) : summaryError ? (
            <div className="dashboard-compact-state">
              <span>Сводка команды недоступна</span>
            </div>
          ) : (
            <div className="dashboard-attention">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-tg-text">Смены на подтверждении</p>
                <p className="mt-0.5 text-sm text-tg-hint">Ожидают решения: {pendingCount}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('owner', { ownerTab: 'approve' })}
                className="dashboard-attention-action"
              >
                Проверить
              </button>
            </div>
          )}
        </section>
      )}

      <section className="dashboard-finance" aria-labelledby="dashboard-finance-title">
        <p id="dashboard-finance-title" className="text-sm text-tg-hint">{personalAccrualLabel}</p>
        <p className="dashboard-amount" aria-live="polite">
          {statsLoading || !stats ? '—' : formatCurrency(stats.total_payout)}
        </p>

        <div className="dashboard-finance-metrics">
          <div className="dashboard-finance-metric">
            <span>Часы</span>
            <strong>{statsLoading || !stats ? '—' : formatHours(stats.total_hours)}</strong>
          </div>
          <div className="dashboard-finance-metric">
            <span>Смены</span>
            <strong>{statsLoading || !stats ? '—' : stats.shifts_count}</strong>
          </div>
        </div>

        {statsError && <p className="dashboard-inline-error">Сводка начислений временно недоступна</p>}
      </section>

      <section className="dashboard-latest" aria-labelledby="dashboard-latest-title">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-latest-title" className="text-lg font-semibold text-tg-text">Последняя смена</h2>
        </div>

        {shiftsLoading ? (
          <div className="dashboard-shift-loading" aria-label="Загружаем последнюю смену">
            <span />
            <span />
          </div>
        ) : shiftsError ? (
          <p className="dashboard-inline-error">Не удалось загрузить последнюю смену</p>
        ) : latestShift ? (
          <button
            type="button"
            className="dashboard-shift-row"
            onClick={() => onNavigate('history')}
            aria-label={`Открыть историю. Последняя смена ${formatDate(latestShift.date)}, ${getShiftStatusLabel(latestShift.status)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-tg-text">{formatDate(latestShift.date)}</p>
                <p className="mt-1 text-sm text-tg-hint">
                  {[shiftTime, formatHours(latestShift.total_hours)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="dashboard-shift-status" data-status={latestShift.status}>
                {getShiftStatusLabel(latestShift.status)}
              </span>
            </div>

            <div className="dashboard-shift-footer">
              <p className="text-sm text-tg-hint">
                {latestShift.status === 'approved' ? (
                  <>Начислено: <strong className="font-semibold text-tg-text">{formatCurrency(latestShift.salary_earned)}</strong></>
                ) : latestShift.status === 'pending' ? (
                  <>Предварительно: <strong className="font-semibold text-tg-text">{formatCurrency(latestShift.salary_earned)}</strong></>
                ) : (
                  'Не входит в начисления'
                )}
              </p>
              <span className="dashboard-history-link">
                История
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
          </button>
        ) : (
          <div className="dashboard-empty-shift">
            <p className="font-medium text-tg-text">Смен пока нет</p>
            <p className="mt-1 text-sm text-tg-hint">Первая смена появится здесь после сохранения.</p>
          </div>
        )}
      </section>
    </div>
  );
}
