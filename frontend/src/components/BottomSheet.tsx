import React, { ReactNode, useEffect, useId, useRef, useState } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type SheetPhase = 'opening' | 'open' | 'closing';

const EXIT_FALLBACK_MS = 280;

export default function BottomSheet({ open, title, onClose, children }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<SheetPhase>(open ? 'opening' : 'closing');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let firstFrame: number | undefined;
    let secondFrame: number | undefined;
    let exitFallback: number | undefined;

    if (open) {
      setMounted(true);
      setPhase('opening');
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setPhase('open'));
      });
    } else if (mounted) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setMounted(false);
      } else {
        setPhase('closing');
        exitFallback = window.setTimeout(() => setMounted(false), EXIT_FALLBACK_MS);
      }
    }

    return () => {
      if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
      if (exitFallback !== undefined) window.clearTimeout(exitFallback);
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!mounted) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mounted]);

  if (!mounted) return null;

  const handlePanelTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (
      phase === 'closing'
      && event.target === event.currentTarget
      && (event.propertyName === 'transform' || event.propertyName === 'opacity')
    ) {
      setMounted(false);
    }
  };

  return (
    <div className="bottom-sheet-root" data-state={phase}>
      <button type="button" className="bottom-sheet-backdrop" onClick={() => onCloseRef.current()} aria-label="Закрыть" />
      <div
        ref={panelRef}
        className="bottom-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onTransitionEnd={handlePanelTransitionEnd}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <h2 id={titleId} className="bottom-sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
