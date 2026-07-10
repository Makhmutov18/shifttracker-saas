import React from 'react';
import { LayoutDashboard, PlusCircle, Clock, ShieldCheck, User, Wallet } from 'lucide-react';
import { hapticFeedback } from '../utils/telegram';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';

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
  className = '',
}: {
  page: Page;
  label: string;
  icon: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  className?: string;
}) {
  const isActive = currentPage === page;

  return (
    <button
      type="button"
      onClick={() => {
        hapticFeedback();
        onNavigate(page);
      }}
      className={`dock-item ${isActive ? 'dock-item-active' : ''} ${className}`}
    >
      <span className="dock-item-icon">{icon}</span>
      <span className="dock-item-label">{label}</span>
    </button>
  );
}

export default function BottomNav({ currentPage, onNavigate, isAdmin }: Props) {
  const leftItems = [
    { page: 'dashboard' as Page, label: 'Главная', icon: <LayoutDashboard className="h-5 w-5" /> },
    { page: 'history' as Page, label: 'История', icon: <Clock className="h-5 w-5" /> },
  ];

  const rightItems = isAdmin
    ? [
        { page: 'owner' as Page, label: 'Управление', icon: <ShieldCheck className="h-5 w-5" /> },
        { page: 'profile' as Page, label: 'Профиль', icon: <User className="h-5 w-5" /> },
      ]
    : [
        { page: 'history' as Page, label: 'Выплаты', icon: <Wallet className="h-5 w-5" /> },
        { page: 'profile' as Page, label: 'Профиль', icon: <User className="h-5 w-5" /> },
      ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div className="mx-auto max-w-lg px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.7rem)] pt-2">
        <div className="dock-shell glass-nav pointer-events-auto">
          <div className="dock-side dock-side-left">
            {leftItems.map((item) => (
              <NavButton key={item.page} page={item.page} label={item.label} icon={item.icon} currentPage={currentPage} onNavigate={onNavigate} />
            ))}
          </div>

          <NavButton
            page="shift"
            label="Смена"
            icon={<PlusCircle className="h-5 w-5" />}
            currentPage={currentPage}
            onNavigate={onNavigate}
            className="dock-center"
          />

          <div className="dock-side dock-side-right">
            {rightItems.map((item) => (
              <NavButton key={item.page} page={item.page} label={item.label} icon={item.icon} currentPage={currentPage} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
