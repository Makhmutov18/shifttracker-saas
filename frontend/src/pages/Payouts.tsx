import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, CircleAlert, Wallet } from 'lucide-react';
import { PersonalPayrollRun, User, getMonthlyStats, getMyPayrollRuns } from '../utils/api';
import { useShifts } from '../hooks/useShifts';
import {
  getCurrentMonth,
  getCurrentYear,
  formatCurrency,
  formatDate,
  formatHours,
} from '../utils/helpers';
import { getErrorMessage } from '../utils/api';

interface Props {
  user: User;
}

type MonthOption = {
  value: string;
  label: string;
};

type ShiftStatus = 'pending' | 'approved' | 'rejected';

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function getShiftSortKey(date?: string, createdAt?: string) {
  const dateValue = date ? new Date(`${date}T00:00:00`).getTime() : 0;
  const createdValue = createdAt ? new Date(createdAt).getTime() : 0;
  return Number.isFinite(createdValue) && createdValue > 0 ? createdValue : Number.isFinite(dateValue) ? dateValue : 0;
}

function getStatusLabel(status: ShiftStatus | string) {
  if (status === 'approved') return 'Утверждена';
  if (status === 'rejected') return 'Отклонена';
  return 'На подтверждении';
}

function getPayoutLabel(status: ShiftStatus | string) {
  if (status === 'approved') return 'Начислено по утверждённым сменам';
  if (status === 'rejected') return 'Не входит в расчёт';
  return 'Предварительно';
}

function getStatusTone(status: ShiftStatus | string) {
  if (status === 'approved') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  if (status === 'rejected') {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300';
  }
  return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
}

function getPayoutTone(status: ShiftStatus | string) {
  if (status === 'approved') {
    return 'bg-tg-primary/10 text-tg-primary';
  }
  if (status === 'rejected') {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300';
  }
  return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
}

function PayoutRow({ date, hours, amount, status }: { date: string; hours: string | number; amount: string | number; status: ShiftStatus | string }) {
  return (
    <div className="surface-card rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-tg-text">{date || 'Дата не указана'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusTone(status)}`}>
              {getStatusLabel(status)}
            </span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${getPayoutTone(status)}`}>
              {getPayoutLabel(status)}
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-tg-text">{formatCurrency(amount)}</p>
          <p className="mt-1 text-xs text-tg-hint">{formatHours(hours)}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryMetric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="surface-muted rounded-[1.15rem] p-4">
      <p className="text-xs text-tg-hint">{title}</p>
      <p className="mt-1 text-sm font-semibold text-tg-text">{value}</p>
      <p className="mt-1 text-[11px] text-tg-hint">{hint}</p>
    </div>
  );
}

