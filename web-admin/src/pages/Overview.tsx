import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Building2, Clock3, FileClock, UserRoundX } from 'lucide-react';
import { api } from '../api';
import { ErrorState, LoadingState, MoneyValue } from '../components/ui';
import type { PayrollRunListItem, PayrollSummary, Shift, User, Venue } from '../types';
import { currentMonthValue, formatDate, formatTime, hasPermission, monthBounds, monthParts } from '../utils';
import type { RoutePath } from '../components/shell';

const statusLabels: Record<string, string> = {
  pending: 'На подтверждении',
  approved: 'Утверждена',
  rejected: 'Отклонена',
  draft: 'Черновик',
  finalized: 'Зафиксирован',
  paid: 'Выплачен',
  cancelled: 'Отменён',
};

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function plural(value: number, forms: [string, string, string]): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export function Overview({ user, venues, venueId, navigate }: { user: User; venues: Venue[]; venueId: string; navigate: (path: RoutePath) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const periodValue = currentMonthValue();
  const { month, year } = monthParts(periodValue);
  const { start: periodStart, end: periodEnd } = monthBounds(periodValue);
  const canViewPayroll = hasPermission(user, 'can_view_team_payroll');

  const load = async () => {
    setLoading(true);
    setError('');
    const requests = await Promise.allSettled([
      api.shifts(month, year, venueId || undefined),
      api.users(true),
      canViewPayroll ? api.payrollSummary(month, year, venueId || undefined) : Promise.resolve(null),
      canViewPayroll ? api.payrollRuns(venueId || undefined) : Promise.resolve([]),
    ]);
    if (requests[0].status === 'fulfilled') setShifts(requests[0].value);
    else setError(requests[0].reason instanceof Error ? requests[0].reason.message : 'Не удалось загрузить обзор.');
    setUsers(requests[1].status === 'fulfilled' ? requests[1].value : []);
    setSummary(requests[2].status === 'fulfilled' ? requests[2].value : null);
    setRuns(requests[3].status === 'fulfilled' ? requests[3].value : []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [venueId]);

  const scopedUsers = useMemo(() => users.filter((employee) => !venueId || employee.venue_id === venueId), [users, venueId]);
  const activeUsers = scopedUsers.filter((employee) => employee.is_active);
  const pending = shifts.filter((shift) => shift.status === 'pending');
  const periodRuns = runs.filter((run) => run.period_start <= periodEnd && run.period_end >= periodStart);
  const draftRuns = periodRuns.filter((run) => run.status === 'draft');
  const fixedRuns = periodRuns.filter((run) => run.status === 'finalized' || run.status === 'paid');
  const unpaidRuns = fixedRuns.filter((run) => Number(run.total_amount) > Number(run.total_paid));
  const missingPay = activeUsers.filter((employee) => !employee.pay_model || (employee.pay_model !== 'revenue' && Number(employee.hourly_rate) <= 0));
  const totalFixed = fixedRuns.reduce((total, run) => total + Number(run.total_amount || 0), 0);
  const totalPaid = fixedRuns.reduce((total, run) => total + Number(run.total_paid || 0), 0);
  const totalRemaining = fixedRuns.reduce((total, run) => total + Math.max(0, Number(run.total_amount) - Number(run.total_paid)), 0);
  const userMap = useMemo(() => new Map(users.map((employee) => [employee.id, employee])), [users]);
  const venueMap = useMemo(() => new Map(venues.map((venue) => [venue.id, venue])), [venues]);
  const selectedVenue = venueId ? venueMap.get(venueId)?.name ?? 'Точка не указана' : 'Все точки';
  const attention = [
    pending.length ? { icon: Clock3, text: `${pending.length} ${plural(pending.length, ['смена ждёт', 'смены ждут', 'смен ждут'])} подтверждения`, action: 'Открыть смены', path: '/shifts' as RoutePath } : null,
    missingPay.length ? { icon: UserRoundX, text: `${missingPay.length} ${plural(missingPay.length, ['сотрудник без', 'сотрудника без', 'сотрудников без'])} настроенной оплаты`, action: 'Открыть команду', path: '/employees' as RoutePath } : null,
    draftRuns.length ? { icon: FileClock, text: `${draftRuns.length} ${plural(draftRuns.length, ['черновик расчёта требует', 'черновика расчёта требуют', 'черновиков расчёта требуют'])} решения`, action: 'Открыть расчёты', path: '/payroll' as RoutePath } : null,
    unpaidRuns.length ? { icon: AlertCircle, text: `${unpaidRuns.length} ${plural(unpaidRuns.length, ['расчёт имеет', 'расчёта имеют', 'расчётов имеют'])} остаток`, action: 'Открыть расчёты', path: '/payroll' as RoutePath } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock3; text: string; action: string; path: RoutePath }>;

  if (loading) return <LoadingState text="Собираем данные за месяц…" />;
  if (error && !shifts.length) return <ErrorState message={error} retry={load} />;

  return <div className="overview-page">
    <header className="overview-header">
      <div><h1>Обзор</h1><div className="overview-context"><span>{monthLabel(periodValue)}</span><span><Building2 />{selectedVenue}</span></div></div>
    </header>

    <div className="overview-primary-grid">
      <section className="finance-panel">
        <div className="finance-lead">
          <span>Начислено за месяц</span>
          <strong>{canViewPayroll ? <MoneyValue value={summary?.total_payout ?? 0} /> : 'Нет доступа'}</strong>
          <small>{summary?.approved_shifts_count ?? 0} утверждённых смен · {summary?.employees_count ?? 0} сотрудников</small>
        </div>
        <div className="finance-details">
          <div><span>Зафиксировано</span><strong>{canViewPayroll ? <MoneyValue value={totalFixed} /> : '—'}</strong></div>
          <div><span>Выплачено фактически</span><strong>{canViewPayroll ? <MoneyValue value={totalPaid} /> : '—'}</strong></div>
          <div><span>Осталось</span><strong>{canViewPayroll ? <MoneyValue value={totalRemaining} /> : '—'}</strong></div>
        </div>
      </section>

      <section className="overview-panel attention-panel">
        <div className="overview-section-header"><div><h2>Требует внимания</h2><span>{attention.length ? `${attention.length} активных задач` : 'Всё под контролем'}</span></div></div>
        {attention.length ? <div className="attention-list">{attention.map(({ icon: Icon, text, action, path }) => (
          <button className="attention-row" key={text} onClick={() => navigate(path)}>
            <span className="attention-icon"><Icon /></span><strong>{text}</strong><span>{action}<ArrowRight /></span>
          </button>
        ))}</div> : <div className="compact-empty"><span>Критичных действий нет</span><small>Все текущие задачи обработаны.</small></div>}
      </section>
    </div>

    <div className="overview-content-grid">
      <section className="overview-panel shifts-panel">
        <div className="overview-section-header"><div><h2>Последние смены</h2><span>До пяти последних записей за период</span></div><button className="section-link" onClick={() => navigate('/shifts')}>Все смены<ArrowRight /></button></div>
        {shifts.length ? <div className="overview-shift-list">{shifts.slice(0, 5).map((shift) => {
          const employee = userMap.get(shift.user_id);
          const venueName = venueMap.get(shift.venue_id || '')?.name || employee?.venue?.name || 'Основная точка';
          return <button className="overview-shift-row" key={shift.id} onClick={() => navigate('/shifts')}>
            <span className="shift-person"><strong>{employee?.name || 'Сотрудник'}</strong><small>{formatDate(shift.date)} · {formatTime(shift.start_time)}–{formatTime(shift.end_time)}</small></span>
            <span className="shift-venue" title={venueName}>{venueName}</span>
            <span className={`status status-${shift.status}`}>{statusLabels[shift.status] ?? 'Статус не указан'}</span>
            <MoneyValue value={shift.salary_earned} />
            <ArrowRight className="row-arrow" />
          </button>;
        })}</div> : <div className="compact-empty"><span>За этот месяц смен нет</span><small>Новые смены появятся здесь после создания.</small></div>}
      </section>

      <div className="overview-side-stack">
        <section className="overview-panel">
          <div className="overview-section-header"><div><h2>Последние расчёты</h2><span>Зафиксированные начисления</span></div><button className="section-link" onClick={() => navigate('/payroll')}>Все расчёты<ArrowRight /></button></div>
          {runs.length ? <div className="overview-run-list">{runs.slice(0, 3).map((run) => (
            <button className="overview-run-row" key={run.id} onClick={() => navigate('/payroll')}>
              <span><strong>{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</strong><small>{run.venue_name || 'Все точки'}</small></span>
              <span><span className={`status status-${run.status}`}>{statusLabels[run.status] ?? 'Статус не указан'}</span><strong><MoneyValue value={run.total_amount} /></strong><small>Осталось <MoneyValue value={Math.max(0, Number(run.total_amount) - Number(run.total_paid))} /></small></span>
            </button>
          ))}</div> : <div className="compact-empty"><span>Расчётов пока нет</span><small>Они появятся после формирования начислений.</small></div>}
        </section>

        <section className="overview-panel">
          <div className="overview-section-header"><div><h2>Состояние точек</h2><span>Команда и смены за месяц</span></div></div>
          {venues.filter((venue) => venue.is_active).length ? <div className="venue-state-list">{venues.filter((venue) => venue.is_active).map((venue) => {
            const employeeCount = activeUsers.filter((employee) => employee.venue_id === venue.id).length;
            const shiftCount = shifts.filter((shift) => shift.venue_id === venue.id).length;
            return <div className="venue-state-row" key={venue.id}><span><strong title={venue.name}>{venue.name}</strong><small>{employeeCount} {plural(employeeCount, ['сотрудник', 'сотрудника', 'сотрудников'])}</small></span><strong>{shiftCount} {plural(shiftCount, ['смена', 'смены', 'смен'])}</strong></div>;
          })}</div> : <div className="compact-empty"><span>Активных точек нет</span><small>Добавьте точку в разделе управления.</small></div>}
        </section>
      </div>
    </div>
  </div>;
}
