import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Archive, Building2, Plus, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { Badge, ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FormField, LoadingState, MoneyValue, PageHeader, Pagination, Toast, type SortDirection } from '../components/ui';
import type { Venue, VenueStatsRow } from '../types';
import { currentMonthValue, monthParts } from '../utils';

type VenueSort = 'name' | 'assigned' | 'worked' | 'shifts' | 'hours' | 'accrued' | 'pending';
const PAGE_SIZE = 15;

export function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueStats, setVenueStats] = useState<VenueStatsRow[]>([]);
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
    const [venueResult, statsResult] = await Promise.allSettled([api.venues(true), api.venueStats(month, year, true)]);
    if (venueResult.status === 'fulfilled') setVenues(venueResult.value); else setError(venueResult.reason instanceof Error ? venueResult.reason.message : 'Не удалось загрузить точки.');
    if (statsResult.status === 'fulfilled') setVenueStats(statsResult.value);
    else setError(statsResult.reason instanceof Error ? statsResult.reason.message : 'Не удалось загрузить статистику точек.');
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [archive, sortKey, sortDirection]);

  const stats = useMemo(() => new Map((venueStats ?? []).map((row) => [row.venue_id, row])), [venueStats]);
  const filtered = useMemo(() => (venues ?? []).filter((venue) => venue.is_active !== archive).sort((left, right) => {
    const leftStats = stats.get(left.id) || emptyVenueStats;
    const rightStats = stats.get(right.id) || emptyVenueStats;
    const values: Record<VenueSort, [string | number, string | number]> = { name: [left.name || '', right.name || ''], assigned: [leftStats.assigned_employees_count, rightStats.assigned_employees_count], worked: [leftStats.worked_employees_count, rightStats.worked_employees_count], shifts: [leftStats.approved_shifts_count, rightStats.approved_shifts_count], hours: [Number(leftStats.approved_hours), Number(rightStats.approved_hours)], accrued: [Number(leftStats.total_accruals), Number(rightStats.total_accruals)], pending: [leftStats.pending_shifts_count, rightStats.pending_shifts_count] };
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
  if (error && !venueStats.length) return <ErrorState message={error} retry={load} />;
  return <div className="venues-page">
    <PageHeader title="Точки" description="Точки заведения и их активность за текущий месяц." action={<button className="button primary" onClick={() => open('new')}><Plus />Добавить точку</button>} />
    {error && <div className="notice error">{error}</div>}
    <div className="employee-list-tabs" role="tablist" aria-label="Состояние точек"><button type="button" role="tab" aria-selected={!archive} className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>Активные <span>{venues.filter((venue) => venue.is_active).length}</span></button><button type="button" role="tab" aria-selected={archive} className={archive ? 'active' : ''} onClick={() => setArchive(true)}>Архив <span>{venues.filter((venue) => !venue.is_active).length}</span></button></div>
    <section className="panel"><DataTable label="Список точек" headers={[{ label: 'Точка', sortKey: 'name' }, { label: 'Закреплено / работали', sortKey: 'assigned' }, { label: 'Смены / часы', sortKey: 'shifts' }, { label: 'Начислено', sortKey: 'accrued', align: 'right' }, { label: 'Pending', sortKey: 'pending' }, 'Действия']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
      {pageRows.map((venue) => { const row = stats.get(venue.id) || emptyVenueStats; return <tr className="venue-table-row" tabIndex={0} onClick={() => open(venue)} onKeyDown={(event) => openFromKeyboard(event, venue)} key={venue.id}><td><div className="venue-name-cell"><span><Building2 /></span><strong>{venue.name || 'Точка без названия'}</strong></div></td><td>{row.assigned_employees_count} / {row.worked_employees_count}</td><td>{row.approved_shifts_count} / {Number(row.approved_hours).toLocaleString('ru-RU')} ч</td><td className="align-right"><MoneyValue value={row.total_accruals} muted={!Number(row.total_accruals)} /></td><td><Badge variant={row.pending_shifts_count > 0 ? 'warning' : 'neutral'}>{row.pending_shifts_count}</Badge></td><td><div className="row-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{venue.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirm(venue)} aria-label="В архив"><Archive /></button> : <button className="icon-button" onClick={() => void restore(venue)} aria-label="Восстановить"><RotateCcw /></button>}</div></td></tr>; })}
    </DataTable>{!filtered.length && <EmptyState title={archive ? 'Архив точек пуст' : 'Точек пока нет'} description={!archive ? 'Добавьте первую точку, чтобы привязывать к ней сотрудников и смены.' : 'Архивные точки появятся здесь.'} />}
    <div className="mobile-cards venue-mobile-cards">{pageRows.map((venue) => { const row = stats.get(venue.id) || emptyVenueStats; return <article className="mobile-card venue-mobile-card" role="button" tabIndex={0} onClick={() => open(venue)} onKeyDown={(event) => openFromKeyboard(event, venue)} key={venue.id}><div className="venue-mobile-head"><span><Building2 /></span><strong>{venue.name || 'Точка без названия'}</strong></div><div className="venue-mobile-details"><span><small>Закреплено / работали</small><strong>{row.assigned_employees_count} / {row.worked_employees_count}</strong></span><span><small>Смены / часы</small><strong>{row.approved_shifts_count} / {Number(row.approved_hours).toLocaleString('ru-RU')} ч</strong></span><span><small>Начислено</small><MoneyValue value={row.total_accruals} muted={!Number(row.total_accruals)} /></span><span><small>На подтверждении</small><Badge variant={row.pending_shifts_count > 0 ? 'warning' : 'neutral'}>{row.pending_shifts_count}</Badge></span></div><div className="venue-mobile-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{venue.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirm(venue)} aria-label="В архив"><Archive /></button> : <button className="icon-button" onClick={() => void restore(venue)} aria-label="Восстановить"><RotateCcw /></button>}</div></article>; })}</div>
    <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></section>
    <Drawer title={editing === 'new' ? 'Добавить точку' : 'Редактировать точку'} open={Boolean(editing)} onClose={() => setEditing(null)} footer={<><button className="button secondary" onClick={() => setEditing(null)}>Отмена</button><button className="button primary" disabled={saving} onClick={() => void save()}>{editing === 'new' ? 'Добавить точку' : 'Сохранить'}</button></>}><div className="form-section"><FormField label="Название точки"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Кофейня на Ленина" /></FormField></div></Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title="Отправить точку в архив?" text="Точка останется в истории. Система не позволит архивировать её, если к ней привязаны активные сотрудники или смены." confirmLabel="В архив" danger onClose={() => setConfirm(null)} onConfirm={() => void deactivate()} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </div>;
}

const emptyVenueStats: VenueStatsRow = { venue_id: '', venue_name: '', is_active: true, assigned_employees_count: 0, worked_employees_count: 0, approved_shifts_count: 0, pending_shifts_count: 0, approved_hours: '0', shift_accruals: '0', bonuses: '0', deductions: '0', total_accruals: '0' };