export default function Payouts({ user }: Props) {
  const [viewDate, setViewDate] = useState(() => ({
    month: getCurrentMonth(),
    year: getCurrentYear(),
  }));
  const [monthStats, setMonthStats] = useState<Awaited<ReturnType<typeof getMonthlyStats>> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [payrollRuns, setPayrollRuns] = useState<PersonalPayrollRun[]>([]);
  const [payrollRunsLoading, setPayrollRunsLoading] = useState(true);
  const [payrollRunsError, setPayrollRunsError] = useState<string | null>(null);

  const { month, year } = viewDate;
  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts(month, year);

  useEffect(() => {
    let cancelled = false;

    const loadPayrollRuns = async () => {
      try {
        setPayrollRunsLoading(true);
        setPayrollRunsError(null);
        const data = await getMyPayrollRuns();
        if (!cancelled) {
          setPayrollRuns(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          setPayrollRuns([]);
          setPayrollRunsError(getErrorMessage(error, 'Не удалось загрузить историю выплат.'));
        }
      } finally {
        if (!cancelled) {
          setPayrollRunsLoading(false);
        }
      }
    };

    loadPayrollRuns();

    return () => {
      cancelled = true;
    };
  }, []);

  const monthOptions = useMemo<MonthOption[]>(() => {
    const current = new Date(getCurrentYear(), getCurrentMonth() - 1, 1);
    return Array.from({ length: 18 }, (_, index) => {
      const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { value, label: formatMonthLabel(date) };
    });
  }, []);

  const currentMonthValue = `${year}-${String(month).padStart(2, '0')}`;
  const selectedMonthLabel =
    monthOptions.find((option) => option.value === currentMonthValue)?.label ?? formatMonthLabel(new Date(year, month - 1, 1));
  const isCurrentPeriod = month === getCurrentMonth() && year === getCurrentYear();

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        setStatsLoading(true);
        setStatsError(null);
        const data = await getMonthlyStats(month, year);
        if (!cancelled) {
          setMonthStats(data);
        }
      } catch (error) {
        if (!cancelled) {
          setMonthStats(null);
          setStatsError(getErrorMessage(error, 'Не удалось загрузить начисления.'));
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [month, year]);

  const monthShifts = useMemo(
    () =>
      [...(shifts ?? [])].sort((left, right) => {
        return getShiftSortKey(right.date, right.created_at) - getShiftSortKey(left.date, left.created_at);
      }),
    [shifts]
  );

  const approvedShifts = useMemo(() => monthShifts.filter((shift) => shift.status === 'approved'), [monthShifts]);
  const pendingShifts = useMemo(() => monthShifts.filter((shift) => shift.status === 'pending'), [monthShifts]);
  const rejectedShifts = useMemo(() => monthShifts.filter((shift) => shift.status === 'rejected'), [monthShifts]);

  const approvedAmount = useMemo(
    () => approvedShifts.reduce((total, shift) => total + toNumber(shift.salary_earned), 0),
    [approvedShifts]
  );
  const pendingAmount = useMemo(
    () => pendingShifts.reduce((total, shift) => total + toNumber(shift.salary_earned), 0),
    [pendingShifts]
  );
  const rejectedAmount = useMemo(
    () => rejectedShifts.reduce((total, shift) => total + toNumber(shift.salary_earned), 0),
    [rejectedShifts]
  );

  const totalPayout = useMemo(() => {
    if (!monthStats) {
      return 0;
    }

    return toNumber(monthStats.total_payout);
  }, [monthStats]);

  const totalHours = monthStats ? monthStats.total_hours : '0';
  const totalShifts = monthShifts.length;
  const approvedCount = approvedShifts.length;
  const pendingCount = pendingShifts.length;
  const rejectedCount = rejectedShifts.length;

  const resetToCurrent = () => {
    setViewDate({
      month: getCurrentMonth(),
      year: getCurrentYear(),
    });
  };

  const setSelectedMonth = (value: string) => {
    const [nextYear, nextMonth] = value.split('-').map(Number);
    if (!Number.isNaN(nextYear) && !Number.isNaN(nextMonth)) {
      setViewDate({ year: nextYear, month: nextMonth });
    }
  };

  const hasAnyShifts = monthShifts.length > 0;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] pt-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-tg-text">Выплаты</h1>
        <p className="text-sm text-tg-hint">Сводка по вашим сменам за выбранный месяц.</p>
        <p className="text-xs text-tg-hint">Показаны личные начисления для {user.name}.</p>
      </div>

      <section className="surface-card rounded-[1.4rem] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Период</p>
            <p className="mt-1 text-xs text-tg-hint">Выберите месяц, чтобы посмотреть начисления и список смен.</p>
          </div>
          <button
            type="button"
            onClick={resetToCurrent}
            disabled={isCurrentPeriod}
            className="surface-muted shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-tg-text disabled:opacity-60"
          >
            Текущий месяц
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-tg-hint">Месяц</label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tg-hint" />
            <select
              value={currentMonthValue}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-full rounded-xl border border-tg-border bg-tg-bg py-3 pl-10 pr-4 text-sm font-medium text-tg-text outline-none focus:ring-2 focus:ring-tg-primary/40"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-tg-hint">Сейчас выбран: {selectedMonthLabel}</p>
        </div>
      </section>

      <section className="surface-card rounded-[1.45rem] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Начислено за месяц</p>
            <p className="mt-1 text-xs text-tg-hint">Сводка считается по вашим сменам за {selectedMonthLabel}.</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-tg-primary/10 text-tg-primary">
            <Wallet className="h-5 w-5" />
          </div>
        </div>

        {statsLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-20 rounded-[1.35rem] bg-tg-bg/70" />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-20 rounded-[1.15rem] bg-tg-bg/70" />
              ))}
            </div>
          </div>
        ) : statsError ? (
          <div className="rounded-[1.2rem] bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-medium">Сводка начислений недоступна</p>
            <p className="mt-1 text-xs">{statsError}</p>
          </div>
        ) : (
          <>
            <div className="surface-muted rounded-[1.35rem] p-4">
              <p className="text-xs uppercase tracking-wide text-tg-hint">Начислено</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-tg-text">
                {formatCurrency(totalPayout)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-tg-hint">
                <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                  {formatHours(totalHours)}
                </span>
                <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                  {totalShifts} смен
                </span>
                <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                  {selectedMonthLabel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryMetric
                title="Утверждено"
                value={`${approvedCount} смен · ${formatCurrency(approvedAmount)}`}
                hint="Смены учтены в начислениях"
              />
              <SummaryMetric
                title="На подтверждении"
                value={`${pendingCount} смен · ${formatCurrency(pendingAmount)}`}
                hint="Это предварительная сумма"
              />
              <SummaryMetric
                title="Не входит в расчёт"
                value={`${rejectedCount} смен · ${formatCurrency(rejectedAmount)}`}
                hint="Отклонённые смены не учитываются"
              />
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Смены, влияющие на начисления</p>
            <p className="mt-1 text-xs text-tg-hint">Список показывает, как каждая смена попадает в расчёт.</p>
          </div>
          <p className="text-xs text-tg-hint">{hasAnyShifts ? `${monthShifts.length} смен` : 'Нет смен'}</p>
        </div>

        {shiftsLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-24 rounded-[1.15rem] bg-tg-bg/70" />
            ))}
          </div>
        ) : shiftsError ? (
          <div className="surface-card rounded-[1.4rem] px-4 py-10 text-center">
            <CircleAlert className="mx-auto mb-3 h-12 w-12 text-rose-400" />
            <p className="text-sm font-medium text-tg-text">Не удалось загрузить смены</p>
            <p className="mt-2 text-xs text-tg-hint">{shiftsError}</p>
          </div>
        ) : hasAnyShifts ? (
          <div className="space-y-3">
            {monthShifts.map((shift) => (
              <PayoutRow
                key={shift.id}
                date={shift.date ? formatDate(shift.date) : 'Дата не указана'}
                hours={shift.total_hours}
                amount={shift.salary_earned}
                status={shift.status}
              />
            ))}
          </div>
        ) : (
          <div className="surface-card rounded-[1.4rem] px-4 py-10 text-center">
            <Clock3 className="mx-auto mb-3 h-12 w-12 text-tg-hint opacity-50" />
            <p className="text-sm font-medium text-tg-text">За выбранный месяц начислений пока нет</p>
            <p className="mt-1 text-xs text-tg-hint">Когда появятся смены, они отобразятся здесь с суммой и статусом.</p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-medium text-tg-text">История выплат</p>
          <p className="mt-1 text-xs text-tg-hint">Здесь отображаются расчёты и фактические выплаты, зафиксированные работодателем.</p>
        </div>

        {payrollRunsLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((index) => (
              <div key={index} className="h-36 rounded-[1.15rem] bg-tg-bg/70" />
            ))}
          </div>
        ) : payrollRunsError ? (
          <div className="surface-card rounded-[1.4rem] px-4 py-6 text-center">
            <CircleAlert className="mx-auto mb-3 h-10 w-10 text-rose-400" />
            <p className="text-sm font-medium text-tg-text">Не удалось загрузить историю выплат</p>
            <p className="mt-2 text-xs text-tg-hint">{payrollRunsError}</p>
          </div>
        ) : payrollRuns.length === 0 ? (
          <div className="surface-card rounded-[1.4rem] px-4 py-8 text-center">
            <p className="text-sm font-medium text-tg-text">Истории выплат пока нет</p>
            <p className="mt-1 text-xs text-tg-hint">Здесь появятся выплаты, зафиксированные работодателем.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payrollRuns.map((run) => {
              const isPaid = run.status === 'paid';
              const hasPayments = (run.payments ?? []).length > 0;
              return (
                <article key={run.payroll_run_id} className="surface-card space-y-3 rounded-[1.25rem] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-tg-text">{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</p>
                      <p className="mt-1 text-xs text-tg-hint">{formatDate(run.period_start)} — {formatDate(run.period_end)}</p>
                      <p className="mt-1 text-xs text-tg-hint">{run.venue_name || 'Основная точка'}</p>
                    </div>
                    <span className="shrink-0 rounded-full surface-muted px-2.5 py-1 text-[11px] font-medium text-tg-text">
                      {isPaid ? 'Выплачено' : 'Ожидает выплаты'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <span className="text-tg-hint">Начислено <b className="mt-0.5 block text-sm text-tg-text">{formatCurrency(run.final_amount)}</b></span>
                    <span className="text-tg-hint">Выплачено <b className="mt-0.5 block text-sm text-tg-text">{formatCurrency(run.paid_amount)}</b></span>
                    <span className="text-tg-hint">Осталось <b className="mt-0.5 block text-sm text-tg-text">{formatCurrency(run.remaining_amount)}</b></span>
                  </div>

                  {!hasPayments && !isPaid ? (
                    <p className="text-xs text-tg-hint">Выплата ещё не зафиксирована</p>
                  ) : (
                    <div className="space-y-2 border-t border-tg-hint/10 pt-3">
                      {(run.payments ?? []).map((payment, index) => (
                        <div key={`${run.payroll_run_id}-${payment.created_at}-${index}`} className="surface-muted rounded-xl px-3 py-2.5 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-tg-hint">{formatDate(payment.payment_date)}</span>
                            <b className="text-tg-text">{formatCurrency(payment.amount)}</b>
                          </div>
                          {payment.method && <p className="mt-1 text-tg-hint">Способ: {payment.method}</p>}
                          {payment.comment && <p className="mt-1 text-tg-hint">{payment.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
