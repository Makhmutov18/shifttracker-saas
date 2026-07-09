import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Shift } from '../utils/api';
import { formatCurrency, formatDate, formatHours, formatTime } from '../utils/helpers';

interface Props {
  shift: Shift;
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
      className="glass-card rounded-xl overflow-hidden transition-all duration-200 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isApproved
                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                : isRejected
                ? 'bg-rose-50 dark:bg-rose-900/20'
                : 'bg-amber-50 dark:bg-amber-900/20'
            }`}
          >
            {isApproved ? (
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            ) : isRejected ? (
              <XCircle className="w-5 h-5 text-rose-500" />
            ) : (
              <Clock className="w-5 h-5 text-amber-500" />
            )}
          </div>
          <div>
            <p className="text-tg-text font-medium text-sm">{formatDate(shift.date)}</p>
            <p className={`text-xs ${isRejected ? 'text-rose-400' : 'text-tg-hint'}`}>{statusLabel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-semibold text-sm ${amountClass}`}>{formatCurrency(shift.salary_earned)}</p>
          <p className="text-[11px] text-tg-hint">{payoutLabel}</p>
          <p className="text-tg-hint text-xs">{formatHours(shift.total_hours)}</p>
        </div>
        <div className="ml-2 text-tg-hint">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-2 border-t border-tg-border pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-tg-hint">Начало смены</span>
            <span className="text-tg-text font-medium">{formatTime(shift.start_time)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-tg-hint">Конец смены</span>
            <span className="text-tg-text font-medium">{formatTime(shift.end_time)}</span>
          </div>
          {shift.revenue && parseFloat(shift.revenue) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-tg-hint">Выручка</span>
              <span className="text-tg-text font-medium">{formatCurrency(shift.revenue)}</span>
            </div>
          )}
          {shift.comment && (
            <div className="pt-2 border-t border-tg-border">
              <p className="text-tg-hint text-xs mb-1">Комментарий</p>
              <p className="text-tg-text text-sm">{shift.comment}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
