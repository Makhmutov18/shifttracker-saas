import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
}

export default function ErrorScreen({ message }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-tg-bg px-6">
      <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
      <p className="text-tg-text text-center font-medium mb-2">Ошибка</p>
      <p className="text-tg-hint text-sm text-center">{message}</p>
    </div>
  );
}