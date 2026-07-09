import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Shift } from '../utils/api';
import { formatCurrency, formatDate, formatHours, formatTime } from '../utils/helpers';

interface Props {
  shift: Shift;
}

function StatusBadge({ label, tone }: { label: string; tone: 'approved' | 'pending' | 'rejected' }) {
  const toneClasses =
    tone === 'approved'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : tone === 'rejected'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${toneClasses}`}>{label}</span>;
}

export default function ShiftCard({ shift }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isApproved = shift.status === 'approved';
  const isRejected = shift.status === 'rejected';
  const isPending = shift.status === 'pending';
  const statusLabel = isApproved
    ? 'Утверждена'
    : isRejected
      ? 'Отклонена'
      : isPending
        ? 'На подтверждении'
        : 'Статус уточняется';
  const payoutLabel = isApproved
    ? 'К выплате'
    : isPending
      ? 'Предварительно'
      : isRejected
        ? 'Не входит в выплату'
        : 'Сумма';
  const amountClass = isApproved ? 'text-tg-text' : 'text-tg-hint';

  return (
    <div
      className="surface-card rounded-[1.35rem] overflow-hidden shadow-sm transition-all duration-200 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isApproved
                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                : isRejected
                  ? 'bg-rose-50 dark:bg-rose-900/20'
                  : 'bg-amber-50 dark:bg-amber-900/20'
            }`}
          >
            {isApproved ? (
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            ) : isRejected ? (
              <XCircle className="h-5 w-5 text-rose-500" />
            ) : (
              <Clock className="h-5 w-5 text-amber-500" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-tg-text">{formatDate(shift.date)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge label={statusLabel} tone={isApproved ? 'approved' : isRejected ? 'rejected' : 'pending'} />
              <span className="inline-flex items-center rounded-full bg-tg-bg px-2.5 py-1 text-[11px] font-medium text-tg-hint">
                {payoutLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className={`text-sm font-semibold ${amountClass}`}>{formatCurrency(shift.salary_earned)}</p>
          <p className="mt-1 text-xs text-tg-hint">{formatHours(shift.total_hours)}</p>
        </div>

        <div className="ml-1 text-tg-hint">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-2 border-t border-tg-border px-4 pb-4 pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-tg-hint">Начало смены</span>
            <span className="font-medium text-tg-text">{formatTime(shift.start_time)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-tg-hint">Конец смены</span>
            <span className="font-medium text-tg-text">{formatTime(shift.end_time)}</span>
          </div>
          {shift.revenue && parseFloat(shift.revenue) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-tg-hint">Выручка</span>
              <span className="font-medium text-tg-text">{formatCurrency(shift.revenue)}</span>
            </div>
          )}
          {shift.comment && (
            <div className="border-t border-tg-border pt-2">
              <p className="mb-1 text-xs text-tg-hint">Комментарий</p>
              <p className="text-sm text-tg-text">{shift.comment}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
