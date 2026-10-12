import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { PayrollSchedule, PayrollSchedulePeriod } from '../types';
import { formatDate, monthParts } from '../utils';
import { FormField } from './ui';

interface Props {
  venueId: string;
  initialMonth: string;
  canEdit: boolean;
  disabled: boolean;
  onSelect: (period: PayrollSchedulePeriod) => void;
  onBusyChange: (busy: boolean) => void;
}

export function PayrollScheduleFields({ venueId, initialMonth, canEdit, disabled, onSelect, onBusyChange }: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [schedule, setSchedule] = useState<PayrollSchedule | null>(null);
  const [mode, setMode] = useState<PayrollSchedule['schedule_type']>('manual');
  const [firstDay, setFirstDay] = useState('');
  const [secondDay, setSecondDay] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const { year, month: monthNumber } = monthParts(month);

  useEffect(() => {
    onBusyChange(saving);
    return () => onBusyChange(false);
  }, [saving, onBusyChange]);

  useEffect(() => {
    let active = true;
    setSchedule(null); setError('');
    if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12 || year < 1 || year > 9998) {
      setLoading(false); setError('Выберите месяц работы.');
      return;
    }
    setLoading(true);
    api.payrollSchedule(venueId, monthNumber, year).then((data) => {
      if (!active) return;
      setSchedule(data); setMode(data.schedule_type);
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
    pending.current = true; setSaving(true); setError(''); setSuccess('');
    try {
      await api.savePayrollSchedule(venueId, { schedule_type: mode,
        first_payment_day: mode === 'twice_monthly' ? first : null,
        second_payment_day: mode === 'twice_monthly' ? second : null });
      setEditing(false); setSuccess('График сохранён. Даты существующих расчётов не изменены.');
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить график. Повторите попытку.');
    } finally { pending.current = false; setSaving(false); }
  };

  const periods = Array.isArray(schedule?.periods) ? schedule.periods : [];
  return <section className="payroll-schedule" aria-label="График выплат точки">
    <div className="payroll-schedule-head"><h3>График выплат точки</h3>
      {canEdit && !editing && <button className="button ghost" type="button" disabled={disabled || loading || !schedule}
        onClick={() => { setEditing(true); setSuccess(''); }}>Настроить</button>}
    </div>
    {loading && <p role="status" className="payroll-schedule-note">Загрузка графика…</p>}
    {error && <div className="notice error" role="alert">{error}{!editing && <button className="button ghost" type="button" disabled={disabled || loading}
      onClick={() => setRevision((value) => value + 1)}>Повторить</button>}</div>}
    {success && <p role="status" className="payroll-schedule-note">{success}</p>}
    {editing ? <fieldset className="payroll-schedule-fields" disabled={saving || disabled || loading}>
      <FormField label="Режим"><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
        <option value="manual">Ручной период</option><option value="twice_monthly">Дважды в месяц</option>
      </select></FormField>
      {mode === 'twice_monthly' && <>
        <div className="form-grid">
          <FormField label="За 1–15: день выплаты в этом месяце"><input type="number" inputMode="numeric" min="16" max="31" step="1" value={firstDay} onChange={(event) => setFirstDay(event.target.value)} /></FormField>
          <FormField label="За 16–конец месяца: день выплаты в следующем месяце"><input type="number" inputMode="numeric" min="1" max="15" step="1" value={secondDay} onChange={(event) => setSecondDay(event.target.value)} /></FormField>
        </div>
        <p className="payroll-schedule-note">Если дня нет в месяце, используется последний день. Выходные и праздники учитываются вручную.</p>
      </>}
      <div className="payroll-schedule-actions"><button className="button secondary" type="button" onClick={() => void save()}>{saving ? 'Сохранение…' : 'Сохранить график'}</button>
        <button className="button ghost" type="button" onClick={() => { setEditing(false); setError(''); setRevision((value) => value + 1); }}>Отмена</button></div>
    </fieldset> : <>
      {mode === 'twice_monthly' && <FormField label="Месяц работы"><input type="month" value={month} disabled={disabled || loading} onChange={(event) => { setMonth(event.target.value); setSuccess(''); }} /></FormField>}
      {schedule?.schedule_type === 'twice_monthly' ? <div className="payroll-schedule-periods">
        {periods.map((period) => <button className="button secondary" type="button" key={period.period_start} disabled={disabled || loading} onClick={() => onSelect(period)}>
          <span>{formatDate(period.period_start)} — {formatDate(period.period_end)}<small>Плановая выплата: {formatDate(period.planned_payment_date)}</small></span>
        </button>)}
      </div> : schedule && <p className="payroll-schedule-note">Ручной период. Дату выплаты можно указать ниже.</p>}
    </>}
  </section>;
}
