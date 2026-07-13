import type { PermissionKey, User } from './types';

export function hasPermission(user: User | null, permission: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  return Boolean(user.permissions?.[permission]);
}

export function isOwnerOrAdmin(user: User | null): boolean {
  return user?.role === 'owner' || user?.role === 'admin';
}

export function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatNumber(value: string | number | null | undefined, digits = 1): string {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number.isFinite(number) ? number : 0);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Дата не указана';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : date.toLocaleDateString('ru-RU');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : '—';
}

export const roleLabels: Record<string, string> = {
  owner: 'Владелец', admin: 'Администратор', senior: 'Старший', barista: 'Бариста', cook: 'Повар', senior_cook: 'Старший повар',
};

export const payModelLabels: Record<string, string> = {
  hourly: 'Почасовая', fixed_shift: 'Фикс за смену', revenue: 'Процент от выручки', hybrid: 'Почасовая + процент',
};

export const statusLabels: Record<string, string> = {
  pending: 'На подтверждении', approved: 'Утверждена', rejected: 'Отклонена',
  draft: 'Черновик', finalized: 'Зафиксирован', paid: 'Выплачен', cancelled: 'Отменён',
};

export function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthParts(value: string): { month: number; year: number } {
  const [year, month] = value.split('-').map(Number);
  return { month, year };
}

export function monthBounds(value: string): { start: string; end: string } {
  const { month, year } = monthParts(value);
  const end = new Date(year, month, 0).getDate();
  return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: `${year}-${String(month).padStart(2, '0')}-${String(end).padStart(2, '0')}` };
}
