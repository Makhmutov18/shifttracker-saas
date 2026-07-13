import React, { type ReactNode } from 'react';
import { Building2, CalendarClock, ClipboardCheck, History, LayoutDashboard, Menu, Moon, Sun, Users, X } from 'lucide-react';
import type { User, Venue } from '../types';
import { hasPermission, roleLabels } from '../utils';

export type RoutePath = '/overview' | '/shifts' | '/payroll' | '/employees' | '/venues' | '/audit';

const navigation: Array<{ path: RoutePath; label: string; icon: typeof LayoutDashboard }> = [
  { path: '/overview', label: 'Обзор', icon: LayoutDashboard },
  { path: '/shifts', label: 'Смены', icon: CalendarClock },
  { path: '/payroll', label: 'Расчёты выплат', icon: ClipboardCheck },
  { path: '/employees', label: 'Команда', icon: Users },
  { path: '/venues', label: 'Точки', icon: Building2 },
  { path: '/audit', label: 'История действий', icon: History },
];

export function Sidebar({ route, user, venueLabel, theme, onTheme, onNavigate, open, onClose }: { route: RoutePath; user: User; venueLabel: string; theme: 'light' | 'dark'; onTheme: () => void; onNavigate: (path: RoutePath) => void; open: boolean; onClose: () => void }) {
  return <><div className={`sidebar-backdrop ${open ? 'visible' : ''}`} onClick={onClose} /><aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><div className="brand-mark">П</div><strong>Порядок.Смены</strong><button className="icon-button sidebar-close" onClick={onClose}><X /></button></div>
    <nav>{navigation.filter(({ path }) => canOpen(path, user)).map(({ path, label, icon: Icon }) => <button key={path} className={route === path ? 'active' : ''} onClick={() => { onNavigate(path); onClose(); }}><Icon /><span>{label}</span></button>)}</nav>
    <div className="sidebar-footer">
      <button className="theme-button" onClick={onTheme}>{theme === 'dark' ? <Sun /> : <Moon />}<span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span></button>
      <div className="user-summary"><div className="avatar">{(user.name || 'П').slice(0, 1).toUpperCase()}</div><div><strong>{user.name || 'Пользователь'}</strong><span>{roleLabels[user.role] ?? 'Сотрудник'} · {venueLabel}</span></div></div>
    </div>
  </aside></>;
}

export function TopBar({ title, venues, venueId, onVenue, user, onMenu, action }: { title: string; venues: Venue[]; venueId: string; onVenue: (value: string) => void; user: User; onMenu: () => void; action?: ReactNode }) {
  return <div className="topbar"><button className="icon-button menu-button" onClick={onMenu}><Menu /></button><div className="topbar-title">{title}</div><select aria-label="Фильтр точки" value={venueId} onChange={(event) => onVenue(event.target.value)}><option value="">Все точки</option>{venues.filter((venue) => venue.is_active).map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select><span className="role-indicator">{roleLabels[user.role] ?? 'Сотрудник'}</span>{action}</div>;
}

export function AppShell({ route, user, venues, venueId, onVenue, theme, onTheme, onNavigate, children, title, action }: { route: RoutePath; user: User; venues: Venue[]; venueId: string; onVenue: (value: string) => void; theme: 'light' | 'dark'; onTheme: () => void; onNavigate: (path: RoutePath) => void; children: ReactNode; title: string; action?: ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const venueLabel = venueId ? venues.find((venue) => venue.id === venueId)?.name ?? 'Точка' : 'Все точки';
  return <div className="app-shell"><Sidebar route={route} user={user} venueLabel={venueLabel} theme={theme} onTheme={onTheme} onNavigate={onNavigate} open={menuOpen} onClose={() => setMenuOpen(false)} /><main><TopBar title={title} venues={venues} venueId={venueId} onVenue={onVenue} user={user} onMenu={() => setMenuOpen(true)} action={action} /><div className="content">{children}</div></main></div>;
}

export function canOpen(path: RoutePath, user: User): boolean {
  if (path === '/overview') return true;
  if (path === '/shifts') return hasPermission(user, 'can_view_team_shifts') || hasPermission(user, 'can_approve_shifts') || hasPermission(user, 'can_edit_team_shifts');
  if (path === '/payroll') return hasPermission(user, 'can_view_team_payroll');
  return hasPermission(user, 'can_manage_team');
}
