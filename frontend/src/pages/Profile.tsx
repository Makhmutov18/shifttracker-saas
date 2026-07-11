import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Clock, Wallet, Gift, AlertTriangle, Monitor, Moon, SunMedium } from 'lucide-react';
import {
  User as UserType,
  Adjustment,
  AuditLog,
  getAdjustments,
  getErrorMessage,
  getMonthlyStats,
  getMyAuditLogs,
  MonthlyStats,
} from '../utils/api';
import { formatCurrency, formatHours, getMonthName, getCurrentMonth } from '../utils/helpers';
import { canAccessOwnerPanel } from '../utils/permissions';
import { getTelegramUser } from '../utils/telegram';
import type { ThemeMode } from '../hooks/useTelegramTheme';
import UserAvatar from '../components/UserAvatar';

interface Props {
  user: UserType;
  onBack: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Админ',
  senior: 'Старший',
  barista: 'Бариста',
  cook: 'Повар',
  senior_cook: 'Шеф-повар',
};

const PAY_MODEL_LABELS: Record<string, string> = {
  hourly: 'Почасовая',
  fixed_shift: 'Фикс за смену',
  revenue: '% от выручки',
  hybrid: 'Почасовая + %',
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  user_updated: 'Данные сотрудника изменены',
  user_deactivated: 'Сотрудник архивирован',
  shift_created: 'Смена создана',
  shift_edited: 'Смена отредактирована',
  shift_approved: 'Смена утверждена',
  shift_rejected: 'Смена отклонена',
};

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'Системная', icon: <Monitor className="w-4 h-4" /> },
  { value: 'light', label: 'Светлая', icon: <SunMedium className="w-4 h-4" /> },
  { value: 'dark', label: 'Тёмная', icon: <Moon className="w-4 h-4" /> },
];

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

function getAuditActionLabel(action?: string) {
  return action ? AUDIT_ACTION_LABELS[action] || 'Изменение' : 'Изменение';
}

