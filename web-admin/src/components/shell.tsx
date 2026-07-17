import React, { type ReactNode } from 'react';
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { User, Venue } from '../types';
import { hasPermission, roleLabels } from '../utils';
import { SearchSelect } from './ui';

export type RoutePath = '/overview' | '/shifts' | '/payroll' | '/employees' | '/venues' | '/audit';

const navigation: Array<{ path: RoutePath; label: string; icon: typeof LayoutDashboard }> = [
  { path: '/overview', label: 'Обзор', icon: LayoutDashboard },
  { path: '/shifts', label: 'Смены', icon: CalendarClock },
  { path: '/payroll', label: 'Расчёты выплат', icon: ClipboardCheck },
  { path: '/employees', label: 'Команда', icon: Users },
  { path: '/venues', label: 'Точки', icon: Building2 },
  { path: '/audit', label: 'История действий', icon: History },
];

function userRoleLabel(user: User): string {
  return roleLabels[user.role] ?? 'Сотрудник';
}

export function Sidebar({
  route,
  user,
  venueLabel,
  onNavigate,
  open,
  onClose,
}: {
  route: RoutePath;
  user: User;
  venueLabel: string;
  onNavigate: (path: RoutePath) => void;
  open: boolean;
  onClose: () => void;
}) {
  return <>
    <div className={`sidebar-backdrop ${open ? 'visible' : ''}`} onClick={onClose} />
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">П</div>
        <div className="brand-copy"><strong>Порядок.Смены</strong><span>Управление</span></div>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Закрыть меню"><X /></button>
      </div>
      <nav aria-label="Основная навигация">
        <span className="nav-caption">Рабочее пространство</span>
        {navigation.filter(({ path }) => canOpen(path, user)).map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            className={route === path ? 'active' : ''}
            aria-current={route === path ? 'page' : undefined}
            onClick={() => { onNavigate(path); onClose(); }}
          >
            <Icon /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <Building2 />
        <div><span>Текущий контекст</span><strong title={venueLabel}>{venueLabel}</strong></div>
      </div>
    </aside>
  </>;
}

export function TopBar({
  venues,
  venueId,
  onVenue,
  user,
  theme,
  onTheme,
  onLogout,
  onMenu,
  action,
}: {
  venues: Venue[];
  venueId: string;
  onVenue: (value: string) => void;
  user: User;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onLogout: () => void;
  onMenu: () => void;
  action?: ReactNode;
}) {
  const roleLabel = userRoleLabel(user);
  const photoUrl = user.telegram_photo_url?.trim() ?? '';
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setAvatarFailed(false), [photoUrl]);
  React.useEffect(() => {
    if (!userMenuOpen) return;
    const closeOutside = (event: MouseEvent) => { if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [userMenuOpen]);
  return <header className="topbar">
    <div className="topbar-left">
      <button className="icon-button menu-button" onClick={onMenu} aria-label="Открыть меню"><Menu /></button>
      <div className="topbar-venue-filter">
        <Building2 />
        <div className="topbar-venue-copy"><span>Точка</span><SearchSelect value={venueId} onChange={onVenue} placeholder="Все точки" options={(venues ?? []).filter((venue) => venue.is_active).map((venue) => ({ value: venue.id, label: venue.name }))} /></div>
      </div>
    </div>
    <div className="topbar-right">
      {action}
      <div className={`user-menu ${userMenuOpen ? 'open' : ''}`} ref={userMenuRef}>
        <button className="user-menu-trigger" aria-label="Меню пользователя" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((value) => !value)}>
          <span className="avatar topbar-avatar">
            {photoUrl && !avatarFailed
              ? <img src={photoUrl} alt={user.name || 'Пользователь'} onError={() => setAvatarFailed(true)} />
              : (user.name || 'П').slice(0, 1).toUpperCase()}
          </span>
          <span className="user-menu-copy"><strong>{user.name || 'Пользователь'}</strong></span>
          <ChevronDown />
        </button>
        {userMenuOpen && <div className="user-menu-popover">
          <div className="user-menu-heading"><strong>{user.name || 'Пользователь'}</strong><span>{roleLabel}</span></div>
          <button onClick={() => { onTheme(); setUserMenuOpen(false); }}>{theme === 'dark' ? <Moon /> : <Sun />}<span><strong>Тема интерфейса</strong><small>{theme === 'dark' ? 'Тёмная' : 'Светлая'}</small></span></button>
          <div className="user-menu-divider" />
          <button className="logout-button" onClick={onLogout}><LogOut /><span>Выйти</span></button>
        </div>}
      </div>
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
  action?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const venueLabel = venueId ? venues.find((venue) => venue.id === venueId)?.name ?? 'Точка' : 'Все точки';
  return <div className="app-shell">
    <Sidebar route={route} user={user} venueLabel={venueLabel} onNavigate={onNavigate} open={menuOpen} onClose={() => setMenuOpen(false)} />
    <main>
      <TopBar venues={venues} venueId={venueId} onVenue={onVenue} user={user} theme={theme} onTheme={onTheme} onLogout={onLogout} onMenu={() => setMenuOpen(true)} action={action} />
      <div className="content">{children}</div>
    </main>
  </div>;
}

export function canOpen(path: RoutePath, user: User): boolean {
  if (path === '/overview') return true;
  if (path === '/shifts') return hasPermission(user, 'can_view_team_shifts') || hasPermission(user, 'can_approve_shifts') || hasPermission(user, 'can_edit_team_shifts');
  if (path === '/payroll') return hasPermission(user, 'can_view_team_payroll');
  return hasPermission(user, 'can_manage_team');
}
