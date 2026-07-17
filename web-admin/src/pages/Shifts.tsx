import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, Info, X } from 'lucide-react';
import { api } from '../api';
import { AvatarStack, ConfirmationDialog, DataTable, DateRangeFields, Drawer, EmptyState, ErrorState, FilterBar, FormField, LoadingState, MoneyValue, PageHeader, Pagination, SearchSelect, StatusBadge, Toast, type SortDirection } from '../components/ui';
import type { Shift, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatNumber, formatTime, hasPermission, monthBounds, payModelLabels } from '../utils';

type ShiftSort = 'date' | 'employee' | 'revenue' | 'salary';
type ShiftStatusFilter = '' | 'pending' | 'approved' | 'rejected';
const PAGE_SIZE = 15;

function monthsInRange(start: string, end: string): Array<{ month: number; year: number }> {
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || first > last) return [];
  const result: Array<{ month: number; year: number }> = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const finish = new Date(last.getFullYear(), last.getMonth(), 1);
  while (cursor <= finish && result.length < 24) {
    result.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

export function ShiftsPage({ user, venues, venueId }: { user: User; venues: Venue[]; venueId: string }) {
  const bounds = monthBounds(currentMonthValue());
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);
  const [status, setStatus] = useState<ShiftStatusFilter>('');
  const [employeeId, setEmployeeId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [form, setForm] = useState({ start_time: '', end_time: '', revenue: '', comment: '' });
  const [confirm, setConfirm] = useState<'approved' | 'rejected' | null>(null);
  const [sortKey, setSortKey] = useState<ShiftSort>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canApprove = hasPermission(user, 'can_approve_shifts');
  const canEdit = hasPermission(user, 'can_edit_team_shifts') || canApprove;

  const load = async () => {
    setLoading(true); setError('');
    const months = monthsInRange(periodStart, periodEnd);
    if (!months.length) { setError('Проверьте даты периода.'); setLoading(false); return; }
    const [shiftResult, userResult] = await Promise.allSettled([
      Promise.all(months.map(({ month, year }) => api.shifts(month, year, venueId || undefined))),
      api.users(true),
    ]);
    if (shiftResult.status === 'fulfilled') {
      const unique = new Map(shiftResult.value.flat().map((shift) => [shift.id, shift]));
      setShifts(Array.from(unique.values()));
    } else setError(shiftResult.reason instanceof Error ? shiftResult.reason.message : 'Не удалось загрузить смены.');
    setUsers(userResult.status === 'fulfilled' ? userResult.value : []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [periodStart, periodEnd, venueId]);
  useEffect(() => { setPage(1); }, [periodStart, periodEnd, venueId, status, employeeId, sortKey, sortDirection]);

  const userMap = useMemo(() => new Map((users ?? []).map((employee) => [employee.id, employee])), [users]);
  const venueMap = useMemo(() => new Map((venues ?? []).map((venue) => [venue.id, venue])), [venues]);
  const filtered = useMemo(() => (shifts ?? [])
    .filter((shift) => shift.date >= periodStart && shift.date <= periodEnd && (!status || shift.status === status) && (!employeeId || shift.user_id === employeeId))
    .sort((left, right) => {
      const values: Record<ShiftSort, [string | number, string | number]> = {
        date: [left.date || '', right.date || ''],
        employee: [userMap.get(left.user_id)?.name || '', userMap.get(right.user_id)?.name || ''],
        revenue: [Number(left.revenue || 0), Number(right.revenue || 0)],
        salary: [Number(left.salary_earned || 0), Number(right.salary_earned || 0)],
      };
      const [a, b] = values[sortKey];
      const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru-RU');
      return sortDirection === 'asc' ? result : -result;
    }), [shifts, periodStart, periodEnd, status, employeeId, sortKey, sortDirection, userMap]);
  const statusCounts = useMemo(() => {
    const scoped = (shifts ?? []).filter((shift) => shift.date >= periodStart && shift.date <= periodEnd && (!employeeId || shift.user_id === employeeId));
    return scoped.reduce((counts, shift) => {
      if (shift.status === 'pending' || shift.status === 'approved' || shift.status === 'rejected') counts[shift.status] += 1;
      return counts;
    }, { pending: 0, approved: 0, rejected: 0 });
  }, [shifts, periodStart, periodEnd, employeeId]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: string) => {
    const next = key as ShiftSort;
    if (sortKey === next) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortKey(next); setSortDirection(next === 'date' ? 'desc' : 'asc'); }
  };
  const open = (shift: Shift) => { setSelected(shift); setForm({ start_time: (shift.start_time || '').slice(0, 5), end_time: (shift.end_time || '').slice(0, 5), revenue: shift.revenue ?? '', comment: shift.comment ?? '' }); };
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, shift: Shift) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open(shift);
  };
  const toggleStatus = (nextStatus: Exclude<ShiftStatusFilter, ''>) => setStatus((current) => current === nextStatus ? '' : nextStatus);
  const venueName = (shift: Shift, employee?: User) => venueMap.get(shift.venue_id || '')?.name || employee?.venue?.name || 'Основная точка';
  const save = async (nextStatus?: 'approved' | 'rejected') => {
    if (!selected) return; setSaving(true); setError('');
    try {
      const updated = await api.updateShift(selected.id, { start_time: form.start_time, end_time: form.end_time, revenue: form.revenue || null, comment: form.comment || null, status: nextStatus ?? selected.status });
      setShifts((current) => current.map((shift) => shift.id === updated.id ? updated : shift));
      setSuccess(nextStatus === 'approved' ? 'Смена утверждена.' : nextStatus === 'rejected' ? 'Смена отклонена.' : 'Изменения смены сохранены.');
      setSelected(null); setConfirm(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить смену.'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState text="Загружаем смены…" />;
  if (error && !shifts.length) return <ErrorState message={error} retry={load} />;
  return <div className="shifts-page">
    <PageHeader title="Смены" description="Проверяйте, редактируйте и утверждайте смены команды." />
    {error && <div className="notice error">{error}</div>}
    <FilterBar>
      <DateRangeFields start={periodStart} end={periodEnd} onStart={setPeriodStart} onEnd={setPeriodEnd} />
      <label className="field"><span>Статус</span><select value={status} onChange={(event) => setStatus(event.target.value as ShiftStatusFilter)}><option value="">Все статусы</option><option value="pending">На подтверждении</option><option value="approved">Утверждено</option><option value="rejected">Отклонено</option></select></label>
      <label className="field"><span>Сотрудник</span><SearchSelect value={employeeId} onChange={setEmployeeId} placeholder="Все сотрудники" options={(users ?? []).filter((employee) => employee.is_active).map((employee) => ({ value: employee.id, label: employee.name || 'Сотрудник' }))} /></label>
      <span className="filter-count">Найдено: {filtered.length}</span>
    </FilterBar>
    <section className="shift-status-filters" aria-label="Фильтр по статусу смен">
      {([
        { value: 'pending', label: 'На подтверждении', count: statusCounts.pending },
        { value: 'approved', label: 'Утверждено', count: statusCounts.approved },
        { value: 'rejected', label: 'Отклонено', count: statusCounts.rejected },
      ] as const).map((item) => <button
        type="button"
        className={`shift-status-filter${status === item.value ? ' is-active' : ''}${item.value === 'pending' && item.count > 0 ? ' is-priority' : ''}`}
        aria-pressed={status === item.value}
        onClick={() => toggleStatus(item.value)}
        key={item.value}
      >
        <span>{item.label}</span>
        <strong className="shift-status-filter-count">{item.count}</strong>
      </button>)}
    </section>
    <section className="panel">
      <DataTable label="Смены команды" headers={[{ label: 'Дата', sortKey: 'date' }, { label: 'Сотрудник', sortKey: 'employee' }, 'Точка', 'Начало / конец', 'Часы', { label: 'Выручка', sortKey: 'revenue', align: 'right' }, { label: 'Начислено', sortKey: 'salary', align: 'right' }, 'Статус']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
        {pageRows.map((shift) => {
          const employee = userMap.get(shift.user_id);
          const payModel = payModelLabels[employee?.pay_model || ''] || 'Модель оплаты не указана';
          const employeeName = employee?.name || 'Сотрудник';
          return <tr
            className="shift-table-row"
            tabIndex={0}
            aria-label={`Открыть смену: ${employeeName}, ${formatDate(shift.date)}`}
            onClick={() => open(shift)}
            onKeyDown={(event) => openFromKeyboard(event, shift)}
            key={shift.id}
          ><td>{formatDate(shift.date)}</td><td><div className="person-cell"><AvatarStack items={[{ name: employeeName }]} max={1} /><span><strong>{employeeName}</strong><small>{employee?.position || 'Без должности'}</small></span></div></td><td>{venueName(shift, employee)}</td><td>{formatTime(shift.start_time)}–{formatTime(shift.end_time)}</td><td>{formatNumber(shift.total_hours)} ч</td><td className="align-right"><MoneyValue value={shift.revenue} muted={!shift.revenue} /></td><td className="align-right"><span className="pay-with-info"><MoneyValue value={shift.salary_earned} /><span title={`Модель расчёта: ${payModel}`} aria-label={`Модель расчёта: ${payModel}`}><Info /></span></span></td><td><StatusBadge status={shift.status || 'unknown'} /></td></tr>;
        })}
      </DataTable>
      {!filtered.length && <EmptyState title="Смены не найдены" description="Измените фильтры или выберите другой период." />}
      <div className="mobile-cards">{pageRows.map((shift) => {
        const employee = userMap.get(shift.user_id);
        const employeeName = employee?.name || 'Сотрудник';
        return <button className="mobile-card shift-mobile-card" type="button" key={shift.id} onClick={() => open(shift)} aria-label={`Открыть смену: ${employeeName}, ${formatDate(shift.date)}`}>
          <span className="shift-mobile-card-head"><span className="person-cell"><AvatarStack items={[{ name: employeeName }]} max={1} /><span><strong>{employeeName}</strong><small>{employee?.position || 'Без должности'}</small></span></span><StatusBadge status={shift.status || 'unknown'} /></span>
          <span className="shift-mobile-card-details"><span><small>Дата</small><strong>{formatDate(shift.date)}</strong></span><span><small>Время</small><strong>{formatTime(shift.start_time)}–{formatTime(shift.end_time)}</strong></span></span>
          <span className="shift-mobile-card-footer"><span><small>Точка</small><strong>{venueName(shift, employee)}</strong></span><span className="align-right"><small>Начислено</small><MoneyValue value={shift.salary_earned} /></span></span>
        </button>;
      })}</div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </section>
    <Drawer title="Детали смены" open={Boolean(selected)} onClose={() => setSelected(null)} footer={<><button className="button secondary" onClick={() => setSelected(null)}>Закрыть</button>{selected?.status === 'pending' && canApprove && <><button className="button secondary" disabled={saving} onClick={() => setConfirm('rejected')}><X />Отклонить</button><button className="button primary" disabled={saving} onClick={() => setConfirm('approved')}><Check />Утвердить</button></>}</>}>
      {selected && <div className="form-section"><h3>{userMap.get(selected.user_id)?.name || 'Сотрудник'} · {formatDate(selected.date)}</h3><FormField label="Начало смены"><input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} disabled={!canEdit} /></FormField><FormField label="Конец смены"><input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} disabled={!canEdit} /></FormField><FormField label="Выручка"><input type="number" min="0" value={form.revenue} onChange={(event) => setForm({ ...form, revenue: event.target.value })} disabled={!canEdit} /></FormField><FormField label="Комментарий"><textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} disabled={!canEdit} /></FormField>{canEdit && <button className="button secondary" disabled={saving} onClick={() => void save()}>Сохранить изменения</button>}</div>}
    </Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title={confirm === 'approved' ? 'Утвердить смену?' : 'Отклонить смену?'} text={confirm === 'approved' ? 'Смена войдёт в начисления сотрудника.' : 'Отклонённая смена не войдёт в начисления.'} confirmLabel={confirm === 'approved' ? 'Утвердить' : 'Отклонить'} danger={confirm === 'rejected'} onClose={() => setConfirm(null)} onConfirm={() => confirm && void save(confirm)} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </div>;
}
