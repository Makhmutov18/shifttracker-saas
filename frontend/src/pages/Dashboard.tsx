import React from 'react';
import { User, Plus } from 'lucide-react';
import { User as UserType } from '../utils/api';
import { useStats } from '../hooks/useStats';
import StatsWidget from '../components/StatsWidget';
import { formatCurrency } from '../utils/helpers';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';

interface Props {
  user: UserType;
  onNavigate: (page: Page) => void;
}

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading } = useStats();

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Profile header */}
      <div
        onClick={() => onNavigate('profile')}
        className="flex items-center justify-between mb-6 cursor-pointer active:scale-[0.98] transition-transform rounded-2xl border border-tg-border bg-tg-secondary-bg p-4 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-tg-primary flex items-center justify-center text-white font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-tg-text">{user.name}</h1>
            <p className="text-sm text-tg-hint">
              {user.venue?.name || 'Заведение'} · {
                user.pay_model === 'hourly'
                  ? `${formatCurrency(user.hourly_rate)}/ч`
                  : user.pay_model === 'revenue'
                  ? `${user.revenue_percentage}% от выручки`
                  : `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage}%`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Current date */}
      <p className="text-sm text-tg-hint mb-4">
        {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Stats */}
      {stats && <StatsWidget stats={stats} loading={loading} />}

      {/* Add shift button */}
      <button
        onClick={() => onNavigate('shift')}
        className="w-full mt-6 bg-tg-primary text-tg-button-text font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Plus className="w-5 h-5" />
        Внести смену
      </button>
    </div>
  );
}
