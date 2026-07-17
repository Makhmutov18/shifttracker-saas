export type PermissionKey =
  | 'can_approve_shifts'
  | 'can_view_team_shifts'
  | 'can_edit_team_shifts'
  | 'can_view_team_payroll'
  | 'can_export_payroll'
  | 'can_manage_team'
  | 'can_manage_adjustments'
  | 'can_manage_expenses';

export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

export interface Venue {
  id: string;
  name: string;
  is_active: boolean;
}

export interface User {
  id: string;
  telegram_id?: number | null;
  telegram_photo_url?: string | null;
  name: string;
  position?: string | null;
  role: string;
  venue_id?: string | null;
  venue?: Venue | null;
  hourly_rate: string;
  revenue_percentage: string;
  permissions: PermissionMap;
  pay_model: string;
  is_active: boolean;
}

export interface Shift {
  id: string;
  user_id: string;
  venue_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  total_hours: string;
  salary_earned: string;
  revenue?: string | null;
  status: string;
  comment?: string | null;
  created_at: string;
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
  venue_id?: string | null;
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
  venue_id?: string | null;
  venue_name?: string | null;
  status: string;
  employees_count: number;
  total_amount: string;
  total_paid: string;
  created_by_id: string;
  created_by_name?: string | null;
  created_at: string;
}

export interface PayrollRunItem {
  id: string;
  user_id: string;
  user_name?: string | null;
  approved_shifts_count: number;
  approved_hours: string;
  base_amount: string;
  bonus_amount: string;
  deduction_amount: string;
  final_amount: string;
  paid_amount: string;
  remaining_amount: string;
}

export interface PayrollPayment {
  id: string;
  user_id: string;
  amount: string;
  payment_date: string;
  method?: string | null;
  comment?: string | null;
  created_at: string;
}

export interface PayrollRun extends PayrollRunListItem {
  finalized_at?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  items: PayrollRunItem[];
  payments: PayrollPayment[];
}

export interface AuditLog {
  id: string;
  user_id: string;
  target_user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  created_at: string;
  user_name?: string | null;
  target_user_name?: string | null;
}

export interface InviteResult {
  token: string;
  invite_link: string;
  user_id: string;
}
