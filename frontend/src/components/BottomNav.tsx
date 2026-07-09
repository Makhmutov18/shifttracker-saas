import React from 'react';
import { LayoutDashboard, PlusCircle, Clock, ShieldCheck, User } from 'lucide-react';
import { hapticFeedback } from '../utils/telegram';

type Page = 'dashboard' | 'shift' | 'history' | 'owner' | 'profile';

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isAdmin: boolean;
}

const navItems: { page: Page; label: string; icon: React.ReactNode; ownerOnly?: boolean }[] = [
  { page: 'dashboard', label: 'Главная', icon: <LayoutDashboard className="h-5 w-5" /> },
  { page: 'history', label: 'История', icon: <Clock className="h-5 w-5" /> },
  { page: 'shift', label: 'Смена', icon: <PlusCircle className="h-5 w-5" /> },
  { page: 'owner', label: 'Управление', icon: <ShieldCheck className="h-5 w-5" />, ownerOnly: true },
  { page: 'profile', label: 'Профиль', icon: <User className="h-5 w-5" /> },
];

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
  const visibleItems = navItems.filter((item) => !item.ownerOnly || isAdmin);
  const sideItems = visibleItems.filter((item) => item.page !== 'shift');
  const midpoint = Math.ceil(sideItems.length / 2);
  const leftItems = sideItems.slice(0, midpoint);
  const rightItems = sideItems.slice(midpoint);
  const shiftItem = navItems.find((item) => item.page === 'shift');

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div className="mx-auto max-w-lg px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.7rem)] pt-2">
        <div className="dock-shell glass-nav pointer-events-auto">
          <div className="dock-side dock-side-left">
            {leftItems.map((item) => (
              <NavButton key={item.page} page={item.page} label={item.label} icon={item.icon} currentPage={currentPage} onNavigate={onNavigate} />
            ))}
          </div>

          {shiftItem ? (
            <NavButton
              page={shiftItem.page}
              label={shiftItem.label}
              icon={shiftItem.icon}
              currentPage={currentPage}
              onNavigate={onNavigate}
              className="dock-center"
            />
          ) : null}

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
