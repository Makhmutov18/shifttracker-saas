import React, { type ReactNode } from 'react';
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { User, Venue } from '../types';
import { hasPermission, roleLabels } from '../utils';
import { SearchSelect } from './ui';

export type RoutePath = '/overview' | '/shifts' | '/payroll' | '/employees' | '/venues' | '/audit';

const navigationGroups: Array<{ label: string; items: Array<{ path: RoutePath; label: string; icon: typeof LayoutDashboard }> }> = [
  {
    label: 'Работа',
    items: [
      { path: '/overview', label: 'Обзор', icon: LayoutDashboard },
      { path: '/shifts', label: 'Смены', icon: CalendarClock },
      { path: '/payroll', label: 'Расчёты выплат', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Управление',
    items: [
      { path: '/employees', label: 'Команда', icon: Users },
      { path: '/venues', label: 'Точки', icon: Building2 },
      { path: '/audit', label: 'История действий', icon: History },
    ],
  },
];

function userRoleLabel(user: User): string {
  return roleLabels[user.role] ?? 'Сотрудник';
}

export function Sidebar({
  route,
  user,
  onNavigate,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
  theme,
  onTheme,
  onLogout,
}: {
  route: RoutePath;
  user: User;
  onNavigate: (path: RoutePath) => void;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onLogout: () => void;
}) {
  const roleLabel = userRoleLabel(user);
  const photoUrl = user.telegram_photo_url?.trim() ?? '';
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  React.useEffect(() => setAvatarFailed(false), [photoUrl]);
  return <>
    <div className={`sidebar-backdrop ${open ? 'visible' : ''}`} onClick={onClose} />
    <aside className={`sidebar${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Навигация и профиль">
      <div className="brand">
        <div className="brand-mark">П</div>
        <div className="brand-copy"><strong>Порядок.Смены</strong><span>Управление</span></div>
        <button className="icon-button sidebar-collapse" onClick={onToggleCollapsed} aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Закрыть меню"><X /></button>
      </div>
      <nav className="sidebar-navigation" aria-label="Основная навигация">
        {navigationGroups.map((group) => {
          const items = group.items.filter(({ path }) => canOpen(path, user));
          if (!items.length) return null;
          return <div className="nav-group" key={group.label}>
            <span className="nav-caption">{group.label}</span>
            {items.map(({ path, label, icon: Icon }) => <button
              key={path}
              className={route === path ? 'active' : ''}
              aria-current={route === path ? 'page' : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              onClick={() => { onNavigate(path); onClose(); }}
            >
              <Icon /><span>{label}</span>
            </button>)}
          </div>;
        })}
      </nav>
      <div className="sidebar-account">
        <div className="sidebar-user" title={collapsed ? `${user.name || 'Пользователь'} · ${roleLabel}` : undefined}>
          <span className="avatar sidebar-avatar">
            {photoUrl && !avatarFailed
              ? <img src={photoUrl} alt={user.name || 'Пользователь'} onError={() => setAvatarFailed(true)} />
              : (user.name || 'П').slice(0, 1).toUpperCase()}
          </span>
          <span className="sidebar-user-copy"><strong>{user.name || 'Пользователь'}</strong><small>{roleLabel}</small></span>
        </div>
        <div className="sidebar-account-actions">
          <button type="button" onClick={onTheme} aria-label={`Тема интерфейса: ${theme === 'dark' ? 'тёмная' : 'светлая'}`} title={collapsed ? 'Тема интерфейса' : undefined}>{theme === 'dark' ? <Moon /> : <Sun />}<span><strong>Тема интерфейса</strong><small>{theme === 'dark' ? 'Тёмная' : 'Светлая'}</small></span></button>
          <button className="sidebar-logout" type="button" onClick={onLogout} aria-label="Выйти" title={collapsed ? 'Выйти' : undefined}><LogOut /><span>Выйти</span></button>
        </div>
      </div>
    </aside>
  </>;
}

export function TopBar({
  venues,
  venueId,
  onVenue,
  onMenu,
  title,
  secondaryContext,
  action,
}: {
  venues: Venue[];
  venueId: string;
  onVenue: (value: string) => void;
  onMenu: () => void;
  title: string;
  secondaryContext?: string;
  action?: ReactNode;
}) {
  return <header className="topbar">
    <div className="topbar-left">
      <button className="icon-button menu-button" onClick={onMenu} aria-label="Открыть меню"><Menu /></button>
      <div className="topbar-heading">
        <strong className="topbar-title">{title}</strong>
        {secondaryContext && <span className="topbar-secondary">{secondaryContext}</span>}
      </div>
    </div>
    <div className="topbar-right">
      <div className="topbar-venue-filter">
        <Building2 />
        <div className="topbar-venue-copy"><span>Точка</span><SearchSelect value={venueId} onChange={onVenue} placeholder="Все точки" options={(venues ?? []).filter((venue) => venue.is_active).map((venue) => ({ value: venue.id, label: venue.name }))} /></div>
      </div>
      {action}
    </div>
  </header>;
}

export function AppShell({
  route,
  user,
  venues,
  venueId,
  onVenue,
  theme,
  onTheme,
  onNavigate,
  onLogout,
  children,
  title,
  secondaryContext,
  action,
}: {
  route: RoutePath;
  user: User;
  venues: Venue[];
  venueId: string;
  onVenue: (value: string) => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onNavigate: (path: RoutePath) => void;
  onLogout: () => void;
  children: ReactNode;
  title: string;
  secondaryContext?: string;
  action?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  return <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
    <Sidebar route={route} user={user} onNavigate={onNavigate} open={menuOpen} onClose={() => setMenuOpen(false)} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((value) => !value)} theme={theme} onTheme={onTheme} onLogout={onLogout} />
    <main>
      <div className="workspace">
        <TopBar venues={venues} venueId={venueId} onVenue={onVenue} onMenu={() => setMenuOpen(true)} title={title} secondaryContext={secondaryContext} action={action} />
        <div className="content">{children}</div>
      </div>
    </main>
  </div>;
}

export function canOpen(path: RoutePath, user: User): boolean {
  if (path === '/overview') return true;
  if (path === '/shifts') return hasPermission(user, 'can_view_team_shifts') || hasPermission(user, 'can_approve_shifts') || hasPermission(user, 'can_edit_team_shifts');
  if (path === '/payroll') return hasPermission(user, 'can_view_team_payroll');
  return hasPermission(user, 'can_manage_team');
}
