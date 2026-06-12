import React from 'react';
import { User, Plus } from 'lucide-react';
import { User as UserType } from '../utils/api';
import { useStats } from '../hooks/useStats';
import StatsWidget from '../components/StatsWidget';
import { formatCurrency } from '../utils/helpers';

type Page = 'dashboard' | 'shift' | 'history' | 'owner';

interface Props {
  user: UserType;
  onNavigate: (page: Page) => void;
}

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading } = useStats();

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Profile header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-tg-secondary-bg flex items-center justify-center">
            <User className="w-6 h-6 text-tg-hint" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-tg-text">{user.name}</h1>
            <p className="text-sm text-tg-hint">
              {user.venue?.name || 'Заведение'} · {formatCurrency(user.hourly_rate)}/ч
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatsWidget stats={stats!} loading={loading} />

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