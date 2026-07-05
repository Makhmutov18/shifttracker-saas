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
  { page: 'dashboard', label: 'Главная', icon: <LayoutDashboard className="w-5 h-5" /> },
  { page: 'shift', label: 'Смена', icon: <PlusCircle className="w-5 h-5" /> },
  { page: 'history', label: 'История', icon: <Clock className="w-5 h-5" /> },
  { page: 'owner', label: 'Управление', icon: <ShieldCheck className="w-5 h-5" />, ownerOnly: true },
  { page: 'profile', label: 'Профиль', icon: <User className="w-5 h-5" /> },
];

export default function BottomNav({ currentPage, onNavigate, isAdmin }: Props) {
  const visibleItems = navItems.filter(item => !item.ownerOnly || isAdmin);

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-nav safe-area-bottom z-50">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {visibleItems.map((item) => {
          const isActive = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => { hapticFeedback(); onNavigate(item.page); }}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-colors ${
                isActive
                  ? 'text-tg-primary'
                  : 'text-tg-hint'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
