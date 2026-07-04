import type { PermissionMap } from './permissions';

const API_BASE = '/api';

function getInitData(): string {
  const tg = window.Telegram?.WebApp;
  return tg?.initData || '';
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function extractErrorMessage(body: string, fallback: string, status: number): string {
  if (!body) {
    return `${fallback}: HTTP ${status}`;
  }

  try {
    const parsed = JSON.parse(body);
    if (typeof parsed === 'string') return parsed || `${fallback}: HTTP ${status}`;
    if (parsed && typeof parsed === 'object') {
      const detail = (parsed as Record<string, unknown>).detail;
      const message = (parsed as Record<string, unknown>).message;
      if (typeof detail === 'string' && detail.trim()) return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        const validationMessage = detail
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const msg = (item as Record<string, unknown>).msg;
            const loc = (item as Record<string, unknown>).loc;
            const formattedLoc = Array.isArray(loc) ? loc.join(' -> ') : '';
            if (typeof msg === 'string' && formattedLoc) return `${formattedLoc}: ${msg}`;
            if (typeof msg === 'string') return msg;
            return null;
          })
          .filter((item): item is string => Boolean(item))
          .join('; ');
        if (validationMessage) return validationMessage;
      }
      if (typeof message === 'string' && message.trim()) return message;
    }
  } catch {
    // ignore parse errors and fall back to raw body
  }

  return body.trim() || `${fallback}: HTTP ${status}`;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const initData = getInitData();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (initData) {
    headers['X-Init-Data'] = initData;
  }

  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(body, 'Не удалось выполнить действие. Попробуйте ещё раз.', response.status));
  }

  if (!body) {
    return undefined as T;
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return body as T;
  }
}

// User

export interface Venue {
  id: string;
  name: string;
}

export interface User {
  id: string;
  telegram_id: number | null;
  name: string;
  role: 'owner' | 'admin' | 'senior' | 'barista' | 'cook' | 'senior_cook';
  venue_id: string;
  hourly_rate: string;
  revenue_percentage: string;
  permissions: PermissionMap;
  pay_model: 'hourly' | 'revenue' | 'hybrid';
  is_active: boolean;
  venue?: Venue;
}

export async function getMe(): Promise<User> {
  return request<User>('/me');
}

// Shifts

export interface Shift {
  id: string;
  user_id: string;
  venue_id: string;
  date: string;
  start_time: string;
  end_time: string;
  cashier_hours: string | null;
  total_hours: string;
  salary_earned: string;
  revenue: string | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  created_at: string;
}

export interface ShiftCreate {
  date: string;
  start_time: string;
  end_time: string;
  cashier_hours?: number;
  revenue?: number;
  comment?: string;
}

export interface ShiftUpdate {
  start_time?: string;
  end_time?: string;
  cashier_hours?: number;
  revenue?: number;
  comment?: string;
  status?: string;
}

