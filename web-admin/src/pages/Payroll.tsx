import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Calculator, Check, CircleDollarSign, Plus, X } from 'lucide-react';
import { api } from '../api';
import { ConfirmationDialog, DataTable, DateRangeFields, Drawer, EmptyState, ErrorState, FilterBar, FormField, LoadingState, Metric, MoneyValue, PageHeader, Pagination, StatusBadge, Toast, type SortDirection } from '../components/ui';
import type { PayrollPreview, PayrollRun, PayrollRunItem, PayrollRunListItem, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatNumber, isOwnerOrAdmin, monthBounds } from '../utils';

type ConfirmAction = { type: 'finalize' | 'cancel'; run: PayrollRun } | null;
type RunSort = 'period' | 'status' | 'amount' | 'remaining';
const PAGE_SIZE = 12;

export function PayrollPage({ user, venues, venueId }: { user: User; venues: Venue[]; venueId: string }) {
  const bounds = monthBounds(currentMonthValue());
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [selected, setSelected] = useState<PayrollRun | null>(null);
  const [paymentItem, setPaymentItem] = useState<PayrollRunItem | null>(null);
  const [payment, setPayment] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: '', comment: '' });
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

  const loadRuns = async () => {
    setLoading(true); setError('');
    try { setRuns(await api.payrollRuns(venueId || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить расчёты.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadRuns(); }, [venueId]);
  useEffect(() => { setPage(1); }, [venueId, statusFilter, sortKey, sortDirection]);

  const openRun = async (id: string) => { setBusy(true); setError(''); try { setSelected(await api.payrollRun(id)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть расчёт.'); } finally { setBusy(false); } };
  const doPreview = async () => {
    if (!periodStart || !periodEnd || periodStart > periodEnd) { setCreateError('Проверьте даты периода.'); return; }
    setCreateBusy(true); setCreateError(''); setSuccess('');
    try { setPreview(await api.payrollPreview(periodStart, periodEnd, venueId || undefined)); }
    catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Не удалось сформировать предварительный расчёт.'); }
    finally { setCreateBusy(false); }
  };
  const createRun = async () => {
    if (!preview || !canAct) return;
    setCreateBusy(true); setCreateError('');
    try {
      const run = await api.createPayrollRun({ period_start: periodStart, period_end: periodEnd, venue_id: venueId || undefined });
      setSuccess('Черновик расчёта сформирован.'); setCreateOpen(false); setPreview(null);
      await loadRuns(); await openRun(run.id);
    } catch (reason) { setCreateError(reason instanceof Error ? reason.message : 'Не удалось сформировать черновик.'); }
    finally { setCreateBusy(false); }
  };
  const transition = async () => { if (!confirm) return; setBusy(true); setError(''); try { const updated = confirm.type === 'finalize' ? await api.finalizePayrollRun(confirm.run.id) : await api.cancelPayrollRun(confirm.run.id); setSelected(updated); setSuccess(confirm.type === 'finalize' ? 'Расчёт зафиксирован.' : 'Расчёт отменён.'); setConfirm(null); await loadRuns(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось изменить статус расчёта.'); } finally { setBusy(false); } };
  const openPayment = (item: PayrollRunItem) => { setPaymentItem(item); setPayment({ amount: item.remaining_amount, payment_date: new Date().toISOString().slice(0, 10), method: '', comment: '' }); };
  const recordPayment = async () => {
    if (!selected || !paymentItem || !canAct) return;
    const amount = Number(payment.amount); const remaining = Number(paymentItem.remaining_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { setError('Сумма должна быть больше нуля и не превышать остаток.'); return; }
    setBusy(true); setError('');
    try { await api.recordPayrollPayment(selected.id, { user_id: paymentItem.user_id, amount, payment_date: payment.payment_date, method: payment.method || undefined, comment: payment.comment || undefined }); setSelected(await api.payrollRun(selected.id)); setPaymentItem(null); setSuccess('Фактическая выплата записана.'); await loadRuns(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось записать выплату.'); }
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
  const openCreate = () => { setPreview(null); setCreateError(''); setCreateOpen(true); };
  const closeCreate = () => { if (createBusy) return; setCreateOpen(false); setPreview(null); setCreateError(''); };
  const updatePeriodStart = (value: string) => { setPeriodStart(value); setPreview(null); setCreateError(''); };
  const updatePeriodEnd = (value: string) => { setPeriodEnd(value); setPreview(null); setCreateError(''); };
  const selectedVenueName = venueId ? venues.find((venue) => venue.id === venueId)?.name || 'Точка не указана' : 'Все точки';
  if (loading) return <LoadingState text="Загружаем расчёты выплат…" />;
  if (error && !runs.length && !preview) return <ErrorState message={error} retry={loadRuns} />;

  return <div className="payroll-page">
    <PageHeader title="Расчёты выплат" description="Формируйте начисления за период и фиксируйте фактические выплаты." action={canAct ? <button className="button primary" onClick={openCreate}><Plus />Новый расчёт</button> : undefined} />
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
          return <tr className={`payroll-table-row${run.status === 'draft' ? ' is-draft' : ''}${remaining > 0 && run.status === 'finalized' ? ' has-remaining' : ''}`} tabIndex={0} onClick={() => void openRun(run.id)} onKeyDown={(event) => openFromKeyboard(event, run.id)} aria-label={`Открыть расчёт за период ${formatDate(run.period_start)} — ${formatDate(run.period_end)}`} key={run.id}><td><div className="cell-main">{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</div><div className="cell-sub">Создан {formatDate(run.created_at)}</div></td><td>{run.venue_name || 'Все точки'}</td><td><StatusBadge status={run.status} /></td><td>{run.employees_count}</td><td className="align-right"><MoneyValue value={run.total_amount} /></td><td className="align-right"><MoneyValue value={run.total_paid} /></td><td className="align-right payroll-remaining"><MoneyValue value={remaining} /></td><td>{run.created_by_name || 'Пользователь'}</td></tr>;
        })}
      </DataTable>
      {!filteredRuns.length && <EmptyState title="Расчёты не найдены" description={runs.length ? 'Измените фильтр статуса.' : 'Сформируйте предварительный расчёт и сохраните его как черновик.'} />}
      <div className="mobile-cards">{pageRuns.map((run) => {
        const remaining = Math.max(0, Number(run.total_amount) - Number(run.total_paid));
        return <button className="mobile-card payroll-mobile-card" type="button" key={run.id} onClick={() => void openRun(run.id)}><span className="payroll-mobile-card-head"><strong>{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</strong><StatusBadge status={run.status} /></span><span className="cell-sub">{run.venue_name || 'Все точки'}</span><span className="payroll-mobile-card-values"><span><small>Начислено</small><MoneyValue value={run.total_amount} /></span><span><small>Осталось</small><MoneyValue value={remaining} /></span></span></button>;
      })}</div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filteredRuns.length} onPage={setPage} />
    </section>

    <Drawer title="Новый расчёт" open={createOpen} onClose={closeCreate} size="wide" footer={<><button className="button secondary" disabled={createBusy} onClick={closeCreate}>Отмена</button>{preview?.rows.length ? <button className="button primary" disabled={createBusy || !canAct} onClick={() => void createRun()}><Plus />Сформировать черновик</button> : <button className="button primary" disabled={createBusy} onClick={() => void doPreview()}><Calculator />Предварительный расчёт</button>}</>}>
      <div className="payroll-create-drawer">
        <div className="payroll-create-controls"><DateRangeFields start={periodStart} end={periodEnd} onStart={updatePeriodStart} onEnd={updatePeriodEnd} /><div className="payroll-create-venue"><span>Точка</span><strong>{selectedVenueName}</strong><small>Используется глобальный выбор точки</small></div></div>
        {createError && <div className="notice error">{createError}</div>}
        {createBusy && !preview ? <LoadingState text="Формируем предварительный расчёт…" /> : preview ? <div className="payroll-preview"><div className="metrics"><Metric label="Сотрудники" value={preview.employees_count} /><Metric label="Смены" value={preview.shifts_count} /><Metric label="Часы" value={`${formatNumber(preview.total_hours)} ч`} /><Metric label="Начислено" value={<MoneyValue value={preview.total_amount} />} /></div>
          <DataTable label="Предварительный расчёт по сотрудникам" headers={['Сотрудник', 'Точка', 'Смены', 'Часы', 'База', 'Бонусы', 'Удержания', 'Итого']}><>{preview.rows.map((row) => <tr key={row.user_id}><td className="cell-main">{row.user_name || 'Сотрудник'}</td><td>{row.venue_name || 'Основная точка'}</td><td>{row.shifts_count}</td><td>{formatNumber(row.total_hours)} ч</td><td><MoneyValue value={row.base_amount} /></td><td><MoneyValue value={row.bonuses} /></td><td><MoneyValue value={row.deductions} /></td><td><MoneyValue value={row.total_amount} /></td></tr>)}</></DataTable>
          <div className="mobile-cards payroll-preview-cards">{preview.rows.map((row) => <div className="mobile-card payroll-preview-card" key={row.user_id}><span><strong>{row.user_name || 'Сотрудник'}</strong><small>{row.venue_name || 'Основная точка'}</small></span><span><small>Смены и часы</small><strong>{row.shifts_count} · {formatNumber(row.total_hours)} ч</strong></span><span className="align-right"><small>Начислено</small><MoneyValue value={row.total_amount} /></span></div>)}</div>
          {!preview.rows.length && <EmptyState title="За выбранный период начислений нет" description="Измените период или выбранную точку и повторите расчёт." />}
        </div> : <EmptyState title="Предварительный расчёт не сформирован" description="Выберите период, проверьте точку и запросите расчёт." />}
      </div>
    </Drawer>

    <Drawer title="Детали расчёта" open={Boolean(selected)} onClose={() => { setSelected(null); setPaymentItem(null); }} footer={selected && canAct ? <>{selected.status === 'draft' && <><button className="button secondary" onClick={() => setConfirm({ type: 'cancel', run: selected })}><X />Отменить</button><button className="button primary" onClick={() => setConfirm({ type: 'finalize', run: selected })}><Check />Зафиксировать</button></>}</> : undefined}>
      {busy && !selected ? <LoadingState /> : selected && <div className="form-section"><div><StatusBadge status={selected.status} /><h3>{selected.title}</h3><p className="cell-sub">{formatDate(selected.period_start)} — {formatDate(selected.period_end)} · {selected.venue_name || 'Все точки'}</p></div><div className="metrics"><Metric label="Начислено" value={<MoneyValue value={selected.total_amount} />} /><Metric label="Выплачено" value={<MoneyValue value={selected.total_paid} />} /></div>{selected.items.map((item) => <div className="list-row" key={item.id}><div><strong>{item.user_name || 'Сотрудник'}</strong><p>{item.approved_shifts_count} смен · {formatNumber(item.approved_hours)} ч · удержания {formatMoneyLocal(item.deduction_amount)}</p></div><div><strong><MoneyValue value={item.remaining_amount} /></strong>{selected.status === 'finalized' && canAct && Number(item.remaining_amount) > 0 && <button className="button ghost" onClick={() => openPayment(item)}><CircleDollarSign />Записать выплату</button>}</div></div>)}</div>}
    </Drawer>
    <Drawer title="Записать фактическую выплату" open={Boolean(paymentItem)} onClose={() => setPaymentItem(null)} footer={<><button className="button secondary" onClick={() => setPaymentItem(null)}>Отмена</button><button className="button primary" disabled={busy} onClick={() => void recordPayment()}>Записать выплату</button></>}>
      {paymentItem && <div className="form-section"><h3>{paymentItem.user_name || 'Сотрудник'}</h3><p className="cell-sub">Начислено {formatMoneyLocal(paymentItem.final_amount)} · осталось {formatMoneyLocal(paymentItem.remaining_amount)}</p><FormField label="Сумма"><input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></FormField><FormField label="Дата выплаты"><input type="date" value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} /></FormField><FormField label="Способ" hint="Необязательно"><input value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} placeholder="Наличные или перевод" /></FormField><FormField label="Комментарий" hint="Необязательно"><textarea value={payment.comment} onChange={(event) => setPayment({ ...payment, comment: event.target.value })} /></FormField></div>}
    </Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title={confirm?.type === 'finalize' ? 'Зафиксировать расчёт?' : 'Отменить расчёт?'} text={confirm?.type === 'finalize' ? 'Сохранённый snapshot больше не будет пересчитываться по сменам.' : 'Расчёт останется в истории, но не будет доступен для оплаты.'} confirmLabel={confirm?.type === 'finalize' ? 'Зафиксировать' : 'Отменить расчёт'} danger={confirm?.type === 'cancel'} onClose={() => setConfirm(null)} onConfirm={() => void transition()} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </div>;
}

function formatMoneyLocal(value: string | number): string { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value || 0)); }
