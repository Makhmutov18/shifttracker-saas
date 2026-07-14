import { useEffect, useMemo, useState } from 'react';
import { Archive, Copy, Eye, Pencil, Plus, RotateCcw, WalletCards } from 'lucide-react';
import { api } from '../api';
import { Badge, ConfirmationDialog, DataTable, Drawer, EmptyState, ErrorState, FilterBar, FormField, LoadingState, MoneyValue, PageHeader, Pagination, SearchSelect, Toast, type SortDirection } from '../components/ui';
import type { InviteResult, PermissionKey, PermissionMap, User, Venue } from '../types';
import { isOwnerOrAdmin, payModelLabels, roleLabels } from '../utils';

const permissionOptions: Array<[PermissionKey, string]> = [
  ['can_approve_shifts', 'Утверждать смены'], ['can_view_team_shifts', 'Видеть смены команды'], ['can_edit_team_shifts', 'Редактировать смены команды'], ['can_view_team_payroll', 'Видеть расчёты выплат'], ['can_export_payroll', 'Экспортировать выплаты'], ['can_manage_team', 'Управлять командой и точками'], ['can_manage_adjustments', 'Управлять бонусами и удержаниями'], ['can_manage_expenses', 'Управлять расходами'],
];

const emptyForm = { name: '', position: '', role: 'barista', venue_id: '', pay_model: 'hourly', hourly_rate: '0', revenue_percentage: '0', permissions: {} as PermissionMap };
type EmployeeSort = 'name' | 'status' | 'role' | 'venue' | 'pay';
const PAGE_SIZE = 15;

