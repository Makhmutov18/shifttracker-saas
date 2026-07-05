import React, { useState } from 'react';
import { useTelegramTheme } from './hooks/useTelegramTheme';
import { useUser } from './hooks/useUser';
import Dashboard from './pages/Dashboard';
import ShiftForm from './pages/ShiftForm';
import History from './pages/History';
import OwnerPanel from './pages/OwnerPanel';
import Profile from './pages/Profile';
import LoadingScreen from './components/LoadingScreen';
import ErrorScreen from './components/ErrorScreen';
import BottomNav from './components/BottomNav';
import { canAccessOwnerPanel } from './utils/permissions';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';

export default function App() {
  const { themeMode, setThemeMode } = useTelegramTheme();
  const { user, loading, error } = useUser();
  const [page, setPage] = useState<Page>('dashboard');

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!user) return <ErrorScreen message="Не удалось загрузить пользователя" />;

  const isAdmin = canAccessOwnerPanel(user);

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard user={user} onNavigate={setPage} />;
      case 'shift':
        return (
          <ShiftForm
            user={user}
            onBack={() => setPage('dashboard')}
            onOpenHistory={() => setPage('history')}
          />
        );
      case 'history':
        return <History user={user} />;
      case 'owner':
        return canAccessOwnerPanel(user) ? <OwnerPanel user={user} /> : <Dashboard user={user} onNavigate={setPage} />;
      case 'profile':
        return (
          <Profile
            user={user}
            onBack={() => setPage('dashboard')}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
          />
        );
      default:
        return <Dashboard user={user} onNavigate={setPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]">
      {renderPage()}
      <BottomNav
        currentPage={page}
        onNavigate={setPage}
        isAdmin={isAdmin}
      />
    </div>
  );
}