function formatAuditTimestamp(value?: string) {
  if (!value) {
    return 'Дата не указана';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Profile({ user, onBack, themeMode, onThemeModeChange }: Props) {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const isAdminContext = canAccessOwnerPanel(user);
  const telegramUser = getTelegramUser();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, adjData] = await Promise.all([getMonthlyStats(), getAdjustments()]);
        setStats(statsData);
        setAdjustments(adjData);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchAuditLogs = async () => {
      setAuditLoading(true);
      setAuditError(null);

      try {
        const data = await getMyAuditLogs(20);
        if (!cancelled) {
          setAuditLogs(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          setAuditLogs([]);
          setAuditError(getErrorMessage(error, 'Не удалось загрузить историю изменений'));
        }
      } finally {
        if (!cancelled) {
          setAuditLoading(false);
        }
      }
    };

    fetchAuditLogs();

    return () => {
      cancelled = true;
    };
  }, []);

  const netIncome = stats ? parseFloat(stats.total_payout).toFixed(2) : '0.00';

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-tg-secondary-bg transition-colors">
          <ArrowLeft className="w-5 h-5 text-tg-text" />
        </button>
        <h1 className="text-lg font-semibold text-tg-text">Профиль</h1>
      </div>

      <div className="glass-header rounded-[1.4rem] p-5 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <UserAvatar
            name={user.name}
            photoUrl={telegramUser?.photo_url}
            sizeClassName="w-16 h-16"
            textClassName="text-xl"
          />
          <div>
            <h2 className="text-xl font-semibold text-tg-text">{user.name}</h2>
            <p className="text-sm text-tg-hint">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-tg-hint">
            <MapPin className="w-4 h-4" />
            <span>{user.venue?.name || 'Основная точка'}</span>
          </div>
          <div className="flex items-center gap-2 text-tg-hint">
            <Wallet className="w-4 h-4" />
            <span>{getPayModelSummary(user)}</span>
          </div>
          <div className="flex items-center gap-2 text-tg-hint">
            <Clock className="w-4 h-4" />
            <span>Модель: {PAY_MODEL_LABELS[user.pay_model] || user.pay_model}</span>
          </div>
        </div>
      </div>

      <div className="surface-card rounded-[1.4rem] p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-medium text-tg-text">Тема</p>
            <p className="text-xs text-tg-hint">Выберите системную, светлую или тёмную тему</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((option) => {
            const active = themeMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onThemeModeChange(option.value)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  active ? 'bg-tg-primary text-tg-button-text' : 'surface-muted text-tg-text'
                }`}
              >
                {option.icon}
                <span className="text-[11px] leading-none">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3 mb-4">
          <div className="h-32 surface-card rounded-[1.4rem]" />
        </div>
      ) : stats ? (
        <div className="accent-card rounded-[1.4rem] p-5 text-white mb-4">
          <p className="text-sm opacity-80 mb-1">Начислено за {getMonthName(getCurrentMonth())}</p>
          <p className="text-3xl font-bold">{formatCurrency(netIncome)}</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/10 rounded-xl p-3 border border-white/15">
              <p className="text-xs opacity-70">Часы</p>
              <p className="font-semibold">{formatHours(stats.total_hours)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 border border-white/15">
              <p className="text-xs opacity-70">Смены</p>
              <p className="font-semibold">{stats.shifts_count}</p>
            </div>
            {parseFloat(String(stats.total_bonuses)) > 0 ? (
              <div className="bg-white/10 rounded-xl p-3 border border-white/15">
                <p className="text-xs opacity-70">Бонусы</p>
                <p className="font-semibold text-emerald-200">+{formatCurrency(stats.total_bonuses)}</p>
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-3 border border-white/15">
                <p className="text-xs opacity-70">Бонусы</p>
                <p className="font-semibold">Бонусов нет</p>
              </div>
            )}
            {parseFloat(String(stats.total_penalties)) > 0 ? (
              <div className="bg-white/10 rounded-xl p-3 border border-white/15">
                <p className="text-xs opacity-70">Удержания</p>
                <p className="font-semibold text-rose-200">-{formatCurrency(stats.total_penalties)}</p>
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-3 border border-white/15">
                <p className="text-xs opacity-70">Удержания</p>
                <p className="font-semibold">Удержаний нет</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {adjustments.length > 0 ? (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-tg-hint mb-2">Бонусы и удержания за месяц</h3>
          <div className="space-y-2">
            {adjustments.map((adj) => (
              <div key={adj.id} className="surface-card rounded-xl p-3 flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    adj.type === 'bonus' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'
                  }`}
                >
                  {adj.type === 'bonus' ? (
                    <Gift className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-tg-text text-sm">{adj.reason}</p>
                  <p className="text-tg-hint text-xs">
                    {adj.creator_name && `от ${adj.creator_name} · `}
                    {new Date(adj.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    adj.type === 'bonus'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                  }`}
                >
                  {adj.type === 'bonus' ? 'Бонус' : 'Удержание'}
                </span>
                <p className={`font-semibold text-sm ${adj.type === 'bonus' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {adj.type === 'bonus' ? '+' : '-'}
                  {formatCurrency(adj.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-4 surface-card rounded-xl p-4 text-center">
          <p className="text-sm font-medium text-tg-text">Бонусов и удержаний пока нет</p>
          <p className="mt-1 text-xs text-tg-hint">Когда появятся корректировки, они отобразятся здесь.</p>
        </div>
      )}

      <div className="surface-card rounded-[1.4rem] p-4 mb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-tg-text">История изменений</h3>
            <p className="text-xs text-tg-hint">Показываем только события, связанные с вами.</p>
          </div>
        </div>

        {auditLoading ? (
          <div className="space-y-2">
            <div className="h-14 rounded-2xl bg-tg-secondary-bg/70 animate-pulse" />
            <div className="h-14 rounded-2xl bg-tg-secondary-bg/70 animate-pulse" />
          </div>
        ) : auditError ? (
          <div className="rounded-2xl bg-tg-secondary-bg px-4 py-4">
            <p className="text-sm font-medium text-tg-text">Не удалось загрузить историю изменений</p>
            <p className="mt-1 text-sm text-tg-hint">{auditError}</p>
          </div>
        ) : auditLogs.length > 0 ? (
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="rounded-2xl bg-tg-secondary-bg px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-tg-text">{getAuditActionLabel(log.action)}</p>
                    <p className="mt-0.5 text-xs text-tg-hint">
                      {log.user_name ? `Кто изменил: ${log.user_name} · ` : ''}
                      {formatAuditTimestamp(log.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-tg-secondary-bg px-4 py-4">
            <p className="text-sm font-medium text-tg-text">Изменений пока нет</p>
            <p className="mt-1 text-sm text-tg-hint">Когда управляющий изменит ваши данные или смены, они появятся здесь.</p>
          </div>
        )}
      </div>

      {!isAdminContext && (
        <div className="surface-muted mt-4 rounded-2xl p-4">
          <p className="text-sm text-tg-hint">
            История действий и общий журнал изменений доступны в разделе управления для администраторов.
          </p>
        </div>
      )}
    </div>
  );
}
