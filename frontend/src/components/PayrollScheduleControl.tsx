import { useEffect, useRef, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { PayrollSchedule, PayrollSchedulePeriod, getPayrollSchedule, savePayrollSchedule } from '../utils/api';
import { formatDate } from '../utils/helpers';

interface Props {
  venueId: string;
  canEdit: boolean;
  disabled: boolean;
  onSelect: (period: PayrollSchedulePeriod) => void;
}

export default function PayrollScheduleControl({ venueId, canEdit, disabled, onSelect }: Props) {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [schedule, setSchedule] = useState<PayrollSchedule | null>(null);
  const [mode, setMode] = useState<'manual' | 'twice_monthly'>('manual');
  const [firstDay, setFirstDay] = useState('');
  const [secondDay, setSecondDay] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const [year, monthNumber] = month.split('-').map(Number);

  useEffect(() => {
    let active = true;
    setSchedule(null);
    setError('');
    if (!year || !monthNumber) {
      setLoading(false);
      setError('Выберите месяц работы');
      return;
    }
    setLoading(true);
    getPayrollSchedule(venueId, monthNumber, year).then((data) => {
      if (!active) return;
      setSchedule(data);
      setMode(data.schedule_type);
      setFirstDay(data.first_payment_day == null ? '' : String(data.first_payment_day));
      setSecondDay(data.second_payment_day == null ? '' : String(data.second_payment_day));
    }).catch(() => {
      if (active) setError('Не удалось загрузить график. Ручной расчёт остаётся доступен.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [venueId, year, monthNumber, revision]);

  const save = async () => {
    if (!canEdit || disabled || pending.current) return;
    const first = Number(firstDay), second = Number(secondDay);
    if (mode === 'twice_monthly' && (!Number.isInteger(first) || first < 16 || first > 31
      || !Number.isInteger(second) || second < 1 || second > 15)) {
      setError('Укажите первый день выплаты от 16 до 31, второй — от 1 до 15.');
      return;
    }
    pending.current = true;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await savePayrollSchedule(venueId, {
        schedule_type: mode,
        first_payment_day: mode === 'twice_monthly' ? first : null,
        second_payment_day: mode === 'twice_monthly' ? second : null,
      });
      setSuccess('График сохранён. Даты существующих расчётов не изменены.');
      setEditing(false);
      setRevision((value) => value + 1);
    } catch {
      setError('Не удалось сохранить график. Проверьте доступ и повторите попытку.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const periods = Array.isArray(schedule?.periods) ? schedule.periods : [];
  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-tg-text">График выплат точки</h3>
        {canEdit && !editing && <button type="button" className="owner-secondary-action" disabled={disabled || loading || !schedule}
          onClick={() => { setEditing(true); setSuccess(''); }}>Настроить</button>}
      </div>
      {!editing && mode === 'twice_monthly' && <label className="block text-sm text-tg-hint">Месяц работы
        <input type="month" required value={month} disabled={disabled || loading} className="owner-field-control mt-1.5 min-w-0 max-w-full" onChange={(event) => setMonth(event.target.value)} />
      </label>}
      {loading && <p role="status" className="text-sm text-tg-hint">Загрузка графика…</p>}
      {error && <div role="alert" className="text-sm text-tg-text space-y-2"><p>{error}</p>
        {!editing && <button type="button" disabled={disabled || loading} className="owner-secondary-action" onClick={() => setRevision((value) => value + 1)}><RefreshCw className="w-4 h-4" />Повторить</button>}
      </div>}
      {success && <p role="status" className="text-sm text-tg-text">{success}</p>}
      {editing ? (
        <fieldset disabled={saving || disabled || loading} className="space-y-3 min-w-0">
          <label className="block text-sm text-tg-hint">Режим
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="owner-field-control mt-1.5">
              <option value="manual">Ручной период</option><option value="twice_monthly">Дважды в месяц</option>
            </select>
          </label>
          {mode === 'twice_monthly' && <>
            <label className="block text-sm text-tg-hint">За 1–15: день выплаты в этом месяце
              <input type="number" inputMode="numeric" min="16" max="31" step="1" value={firstDay} className="owner-field-control mt-1.5" onChange={(event) => setFirstDay(event.target.value)} />
            </label>
            <label className="block text-sm text-tg-hint">За 16–конец месяца: день выплаты в следующем месяце
              <input type="number" inputMode="numeric" min="1" max="15" step="1" value={secondDay} className="owner-field-control mt-1.5" onChange={(event) => setSecondDay(event.target.value)} />
            </label>
            <p className="text-xs text-tg-hint">Если дня нет в месяце, используется последний день. Выходные и праздники учитываются вручную.</p>
          </>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} className="owner-primary-action">{saving ? 'Сохранение…' : 'Сохранить график'}</button>
            <button type="button" className="owner-secondary-action" onClick={() => {
              setEditing(false); setError(''); setRevision((value) => value + 1);
            }}>Отменить</button>
          </div>
        </fieldset>
      ) : schedule?.schedule_type === 'twice_monthly' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {periods.map((period, index) => <button type="button" key={period.period_start} disabled={disabled || loading}
              className="owner-secondary-action text-left" onClick={() => onSelect(period)}>
              <CalendarDays className="h-4 w-4 shrink-0" /><span>{index === 0 ? '1–15' : '16–конец месяца'} · выплата {formatDate(period.planned_payment_date)}</span>
            </button>)}
          </div>
        </>
      ) : schedule && <p className="text-sm text-tg-hint">Ручной период. Дату выплаты можно указать при создании расчёта.</p>}
    </div>
  );
}
