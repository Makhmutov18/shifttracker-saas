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
  is_active: boolean;
}

function normalizeVenue(raw: unknown): Venue {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    id: typeof source.id === 'string' ? source.id : '',
    name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Основная точка',
    is_active:
      typeof source.is_active === 'boolean'
        ? source.is_active
        : typeof source.active === 'boolean'
        ? source.active
        : true,
  };
}

export interface User {
  id: string;
  telegram_id: number | null;
  telegram_photo_url?: string | null;
  name: string;
  position: string | null;
  role: 'owner' | 'admin' | 'senior' | 'barista' | 'cook' | 'senior_cook';
  venue_id: string;
  hourly_rate: string;
  revenue_percentage: string;
  permissions: PermissionMap;
  pay_model: 'hourly' | 'fixed_shift' | 'revenue' | 'hybrid';
  is_active: boolean;
  venue?: Venue;
}

const USER_ROLES = ['owner', 'admin', 'senior', 'barista', 'cook', 'senior_cook'] as const;
const PAY_MODELS = ['hourly', 'fixed_shift', 'revenue', 'hybrid'] as const;

function normalizeUserRole(role: unknown): User['role'] {
  return USER_ROLES.includes(role as User['role']) ? (role as User['role']) : 'barista';
}

function normalizePayModel(payModel: unknown): User['pay_model'] {
  if (payModel === 'fixed' || payModel === 'shift') {
    return 'fixed_shift';
  }
  return PAY_MODELS.includes(payModel as User['pay_model']) ? (payModel as User['pay_model']) : 'hourly';
}

function normalizePermissions(permissions: unknown): PermissionMap {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return {};
  }

  return permissions as PermissionMap;
}

function normalizeUser(raw: unknown): User {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    id: typeof source.id === 'string' ? source.id : '',
    telegram_id: typeof source.telegram_id === 'number' ? source.telegram_id : null,
    telegram_photo_url: typeof source.telegram_photo_url === 'string' ? source.telegram_photo_url : null,
    name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Сотрудник',
    position: typeof source.position === 'string' ? source.position : null,
    role: normalizeUserRole(source.role),
    venue_id: typeof source.venue_id === 'string' ? source.venue_id : '',
    hourly_rate: source.hourly_rate == null ? '0' : String(source.hourly_rate),
    revenue_percentage: source.revenue_percentage == null ? '0' : String(source.revenue_percentage),
    permissions: normalizePermissions(source.permissions),
    pay_model: normalizePayModel(source.pay_model ?? source.payment_model),
    is_active:
      typeof source.is_active === 'boolean'
        ? source.is_active
        : typeof source.active === 'boolean'
        ? source.active
        : true,
    venue:
      source.venue && typeof source.venue === 'object'
        ? normalizeVenue(source.venue)
        : undefined,
  };
}

export async function getMe(): Promise<User> {
  const user = await request<User>('/me');
  return normalizeUser(user);
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

const SHIFT_STATUSES = ['pending', 'approved', 'rejected'] as const;

function normalizeShiftStatus(status: unknown): Shift['status'] {
  return SHIFT_STATUSES.includes(status as Shift['status']) ? (status as Shift['status']) : 'pending';
}

function normalizeShift(raw: unknown): Shift {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    id: typeof source.id === 'string' ? source.id : '',
    user_id: typeof source.user_id === 'string' ? source.user_id : '',
    venue_id: typeof source.venue_id === 'string' ? source.venue_id : '',
    date: typeof source.date === 'string' && source.date.trim() ? source.date : '',
    start_time: typeof source.start_time === 'string' ? source.start_time : '',
    end_time: typeof source.end_time === 'string' ? source.end_time : '',
    cashier_hours: source.cashier_hours == null ? null : String(source.cashier_hours),
    total_hours: source.total_hours == null ? '0' : String(source.total_hours),
    salary_earned: source.salary_earned == null ? '0' : String(source.salary_earned),
    revenue: source.revenue == null ? null : String(source.revenue),
    status: normalizeShiftStatus(source.status),
    comment: typeof source.comment === 'string' ? source.comment : null,
    created_at: typeof source.created_at === 'string' ? source.created_at : '',
  };
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
  const shift = await request<Shift>('/shifts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return normalizeShift(shift);
}

export async function getShifts(month?: number, year?: number, venueId?: string): Promise<Shift[]> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  if (venueId) params.set('venue_id', venueId);
  const qs = params.toString();
  const shifts = await request<Shift[]>(`/shifts${qs ? `?${qs}` : ''}`);
  return Array.isArray(shifts) ? shifts.map(normalizeShift) : [];
}

