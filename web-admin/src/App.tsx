import { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { api } from './api';
import { clearWebSession, resolveAuth, setWebSessionReady, type AuthContext } from './auth';
import { AppShell, canOpen, type RoutePath } from './components/shell';
import { ErrorState, LoadingState } from './components/ui';
import { AuditPage } from './pages/Audit';
import { EmployeesPage } from './pages/Employees';
import { Overview } from './pages/Overview';
import { PayrollPage } from './pages/Payroll';
import { ShiftsPage } from './pages/Shifts';
import { VenuesPage } from './pages/Venues';
import type { User, Venue } from './types';
import { currentMonthValue, hasPermission } from './utils';

const titles: Record<RoutePath, string> = { '/overview': 'Обзор', '/shifts': 'Смены', '/payroll': 'Расчёты выплат', '/employees': 'Команда', '/venues': 'Точки', '/audit': 'История действий' };
const routes = Object.keys(titles) as RoutePath[];

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(new Date(year, month - 1, 1));
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
}

function currentRoute(): RoutePath {
  const path = (window.location.pathname.replace(/^\/admin/, '') || '/overview') as RoutePath;
  return routes.includes(path) ? path : '/overview';
}

function authErrorMessage(): string {
  const error = new URLSearchParams(window.location.search).get('auth_error');
  return {
    cancelled: 'Вход отменён.',
    not_registered: 'Пользователь не зарегистрирован в Порядок.Смены.',
    inactive: 'Пользователь деактивирован.',
    no_access: 'У пользователя нет доступа к web-админке.',
    invalid_state: 'Ссылка входа устарела. Начните вход заново.',
    telegram_error: 'Telegram временно недоступен. Попробуйте ещё раз.',
  }[error ?? ''] ?? '';
}

export default function App() {
  const initialAuth = resolveAuth();
  const [auth, setAuth] = useState<AuthContext>(initialAuth);
  const [authLoading, setAuthLoading] = useState(initialAuth.source === 'unavailable');
  const [authError, setAuthError] = useState(authErrorMessage);
  const [user, setUser] = useState<User | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [route, setRoute] = useState<RoutePath>(currentRoute());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('web-admin-theme') === 'dark' ? 'dark' : 'light');
  const [loading, setLoading] = useState(initialAuth.source !== 'unavailable');
  const [error, setError] = useState('');
  const overviewPeriod = currentMonthValue();
  const overviewVenue = venueId ? venues.find((venue) => venue.id === venueId)?.name ?? 'Точка не указана' : 'Все точки';

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
  useEffect(() => {
    if (initialAuth.source !== 'unavailable') return;
    void api.webSession()
      .then((result) => {
        if (result.authenticated) {
          setWebSessionReady(true);
          setAuth(resolveAuth());
          setAuthError('');
        }
      })
      .catch((reason) => setAuthError(reason instanceof Error ? reason.message : 'Telegram временно недоступен.'))
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => { if (auth.source !== 'unavailable') void load(); }, [auth.source]);
  useEffect(() => { if (user && !canOpen(route, user)) navigate('/overview'); }, [route, user]);

  const navigate = (path: RoutePath) => { window.history.pushState({}, '', `/admin${path}`); setRoute(path); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const logout = async () => {
    try { if (auth.source === 'web') await api.logout(); }
    finally { clearWebSession(); setAuth({ source: 'unavailable', initData: '' }); setUser(null); setVenues([]); setAuthError(''); }
  };

  if (authLoading) return <LoadingState text="Проверяем сессию…" />;
  if (auth.source === 'unavailable') return <div className="auth-gate"><div className="auth-mark">П</div><h1>Веб-админка</h1><p>Управляйте сменами, командой, точками и расчётами с ноутбука или планшета.</p>{authError && <div className="notice error">{authError}</div>}<button className="button primary" onClick={() => api.beginWebLogin()}><LogIn />Войти через Telegram</button></div>;
  if (loading) return <LoadingState text="Проверяем доступ…" />;
  if (error || !user) return <ErrorState message={error || 'Пользователь не найден.'} retry={load} />;

  const page = route === '/overview' ? <Overview user={user} venues={venues} venueId={venueId} periodValue={overviewPeriod} navigate={navigate} />
    : route === '/shifts' ? <ShiftsPage user={user} venues={venues} venueId={venueId} />
    : route === '/payroll' ? <PayrollPage user={user} venues={venues} venueId={venueId} />
    : route === '/employees' ? <EmployeesPage user={user} venues={venues} venueId={venueId} />
    : route === '/venues' ? <VenuesPage />
    : <AuditPage />;

  const secondaryContext = route === '/overview' ? `${monthLabel(overviewPeriod)} · ${overviewVenue}` : undefined;
  return <AppShell route={route} user={user} venues={venues} venueId={venueId} onVenue={setVenueId} theme={theme} onTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} onNavigate={navigate} onLogout={() => void logout()} title={titles[route]} secondaryContext={secondaryContext}>{page}</AppShell>;
}
