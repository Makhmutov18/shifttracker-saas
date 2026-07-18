import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Calculator, Check, ChevronLeft, ChevronRight, CircleDollarSign, Download, FileSpreadsheet, FileText, LoaderCircle, Plus, X } from 'lucide-react';
import { api, type ExportFormat } from '../api';
import { ConfirmationDialog, DataTable, DateRangeFields, Drawer, EmptyState, ErrorState, FilterBar, FormField, LoadingState, Metric, MoneyValue, PageHeader, Pagination, StatusBadge, Toast, type SortDirection } from '../components/ui';
import type { PayrollPreview, PayrollRun, PayrollRunItem, PayrollRunListItem, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatNumber, hasPermission, isOwnerOrAdmin, monthBounds, monthParts } from '../utils';

type ConfirmAction = { type: 'finalize' | 'cancel'; run: PayrollRun } | null;
type RunSort = 'period' | 'status' | 'amount' | 'remaining';
const PAGE_SIZE = 12;
const REPORT_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MIN_REPORT_YEAR = 2000;
const MAX_REPORT_YEAR = 2100;

function parseRevenue(value: string): number | null | undefined {
  const normalized = value.replace(/\s/g, '').replace(',', '.').trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function formatPayrollShare(value?: string | number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatReportMonth(value: string): string {
  const { month, year } = monthParts(value);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return 'Период не выбран';
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/\s*г\.$/, '');
  return `${label.charAt(0).toLocaleUpperCase('ru-RU')}${label.slice(1)}`;
}

function reportMonthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function VisualMonthPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const parts = monthParts(value);
  const selectedYear = Number.isInteger(parts.year) && parts.year >= MIN_REPORT_YEAR && parts.year <= MAX_REPORT_YEAR ? parts.year : new Date().getFullYear();
  const selectedMonth = Number.isInteger(parts.month) && parts.month >= 1 && parts.month <= 12 ? parts.month : new Date().getMonth() + 1;
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedYear);
  const canGoBack = selectedYear > MIN_REPORT_YEAR || selectedMonth > 1;
  const canGoForward = selectedYear < MAX_REPORT_YEAR || selectedMonth < 12;

  useEffect(() => {
    if (!open) setViewYear(selectedYear);
  }, [open, selectedYear]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open]);

  const stepMonth = (direction: -1 | 1) => {
    const date = new Date(selectedYear, selectedMonth - 1 + direction, 1);
    onChange(reportMonthValue(date.getFullYear(), date.getMonth() + 1));
    setOpen(false);
  };
  const selectMonth = (month: number) => {
    onChange(reportMonthValue(viewYear, month));
    setOpen(false);
  };
  const selectCurrentMonth = () => {
    onChange(currentMonthValue());
    setOpen(false);
  };

  return <div className="report-month-picker" ref={rootRef}>
    <span className="report-month-picker-label">Месяц отчёта</span>
    <div className="report-month-control">
      <button type="button" disabled={disabled || !canGoBack} onClick={() => stepMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft /></button>
      <button ref={triggerRef} className="report-month-value" type="button" disabled={disabled} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setViewYear(selectedYear); setOpen((current) => !current); }}>{formatReportMonth(value)}</button>
      <button type="button" disabled={disabled || !canGoForward} onClick={() => stepMonth(1)} aria-label="Следующий месяц"><ChevronRight /></button>
    </div>
    {open && <div className="report-month-popover" role="dialog" aria-label="Выбор месяца">
      <div className="report-month-year">
        <button type="button" disabled={viewYear <= MIN_REPORT_YEAR} onClick={() => setViewYear((year) => Math.max(MIN_REPORT_YEAR, year - 1))} aria-label="Предыдущий год"><ChevronLeft /></button>
        <strong>{viewYear}</strong>
        <button type="button" disabled={viewYear >= MAX_REPORT_YEAR} onClick={() => setViewYear((year) => Math.min(MAX_REPORT_YEAR, year + 1))} aria-label="Следующий год"><ChevronRight /></button>
      </div>
      <div className="report-month-grid">
        {REPORT_MONTHS.map((monthName, index) => {
          const month = index + 1;
          const active = selectedYear === viewYear && selectedMonth === month;
          return <button className={active ? 'active' : undefined} type="button" aria-pressed={active} key={monthName} onClick={() => selectMonth(month)}>{monthName}</button>;
        })}
      </div>
      <button className="report-month-current" type="button" onClick={selectCurrentMonth}>Текущий месяц</button>
    </div>}
  </div>;
}

