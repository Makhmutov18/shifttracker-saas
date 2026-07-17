import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Archive, Building2, Plus, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { AvatarStack, Badge, ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FormField, LoadingState, MoneyValue, PageHeader, Pagination, Toast, type SortDirection } from '../components/ui';
import type { Shift, User, Venue } from '../types';
import { currentMonthValue, monthParts } from '../utils';

type VenueSort = 'name' | 'employees' | 'shifts' | 'accrued' | 'pending' | 'revenue';
const PAGE_SIZE = 15;

export function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [archive, setArchive] = useState(false);
  const [editing, setEditing] = useState<Venue | 'new' | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<Venue | null>(null);
  const [sortKey, setSortKey] = useState<VenueSort>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    const { month, year } = monthParts(currentMonthValue());
    const [venueResult, userResult, shiftResult] = await Promise.allSettled([api.venues(true), api.users(true), api.shifts(month, year)]);
    if (venueResult.status === 'fulfilled') setVenues(venueResult.value); else setError(venueResult.reason instanceof Error ? venueResult.reason.message : 'Не удалось загрузить точки.');
    setUsers(userResult.status === 'fulfilled' ? userResult.value : []);
    setShifts(shiftResult.status === 'fulfilled' ? shiftResult.value : []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [archive, sortKey, sortDirection]);

  const stats = useMemo(() => new Map((venues ?? []).map((venue) => {
    const venueShifts = (shifts ?? []).filter((shift) => shift.venue_id === venue.id);
    const venueEmployees = (users ?? []).filter((employee) => employee.is_active && employee.venue_id === venue.id);
    return [venue.id, {
      employees: venueEmployees.length,
      employeeNames: venueEmployees.map((employee) => employee.name || 'Сотрудник'),
      shifts: venueShifts.length,
      accrued: venueShifts.filter((shift) => shift.status === 'approved').reduce((sum, shift) => sum + Number(shift.salary_earned || 0), 0),
      pending: venueShifts.filter((shift) => shift.status === 'pending').length,
      revenue: venueShifts.reduce((sum, shift) => sum + Number(shift.revenue || 0), 0),
    }];
  })), [venues, shifts, users]);
  const filtered = useMemo(() => (venues ?? []).filter((venue) => venue.is_active !== archive).sort((left, right) => {
    const leftStats = stats.get(left.id) || emptyVenueStats;
    const rightStats = stats.get(right.id) || emptyVenueStats;
    const values: Record<VenueSort, [string | number, string | number]> = { name: [left.name || '', right.name || ''], employees: [leftStats.employees, rightStats.employees], shifts: [leftStats.shifts, rightStats.shifts], accrued: [leftStats.accrued, rightStats.accrued], pending: [leftStats.pending, rightStats.pending], revenue: [leftStats.revenue, rightStats.revenue] };
    const [a, b] = values[sortKey];
    const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ru-RU');
    return sortDirection === 'asc' ? result : -result;
  }), [venues, archive, sortKey, sortDirection, stats]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = (venue: Venue | 'new') => { setEditing(venue); setName(venue === 'new' ? '' : venue.name); };
  const save = async () => { if (!name.trim()) { setError('Укажите название точки.'); return; } setSaving(true); try { if (editing === 'new') await api.createVenue(name.trim()); else if (editing) await api.updateVenue(editing.id, { name: name.trim() }); setSuccess(editing === 'new' ? 'Точка добавлена.' : 'Название точки сохранено.'); setEditing(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить точку.'); } finally { setSaving(false); } };
  const deactivate = async () => { if (!confirm) return; setSaving(true); try { await api.deactivateVenue(confirm.id); setConfirm(null); setSuccess('Точка отправлена в архив.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось отправить точку в архив.'); } finally { setSaving(false); } };
  const restore = async (venue: Venue) => { setSaving(true); try { await api.updateVenue(venue.id, { is_active: true }); setSuccess('Точка восстановлена.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось восстановить точку.'); } finally { setSaving(false); } };
  const toggleSort = (key: string) => { const next = key as VenueSort; if (sortKey === next) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(next); setSortDirection('asc'); } };
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>, venue: Venue) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); open(venue); };

  if (loading) return <LoadingState text="Загружаем точки…" />;
  if (error && !venues.length) return <ErrorState message={error} retry={load} />;
  return <div className="venues-page">
    <PageHeader title="Точки" description="Точки заведения и их активность за текущий месяц." action={<button className="button primary" onClick={() => open('new')}><Plus />Добавить точку</button>} />
    {error && <div className="notice error">{error}</div>}
    <div className="employee-list-tabs" role="tablist" aria-label="Состояние точек"><button type="button" role="tab" aria-selected={!archive} className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>Активные <span>{venues.filter((venue) => venue.is_active).length}</span></button><button type="button" role="tab" aria-selected={archive} className={archive ? 'active' : ''} onClick={() => setArchive(true)}>Архив <span>{venues.filter((venue) => !venue.is_active).length}</span></button></div>
    <section className="panel"><DataTable label="Список точек" headers={[{ label: 'Точка', sortKey: 'name' }, { label: 'Сотрудников', sortKey: 'employees' }, { label: 'Смен за текущий месяц', sortKey: 'shifts' }, { label: 'Начислено за текущий месяц', sortKey: 'accrued', align: 'right' }, { label: 'Требует подтверждения', sortKey: 'pending' }, { label: 'Выручка за текущий месяц', sortKey: 'revenue', align: 'right' }, 'Действия']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
      {pageRows.map((venue) => { const venueStats = stats.get(venue.id) || emptyVenueStats; return <tr className="venue-table-row" tabIndex={0} onClick={() => open(venue)} onKeyDown={(event) => openFromKeyboard(event, venue)} key={venue.id}><td><div className="venue-name-cell"><span><Building2 /></span><strong>{venue.name || 'Точка без названия'}</strong></div></td><td><div className="venue-team-cell"><AvatarStack items={venueStats.employeeNames.map((employeeName) => ({ name: employeeName }))} max={3} /><span>{venueStats.employees}</span></div></td><td>{venueStats.shifts}</td><td className="align-right"><MoneyValue value={venueStats.accrued} muted={!venueStats.accrued} /></td><td><Badge variant={venueStats.pending > 0 ? 'warning' : 'neutral'}>{venueStats.pending}</Badge></td><td className="align-right"><MoneyValue value={venueStats.revenue} muted={!venueStats.revenue} /></td><td><div className="row-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{venue.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirm(venue)} aria-label="В архив"><Archive /></button> : <button className="icon-button" onClick={() => void restore(venue)} aria-label="Восстановить"><RotateCcw /></button>}</div></td></tr>; })}
    </DataTable>{!filtered.length && <EmptyState title={archive ? 'Архив точек пуст' : 'Точек пока нет'} description={!archive ? 'Добавьте первую точку, чтобы привязывать к ней сотрудников и смены.' : 'Архивные точки появятся здесь.'} />}
    <div className="mobile-cards venue-mobile-cards">{pageRows.map((venue) => { const venueStats = stats.get(venue.id) || emptyVenueStats; return <article className="mobile-card venue-mobile-card" role="button" tabIndex={0} onClick={() => open(venue)} onKeyDown={(event) => openFromKeyboard(event, venue)} key={venue.id}><div className="venue-mobile-head"><span><Building2 /></span><strong>{venue.name || 'Точка без названия'}</strong></div><div className="venue-mobile-details"><span><small>Сотрудников</small><strong>{venueStats.employees}</strong></span><span><small>Смен</small><strong>{venueStats.shifts}</strong></span><span><small>Начислено</small><MoneyValue value={venueStats.accrued} muted={!venueStats.accrued} /></span><span><small>Требует подтверждения</small><Badge variant={venueStats.pending > 0 ? 'warning' : 'neutral'}>{venueStats.pending}</Badge></span><span><small>Выручка</small><MoneyValue value={venueStats.revenue} muted={!venueStats.revenue} /></span></div><div className="venue-mobile-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{venue.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirm(venue)} aria-label="В архив"><Archive /></button> : <button className="icon-button" onClick={() => void restore(venue)} aria-label="Восстановить"><RotateCcw /></button>}</div></article>; })}</div>
    <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></section>
    <Drawer title={editing === 'new' ? 'Добавить точку' : 'Редактировать точку'} open={Boolean(editing)} onClose={() => setEditing(null)} footer={<><button className="button secondary" onClick={() => setEditing(null)}>Отмена</button><button className="button primary" disabled={saving} onClick={() => void save()}>{editing === 'new' ? 'Добавить точку' : 'Сохранить'}</button></>}><div className="form-section"><FormField label="Название точки"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Кофейня на Ленина" /></FormField></div></Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title="Отправить точку в архив?" text="Точка останется в истории. Система не позволит архивировать её, если к ней привязаны активные сотрудники или смены." confirmLabel="В архив" danger onClose={() => setConfirm(null)} onConfirm={() => void deactivate()} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </div>;
}

const emptyVenueStats = { employees: 0, employeeNames: [] as string[], shifts: 0, accrued: 0, pending: 0, revenue: 0 };
