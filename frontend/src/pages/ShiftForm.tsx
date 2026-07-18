import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, ChevronDown, MapPin, MessageSquare, Send } from 'lucide-react';
import { Shift, User, Venue, createShift, getActiveVenues, getErrorMessage } from '../utils/api';
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
  if (user.pay_model === 'revenue') return `${user.revenue_percentage || '0'}% от выручки`;
  return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage || '0'}%`;
}

export default function ShiftForm({ user, onBack, onOpenHistory }: Props) {
  const [date, setDate] = useState(getTodayDate());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [revenue, setRevenue] = useState('');
  const [comment, setComment] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [venues, setVenues] = useState<Venue[]>(() => user.venue ? [user.venue] : []);
  const [venueId, setVenueId] = useState(user.venue_id || user.venue?.id || '');
  const [venuesLoading, setVenuesLoading] = useState(true);
  const [venuesUnavailable, setVenuesUnavailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ hours: string; salary: string; status: Shift['status']; venueName: string } | null>(null);

  const needsRevenue = user.pay_model === 'revenue' || user.pay_model === 'hybrid';
  const homeVenueId = user.venue_id || user.venue?.id || '';
  const homeVenueName = user.venue?.name?.trim() || 'Основная точка';
  const venueName = venues.find((venue) => venue.id === venueId)?.name?.trim() || homeVenueName;
  const isToday = date === getTodayDate();
  const isOvernight = startTime >= endTime;

  const totalHours = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
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

  useEffect(() => {
    let cancelled = false;
    setVenuesLoading(true);
    setVenuesUnavailable(false);

    getActiveVenues()
      .then((data) => {
        if (cancelled) return;
        const activeVenues = Array.isArray(data) ? data.filter((venue) => venue?.id && venue.is_active) : [];
        if (activeVenues.length === 0) {
          setVenues(user.venue ? [user.venue] : []);
          setVenuesUnavailable(true);
          return;
        }
        setVenues(activeVenues);
        setVenueId((current) => (
          activeVenues.some((venue) => venue.id === current)
            ? current
            : activeVenues.some((venue) => venue.id === homeVenueId)
            ? homeVenueId
            : activeVenues[0].id
        ));
      })
      .catch(() => {
        if (!cancelled) {
          setVenues(user.venue ? [user.venue] : []);
          setVenuesUnavailable(true);
        }
      })
      .finally(() => {
        if (!cancelled) setVenuesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [homeVenueId, user.venue]);

  const handleSubmit = async () => {
    if (submitting) return;

    if (parseFloat(totalHours) > 16) {
      setError('Смена не может длиться более 16 часов');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const createdShift = await createShift({
        venue_id: venueId || undefined,
        date,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        revenue: needsRevenue ? (parseFloat(revenue) || 0) : undefined,
        comment: comment || undefined,
      });

      hapticSuccess();
      setSaved({
        hours: totalHours,
        salary,
        status: createdShift.status,
        venueName: createdShift.venue_name?.trim() || venueName,
      });
    } catch (err) {
      hapticError();
      setError(getErrorMessage(err, 'Не удалось сохранить смену. Попробуйте ещё раз.'));
    } finally {
      setSubmitting(false);
    }
  };

  const successTitle = saved?.status === 'pending' ? 'Смена отправлена' : 'Смена сохранена';

  if (saved) {
    return (
      <div className="shift-form-page shift-success-page mx-auto max-w-lg px-4 pt-5">
        <div className="shift-success-icon" aria-hidden="true">
          <CheckCircle className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-tg-text">{successTitle}</h1>
          <p className="mt-2 text-sm text-tg-hint">
            {isToday ? 'Сегодня' : 'Вчера'}, {startTime}–{endTime} · {formatHours(saved.hours)}
          </p>
        </div>

        <section className="shift-summary" aria-label="Итог смены">
          <p className="text-sm text-tg-hint">{saved.status === 'pending' ? 'Предварительно' : 'Начислено'}</p>
          <p className="shift-summary-amount">{formatCurrency(saved.salary)}</p>
          <div className="shift-summary-meta">
            <span>{saved.status === 'pending' ? 'На подтверждении' : 'Утверждена'}</span>
            <span>{saved.venueName}</span>
            <span>{formatHours(saved.hours)}</span>
            <span>{isToday ? 'Сегодня' : 'Вчера'}, {startTime}–{endTime}</span>
          </div>
        </section>

        <div className="shift-success-actions">
          <button type="button" onClick={onOpenHistory} className="shift-primary-button">
            Открыть историю
          </button>
          <button type="button" onClick={onBack} className="shift-secondary-button">
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shift-form-page mx-auto max-w-lg px-4 pt-5">
      <header className="shift-form-header">
        <button type="button" onClick={onBack} className="shift-back-button" aria-label="Вернуться на главную">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold text-tg-text">Новая смена</h1>
          <p className="shift-form-subtitle">Основная точка: {homeVenueName}</p>
        </div>
      </header>

      <main className="shift-form-content">
        <section className="shift-form-section" aria-labelledby="shift-date-title">
          <h2 id="shift-date-title" className="shift-section-title">Дата</h2>
          <div className="shift-segmented" role="group" aria-label="Дата смены">
            <button
              type="button"
              aria-pressed={isToday}
              data-active={isToday}
              onClick={() => setDate(getTodayDate())}
            >
              Сегодня
            </button>
            <button
              type="button"
              aria-pressed={!isToday}
              data-active={!isToday}
              onClick={() => setDate(getYesterdayDate())}
            >
              Вчера
            </button>
          </div>
        </section>

        <section className="shift-form-section" aria-labelledby="shift-time-title">
          <h2 id="shift-time-title" className="shift-section-title">Рабочее время</h2>
          <div className="shift-time-grid">
            <label>
              <span>Начало смены</span>
              <div className="shift-time-control">
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
            </label>
            <label>
              <span>Конец смены</span>
              <div className="shift-time-control">
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </div>
            </label>
          </div>
          <div className="shift-time-total">
            <strong>Итого: {formatHours(totalHours)}</strong>
            {isOvernight && <span>Смена завершится на следующий день</span>}
          </div>
        </section>

        <section className="shift-form-section" aria-labelledby="shift-venue-title">
          <label id="shift-venue-title" htmlFor="shift-venue" className="shift-section-title">Точка смены</label>
          <div className="shift-venue-control">
            <MapPin className="h-5 w-5 shrink-0 text-tg-hint" aria-hidden="true" />
            <select
              id="shift-venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              disabled={venuesLoading || venues.length === 0}
            >
              {venues.length === 0 ? (
                <option value={venueId}>{homeVenueName}</option>
              ) : (
                venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)
              )}
            </select>
            <ChevronDown className="h-5 w-5 shrink-0 text-tg-hint" aria-hidden="true" />
          </div>
          <p className="shift-venue-help">
            {venuesUnavailable
              ? 'Список точек временно недоступен. Это ваша основная точка.'
              : venueId === homeVenueId
              ? 'Это ваша основная точка'
              : 'Смена будет отнесена к этой точке'}
          </p>
        </section>

        <div className="shift-pay-context" aria-label="Условия оплаты сотрудника">
          <span>Условия оплаты</span>
          <strong>{getPayModelLabel(user)}</strong>
          <small>Применяются ко всем вашим сменам</small>
        </div>

        {needsRevenue && (
          <section className="shift-form-section" aria-labelledby="shift-revenue-title">
            <label id="shift-revenue-title" htmlFor="shift-revenue" className="shift-section-title">Выручка</label>
            <input
              id="shift-revenue"
              type="number"
              value={revenue}
              onChange={(event) => setRevenue(event.target.value)}
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0 ₽"
              className="shift-revenue-input"
            />
          </section>
        )}

        <section className="shift-comment-section">
          <button
            type="button"
            className="shift-comment-toggle"
            onClick={() => setCommentOpen((open) => !open)}
            aria-expanded={commentOpen}
          >
            <span className="flex min-w-0 items-center gap-2">
              <MessageSquare className="h-5 w-5 shrink-0 text-tg-hint" aria-hidden="true" />
              <span>{comment ? 'Комментарий добавлен' : 'Добавить комментарий'}</span>
            </span>
            <ChevronDown className="disclosure-chevron h-5 w-5 shrink-0" data-open={commentOpen} aria-hidden="true" />
          </button>
          {commentOpen && (
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Комментарий к смене"
              rows={3}
              className="shift-comment-input motion-disclosure-content"
            />
          )}
        </section>

        <section className="shift-summary" aria-label="Предварительный расчёт">
          <p className="text-sm text-tg-hint">Предварительно</p>
          <p className="shift-summary-amount">{formatCurrency(salary)}</p>
          <div className="shift-summary-meta">
            <span>{formatHours(totalHours)}</span>
            <span>{isToday ? 'Сегодня' : 'Вчера'}, {startTime}–{endTime}</span>
          </div>
        </section>

        {error && <p className="shift-form-error" role="alert">{error}</p>}
      </main>

      <footer className="shift-action-footer">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="shift-primary-button"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
          {submitting ? 'Сохраняем…' : 'Сохранить смену'}
        </button>
      </footer>
    </div>
  );
}
