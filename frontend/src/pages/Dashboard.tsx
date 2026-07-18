import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, LoaderCircle, Sparkles } from 'lucide-react';
import {
  ApiRequestError,
  generateAiWeeklySummary,
  getPayrollSummary,
  getShifts,
  type AiWeeklySummary,
  type PayrollSummary,
  type Shift,
  type User as UserType,
} from '../utils/api';
import { useStats } from '../hooks/useStats';
import { formatCurrency, formatDate, formatHours, formatTime } from '../utils/helpers';
import { useShifts } from '../hooks/useShifts';
import { getTelegramUser } from '../utils/telegram';
import UserAvatar from '../components/UserAvatar';
import { canAccessOwnerPanel, hasPermission } from '../utils/permissions';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';
type OwnerPanelTab = 'invite' | 'approve' | 'adjust' | 'audit' | 'team' | 'venues';
type NavigationOptions = { ownerTab?: OwnerPanelTab };

interface Props {
  user: UserType;
  onNavigate: (page: Page, options?: NavigationOptions) => void;
}

const SHIFT_STATUS_LABELS: Record<string, string> = {
  pending: 'На подтверждении',
  approved: 'Утверждена',
  rejected: 'Отклонена',
};

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getPayModelSummary(user: UserType) {
  if (user.pay_model === 'hourly') return `${formatCurrency(user.hourly_rate)}/ч`;
  if (user.pay_model === 'fixed_shift') return `${formatCurrency(user.hourly_rate)}/смена`;
  if (user.pay_model === 'revenue') return `${user.revenue_percentage || '0'}% от выручки`;
  return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage || '0'}%`;
}

function getCurrentMonthLabel() {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date());
}

function getGreeting(name: string) {
  const hour = new Date().getHours();
  const firstName = name.trim().split(/\s+/)[0] || 'сотрудник';
  if (hour >= 5 && hour < 12) return `Доброе утро, ${firstName}`;
  if (hour >= 12 && hour < 18) return `Добрый день, ${firstName}`;
  if (hour >= 18 && hour < 23) return `Добрый вечер, ${firstName}`;
  return `Доброй ночи, ${firstName}`;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getCurrentWeek() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  return { days, startKey: toDateKey(days[0]), endKey: toDateKey(days[6]), todayKey: toDateKey(today) };
}

function getShiftStatusLabel(status?: string) {
  return SHIFT_STATUS_LABELS[status || ''] || 'Статус обновляется';
}

function deduplicateShifts(items: Shift[]) {
  const unique = new Map<string, Shift>();
  items.forEach((shift) => {
    const key = shift.id || `${shift.user_id}-${shift.date}-${shift.created_at}`;
    unique.set(key, shift);
  });
  return Array.from(unique.values());
}

function getAiSummaryError(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 503) return 'Умная сводка временно недоступна';
  if (error instanceof ApiRequestError && error.status === 504) return 'Подготовка заняла слишком много времени';
  return 'Не удалось сформировать сводку';
}

function formatGeneratedTime(value: string) {
  const generatedAt = new Date(value);
  if (Number.isNaN(generatedAt.getTime())) return 'Сформировано недавно';
  return `Сформировано в ${generatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatEmployeeCount(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return `${count} сотрудников`;
  if (remainder10 === 1) return `${count} сотрудник`;
  if (remainder10 >= 2 && remainder10 <= 4) return `${count} сотрудника`;
  return `${count} сотрудников`;
}

function formatShiftCount(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 14) return `${count} смен`;
  if (remainder10 === 1) return `${count} смена`;
  if (remainder10 >= 2 && remainder10 <= 4) return `${count} смены`;
  return `${count} смен`;
}

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading: statsLoading, error: statsError } = useStats();
  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts();
  const telegramUser = getTelegramUser();
  const canApproveShifts = canAccessOwnerPanel(user) || hasPermission(user, 'can_approve_shifts');
  const canUseAiSummary = user.role === 'owner' || user.role === 'admin';
  const [summary, setSummary] = useState<Pick<PayrollSummary, 'pending_shifts_count' | 'approved_shifts_count'> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [extraWeekShifts, setExtraWeekShifts] = useState<Shift[]>([]);
  const [extraWeekLoading, setExtraWeekLoading] = useState(false);
  const [extraWeekError, setExtraWeekError] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiWeeklySummary | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const week = useMemo(getCurrentWeek, []);

  const personalShifts = useMemo(
    () => (Array.isArray(shifts) ? shifts : []).filter((shift) => shift.user_id === user.id),
    [shifts, user.id],
  );

  const latestShift = useMemo(() => [...personalShifts].sort((left, right) => {
    const dateOrder = (right.date || '').localeCompare(left.date || '');
    return dateOrder || (right.created_at || '').localeCompare(left.created_at || '');
  })[0] || null, [personalShifts]);

  useEffect(() => {
    const current = new Date();
    const currentMonthKey = `${current.getFullYear()}-${current.getMonth() + 1}`;
    const missingMonths = Array.from(new Set(week.days.map((day) => `${day.getFullYear()}-${day.getMonth() + 1}`)))
      .filter((key) => key !== currentMonthKey);

    if (!missingMonths.length) {
      setExtraWeekShifts([]);
      setExtraWeekError(false);
      return;
    }

    let cancelled = false;
    setExtraWeekLoading(true);
    setExtraWeekError(false);
    Promise.allSettled(missingMonths.map((key) => {
      const [year, month] = key.split('-').map(Number);
      return getShifts(month, year);
    })).then((results) => {
      if (cancelled) return;
      const loaded = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
      setExtraWeekShifts(loaded);
      setExtraWeekError(results.some((result) => result.status === 'rejected'));
    }).finally(() => {
      if (!cancelled) setExtraWeekLoading(false);
    });

    return () => { cancelled = true; };
  }, [week.days]);

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
        if (!cancelled) setSummary({
          pending_shifts_count: data.pending_shifts_count ?? 0,
          approved_shifts_count: data.approved_shifts_count ?? 0,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => { cancelled = true; };
  }, [canApproveShifts]);

  const weekShifts = useMemo(() => deduplicateShifts([
    ...(Array.isArray(shifts) ? shifts : []),
    ...extraWeekShifts,
  ]).filter((shift) => shift.user_id === user.id && shift.date >= week.startKey && shift.date <= week.endKey), [extraWeekShifts, shifts, user.id, week.endKey, week.startKey]);
  const countedWeekShifts = weekShifts.filter((shift) => shift.status === 'approved' || shift.status === 'pending');
  const weekHours = countedWeekShifts.reduce((total, shift) => total + Number(shift.total_hours || 0), 0);
  const weekAmount = countedWeekShifts.reduce((total, shift) => total + Number(shift.salary_earned || 0), 0);
  const weekHasPending = countedWeekShifts.some((shift) => shift.status === 'pending');
  const personalPendingCount = personalShifts.filter((shift) => shift.status === 'pending').length;
  const weekIsLoading = shiftsLoading || extraWeekLoading;
  const weekHasError = Boolean(shiftsError) || extraWeekError;
  const monthLabel = getCurrentMonthLabel();
  const venueName = user.venue?.name?.trim() || 'Основная точка';
  const paySummary = getPayModelSummary(user);
  const pendingCount = summary?.pending_shifts_count ?? 0;
  const latestVenueName = latestShift?.venue_name?.trim() || 'Точка не указана';
  const shiftTime = latestShift
    ? [latestShift.start_time && formatTime(latestShift.start_time), latestShift.end_time && formatTime(latestShift.end_time)].filter(Boolean).join('–')
    : '';
  const financeStatus = statsLoading || shiftsLoading
    ? 'Обновляем данные'
    : statsError || shiftsError
    ? 'Не все данные удалось обновить'
    : personalPendingCount > 0
    ? 'Есть смена на подтверждении'
    : 'Все утверждённые смены учтены';

  const handleGenerateAiSummary = async () => {
    if (aiSummaryLoading) return;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const generated = await generateAiWeeklySummary(week.startKey, week.endKey);
      setAiSummary(generated);
    } catch (error) {
      setAiSummaryError(getAiSummaryError(error));
    } finally {
      setAiSummaryLoading(false);
    }
  };

  return (
    <div className="dashboard-page mx-auto max-w-lg px-4 pb-6 pt-5">
      <header className="dashboard-profile-header">
        <div className="min-w-0 flex-1">
          <h1 className="dashboard-greeting">{getGreeting(user.name || 'Сотрудник')}</h1>
          <p className="dashboard-profile-context" aria-label={`Основная точка: ${venueName}. Условия оплаты: ${paySummary}`}>
            {venueName} · {paySummary}
          </p>
        </div>
        <button type="button" className="dashboard-avatar-button" onClick={() => onNavigate('profile')} aria-label="Открыть профиль">
          <UserAvatar name={user.name || 'Сотрудник'} photoUrl={user.telegram_photo_url || telegramUser?.photo_url} sizeClassName="h-11 w-11" textClassName="text-sm" />
        </button>
      </header>

      <section className="dashboard-finance" aria-labelledby="dashboard-finance-title">
        <span className="dashboard-month-label">{monthLabel}</span>
        <p id="dashboard-finance-title" className="dashboard-finance-title">Мои начисления</p>
        <p className="dashboard-amount" aria-live="polite">{statsLoading || !stats ? '—' : formatCurrency(stats.total_payout)}</p>
        <div className="dashboard-finance-metrics">
          <div className="dashboard-finance-metric"><span>Часы</span><strong>{statsLoading || !stats ? '—' : formatHours(stats.total_hours)}</strong></div>
          <div className="dashboard-finance-metric"><span>Смены</span><strong>{statsLoading || !stats ? '—' : stats.shifts_count}</strong></div>
          <div className="dashboard-finance-metric"><span>Условия</span><strong>{paySummary}</strong></div>
        </div>
        <p className="dashboard-finance-status" data-warning={personalPendingCount > 0 || Boolean(statsError) || Boolean(shiftsError)}>{financeStatus}</p>
      </section>

      <button type="button" className="dashboard-week" onClick={() => onNavigate('history')} aria-label="Открыть историю смен за эту неделю">
        <span className="dashboard-section-heading"><span className="dashboard-week-title">Эта неделя</span><ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
        <span className="dashboard-week-days" aria-hidden="true">
          {week.days.map((day, index) => {
            const dayKey = toDateKey(day);
            const dayShifts = weekShifts.filter((shift) => shift.date === dayKey);
            const dayStatus = dayShifts.some((shift) => shift.status === 'approved')
              ? 'approved'
              : dayShifts.some((shift) => shift.status === 'pending')
              ? 'pending'
              : dayShifts.some((shift) => shift.status === 'rejected')
              ? 'rejected'
              : 'empty';
            return <span className="dashboard-week-day" data-today={dayKey === week.todayKey} data-status={dayStatus} key={dayKey}>
              <small>{WEEKDAY_LABELS[index]}</small><strong>{day.getDate()}</strong><i />
            </span>;
          })}
        </span>
        <span className="dashboard-week-summary">
          {weekIsLoading ? <strong>Обновляем смены недели…</strong> : countedWeekShifts.length ? <>
            <strong>{countedWeekShifts.length} {countedWeekShifts.length === 1 ? 'смена' : countedWeekShifts.length < 5 ? 'смены' : 'смен'} · {formatHours(weekHours)} · {formatCurrency(weekAmount)}</strong>
            {weekHasPending && <small>Включая предварительные начисления</small>}
            {weekHasError && <small>Часть данных недели недоступна</small>}
          </> : weekHasError ? <strong>Данные недели временно недоступны</strong> : <strong>На этой неделе смен пока нет</strong>}
        </span>
      </button>

      {canUseAiSummary && (
        <section className="dashboard-ai-summary" aria-labelledby="dashboard-ai-summary-title" aria-busy={aiSummaryLoading}>
          <div className="dashboard-ai-summary-heading">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="dashboard-ai-summary-title">Умная сводка</h2>
              {aiSummary && <p>{formatGeneratedTime(aiSummary.generated_at)}</p>}
            </div>
          </div>

          {aiSummary ? (
            <div className="dashboard-ai-summary-result" aria-live="polite">
              <h3>{aiSummary.headline || 'Сводка готова'}</h3>
              <p className="dashboard-ai-summary-text">{aiSummary.summary || 'Данные недели собраны.'}</p>
              <p className="dashboard-ai-summary-metrics">
                {formatShiftCount(aiSummary.metrics.approved_shifts_count)} · {formatHours(aiSummary.metrics.approved_hours)} · {formatCurrency(aiSummary.metrics.approved_accruals)} · {formatEmployeeCount(aiSummary.metrics.unique_worked_employees_count)}
              </p>
              {(aiSummary.metrics.pending_shifts_count > 0 || aiSummary.metrics.cross_venue_shifts_count > 0) && (
                <div className="dashboard-ai-summary-signals">
                  {aiSummary.metrics.pending_shifts_count > 0 && <span>На подтверждении: {aiSummary.metrics.pending_shifts_count}</span>}
                  {aiSummary.metrics.cross_venue_shifts_count > 0 && <span>На других точках: {formatShiftCount(aiSummary.metrics.cross_venue_shifts_count)}</span>}
                </div>
              )}
              {aiSummary.attention.length > 0 && (
                <div className="dashboard-ai-summary-list">
                  <h4>Обратить внимание</h4>
                  <ul>{aiSummary.attention.slice(0, 3).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </div>
              )}
              {aiSummary.actions.length > 0 && (
                <div className="dashboard-ai-summary-list">
                  <h4>Что проверить</h4>
                  <ul>{aiSummary.actions.slice(0, 3).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </div>
              )}
              <p className="dashboard-ai-summary-disclaimer">Сводка создана ИИ на основе агрегированных данных приложения. Важные решения стоит перепроверять.</p>
            </div>
          ) : (
            <div className="dashboard-ai-summary-intro">
              <p>ИИ кратко разберёт смены и управленческие задачи этой недели.</p>
              <small>Используются агрегированные данные приложения без персональных данных сотрудников.</small>
            </div>
          )}

          {aiSummaryLoading && !aiSummary && (
            <div className="dashboard-ai-summary-loading" aria-live="polite">
              <span /><span /><span />
            </div>
          )}

          <div className="dashboard-ai-summary-footer">
            {aiSummaryError && <p role="alert">{aiSummaryError}</p>}
            <button type="button" onClick={handleGenerateAiSummary} disabled={aiSummaryLoading}>
              {aiSummaryLoading && <LoaderCircle className="dashboard-ai-summary-spinner h-4 w-4" aria-hidden="true" />}
              {aiSummaryLoading ? 'Анализируем неделю…' : aiSummary ? 'Обновить сводку' : aiSummaryError ? 'Попробовать снова' : 'Сформировать сводку'}
            </button>
          </div>
        </section>
      )}

      <section className="dashboard-latest" aria-labelledby="dashboard-latest-title">
        <div className="dashboard-section-heading"><h2 id="dashboard-latest-title">Последняя смена</h2></div>
        {shiftsLoading ? (
          <div className="dashboard-shift-loading" aria-label="Загружаем последнюю смену"><span /><span /></div>
        ) : shiftsError ? (
          <p className="dashboard-inline-error">Не удалось загрузить последнюю смену</p>
        ) : latestShift ? (
          <button type="button" className="dashboard-shift-row" onClick={() => onNavigate('history')} aria-label={`Открыть историю. Последняя смена ${formatDate(latestShift.date)}, ${getShiftStatusLabel(latestShift.status)}`}>
            <div className="dashboard-shift-main">
              <p>{latestVenueName}</p>
              <span>{[formatDate(latestShift.date), shiftTime, formatHours(latestShift.total_hours)].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="dashboard-shift-footer">
              <span className="dashboard-shift-status" data-status={latestShift.status}>{getShiftStatusLabel(latestShift.status)}</span>
              <strong>{latestShift.status === 'rejected' ? 'Не начислено' : formatCurrency(latestShift.salary_earned)}</strong>
              <ChevronRight className="dashboard-shift-chevron h-4 w-4" aria-hidden="true" />
            </div>
          </button>
        ) : (
          <div className="dashboard-empty-shift"><p className="font-medium text-tg-text">Смен пока нет</p><p className="mt-1 text-sm text-tg-hint">Первая смена появится здесь после сохранения.</p></div>
        )}
      </section>

      {canApproveShifts && (summaryLoading || summaryError || pendingCount > 0) && (
        <section aria-label="Смены на подтверждении">
          {summaryLoading ? <div className="dashboard-compact-state"><span>Проверяем сводку команды…</span></div> : summaryError ? <div className="dashboard-compact-state"><span>Сводка команды недоступна</span></div> : (
            <div className="dashboard-attention">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-tg-text">Требуют подтверждения</p><p className="mt-0.5 text-sm text-tg-hint">{pendingCount} {pendingCount === 1 ? 'смена ожидает' : pendingCount < 5 ? 'смены ожидают' : 'смен ожидают'} решения</p></div>
              <button type="button" onClick={() => onNavigate('owner', { ownerTab: 'approve' })} className="dashboard-attention-action">Проверить</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
