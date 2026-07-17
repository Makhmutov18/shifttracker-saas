import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Gift, MapPin, MinusCircle, Monitor, Moon, SunMedium, Wallet } from 'lucide-react';
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
import { formatCurrency, formatHours, getCurrentMonth, getMonthName } from '../utils/helpers';
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
  admin: 'Администратор',
  senior: 'Старший',
  barista: 'Бариста',
  cook: 'Повар',
  senior_cook: 'Шеф-повар',
};

const PAY_MODEL_LABELS: Record<string, string> = {
  hourly: 'Почасовая',
  fixed_shift: 'Фикс за смену',
  revenue: 'Процент от выручки',
  hybrid: 'Почасовая + процент',
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  user_updated: 'Данные сотрудника изменены',
  user_deactivated: 'Сотрудник архивирован',
  shift_created: 'Смена создана',
  shift_edited: 'Смена отредактирована',
  shift_updated: 'Смена отредактирована',
  shift_approved: 'Смена утверждена',
  shift_rejected: 'Смена отклонена',
};

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'system', label: 'Системная', icon: <Monitor className="h-4 w-4" aria-hidden="true" /> },
  { value: 'light', label: 'Светлая', icon: <SunMedium className="h-4 w-4" aria-hidden="true" /> },
  { value: 'dark', label: 'Тёмная', icon: <Moon className="h-4 w-4" aria-hidden="true" /> },
];

function getRateLabel(user: UserType) {
  if (user.pay_model === 'fixed_shift') return `${formatCurrency(user.hourly_rate)}/смена`;
  if (user.pay_model === 'revenue') return `${user.revenue_percentage || '0'}% от выручки`;
  if (user.pay_model === 'hybrid') return `${formatCurrency(user.hourly_rate)}/ч + ${user.revenue_percentage || '0'}%`;
  return `${formatCurrency(user.hourly_rate)}/ч`;
}

function getAuditActionLabel(action?: string) {
  return action ? AUDIT_ACTION_LABELS[action] || 'Данные изменены' : 'Данные изменены';
}

