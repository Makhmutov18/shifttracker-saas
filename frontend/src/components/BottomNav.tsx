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

export default function BottomNav({ currentPage, onNavigate, isAdmin }: Props) {
  const visibleItems = navItems.filter((item) => !item.ownerOnly || isAdmin);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div className="mx-auto max-w-lg px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.7rem)] pt-2">
        <div className="dock-shell glass-nav pointer-events-auto">
          {visibleItems.map((item) => {
            const isActive = currentPage === item.page;
            const isPrimary = item.page === 'shift';

            return (
              <button
                key={item.page}
                type="button"
                onClick={() => {
                  hapticFeedback();
                  onNavigate(item.page);
                }}
                className={`dock-item ${isPrimary ? 'dock-item-primary' : ''} ${isActive ? 'dock-item-active' : ''}`}
              >
                <span className={`dock-item-icon ${isPrimary ? 'dock-item-icon-primary' : ''}`}>{item.icon}</span>
                <span className="dock-item-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
