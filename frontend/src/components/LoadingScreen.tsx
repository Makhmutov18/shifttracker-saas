import React from 'react';
export default function LoadingScreen() {
  return (
    <div className="screen-state" role="status" aria-live="polite">
      <div className="screen-state-mark" aria-hidden="true">П</div>
      <p className="screen-state-title">Загружаем приложение</p>
      <p className="screen-state-copy">Подготавливаем ваши смены и начисления.</p>
    </div>
  );
}