export async function createShift(data: ShiftCreate): Promise<Shift> {
  return request<Shift>('/shifts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getShifts(month?: number, year?: number): Promise<Shift[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();
  return request<Shift[]>(`/shifts${qs ? `?${qs}` : ''}`);
}

export async function getPendingShifts(): Promise<Shift[]> {
  return request<Shift[]>('/shifts/pending');
}

export async function updateShift(id: string, data: ShiftUpdate): Promise<Shift> {
  return request<Shift>(`/shifts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Expenses

export interface Expense {
  id: string;
  user_id: string;
  venue_id: string;
  amount: string;
  category: string;
  comment: string | null;
  date: string;
  created_at: string;
}

export interface ExpenseCreate {
  amount: number;
  category: string;
  comment?: string;
  date: string;
}

export async function createExpense(data: ExpenseCreate): Promise<Expense> {
  return request<Expense>('/expenses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getExpenses(month?: number, year?: number): Promise<Expense[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();
  return request<Expense[]>(`/expenses${qs ? `?${qs}` : ''}`);
}

// Stats

export interface MonthlyStats {
  total_earned: string;
  total_hours: string;
  total_cashier_hours: string;
  total_expenses: string;
  total_bonuses: string;
  total_penalties: string;
  shifts_count: number;
}

export interface PayrollSummaryRow {
  user_id: string;
  user_name: string;
  approved_shifts_count: number;
  total_hours: string;
  shift_payout: string;
  bonuses: string;
  penalties: string;
  total_payout: string;
}

export interface PayrollSummary {
  month: number;
  year: number;
  employees_count: number;
  pending_shifts_count: number;
  approved_shifts_count: number;
  total_hours: string;
  total_shift_payout: string;
  total_bonuses: string;
  total_penalties: string;
  total_payout: string;
  rows: PayrollSummaryRow[];
}

export async function getMonthlyStats(month?: number, year?: number): Promise<MonthlyStats> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();
  return request<MonthlyStats>(`/stats/monthly${qs ? `?${qs}` : ''}`);
}

export async function getPayrollSummary(month?: number, year?: number): Promise<PayrollSummary> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();
  return request<PayrollSummary>(`/payroll/summary${qs ? `?${qs}` : ''}`);
}

// Admin

export interface AdminCreateUserRequest {
  first_name: string;
  role: 'owner' | 'admin' | 'senior' | 'barista' | 'cook' | 'senior_cook';
  hourly_rate: number;
  revenue_percentage: number;
  pay_model: 'hourly' | 'revenue' | 'hybrid';
  permissions?: PermissionMap;
}

export interface AdminCreateUserResponse {
  token: string;
  invite_link: string;
  user_id: string;
}

export async function createUser(data: AdminCreateUserRequest): Promise<AdminCreateUserResponse> {
  return request<AdminCreateUserResponse>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Audit Logs

export interface AuditLog {
  id: string;
  user_id: string;
  target_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  created_at: string;
  user_name: string | null;
  target_user_name: string | null;
}

export async function getAuditLogs(page?: number, limit?: number): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request<AuditLog[]>(`/audit-logs${qs ? `?${qs}` : ''}`);
}

// Adjustments

export interface Adjustment {
  id: string;
  user_id: string;
  type: 'bonus' | 'penalty';
  amount: string;
  reason: string;
  created_by: string;
  month: number;
  year: number;
  created_at: string;
  user_name: string | null;
  creator_name: string | null;
}

export interface AdjustmentCreate {
  user_id: string;
  type: 'bonus' | 'penalty';
  amount: number;
  reason: string;
}

export async function createAdjustment(data: AdjustmentCreate): Promise<Adjustment> {
  return request<Adjustment>('/adjustments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAdjustments(month?: number, year?: number): Promise<Adjustment[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();
  return request<Adjustment[]>(`/adjustments${qs ? `?${qs}` : ''}`);
}

// Users (admin)

export async function getUsers(): Promise<User[]> {
  return request<User[]>('/admin/users');
}

export interface AdminUpdateUser {
  name?: string;
  role?: 'owner' | 'admin' | 'senior' | 'barista' | 'cook' | 'senior_cook';
  hourly_rate?: number;
  revenue_percentage?: number;
  pay_model?: 'hourly' | 'revenue' | 'hybrid';
  is_active?: boolean;
  permissions?: PermissionMap;
}

export async function updateUser(userId: string, data: AdminUpdateUser): Promise<User> {
  return request<User>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await request(`/admin/users/${userId}`, { method: 'DELETE' });
}

// Export

export async function downloadPayrollExport(month?: number, year?: number): Promise<Blob> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();

  const response = await fetch(`${API_BASE}/export/xlsx${qs ? `?${qs}` : ''}`, {
    headers: {
      'X-Init-Data': getInitData(),
    },
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(extractErrorMessage(body, 'Не удалось скачать отчет', response.status));
  }

  return response.blob();
}
