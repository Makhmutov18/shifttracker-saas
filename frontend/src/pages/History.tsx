import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, CreditCard, Download, MapPin, TrendingDown, Wallet } from 'lucide-react';
import { User, Venue, PayrollSummary, downloadPayrollExport, getPayrollSummary, getVenues } from '../utils/api';
import { useShifts } from '../hooks/useShifts';
import { useExpenses } from '../hooks/useExpenses';
import ShiftCard from '../components/ShiftCard';
import { getMonthName, getCurrentMonth, getCurrentYear, formatCurrency, formatHours } from '../utils/helpers';
import { hasPermission } from '../utils/permissions';

interface Props {
  user: User;
}

type Tab = 'shifts' | 'expenses';

type MonthOption = {
  value: string;
  label: string;
};

function formatMonthLabel(date: Date) {
  const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getVenueLabel(venue: Venue) {
  return venue.is_active ? venue.name : `${venue.name} (в архиве)`;
}

export default function History({ user }: Props) {
  const [tab, setTab] = useState<Tab>('shifts');
  const [viewDate, setViewDate] = useState(() => ({
    month: getCurrentMonth(),
    year: getCurrentYear(),
  }));
  const [venueFilter, setVenueFilter] = useState('all');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { month, year } = viewDate;
  const canManagePayroll = useMemo(() => hasPermission(user, 'can_view_team_payroll'), [user]);
  const canScopeByVenue = user.role === 'owner' || user.role === 'admin';
  const venueScopeId = canScopeByVenue && venueFilter !== 'all' ? venueFilter : undefined;
  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts(month, year, venueScopeId);
  const { expenses, loading: expensesLoading, error: expensesError } = useExpenses(month, year);
  const isCurrentPeriod = month === getCurrentMonth() && year === getCurrentYear();

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
  const selectedVenueLabel = useMemo(() => {
    if (!canScopeByVenue || venueScopeId == null) {
      return 'Все точки';
    }
    return getVenueLabel(venues.find((venue) => venue.id === venueScopeId) ?? { id: venueScopeId, name: 'Точка', is_active: true });
  }, [canScopeByVenue, venueScopeId, venues]);

  useEffect(() => {
    if (!canScopeByVenue) {
      setVenues([]);
      setVenueFilter('all');
      return;
    }

    let cancelled = false;

    const loadVenues = async () => {
      try {
        const data = await getVenues(true);
        if (!cancelled) {
          setVenues(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setVenues([]);
        }
      }
    };

    loadVenues();

    return () => {
      cancelled = true;
    };
  }, [canScopeByVenue]);

  useEffect(() => {
    if (!canScopeByVenue) {
      return;
    }

    if (venueFilter !== 'all' && venues.length > 0 && !venues.some((venue) => venue.id === venueFilter)) {
      setVenueFilter('all');
    }
  }, [canScopeByVenue, venueFilter, venues]);

  useEffect(() => {
    if (!canManagePayroll) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    let cancelled = false;

    const loadSummary = async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(null);
        const data = await getPayrollSummary(month, year, venueScopeId);
        if (!cancelled) {
          setSummary(data);
        }
      } catch (error) {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(error instanceof Error ? error.message : 'Не удалось загрузить сводку выплат.');
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    };

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [canManagePayroll, month, year, venueScopeId]);

  const handleExport = async () => {
    try {
      setExportLoading(true);
      setExportError(null);
      const { blob, filename } = await downloadPayrollExport(month, year, venueScopeId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Не удалось скачать сводку выплат.');
    } finally {
      setExportLoading(false);
    }
  };

  const setSelectedMonth = (value: string) => {
    const [nextYear, nextMonth] = value.split('-').map(Number);
    if (!Number.isNaN(nextYear) && !Number.isNaN(nextMonth)) {
      setViewDate({ year: nextYear, month: nextMonth });
    }
  };

  const resetToCurrent = () => {
    setViewDate({
      month: getCurrentMonth(),
      year: getCurrentYear(),
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] pt-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-tg-text">История</h1>
        <p className="text-sm text-tg-hint">Смены, расходы и выплаты за выбранный месяц.</p>
      </div>

      <section className="surface-card rounded-[1.4rem] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Период</p>
            <p className="mt-1 text-xs text-tg-hint">Выберите месяц, чтобы посмотреть смены, расходы и сводку выплат.</p>
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

        {canScopeByVenue && (
          <div className="space-y-2 border-t border-tg-border pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-tg-text">Точка</p>
                <p className="mt-1 text-xs text-tg-hint">Можно смотреть все точки или выбрать одну конкретную.</p>
              </div>
              <MapPin className="h-4 w-4 text-tg-primary" />
            </div>

            <label className="block text-xs font-medium uppercase tracking-wide text-tg-hint">Фильтр</label>
            <select
              value={venueFilter}
              onChange={(event) => setVenueFilter(event.target.value)}
              className="w-full rounded-xl border border-tg-border bg-tg-bg py-3 px-4 text-sm font-medium text-tg-text outline-none focus:ring-2 focus:ring-tg-primary/40"
            >
              <option value="all">Все точки</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {getVenueLabel(venue)}
                </option>
              ))}
            </select>
            <p className="text-xs text-tg-hint">Выбрано: {selectedVenueLabel}</p>
          </div>
        )}
      </section>

      {canManagePayroll && (
        <section className="space-y-3">
          <div className="surface-card rounded-[1.4rem] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-tg-text">Сводка выплат</p>
                <p className="mt-1 text-xs text-tg-hint">Все суммы ниже считаются только по утверждённым сменам.</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary">
                <Wallet className="h-5 w-5" />
              </div>
            </div>

            {summaryLoading ? (
              <div className="mt-1 animate-pulse space-y-3">
                <div className="h-20 rounded-[1.35rem] bg-tg-bg/70" />
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((index) => (
                    <div key={index} className="h-16 rounded-xl bg-tg-bg/70" />
                  ))}
                </div>
              </div>
            ) : summaryError ? (
              <div className="rounded-[1.2rem] bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-200">
                <p className="font-medium">Сводка выплат недоступна</p>
                <p className="mt-1 text-xs">{summaryError}</p>
              </div>
            ) : summary ? (
              <div className="space-y-3">
                <div className="surface-muted rounded-[1.35rem] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-tg-hint">К выплате</p>
                      <p className="mt-1 text-2xl font-semibold text-tg-text">{formatCurrency(summary.total_payout)}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary">
                      <Wallet className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-tg-hint">
                    <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                      {formatHours(summary.total_hours)}
                    </span>
                    <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                      {summary.approved_shifts_count} утверждённых смен
                    </span>
                    <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                      {summary.employees_count} сотрудников
                    </span>
                    <span className="rounded-full bg-tg-bg px-2.5 py-1 font-medium text-tg-text">
                      {selectedMonthLabel}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="surface-muted rounded-[1.15rem] p-4">
                    <p className="text-xs text-tg-hint">На подтверждении</p>
                    <p className="mt-1 text-sm font-semibold text-tg-text">{summary.pending_shifts_count}</p>
                  </div>
                  <div className="surface-muted rounded-[1.15rem] p-4">
                    <p className="text-xs text-tg-hint">Утверждено</p>
                    <p className="mt-1 text-sm font-semibold text-tg-text">{summary.approved_shifts_count}</p>
                  </div>
                  <div className="surface-muted rounded-[1.15rem] p-4">
                    <p className="text-xs text-tg-hint">Бонусы</p>
                    <p className="mt-1 text-sm font-semibold text-tg-text">{formatCurrency(summary.total_bonuses)}</p>
                  </div>
                  <div className="surface-muted rounded-[1.15rem] p-4">
                    <p className="text-xs text-tg-hint">Штрафы</p>
                    <p className="mt-1 text-sm font-semibold text-tg-text">{formatCurrency(summary.total_penalties)}</p>
                  </div>
                </div>

                {summary.rows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-tg-text">Сотрудники</p>
                      <p className="text-xs text-tg-hint">{summary.rows.length} в сводке</p>
                    </div>
                    {summary.rows.slice(0, 5).map((row) => (
                      <div
                        key={row.user_id}
                        className="surface-elevated flex items-center justify-between gap-3 rounded-[1.15rem] px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-tg-text">{row.user_name}</p>
                          <p className="text-xs text-tg-hint">
                            {row.approved_shifts_count} смены · {formatHours(row.total_hours)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-tg-text">
                          {formatCurrency(row.total_payout)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-tg-hint">Сводка выплат пока недоступна.</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exportLoading}
            className="surface-card flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-tg-text transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {exportLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Download className="h-4 w-4" />}
            Выгрузить сводку выплат за {getMonthName(month)} {year} (.xlsx)
          </button>

          {exportError && <p className="text-xs text-red-400">{exportError}</p>}
        </section>
      )}

      <div className="surface-muted flex rounded-xl p-1">
        <button
          onClick={() => setTab('shifts')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            tab === 'shifts' ? 'surface-card text-tg-text' : 'text-tg-hint'
          }`}
        >
          <Clock className="h-4 w-4" />
          Смены
        </button>
        <button
          onClick={() => setTab('expenses')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            tab === 'expenses' ? 'surface-card text-tg-text' : 'text-tg-hint'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Расходы
        </button>
      </div>

      {tab === 'shifts' ? (
        shiftsLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((index) => (
              <div key={index} className="h-20 surface-card rounded-xl" />
            ))}
          </div>
        ) : shiftsError ? (
          <div className="surface-card rounded-[1.4rem] px-4 py-10 text-center">
            <p className="text-sm font-medium text-rose-500">Не удалось загрузить смены</p>
            <p className="mt-2 text-xs text-tg-hint">{shiftsError}</p>
          </div>
        ) : shifts.length === 0 ? (
          <div className="surface-card rounded-[1.4rem] px-4 py-10 text-center">
            <Clock className="mx-auto mb-3 h-12 w-12 text-tg-hint opacity-50" />
            <p className="text-sm font-medium text-tg-text">За этот месяц смен нет</p>
            <p className="mt-1 text-xs text-tg-hint">Когда появятся смены, они отобразятся здесь и попадут в сводку выплат.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </div>
        )
      ) : expensesLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((index) => (
            <div key={index} className="h-16 surface-card rounded-xl" />
          ))}
        </div>
      ) : expensesError ? (
        <div className="surface-card rounded-[1.4rem] px-4 py-10 text-center">
          <p className="text-sm font-medium text-rose-500">Не удалось загрузить расходы</p>
          <p className="mt-2 text-xs text-tg-hint">{expensesError}</p>
        </div>
      ) : expenses.length === 0 ? (
        <div className="surface-card rounded-[1.4rem] px-4 py-10 text-center">
          <TrendingDown className="mx-auto mb-3 h-12 w-12 text-tg-hint opacity-50" />
          <p className="text-sm font-medium text-tg-text">За этот месяц расходов нет</p>
          <p className="mt-1 text-xs text-tg-hint">Когда появятся расходы, они отобразятся здесь.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="surface-card flex items-center justify-between gap-4 rounded-[1.15rem] p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-tg-text">{expense.category}</p>
                <p className="mt-0.5 text-xs text-tg-hint">{expense.date}</p>
                {expense.comment && <p className="mt-1 text-xs text-tg-hint">{expense.comment}</p>}
              </div>
              <p className="shrink-0 text-sm font-semibold text-rose-500">-{formatCurrency(expense.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
