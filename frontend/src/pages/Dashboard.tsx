import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Store, Users, BadgeCheck, Wallet, Sparkles, Clock3 } from 'lucide-react';
import { User as UserType, getShifts, getUsers, getVenues, Shift } from '../utils/api';
import { useStats } from '../hooks/useStats';
import StatsWidget from '../components/StatsWidget';
import { formatCurrency } from '../utils/helpers';
import { getTelegramUser } from '../utils/telegram';
import UserAvatar from '../components/UserAvatar';
import { canAccessOwnerPanel, hasPermission } from '../utils/permissions';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';

interface Props {
  user: UserType;
  onNavigate: (page: Page) => void;
}

function getPayModelSummary(user: UserType) {
  if (user.pay_model === 'hourly') {
    return `${formatCurrency(user.hourly_rate)}/ч`;
  }
  if (user.pay_model === 'fixed_shift') {
    return `${formatCurrency(user.hourly_rate)}/смена`;
  }
  if (user.pay_model === 'revenue') {
    return `${user.revenue_percentage}% от выручки`;
  }
  return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage}%`;
}

type ChecklistItem = {
  label: string;
  done: boolean;
  hint: string;
  icon: React.ReactNode;
};

export default function Dashboard({ user, onNavigate }: Props) {
  const { stats, loading } = useStats();
  const telegramUser = getTelegramUser();
  const isOwnerPanelUser = canAccessOwnerPanel(user);
  const [venuesCount, setVenuesCount] = useState<number | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    if (!isOwnerPanelUser) {
      setVenuesCount(null);
      setTeamCount(null);
      setShifts([]);
      return;
    }

    let cancelled = false;

    const loadChecklistData = async () => {
      try {
        const [venuesData, usersData, shiftsData] = await Promise.allSettled([
          getVenues(true),
          getUsers(true),
          getShifts(),
        ]);

        if (cancelled) return;

        setVenuesCount(venuesData.status === 'fulfilled' && Array.isArray(venuesData.value) ? venuesData.value.length : null);
        setTeamCount(usersData.status === 'fulfilled' && Array.isArray(usersData.value) ? usersData.value.length : null);
        setShifts(shiftsData.status === 'fulfilled' && Array.isArray(shiftsData.value) ? shiftsData.value : []);
      } catch {
        if (!cancelled) {
          setVenuesCount(null);
          setTeamCount(null);
          setShifts([]);
        }
      }
    };

    loadChecklistData();

    return () => {
      cancelled = true;
    };
  }, [isOwnerPanelUser, user.venue_id]);

  const checklist = useMemo<ChecklistItem[]>(() => {
    const hasVenue = (venuesCount ?? 0) > 0 || Boolean(user.venue_id || user.venue?.name);
    const hasEmployees = (teamCount ?? 0) > 1;
    const hasRate = Boolean(user.hourly_rate && Number(user.hourly_rate) > 0);
    const hasFirstShift = shifts.length > 0;
    const hasApprovedShift = shifts.some((shift) => shift.status === 'approved');
    const canSeePayouts = hasPermission(user, 'can_view_team_payroll') || hasApprovedShift;

    return [
      {
        label: 'Создана точка',
        done: hasVenue,
        hint: hasVenue ? 'Точка уже привязана к рабочему пространству.' : 'Пока можно начать с первой точки.',
        icon: <Store className="h-4 w-4" />,
      },
      {
        label: 'Добавлен сотрудник',
        done: hasEmployees,
        hint: hasEmployees ? `Сейчас в команде ${teamCount} человек.` : 'Добавьте первого сотрудника, чтобы начать работу.',
        icon: <Users className="h-4 w-4" />,
      },
      {
        label: 'Настроена ставка сотрудника',
        done: hasRate,
        hint: hasRate ? `Текущая модель оплаты: ${getPayModelSummary(user)}` : 'Проверьте модель оплаты и ставку.',
        icon: <BadgeCheck className="h-4 w-4" />,
      },
      {
        label: 'Есть первая смена',
        done: hasFirstShift,
        hint: hasFirstShift ? 'Смены уже появились в истории.' : 'Создайте первую смену, чтобы увидеть историю.',
        icon: <Clock3 className="h-4 w-4" />,
      },
      {
        label: 'Есть утверждённая смена',
        done: hasApprovedShift,
        hint: hasApprovedShift ? 'Есть смена, которая уже входит в выплаты.' : 'Утвердите смену, чтобы она попала в выплаты.',
        icon: <CheckCircle2 className="h-4 w-4" />,
      },
      {
        label: 'Можно смотреть выплаты',
        done: canSeePayouts,
        hint: canSeePayouts ? 'Сводка выплат уже доступна.' : 'Нужен доступ к выплатам команды.',
        icon: <Wallet className="h-4 w-4" />,
      },
    ];
  }, [isOwnerPanelUser, shifts, teamCount, user, venuesCount]);

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div
        onClick={() => onNavigate('profile')}
        className="glass-header flex items-center justify-between mb-6 cursor-pointer rounded-[1.4rem] p-4 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-3">
          <UserAvatar
            name={user.name}
            photoUrl={telegramUser?.photo_url}
            sizeClassName="w-12 h-12"
            textClassName="text-sm"
          />
          <div>
            <h1 className="text-lg font-semibold text-tg-text">{user.name}</h1>
            <p className="text-sm text-tg-hint">
              {user.venue?.name || 'Точка'} · {getPayModelSummary(user)}
            </p>
          </div>
        </div>
        <User className="w-5 h-5 text-tg-hint" />
      </div>

      <p className="text-sm text-tg-hint mb-4">
        {new Date().toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>

      {stats && <StatsWidget stats={stats} loading={loading} />}

      {isOwnerPanelUser && (
        <section className="mt-6 surface-card rounded-[1.4rem] p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-tg-text">Первые шаги</p>
              <p className="mt-1 text-xs text-tg-hint">Короткий чеклист для быстрого запуска рабочего пространства.</p>
            </div>
            <Sparkles className="h-5 w-5 text-tg-primary" />
          </div>

          <div className="grid gap-3">
            {checklist.map((item) => (
              <div key={item.label} className="surface-muted rounded-[1.15rem] p-3 flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    item.done ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                  }`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-tg-text">{item.label}</p>
                  <p className="mt-0.5 text-xs text-tg-hint">{item.hint}</p>
                </div>
                <div className={`mt-1 h-2.5 w-2.5 rounded-full ${item.done ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </div>
            ))}
          </div>
        </section>
      )}

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
