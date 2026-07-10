import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Clock, MapPin, Send } from 'lucide-react';
import { Shift, User, createShift, getErrorMessage } from '../utils/api';
import { formatCurrency, formatHours, getTodayDate, getYesterdayDate } from '../utils/helpers';
import { hapticError, hapticSuccess } from '../utils/telegram';

interface Props {
  user: User;
  onBack: () => void;
  onOpenHistory: () => void;
}

function getPayModelLabel(user: User) {
  if (user.pay_model === 'hourly') return `${formatCurrency(user.hourly_rate)}/ч`;
  if (user.pay_model === 'fixed_shift') return `${formatCurrency(user.hourly_rate)}/смена`;
  if (user.pay_model === 'revenue') return `${user.revenue_percentage}% от выручки`;
  return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage}%`;
}

export default function ShiftForm({ user, onBack, onOpenHistory }: Props) {
  const [date, setDate] = useState(getTodayDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [revenue, setRevenue] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ hours: string; salary: string; status: Shift['status'] } | null>(null);

  const needsRevenue = user.pay_model === 'revenue' || user.pay_model === 'hybrid';
  const venueName = user.venue?.name?.trim() || 'Основная точка';

  const totalHours = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin < startMin) endMin += 24 * 60;
    return ((endMin - startMin) / 60).toFixed(2);
  }, [startTime, endTime]);

  const salary = useMemo(() => {
    const hours = parseFloat(totalHours);
    const rate = parseFloat(user.hourly_rate);
    const rev = parseFloat(revenue) || 0;
    const revPct = parseFloat(user.revenue_percentage) || 0;

    const hourlyPart = hours * rate;
    const revenuePart = needsRevenue ? (rev * revPct) / 100 : 0;

    if (user.pay_model === 'hourly') return hourlyPart.toFixed(2);
    if (user.pay_model === 'fixed_shift') return rate.toFixed(2);
    if (user.pay_model === 'revenue') return revenuePart.toFixed(2);
    return (hourlyPart + revenuePart).toFixed(2);
  }, [totalHours, user.hourly_rate, revenue, user.revenue_percentage, user.pay_model, needsRevenue]);

  const handleSubmit = async () => {
    if (submitting) return;

    const isOvernight = startTime >= endTime;
    if (isOvernight && parseFloat(totalHours) > 16) {
      setError('Смена не может длиться более 16 часов');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const createdShift = await createShift({
        date,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        revenue: needsRevenue ? (parseFloat(revenue) || 0) : undefined,
        comment: comment || undefined,
      });

      hapticSuccess();
      setSaved({ hours: totalHours, salary, status: createdShift.status });
    } catch (err) {
      hapticError();
      setError(getErrorMessage(err, 'Не удалось сохранить смену. Попробуйте ещё раз.'));
    } finally {
      setSubmitting(false);
    }
  };

  const successTitle =
    saved?.status === 'pending' ? 'Смена отправлена на подтверждение' : 'Смена создана';
  const successDescription =
    saved?.status === 'pending'
      ? 'Смена сохранена и ждёт подтверждения старшего.'
      : `${date === getTodayDate() ? 'Сегодня' : 'Вчера'}, ${startTime} - ${endTime}`;

  return (
    <div className="mx-auto max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] pt-6">
      {saved ? (
        <div className="space-y-4 text-center">
          <div className="surface-card rounded-[1.4rem] p-5">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-tg-primary/10 text-tg-primary">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-tg-text">{successTitle}</h2>
            <p className="mt-2 text-sm text-tg-hint">{successDescription}</p>

            <div className="accent-card mt-5 rounded-[1.4rem] p-5 text-white">
              <p className="text-sm opacity-80">Начислено</p>
              <p className="mt-1 text-3xl font-bold">{formatCurrency(saved.salary)}</p>
              <p className="mt-1 text-sm opacity-80">{formatHours(saved.hours)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onOpenHistory}
              className="surface-card w-full rounded-2xl px-6 py-4 text-sm font-semibold text-tg-text transition-transform active:scale-[0.98]"
            >
              К истории смен
            </button>
            <button
              onClick={onBack}
              className="surface-card w-full rounded-2xl px-6 py-4 text-sm font-semibold text-tg-text transition-transform active:scale-[0.98]"
            >
              На главную
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="rounded-xl p-2 transition-colors hover:bg-tg-secondary-bg">
              <ArrowLeft className="h-5 w-5 text-tg-text" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-tg-text">Новая смена</h1>
              <p className="text-sm text-tg-hint">Заполните данные смены и сохраните её в историю.</p>
            </div>
          </div>

          <section className="surface-card rounded-[1.35rem] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-tg-text">Дата смены</p>
                <p className="mt-1 text-xs text-tg-hint">Выберите день, за который вы вносите смену.</p>
              </div>
              <div className="rounded-full bg-tg-primary/10 px-3 py-1 text-xs font-medium text-tg-primary">
                {date === getTodayDate() ? 'Сегодня' : 'Вчера'}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setDate(getTodayDate())}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  date === getTodayDate() ? 'bg-tg-primary text-tg-button-text' : 'surface-muted text-tg-text'
                }`}
              >
                Сегодня
              </button>
              <button
                onClick={() => setDate(getYesterdayDate())}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  date === getYesterdayDate() ? 'bg-tg-primary text-tg-button-text' : 'surface-muted text-tg-text'
                }`}
              >
                Вчера
              </button>
            </div>
          </section>

          <section className="surface-card rounded-[1.35rem] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-tg-text">
              <Clock className="h-4 w-4 text-tg-primary" />
              Начало и конец смены
            </div>
            <p className="mt-1 text-xs text-tg-hint">Укажите рабочее время. Смена может переходить через полночь.</p>

            <div className="mt-4 grid gap-3">
              <label className="space-y-2">
                <span className="block text-xs font-medium uppercase tracking-wide text-tg-hint">Начало смены</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-tg-border bg-tg-bg px-4 py-3 text-lg font-semibold text-tg-text outline-none appearance-none placeholder:text-tg-hint focus:ring-2 focus:ring-tg-primary/30 [&::-webkit-calendar-picker-indicator]:opacity-50"
                />
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-medium uppercase tracking-wide text-tg-hint">Конец смены</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-tg-border bg-tg-bg px-4 py-3 text-lg font-semibold text-tg-text outline-none appearance-none placeholder:text-tg-hint focus:ring-2 focus:ring-tg-primary/30 [&::-webkit-calendar-picker-indicator]:opacity-50"
                />
              </label>
            </div>
          </section>

          <section className="surface-card rounded-[1.35rem] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-tg-text">
              <MapPin className="h-4 w-4 text-tg-primary" />
              Точка
            </div>
            <p className="mt-1 text-xs text-tg-hint">Смена будет сохранена за текущей точкой сотрудника.</p>
            <div className="mt-3 rounded-xl bg-tg-secondary-bg/70 px-4 py-3">
              <p className="text-sm font-medium text-tg-text">{venueName}</p>
              <p className="mt-0.5 text-xs text-tg-hint">Модель оплаты: {getPayModelLabel(user)}</p>
            </div>
          </section>

          {needsRevenue && (
            <section className="surface-card rounded-[1.35rem] p-4">
              <label className="block text-sm font-medium text-tg-text">
                Выручка за смену
                <span className="mt-1 block text-xs font-normal text-tg-hint">
                  Нужна для расчёта, если у сотрудника есть процент от выручки.
                </span>
              </label>
              <input
                type="number"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                min="0"
                step="0.01"
                placeholder="Введите выручку"
                className="mt-3 w-full rounded-xl border border-tg-border bg-tg-bg px-4 py-3 text-sm text-tg-text outline-none placeholder:text-tg-hint focus:ring-2 focus:ring-tg-primary/30"
              />
              {user.pay_model === 'hybrid' && (
                <p className="mt-2 text-xs text-tg-hint">+ {formatCurrency(user.hourly_rate)}/ч × {formatHours(totalHours)}</p>
              )}
              {user.pay_model === 'revenue' && (
                <p className="mt-2 text-xs text-tg-hint">{user.revenue_percentage}% от выручки</p>
              )}
            </section>
          )}

          <section className="surface-card rounded-[1.35rem] p-4">
            <label className="block text-sm font-medium text-tg-text">
              Комментарий
              <span className="mt-1 block text-xs font-normal text-tg-hint">Необязательно. Можно добавить заметку для истории.</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий к смене"
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-tg-border bg-tg-bg px-4 py-3 text-sm text-tg-text outline-none placeholder:text-tg-hint focus:ring-2 focus:ring-tg-primary/30"
            />
          </section>

          <section className="accent-card rounded-[1.4rem] p-5 text-white">
            <p className="text-sm opacity-80">Предварительный расчёт</p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-3xl font-bold">{formatCurrency(salary)}</p>
              <p className="text-lg opacity-90">{formatHours(totalHours)}</p>
            </div>
            <p className="mt-2 text-sm opacity-80">
              {date === getTodayDate() ? 'Сегодня' : 'Вчера'} · {startTime} – {endTime}
            </p>
          </section>

          {error && <p className="text-center text-sm text-rose-500">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-tg-primary px-6 py-4 text-sm font-semibold text-tg-button-text transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
            {submitting ? 'Сохранение...' : 'Сохранить смену'}
          </button>
        </div>
      )}
    </div>
  );
}
