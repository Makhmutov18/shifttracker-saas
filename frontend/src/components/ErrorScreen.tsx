import React from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  message: string;
}

export default function ErrorScreen({ message }: Props) {
  return (
    <div className="screen-state screen-state-error" role="alert">
      <AlertCircle className="screen-state-icon" aria-hidden="true" />
      <p className="screen-state-title">Что-то пошло не так</p>
      <p className="screen-state-copy">{message}</p>
    </div>
  );
}
