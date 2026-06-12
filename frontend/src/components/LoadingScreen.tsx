import React from 'react';
import { Clock } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-tg-bg">
      <Clock className="w-12 h-12 text-tg-hint animate-pulse mb-4" />
      <p className="text-tg-hint text-sm">Загрузка...</p>
    </div>
  );
}