import React, { useEffect, useMemo, useState } from 'react';
import { Clock, CreditCard, TrendingDown, Download, Wallet } from 'lucide-react';
import { User, PayrollSummary, downloadPayrollExport, getPayrollSummary } from '../utils/api';
import { useShifts } from '../hooks/useShifts';
import { useExpenses } from '../hooks/useExpenses';
import ShiftCard from '../components/ShiftCard';
import { getMonthName, getCurrentMonth, getCurrentYear, formatCurrency, formatHours } from '../utils/helpers';
import { hasPermission } from '../utils/permissions';

interface Props {
  user: User;
}

type Tab = 'shifts' | 'expenses';

export default function History({ user }: Props) {
  const [tab, setTab] = useState<Tab>('shifts');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year] = useState(getCurrentYear());
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { shifts, loading: shiftsLoading, error: shiftsError } = useShifts(month, year);
  const { expenses, loading: expensesLoading, error: expensesError } = useExpenses(month, year);
  const canManagePayroll = useMemo(() => hasPermission(user, 'can_view_team_payroll'), [user]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    if (!canManagePayroll) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    const loadSummary = async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(null);
        const data = await getPayrollSummary(month, year);
        setSummary(data);
      } catch (error) {
        setSummary(null);
        setSummaryError(error instanceof Error ? error.message : 'Не удалось загрузить payroll summary');
      } finally {
        setSummaryLoading(false);
      }
    };

    loadSummary();
  }, [canManagePayroll, month, year]);

  const handleExport = async () => {
    try {
      setExportLoading(true);
      setExportError(null);
      const blob = await downloadPayrollExport(month, year);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shifttracker-${year}-${String(month).padStart(2, '0')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Не удалось скачать отчет');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold mb-4">История</h1>

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

      {canManagePayroll && (
        <div className="space-y-3 mb-4">
          {summaryLoading ? (
            <div className="bg-tg-secondary-bg rounded-2xl p-4 animate-pulse">
              <div className="h-4 w-40 bg-tg-bg/70 rounded mb-3" />
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-tg-bg/70" />
                ))}
              </div>
            </div>
          ) : summaryError ? (
            <div className="bg-tg-secondary-bg rounded-2xl p-4">
              <p className="text-sm font-medium text-tg-text">Payroll summary недоступен</p>
              <p className="text-xs text-red-400 mt-1">{summaryError}</p>
            </div>
          ) : summary ? (
            <div className="bg-tg-secondary-bg rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm text-tg-hint">Payroll summary за {getMonthName(month)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Wallet className="w-4 h-4 text-tg-primary" />
                    <p className="text-xl font-semibold text-tg-text">
                      {formatCurrency(summary.total_payout)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-tg-hint">Сотрудников</p>
                  <p className="text-sm font-medium text-tg-text">{summary.employees_count}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-tg-bg rounded-xl p-3">
                  <p className="text-xs text-tg-hint">Подтверждено смен</p>
                  <p className="text-sm font-semibold text-tg-text">{summary.approved_shifts_count}</p>
                </div>
                <div className="bg-tg-bg rounded-xl p-3">
                  <p className="text-xs text-tg-hint">Ждут проверки</p>
                  <p className="text-sm font-semibold text-tg-text">{summary.pending_shifts_count}</p>
                </div>
                <div className="bg-tg-bg rounded-xl p-3">
                  <p className="text-xs text-tg-hint">Часы</p>
                  <p className="text-sm font-semibold text-tg-text">{formatHours(summary.total_hours)}</p>
                </div>
                <div className="bg-tg-bg rounded-xl p-3">
                  <p className="text-xs text-tg-hint">Бонусы / штрафы</p>
                  <p className="text-sm font-semibold text-tg-text">
                    {formatCurrency(summary.total_bonuses)} / {formatCurrency(summary.total_penalties)}
                  </p>
                </div>
              </div>

              {summary.rows.length > 0 && (
                <div className="space-y-2">
                  {summary.rows.slice(0, 5).map((row) => (
                    <div key={row.user_id} className="bg-tg-bg rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-tg-text truncate">{row.user_name}</p>
                        <p className="text-xs text-tg-hint">
                          {row.approved_shifts_count} смен · {formatHours(row.total_hours)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-tg-text shrink-0">
                        {formatCurrency(row.total_payout)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleExport}
            disabled={exportLoading}
            className="w-full bg-tg-secondary-bg text-tg-text py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {exportLoading ? (
              <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Скачать отчет за {getMonthName(month)} (.xlsx)
          </button>
          {exportError && <p className="text-xs text-red-400">{exportError}</p>}
        </div>
      )}

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

      {tab === 'shifts' ? (
        shiftsLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-tg-secondary-bg rounded-xl" />
            ))}
          </div>
        ) : shiftsError ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-sm mb-2">Ошибка загрузки</p>
            <p className="text-tg-hint text-xs">{shiftsError}</p>
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
      ) : expensesLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-tg-secondary-bg rounded-xl" />
          ))}
        </div>
      ) : expensesError ? (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm mb-2">Ошибка загрузки</p>
          <p className="text-tg-hint text-xs">{expensesError}</p>
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
      )}
    </div>
  );
}
