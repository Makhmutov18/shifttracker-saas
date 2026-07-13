import { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, CircleDollarSign, Eye, Plus, X } from 'lucide-react';
import { api } from '../api';
import { ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FilterBar, FormField, LoadingState, Metric, MoneyValue, PageHeader, StatusBadge } from '../components/ui';
import type { PayrollPreview, PayrollRun, PayrollRunItem, PayrollRunListItem, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatNumber, isOwnerOrAdmin, monthBounds } from '../utils';

type ConfirmAction = { type: 'finalize' | 'cancel'; run: PayrollRun } | null;

export function PayrollPage({ user, venues, venueId }: { user: User; venues: Venue[]; venueId: string }) {
  const bounds = monthBounds(currentMonthValue());
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [selected, setSelected] = useState<PayrollRun | null>(null);
  const [paymentItem, setPaymentItem] = useState<PayrollRunItem | null>(null);
  const [payment, setPayment] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: '', comment: '' });
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
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

  const openRun = async (id: string) => { setBusy(true); setError(''); try { setSelected(await api.payrollRun(id)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть расчёт.'); } finally { setBusy(false); } };
  const doPreview = async () => { if (!periodStart || !periodEnd || periodStart > periodEnd) { setError('Проверьте даты периода.'); return; } setBusy(true); setError(''); setSuccess(''); try { setPreview(await api.payrollPreview(periodStart, periodEnd, venueId || undefined)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сформировать предварительный расчёт.'); } finally { setBusy(false); } };
  const createRun = async () => { if (!preview || !canAct) return; setBusy(true); setError(''); try { const run = await api.createPayrollRun({ period_start: periodStart, period_end: periodEnd, venue_id: venueId || undefined }); setSuccess('Черновик расчёта сформирован.'); setPreview(null); await loadRuns(); await openRun(run.id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сформировать черновик.'); } finally { setBusy(false); } };
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
  if (loading) return <LoadingState text="Загружаем расчёты выплат…" />;
  if (error && !runs.length && !preview) return <ErrorState message={error} retry={loadRuns} />;

  return <>
    <PageHeader title="Расчёты выплат" description="Формируйте начисления за период и фиксируйте фактические выплаты." action={canAct ? <button className="button primary" onClick={() => document.getElementById('payroll-create')?.scrollIntoView({ behavior: 'smooth' })}><Plus />Новый расчёт</button> : undefined} />
    <div className="metrics"><Metric label="Расчётов" value={runs.length} /><Metric label="Начислено" value={<MoneyValue value={totals.accrued} />} /><Metric label="Выплачено фактически" value={<MoneyValue value={totals.paid} />} /><Metric label="Осталось" value={<MoneyValue value={totals.remaining} />} /></div>
    {error && <div className="notice error">{error}</div>}{success && <div className="notice success">{success}</div>}

    <section className="panel"><div className="panel-header"><h2>Сохранённые расчёты</h2></div>
      <DataTable headers={['Период', 'Точка', 'Статус', 'Сотрудников', 'Начислено', 'Выплачено', 'Осталось', 'Автор', '']} empty={!runs.length}>
        {runs.map((run) => <tr key={run.id}><td><div className="cell-main">{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</div><div className="cell-sub">Создан {formatDate(run.created_at)}</div></td><td>{run.venue_name || 'Все точки'}</td><td><StatusBadge status={run.status} /></td><td>{run.employees_count}</td><td><MoneyValue value={run.total_amount} /></td><td><MoneyValue value={run.total_paid} /></td><td><MoneyValue value={Math.max(0, Number(run.total_amount) - Number(run.total_paid))} /></td><td>{run.created_by_name || 'Пользователь'}</td><td><button className="icon-button" onClick={() => void openRun(run.id)}><Eye /></button></td></tr>)}
      </DataTable>
      {!runs.length && <EmptyState title="Расчётов пока нет" description="Сформируйте предварительный расчёт и сохраните его как черновик." />}
      <div className="mobile-cards">{runs.map((run) => <button className="mobile-card" key={run.id} onClick={() => void openRun(run.id)}><strong>{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</strong><p>{run.venue_name || 'Все точки'} · <MoneyValue value={run.total_amount} /></p><StatusBadge status={run.status} /></button>)}</div>
    </section>

    <section className="panel" id="payroll-create"><div className="panel-header"><h2>Сформировать расчёт</h2></div><div className="panel-body">
      <FilterBar><label className="field"><span>Начало периода</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label className="field"><span>Конец периода</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><button className="button secondary" disabled={busy} onClick={() => void doPreview()}><Calculator />Предварительный расчёт</button></FilterBar>
      {preview ? <><div className="metrics"><Metric label="Сотрудники" value={preview.employees_count} /><Metric label="Смены" value={preview.shifts_count} /><Metric label="Часы" value={`${formatNumber(preview.total_hours)} ч`} /><Metric label="Начислено" value={<MoneyValue value={preview.total_amount} />} /></div>
        <DataTable headers={['Сотрудник', 'Точка', 'Смены', 'Часы', 'База', 'Бонусы', 'Удержания', 'Итого']}><>{preview.rows.map((row) => <tr key={row.user_id}><td className="cell-main">{row.user_name}</td><td>{row.venue_name || 'Основная точка'}</td><td>{row.shifts_count}</td><td>{formatNumber(row.total_hours)} ч</td><td><MoneyValue value={row.base_amount} /></td><td><MoneyValue value={row.bonuses} /></td><td><MoneyValue value={row.deductions} /></td><td><MoneyValue value={row.total_amount} /></td></tr>)}</></DataTable>
        {!preview.rows.length && <EmptyState title="За выбранный период начислений нет" />}
        {canAct && preview.rows.length > 0 && <div className="panel-actions"><button className="button primary" disabled={busy} onClick={() => void createRun()}><Plus />Сформировать черновик</button></div>}
      </> : <EmptyState title="Предварительный расчёт не сформирован" description="Выберите период и точку, затем запросите расчёт." />}
    </div></section>

    <Drawer title="Детали расчёта" open={Boolean(selected)} onClose={() => { setSelected(null); setPaymentItem(null); }} footer={selected && canAct ? <>{selected.status === 'draft' && <><button className="button secondary" onClick={() => setConfirm({ type: 'cancel', run: selected })}><X />Отменить</button><button className="button primary" onClick={() => setConfirm({ type: 'finalize', run: selected })}><Check />Зафиксировать</button></>}</> : undefined}>
      {busy && !selected ? <LoadingState /> : selected && <div className="form-section"><div><StatusBadge status={selected.status} /><h3>{selected.title}</h3><p className="cell-sub">{formatDate(selected.period_start)} — {formatDate(selected.period_end)} · {selected.venue_name || 'Все точки'}</p></div><div className="metrics"><Metric label="Начислено" value={<MoneyValue value={selected.total_amount} />} /><Metric label="Выплачено" value={<MoneyValue value={selected.total_paid} />} /></div>{selected.items.map((item) => <div className="list-row" key={item.id}><div><strong>{item.user_name || 'Сотрудник'}</strong><p>{item.approved_shifts_count} смен · {formatNumber(item.approved_hours)} ч · удержания {formatMoneyLocal(item.deduction_amount)}</p></div><div><strong><MoneyValue value={item.remaining_amount} /></strong>{selected.status === 'finalized' && canAct && Number(item.remaining_amount) > 0 && <button className="button ghost" onClick={() => openPayment(item)}><CircleDollarSign />Записать выплату</button>}</div></div>)}</div>}
    </Drawer>
    <Drawer title="Записать фактическую выплату" open={Boolean(paymentItem)} onClose={() => setPaymentItem(null)} footer={<><button className="button secondary" onClick={() => setPaymentItem(null)}>Отмена</button><button className="button primary" disabled={busy} onClick={() => void recordPayment()}>Записать выплату</button></>}>
      {paymentItem && <div className="form-section"><h3>{paymentItem.user_name || 'Сотрудник'}</h3><p className="cell-sub">Начислено {formatMoneyLocal(paymentItem.final_amount)} · осталось {formatMoneyLocal(paymentItem.remaining_amount)}</p><FormField label="Сумма"><input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} /></FormField><FormField label="Дата выплаты"><input type="date" value={payment.payment_date} onChange={(event) => setPayment({ ...payment, payment_date: event.target.value })} /></FormField><FormField label="Способ" hint="Необязательно"><input value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })} placeholder="Наличные или перевод" /></FormField><FormField label="Комментарий" hint="Необязательно"><textarea value={payment.comment} onChange={(event) => setPayment({ ...payment, comment: event.target.value })} /></FormField></div>}
    </Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title={confirm?.type === 'finalize' ? 'Зафиксировать расчёт?' : 'Отменить расчёт?'} text={confirm?.type === 'finalize' ? 'Сохранённый snapshot больше не будет пересчитываться по сменам.' : 'Расчёт останется в истории, но не будет доступен для оплаты.'} confirmLabel={confirm?.type === 'finalize' ? 'Зафиксировать' : 'Отменить расчёт'} danger={confirm?.type === 'cancel'} onClose={() => setConfirm(null)} onConfirm={() => void transition()} />
  </>;
}

function formatMoneyLocal(value: string | number): string { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(Number(value || 0)); }
