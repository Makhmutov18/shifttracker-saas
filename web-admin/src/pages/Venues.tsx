import { useEffect, useMemo, useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { Badge, ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FormField, LoadingState, MoneyValue, PageHeader, Pagination, Toast, type SortDirection } from '../components/ui';
import type { Shift, User, Venue } from '../types';
import { currentMonthValue, monthParts } from '../utils';

type VenueSort = 'name' | 'status' | 'employees' | 'shifts' | 'revenue';
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
    return [venue.id, { employees: (users ?? []).filter((employee) => employee.is_active && employee.venue_id === venue.id).length, shifts: venueShifts.length, revenue: venueShifts.reduce((sum, shift) => sum + Number(shift.revenue || 0), 0) }];
  })), [venues, shifts, users]);
  const filtered = useMemo(() => (venues ?? []).filter((venue) => venue.is_active !== archive).sort((left, right) => {
    const leftStats = stats.get(left.id) || { employees: 0, shifts: 0, revenue: 0 };
    const rightStats = stats.get(right.id) || { employees: 0, shifts: 0, revenue: 0 };
    const values: Record<VenueSort, [string | number, string | number]> = { name: [left.name || '', right.name || ''], status: [String(left.is_active), String(right.is_active)], employees: [leftStats.employees, rightStats.employees], shifts: [leftStats.shifts, rightStats.shifts], revenue: [leftStats.revenue, rightStats.revenue] };
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

  if (loading) return <LoadingState text="Загружаем точки…" />;
  if (error && !venues.length) return <ErrorState message={error} retry={load} />;
  return <>
    <PageHeader title="Точки" description="Точки заведения и их активность за текущий месяц." action={<button className="button primary" onClick={() => open('new')}><Plus />Добавить точку</button>} />
    {error && <div className="notice error">{error}</div>}
    <div className="tabs"><button className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>Активные ({venues.filter((venue) => venue.is_active).length})</button><button className={archive ? 'active' : ''} onClick={() => setArchive(true)}>Архив ({venues.filter((venue) => !venue.is_active).length})</button></div>
    <section className="panel"><DataTable label="Список точек" headers={[{ label: 'Точка', sortKey: 'name' }, { label: 'Статус', sortKey: 'status' }, { label: 'Сотрудников', sortKey: 'employees' }, { label: 'Смен за месяц', sortKey: 'shifts' }, { label: 'Выручка за месяц', sortKey: 'revenue', align: 'right' }, '']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
      {pageRows.map((venue) => { const venueStats = stats.get(venue.id) || { employees: 0, shifts: 0, revenue: 0 }; return <tr key={venue.id}><td className="cell-main">{venue.name || 'Точка без названия'}</td><td><Badge variant={venue.is_active ? 'success' : 'neutral'}>{venue.is_active ? 'Активна' : 'В архиве'}</Badge></td><td>{venueStats.employees}</td><td>{venueStats.shifts}</td><td className="align-right"><MoneyValue value={venueStats.revenue} muted={!venueStats.shifts} /></td><td><div className="row-actions"><button className="icon-button" onClick={() => open(venue)} aria-label="Редактировать точку"><Pencil /></button>{venue.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirm(venue)} aria-label="В архив"><Archive /></button> : <button className="icon-button" onClick={() => void restore(venue)} aria-label="Восстановить"><RotateCcw /></button>}</div></td></tr>; })}
    </DataTable>{!filtered.length && <EmptyState title={archive ? 'Архив точек пуст' : 'Точек пока нет'} description={!archive ? 'Добавьте первую точку, чтобы привязывать к ней сотрудников и смены.' : 'Архивные точки появятся здесь.'} />}
    <div className="mobile-cards">{pageRows.map((venue) => { const venueStats = stats.get(venue.id) || { employees: 0, shifts: 0, revenue: 0 }; return <div className="mobile-card" key={venue.id}><strong>{venue.name || 'Точка без названия'}</strong><p>{venueStats.employees} сотрудников · {venueStats.shifts} смен</p><MoneyValue value={venueStats.revenue} muted={!venueStats.shifts} /><button className="button secondary" onClick={() => open(venue)}>Редактировать</button></div>; })}</div>
    <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></section>
    <Drawer title={editing === 'new' ? 'Добавить точку' : 'Редактировать точку'} open={Boolean(editing)} onClose={() => setEditing(null)} footer={<><button className="button secondary" onClick={() => setEditing(null)}>Отмена</button><button className="button primary" disabled={saving} onClick={() => void save()}>{editing === 'new' ? 'Добавить точку' : 'Сохранить'}</button></>}><div className="form-section"><FormField label="Название точки"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Кофейня на Ленина" /></FormField></div></Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title="Отправить точку в архив?" text="Точка останется в истории. Система не позволит архивировать её, если к ней привязаны активные сотрудники или смены." confirmLabel="В архив" danger onClose={() => setConfirm(null)} onConfirm={() => void deactivate()} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </>;
}
