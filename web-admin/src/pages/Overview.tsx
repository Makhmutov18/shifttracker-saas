import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Ban, Clock3, FileClock, Store, UserRoundX } from 'lucide-react';
import { api } from '../api';
import { AvatarStack, ErrorState, IconBadge, LoadingState, MoneyValue, StatusBadge, type BadgeVariant } from '../components/ui';
import type { PayrollRunListItem, PayrollSummary, Shift, User, Venue } from '../types';
import { formatDate, formatTime, hasPermission, monthBounds, monthParts } from '../utils';
import type { RoutePath } from '../components/shell';

type WeeklyAccrual = {
  label: string;
  value: number;
};

type VenueOverview = {
  id: string;
  name: string;
  employees: number;
  shifts: number;
  accrual: number;
  revenue: number;
  pending: number;
};

function plural(value: number, forms: [string, string, string]): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function numeric(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function FinancialValue({ allowed, available = true, value }: { allowed: boolean; available?: boolean; value: number }) {
  if (!allowed) return <span className="overview-restricted-value">Нет доступа</span>;
  if (!available) return <span className="overview-restricted-value">Недоступно</span>;
  return <MoneyValue value={value} />;
}

function WeeklyAccrualChart({ allowed, series }: { allowed: boolean; series: WeeklyAccrual[] }) {
  if (!allowed) return <div className="chart-empty"><span>Нет доступа к начислениям</span><small>Требуется право просмотра выплат.</small></div>;
  const max = Math.max(...series.map((item) => item.value), 0);
  if (!max) return <div className="chart-empty"><span>Начислений пока нет</span><small>График появится после утверждения смен.</small></div>;

  return <div className="weekly-accrual-chart" role="img" aria-label={`Динамика начислений: ${series.map((item) => `${item.label} — ${item.value} рублей`).join(', ')}`}>
    {series.map((item) => <div className="weekly-accrual-column" key={item.label}>
      <strong title={new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(item.value)}>{compactMoney(item.value)}</strong>
      <div className="weekly-accrual-track" aria-hidden="true"><span style={{ height: item.value ? `${Math.max(8, (item.value / max) * 100)}%` : '0%' }} /></div>
      <small>{item.label}</small>
    </div>)}
  </div>;
}

export function Overview({ user, venues, venueId, periodValue, navigate }: { user: User; venues: Venue[]; venueId: string; periodValue: string; navigate: (path: RoutePath) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [runs, setRuns] = useState<PayrollRunListItem[]>([]);
  const [runsAvailable, setRunsAvailable] = useState(true);
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
    if (requests[3].status === 'fulfilled') {
      setRuns(requests[3].value);
      setRunsAvailable(canViewPayroll);
    } else {
      setRuns([]);
      setRunsAvailable(false);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [venueId, canViewPayroll]);

  const scopedUsers = useMemo(() => users.filter((employee) => !venueId || employee.venue_id === venueId), [users, venueId]);
  const activeUsers = useMemo(() => scopedUsers.filter((employee) => employee.is_active), [scopedUsers]);
  const pending = useMemo(() => shifts.filter((shift) => shift.status === 'pending'), [shifts]);
  const rejected = useMemo(() => shifts.filter((shift) => shift.status === 'rejected'), [shifts]);
  const approvedShifts = useMemo(() => shifts.filter((shift) => shift.status === 'approved'), [shifts]);
  const periodRuns = useMemo(() => runs.filter((run) => run.period_start <= periodEnd && run.period_end >= periodStart), [runs, periodEnd, periodStart]);
  const draftRuns = periodRuns.filter((run) => run.status === 'draft');
  const fixedRuns = periodRuns.filter((run) => run.status === 'finalized' || run.status === 'paid');
  const unpaidRuns = fixedRuns.filter((run) => numeric(run.total_amount) > numeric(run.total_paid));
  const missingPay = activeUsers.filter((employee) => !employee.pay_model || (employee.pay_model !== 'revenue' && numeric(employee.hourly_rate) <= 0));
  const totalFixed = fixedRuns.reduce((total, run) => total + numeric(run.total_amount), 0);
  const totalPaid = fixedRuns.reduce((total, run) => total + numeric(run.total_paid), 0);
  const totalRemaining = fixedRuns.reduce((total, run) => total + Math.max(0, numeric(run.total_amount) - numeric(run.total_paid)), 0);
  const inactiveVenues = (venues ?? []).filter((venue) => !venue.is_active);
  const userMap = useMemo(() => new Map(users.map((employee) => [employee.id, employee])), [users]);
  const venueMap = useMemo(() => new Map((venues ?? []).map((venue) => [venue.id, venue])), [venues]);
  const attention = [
    pending.length ? { icon: Clock3, tone: 'warning' as BadgeVariant, text: `${pending.length} ${plural(pending.length, ['смена ждёт', 'смены ждут', 'смен ждут'])} подтверждения`, action: 'Открыть смены', path: '/shifts' as RoutePath } : null,
    missingPay.length ? { icon: UserRoundX, tone: 'danger' as BadgeVariant, text: `${missingPay.length} ${plural(missingPay.length, ['сотрудник без', 'сотрудника без', 'сотрудников без'])} настроенной оплаты`, action: 'Открыть команду', path: '/employees' as RoutePath } : null,
    draftRuns.length ? { icon: FileClock, tone: 'info' as BadgeVariant, text: `${draftRuns.length} ${plural(draftRuns.length, ['черновик расчёта требует', 'черновика расчёта требуют', 'черновиков расчёта требуют'])} решения`, action: 'Открыть расчёты', path: '/payroll' as RoutePath } : null,
    unpaidRuns.length ? { icon: AlertCircle, tone: 'warning' as BadgeVariant, text: `${unpaidRuns.length} ${plural(unpaidRuns.length, ['расчёт имеет', 'расчёта имеют', 'расчётов имеют'])} остаток`, action: 'Открыть расчёты', path: '/payroll' as RoutePath } : null,
    rejected.length ? { icon: Ban, tone: 'danger' as BadgeVariant, text: `${rejected.length} ${plural(rejected.length, ['смена отклонена', 'смены отклонены', 'смен отклонено'])} за месяц`, action: 'Проверить смены', path: '/shifts' as RoutePath } : null,
    inactiveVenues.length ? { icon: Store, tone: 'neutral' as BadgeVariant, text: `${inactiveVenues.length} ${plural(inactiveVenues.length, ['точка находится', 'точки находятся', 'точек находятся'])} в архиве`, action: 'Открыть точки', path: '/venues' as RoutePath } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock3; tone: BadgeVariant; text: string; action: string; path: RoutePath }>;
  const daysInMonth = new Date(year, month, 0).getDate();
  const visibleVenues = useMemo(() => (venues ?? []).filter((venue) => venue.is_active && (!venueId || venue.id === venueId)), [venues, venueId]);
  const weeklyAccruals = useMemo<WeeklyAccrual[]>(() => {
    const weeks = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => ({
      label: `${index * 7 + 1}–${Math.min(daysInMonth, index * 7 + 7)}`,
      value: 0,
    }));
    approvedShifts.forEach((shift) => {
      const day = Number((shift.date || '').slice(8, 10));
      if (day >= 1 && day <= daysInMonth) weeks[Math.floor((day - 1) / 7)].value += numeric(shift.salary_earned);
    });
    return weeks;
  }, [approvedShifts, daysInMonth]);
  const venueOverview = useMemo<VenueOverview[]>(() => visibleVenues.map((venue) => {
    const venueShifts = shifts.filter((shift) => (shift.venue_id || userMap.get(shift.user_id)?.venue_id) === venue.id);
    const approvedVenueShifts = venueShifts.filter((shift) => shift.status === 'approved');
    return {
      id: venue.id,
      name: venue.name || 'Точка без названия',
      employees: activeUsers.filter((employee) => employee.venue_id === venue.id).length,
      shifts: venueShifts.length,
      accrual: approvedVenueShifts.reduce((total, shift) => total + numeric(shift.salary_earned), 0),
      revenue: approvedVenueShifts.reduce((total, shift) => total + numeric(shift.revenue), 0),
      pending: venueShifts.filter((shift) => shift.status === 'pending').length,
    };
  }), [activeUsers, shifts, userMap, visibleVenues]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const activeUserIds = new Set(shifts.filter((shift) => {
    if (shift.date !== today || shift.status === 'rejected') return false;
    const start = (shift.start_time || '').slice(0, 5);
    const end = (shift.end_time || '').slice(0, 5);
    if (!start || !end) return false;
    return end >= start ? timeNow >= start && timeNow <= end : timeNow >= start || timeNow <= end;
  }).map((shift) => shift.user_id));
  const activeNow = activeUsers.filter((employee) => activeUserIds.has(employee.id));
  const summaryAvailable = summary !== null;

  if (loading) return <LoadingState text="Собираем данные за месяц…" />;
  if (error && !shifts.length) return <ErrorState message={error} retry={load} />;

  return <div className="overview-page">
    <section className="overview-metrics" aria-label="Финансовая сводка за месяц">
      <article className="overview-metric">
        <span>Предварительно начислено</span>
        <strong><FinancialValue allowed={canViewPayroll} available={summaryAvailable} value={numeric(summary?.total_payout)} /></strong>
        <small>{canViewPayroll && summaryAvailable ? `${summary?.approved_shifts_count ?? 0} утверждённых смен · ${summary?.employees_count ?? 0} сотрудников` : canViewPayroll ? 'Не удалось загрузить сводку' : 'Доступ к выплатам ограничен'}</small>
      </article>
      <article className="overview-metric">
        <span>Зафиксировано</span>
        <strong><FinancialValue allowed={canViewPayroll} available={runsAvailable} value={totalFixed} /></strong>
        <small>{canViewPayroll && runsAvailable ? `${fixedRuns.length} ${plural(fixedRuns.length, ['расчёт', 'расчёта', 'расчётов'])} за период` : canViewPayroll ? 'Не удалось загрузить расчёты' : 'Доступ к выплатам ограничен'}</small>
      </article>
      <article className="overview-metric">
        <span>Выплачено</span>
        <strong><FinancialValue allowed={canViewPayroll} available={runsAvailable} value={totalPaid} /></strong>
        <small>{canViewPayroll && runsAvailable ? 'Фактически зафиксированные выплаты' : canViewPayroll ? 'Не удалось загрузить расчёты' : 'Доступ к выплатам ограничен'}</small>
      </article>
      <article className={`overview-metric${canViewPayroll && runsAvailable && totalRemaining > 0 ? ' has-balance' : ''}`}>
        <span>Осталось</span>
        <strong><FinancialValue allowed={canViewPayroll} available={runsAvailable} value={totalRemaining} /></strong>
        <small>{canViewPayroll && runsAvailable ? totalRemaining > 0 ? `${unpaidRuns.length} ${plural(unpaidRuns.length, ['расчёт с остатком', 'расчёта с остатком', 'расчётов с остатком'])}` : 'Открытого остатка нет' : canViewPayroll ? 'Не удалось загрузить расчёты' : 'Доступ к выплатам ограничен'}</small>
      </article>
    </section>

    <div className="overview-work-grid">
      <section className="overview-panel shifts-panel">
        <div className="overview-section-header"><div><h2>Последние смены</h2><span>До пяти последних записей за период</span></div><button className="section-link" onClick={() => navigate('/shifts')}>Все смены<ArrowRight /></button></div>
        {shifts.length ? <div className="overview-shift-list">{shifts.slice(0, 5).map((shift) => {
          const employee = userMap.get(shift.user_id);
          const venueName = venueMap.get(shift.venue_id || '')?.name || employee?.venue?.name || 'Основная точка';
          return <button className="overview-shift-row" key={shift.id} onClick={() => navigate('/shifts')}>
            <span className="shift-person"><strong>{employee?.name || 'Сотрудник'}</strong><small>{formatDate(shift.date)} · {formatTime(shift.start_time)}–{formatTime(shift.end_time)}</small></span>
            <span className="shift-venue" title={venueName}>{venueName}</span>
            <StatusBadge status={shift.status || 'unknown'} />
            {canViewPayroll ? <MoneyValue value={shift.salary_earned} /> : <span className="overview-restricted-value" title="Нет доступа к начислениям">—</span>}
            <ArrowRight className="row-arrow" />
          </button>;
        })}</div> : <div className="compact-empty"><span>За этот месяц смен нет</span><small>Новые смены появятся здесь после создания.</small></div>}
      </section>

      <div className="overview-side-stack">
        <section className="overview-panel attention-panel">
          <div className="overview-section-header"><div><h2>Требует внимания</h2><span>{attention.length ? `${attention.length} активных задач` : 'Всё под контролем'}</span></div></div>
          {attention.length ? <div className="attention-list">{attention.map(({ icon: Icon, tone, text, action, path }) => (
            <button className="attention-row" key={text} onClick={() => navigate(path)}>
              <IconBadge tone={tone} icon={<Icon />} label={text} value={action} /><ArrowRight className="row-arrow" />
            </button>
          ))}</div> : <div className="compact-empty"><span>Критичных действий нет</span><small>Все текущие задачи обработаны.</small></div>}
        </section>

        <section className="overview-panel on-shift-panel">
          <div className="overview-section-header"><div><h2>Сейчас на смене</h2><span>Активные сотрудники</span></div></div>
          {activeNow.length ? <div className="on-shift-content"><AvatarStack items={activeNow.map((employee) => ({ name: employee.name || 'Сотрудник' }))} max={6} /><div><strong>{activeNow.length} {plural(activeNow.length, ['сотрудник', 'сотрудника', 'сотрудников'])}</strong><span>{activeNow.slice(0, 3).map((employee) => employee.name).join(', ')}</span></div></div> : <div className="compact-empty"><span>Сейчас активных смен нет</span><small>Сотрудники появятся здесь в рабочее время.</small></div>}
        </section>

        <section className="overview-panel recent-runs-panel">
          <div className="overview-section-header"><div><h2>Последние расчёты</h2><span>Зафиксированные начисления</span></div>{canViewPayroll ? <button className="section-link" onClick={() => navigate('/payroll')}>Все расчёты<ArrowRight /></button> : null}</div>
          {!canViewPayroll ? <div className="compact-empty"><span>Нет доступа к расчётам</span><small>Требуется право просмотра выплат.</small></div> : !runsAvailable ? <div className="compact-empty"><span>Не удалось загрузить расчёты</span><small>Обновите страницу или попробуйте позже.</small></div> : runs.length ? <div className="overview-run-list">{runs.slice(0, 3).map((run) => (
            <button className="overview-run-row" key={run.id} onClick={() => navigate('/payroll')}>
              <span><strong>{run.title || `${formatDate(run.period_start)} — ${formatDate(run.period_end)}`}</strong><small>{run.venue_name || 'Все точки'}</small></span>
              <span><StatusBadge status={run.status || 'unknown'} /><strong><MoneyValue value={run.total_amount} /></strong><small>Осталось <MoneyValue value={Math.max(0, numeric(run.total_amount) - numeric(run.total_paid))} /></small></span>
            </button>
          ))}</div> : <div className="compact-empty"><span>Расчётов пока нет</span><small>Они появятся после формирования начислений.</small></div>}
        </section>
      </div>
    </div>

    <div className="overview-insights-grid">
      <section className="overview-panel venue-overview-panel">
        <div className="overview-section-header"><div><h2>Состояние точек</h2><span>Команда и утверждённые смены за месяц</span></div></div>
        {venueOverview.length ? <div className="venue-overview-list">
          <div className="venue-overview-head" aria-hidden="true"><span>Точка</span><span>Сотрудники</span><span>Смены</span><span>Начислено</span><span>Выручка</span><span>Задачи</span></div>
          {venueOverview.map((venue) => <div className="venue-overview-row" key={venue.id}>
            <span className="venue-overview-name"><strong title={venue.name}>{venue.name}</strong></span>
            <span className="venue-overview-stat"><small>Активные сотрудники</small><strong>{venue.employees}</strong></span>
            <span className="venue-overview-stat"><small>Смены за месяц</small><strong>{venue.shifts}</strong></span>
            <span className="venue-overview-stat"><small>Начислено</small><strong>{canViewPayroll ? <MoneyValue value={venue.accrual} /> : <span className="overview-restricted-value">—</span>}</strong></span>
            <span className="venue-overview-stat"><small>Выручка</small><strong><MoneyValue value={venue.revenue} /></strong></span>
            <span className={`venue-overview-stat${venue.pending ? ' has-task' : ''}`}><small>На подтверждении</small><strong>{venue.pending ? `${venue.pending} ${plural(venue.pending, ['смена', 'смены', 'смен'])}` : '—'}</strong></span>
          </div>)}
        </div> : <div className="compact-empty"><span>Активных точек нет</span><small>Добавьте точку в разделе управления.</small></div>}
      </section>

      <section className="overview-panel accrual-chart-panel">
        <div className="overview-section-header"><div><h2>Динамика начислений</h2><span>Утверждённые смены по неделям</span></div></div>
        <WeeklyAccrualChart allowed={canViewPayroll} series={weeklyAccruals} />
      </section>
    </div>
  </div>;
}
