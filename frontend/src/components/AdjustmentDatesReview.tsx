import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, RefreshCw } from 'lucide-react';
import {
  ApiRequestError, ManagedAdjustment, User, Venue,
  getManagedAdjustments, updateAdjustmentAccrualDate,
} from '../utils/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import { hapticError, hapticSuccess } from '../utils/telegram';

interface Props {
  user: User;
  venues: Venue[];
  revision: number;
}

export default function AdjustmentDatesReview({ user, venues, revision }: Props) {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [venueId, setVenueId] = useState(user.venue_id || '');
  const [undatedOnly, setUndatedOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ManagedAdjustment[]>([]);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<ManagedAdjustment | null>(null);
  const [date, setDate] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const canChooseVenue = user.role === 'owner' || user.role === 'admin';
  const [year, monthNumber] = month.split('-').map(Number);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setItems([]);
    setEditing(null);
    if (!year || !monthNumber) {
      setError('Выберите месяц');
      setLoading(false);
      return;
    }
    getManagedAdjustments(monthNumber, year, venueId, undatedOnly, page)
      .then((result) => {
        if (!active) return;
        setItems(Array.isArray(result.items) ? result.items : []);
        setTotal(result.total);
        setPerPage(result.per_page);
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить бонусы и удержания. Попробуйте ещё раз.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [year, monthNumber, venueId, undatedOnly, page, refresh, revision]);

  const openDateForm = (item: ManagedAdjustment) => {
    if (!item.date_editable || savingRef.current) return;
    setEditing(item);
    setDate(item.accrual_date || '');
    setSaveError('');
    setSuccess('');
  };

  const saveDate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || savingRef.current) return;
    const originalMonth = `${editing.year}-${String(editing.month).padStart(2, '0')}`;
    if (!date || date.slice(0, 7) !== originalMonth) {
      setSaveError('Выберите дату в исходном месяце корректировки');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await updateAdjustmentAccrualDate(editing.id, date);
      hapticSuccess();
      setEditing(null);
      setSuccess('Дата начисления сохранена');
      if (undatedOnly && items.length === 1 && page > 1) setPage(page - 1);
      else setRefresh((value) => value + 1);
    } catch (err) {
      hapticError();
      setSaveError(err instanceof ApiRequestError && err.status === 409
        ? 'Корректировка уже включена в действующий расчёт. Дату менять нельзя.'
        : err instanceof ApiRequestError && err.status === 422
          ? 'Выберите корректную дату в исходном месяце корректировки.'
          : 'Не удалось сохранить дату. Проверьте доступ и повторите попытку.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 min-w-0" aria-labelledby="adjustment-review-title" aria-busy={loading || saving}>
      <div>
        <h2 id="adjustment-review-title" className="text-base font-semibold text-tg-text">Даты бонусов и удержаний</h2>
        <p className="mt-1 text-sm text-tg-hint">Для расчёта за часть месяца укажите дату начисления старых записей. Дата добавления её не заменяет.</p>
      </div>
      <fieldset disabled={saving} className="space-y-3 min-w-0">
        <div>
          <label htmlFor="adjustment-review-month" className="block text-sm text-tg-hint mb-1.5">Месяц начисления</label>
          <input id="adjustment-review-month" type="month" value={month} required className="owner-field-control min-w-0 max-w-full"
            onChange={(event) => { setMonth(event.target.value); setPage(1); setSuccess(''); }} />
        </div>
        {canChooseVenue && (
          <div>
            <label htmlFor="adjustment-review-venue" className="block text-sm text-tg-hint mb-1.5">Точка корректировки</label>
            <select id="adjustment-review-venue" className="owner-field-control" value={venueId}
              onChange={(event) => { setVenueId(event.target.value); setPage(1); setSuccess(''); }}>
              <option value="">Все точки</option>
              {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name || 'Точка без названия'}{venue.is_active ? '' : ' (в архиве)'}</option>)}
            </select>
          </div>
        )}
        {!canChooseVenue && <p className="text-sm text-tg-hint break-words">{user.venue?.name || 'Основная точка'}</p>}
        <div className="owner-segmented-control" aria-label="Наличие даты начисления">
          <button type="button" aria-pressed={undatedOnly} data-active={undatedOnly ? 'true' : 'false'}
            onClick={() => { setUndatedOnly(true); setPage(1); }}>Без даты</button>
          <button type="button" aria-pressed={!undatedOnly} data-active={!undatedOnly ? 'true' : 'false'}
            onClick={() => { setUndatedOnly(false); setPage(1); }}>Все записи</button>
        </div>
      </fieldset>
      {success && <p role="status" className="text-sm text-tg-text">{success}</p>}
      {loading ? <p role="status" className="text-sm text-tg-hint">Загрузка корректировок…</p> : error ? (
        <div role="alert" className="owner-empty-state">
          <p>{error}</p>
          <button type="button" className="owner-secondary-action mt-3" onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="w-4 h-4" />Повторить</button>
        </div>
      ) : items.length === 0 ? (
        <p className="owner-empty-state">{undatedOnly ? 'Корректировок без даты за этот месяц нет' : 'Бонусов и удержаний за этот месяц нет'}</p>
      ) : (
        <>
          <p className="text-sm text-tg-hint">Найдено: {total}</p>
          <ul className="space-y-3">
            {items.map((item) => {
              const itemMonth = `${item.year}-${String(item.month).padStart(2, '0')}`;
              const lastDay = new Date(item.year, item.month, 0).getDate();
              return (
                <li key={item.id} className="owner-form-surface min-w-0 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-tg-text break-words">{item.user_name || 'Сотрудник не указан'}</p>
                      <p className="text-sm text-tg-hint break-words">{item.venue_name || 'Точка не указана'}</p>
                    </div>
                    <span className="text-sm font-medium text-tg-text whitespace-nowrap">{item.type === 'bonus' ? '+' : '−'}{formatCurrency(item.amount)}</span>
                  </div>
                  <p className="text-sm text-tg-text break-words">{item.type === 'bonus' ? 'Бонус' : 'Удержание'} · {item.reason || 'Причина не указана'}</p>
                  <p className="text-sm text-tg-hint">Дата начисления: {item.accrual_date ? formatDate(item.accrual_date) : 'Не указана'}</p>
                  {!item.date_editable ? <p className="text-sm text-tg-hint">В действующем расчёте. Дата защищена от изменений.</p> : editing?.id === item.id ? (
                    <form onSubmit={saveDate} className="space-y-3">
                      <label htmlFor={`accrual-date-${item.id}`} className="block text-sm text-tg-hint">Дата начисления в исходном месяце</label>
                      <input id={`accrual-date-${item.id}`} type="date" required value={date} disabled={saving}
                        min={`${itemMonth}-01`} max={`${itemMonth}-${lastDay}`} className="owner-field-control min-w-0 max-w-full"
                        onChange={(event) => setDate(event.target.value)} />
                      {saveError && <p role="alert" className="text-sm text-tg-text">{saveError}</p>}
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={saving || !date} className="owner-primary-action"><CalendarDays className="w-4 h-4" />{saving ? 'Сохранение…' : 'Сохранить дату'}</button>
                        <button type="button" disabled={saving} className="owner-secondary-action" onClick={() => setEditing(null)}>Отменить</button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" disabled={saving} className="owner-secondary-action" onClick={() => openDateForm(item)}><Pencil className="w-4 h-4" />{item.accrual_date ? 'Изменить дату' : 'Указать дату'}</button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!loading && !error && total > perPage && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Предыдущая страница" disabled={page <= 1 || saving} className="owner-secondary-action" onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm text-tg-hint">{page} / {Math.ceil(total / perPage)}</span>
          <button type="button" aria-label="Следующая страница" disabled={page * perPage >= total || saving} className="owner-secondary-action" onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </section>
  );
}
