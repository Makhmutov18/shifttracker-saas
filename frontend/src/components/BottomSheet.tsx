import React, { ReactNode, RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
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
type DragAxis = 'pending' | 'vertical' | 'horizontal';

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocityY: number;
  panelHeight: number;
  axis: DragAxis;
};

const EXIT_FALLBACK_MS = 280;
const DRAG_AXIS_LOCK_PX = 6;
const DRAG_DISMISS_RATIO = 0.25;
const DRAG_VELOCITY_THRESHOLD = 0.65;
const DRAG_VELOCITY_MAX_AGE_MS = 80;
const DRAG_MIN_SWIPE_DISTANCE_PX = 12;
const DRAG_UPWARD_RESISTANCE = 0.12;
const DRAG_UPWARD_LIMIT_PX = 12;
const DRAG_RETURN_FALLBACK_MS = 260;

export default function BottomSheet({ open, title, onClose, children, returnFocusRef }: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRegionRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRefRef = useRef(returnFocusRef);
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragFrameRef = useRef<number | undefined>(undefined);
  const pendingDragOffsetRef = useRef(0);
  const dragReturnTimerRef = useRef<number | undefined>(undefined);
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<SheetPhase>(open ? 'opening' : 'closing');

  const applyDragVisuals = (offset: number) => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;

    const progress = Math.min(1, Math.max(0, offset / Math.max(panel.offsetHeight, 1)));
    root.style.setProperty('--bottom-sheet-drag-offset', `${offset}px`);
    root.style.setProperty('--bottom-sheet-backdrop-opacity', String(1 - progress * 0.55));
  };

  const cancelDragFrame = () => {
    if (dragFrameRef.current === undefined) return;
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
  };

  const scheduleDragVisuals = (offset: number) => {
    pendingDragOffsetRef.current = offset;
    if (dragFrameRef.current !== undefined) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = undefined;
      applyDragVisuals(pendingDragOffsetRef.current);
    });
  };

  const settleDragAtRest = () => {
    const root = rootRef.current;
    if (!root) return;

    cancelDragFrame();
    root.dataset.dragState = 'settling';
    applyDragVisuals(0);
    if (dragReturnTimerRef.current !== undefined) window.clearTimeout(dragReturnTimerRef.current);
    dragReturnTimerRef.current = window.setTimeout(() => {
      dragReturnTimerRef.current = undefined;
      const currentRoot = rootRef.current;
      if (!currentRoot || currentRoot.dataset.dragState !== 'settling') return;
      currentRoot.dataset.dragState = 'idle';
      currentRoot.style.removeProperty('--bottom-sheet-drag-offset');
      currentRoot.style.removeProperty('--bottom-sheet-backdrop-opacity');
    }, DRAG_RETURN_FALLBACK_MS);
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    returnFocusRefRef.current = returnFocusRef;
  }, [returnFocusRef]);

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

  useLayoutEffect(() => {
    if (!mounted) return undefined;

    const body = document.body;
    const documentElement = document.documentElement;
    const lockedScrollX = window.scrollX;
    const lockedScrollY = window.scrollY;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousScrollBehavior = documentElement.style.scrollBehavior;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    body.style.position = 'fixed';
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

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
      cancelDragFrame();
      if (dragReturnTimerRef.current !== undefined) window.clearTimeout(dragReturnTimerRef.current);
      dragReturnTimerRef.current = undefined;
      dragSessionRef.current = null;
      document.removeEventListener('keydown', handleKeyDown);
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;

      documentElement.style.scrollBehavior = 'auto';
      window.scrollTo({ left: lockedScrollX, top: lockedScrollY, behavior: 'auto' });
      documentElement.style.scrollBehavior = previousScrollBehavior;

      const focusTarget = returnFocusRefRef.current?.current ?? previousFocus;
      focusTarget?.focus({ preventScroll: true });
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

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (
      phase !== 'open'
      || !event.isPrimary
      || (event.pointerType === 'mouse' && event.button !== 0)
      || !panel
      || !root
      || dragSessionRef.current
      || panel.scrollTop > 0
    ) {
      return;
    }

    if (dragReturnTimerRef.current !== undefined) {
      window.clearTimeout(dragReturnTimerRef.current);
      dragReturnTimerRef.current = undefined;
    }
    cancelDragFrame();
    root.dataset.dragState = 'dragging';
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityY: 0,
      panelHeight: Math.max(panel.getBoundingClientRect().height, 1),
      axis: 'pending',
    };
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    const panel = panelRef.current;
    if (!session || session.pointerId !== event.pointerId || !panel || panel.scrollTop > 0) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (session.axis === 'pending') {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DRAG_AXIS_LOCK_PX) return;
      session.axis = Math.abs(deltaY) >= Math.abs(deltaX) ? 'vertical' : 'horizontal';
    }
    if (session.axis !== 'vertical') return;

    event.preventDefault();
    const elapsed = Math.max(1, event.timeStamp - session.lastTime);
    const instantVelocity = (event.clientY - session.lastY) / elapsed;
    session.velocityY = session.velocityY * 0.25 + instantVelocity * 0.75;
    session.lastY = event.clientY;
    session.lastTime = event.timeStamp;

    const offset = deltaY >= 0
      ? Math.min(deltaY, session.panelHeight + 24)
      : Math.max(deltaY * DRAG_UPWARD_RESISTANCE, -DRAG_UPWARD_LIMIT_PX);
    scheduleDragVisuals(offset);
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (dragRegionRef.current?.hasPointerCapture(event.pointerId)) {
      dragRegionRef.current.releasePointerCapture(event.pointerId);
    }

    const deltaY = event.clientY - session.startY;
    const offset = session.axis === 'vertical' && deltaY >= 0
      ? Math.min(deltaY, session.panelHeight + 24)
      : 0;
    const velocityIsRecent = event.timeStamp - session.lastTime <= DRAG_VELOCITY_MAX_AGE_MS;
    const shouldDismiss = !cancelled
      && session.axis === 'vertical'
      && (
        offset > session.panelHeight * DRAG_DISMISS_RATIO
        || (offset > DRAG_MIN_SWIPE_DISTANCE_PX && velocityIsRecent && session.velocityY > DRAG_VELOCITY_THRESHOLD)
      );

    dragSessionRef.current = null;
    cancelDragFrame();
    applyDragVisuals(offset);
    if (shouldDismiss) {
      if (rootRef.current) rootRef.current.dataset.dragState = 'settling';
      onCloseRef.current();
      return;
    }

    settleDragAtRest();
  };

  return createPortal(
    <div
      ref={rootRef}
      className="bottom-sheet-root"
      data-state={phase}
      data-drag-state="idle"
      onPointerMove={handleDragMove}
      onPointerUp={(event) => finishDrag(event)}
      onPointerCancel={(event) => finishDrag(event, true)}
    >
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
        <div
          ref={dragRegionRef}
          className="bottom-sheet-drag-region"
          aria-hidden="true"
          onPointerDown={handleDragStart}
        >
          <div className="bottom-sheet-handle" />
        </div>
        <h2 id={titleId} className="bottom-sheet-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
