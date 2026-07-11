import React from 'react';
import { Wallet, Clock, CreditCard, Gift, AlertTriangle } from 'lucide-react';
import { MonthlyStats } from '../utils/api';
import { formatCurrency, formatHours } from '../utils/helpers';

interface Props {
  stats: MonthlyStats;
  loading?: boolean;
}

export default function StatsWidget({ stats, loading }: Props) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-24 surface-card rounded-[1.4rem]" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 surface-muted rounded-[1.15rem]" />
          <div className="h-20 surface-muted rounded-[1.15rem]" />
        </div>
      </div>
    );
  }

  const items = [
    {
      label: 'Часов отработано',
      value: formatHours(stats.total_hours),
      icon: <Clock className="w-5 h-5" />,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Бонусы',
      value: formatCurrency(stats.total_bonuses),
      icon: <Gift className="w-5 h-5" />,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Штрафы',
      value: formatCurrency(stats.total_penalties),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Расходы',
      value: formatCurrency(stats.total_expenses),
      icon: <CreditCard className="w-5 h-5" />,
      color: 'text-rose-600 dark:text-rose-400',
    },
  ];

  const netIncome = parseFloat(stats.total_payout).toFixed(2);

  return (
    <div className="space-y-3">
      <div className="accent-card rounded-[1.4rem] p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm opacity-80 mb-1">Начислено за месяц</p>
            <p className="text-3xl font-bold">{formatCurrency(netIncome)}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm opacity-90">
          <Clock className="w-4 h-4" />
          <span>{formatHours(stats.total_hours)}</span>
          <span className="opacity-60">В·</span>
          <span>{stats.shifts_count} смен</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="surface-muted rounded-[1.15rem] p-4 shadow-sm">
            <div className={`${item.color} mb-2`}>{item.icon}</div>
            <p className="text-tg-hint text-xs mb-1">{item.label}</p>
            <p className="text-tg-text font-semibold text-sm">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
