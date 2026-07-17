import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, CircleAlert, Clock3 } from 'lucide-react';
import { PersonalPayrollRun, User, Venue, getActiveVenues, getErrorMessage, getMonthlyStats, getMyPayrollRuns } from '../utils/api';
import { useShifts } from '../hooks/useShifts';
import BottomSheet from '../components/BottomSheet';
import { formatCurrency, formatDate, formatHours, getCurrentMonth, getCurrentYear } from '../utils/helpers';

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
  return Number.isFinite(createdValue) && createdValue > 0
    ? createdValue
    : Number.isFinite(dateValue) ? dateValue : 0;
}

function getShiftPresentation(status: ShiftStatus | string) {
  if (status === 'approved') return { status: 'Утверждена', amount: 'Начислено' };
  if (status === 'rejected') return { status: 'Отклонена', amount: 'Не входит в начисления' };
  return { status: 'На подтверждении', amount: 'Предварительно' };
}

export default function Payouts({ user }: Props) {
  const periodButtonRef = useRef<HTMLButtonElement>(null);
  const initialMonthValue = `${getCurrentYear()}-${String(getCurrentMonth()).padStart(2, '0')}`;
  const [viewDate, setViewDate] = useState(() => ({ month: getCurrentMonth(), year: getCurrentYear() }));
  const [monthSheetOpen, setMonthSheetOpen] = useState(false);
  const [draftMonth, setDraftMonth] = useState(initialMonthValue);
  const [monthStats, setMonthStats] = useState<Awaited<ReturnType<typeof getMonthlyStats>> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [payrollRuns, setPayrollRuns] = useState<PersonalPayrollRun[]>([]);
  const [payrollRunsLoading, setPayrollRunsLoading] = useState(true);
  const [payrollRunsError, setPayrollRunsError] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);

  const { month, year } = viewDate;
  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts(month, year);
  const venueNames = useMemo(() => new Map(venues.map((venue) => [venue.id, venue.name])), [venues]);

  const monthOptions = useMemo<MonthOption[]>(() => {
    const current = new Date(getCurrentYear(), getCurrentMonth() - 1, 1);
    return Array.from({ length: 18 }, (_, index) => {
      const date = new Date(current.getFullYear(), current.getMonth() - index, 1);
      return {
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: formatMonthLabel(date),
      };
    });
  }, []);

  const currentMonthValue = `${year}-${String(month).padStart(2, '0')}`;
  const selectedMonthLabel =
    monthOptions.find((option) => option.value === currentMonthValue)?.label
    ?? formatMonthLabel(new Date(year, month - 1, 1));

  useEffect(() => {
    let cancelled = false;
    getActiveVenues()
      .then((data) => {
        if (!cancelled) setVenues(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setVenues([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPayrollRunsLoading(true);
    setPayrollRunsError(null);
    getMyPayrollRuns()
      .then((data) => {
        if (!cancelled) setPayrollRuns(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setPayrollRuns([]);
          setPayrollRunsError(getErrorMessage(error, 'Не удалось загрузить историю выплат.'));
        }
      })
      .finally(() => {
        if (!cancelled) setPayrollRunsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    getMonthlyStats(month, year)
      .then((data) => {
        if (!cancelled) setMonthStats(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setMonthStats(null);
          setStatsError(getErrorMessage(error, 'Не удалось загрузить начисления.'));
        }
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, year]);

  const monthShifts = useMemo(
    () => [...(shifts ?? [])].sort((left, right) => getShiftSortKey(right.date, right.created_at) - getShiftSortKey(left.date, left.created_at)),
    [shifts]
  );
  const approvedShifts = useMemo(() => monthShifts.filter((shift) => shift.status === 'approved'), [monthShifts]);
  const pendingShifts = useMemo(() => monthShifts.filter((shift) => shift.status === 'pending'), [monthShifts]);
  const rejectedShifts = useMemo(() => monthShifts.filter((shift) => shift.status === 'rejected'), [monthShifts]);
  const approvedAmount = useMemo(() => approvedShifts.reduce((total, shift) => total + toNumber(shift.salary_earned), 0), [approvedShifts]);
  const pendingAmount = useMemo(() => pendingShifts.reduce((total, shift) => total + toNumber(shift.salary_earned), 0), [pendingShifts]);

  const applyMonth = () => {
    const [nextYear, nextMonth] = draftMonth.split('-').map(Number);
    if (Number.isFinite(nextYear) && Number.isFinite(nextMonth)) {
      setViewDate({ year: nextYear, month: nextMonth });
    }
    setMonthSheetOpen(false);
  };

  const resetMonth = () => setDraftMonth(initialMonthValue);

  return (
    <div className="payouts-page mx-auto max-w-lg px-4 pb-6 pt-5" aria-label={`Личные выплаты: ${user.name || 'Сотрудник'}`}>
      <header className="payouts-header">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-tg-text">Выплаты</h1>
          <p className="mt-1 truncate text-sm text-tg-hint">{selectedMonthLabel}</p>
        </div>
        <button ref={periodButtonRef} type="button" className="payouts-period-button" onClick={() => setMonthSheetOpen(true)} aria-label="Выбрать месяц">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <section className="payouts-current" aria-labelledby="payouts-current-title">
        <div>
          <p id="payouts-current-title" className="text-sm text-tg-hint">Начислено за месяц</p>
          <p className="payouts-current-amount">
            {statsLoading || !monthStats ? '—' : formatCurrency(monthStats.total_payout)}
          </p>
        </div>

        {statsLoading ? (
          <div className="payouts-loading-lines" aria-label="Загружаем начисления"><span /><span /></div>
        ) : statsError ? (
          <p className="payouts-inline-error">Сводка начислений недоступна. {statsError}</p>
        ) : monthStats ? (
          <div className="payouts-current-facts">
            <div><span>Утверждено</span><strong>{approvedShifts.length} · {formatCurrency(approvedAmount)}</strong></div>
            <div><span>Предварительно</span><strong>{pendingShifts.length} · {formatCurrency(pendingAmount)}</strong></div>
            <div><span>Часы и смены</span><strong>{formatHours(monthStats.total_hours)} · {monthShifts.length}</strong></div>
            {rejectedShifts.length > 0 && <div><span>Не входит в начисления</span><strong>{rejectedShifts.length} смен</strong></div>}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="payouts-history-title">
        <div className="payouts-section-heading">
          <div>
            <h2 id="payouts-history-title">История выплат</h2>
            <p>Зафиксированные работодателем расчёты</p>
          </div>
        </div>

        {payrollRunsLoading ? (
          <div className="payouts-list-loading" aria-label="Загружаем историю выплат"><span /><span /></div>
        ) : payrollRunsError ? (
          <div className="payouts-state">
            <CircleAlert className="h-6 w-6 text-tg-hint" aria-hidden="true" />
            <p className="font-medium text-tg-text">Не удалось загрузить историю выплат</p>
            <p>{payrollRunsError}</p>
          </div>
        ) : payrollRuns.length === 0 ? (
          <div className="payouts-state">
            <p className="font-medium text-tg-text">Истории выплат пока нет</p>
            <p>Здесь появятся выплаты, зафиксированные работодателем.</p>
          </div>
        ) : (
          <div className="payouts-runs-list">
            {payrollRuns.map((run) => (
              <PayrollRunRow key={run.payroll_run_id} run={run} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="payouts-shifts-title">
        <div className="payouts-section-heading">
          <div>
            <h2 id="payouts-shifts-title">Смены за период</h2>
            <p>{monthShifts.length > 0 ? `${monthShifts.length} смен` : selectedMonthLabel}</p>
          </div>
        </div>

        {shiftsLoading ? (
          <div className="payouts-list-loading" aria-label="Загружаем смены"><span /><span /><span /></div>
        ) : shiftsError ? (
          <div className="payouts-state">
            <CircleAlert className="h-6 w-6 text-tg-hint" aria-hidden="true" />
            <p className="font-medium text-tg-text">Не удалось загрузить смены</p>
            <p>{shiftsError}</p>
          </div>
        ) : monthShifts.length === 0 ? (
          <div className="payouts-state">
            <Clock3 className="h-6 w-6 text-tg-hint" aria-hidden="true" />
            <p className="font-medium text-tg-text">За выбранный месяц смен пока нет</p>
            <p>Смены появятся здесь после сохранения.</p>
          </div>
        ) : (
          <div className="payouts-shifts-list">
            {monthShifts.map((shift) => {
              const presentation = getShiftPresentation(shift.status);
              return (
                <article key={shift.id} className="payouts-shift-row">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-medium text-tg-text">{shift.date ? formatDate(shift.date) : 'Дата не указана'}</p>
                      <span className="payouts-status" data-status={shift.status}>{presentation.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-tg-hint">
                      {shift.venue_name?.trim() || venueNames.get(shift.venue_id) || 'Точка не указана'} · {formatHours(shift.total_hours || 0)} · {presentation.amount}
                    </p>
                  </div>
                  <strong>{formatCurrency(shift.salary_earned || 0)}</strong>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <BottomSheet open={monthSheetOpen} title="Выберите месяц" onClose={() => setMonthSheetOpen(false)} returnFocusRef={periodButtonRef}>
        <div className="payouts-period-field">
          <label htmlFor="payouts-month">Месяц</label>
          <select id="payouts-month" value={draftMonth} onChange={(event) => setDraftMonth(event.target.value)}>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="bottom-sheet-actions">
          <button type="button" className="bottom-sheet-secondary" onClick={resetMonth}>Сбросить</button>
          <button type="button" className="bottom-sheet-primary" onClick={applyMonth}>Применить</button>
        </div>
      </BottomSheet>
    </div>
  );
}

function PayrollRunRow({ run }: { run: PersonalPayrollRun }) {
  const [expanded, setExpanded] = useState(false);
  const payments = Array.isArray(run.payments) ? run.payments : [];
  const isPaid = run.status === 'paid';
  const period = `${formatDate(run.period_start)} – ${formatDate(run.period_end)}`;

  return (
    <article className="payouts-run-row">
      <button type="button" className="payouts-run-main" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <div className="min-w-0 text-left">
          <p className="truncate font-semibold text-tg-text">{run.title || period}</p>
          <p className="mt-1 truncate text-sm text-tg-hint">{period} · {run.venue_name || 'Основная точка'}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="payouts-run-status" data-status={run.status}>{isPaid ? 'Выплачено' : 'Ожидает выплаты'}</span>
          <ChevronDown className={`ml-auto mt-2 h-4 w-4 text-tg-hint transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </div>
      </button>

      <div className="payouts-run-totals">
        <div><span>Начислено</span><strong>{formatCurrency(run.final_amount)}</strong></div>
        <div><span>Выплачено</span><strong>{formatCurrency(run.paid_amount)}</strong></div>
        <div><span>Осталось</span><strong>{formatCurrency(run.remaining_amount)}</strong></div>
      </div>

      {expanded && (
        <div className="payouts-payments">
          {payments.length === 0 ? (
            <p>Выплата ещё не зафиксирована</p>
          ) : (
            payments.map((payment, index) => (
              <div key={`${run.payroll_run_id}-${payment.created_at}-${index}`} className="payouts-payment-row">
                <div>
                  <span>{payment.payment_date ? formatDate(payment.payment_date) : 'Дата не указана'}</span>
                  {payment.method && <p>Способ: {payment.method}</p>}
                  {payment.comment && <p>{payment.comment}</p>}
                </div>
                <strong>{formatCurrency(payment.amount)}</strong>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}
