import { useEffect, useMemo, useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FormField, LoadingState, PageHeader } from '../components/ui';
import type { User, Venue } from '../types';

export function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [archive, setArchive] = useState(false);
  const [editing, setEditing] = useState<Venue | 'new' | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); const [venueResult, userResult] = await Promise.allSettled([api.venues(true), api.users(true)]); if (venueResult.status === 'fulfilled') setVenues(venueResult.value); else setError(venueResult.reason instanceof Error ? venueResult.reason.message : 'Не удалось загрузить точки.'); setUsers(userResult.status === 'fulfilled' ? userResult.value : []); setLoading(false); };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => venues.filter((venue) => venue.is_active !== archive), [venues, archive]);
  const open = (venue: Venue | 'new') => { setEditing(venue); setName(venue === 'new' ? '' : venue.name); };
  const save = async () => { if (!name.trim()) { setError('Укажите название точки.'); return; } setSaving(true); try { if (editing === 'new') await api.createVenue(name.trim()); else if (editing) await api.updateVenue(editing.id, { name: name.trim() }); setEditing(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить точку.'); } finally { setSaving(false); } };
  const deactivate = async () => { if (!confirm) return; setSaving(true); try { await api.deactivateVenue(confirm.id); setConfirm(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось отправить точку в архив.'); } finally { setSaving(false); } };
  const restore = async (venue: Venue) => { setSaving(true); try { await api.updateVenue(venue.id, { is_active: true }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось восстановить точку.'); } finally { setSaving(false); } };
  if (loading) return <LoadingState text="Загружаем точки…" />;
  if (error && !venues.length) return <ErrorState message={error} retry={load} />;
  return <>
    <PageHeader title="Точки" description="Точки заведения и привязанные к ним сотрудники." action={<button className="button primary" onClick={() => open('new')}><Plus />Добавить точку</button>} />
    {error && <div className="notice error">{error}</div>}
    <div className="tabs"><button className={!archive ? 'active' : ''} onClick={() => setArchive(false)}>Активные ({venues.filter((venue) => venue.is_active).length})</button><button className={archive ? 'active' : ''} onClick={() => setArchive(true)}>Архив ({venues.filter((venue) => !venue.is_active).length})</button></div>
    <section className="panel"><DataTable headers={['Точка', 'Статус', 'Сотрудников', 'Адрес', 'Описание', '']} empty={!filtered.length}>
      {filtered.map((venue) => <tr key={venue.id}><td className="cell-main">{venue.name}</td><td><span className={`status ${venue.is_active ? 'status-approved' : 'status-cancelled'}`}>{venue.is_active ? 'Активна' : 'В архиве'}</span></td><td>{users.filter((employee) => employee.is_active && employee.venue_id === venue.id).length}</td><td className="cell-sub">Адрес не поддерживается API</td><td className="cell-sub">Описание не поддерживается API</td><td><div className="row-actions"><button className="icon-button" onClick={() => open(venue)}><Pencil /></button>{venue.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirm(venue)}><Archive /></button> : <button className="icon-button" onClick={() => void restore(venue)}><RotateCcw /></button>}</div></td></tr>)}
    </DataTable>{!filtered.length && <EmptyState title={archive ? 'Архив точек пуст' : 'Точек пока нет'} description={!archive ? 'Добавьте первую точку, чтобы привязывать к ней сотрудников и смены.' : undefined} />}
    <div className="mobile-cards">{filtered.map((venue) => <div className="mobile-card" key={venue.id}><strong>{venue.name}</strong><p>{users.filter((employee) => employee.is_active && employee.venue_id === venue.id).length} сотрудников</p><button className="button secondary" onClick={() => open(venue)}>Редактировать</button></div>)}</div></section>
    <Drawer title={editing === 'new' ? 'Добавить точку' : 'Редактировать точку'} open={Boolean(editing)} onClose={() => setEditing(null)} footer={<><button className="button secondary" onClick={() => setEditing(null)}>Отмена</button><button className="button primary" disabled={saving} onClick={() => void save()}>{editing === 'new' ? 'Добавить точку' : 'Сохранить'}</button></>}><div className="form-section"><FormField label="Название точки"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Кофейня на Ленина" /></FormField><p className="cell-sub">Адрес и описание пока нельзя сохранить: соответствующих полей нет в текущем API.</p></div></Drawer>
    <ConfirmationDialog open={Boolean(confirm)} title="Отправить точку в архив?" text="Точка останется в истории. Backend не позволит архивировать её, если к ней привязаны активные сотрудники или смены." confirmLabel="В архив" danger onClose={() => setConfirm(null)} onConfirm={() => void deactivate()} />
  </>;
}
