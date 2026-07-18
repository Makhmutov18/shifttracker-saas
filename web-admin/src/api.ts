import { resolveAuth } from './auth';
import type { AuditLog, InviteResult, PayrollPreview, PayrollRun, PayrollRunListItem, PayrollSummary, Shift, User, Venue, VenueStatsRow } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export type ExportFormat = 'xlsx' | 'csv';

export interface ReportDownloadLink {
  url: string;
  file_name: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorText(status: number, detail?: string): string {
  if (detail) return detail;
  if (status === 401) return 'Сессия не подтверждена. Откройте админку через Telegram.';
  if (status === 403) return 'У вас нет доступа к этому действию.';
  if (status === 404) return 'Запрошенные данные не найдены.';
  if (status === 409) return 'Действие конфликтует с текущим состоянием данных.';
  if (status === 422) return 'Проверьте заполненные поля.';
  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

async function responseError(response: Response): Promise<ApiError> {
  let detail = '';
  try {
    const body = await response.json() as { detail?: string | Array<{ msg?: string }> };
    detail = typeof body.detail === 'string' ? body.detail : body.detail?.map((item) => item.msg).filter(Boolean).join(', ') ?? '';
  } catch {
    detail = '';
  }
  return new ApiError(response.status, errorText(response.status, detail));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = resolveAuth();
  if (auth.source === 'unavailable') throw new ApiError(401, 'Войдите через Telegram, чтобы открыть web-админку.');
  const method = (options.method ?? 'GET').toUpperCase();
  const csrfToken = document.cookie.split('; ').find((item) => item.startsWith('shifttracker_web_csrf='))?.split('=').slice(1).join('=') ?? '';
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(auth.initData ? { 'X-Init-Data': auth.initData } : {}),
      ...(auth.source === 'web' && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && csrfToken ? { 'X-CSRF-Token': decodeURIComponent(csrfToken) } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

export const api = {
  beginWebLogin: () => { window.location.assign(`${API_BASE}/api/web-auth/telegram/start?return_to=/admin/`); },
  webSession: async () => {
    const response = await fetch(`${API_BASE}/api/web-auth/session`, { credentials: 'include' });
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<{ authenticated: boolean; csrf_token?: string }>;
  },
  logout: () => request<{ ok: boolean }>('/api/web-auth/logout', { method: 'POST' }),
  me: () => request<User>('/api/me'),
  shifts: (month: number, year: number, venueId?: string) => request<Shift[]>(`/api/shifts${query({ month, year, venue_id: venueId })}`),
  pendingShifts: () => request<Shift[]>('/api/shifts/pending'),
  updateShift: (id: string, data: Partial<Shift>) => request<Shift>(`/api/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  payrollSummary: (month: number, year: number, venueId?: string) => request<PayrollSummary>(`/api/payroll/summary${query({ month, year, venue_id: venueId })}`),
  payrollPreview: (start: string, end: string, venueId?: string) => request<PayrollPreview>(`/api/payroll-runs/preview${query({ period_start: start, period_end: end, venue_id: venueId })}`),
  payrollRuns: (venueId?: string) => request<PayrollRunListItem[]>(`/api/payroll-runs${query({ venue_id: venueId })}`),
  payrollRun: (id: string) => request<PayrollRun>(`/api/payroll-runs/${id}`),
  createReportDownloadLink: (format: ExportFormat, month: number, year: number, venueId?: string) => request<ReportDownloadLink>('/api/export/download-link', {
    method: 'POST',
    body: JSON.stringify({ format, month, year, venue_id: venueId }),
  }),
  createPayrollRun: (data: { title?: string; period_start: string; period_end: string; venue_id?: string; notes?: string; revenue_total?: number }) => request<PayrollRun>('/api/payroll-runs', { method: 'POST', body: JSON.stringify(data) }),
  updatePayrollRunRevenue: (id: string, revenueTotal: number | null) => request<PayrollRun>(`/api/payroll-runs/${id}/revenue`, { method: 'PATCH', body: JSON.stringify({ revenue_total: revenueTotal }) }),
  finalizePayrollRun: (id: string) => request<PayrollRun>(`/api/payroll-runs/${id}/finalize`, { method: 'POST' }),
  cancelPayrollRun: (id: string) => request<PayrollRun>(`/api/payroll-runs/${id}/cancel`, { method: 'POST' }),
  recordPayrollPayment: (id: string, data: { user_id: string; amount: number; payment_date: string; method?: string; comment?: string }) => request(`/api/payroll-runs/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  users: (includeInactive = true) => request<User[]>(`/api/admin/users${query({ include_inactive: includeInactive })}`),
  createUser: (data: Record<string, unknown>) => request<InviteResult>('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Record<string, unknown>) => request<User>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivateUser: (id: string) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
  venues: (includeInactive = true) => request<Venue[]>(`/api/admin/venues${query({ include_inactive: includeInactive })}`),
  venueStats: (month: number, year: number, includeInactive = false) => request<VenueStatsRow[]>(`/api/venues/stats${query({ month, year, include_inactive: includeInactive })}`),
  createVenue: (name: string) => request<Venue>('/api/admin/venues', { method: 'POST', body: JSON.stringify({ name }) }),
  updateVenue: (id: string, data: { name?: string; is_active?: boolean }) => request<Venue>(`/api/admin/venues/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivateVenue: (id: string) => request(`/api/admin/venues/${id}`, { method: 'DELETE' }),
  audit: (page = 1, limit = 100) => request<AuditLog[]>(`/api/audit-logs${query({ page, limit })}`),
};
