import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Clock3, FileClock, UserRoundX } from 'lucide-react';
import { api } from '../api';
import { DataTable, EmptyState, ErrorState, LoadingState, Metric, MoneyValue, PageHeader, StatusBadge } from '../components/ui';
import type { PayrollRunListItem, PayrollSummary, Shift, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatTime, hasPermission, monthParts, payModelLabels } from '../utils';
import type { RoutePath } from '../components/shell';

export function Overview({ user, venues, venueId, navigate }: { user: User; venues: Venue[]; venueId: string; navigate: (path: RoutePath) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const { month, year } = monthParts(currentMonthValue());

  const load = async () => {
    setLoading(true); setError('');
    const requests = await Promise.allSettled([
      api.shifts(month, year, venueId || undefined),
      api.users(true),
      hasPermission(user, 'can_view_team_payroll') ? api.payrollSummary(month, year, venueId || undefined) : Promise.resolve(null),
      hasPermission(user, 'can_view_team_payroll') ? api.payrollRuns(venueId || undefined) : Promise.resolve([]),
    ]);
    if (requests[0].status === 'fulfilled') setShifts(requests[0].value); else setError(requests[0].reason instanceof Error ? requests[0].reason.message : 'Не удалось загрузить обзор.');
    if (requests[1].status === 'fulfilled') setUsers(requests[1].value); else setUsers([]);
    if (requests[2].status === 'fulfilled') setSummary(requests[2].value); else setSummary(null);
    if (requests[3].status === 'fulfilled') setRuns(requests[3].value); else setRuns([]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [venueId]);

  const scopedUsers = useMemo(() => users.filter((employee) => !venueId || employee.venue_id === venueId), [users, venueId]);
  const activeUsers = scopedUsers.filter((employee) => employee.is_active);
  const pending = shifts.filter((shift) => shift.status === 'pending');
  const draftRuns = runs.filter((run) => run.status === 'draft');
  const unpaidRuns = runs.filter((run) => run.status === 'finalized' && Number(run.total_amount) > Number(run.total_paid));
  const missingPay = activeUsers.filter((employee) => !employee.pay_model || (employee.pay_model !== 'revenue' && Number(employee.hourly_rate) <= 0));
  const totalPaid = runs.filter((run) => run.status === 'paid' || run.status === 'finalized').reduce((total, run) => total + Number(run.total_paid || 0), 0);
  const totalRemaining = runs.filter((run) => run.status === 'finalized').reduce((total, run) => total + Math.max(0, Number(run.total_amount) - Number(run.total_paid)), 0);
  const userMap = useMemo(() => new Map(users.map((employee) => [employee.id, employee])), [users]);
  const venueMap = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const attention = [
    pending.length ? { icon: Clock3, text: `${pending.length} смен ждут подтверждения`, action: 'Открыть смены', path: '/shifts' as RoutePath } : null,
    missingPay.length ? { icon: UserRoundX, text: `${missingPay.length} сотрудников без настроенной оплаты`, action: 'Открыть команду', path: '/employees' as RoutePath } : null,
    draftRuns.length ? { icon: FileClock, text: `${draftRuns.length} черновиков расчёта требуют решения`, action: 'Открыть расчёты', path: '/payroll' as RoutePath } : null,
    unpaidRuns.length ? { icon: AlertCircle, text: `${unpaidRuns.length} зафиксированных расчётов имеют остаток`, action: 'Открыть расчёты', path: '/payroll' as RoutePath } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock3; text: string; action: string; path: RoutePath }>;

  if (loading) return <LoadingState text="Собираем операционную сводку…" />;
  if (error && !shifts.length) return <ErrorState message={error} retry={load} />;

  return <>
    <PageHeader title="Обзор" description="Операционная картина по сменам, команде и зафиксированным расчётам." />
    <div className="metrics">
      <Metric label="Смен на подтверждении" value={pending.length} hint="Требуют решения" />
      <Metric label="Активные сотрудники" value={activeUsers.length} hint={`${scopedUsers.length - activeUsers.length} в архиве`} />
      <Metric label="Начислено за месяц" value={<MoneyValue value={summary?.total_payout ?? 0} />} hint="Только утверждённые смены" />
      <Metric label="Осталось по расчётам" value={<MoneyValue value={totalRemaining} />} hint={`Фактически выплачено ${new Intl.NumberFormat('ru-RU').format(totalPaid)} ₽`} />
    </div>

    <div className="split-grid">
      <section className="panel"><div className="panel-header"><h2>Требует внимания</h2></div><div className="panel-body">
        {attention.length ? attention.map(({ icon: Icon, text, action, path }) => <div className="attention-row" key={text}><div className="attention-icon"><Icon /></div><strong>{text}</strong><button className="button ghost" onClick={() => navigate(path)}>{action}<ArrowRight /></button></div>) : <EmptyState title="Критичных действий нет" description="Все текущие задачи обработаны." />}
      </div></section>
      <section className="panel"><div className="panel-header"><h2>Последние расчёты</h2><button className="button ghost" onClick={() => navigate('/payroll')}>Все расчёты</button></div><div className="panel-body list">
        {runs.slice(0, 5).map((run) => <div className="list-row" key={run.id}><div><strong>{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</strong><p>{run.venue_name || 'Все точки'} · {formatDate(run.created_at)}</p></div><div><StatusBadge status={run.status} /><p><MoneyValue value={run.total_amount} /></p></div></div>)}
        {!runs.length && <EmptyState title="Расчётов пока нет" description="Сформируйте первый расчёт на странице выплат." />}
      </div></section>
    </div>

    <section className="panel"><div className="panel-header"><h2>Последние смены</h2><button className="button ghost" onClick={() => navigate('/shifts')}>Все смены</button></div>
      <DataTable headers={['Дата', 'Сотрудник', 'Точка', 'Время', 'Часы', 'Статус', 'Начислено']} empty={!shifts.length}>
        {shifts.slice(0, 8).map((shift) => { const employee = userMap.get(shift.user_id); return <tr key={shift.id}><td>{formatDate(shift.date)}</td><td><div className="cell-main">{employee?.name || 'Сотрудник'}</div><div className="cell-sub">{employee?.position || 'Без должности'}</div></td><td>{venueMap.get(shift.venue_id || '')?.name || employee?.venue?.name || 'Основная точка'}</td><td>{formatTime(shift.start_time)}–{formatTime(shift.end_time)}</td><td>{shift.total_hours}</td><td><StatusBadge status={shift.status} /></td><td><MoneyValue value={shift.salary_earned} /></td></tr>; })}
      </DataTable>
      {!shifts.length && <EmptyState title="За этот месяц смен нет" />}
      <div className="mobile-cards">{shifts.slice(0, 8).map((shift) => <div className="mobile-card" key={shift.id}><strong>{userMap.get(shift.user_id)?.name || 'Сотрудник'}</strong><p>{formatDate(shift.date)} · {formatTime(shift.start_time)}–{formatTime(shift.end_time)}</p><StatusBadge status={shift.status} /></div>)}</div>
    </section>

    <section className="panel"><div className="panel-header"><h2>Сводка по точкам</h2></div><div className="panel-body list">
      {venues.filter((venue) => venue.is_active).map((venue) => { const count = activeUsers.filter((employee) => employee.venue_id === venue.id).length; return <div className="list-row" key={venue.id}><div><strong>{venue.name}</strong><p>{count} сотрудников · {payModelLabels[activeUsers.find((employee) => employee.venue_id === venue.id)?.pay_model || ''] || 'Оплата не настроена'}</p></div><span>{shifts.filter((shift) => shift.venue_id === venue.id).length} смен</span></div>; })}
    </div></section>
  </>;
}
