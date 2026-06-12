import React, { useState } from 'react';
import { Clock, CreditCard, TrendingDown } from 'lucide-react';
import { User } from '../utils/api';
import { useShifts } from '../hooks/useShifts';
import { useExpenses } from '../hooks/useExpenses';
import ShiftCard from '../components/ShiftCard';
import { getMonthName, getCurrentMonth, getCurrentYear, formatCurrency } from '../utils/helpers';

interface Props {
  user: User;
}

type Tab = 'shifts' | 'expenses';

export default function History({ user }: Props) {
  const [tab, setTab] = useState<Tab>('shifts');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year] = useState(getCurrentYear());

  const { shifts, loading: shiftsLoading } = useShifts(month, year);
  const { expenses, loading: expensesLoading } = useExpenses(month, year);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold mb-4">История</h1>

      {/* Month selector */}
      <div className="flex gap-1 overflow-x-auto pb-3 mb-4 scrollbar-none">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonth(m)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              m === month
                ? 'bg-tg-primary text-tg-button-text'
                : 'bg-tg-secondary-bg text-tg-hint'
            }`}
          >
            {getMonthName(m)}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex bg-tg-secondary-bg rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('shifts')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'shifts' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <Clock className="w-4 h-4" />
          Смены
        </button>
        <button
          onClick={() => setTab('expenses')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'expenses' ? 'bg-tg-bg text-tg-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Расходы
        </button>
      </div>

      {/* Content */}
      {tab === 'shifts' ? (
        shiftsLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-tg-secondary-bg rounded-xl" />
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-tg-hint mx-auto mb-3 opacity-50" />
            <p className="text-tg-hint text-sm">Пока нет смен за этот месяц</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shifts.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </div>
        )
      ) : (
        expensesLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-tg-secondary-bg rounded-xl" />
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-12">
            <TrendingDown className="w-12 h-12 text-tg-hint mx-auto mb-3 opacity-50" />
            <p className="text-tg-hint text-sm">Нет расходов за этот месяц</p>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="bg-tg-secondary-bg rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-tg-text font-medium text-sm">{expense.category}</p>
                  <p className="text-tg-hint text-xs">{expense.date}</p>
                  {expense.comment && (
                    <p className="text-tg-hint text-xs mt-0.5">{expense.comment}</p>
                  )}
                </div>
                <p className="text-rose-400 font-semibold text-sm">
                  -{formatCurrency(expense.amount)}
                </p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}