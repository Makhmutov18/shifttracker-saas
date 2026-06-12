import React, { useState, useMemo } from 'react';
import { ArrowLeft, Clock, Coffee, Send } from 'lucide-react';
import { User, createShift } from '../utils/api';
import { getTodayDate, getYesterdayDate, formatCurrency, formatHours } from '../utils/helpers';

interface Props {
  user: User;
  onBack: () => void;
}

export default function ShiftForm({ user, onBack }: Props) {
  const [date, setDate] = useState(getTodayDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [cashierEnabled, setCashierEnabled] = useState(false);
  const [cashierHours, setCashierHours] = useState('0');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    return (hours * rate).toFixed(2);
  }, [totalHours, user.hourly_rate]);

  const handleSubmit = async () => {
    if (startTime >= endTime) {
      setError('Время ухода должно быть позже времени прихода');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await createShift({
        date,
        start_time: startTime + ':00',
        end_time: endTime + ':00',
        cashier_hours: cashierEnabled ? parseFloat(cashierHours) || 0 : undefined,
        comment: comment || undefined,
      });
      onBack();
    } catch (err: any) {
      setError(err.message || 'Ошибка при сохранении смены');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-tg-secondary-bg transition-colors">
          <ArrowLeft className="w-5 h-5 text-tg-text" />
        </button>
        <h1 className="text-lg font-semibold">Новая смена</h1>
      </div>

      {/* Date selector */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setDate(getTodayDate())}
          className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all ${
            date === getTodayDate()
              ? 'bg-tg-primary text-tg-button-text'
              : 'bg-tg-secondary-bg text-tg-text'
          }`}
        >
          Сегодня
        </button>
        <button
          onClick={() => setDate(getYesterdayDate())}
          className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all ${
            date === getYesterdayDate()
              ? 'bg-tg-primary text-tg-button-text'
              : 'bg-tg-secondary-bg text-tg-text'
          }`}
        >
          Вчера
        </button>
      </div>

      {/* Time inputs */}
      <div className="space-y-4 mb-5">
        <div>
          <label className="flex items-center gap-2 text-sm text-tg-hint mb-2">
            <Clock className="w-4 h-4" />
            Время прихода
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full bg-tg-secondary-bg text-tg-text text-lg font-semibold px-4 py-3 rounded-xl border-none outline-none appearance-none [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-tg-hint mb-2">
            <Clock className="w-4 h-4" />
            Время ухода
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full bg-tg-secondary-bg text-tg-text text-lg font-semibold px-4 py-3 rounded-xl border-none outline-none appearance-none [&::-webkit-calendar-picker-indicator]:opacity-50"
          />
        </div>
      </div>

      {/* Cashier toggle */}
      <div className="bg-tg-secondary-bg rounded-xl p-4 mb-5">
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
            <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${
              cashierEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} />
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
              className="w-full bg-tg-bg text-tg-text px-4 py-2.5 rounded-xl text-sm outline-none"
            />
          </div>
        )}
      </div>

      {/* Comment */}
      <div className="mb-5">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий (необязательно)"
          rows={2}
          className="w-full bg-tg-secondary-bg text-tg-text px-4 py-3 rounded-xl text-sm outline-none resize-none placeholder:text-tg-hint"
        />
      </div>

      {/* Preview */}
      <div className="bg-gradient-to-br from-tg-primary to-blue-600 rounded-2xl p-5 text-white mb-5">
        <p className="text-sm opacity-80 mb-1">Предварительный расчёт</p>
        <div className="flex items-baseline justify-between">
          <p className="text-3xl font-bold">{formatCurrency(salary)}</p>
          <p className="text-lg opacity-90">{formatHours(totalHours)}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm text-center mb-4">{error}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-tg-primary text-tg-button-text font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
      >
        <Send className="w-5 h-5" />
        {submitting ? 'Сохранение...' : 'Сохранить смену'}
      </button>
    </div>
  );
}