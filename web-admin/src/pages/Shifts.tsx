import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, X } from 'lucide-react';
import { api } from '../api';
import { ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FilterBar, FormField, LoadingState, MoneyValue, PageHeader, StatusBadge } from '../components/ui';
import type { Shift, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatNumber, formatTime, hasPermission, monthParts } from '../utils';

export function ShiftsPage({ user, venues, venueId }: { user: User; venues: Venue[]; venueId: string }) {
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [status, setStatus] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [form, setForm] = useState({ start_time: '', end_time: '', revenue: '', comment: '' });
  const [confirm, setConfirm] = useState<'approved' | 'rejected' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canApprove = hasPermission(user, 'can_approve_shifts');
  const canEdit = hasPermission(user, 'can_edit_team_shifts') || canApprove;

  const load = async () => {
    setLoading(true); setError('');
    const { month, year } = monthParts(monthValue);
    const [shiftResult, userResult] = await Promise.allSettled([api.shifts(month, year, venueId || undefined), api.users(true)]);
    if (shiftResult.status === 'fulfilled') setShifts(shiftResult.value); else setError(shiftResult.reason instanceof Error ? shiftResult.reason.message : 'Не удалось загрузить смены.');
    setUsers(userResult.status === 'fulfilled' ? userResult.value : []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [monthValue, venueId]);
  const filtered = useMemo(() => shifts.filter((shift) => (!status || shift.status === status) && (!employeeId || shift.user_id === employeeId)), [shifts, status, employeeId]);
  const userMap = useMemo(() => new Map(users.map((employee) => [employee.id, employee])), [users]);
  const venueMap = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);

  const open = (shift: Shift) => { setSelected(shift); setForm({ start_time: shift.start_time.slice(0, 5), end_time: shift.end_time.slice(0, 5), revenue: shift.revenue ?? '', comment: shift.comment ?? '' }); };
  const save = async (nextStatus?: 'approved' | 'rejected') => {
    if (!selected) return; setSaving(true); setError('');
    try { const updated = await api.updateShift(selected.id, { start_time: form.start_time, end_time: form.end_time, revenue: form.revenue || null, comment: form.comment || null, status: nextStatus ?? selected.status }); setShifts((current) => current.map((shift) => shift.id === updated.id ? updated : shift)); setSelected(null); setConfirm(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить смену.'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState text="Загружаем смены…" />;
  if (error && !shifts.length) return <ErrorState message={error} retry={load} />;
  return <>
    <PageHeader title="Смены" description="Проверяйте, редактируйте и утверждайте смены команды." />
    <FilterBar><input type="month" value={monthValue} onChange={(event) => setMonthValue(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option><option value="pending">На подтверждении</option><option value="approved">Утверждена</option><option value="rejected">Отклонена</option></select><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Все сотрудники</option>{users.filter((employee) => employee.is_active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select><span className="cell-sub">Найдено: {filtered.length}</span></FilterBar>
    <section className="panel">
      <DataTable headers={['Дата', 'Сотрудник', 'Точка', 'Начало / конец', 'Часы', 'Выручка', 'Начислено', 'Статус', '']} empty={!filtered.length}>
        {filtered.map((shift) => { const employee = userMap.get(shift.user_id); return <tr key={shift.id}><td>{formatDate(shift.date)}</td><td><div className="cell-main">{employee?.name || 'Сотрудник'}</div><div className="cell-sub">{employee?.position || 'Без должности'}</div></td><td>{venueMap.get(shift.venue_id || '')?.name || employee?.venue?.name || 'Основная точка'}</td><td>{formatTime(shift.start_time)}–{formatTime(shift.end_time)}</td><td>{formatNumber(shift.total_hours)} ч</td><td><MoneyValue value={shift.revenue} muted={!shift.revenue} /></td><td><MoneyValue value={shift.salary_earned} /></td><td><StatusBadge status={shift.status} /></td><td><button className="icon-button" onClick={() => open(shift)} aria-label="Открыть смену"><Eye /></button></td></tr>; })}
      </DataTable>
      {!filtered.length && <EmptyState title="Смены не найдены" description="Измените фильтры или выберите другой период." />}
      <div className="mobile-cards">{filtered.map((shift) => <button className="mobile-card" key={shift.id} onClick={() => open(shift)}><strong>{userMap.get(shift.user_id)?.name || 'Сотрудник'}</strong><p>{formatDate(shift.date)} · {formatTime(shift.start_time)}–{formatTime(shift.end_time)}</p><StatusBadge status={shift.status} /></button>)}</div>
    </section>
    <Drawer title="Детали смены" open={Boolean(selected)} onClose={() => setSelected(null)} footer={<><button className="button secondary" onClick={() => setSelected(null)}>Закрыть</button>{selected?.status === 'pending' && canApprove && <><button className="button secondary" onClick={() => setConfirm('rejected')}><X />Отклонить</button><button className="button primary" onClick={() => setConfirm('approved')}><Check />Утвердить</button></>}</>}>
      {selected && <div className="form-section"><h3>{userMap.get(selected.user_id)?.name || 'Сотрудник'} · {formatDate(selected.date)}</h3><FormField label="Начало смены"><input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} disabled={!canEdit} /></FormField><FormField label="Конец смены"><input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} disabled={!canEdit} /></FormField><FormField label="Выручка"><input type="number" min="0" value={form.revenue} onChange={(event) => setForm({ ...form, revenue: event.target.value })} disabled={!canEdit} /></FormField><FormField label="Комментарий"><textarea value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} disabled={!canEdit} /></FormField>{canEdit && <button className="button secondary" disabled={saving} onClick={() => void save()}>Сохранить изменения</button>}</div>}
    </Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title={confirm === 'approved' ? 'Утвердить смену?' : 'Отклонить смену?'} text={confirm === 'approved' ? 'Смена войдёт в начисления сотрудника.' : 'Отклонённая смена не войдёт в начисления.'} confirmLabel={confirm === 'approved' ? 'Утвердить' : 'Отклонить'} danger={confirm === 'rejected'} onClose={() => setConfirm(null)} onConfirm={() => confirm && void save(confirm)} />
  </>;
}
