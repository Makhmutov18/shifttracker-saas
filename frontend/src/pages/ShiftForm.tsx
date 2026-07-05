import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Clock, Coffee, Send } from 'lucide-react';
import { Shift, User, createShift, getErrorMessage } from '../utils/api';
import { formatCurrency, formatHours, getTodayDate, getYesterdayDate } from '../utils/helpers';
import { hapticError, hapticSuccess } from '../utils/telegram';

interface Props {
  user: User;
  onBack: () => void;
  onOpenHistory: () => void;
}

export default function ShiftForm({ user, onBack, onOpenHistory }: Props) {
  const [date, setDate] = useState(getTodayDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [cashierEnabled, setCashierEnabled] = useState(false);
  const [cashierHours, setCashierHours] = useState('0');
  const [revenue, setRevenue] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ hours: string; salary: string; status: Shift['status'] } | null>(null);

  const needsRevenue = user.pay_model !== 'hourly';

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
    const revenuePart = user.pay_model !== 'hourly' ? (rev * revPct) / 100 : 0;

    if (user.pay_model === 'hourly') return hourlyPart.toFixed(2);
    if (user.pay_model === 'revenue') return revenuePart.toFixed(2);
    return (hourlyPart + revenuePart).toFixed(2);
  }, [totalHours, user.hourly_rate, revenue, user.revenue_percentage, user.pay_model]);

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
        cashier_hours: cashierEnabled ? parseFloat(cashierHours) || 0 : undefined,
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

  const successTitle = saved?.status === 'pending' ? 'Смена отправлена на подтверждение' : 'Смена создана';
  const successDescription =
    saved?.status === 'pending'
      ? 'Смена сохранена и ждёт подтверждения старшего.'
      : `${date === getTodayDate() ? 'Сегодня' : 'Вчера'}, ${startTime} - ${endTime}`;

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {saved ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-tg-text mb-2">{successTitle}</h2>
          <p className="text-tg-hint text-sm mb-6">{successDescription}</p>
          <div className="accent-card rounded-[1.4rem] p-5 text-white mb-6">
            <p className="text-sm opacity-80 mb-1">Начислено</p>
            <p className="text-3xl font-bold">{formatCurrency(saved.salary)}</p>
            <p className="text-sm opacity-80 mt-1">{formatHours(saved.hours)}</p>
          </div>
          <div className="space-y-3">
            <button
              onClick={onOpenHistory}
              className="w-full bg-tg-primary text-tg-button-text font-semibold py-4 px-6 rounded-2xl active:scale-[0.98] transition-transform"
            >
              К истории смен
            </button>
            <button
              onClick={onBack}
              className="w-full surface-card text-tg-text font-semibold py-4 px-6 rounded-2xl active:scale-[0.98] transition-transform"
            >
              На главную
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-tg-secondary-bg transition-colors">
              <ArrowLeft className="w-5 h-5 text-tg-text" />
            </button>
            <h1 className="text-lg font-semibold text-tg-text">Новая смена</h1>
          </div>

          <div className="surface-muted flex gap-2 mb-5 rounded-[1.35rem] p-1">
            <button
              onClick={() => setDate(getTodayDate())}
              className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all ${
                date === getTodayDate() ? 'bg-tg-primary text-tg-button-text' : 'text-tg-text'
              }`}
            >
              Сегодня
            </button>
            <button
              onClick={() => setDate(getYesterdayDate())}
              className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all ${
                date === getYesterdayDate() ? 'bg-tg-primary text-tg-button-text' : 'text-tg-text'
              }`}
            >
              Вчера
            </button>
          </div>

          <div className="space-y-4 mb-5">
            <div className="surface-card rounded-[1.35rem] p-4">
              <label className="flex items-center gap-2 text-sm text-tg-hint mb-2">
                <Clock className="w-4 h-4" />
                Начало смены
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-lg font-semibold px-4 py-3 rounded-xl border border-black/5 outline-none appearance-none placeholder:text-gray-400 [&::-webkit-calendar-picker-indicator]:opacity-50"
              />
            </div>

            <div className="surface-card rounded-[1.35rem] p-4">
              <label className="flex items-center gap-2 text-sm text-tg-hint mb-2">
                <Clock className="w-4 h-4" />
                Конец смены
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full text-lg font-semibold px-4 py-3 rounded-xl border border-black/5 outline-none appearance-none placeholder:text-gray-400 [&::-webkit-calendar-picker-indicator]:opacity-50"
              />
            </div>
          </div>

          <div className="surface-card rounded-[1.35rem] p-4 mb-5">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-tg-hint" />
                <span className="text-sm text-tg-text">Часы за кассой</span>
              </div>
              <div
                onClick={() => setCashierEnabled(!cashierEnabled)}
                className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                  cashierEnabled ? 'bg-tg-primary' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${
                    cashierEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </label>
            {cashierEnabled && (
              <div className="mt-3">
                <input
                  type="number"
                  value={cashierHours}
                  onChange={(e) => setCashierHours(e.target.value)}
                  step="0.25"
                  min="0"
                  max="24"
                  placeholder="Количество часов"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none border border-black/5 placeholder:text-gray-400"
                />
              </div>
            )}
          </div>

          {needsRevenue && (
            <div className="surface-card rounded-[1.35rem] p-4 mb-5">
              <label className="flex items-center gap-2 text-sm text-tg-hint mb-2">Выручка за смену (₽)</label>
              <input
                type="number"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                min="0"
                step="0.01"
                placeholder="Введите выручку"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border border-black/5 placeholder:text-gray-400"
              />
              {user.pay_model === 'hybrid' && (
                <p className="text-tg-hint text-xs mt-1">+ {formatCurrency(user.hourly_rate)}/ч × {formatHours(totalHours)}</p>
              )}
              {user.pay_model === 'revenue' && (
                <p className="text-tg-hint text-xs mt-1">{user.revenue_percentage}% от выручки</p>
              )}
            </div>
          )}

          <div className="surface-card rounded-[1.35rem] p-4 mb-5">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий (необязательно)"
              rows={2}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none border border-black/5 placeholder:text-gray-400"
            />
          </div>

          <div className="accent-card rounded-[1.4rem] p-5 text-white mb-5">
            <p className="text-sm opacity-80 mb-1">Предварительный расчёт</p>
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold">{formatCurrency(salary)}</p>
              <p className="text-lg opacity-90">{formatHours(totalHours)}</p>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-tg-primary text-tg-button-text font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
            {submitting ? 'Сохранение...' : 'Сохранить смену'}
          </button>
        </>
      )}
    </div>
  );
}
