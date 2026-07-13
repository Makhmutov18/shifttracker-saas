import type { ReactNode } from 'react';
import { AlertCircle, Inbox, LoaderCircle, X } from 'lucide-react';
import { formatMoney, statusLabels } from '../utils';

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-action">{action}</div>}</header>;
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

export function MoneyValue({ value, muted = false }: { value: string | number | null | undefined; muted?: boolean }) {
  return <span className={muted ? 'money muted' : 'money'}>{formatMoney(value)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{statusLabels[status] ?? 'Статус не указан'}</span>;
}

export function LoadingState({ text = 'Загружаем данные…' }: { text?: string }) {
  return <div className="state"><LoaderCircle className="spin" /><p>{text}</p></div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="state"><Inbox /><strong>{title}</strong>{description && <p>{description}</p>}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state state-error"><AlertCircle /><strong>Не удалось загрузить данные</strong><p>{message}</p>{retry && <button className="button secondary" onClick={retry}>Повторить</button>}</div>;
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Drawer({ title, open, onClose, children, footer }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
      <div className="drawer-body">{children}</div>{footer && <footer>{footer}</footer>}
    </aside>
  </div>;
}

export function ConfirmationDialog({ open, title, text, confirmLabel, danger = false, onConfirm, onClose }: { open: boolean; title: string; text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  if (!open) return null;
  return <div className="dialog-layer" role="presentation"><div className="dialog" role="alertdialog" aria-modal="true"><h2>{title}</h2><p>{text}</p><div className="dialog-actions"><button className="button secondary" onClick={onClose}>Отмена</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}

export function DataTable({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: boolean }) {
  if (empty) return null;
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function FilterBar({ children }: { children: ReactNode }) { return <div className="filter-bar">{children}</div>; }
