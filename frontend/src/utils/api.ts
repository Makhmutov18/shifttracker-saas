const API_BASE = '/api';

function getInitData(): string {
  const tg = window.Telegram?.WebApp;
  return tg?.initData || '';
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const initData = getInitData();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Init-Data': initData,
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ─── User ───────────────────────────────────────────────────────────────────

export interface Venue {
  id: string;
  name: string;
}

export interface User {
  id: string;
  telegram_id: number | null;
  name: string;
  role: 'owner' | 'employee';
  venue_id: string;
  hourly_rate: string;
  venue?: Venue;
}

export async function getMe(): Promise<User> {
  return request<User>('/me');
}

// ─── Shifts ─────────────────────────────────────────────────────────────────

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
  status: 'pending' | 'approved';
  comment: string | null;
  created_at: string;
}

export interface ShiftCreate {
  date: string;
  start_time: string;
  end_time: string;
  cashier_hours?: number;
  comment?: string;
}

export interface ShiftUpdate {
  start_time?: string;
  end_time?: string;
  cashier_hours?: number;
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

// ─── Expenses ───────────────────────────────────────────────────────────────

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

// ─── Stats ──────────────────────────────────────────────────────────────────

export interface MonthlyStats {
  total_earned: string;
  total_hours: string;
  total_cashier_hours: string;
  total_expenses: string;
  shifts_count: number;
}

export async function getMonthlyStats(month?: number, year?: number): Promise<MonthlyStats> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year) params.set('year', String(year));
  const qs = params.toString();
  return request<MonthlyStats>(`/stats/monthly${qs ? `?${qs}` : ''}`);
}