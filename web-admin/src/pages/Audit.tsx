import { Fragment, useEffect, useMemo, useState } from 'react';
import { Archive, Check, FileClock, Pencil, Plus, X } from 'lucide-react';
import { api } from '../api';
import { Badge, DataTable, DateRangeFields, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader, Pagination, SearchSelect, type BadgeVariant, type SortDirection } from '../components/ui';
import type { AuditLog } from '../types';
import { formatDate, formatDateTime } from '../utils';

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
  const [type, setType] = useState('');
  const [employee, setEmployee] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [sortKey, setSortKey] = useState<AuditSort>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setLogs(await api.audit(1, 100)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю действий.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [type, employee, periodStart, periodEnd, sortKey, sortDirection]);

  const types = useMemo(() => Array.from(new Set((logs ?? []).map((log) => log.entity_type))).sort(), [logs]);
  const employees = useMemo(() => Array.from(new Set((logs ?? []).flatMap((log) => [log.user_name, log.target_user_name]).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b, 'ru-RU')), [logs]);
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

  if (loading) return <LoadingState text="Загружаем историю действий…" />;
  if (error && !logs.length) return <ErrorState message={error} retry={load} />;
  return <><PageHeader title="История действий" description="Общий журнал административных изменений в рамках доступной точки." />
    <FilterBar><DateRangeFields start={periodStart} end={periodEnd} onStart={setPeriodStart} onEnd={setPeriodEnd} /><label className="field"><span>Тип события</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Все типы событий</option>{types.map((value) => <option key={value} value={value}>{entityLabel(value)}</option>)}</select></label><label className="field"><span>Сотрудник</span><SearchSelect value={employee} onChange={setEmployee} placeholder="Все сотрудники" options={employees.map((name) => ({ value: name, label: name }))} /></label><span className="filter-count">Показано: {filtered.length}</span></FilterBar>
    <section className="panel"><DataTable label="История действий" headers={[{ label: 'Дата и время', sortKey: 'date' }, { label: 'Действие', sortKey: 'action' }, { label: 'Кто изменил', sortKey: 'user' }, 'Связанный сотрудник', 'Объект']} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} empty={!filtered.length}>
      {pageRows.map((log, index) => {
        const day = (log.created_at || '').slice(0, 10);
        const showGroup = sortKey === 'date' && (index === 0 || (pageRows[index - 1]?.created_at || '').slice(0, 10) !== day);
        const presentation = actionPresentation(log.action || '');
        const Icon = presentation.icon;
        return <Fragment key={log.id}>{showGroup && <tr className="date-group-row"><td colSpan={5}>{formatDate(day)}</td></tr>}<tr><td>{formatDateTime(log.created_at)}</td><td><Badge variant={presentation.variant} icon={<Icon />}>{actionLabels[log.action] || 'Действие'}</Badge></td><td>{log.user_name || 'Пользователь'}</td><td>{log.target_user_name || '—'}</td><td>{entityLabel(log.entity_type)}</td></tr></Fragment>;
      })}
    </DataTable>{!filtered.length && <EmptyState title="События не найдены" description="Измените фильтры или проверьте доступ к журналу." />}
    <div className="mobile-cards">{pageRows.map((log) => { const presentation = actionPresentation(log.action || ''); const Icon = presentation.icon; return <div className="mobile-card" key={log.id}><Badge variant={presentation.variant} icon={<Icon />}>{actionLabels[log.action] || 'Действие'}</Badge><p>{formatDateTime(log.created_at)} · {log.user_name || 'Пользователь'}</p></div>; })}</div>
    <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} /></section>
  </>;
}

function entityLabel(value: string): string { return ({ user: 'Сотрудник', shift: 'Смена', venue: 'Точка', adjustment: 'Корректировка', payroll_run: 'Расчёт выплаты', payroll_payment: 'Выплата' } as Record<string, string>)[value] || 'Объект'; }