function formatAuditTimestamp(value?: string) {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAdjustmentDate(value?: string) {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : date.toLocaleDateString('ru-RU');
}

export default function Profile({ user, themeMode, onThemeModeChange }: Props) {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const telegramUser = getTelegramUser();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfileError(null);
    Promise.all([getMonthlyStats(), getAdjustments()])
      .then(([statsData, adjustmentData]) => {
        if (cancelled) return;
        setStats(statsData);
        const safeAdjustments = Array.isArray(adjustmentData) ? adjustmentData : [];
        setAdjustments(safeAdjustments.filter((adjustment) => !adjustment.user_id || adjustment.user_id === user.id));
      })
      .catch((error) => {
        if (!cancelled) setProfileError(getErrorMessage(error, 'Не удалось загрузить данные профиля.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    setAuditLoading(true);
    setAuditError(null);
    getMyAuditLogs(20)
      .then((data) => {
        if (!cancelled) setAuditLogs(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setAuditLogs([]);
          setAuditError(getErrorMessage(error, 'Не удалось загрузить историю изменений'));
        }
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleAuditLogs = useMemo(() => showAllAudit ? auditLogs : auditLogs.slice(0, 5), [auditLogs, showAllAudit]);
  const roleLabel = ROLE_LABELS[user.role] || 'Сотрудник';
  const positionLabel = user.position?.trim() || roleLabel;
  const venueName = user.venue?.name?.trim() || 'Основная точка';

  return (
    <div className="profile-page mx-auto max-w-lg px-4 pb-6 pt-6">
      <header className="profile-identity">
        <UserAvatar
          name={user.name || 'Сотрудник'}
          photoUrl={user.telegram_photo_url || telegramUser?.photo_url}
          sizeClassName="h-16 w-16"
          textClassName="text-xl"
        />
        <div className="min-w-0">
          <p className="text-sm text-tg-hint">Профиль</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-tg-text">{user.name || 'Сотрудник'}</h1>
          <p className="mt-1 break-words text-sm text-tg-hint">{roleLabel} · {venueName}</p>
        </div>
      </header>

      <section aria-labelledby="profile-work-title">
        <div className="profile-section-heading">
          <h2 id="profile-work-title">Условия работы</h2>
        </div>
        <div className="profile-detail-list">
          <ProfileDetail icon={<MapPin />} label="Точка" value={venueName} />
          <ProfileDetail icon={<BriefcaseBusiness />} label="Должность" value={positionLabel} />
          <ProfileDetail icon={<Wallet />} label="Модель оплаты" value={PAY_MODEL_LABELS[user.pay_model] || 'Не указана'} />
          <ProfileDetail icon={<Wallet />} label="Ставка" value={getRateLabel(user)} />
        </div>
      </section>

      <section aria-labelledby="profile-theme-title">
        <div className="profile-section-heading">
          <h2 id="profile-theme-title">Тема</h2>
        </div>
        <div className="profile-theme-control" role="radiogroup" aria-label="Тема приложения">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={themeMode === option.value}
              data-active={themeMode === option.value}
              onClick={() => onThemeModeChange(option.value)}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="profile-month-title">
        <div className="profile-section-heading">
          <h2 id="profile-month-title">Сводка месяца</h2>
          <span>{getMonthName(getCurrentMonth())}</span>
        </div>
        {loading ? (
          <div className="profile-loading" aria-label="Загружаем сводку"><span /><span /></div>
        ) : profileError ? (
          <div className="profile-state"><p>{profileError}</p></div>
        ) : stats ? (
          <div className="profile-month-summary">
            <div>
              <span>Начислено</span>
              <strong>{formatCurrency(stats.total_payout)}</strong>
            </div>
            <div className="profile-month-facts">
              <span>{formatHours(stats.total_hours)}</span>
              <span>{stats.shifts_count} смен</span>
              {parseFloat(String(stats.total_bonuses)) > 0 && <span>Бонусы +{formatCurrency(stats.total_bonuses)}</span>}
              {parseFloat(String(stats.total_penalties)) > 0 && <span>Удержания −{formatCurrency(stats.total_penalties)}</span>}
            </div>
          </div>
        ) : (
          <div className="profile-state"><p>Сводка пока недоступна</p></div>
        )}
      </section>

      <section aria-labelledby="profile-adjustments-title">
        <div className="profile-section-heading">
          <h2 id="profile-adjustments-title">Бонусы и удержания</h2>
        </div>
        {loading ? (
          <div className="profile-loading" aria-label="Загружаем корректировки"><span /><span /></div>
        ) : adjustments.length > 0 ? (
          <div className="profile-list">
            {adjustments.map((adjustment) => (
              <article key={adjustment.id} className="profile-adjustment-row">
                <div className="profile-row-icon" aria-hidden="true">
                  {adjustment.type === 'bonus' ? <Gift className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-tg-text">{adjustment.reason || (adjustment.type === 'bonus' ? 'Бонус' : 'Удержание')}</p>
                  <p className="mt-1 text-sm text-tg-hint">
                    {formatAdjustmentDate(adjustment.created_at)}{adjustment.creator_name ? ` · ${adjustment.creator_name}` : ''}
                  </p>
                </div>
                <strong>{adjustment.type === 'bonus' ? '+' : '−'}{formatCurrency(adjustment.amount)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="profile-state">
            <p className="font-medium text-tg-text">Бонусов и удержаний пока нет</p>
            <p>Новые корректировки появятся здесь.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="profile-audit-title">
        <div className="profile-section-heading">
          <h2 id="profile-audit-title">История изменений</h2>
        </div>
        {auditLoading ? (
          <div className="profile-loading" aria-label="Загружаем историю изменений"><span /><span /></div>
        ) : auditError ? (
          <div className="profile-state">
            <p className="font-medium text-tg-text">Не удалось загрузить историю изменений</p>
            <p>{auditError}</p>
          </div>
        ) : visibleAuditLogs.length > 0 ? (
          <>
            <div className="profile-list">
              {visibleAuditLogs.map((log) => (
                <article key={log.id} className="profile-audit-row">
                  <p className="font-medium text-tg-text">{getAuditActionLabel(log.action)}</p>
                  <p className="mt-1 text-sm text-tg-hint">
                    {formatAuditTimestamp(log.created_at)}{log.user_name ? ` · ${log.user_name}` : ''}
                  </p>
                </article>
              ))}
            </div>
            {auditLogs.length > 5 && (
              <button type="button" className="profile-show-all" onClick={() => setShowAllAudit((value) => !value)}>
                {showAllAudit ? 'Показать последние' : 'Показать все'}
              </button>
            )}
          </>
        ) : (
          <div className="profile-state">
            <p className="font-medium text-tg-text">Изменений пока нет</p>
            <p>Изменения ваших данных и смен появятся здесь.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileDetail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="profile-detail-row">
      <span className="profile-row-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
