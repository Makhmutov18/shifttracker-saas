import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Inbox, LoaderCircle, Search, X } from 'lucide-react';
import { formatMoney, statusLabels } from '../utils';

export type BadgeVariant = 'success' | 'danger' | 'neutral' | 'warning' | 'info';
export type SortDirection = 'asc' | 'desc';
export type TableHeader = string | { label: string; sortKey?: string; align?: 'left' | 'right' };

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-action">{action}</div>}</header>;
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

export function MoneyValue({ value, muted = false }: { value: string | number | null | undefined; muted?: boolean }) {
  return <span className={muted ? 'money muted' : 'money'}>{formatMoney(value)}</span>;
}

export function Badge({ variant = 'neutral', icon, children }: { variant?: BadgeVariant; icon?: ReactNode; children: ReactNode }) {
  return <span className={`badge badge-${variant}`}>{icon}{children}</span>;
}

export function IconBadge({ tone = 'neutral', icon, label, value }: { tone?: BadgeVariant; icon: ReactNode; label: string; value?: ReactNode }) {
  return <span className={`icon-badge icon-badge-${tone}`}><span className="icon-badge-mark">{icon}</span><span className="icon-badge-copy"><strong>{label}</strong>{value !== undefined && <small>{value}</small>}</span></span>;
}

export interface AvatarStackItem { name: string; url?: string | null }

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || 'С').toUpperCase();
}

function avatarTone(name: string): number {
  return Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5;
}

export function AvatarStack({ items, max = 4 }: { items: AvatarStackItem[]; max?: number }) {
  const safeItems = (items ?? []).filter((item) => item?.name).slice(0, Math.max(0, max));
  const hidden = Math.max(0, (items ?? []).length - safeItems.length);
  return <span className="avatar-stack" aria-label={(items ?? []).map((item) => item.name).join(', ') || 'Сотрудники не указаны'}>
    {safeItems.map((item, index) => <span className={`avatar-stack-item avatar-tone-${avatarTone(item.name)}`} title={item.name} key={`${item.name}-${index}`}>{initials(item.name)}{item.url && <img src={item.url} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</span>)}
    {hidden > 0 && <span className="avatar-stack-more">+{hidden}</span>}
  </span>;
}

export function RadialStat({ value, max, label, tone = 'info' }: { value: number; max: number; label: string; tone?: BadgeVariant }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const percent = Math.round(ratio * 100);
  const style = { '--radial-offset': 100 - ratio * 100 } as CSSProperties;
  return <div className={`radial-stat radial-stat-${tone}`}><span className="radial-stat-chart" style={style}><svg viewBox="0 0 42 42" aria-hidden="true"><circle className="radial-track" cx="21" cy="21" r="16" pathLength="100" /><circle className="radial-value" cx="21" cy="21" r="16" pathLength="100" /></svg><strong>{percent}%</strong></span><span><strong>{value} из {max}</strong><small>{label}</small></span></div>;
}

function sparklinePath(values: number[]): string {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  return values.map((value, index) => {
    const x = 3 + index * (90 / Math.max(1, values.length - 1));
    const y = 27 - value / max * 24;
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function Sparkline({ values, label = 'Динамика' }: { values: number[]; label?: string }) {
  if (!(values ?? []).some(Boolean)) return <span className="sparkline-empty">Нет активности</span>;
  return <svg className="sparkline" viewBox="0 0 96 30" role="img" aria-label={label}><path d={sparklinePath(values)} /></svg>;
}

function statusVariant(status: string): BadgeVariant {
  if (['approved', 'paid', 'active'].includes(status)) return 'success';
  if (['rejected', 'cancelled', 'inactive'].includes(status)) return 'danger';
  if (['pending', 'draft'].includes(status)) return 'warning';
  if (status === 'finalized') return 'info';
  return 'neutral';
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{statusLabels[status] ?? 'Статус не указан'}</Badge>;
}

export function LoadingState({ text = 'Загружаем данные…' }: { text?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><div className="skeleton skeleton-title" /><div className="skeleton-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton skeleton-table" /><span><LoaderCircle className="spin" />{text}</span></div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="state"><span className="state-icon"><Inbox /></span><strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state state-error"><span className="state-icon"><AlertCircle /></span><strong>Не удалось загрузить данные</strong><p>{message}</p>{retry && <button className="button secondary" onClick={retry}>Повторить</button>}</div>;
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function DateRangeFields({ start, end, onStart, onEnd }: { start: string; end: string; onStart: (value: string) => void; onEnd: (value: string) => void }) {
  return <div className="date-range" aria-label="Период"><FormField label="С даты"><input type="date" value={start} max={end || undefined} onChange={(event) => onStart(event.target.value)} /></FormField><span className="date-range-separator">—</span><FormField label="По дату"><input type="date" value={end} min={start || undefined} onChange={(event) => onEnd(event.target.value)} /></FormField></div>;
}

export interface SelectOption { value: string; label: string }

export function SearchSelect({ value, options, placeholder, onChange }: { value: string; options: SelectOption[]; placeholder: string; onChange: (value: string) => void }) {
  const selected = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => options.filter((option) => option.label.toLocaleLowerCase('ru-RU').includes(query.toLocaleLowerCase('ru-RU'))), [options, query]);
  const close = () => { setOpen(false); setQuery(''); };
  return <div className="search-select">
    <Search aria-hidden="true" />
    <input
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      value={open ? query : selected?.label ?? ''}
      placeholder={placeholder}
      onFocus={() => setOpen(true)}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={(event) => { if (event.key === 'Escape') close(); }}
      onBlur={() => window.setTimeout(close, 120)}
    />
    {value && <button type="button" aria-label="Сбросить выбор" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange('')}><X /></button>}
    {open && <div className="search-select-menu" role="listbox">
      <button type="button" className={!value ? 'selected' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(''); close(); }}>{placeholder}</button>
      {filtered.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'selected' : ''} key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.value); close(); }}>{option.label}</button>)}
      {!filtered.length && <span>Ничего не найдено</span>}
    </div>}
  </div>;
}

