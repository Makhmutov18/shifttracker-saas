import { useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { api } from './api';
import { resolveAuth } from './auth';
import { AppShell, canOpen, type RoutePath } from './components/shell';
import { ErrorState, LoadingState } from './components/ui';
import { AuditPage } from './pages/Audit';
import { EmployeesPage } from './pages/Employees';
import { Overview } from './pages/Overview';
import { PayrollPage } from './pages/Payroll';
import { ShiftsPage } from './pages/Shifts';
import { VenuesPage } from './pages/Venues';
import type { User, Venue } from './types';
import { hasPermission } from './utils';

const titles: Record<RoutePath, string> = { '/overview': 'Обзор', '/shifts': 'Смены', '/payroll': 'Расчёты выплат', '/employees': 'Команда', '/venues': 'Точки', '/audit': 'История действий' };
const routes = Object.keys(titles) as RoutePath[];

function currentRoute(): RoutePath {
  const path = window.location.pathname as RoutePath;
  return routes.includes(path) ? path : '/overview';
}

export default function App() {
  const auth = resolveAuth();
  const [user, setUser] = useState<User | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [route, setRoute] = useState<RoutePath>(currentRoute());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('web-admin-theme') === 'dark' ? 'dark' : 'light');
  const [loading, setLoading] = useState(auth.source !== 'unavailable');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const currentUser = await api.me();
      setUser(currentUser);
      if (hasPermission(currentUser, 'can_manage_team')) {
        try { setVenues(await api.venues(true)); } catch { setVenues(currentUser.venue ? [currentUser.venue] : []); }
      } else {
        setVenues(currentUser.venue ? [currentUser.venue] : []);
        setVenueId(currentUser.venue_id || '');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть web-админку.');
    } finally { setLoading(false); }
  };

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('web-admin-theme', theme); }, [theme]);
  useEffect(() => { const listener = () => setRoute(currentRoute()); window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }, []);
  useEffect(() => { if (auth.source !== 'unavailable') void load(); }, []);
  useEffect(() => { if (user && !canOpen(route, user)) navigate('/overview'); }, [route, user]);

  const navigate = (path: RoutePath) => { window.history.pushState({}, '', path); setRoute(path); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (auth.source === 'unavailable') return <div className="auth-gate"><LockKeyhole /><h1>Веб-вход пока не настроен</h1><p>Откройте админку через Telegram. В production вход без подтверждённого Telegram initData отключён.</p></div>;
  if (loading) return <LoadingState text="Проверяем доступ…" />;
  if (error || !user) return <ErrorState message={error || 'Пользователь не найден.'} retry={load} />;

  const page = route === '/overview' ? <Overview user={user} venues={venues} venueId={venueId} navigate={navigate} />
    : route === '/shifts' ? <ShiftsPage user={user} venues={venues} venueId={venueId} />
    : route === '/payroll' ? <PayrollPage user={user} venues={venues} venueId={venueId} />
    : route === '/employees' ? <EmployeesPage user={user} venues={venues} venueId={venueId} />
    : route === '/venues' ? <VenuesPage />
    : <AuditPage />;

  return <AppShell route={route} user={user} venues={venues} venueId={venueId} onVenue={setVenueId} theme={theme} onTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} onNavigate={navigate} title={titles[route]}>{page}</AppShell>;
}
