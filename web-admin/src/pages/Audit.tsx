import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { DataTable, EmptyState, ErrorState, FilterBar, LoadingState, PageHeader } from '../components/ui';
import type { AuditLog } from '../types';
import { formatDateTime } from '../utils';

const actionLabels: Record<string, string> = {
  venue_created: 'Точка создана', venue_updated: 'Точка обновлена', venue_deactivated: 'Точка отправлена в архив',
  user_created: 'Сотрудник добавлен', user_updated: 'Сотрудник обновлён', user_deactivated: 'Сотрудник отправлен в архив',
  shift_created: 'Смена создана', shift_updated: 'Смена отредактирована', shift_approved: 'Смена утверждена', shift_rejected: 'Смена отклонена',
  bonus_added: 'Бонус добавлен', penalty_added: 'Удержание добавлено', payroll_run_created: 'Расчёт создан',
};

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [type, setType] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setLogs(await api.audit(1, 100)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю действий.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const types = useMemo(() => Array.from(new Set(logs.map((log) => log.entity_type))).sort(), [logs]);
  const filtered = useMemo(() => logs.filter((log) => (!type || log.entity_type === type) && (!date || log.created_at.slice(0, 10) === date)), [logs, type, date]);
  if (loading) return <LoadingState text="Загружаем историю действий…" />;
  if (error && !logs.length) return <ErrorState message={error} retry={load} />;
  return <><PageHeader title="История действий" description="Общий журнал административных изменений в рамках доступной точки." />
    <FilterBar><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Все типы событий</option>{types.map((value) => <option key={value} value={value}>{entityLabel(value)}</option>)}</select><span className="cell-sub">Показано {filtered.length} из {logs.length}</span></FilterBar>
    <section className="panel"><DataTable headers={['Дата и время', 'Действие', 'Кто изменил', 'Связанный сотрудник', 'Объект']} empty={!filtered.length}>
      {filtered.map((log) => <tr key={log.id}><td>{formatDateTime(log.created_at)}</td><td className="cell-main">{actionLabels[log.action] || 'Действие'}</td><td>{log.user_name || 'Пользователь'}</td><td>{log.target_user_name || '—'}</td><td>{entityLabel(log.entity_type)}</td></tr>)}
    </DataTable>{!filtered.length && <EmptyState title="События не найдены" description="Измените фильтры или проверьте доступ к журналу." />}
    <div className="mobile-cards">{filtered.map((log) => <div className="mobile-card" key={log.id}><strong>{actionLabels[log.action] || 'Действие'}</strong><p>{formatDateTime(log.created_at)} · {log.user_name || 'Пользователь'}</p></div>)}</div></section>
  </>;
}

function entityLabel(value: string): string { return ({ user: 'Сотрудник', shift: 'Смена', venue: 'Точка', adjustment: 'Корректировка', payroll_run: 'Расчёт выплаты' } as Record<string, string>)[value] || 'Объект'; }
