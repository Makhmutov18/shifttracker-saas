import React, { useState } from 'react';
import { useTelegramTheme } from './hooks/useTelegramTheme';
import { useUser } from './hooks/useUser';
import Dashboard from './pages/Dashboard';
import ShiftForm from './pages/ShiftForm';
import History from './pages/History';
import OwnerPanel from './pages/OwnerPanel';
import Profile from './pages/Profile';
import Payouts from './pages/Payouts';
import LoadingScreen from './components/LoadingScreen';
import ErrorScreen from './components/ErrorScreen';
import BottomNav from './components/BottomNav';
import { canAccessOwnerPanel } from './utils/permissions';

type Page = 'dashboard' | 'shift' | 'history' | 'payouts' | 'owner' | 'profile';
type OwnerPanelTab = 'invite' | 'approve' | 'adjust' | 'audit' | 'team' | 'venues';
type NavigationOptions = {
  ownerTab?: OwnerPanelTab;
};

export default function App() {
  const { themeMode, setThemeMode } = useTelegramTheme();
  const { user, loading, error } = useUser();
  const [page, setPage] = useState<Page>('dashboard');
  const [ownerTab, setOwnerTab] = useState<OwnerPanelTab | null>(null);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!user) return <ErrorScreen message="Не удалось загрузить пользователя" />;

  const isAdmin = canAccessOwnerPanel(user);
  const handleNavigate = (nextPage: Page, options?: NavigationOptions) => {
    if (nextPage === 'owner') {
      setOwnerTab(options?.ownerTab ?? null);
    } else {
      setOwnerTab(null);
    }
    setPage(nextPage);
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'shift':
        return (
          <ShiftForm
            user={user}
            onBack={() => handleNavigate('dashboard')}
            onOpenHistory={() => handleNavigate('history')}
          />
        );
      case 'history':
        return <History user={user} />;
      case 'payouts':
        return <Payouts user={user} />;
      case 'owner':
        return canAccessOwnerPanel(user) ? (
          <OwnerPanel user={user} initialTab={ownerTab} onInitialTabConsumed={() => setOwnerTab(null)} />
        ) : (
          <Dashboard user={user} onNavigate={handleNavigate} />
        );
      case 'profile':
        return (
          <Profile
            user={user}
            onBack={() => handleNavigate('dashboard')}
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
        onNavigate={handleNavigate}
        isAdmin={isAdmin}
      />
    </div>
  );
}