export async function getPendingShifts(): Promise<Shift[]> {
  const shifts = await request<Shift[]>('/shifts/pending');
  return Array.isArray(shifts) ? shifts.map(normalizeShift) : [];
}

export async function updateShift(id: string, data: ShiftUpdate): Promise<Shift> {
  const shift = await request<Shift>(`/shifts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return normalizeShift(shift);
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
  total_payout: string;
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

export async function getPayrollSummary(month?: number, year?: number, venueId?: string): Promise<PayrollSummary> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  if (venueId) params.set('venue_id', String(venueId));
  const qs = params.toString();
  return request<PayrollSummary>(`/payroll/summary${qs ? `?${qs}` : ''}`);
}

export interface PayrollPreviewRow {
  user_id: string;
  user_name: string;
  venue_name: string;
  shifts_count: number;
  total_hours: string;
  base_amount: string;
  bonuses: string;
  deductions: string;
  total_amount: string;
}

export interface PayrollPreview {
  period_start: string;
  period_end: string;
  venue_id: string | null;
  employees_count: number;
  shifts_count: number;
  total_hours: string;
  total_base_amount: string;
  total_bonuses: string;
  total_deductions: string;
  total_amount: string;
  rows: PayrollPreviewRow[];
}

export interface PayrollRunListItem {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  venue_id: string | null;
  venue_name: string | null;
  status: 'draft' | 'finalized' | 'paid' | 'cancelled' | string;
  employees_count: number;
  total_amount: string;
  total_paid: string;
  created_by_id: string;
  created_by_name: string | null;
  created_at: string;
}

export interface PayrollRunItem {
  id: string;
  payroll_run_id: string;
  user_id: string;
  user_name: string | null;
  approved_shifts_count: number;
  approved_hours: string;
  base_amount: string;
  bonus_amount: string;
  deduction_amount: string;
  final_amount: string;
  paid_amount: string;
  remaining_amount: string;
  created_at: string;
}

export interface PayrollRunDetail extends PayrollRunListItem {
  finalized_at: string | null;
  paid_at: string | null;
  notes: string | null;
  items: PayrollRunItem[];
  payments: unknown[];
}

export interface PersonalPayrollPayment {
  amount: string;
  payment_date: string;
  method: string | null;
  comment: string | null;
  created_at: string;
}

export interface PersonalPayrollRun {
  payroll_run_id: string;
  title: string;
  period_start: string;
  period_end: string;
  venue_name: string;
  status: 'finalized' | 'paid' | string;
  final_amount: string;
  paid_amount: string;
  remaining_amount: string;
  payments: PersonalPayrollPayment[];
}

function payrollRunQuery(venueId?: string) {
  const params = new URLSearchParams();
  if (venueId) params.set('venue_id', venueId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function getPayrollRunPreview(
  periodStart: string,
  periodEnd: string,
  venueId?: string,
): Promise<PayrollPreview> {
  const params = new URLSearchParams({ period_start: periodStart, period_end: periodEnd });
  if (venueId) params.set('venue_id', venueId);
  return request<PayrollPreview>(`/payroll-runs/preview?${params.toString()}`);
}

export interface CreatePayrollRunRequest {
  title?: string;
  period_start: string;
  period_end: string;
  venue_id?: string;
  notes?: string;
}

export async function createPayrollRun(data: CreatePayrollRunRequest): Promise<PayrollRunDetail> {
  return request<PayrollRunDetail>('/payroll-runs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPayrollRuns(venueId?: string): Promise<PayrollRunListItem[]> {
  const runs = await request<PayrollRunListItem[]>(`/payroll-runs${payrollRunQuery(venueId)}`);
  return Array.isArray(runs) ? runs : [];
}

export async function getPayrollRun(payrollRunId: string): Promise<PayrollRunDetail> {
  return request<PayrollRunDetail>(`/payroll-runs/${payrollRunId}`);
}

export async function getMyPayrollRuns(): Promise<PersonalPayrollRun[]> {
  const runs = await request<PersonalPayrollRun[]>('/me/payroll-runs');
  return Array.isArray(runs) ? runs : [];
}

export async function finalizePayrollRun(payrollRunId: string): Promise<PayrollRunDetail> {
  return request<PayrollRunDetail>(`/payroll-runs/${payrollRunId}/finalize`, {
    method: 'POST',
  });
}

export async function cancelPayrollRun(payrollRunId: string): Promise<PayrollRunDetail> {
  return request<PayrollRunDetail>(`/payroll-runs/${payrollRunId}/cancel`, {
    method: 'POST',
  });
}

export interface CreatePayrollPaymentRequest {
  user_id: string;
  amount: number;
  payment_date: string;
  method?: string;
  comment?: string;
}

export interface PayrollPaymentResult {
  payment: {
    id: string;
    payroll_run_id: string;
    user_id: string;
    amount: string;
    payment_date: string;
    method: string | null;
    comment: string | null;
    created_by_id: string;
    created_at: string;
  };
  user_id: string;
  paid_amount: string;
  remaining_amount: string;
  total_paid: string;
  status: string;
}

export async function createPayrollPayment(
  payrollRunId: string,
  data: CreatePayrollPaymentRequest,
): Promise<PayrollPaymentResult> {
  return request<PayrollPaymentResult>(`/payroll-runs/${payrollRunId}/payments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Admin

export interface AdminCreateUserRequest {
  first_name: string;
  position?: string;
  role: 'owner' | 'admin' | 'senior' | 'barista' | 'cook' | 'senior_cook';
  venue_id?: string;
  hourly_rate: number;
  revenue_percentage: number;
  pay_model: 'hourly' | 'fixed_shift' | 'revenue' | 'hybrid';
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

export interface VenueCreateRequest {
  name: string;
}

export interface VenueUpdateRequest {
  name?: string;
  is_active?: boolean;
}

export async function getVenues(includeInactive = false): Promise<Venue[]> {
  const params = new URLSearchParams();
  if (includeInactive) params.set('include_inactive', 'true');
  const qs = params.toString();
  const venues = await request<Venue[]>(`/admin/venues${qs ? `?${qs}` : ''}`);
  return Array.isArray(venues) ? venues.map(normalizeVenue) : [];
}

export async function createVenue(data: VenueCreateRequest): Promise<Venue> {
  const venue = await request<Venue>('/admin/venues', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return normalizeVenue(venue);
}

export async function updateVenue(venueId: string, data: VenueUpdateRequest): Promise<Venue> {
  const venue = await request<Venue>(`/admin/venues/${venueId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return normalizeVenue(venue);
}

export async function deactivateVenue(venueId: string): Promise<void> {
  await request(`/admin/venues/${venueId}`, { method: 'DELETE' });
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

export async function getMyAuditLogs(limit?: number): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request<AuditLog[]>(`/me/audit-log${qs ? `?${qs}` : ''}`);
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

export async function getUsers(includeInactive = false): Promise<User[]> {
  const params = new URLSearchParams();
  if (includeInactive) params.set('include_inactive', 'true');
  const qs = params.toString();
  const users = await request<User[]>(`/admin/users${qs ? `?${qs}` : ''}`);
  return Array.isArray(users) ? users.map(normalizeUser) : [];
}

export interface AdminUpdateUser {
  name?: string;
  position?: string;
  role?: 'owner' | 'admin' | 'senior' | 'barista' | 'cook' | 'senior_cook';
  venue_id?: string;
  hourly_rate?: number;
  revenue_percentage?: number;
  pay_model?: 'hourly' | 'fixed_shift' | 'revenue' | 'hybrid';
  is_active?: boolean;
  permissions?: PermissionMap;
}

export async function updateUser(userId: string, data: AdminUpdateUser): Promise<User> {
  const user = await request<User>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return normalizeUser(user);
}

export async function deleteUser(userId: string): Promise<void> {
  await request(`/admin/users/${userId}`, { method: 'DELETE' });
}

// Export

function getDownloadFilename(response: Response, month?: number, year?: number) {
  const fallback = month && year ? `shifttracker-${year}-${String(month).padStart(2, '0')}.xlsx` : 'shifttracker-payroll.xlsx';
  const disposition = response.headers.get('content-disposition') || '';

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return fallback;
}

export async function downloadPayrollExport(month?: number, year?: number, venueId?: string): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  if (venueId) params.set('venue_id', String(venueId));
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

  return {
    blob: await response.blob(),
    filename: getDownloadFilename(response, month, year),
  };
}