export function PayrollPage({ user, venues, venueId }: { user: User; venues: Venue[]; venueId: string }) {
  const bounds = monthBounds(currentMonthValue());
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState(currentMonthValue());
  const [exportLoading, setExportLoading] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState('');
  const [revenueInput, setRevenueInput] = useState('');
  const [selected, setSelected] = useState<PayrollRun | null>(null);
  const [revenueEditOpen, setRevenueEditOpen] = useState(false);
  const [revenueDraft, setRevenueDraft] = useState('');
  const [revenueError, setRevenueError] = useState('');
  const [revenueBusy, setRevenueBusy] = useState(false);
  const [paymentItem, setPaymentItem] = useState<PayrollRunItem | null>(null);
  const [payment, setPayment] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: '', comment: '' });
  const [paymentError, setPaymentError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState<RunSort>('period');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canAct = isOwnerOrAdmin(user);
  const canExport = hasPermission(user, 'can_export_payroll');

  const loadRuns = async () => {
    setLoading(true); setError('');
    try { setRuns(await api.payrollRuns(venueId || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить расчёты.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadRuns(); }, [venueId]);
  useEffect(() => { setPage(1); }, [venueId, statusFilter, sortKey, sortDirection]);
  useEffect(() => { setRevenueInput(''); setPreview(null); setCreateError(''); }, [venueId]);

  const openRun = async (id: string) => { setBusy(true); setError(''); setPaymentItem(null); setPaymentError(''); setRevenueEditOpen(false); setRevenueError(''); try { setSelected(await api.payrollRun(id)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть расчёт.'); } finally { setBusy(false); } };
  const doPreview = async () => {
    if (!periodStart || !periodEnd || periodStart > periodEnd) { setCreateError('Проверьте даты периода.'); return; }
    if (venueId && parseRevenue(revenueInput) === undefined) { setCreateError('Введите выручку числом не меньше нуля или оставьте поле пустым.'); return; }
    setCreateBusy(true); setCreateError(''); setSuccess('');
    try { setPreview(await api.payrollPreview(periodStart, periodEnd, venueId || undefined)); }
    catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Не удалось сформировать предварительный расчёт.'); }
    finally { setCreateBusy(false); }
  };
  const createRun = async () => {
    if (!preview || !canAct) return;
    const revenueTotal = venueId ? parseRevenue(revenueInput) : null;
    if (revenueTotal === undefined) { setCreateError('Введите выручку числом не меньше нуля или оставьте поле пустым.'); return; }
    setCreateBusy(true); setCreateError('');
    try {
      const run = await api.createPayrollRun({ period_start: periodStart, period_end: periodEnd, venue_id: venueId || undefined, ...(venueId && revenueTotal != null ? { revenue_total: revenueTotal } : {}) });
      setSuccess('Черновик расчёта сформирован.'); setCreateOpen(false); setPreview(null);
      await loadRuns(); await openRun(run.id);
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Не удалось сформировать черновик.'); }
    finally { setCreateBusy(false); }
  };
  const transition = async () => { if (!confirm) return; setBusy(true); setError(''); try { const updated = confirm.type === 'finalize' ? await api.finalizePayrollRun(confirm.run.id) : await api.cancelPayrollRun(confirm.run.id); setSelected(updated); setSuccess(confirm.type === 'finalize' ? 'Расчёт зафиксирован.' : 'Расчёт отменён.'); setConfirm(null); await loadRuns(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось изменить статус расчёта.'); } finally { setBusy(false); } };
  const openRevenueEditor = () => { if (!selected || selected.status !== 'draft' || !selected.venue_id || !canAct) return; setRevenueDraft(selected.revenue_total == null ? '' : String(selected.revenue_total)); setRevenueError(''); setRevenueEditOpen(true); };
  const saveRevenue = async (clear = false) => {
    if (!selected || selected.status !== 'draft' || !selected.venue_id || !canAct) return;
    const revenueTotal = clear ? null : parseRevenue(revenueDraft);
    if (revenueTotal === undefined) { setRevenueError('Введите выручку числом не меньше нуля.'); return; }
    setRevenueBusy(true); setRevenueError('');
    try { const updated = await api.updatePayrollRunRevenue(selected.id, revenueTotal); setSelected(updated); setRevenueEditOpen(false); setRevenueDraft(''); setSuccess(revenueTotal == null ? 'Выручка удалена из черновика.' : 'Выручка за период сохранена.'); await loadRuns(); }
    catch (reason) { setRevenueError(reason instanceof Error ? reason.message : 'Не удалось сохранить выручку.'); }
    finally { setRevenueBusy(false); }
  };
  const openPayment = (item: PayrollRunItem) => { setPaymentError(''); setPaymentItem(item); setPayment({ amount: item.remaining_amount, payment_date: new Date().toISOString().slice(0, 10), method: '', comment: '' }); };
  const closePayment = () => { if (busy) return; setPaymentItem(null); setPaymentError(''); };
  const recordPayment = async () => {
    if (!selected || !paymentItem || !canAct) return;
    const amount = Number(payment.amount); const remaining = Number(paymentItem.remaining_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { setPaymentError('Сумма должна быть больше нуля и не превышать остаток.'); return; }
    setBusy(true); setPaymentError('');
    try { await api.recordPayrollPayment(selected.id, { user_id: paymentItem.user_id, amount, payment_date: payment.payment_date, method: payment.method || undefined, comment: payment.comment || undefined }); setSelected(await api.payrollRun(selected.id)); setPaymentItem(null); setPaymentError(''); setSuccess('Фактическая выплата записана.'); await loadRuns(); }
    catch (reason) { setPaymentError(reason instanceof Error ? reason.message : 'Не удалось записать выплату.'); }
    finally { setBusy(false); }
  };

  const totals = useMemo(() => ({ accrued: runs.reduce((sum, run) => sum + Number(run.total_amount || 0), 0), paid: runs.reduce((sum, run) => sum + Number(run.total_paid || 0), 0), remaining: runs.filter((run) => run.status === 'finalized').reduce((sum, run) => sum + Math.max(0, Number(run.total_amount) - Number(run.total_paid)), 0) }), [runs]);
  const filteredRuns = useMemo(() => runs
    .filter((run) => !statusFilter || run.status === statusFilter)
    .sort((left, right) => {
      const values: Record<RunSort, [string | number, string | number]> = {
        period: [left.period_start, right.period_start],
        status: [left.status, right.status],
        amount: [Number(left.total_amount || 0), Number(right.total_amount || 0)],
        remaining: [Number(left.total_amount || 0) - Number(left.total_paid || 0), Number(right.total_amount || 0) - Number(right.total_paid || 0)],
      };
      const [a, b] = values[sortKey];
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru-RU');
      return sortDirection === 'asc' ? result : -result;
    }), [runs, statusFilter, sortKey, sortDirection]);
  const pageRuns = filteredRuns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paidProgress = totals.accrued > 0 ? Math.min(100, Math.max(0, totals.paid / totals.accrued * 100)) : 0;
  const toggleSort = (key: string) => { const next = key as RunSort; if (sortKey === next) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(next); setSortDirection(next === 'period' ? 'desc' : 'asc'); } };
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault(); void openRun(id);
  };
  const openCreate = () => { setPreview(null); setRevenueInput(''); setCreateError(''); setCreateOpen(true); };
  const closeCreate = () => { if (createBusy) return; setCreateOpen(false); setPreview(null); setRevenueInput(''); setCreateError(''); };
  const openExport = () => { setExportMonth(currentMonthValue()); setExportError(''); setExportOpen(true); };
  const closeExport = () => { if (exportLoading) return; setExportOpen(false); setExportError(''); };
  const downloadReport = async (format: ExportFormat) => {
    if (!canExport) return;
    const { month, year } = monthParts(exportMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      setExportError('Выберите месяц отчёта.');
      return;
    }
    setExportLoading(format); setExportError('');
    try {
      const download = await api.createReportDownloadLink(format, month, year, venueId || undefined);
      const url = new URL(download.url);
      if (url.protocol !== 'https:') throw new Error('Безопасная ссылка на скачивание недоступна.');
      const anchor = document.createElement('a');
      anchor.href = url.toString();
      anchor.download = download.file_name;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setExportOpen(false);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'Не удалось подготовить отчёт. Попробуйте ещё раз.');
    } finally {
      setExportLoading(null);
    }
  };
  const updatePeriodStart = (value: string) => { setPeriodStart(value); setPreview(null); setCreateError(''); };
  const updatePeriodEnd = (value: string) => { setPeriodEnd(value); setPreview(null); setCreateError(''); };
  const selectedVenueName = venueId ? venues.find((venue) => venue.id === venueId)?.name || 'Точка не указана' : 'Все точки';
  const previewRevenue = venueId ? parseRevenue(revenueInput) : null;
  const previewPayrollShare = preview && previewRevenue != null && previewRevenue > 0 ? Number(preview.total_amount || 0) / previewRevenue * 100 : null;
  const previewVenueName = (row: PayrollPreview['rows'][number]) => row.venue_name?.trim() || (venueId ? selectedVenueName : 'Несколько точек');
  const selectedItems = selected?.items ?? [];
  const selectedPayments = useMemo(() => [...(selected?.payments ?? [])].sort((left, right) => {
    const dateDifference = new Date(right.payment_date).getTime() - new Date(left.payment_date).getTime();
    return dateDifference || new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  }), [selected]);
  const selectedEmployees = useMemo(() => new Map(selectedItems.map((item) => [item.user_id, item.user_name || 'Сотрудник'])), [selectedItems]);
  const closeDetails = () => { if (busy || revenueBusy) return; setSelected(null); setPaymentItem(null); setPaymentError(''); setRevenueEditOpen(false); setRevenueError(''); };
  if (loading) return <LoadingState text="Загружаем расчёты выплат…" />;
  if (error && !runs.length && !preview) return <ErrorState message={error} retry={loadRuns} />;

  return <div className="payroll-page">
    <PageHeader title="Расчёты выплат" description="Формируйте начисления за период и фиксируйте фактические выплаты." action={canExport || canAct ? <div className="page-header-actions">{canExport && <button className="button secondary" type="button" onClick={openExport}><Download />Экспорт</button>}{canAct && <button className="button primary" type="button" onClick={openCreate}><Plus />Новый расчёт</button>}</div> : undefined} />
    <section className="payroll-summary" aria-label="Финансовая сводка">
      <div><span>Начислено</span><strong><MoneyValue value={totals.accrued} /></strong></div>
      <div><span>Выплачено</span><strong><MoneyValue value={totals.paid} /></strong></div>
      <div><span>Осталось</span><strong><MoneyValue value={totals.remaining} /></strong></div>
      <div><span>Расчётов</span><strong>{runs.length}</strong></div>
      {totals.paid > 0 && totals.remaining > 0 && <div className="payroll-summary-progress"><div className="progress-track" role="progressbar" aria-label="Доля выплаченного" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paidProgress)}><span style={{ width: `${paidProgress}%` }} /></div><small>{Math.round(paidProgress)}% выплачено</small></div>}
    </section>
    {error && <div className="notice error">{error}</div>}

    <FilterBar><label className="field"><span>Статус расчёта</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Все статусы</option><option value="draft">Черновик</option><option value="finalized">Зафиксирован</option><option value="paid">Выплачен</option><option value="cancelled">Отменён</option></select></label><span className="filter-count">Найдено: {filteredRuns.length}</span></FilterBar>
    <section className="panel"><div className="panel-header"><h2>Сохранённые расчёты</h2></div>
      <DataTable label="Сохранённые расчёты" headers={[{ label: 'Период', sortKey: 'period' }, 'Точка', { label: 'Статус', sortKey: 'status' }, 'Сотрудников', { label: 'Начислено', sortKey: 'amount', align: 'right' }, { label: 'Выплачено', align: 'right' }, { label: 'Осталось', sortKey: 'remaining', align: 'right' }, 'Автор']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filteredRuns.length}>
        {pageRuns.map((run) => {
          const remaining = Math.max(0, Number(run.total_amount) - Number(run.total_paid));
          return <tr className={`payroll-table-row${run.status === 'draft' ? ' is-draft' : ''}${remaining > 0 && run.status === 'finalized' ? ' has-remaining' : ''}`} tabIndex={0} onClick={() => void openRun(run.id)} onKeyDown={(event) => openFromKeyboard(event, run.id)} aria-label={`Открыть расчёт за период ${formatDate(run.period_start)} — ${formatDate(run.period_end)}`} key={run.id}><td><div className="cell-main">{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</div><div className="cell-sub">Создан {formatDate(run.created_at)}</div>{run.payroll_share_percent != null && <div className="cell-sub">ФОТ {formatPayrollShare(run.payroll_share_percent)}</div>}</td><td>{run.venue_name || 'Все точки'}</td><td><StatusBadge status={run.status} /></td><td>{run.employees_count}</td><td className="align-right"><MoneyValue value={run.total_amount} /></td><td className="align-right"><MoneyValue value={run.total_paid} /></td><td className="align-right payroll-remaining"><MoneyValue value={remaining} /></td><td>{run.created_by_name || 'Пользователь'}</td></tr>;
        })}
      </DataTable>
      {!filteredRuns.length && <EmptyState title="Расчёты не найдены" description={runs.length ? 'Измените фильтр статуса.' : 'Сформируйте предварительный расчёт и сохраните его как черновик.'} />}
      <div className="mobile-cards">{pageRuns.map((run) => {
        const remaining = Math.max(0, Number(run.total_amount) - Number(run.total_paid));
        return <button className="mobile-card payroll-mobile-card" type="button" key={run.id} onClick={() => void openRun(run.id)}><span className="payroll-mobile-card-head"><strong>{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</strong><StatusBadge status={run.status} /></span><span className="cell-sub">{run.venue_name || 'Все точки'}{run.payroll_share_percent != null ? ` · ФОТ ${formatPayrollShare(run.payroll_share_percent)}` : ''}</span><span className="payroll-mobile-card-values"><span><small>Начислено</small><MoneyValue value={run.total_amount} /></span><span><small>Осталось</small><MoneyValue value={remaining} /></span></span></button>;
      })}</div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filteredRuns.length} onPage={setPage} />
    </section>

    {canExport && <Drawer title="Экспорт отчёта" open={exportOpen} onClose={closeExport}>
      <div className="payroll-export-drawer">
        <VisualMonthPicker value={exportMonth} disabled={Boolean(exportLoading)} onChange={(value) => { setExportMonth(value); setExportError(''); }} />
        <div className="payroll-export-context"><span>Область отчёта</span><strong>{selectedVenueName}</strong><small>Отчёт: {formatReportMonth(exportMonth)} · {selectedVenueName}</small></div>
        {exportError && <div className="notice error" role="alert">{exportError}</div>}
        <div className="payroll-export-options" aria-label="Формат отчёта">
          <button className="payroll-export-option" type="button" disabled={Boolean(exportLoading)} onClick={() => void downloadReport('xlsx')}>
            <span className="payroll-export-option-icon"><FileSpreadsheet /></span><span className="payroll-export-option-copy"><strong>Excel (.xlsx)</strong><small>Оформленный отчёт с несколькими листами</small></span><span className="payroll-export-option-status">{exportLoading === 'xlsx' ? <><LoaderCircle className="spin" />Готовим…</> : 'Скачать'}</span>
          </button>
          <button className="payroll-export-option" type="button" disabled={Boolean(exportLoading)} onClick={() => void downloadReport('csv')}>
            <span className="payroll-export-option-icon"><FileText /></span><span className="payroll-export-option-copy"><strong>CSV</strong><small>Сырые данные смен</small></span><span className="payroll-export-option-status">{exportLoading === 'csv' ? <><LoaderCircle className="spin" />Готовим…</> : 'Скачать'}</span>
          </button>
        </div>
      </div>
    </Drawer>}

    <Drawer title="Новый расчёт" open={createOpen} onClose={closeCreate} size="wide" footer={<><button className="button secondary" disabled={createBusy} onClick={closeCreate}>Отмена</button>{preview?.rows.length ? <button className="button primary" disabled={createBusy || !canAct} onClick={() => void createRun()}><Plus />Сформировать черновик</button> : <button className="button primary" disabled={createBusy} onClick={() => void doPreview()}><Calculator />Предварительный расчёт</button>}</>}>
      <div className="payroll-create-drawer">
        <div className="payroll-create-controls"><DateRangeFields start={periodStart} end={periodEnd} onStart={updatePeriodStart} onEnd={updatePeriodEnd} /><div className="payroll-create-venue"><span>Фактическая точка смен</span><strong>{selectedVenueName}</strong><small>{venueId ? 'В расчёт войдут смены на выбранной точке' : 'В расчёт войдут все фактические смены компании'}</small></div></div>
        {venueId ? <FormField label="Выручка точки за период" hint="Необязательно"><input type="text" inputMode="decimal" value={revenueInput} onChange={(event) => setRevenueInput(event.target.value)} placeholder="Например: 850 000" /><small className="payroll-revenue-help">Для расчёта доли ФОТ. На начисления сотрудникам не влияет.</small></FormField> : <div className="payroll-revenue-note">Выручка указывается в расчёте по конкретной точке.</div>}
        {createError && <div className="notice error">{createError}</div>}
        {createBusy && !preview ? <LoadingState text="Формируем предварительный расчёт…" /> : preview ? <div className="payroll-preview"><div className="metrics"><Metric label="Сотрудники" value={preview.employees_count} /><Metric label="Смены" value={preview.shifts_count} /><Metric label="Часы" value={`${formatNumber(preview.total_hours)} ч`} /><Metric label="Начислено" value={<MoneyValue value={preview.total_amount} />} /></div>
          {previewRevenue !== null && previewRevenue !== undefined && <section className="payroll-economics" aria-label="Экономика периода"><h3>Экономика периода</h3><dl><div><dt>Начислено</dt><dd><MoneyValue value={preview.total_amount} /></dd></div><div><dt>Выручка</dt><dd><MoneyValue value={previewRevenue} /></dd></div><div><dt>Доля ФОТ</dt><dd>{previewPayrollShare == null ? '—' : formatPayrollShare(previewPayrollShare)}</dd></div></dl></section>}
          <DataTable label="Предварительный расчёт по сотрудникам" headers={['Сотрудник', 'Фактические точки', 'Смены', 'Часы', 'База', 'Бонусы', 'Удержания', 'Итого']}><>{preview.rows.map((row) => <tr key={row.user_id}><td className="cell-main">{row.user_name || 'Сотрудник'}</td><td>{previewVenueName(row)}</td><td>{row.shifts_count}</td><td>{formatNumber(row.total_hours)} ч</td><td><MoneyValue value={row.base_amount} /></td><td><MoneyValue value={row.bonuses} /></td><td><MoneyValue value={row.deductions} /></td><td><MoneyValue value={row.total_amount} /></td></tr>)}</></DataTable>
          <div className="mobile-cards payroll-preview-cards">{preview.rows.map((row) => <div className="mobile-card payroll-preview-card" key={row.user_id}><span><strong>{row.user_name || 'Сотрудник'}</strong><small>{previewVenueName(row)}</small></span><span><small>Смены и часы</small><strong>{row.shifts_count} · {formatNumber(row.total_hours)} ч</strong></span><span className="align-right"><small>Начислено</small><MoneyValue value={row.total_amount} /></span></div>)}</div>
          {!preview.rows.length && <EmptyState title="За выбранный период начислений нет" description="Измените период или выбранную точку и повторите расчёт." />}
        </div> : <EmptyState title="Предварительный расчёт не сформирован" description="Выберите период, проверьте точку и запросите расчёт." />}
      </div>
    </Drawer>

    <Drawer title="Детали расчёта" open={Boolean(selected)} onClose={closeDetails} size="wide" footer={selected && canAct ? paymentItem ? <><button className="button secondary" disabled={busy} onClick={closePayment}>Отмена</button><button className="button primary" disabled={busy} onClick={() => void recordPayment()}><CircleDollarSign />Записать выплату</button></> : selected.status === 'draft' ? <><button className="button secondary" disabled={busy} onClick={() => setConfirm({ type: 'cancel', run: selected })}><X />Отменить расчёт</button><button className="button primary" disabled={busy} onClick={() => setConfirm({ type: 'finalize', run: selected })}><Check />Зафиксировать</button></> : undefined : undefined}>
      {busy && !selected ? <LoadingState /> : selected && <div className="payroll-details">
        <section className="payroll-details-header">
          <div className="payroll-details-title"><StatusBadge status={selected.status} /><h3>{selected.title || `${formatDate(selected.period_start)} — ${formatDate(selected.period_end)}`}</h3><p>{formatDate(selected.period_start)} — {formatDate(selected.period_end)} · {selected.venue_name || 'Все точки'}</p></div>
          {(selected.created_by_name || selected.created_at) && <dl className="payroll-details-meta">{selected.created_by_name && <div><dt>Автор</dt><dd>{selected.created_by_name}</dd></div>}{selected.created_at && <div><dt>Создан</dt><dd>{formatDate(selected.created_at)}</dd></div>}</dl>}
        </section>

        <section className="payroll-details-summary" aria-label="Сводка расчёта">
          <div><span>Сотрудников</span><strong>{selectedItems.length}</strong></div>
          <div><span>Начислено</span><strong><MoneyValue value={selected.total_amount} /></strong></div>
          <div><span>Выплачено</span><strong><MoneyValue value={selected.total_paid} /></strong></div>
          <div><span>Осталось</span><strong><MoneyValue value={Math.max(0, Number(selected.total_amount || 0) - Number(selected.total_paid || 0))} /></strong></div>
        </section>

        {selected.venue_id && <section className="payroll-economics payroll-details-economics" aria-labelledby="payroll-economics-title">
          <div className="payroll-economics-head"><h3 id="payroll-economics-title">Экономика периода</h3>{canAct && selected.status === 'draft' && !revenueEditOpen && <button className="button ghost" type="button" onClick={openRevenueEditor}>{selected.revenue_total == null ? 'Указать выручку' : 'Изменить'}</button>}</div>
          {revenueEditOpen && canAct && selected.status === 'draft' ? <div className="payroll-revenue-editor"><FormField label="Выручка точки за период"><input type="text" inputMode="decimal" value={revenueDraft} onChange={(event) => { setRevenueError(''); setRevenueDraft(event.target.value); }} placeholder="Например: 850 000" disabled={revenueBusy} /></FormField>{revenueError && <div className="notice error">{revenueError}</div>}<div className="payroll-revenue-actions"><button className="button primary" type="button" disabled={revenueBusy} onClick={() => void saveRevenue(false)}>{revenueBusy ? 'Сохраняем…' : 'Сохранить'}</button>{selected.revenue_total != null && <button className="button secondary" type="button" disabled={revenueBusy} onClick={() => void saveRevenue(true)}>Удалить</button>}<button className="button ghost" type="button" disabled={revenueBusy} onClick={() => { setRevenueEditOpen(false); setRevenueError(''); }}>Отмена</button></div></div> : selected.revenue_total != null ? <dl><div><dt>Начислено</dt><dd><MoneyValue value={selected.total_amount} /></dd></div><div><dt>Выручка</dt><dd><MoneyValue value={selected.revenue_total} /></dd></div><div><dt>Доля ФОТ</dt><dd>{formatPayrollShare(selected.payroll_share_percent)}</dd></div></dl> : <p className="payroll-revenue-empty">{selected.status === 'draft' ? 'Выручка за период ещё не указана' : 'Выручка не была зафиксирована'}</p>}
        </section>}

        {paymentItem && <section className="payroll-payment-form" aria-labelledby="payroll-payment-title">
          <div className="payroll-payment-form-head"><div><span>Фактическая выплата</span><h3 id="payroll-payment-title">{paymentItem.user_name || 'Сотрудник'}</h3></div><button className="icon-button" type="button" disabled={busy} onClick={closePayment} aria-label="Закрыть форму выплаты"><X /></button></div>
          <div className="payroll-payment-context"><span><small>Начислено</small><MoneyValue value={paymentItem.final_amount} /></span><span><small>Уже выплачено</small><MoneyValue value={paymentItem.paid_amount} /></span><span><small>Осталось</small><MoneyValue value={paymentItem.remaining_amount} /></span></div>
          {paymentError && <div className="notice error">{paymentError}</div>}
          <div className="payroll-payment-fields"><FormField label="Сумма"><input type="number" min="0.01" max={paymentItem.remaining_amount} step="0.01" value={payment.amount} onChange={(event) => { setPaymentError(''); setPayment({ ...payment, amount: event.target.value }); }} /></FormField><FormField label="Дата выплаты"><input type="date" value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} /></FormField><FormField label="Способ" hint="Необязательно"><input value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} placeholder="Наличные или перевод" /></FormField><FormField label="Комментарий" hint="Необязательно"><textarea value={payment.comment} onChange={(event) => setPayment({ ...payment, comment: event.target.value })} /></FormField></div>
        </section>}

        <section className="payroll-details-section">
          <div className="payroll-details-section-head"><h3>Сотрудники</h3><span>{selectedItems.length}</span></div>
          <DataTable label="Сотрудники в расчёте" headers={['Сотрудник', 'Смены', 'Часы', { label: 'База', align: 'right' }, { label: 'Бонусы', align: 'right' }, { label: 'Удержания', align: 'right' }, { label: 'Начислено', align: 'right' }, { label: 'Выплачено', align: 'right' }, { label: 'Осталось', align: 'right' }, 'Действие']} empty={!selectedItems.length}>
            {selectedItems.map((item) => <tr key={item.id}><td className="cell-main">{item.user_name || 'Сотрудник'}</td><td>{item.approved_shifts_count}</td><td>{formatNumber(item.approved_hours)} ч</td><td className="align-right"><MoneyValue value={item.base_amount} /></td><td className="align-right"><MoneyValue value={item.bonus_amount} muted={!Number(item.bonus_amount)} /></td><td className="align-right"><DeductionValue value={item.deduction_amount} /></td><td className="align-right"><MoneyValue value={item.final_amount} /></td><td className="align-right"><MoneyValue value={item.paid_amount} muted={!Number(item.paid_amount)} /></td><td className="align-right payroll-detail-remaining"><MoneyValue value={item.remaining_amount} muted={!Number(item.remaining_amount)} /></td><td>{selected.status === 'finalized' && canAct && Number(item.remaining_amount) > 0 ? <button className="button ghost payroll-payment-action" type="button" onClick={() => openPayment(item)}><CircleDollarSign />Записать выплату</button> : <span className="payroll-action-unavailable">—</span>}</td></tr>)}
          </DataTable>
          <div className="mobile-cards payroll-detail-cards">{selectedItems.map((item) => <article className="mobile-card payroll-detail-card" key={item.id}><div className="payroll-detail-card-head"><strong>{item.user_name || 'Сотрудник'}</strong><span>{item.approved_shifts_count} смен · {formatNumber(item.approved_hours)} ч</span></div><div className="payroll-detail-card-values"><span><small>Начислено</small><MoneyValue value={item.final_amount} /></span><span><small>Выплачено</small><MoneyValue value={item.paid_amount} muted={!Number(item.paid_amount)} /></span><span><small>Осталось</small><MoneyValue value={item.remaining_amount} muted={!Number(item.remaining_amount)} /></span></div>{selected.status === 'finalized' && canAct && Number(item.remaining_amount) > 0 && <button className="button secondary" type="button" onClick={() => openPayment(item)}><CircleDollarSign />Записать выплату</button>}</article>)}</div>
          {!selectedItems.length && <EmptyState title="В расчёте нет сотрудников" description="Сохранённые строки начислений отсутствуют." />}
        </section>

        <section className="payroll-details-section">
          <div className="payroll-details-section-head"><h3>История выплат</h3><span>{selectedPayments.length}</span></div>
          {selectedPayments.length ? <div className="payroll-payment-history" role="list">{selectedPayments.map((record) => <div className="payroll-payment-history-row" role="listitem" key={record.id}><span><small>Дата</small><strong>{formatDate(record.payment_date)}</strong></span><span><small>Сотрудник</small><strong>{selectedEmployees.get(record.user_id) || 'Сотрудник'}</strong></span><span className="align-right"><small>Сумма</small><MoneyValue value={record.amount} /></span><span><small>Способ</small><strong>{record.method || 'Не указан'}</strong></span><span><small>Комментарий</small><strong>{record.comment || 'Без комментария'}</strong></span></div>)}</div> : <EmptyState title="Выплат пока нет" description="Фактические выплаты появятся здесь после записи." />}
        </section>
      </div>}
    </Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title={confirm?.type === 'finalize' ? 'Зафиксировать расчёт?' : 'Отменить расчёт?'} text={confirm?.type === 'finalize' ? 'Сохранённый snapshot больше не будет пересчитываться по сменам.' : 'Расчёт останется в истории, но не будет доступен для оплаты.'} confirmLabel={confirm?.type === 'finalize' ? 'Зафиксировать' : 'Отменить расчёт'} danger={confirm?.type === 'cancel'} onClose={() => setConfirm(null)} onConfirm={() => void transition()} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </div>;
}

function DeductionValue({ value }: { value: string | number }) {
  const amount = Math.abs(Number(value || 0));
  return amount > 0 ? <span className="deduction-value">−<MoneyValue value={amount} /></span> : <MoneyValue value={0} muted />;
}
