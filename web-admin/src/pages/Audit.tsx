import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Archive, Check, FileClock, Pencil, Plus, X } from 'lucide-react';
import { api } from '../api';
import { Badge, DataTable, DateRangeFields, Drawer, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Pagination, SearchSelect, type BadgeVariant, type SortDirection } from '../components/ui';
import type { AuditLog, Venue } from '../types';
import { formatDateTime } from '../utils';

const actionLabels: Record<string, string> = {
  venue_created: 'Точка создана', venue_updated: 'Точка обновлена', venue_deactivated: 'Точка отправлена в архив',
  user_created: 'Сотрудник добавлен', user_updated: 'Сотрудник обновлён', user_deactivated: 'Сотрудник отправлен в архив',
  shift_created: 'Смена создана', shift_updated: 'Смена отредактирована', shift_approved: 'Смена утверждена', shift_rejected: 'Смена отклонена',
  bonus_added: 'Бонус добавлен', penalty_added: 'Удержание добавлено', payroll_run_created: 'Расчёт создан', payroll_run_finalized: 'Расчёт зафиксирован', payroll_run_cancelled: 'Расчёт отменён', payroll_payment_created: 'Выплата записана',
};

type AuditSort = 'date' | 'action' | 'user';
const PAGE_SIZE = 20;

function actionPresentation(action: string): { icon: typeof Plus; variant: BadgeVariant } {
  if (action.includes('approved') || action.includes('finalized')) return { icon: Check, variant: 'success' };
  if (action.includes('rejected') || action.includes('cancelled')) return { icon: X, variant: 'danger' };
  if (action.includes('deactivated') || action.includes('archive')) return { icon: Archive, variant: 'warning' };
  if (action.includes('created') || action.includes('added')) return { icon: Plus, variant: 'info' };
  if (action.includes('updated') || action.includes('edited')) return { icon: Pencil, variant: 'neutral' };
  return { icon: FileClock, variant: 'neutral' };
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [type, setType] = useState('');
  const [employee, setEmployee] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [sortKey, setSortKey] = useState<AuditSort>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    const [auditResult, venueResult] = await Promise.allSettled([api.audit(1, 100), api.venues(true)]);
    if (auditResult.status === 'fulfilled') setLogs(auditResult.value);
    else setError(auditResult.reason instanceof Error ? auditResult.reason.message : 'Не удалось загрузить историю действий.');
    if (venueResult.status === 'fulfilled') setVenues(venueResult.value);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [type, employee, periodStart, periodEnd, sortKey, sortDirection]);

  const types = useMemo(() => Array.from(new Set((logs ?? []).map((log) => log.entity_type))).sort(), [logs]);
  const employees = useMemo(() => Array.from(new Set((logs ?? []).flatMap((log) => [log.user_name, log.target_user_name]).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b, 'ru-RU')), [logs]);
  const venueMap = useMemo(() => new Map((venues ?? []).map((venue) => [venue.id, venue.name])), [venues]);
  const filtered = useMemo(() => (logs ?? []).filter((log) => {
    const day = (log.created_at || '').slice(0, 10);
    return (!type || log.entity_type === type) && (!employee || log.user_name === employee || log.target_user_name === employee) && (!periodStart || day >= periodStart) && (!periodEnd || day <= periodEnd);
  }).sort((left, right) => {
    const values: Record<AuditSort, [string, string]> = { date: [left.created_at || '', right.created_at || ''], action: [actionLabels[left.action] || '', actionLabels[right.action] || ''], user: [left.user_name || '', right.user_name || ''] };
    const result = values[sortKey][0].localeCompare(values[sortKey][1], 'ru-RU');
    return sortDirection === 'asc' ? result : -result;
  }), [logs, type, employee, periodStart, periodEnd, sortKey, sortDirection]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const toggleSort = (key: string) => { const next = key as AuditSort; if (sortKey === next) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc'); else { setSortKey(next); setSortDirection(next === 'date' ? 'desc' : 'asc'); } };
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>, log: AuditLog) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); setSelected(log); };

  if (loading) return <LoadingState text="Загружаем историю действий…" />;
  if (error && !logs.length) return <ErrorState message={error} retry={load} />;
  return <div className="audit-page"><PageHeader title="История действий" description="Общий журнал административных изменений в рамках доступной точки." />
    <FilterBar><DateRangeFields start={periodStart} end={periodEnd} onStart={setPeriodStart} onEnd={setPeriodEnd} /><label className="field"><span>Тип события</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Все типы событий</option>{types.map((value) => <option key={value} value={value}>{entityLabel(value)}</option>)}</select></label><label className="field"><span>Связанный пользователь</span><SearchSelect value={employee} onChange={setEmployee} placeholder="Все пользователи" options={employees.map((name) => ({ value: name, label: name }))} /></label><span className="filter-count">Показано: {filtered.length}</span></FilterBar>
    <section className="panel"><DataTable label="История действий" headers={[{ label: 'Дата и время', sortKey: 'date' }, { label: 'Действие', sortKey: 'action' }, { label: 'Кто выполнил', sortKey: 'user' }, 'Связанный пользователь', 'Объект']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
      {pageRows.map((log) => {
        const presentation = actionPresentation(log.action || '');
        const Icon = presentation.icon;
        return <tr className="audit-table-row" tabIndex={0} onClick={() => setSelected(log)} onKeyDown={(event) => openFromKeyboard(event, log)} key={log.id}><td>{formatDateTime(log.created_at)}</td><td><Badge variant={presentation.variant} icon={<Icon />}>{actionLabels[log.action] || 'Действие'}</Badge></td><td>{log.user_name || 'Пользователь'}</td><td>{log.target_user_name || 'Не указан'}</td><td>{entityLabel(log.entity_type)}</td></tr>;
      })}
    </DataTable>{!filtered.length && <EmptyState title="События не найдены" description="Измените фильтры или проверьте доступ к журналу." />}
    <div className="mobile-cards audit-mobile-cards">{pageRows.map((log) => { const presentation = actionPresentation(log.action || ''); const Icon = presentation.icon; return <article className="mobile-card audit-mobile-card" role="button" tabIndex={0} onClick={() => setSelected(log)} onKeyDown={(event) => openFromKeyboard(event, log)} key={log.id}><Badge variant={presentation.variant} icon={<Icon />}>{actionLabels[log.action] || 'Действие'}</Badge><time>{formatDateTime(log.created_at)}</time><span><small>Кто выполнил</small><strong>{log.user_name || 'Пользователь'}</strong></span><span><small>{log.target_user_name ? 'Связанный пользователь' : 'Объект'}</small><strong>{log.target_user_name || entityLabel(log.entity_type)}</strong></span></article>; })}</div>
    <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></section>
    <Drawer title="Детали события" open={Boolean(selected)} onClose={() => setSelected(null)}>
      {selected && <div className="audit-details"><dl><div><dt>Действие</dt><dd>{actionLabels[selected.action] || 'Действие'}</dd></div><div><dt>Дата и время</dt><dd>{formatDateTime(selected.created_at)}</dd></div><div><dt>Кто выполнил</dt><dd>{selected.user_name || 'Пользователь'}</dd></div><div><dt>Связанный пользователь</dt><dd>{selected.target_user_name || 'Не указан'}</dd></div><div><dt>Тип объекта</dt><dd>{entityLabel(selected.entity_type)}</dd></div>{selected.entity_id && <div><dt>Идентификатор объекта</dt><dd>{selected.entity_id}</dd></div>}</dl><AuditChanges oldValue={selected.old_value} newValue={selected.new_value} entityType={selected.entity_type} venueMap={venueMap} /></div>}
    </Drawer>
  </div>;
}

