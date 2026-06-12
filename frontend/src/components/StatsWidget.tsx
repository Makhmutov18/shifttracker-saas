import React from 'react';
import { Wallet, Clock, Coffee, CreditCard } from 'lucide-react';
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
        <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
          <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const items = [
    {
      label: 'Заработано',
      value: formatCurrency(stats.total_earned),
      icon: <Wallet className="w-5 h-5" />,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: 'Часов отработано',
      value: formatHours(stats.total_hours),
      icon: <Clock className="w-5 h-5" />,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Часы за кассой',
      value: formatHours(stats.total_cashier_hours),
      icon: <Coffee className="w-5 h-5" />,
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      label: 'Расходы',
      value: formatCurrency(stats.total_expenses),
      icon: <CreditCard className="w-5 h-5" />,
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Main stat card */}
      <div className="bg-gradient-to-br from-tg-primary to-blue-600 rounded-2xl p-5 text-white">
        <p className="text-sm opacity-80 mb-1">Заработано за месяц</p>
        <p className="text-3xl font-bold">{formatCurrency(stats.total_earned)}</p>
        <div className="flex items-center gap-2 mt-2 text-sm opacity-80">
          <Clock className="w-4 h-4" />
          <span>{formatHours(stats.total_hours)}</span>
          <span className="mx-1">·</span>
          <span>{stats.shifts_count} смен</span>
        </div>
      </div>

      {/* Grid stats */}
      <div className="grid grid-cols-2 gap-3">
        {items.slice(1).map((item) => (
          <div
            key={item.label}
            className={`${item.bg} rounded-xl p-4`}
          >
            <div className={`${item.color} mb-2`}>{item.icon}</div>
            <p className="text-tg-hint text-xs mb-1">{item.label}</p>
            <p className="text-tg-text font-semibold text-sm">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}