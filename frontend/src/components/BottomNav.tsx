import React from 'react';
import { Clock, LayoutDashboard, Plus, ShieldCheck, User, Wallet } from 'lucide-react';
import { hapticFeedback } from '../utils/telegram';

type Page = 'dashboard' | 'shift' | 'history' | 'payouts' | 'owner' | 'profile';

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isAdmin: boolean;
}

function NavButton({
  page,
  label,
  icon,
  currentPage,
  onNavigate,
}: {
  page: Page;
  label: string;
  icon: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
}) {
  const isActive = currentPage === page;

  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      onClick={() => {
        hapticFeedback();
        onNavigate(page);
      }}
      className={`dock-item ${isActive ? 'dock-item-active' : ''}`}
    >
      <span className="dock-item-icon">{icon}</span>
      <span className="dock-item-label">{label}</span>
    </button>
  );
}

export default function BottomNav({ currentPage, onNavigate, isAdmin }: Props) {
  const items = isAdmin
    ? [
        { page: 'dashboard' as Page, label: 'Главная', icon: <LayoutDashboard className="h-5 w-5" /> },
        { page: 'history' as Page, label: 'История', icon: <Clock className="h-5 w-5" /> },
        { page: 'owner' as Page, label: 'Управление', icon: <ShieldCheck className="h-5 w-5" /> },
        { page: 'profile' as Page, label: 'Профиль', icon: <User className="h-5 w-5" /> },
      ]
    : [
        { page: 'dashboard' as Page, label: 'Главная', icon: <LayoutDashboard className="h-5 w-5" /> },
        { page: 'history' as Page, label: 'История', icon: <Clock className="h-5 w-5" /> },
        { page: 'payouts' as Page, label: 'Выплаты', icon: <Wallet className="h-5 w-5" /> },
        { page: 'profile' as Page, label: 'Профиль', icon: <User className="h-5 w-5" /> },
      ];

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      <div className="bottom-nav-inner">
        <div className="bottom-nav-composition">
          <div className="dock-shell">
            {items.map((item) => (
              <NavButton
                key={item.page}
                page={item.page}
                label={item.label}
                icon={item.icon}
                currentPage={currentPage}
                onNavigate={onNavigate}
              />
            ))}
          </div>
          <button
            type="button"
            className="dock-create-action"
            aria-label="Создать смену"
            onClick={() => {
              hapticFeedback();
              onNavigate('shift');
            }}
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}
