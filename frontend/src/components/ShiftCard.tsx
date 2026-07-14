import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Shift } from '../utils/api';
import { formatCurrency, formatHours, formatTime } from '../utils/helpers';

interface Props {
  shift: Shift;
  venueName?: string;
}

function getShiftPresentation(status: Shift['status']) {
  if (status === 'approved') {
    return { status: 'Утверждена', amount: 'Начислено' };
  }
  if (status === 'rejected') {
    return { status: 'Отклонена', amount: 'Не входит в начисления' };
  }
  return { status: 'На подтверждении', amount: 'Предварительно' };
}

export default function ShiftCard({ shift, venueName = 'Точка не указана' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const presentation = getShiftPresentation(shift.status);
  const startTime = shift.start_time ? formatTime(shift.start_time) : '';
  const endTime = shift.end_time ? formatTime(shift.end_time) : '';
  const timeLabel = startTime && endTime ? `${startTime}–${endTime}` : 'Время не указано';

  return (
    <article className="history-shift-row">
      <button
        type="button"
        className="history-shift-main"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1 text-left">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-tg-text">{timeLabel}</p>
            <span className="history-status" data-status={shift.status}>{presentation.status}</span>
          </div>
          <p className="mt-1 truncate text-sm text-tg-hint">
            {venueName} · {formatHours(shift.total_hours || 0)}
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-tg-hint transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <div className="history-shift-amount">
        <span>{presentation.amount}</span>
        <strong>{formatCurrency(shift.salary_earned || 0)}</strong>
      </div>

      {expanded && (
        <div className="history-shift-details">
          {shift.revenue && parseFloat(shift.revenue) > 0 && (
            <div>
              <span>Выручка</span>
              <strong>{formatCurrency(shift.revenue)}</strong>
            </div>
          )}
          {shift.comment && (
            <div className="history-shift-comment">
              <span>Комментарий</span>
              <p>{shift.comment}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
