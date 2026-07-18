import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, CreditCard, Download, FileSpreadsheet, FileText, SlidersHorizontal, TrendingDown } from 'lucide-react';
import { Shift, User, Venue, PayrollSummary, createReportDownloadLink, getActiveVenues, getPayrollSummary, getVenues } from '../utils/api';
import { useShifts } from '../hooks/useShifts';
import { useExpenses } from '../hooks/useExpenses';
import BottomSheet from '../components/BottomSheet';
import ShiftCard from '../components/ShiftCard';
import { formatCurrency, formatDate, formatHours, getCurrentMonth, getCurrentYear } from '../utils/helpers';
import { hasPermission } from '../utils/permissions';
import { getWebApp } from '../utils/telegram';

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
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const initialMonthValue = `${getCurrentYear()}-${String(getCurrentMonth()).padStart(2, '0')}`;
  const [tab, setTab] = useState<Tab>('shifts');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => ({ month: getCurrentMonth(), year: getCurrentYear() }));
  const [venueFilter, setVenueFilter] = useState('all');
  const [draftMonth, setDraftMonth] = useState(initialMonthValue);
  const [draftVenue, setDraftVenue] = useState('all');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<'xlsx' | 'csv' | null>(null);
  const [exportErrors, setExportErrors] = useState<Record<'xlsx' | 'csv', string | null>>({ xlsx: null, csv: null });

  const { month, year } = viewDate;
  const canManagePayroll = useMemo(() => hasPermission(user, 'can_view_team_payroll'), [user]);
  const canExportPayroll = useMemo(() => hasPermission(user, 'can_export_payroll'), [user]);
  const canScopeByVenue = user.role === 'owner' || user.role === 'admin';
  const venueScopeId = canScopeByVenue && venueFilter !== 'all' ? venueFilter : undefined;
  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts(month, year, venueScopeId);
  const { expenses, loading: expensesLoading, error: expensesError } = useExpenses(month, year);
  const isCurrentPeriod = month === getCurrentMonth() && year === getCurrentYear();

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
  const selectedVenueLabel = useMemo(() => {
    if (!canScopeByVenue || venueScopeId == null) return 'Все точки';
    const venue = venues.find((item) => item.id === venueScopeId);
    return venue ? getVenueLabel(venue) : 'Точка';
  }, [canScopeByVenue, venueScopeId, venues]);
  const hasActiveFilters = !isCurrentPeriod || venueFilter !== 'all';

  const venueNames = useMemo(() => {
    const map = new Map(venues.map((venue) => [venue.id, getVenueLabel(venue)]));
    return map;
  }, [venues]);

  const shiftGroups = useMemo(() => {
    const groups = new Map<string, typeof shifts>();
    [...(shifts || [])]
      .sort((left, right) => (right.date || '').localeCompare(left.date || ''))
      .forEach((shift) => {
        const key = shift.date || 'unknown';
        const group = groups.get(key) ?? [];
        group.push(shift);
        groups.set(key, group);
      });
    return Array.from(groups.entries());
  }, [shifts]);

  useEffect(() => {
    if (!canScopeByVenue) {
      setVenueFilter('all');
      setDraftVenue('all');
    }

    let cancelled = false;
    const venuesRequest = canScopeByVenue ? getVenues(true) : getActiveVenues();
    venuesRequest
      .then((data) => {
        if (!cancelled) setVenues(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setVenues([]);
      });

    return () => {
      cancelled = true;
    };
  }, [canScopeByVenue]);

  useEffect(() => {
    if (venueFilter !== 'all' && venues.length > 0 && !venues.some((venue) => venue.id === venueFilter)) {
      setVenueFilter('all');
      setDraftVenue('all');
    }
  }, [venueFilter, venues]);

  useEffect(() => {
    if (!canManagePayroll) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    getPayrollSummary(month, year, venueScopeId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(error instanceof Error ? error.message : 'Не удалось загрузить сводку начислений.');
        }
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManagePayroll, month, year, venueScopeId]);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      setExportLoading(format);
      setExportErrors((current) => ({ ...current, [format]: null }));
      const download = await createReportDownloadLink(format, month, year, venueScopeId);
      const downloadUrl = new URL(download.url);
      if (downloadUrl.protocol !== 'https:') {
        throw new Error('Безопасная ссылка на скачивание недоступна.');
      }

      const webApp = getWebApp();
      const canUseNativeDownload = Boolean(
        webApp?.downloadFile
        && webApp.isVersionAtLeast?.('8.0'),
      );

      if (canUseNativeDownload && webApp?.downloadFile) {
        const accepted = await new Promise<boolean>((resolve, reject) => {
          try {
            webApp.downloadFile?.(
              { url: downloadUrl.toString(), file_name: download.file_name },
              resolve,
            );
          } catch (error) {
            reject(error);
          }
        });
        if (!accepted) {
          throw new Error('Скачивание отменено.');
        }
      } else {
        const link = document.createElement('a');
        link.href = downloadUrl.toString();
        link.download = download.file_name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setExportOpen(false);
    } catch (error) {
      setExportErrors((current) => ({
        ...current,
        [format]: error instanceof Error ? error.message : `Не удалось скачать ${format.toUpperCase()}.`,
      }));
    } finally {
      setExportLoading(null);
    }
  };

  const applyFilters = () => {
    const [nextYear, nextMonth] = draftMonth.split('-').map(Number);
    if (Number.isFinite(nextYear) && Number.isFinite(nextMonth)) {
      setViewDate({ year: nextYear, month: nextMonth });
    }
    setVenueFilter(canScopeByVenue ? draftVenue : 'all');
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setDraftMonth(initialMonthValue);
    setDraftVenue('all');
  };

  const getShiftVenueName = (shift: Shift) => {
    const responseName = shift.venue_name?.trim();
    if (responseName) return responseName;
    if (shift.venue_id && venueNames.has(shift.venue_id)) return venueNames.get(shift.venue_id) ?? 'Точка не указана';
    return 'Точка не указана';
  };

  return (
    <div className="history-page mx-auto max-w-lg px-4 pb-6 pt-5">
      <header className="history-header">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-tg-text">История</h1>
          <p className="mt-1 truncate text-sm text-tg-hint">
            {selectedMonthLabel}{canScopeByVenue ? ` · ${selectedVenueLabel}` : ''}
          </p>
        </div>
        <button
          ref={filterButtonRef}
          type="button"
          className="history-filter-button"
          data-active={hasActiveFilters}
          onClick={() => setFiltersOpen(true)}
          aria-label="Открыть фильтры"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {canManagePayroll && (
        <section className="history-summary" aria-labelledby="history-summary-title">
          <div className="history-summary-heading">
            <div className="min-w-0">
              <p id="history-summary-title" className="text-sm text-tg-hint">Начислено по утверждённым сменам</p>
              <p className="history-summary-amount">
                {summaryLoading || !summary ? '—' : formatCurrency(summary.total_payout)}
              </p>
            </div>
            {canExportPayroll && (
              <button
                ref={exportButtonRef}
                type="button"
                className="history-export-button"
                onClick={() => setExportOpen(true)}
                aria-label="Открыть экспорт отчёта"
              >
                <Download className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>

          {summaryLoading ? (
            <div className="history-summary-loading" aria-label="Загружаем сводку"><span /><span /></div>
          ) : summaryError ? (
            <p className="history-inline-error">Сводка начислений недоступна. {summaryError}</p>
          ) : summary ? (
            <>
              <div className="history-summary-facts">
                <span>{summary.approved_shifts_count} смен</span>
                <span>{formatHours(summary.total_hours)}</span>
                <span>{summary.employees_count} сотрудников</span>
              </div>
              {(parseFloat(summary.total_bonuses) !== 0 || parseFloat(summary.total_penalties) !== 0) && (
                <p className="history-adjustments-line">
                  Бонусы {formatCurrency(summary.total_bonuses)} · Удержания {formatCurrency(summary.total_penalties)}
                </p>
              )}
              {summary.rows.length > 0 && (
                <details className="history-summary-details">
                  <summary>Сотрудники в сводке</summary>
                  <div>
                    {summary.rows.map((row) => (
                      <div key={row.user_id} className="history-summary-person">
                        <span className="min-w-0 truncate">{row.user_name || 'Сотрудник'}</span>
                        <strong>{formatCurrency(row.total_payout)}</strong>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <p className="history-inline-error">Сводка начислений пока недоступна</p>
          )}
        </section>
      )}

      <div className="history-tabs" role="tablist" aria-label="Раздел истории">
        <button type="button" role="tab" aria-selected={tab === 'shifts'} data-active={tab === 'shifts'} onClick={() => setTab('shifts')}>
          <Clock className="h-4 w-4" aria-hidden="true" />
          Смены
        </button>
        <button type="button" role="tab" aria-selected={tab === 'expenses'} data-active={tab === 'expenses'} onClick={() => setTab('expenses')}>
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Расходы
        </button>
      </div>

      {tab === 'shifts' ? (
        <section aria-label="Смены за период">
          {shiftsLoading ? (
            <div className="history-list-loading" aria-label="Загружаем смены"><span /><span /><span /></div>
          ) : shiftsError ? (
            <div className="history-state">
              <p className="font-medium text-tg-text">Не удалось загрузить смены</p>
              <p>{shiftsError}</p>
            </div>
          ) : shiftGroups.length === 0 ? (
            <div className="history-state">
              <Clock className="h-6 w-6 text-tg-hint" aria-hidden="true" />
              <p className="font-medium text-tg-text">За этот месяц смен нет</p>
              <p>Измените фильтры или вернитесь позже.</p>
            </div>
          ) : (
            <div className="history-groups">
              {shiftGroups.map(([groupDate, groupShifts]) => (
                <section key={groupDate} className="history-date-group">
                  <h2>{groupDate === 'unknown' ? 'Дата не указана' : formatDate(groupDate)}</h2>
                  <div className="history-date-list">
                    {groupShifts.map((shift) => (
                      <ShiftCard key={shift.id} shift={shift} venueName={getShiftVenueName(shift)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Расходы за период">
          {expensesLoading ? (
            <div className="history-list-loading" aria-label="Загружаем расходы"><span /><span /></div>
          ) : expensesError ? (
            <div className="history-state">
              <p className="font-medium text-tg-text">Не удалось загрузить расходы</p>
              <p>{expensesError}</p>
            </div>
          ) : expenses.length === 0 ? (
            <div className="history-state">
              <TrendingDown className="h-6 w-6 text-tg-hint" aria-hidden="true" />
              <p className="font-medium text-tg-text">За этот месяц расходов нет</p>
              <p>Новые расходы появятся здесь.</p>
            </div>
          ) : (
            <div className="history-expenses-list">
              {expenses.map((expense) => (
                <article key={expense.id} className="history-expense-row">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-tg-text">{expense.category || 'Расход'}</p>
                    <p className="mt-1 text-sm text-tg-hint">{expense.date ? formatDate(expense.date) : 'Дата не указана'}</p>
                    {expense.comment && <p className="mt-1 text-sm text-tg-hint">{expense.comment}</p>}
                  </div>
                  <strong>-{formatCurrency(expense.amount || 0)}</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <BottomSheet
        open={exportOpen}
        title="Экспортировать"
        onClose={() => setExportOpen(false)}
        returnFocusRef={exportButtonRef}
      >
        <div className="history-export-options">
          <button
            type="button"
            className="history-export-option"
            onClick={() => handleExport('xlsx')}
            disabled={exportLoading !== null}
          >
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            <span><strong>Excel (.xlsx)</strong><small>Оформленный отчёт</small></span>
            {exportLoading === 'xlsx' && <span className="history-spinner" aria-label="Готовим Excel" />}
          </button>
          {exportErrors.xlsx && <p className="history-inline-error">{exportErrors.xlsx}</p>}
          <button
            type="button"
            className="history-export-option"
            onClick={() => handleExport('csv')}
            disabled={exportLoading !== null}
          >
            <FileText className="h-5 w-5" aria-hidden="true" />
            <span><strong>CSV</strong><small>Сырые данные</small></span>
            {exportLoading === 'csv' && <span className="history-spinner" aria-label="Готовим CSV" />}
          </button>
          {exportErrors.csv && <p className="history-inline-error">{exportErrors.csv}</p>}
        </div>
      </BottomSheet>

      <BottomSheet
        open={filtersOpen}
        title="Фильтры"
        onClose={() => setFiltersOpen(false)}
        returnFocusRef={filterButtonRef}
      >
        <div className="history-filter-fields">
          <label>
            <span>Месяц</span>
            <select value={draftMonth} onChange={(event) => setDraftMonth(event.target.value)}>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {canScopeByVenue && (
            <label>
              <span>Точка</span>
              <select value={draftVenue} onChange={(event) => setDraftVenue(event.target.value)}>
                <option value="all">Все точки</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>{getVenueLabel(venue)}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="bottom-sheet-actions">
          <button type="button" className="bottom-sheet-secondary" onClick={resetFilters}>Сбросить</button>
          <button type="button" className="bottom-sheet-primary" onClick={applyFilters}>Применить</button>
        </div>
      </BottomSheet>
    </div>
  );
}