export function Drawer({ title, open, onClose, children, footer, size = 'default' }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'default' | 'wide' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className={`drawer${size === 'wide' ? ' drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
      <div className="drawer-body">{children}</div>{footer && <footer>{footer}</footer>}
    </aside>
  </div>;
}

export function ConfirmationDialog({ open, title, text, confirmLabel, danger = false, onConfirm, onClose }: { open: boolean; title: string; text: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  if (!open) return null;
  return <div className="dialog-layer" role="presentation"><div className="dialog" role="alertdialog" aria-modal="true"><h2>{title}</h2><p>{text}</p><div className="dialog-actions"><button className="button secondary" onClick={onClose}>Отмена</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></div></div>;
}

export function DataTable({ headers, children, empty, sortKey, sortDirection = 'asc', onSort, label = 'Таблица данных' }: { headers: TableHeader[]; children: ReactNode; empty?: boolean; sortKey?: string; sortDirection?: SortDirection; onSort?: (key: string) => void; label?: string }) {
  if (empty) return null;
  return <div className="table-wrap" tabIndex={0} aria-label={label}><table><thead><tr>{headers.map((header, index) => {
    const config = typeof header === 'string' ? { label: header } : header;
    return <th key={`${config.label}-${index}`} className={config.align === 'right' ? 'align-right' : undefined}>{config.sortKey && onSort ? <button className="sort-button" onClick={() => onSort(config.sortKey!)} aria-label={`Сортировать: ${config.label}`}>{config.label}{sortKey === config.sortKey ? (sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />) : <span className="sort-placeholder" />}</button> : config.label}</th>;
  })}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav className="pagination" aria-label="Страницы"><span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Предыдущая страница"><ChevronLeft /></button><strong>{page} / {pages}</strong><button className="icon-button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Следующая страница"><ChevronRight /></button></div></nav>;
}

export function Toast({ message, variant = 'success', onClose }: { message: string; variant?: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { if (!message) return; const timer = window.setTimeout(onClose, 4000); return () => window.clearTimeout(timer); }, [message, onClose]);
  if (!message) return null;
  return <div className={`toast toast-${variant}`} role="status">{variant === 'success' ? <CheckCircle2 /> : <AlertCircle />}<span>{message}</span><button onClick={onClose} aria-label="Закрыть уведомление"><X /></button></div>;
}

export function FilterBar({ children }: { children: ReactNode }) { return <div className="filter-bar">{children}</div>; }