function entityLabel(value: string): string { return ({ user: 'Сотрудник', shift: 'Смена', venue: 'Точка', adjustment: 'Корректировка', payroll_run: 'Расчёт выплаты', payroll_payment: 'Выплата' } as Record<string, string>)[value] || 'Объект'; }

const fieldLabels: Record<string, string> = { name: 'Имя', position: 'Должность', role: 'Роль', venue_id: 'Точка', status: 'Статус', start_time: 'Начало', end_time: 'Конец', revenue: 'Выручка', salary_earned: 'Начислено', amount: 'Сумма', payment_date: 'Дата выплаты', method: 'Способ', comment: 'Комментарий' };

function AuditChanges({ oldValue, newValue, entityType, venueMap }: { oldValue?: Record<string, unknown> | null; newValue?: Record<string, unknown> | null; entityType: string; venueMap: Map<string, string> }) {
  const keys = Array.from(new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})]));
  if (!keys.length) return <EmptyState title="Подробные изменения не сохранены" />;
  return <section className="audit-changes"><div className="audit-changes-head"><strong>Поле</strong><strong>Старое значение</strong><strong>Новое значение</strong></div>{keys.map((key) => <div className="audit-change-row" key={key}><strong>{key === 'venue_id' && entityType === 'shift' ? 'Точка смены' : fieldLabels[key] || key}</strong><AuditValue value={oldValue?.[key]} venueMap={key === 'venue_id' ? venueMap : undefined} /><AuditValue value={newValue?.[key]} venueMap={key === 'venue_id' ? venueMap : undefined} /></div>)}</section>;
}

function AuditValue({ value, venueMap }: { value: unknown; venueMap?: Map<string, string> }) {
  if (value === null || value === undefined || value === '') return <span className="audit-empty-value">Не указано</span>;
  if (venueMap && typeof value === 'string') return <span>{venueMap.get(value) || value}</span>;
  if (typeof value === 'object') return <pre>{JSON.stringify(value, null, 2)}</pre>;
  return <span>{String(value)}</span>;
}