export function EmployeesPage({ user, venues, venueId }: { user: User; venues: Venue[]; venueId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [editing, setEditing] = useState<User | null | 'new'>(null);
  const [previewEmployee, setPreviewEmployee] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sortKey, setSortKey] = useState<EmployeeSort>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const owner = user.role === 'owner';

  const load = async () => { setLoading(true); setError(''); try { setUsers(await api.users(true)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить команду.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const venueMap = useMemo(() => new Map(venues.map((venue) => [venue.id, venue.name])), [venues]);
  const filtered = useMemo(() => (users ?? []).filter((employee) => employee.is_active !== archive && (!venueId || employee.venue_id === venueId) && (!search || (employee.name || '').toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU'))) && (!roleFilter || employee.role === roleFilter) && (!payFilter || employee.pay_model === payFilter)).sort((left, right) => {
    const values: Record<EmployeeSort, [string, string]> = {
      name: [left.name || '', right.name || ''], status: [String(left.is_active), String(right.is_active)], role: [roleLabels[left.role] || '', roleLabels[right.role] || ''], venue: [left.venue?.name || venueMap.get(left.venue_id || '') || '', right.venue?.name || venueMap.get(right.venue_id || '') || ''], pay: [payModelLabels[left.pay_model] || '', payModelLabels[right.pay_model] || ''],
    };
    const result = values[sortKey][0].localeCompare(values[sortKey][1], 'ru-RU');
    return sortDirection === 'asc' ? result : -result;
  }), [users, archive, venueId, search, roleFilter, payFilter, sortKey, sortDirection, venueMap]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [archive, venueId, search, roleFilter, payFilter, sortKey, sortDirection]);
  const openNew = () => { setEditing('new'); setInvite(null); setForm({ ...emptyForm, venue_id: venueId || user.venue_id || venues.find((venue) => venue.is_active)?.id || '' }); };
  const openEdit = (employee: User) => { setEditing(employee); setInvite(null); setForm({ name: employee.name || '', position: employee.position || '', role: employee.role || 'barista', venue_id: employee.venue_id || '', pay_model: employee.pay_model || 'hourly', hourly_rate: employee.hourly_rate || '0', revenue_percentage: employee.revenue_percentage || '0', permissions: employee.permissions || {} }); };
  const save = async () => {
    if (!form.name.trim() || !form.venue_id) { setError('Укажите имя и точку сотрудника.'); return; }
    setSaving(true); setError('');
    try {
      if (editing === 'new') setInvite(await api.createUser({ first_name: form.name.trim(), position: form.position.trim() || undefined, role: form.role, venue_id: form.venue_id, pay_model: form.pay_model, hourly_rate: Number(form.hourly_rate), revenue_percentage: Number(form.revenue_percentage), permissions: form.permissions }));
      else if (editing) { await api.updateUser(editing.id, { name: form.name.trim(), position: form.position.trim(), role: form.role, venue_id: form.venue_id, pay_model: form.pay_model, hourly_rate: Number(form.hourly_rate), revenue_percentage: Number(form.revenue_percentage), permissions: form.permissions }); setEditing(null); }
      setSuccess(editing === 'new' ? 'Сотрудник добавлен.' : 'Данные сотрудника сохранены.');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить сотрудника.'); }
    finally { setSaving(false); }
  };
  const archiveUser = async () => { if (!confirmUser) return; setSaving(true); try { await api.deactivateUser(confirmUser.id); setConfirmUser(null); setSuccess('Сотрудник отправлен в архив.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось отправить сотрудника в архив.'); } finally { setSaving(false); } };
  const restore = async (employee: User) => { setSaving(true); try { await api.updateUser(employee.id, { is_active: true }); setSuccess('Сотрудник восстановлен.'); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось восстановить сотрудника.'); } finally { setSaving(false); } };
  const toggleSort = (key: string) => { const next = key as EmployeeSort; if (sortKey === next) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(next); setSortDirection('asc'); } };

  if (loading) return <LoadingState text="Загружаем команду…" />;
  if (error && !users.length) return <ErrorState message={error} retry={load} />;
  return <>
    <PageHeader title="Команда" description="Сотрудники, роли, точки и настройки оплаты." action={<button className="button primary" onClick={openNew}><Plus />Добавить сотрудника</button>} />
    {error && <div className="notice error">{error}</div>}
    <FilterBar><label className="field"><span>Поиск</span><input type="search" placeholder="Имя сотрудника" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="field"><span>Роль</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">Все роли</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Модель оплаты</span><select value={payFilter} onChange={(event) => setPayFilter(event.target.value)}><option value="">Все модели</option>{Object.entries(payModelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span className="filter-count">Найдено: {filtered.length}</span></FilterBar>
    <div className="archive-toolbar"><div><Archive /><span><strong>{archive ? 'Архив сотрудников' : 'Активная команда'}</strong><small>{archive ? 'История и выплаты сотрудников сохранены.' : 'Сотрудники с доступом к приложению.'}</small></span></div><button className="button secondary" onClick={() => setArchive(!archive)}>{archive ? 'Показать активных' : 'Открыть архив'}</button></div>
    <section className="panel">
      <DataTable label="Список сотрудников" headers={[{ label: 'Сотрудник', sortKey: 'name' }, { label: 'Статус', sortKey: 'status' }, { label: 'Роль', sortKey: 'role' }, 'Должность', { label: 'Точка', sortKey: 'venue' }, { label: 'Модель оплаты', sortKey: 'pay' }, 'Ставка', 'Управление', '']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
        {pageRows.map((employee) => <tr key={employee.id}><td><button className="table-link" onClick={() => setPreviewEmployee(employee)}>{employee.name || 'Сотрудник'}</button></td><td><Badge variant={employee.is_active ? 'success' : 'neutral'}>{employee.is_active ? 'Активен' : 'В архиве'}</Badge></td><td>{roleLabels[employee.role] || 'Сотрудник'}</td><td>{employee.position || 'Без должности'}</td><td>{employee.venue?.name || venueMap.get(employee.venue_id || '') || 'Точка не указана'}</td><td><Badge variant="info" icon={<WalletCards />}>{payModelLabels[employee.pay_model] || 'Не настроена'}</Badge></td><td><MoneyValue value={employee.hourly_rate} /></td><td>{Object.values(employee.permissions || {}).some(Boolean) || isOwnerOrAdmin(employee) ? 'Есть доступ' : 'Обычный сотрудник'}</td><td><div className="row-actions"><button className="icon-button" onClick={() => setPreviewEmployee(employee)} aria-label="Открыть карточку"><Eye /></button><button className="icon-button" onClick={() => openEdit(employee)} aria-label="Редактировать"><Pencil /></button>{employee.is_active ? <button className="icon-button danger-icon" onClick={() => setConfirmUser(employee)} aria-label="В архив"><Archive /></button> : <button className="icon-button" onClick={() => void restore(employee)} aria-label="Восстановить"><RotateCcw /></button>}</div></td></tr>)}
      </DataTable>
      {!filtered.length && <EmptyState title={archive ? 'Архив сотрудников пуст' : 'Сотрудники не найдены'} description="Измените фильтры или добавьте сотрудника." />}
      <div className="mobile-cards">{pageRows.map((employee) => <div className="mobile-card" key={employee.id}><strong>{employee.name || 'Сотрудник'}</strong><p>{employee.position || 'Без должности'} · {employee.venue?.name || venueMap.get(employee.venue_id || '') || 'Точка не указана'}</p><button className="button secondary" onClick={() => setPreviewEmployee(employee)}>Открыть карточку</button></div>)}</div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </section>
    <Drawer title="Карточка сотрудника" open={Boolean(previewEmployee)} onClose={() => setPreviewEmployee(null)} footer={previewEmployee ? <button className="button primary" onClick={() => { const employee = previewEmployee; setPreviewEmployee(null); openEdit(employee); }}><Pencil />Редактировать</button> : undefined}>
      {previewEmployee && <div className="employee-profile"><div className="employee-profile-head"><span className="avatar large">{(previewEmployee.name || 'С').slice(0, 1)}</span><div><h3>{previewEmployee.name || 'Сотрудник'}</h3><p>{previewEmployee.position || 'Без должности'}</p></div><Badge variant={previewEmployee.is_active ? 'success' : 'neutral'}>{previewEmployee.is_active ? 'Активен' : 'В архиве'}</Badge></div><dl><div><dt>Роль</dt><dd>{roleLabels[previewEmployee.role] || 'Сотрудник'}</dd></div><div><dt>Точка</dt><dd>{previewEmployee.venue?.name || venueMap.get(previewEmployee.venue_id || '') || 'Точка не указана'}</dd></div><div><dt>Модель оплаты</dt><dd>{payModelLabels[previewEmployee.pay_model] || 'Оплата не настроена'}</dd></div><div><dt>Ставка</dt><dd><MoneyValue value={previewEmployee.hourly_rate} /></dd></div><div><dt>Управленческий доступ</dt><dd>{Object.values(previewEmployee.permissions || {}).some(Boolean) || isOwnerOrAdmin(previewEmployee) ? 'Есть' : 'Нет'}</dd></div></dl></div>}
    </Drawer>
    <Drawer title={editing === 'new' ? 'Добавить сотрудника' : 'Редактировать сотрудника'} open={Boolean(editing)} onClose={() => setEditing(null)} footer={<><button className="button secondary" onClick={() => setEditing(null)}>Отмена</button><button className="button primary" disabled={saving} onClick={() => void save()}>{editing === 'new' ? 'Добавить сотрудника' : 'Сохранить'}</button></>}>
      <div className="form-section"><h3>Основное</h3><FormField label="Имя сотрудника"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField><FormField label="Должность"><input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="Например: бариста" /></FormField><FormField label="Точка"><SearchSelect value={form.venue_id} onChange={(value) => setForm({ ...form, venue_id: value })} placeholder="Выберите точку" options={(venues ?? []).filter((venue) => venue.is_active).map((venue) => ({ value: venue.id, label: venue.name }))} /></FormField><FormField label="Роль"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{Object.entries(roleLabels).filter(([role]) => owner || role !== 'owner').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField></div>
      <div className="form-section"><h3>Оплата</h3><FormField label="Модель оплаты"><select value={form.pay_model} onChange={(event) => setForm({ ...form, pay_model: event.target.value })}>{Object.entries(payModelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><FormField label={form.pay_model === 'fixed_shift' ? 'Ставка за смену, ₽' : 'Ставка в час, ₽'}><input type="number" min="0" value={form.hourly_rate} onChange={(event) => setForm({ ...form, hourly_rate: event.target.value })} /></FormField>{['revenue', 'hybrid'].includes(form.pay_model) && <FormField label="Процент от выручки"><input type="number" min="0" max="100" value={form.revenue_percentage} onChange={(event) => setForm({ ...form, revenue_percentage: event.target.value })} /></FormField>}</div>
      <div className="form-section"><h3>Доступ</h3>{permissionOptions.map(([key, label]) => <label className="checkbox-row" key={key}><input type="checkbox" checked={Boolean(form.permissions[key])} onChange={(event) => setForm({ ...form, permissions: { ...form.permissions, [key]: event.target.checked } })} /><span>{label}</span></label>)}</div>
      {invite && <div className="invite-result"><strong>Ссылка приглашения создана</strong><input readOnly value={invite.invite_link} /><button className="button secondary" onClick={() => navigator.clipboard.writeText(invite.invite_link)}><Copy />Копировать</button></div>}
    </Drawer>
    <ConfirmationDialog open={Boolean(confirmUser)} title="Отправить сотрудника в архив?" text="Архив сохраняет смены, выплаты и историю. Пользователь потеряет доступ к приложению." confirmLabel="В архив" danger onClose={() => setConfirmUser(null)} onConfirm={() => void archiveUser()} />
    <Toast message={success} onClose={() => setSuccess('')} />
  </>;
}
