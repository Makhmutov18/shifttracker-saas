import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, Edit3 } from 'lucide-react';
import { User, Shift, getPendingShifts, updateShift } from '../utils/api';
import { formatDate, formatTime, formatCurrency, formatHours } from '../utils/helpers';

interface Props {
  user: User;
}

export default function OwnerPanel({ user }: Props) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const data = await getPendingShifts();
      setShifts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  const handleApprove = async (shiftId: string) => {
    try {
      await updateShift(shiftId, { status: 'approved' });
      setShifts((prev) => prev.filter((s) => s.id !== shiftId));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-tg-secondary-bg rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-tg-primary" />
        <h1 className="text-lg font-semibold">Управление</h1>
      </div>

      {shifts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-tg-text font-medium mb-1">Всё чисто</p>
          <p className="text-tg-hint text-sm">Нет смен, ожидающих утверждения</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-tg-hint text-sm mb-2">
            Ожидают утверждения: {shifts.length}
          </p>
          {shifts.map((shift) => (
            <div
              key={shift.id}
              className="bg-tg-secondary-bg rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-tg-text font-medium text-sm">
                    {formatDate(shift.date)}
                  </p>
                  <p className="text-tg-hint text-xs">
                    {formatTime(shift.start_time)} — {formatTime(shift.end_time)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-tg-text font-semibold text-sm">
                    {formatCurrency(shift.salary_earned)}
                  </p>
                  <p className="text-tg-hint text-xs">
                    {formatHours(shift.total_hours)}
                  </p>
                </div>
              </div>

              {shift.comment && (
                <p className="text-tg-hint text-xs mb-3 bg-tg-bg rounded-lg px-3 py-2">
                  {shift.comment}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(shift.id)}
                  className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <CheckCircle className="w-4 h-4" />
                  Утвердить
                </button>
                <button className="flex-1 bg-tg-bg text-tg-text py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-700 active:scale-[0.98] transition-transform">
                  <Edit3 className="w-4 h-4" />
                  Редактировать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}