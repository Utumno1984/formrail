import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import * as DismissableLayer from '@radix-ui/react-dismissable-layer';
import { Button } from '../button/Button';
import { Icon } from '../icon/Icon';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { hasContent, textOf } from '../internal/react-nodes';
import { overlayLayer } from '../overlay/layers';
import { cn } from '../utils/cn';
import {
  ToastContext,
  type ToastDismissReason,
  type ToastOptions,
  type ToastTone,
  type UseToastReturn,
} from './use-toast';

const DEFAULT_DURATION = 5000;
const DEFAULT_DISMISS_LABEL = 'Dismiss notification';

const TONE_LABEL: Record<ToastTone, string> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
};

// Full literals (Tailwind scan).
const TONE_CLASS: Record<ToastTone, { box: string; icon: string }> = {
  info: { box: 'border-rop-info', icon: 'text-rop-info' },
  success: { box: 'border-rop-success', icon: 'text-rop-success' },
  warning: { box: 'border-rop-warning', icon: 'text-rop-warning' },
  error: { box: 'border-rop-error', icon: 'text-rop-error' },
};

export interface ToastLabels {
  /** Close button name. Default "Dismiss notification"; the title is appended: "Dismiss notification: <title>". */
  dismiss?: string;
  /** Visually hidden tone name read before the message (colour alone is not enough). */
  tones?: Partial<Record<ToastTone, string>>;
}

export interface ToastProviderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Texts the toast adds itself. Default: English. */
  labels?: ToastLabels;
  /** `KeyboardEvent.key` that moves the focus to the visible toast. Default `F8`; `null` disables it. */
  hotkey?: string | null;
  /** Milliseconds a toast without an action stays. Default 5000. A toast with an action stays until closed. */
  defaultDuration?: number;
  children?: ReactNode;
}

interface ToastItem {
  id: string;
  /** Identity of the DOM node: a new toast gets a new node, an update by `id` keeps it. */
  key: number;
  options: ToastOptions;
}

let counter = 0;
const nextId = () => `rop-toast-${(counter += 1)}`;

const noopSubscribe = () => () => undefined;

function canTakeFocus(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && !el.matches(':disabled');
}

/** Longest animation duration + delay in effect on the node, in ms (0 when it has none). */
function animationTotalMs(node: HTMLElement): number {
  const ms = (list: string) =>
    list.split(',').map((item) => {
      const value = parseFloat(item);
      if (!Number.isFinite(value)) return 0;
      return item.trim().endsWith('ms') ? value : value * 1000;
    });
  const style = getComputedStyle(node);
  if (style.animationName === '' || style.animationName === 'none') return 0;
  return Math.max(0, ...ms(style.animationDuration)) + Math.max(0, ...ms(style.animationDelay));
}

interface ToastViewProps {
  item: ToastItem;
  open: boolean;
  labels: ToastLabels | undefined;
  nodeRef: { current: HTMLDivElement | null };
  onUserDismiss: () => void;
  onAction: () => void;
  onExited: () => void;
}

function ToastView({ item, open, labels, nodeRef, onUserDismiss, onAction, onExited }: ToastViewProps) {
  const { tone = 'info', title, description, action } = item.options;
  const titleText = textOf(title).trim();
  const dismissBase = labels?.dismiss ?? DEFAULT_DISMISS_LABEL;
  const closeName = titleText ? `${dismissBase}: ${titleText}` : dismissBase;
  const classes = TONE_CLASS[tone];
  const node = useRef<HTMLDivElement | null>(null);

  const setNode = useCallback(
    (el: HTMLDivElement | null) => {
      node.current = el;
      nodeRef.current = el;
    },
    [nodeRef],
  );

  // Once closed the node stays mounted for as long as its exit animation runs (none under
  // prefers-reduced-motion, or when the stylesheet is not loaded: unmounted at once).
  const onExitedRef = useRef(onExited);
  useLayoutEffect(() => {
    onExitedRef.current = onExited;
  });
  useLayoutEffect(() => {
    if (open) return undefined;
    const el = node.current;
    const total = el ? animationTotalMs(el) : 0;
    if (!el || total === 0) {
      onExitedRef.current();
      return undefined;
    }
    const done = (event: Event) => {
      if (event.target === el) onExitedRef.current();
    };
    el.addEventListener('animationend', done);
    el.addEventListener('animationcancel', done);
    // Safety net: an animation that never ends must not leave the node on screen for good.
    const timer = setTimeout(() => onExitedRef.current(), total + 500);
    return () => {
      el.removeEventListener('animationend', done);
      el.removeEventListener('animationcancel', done);
      clearTimeout(timer);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open || event.defaultPrevented) return;
    event.stopPropagation();
    onUserDismiss();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape closes the toast only while the focus is inside it
    <div
      ref={setNode}
      tabIndex={-1}
      data-state={open ? 'open' : 'closed'}
      onKeyDown={onKeyDown}
      className={cn(
        'pointer-events-auto flex items-start gap-2 rounded-rop-md border bg-rop-surface p-3 font-rop-sans text-rop-body text-rop-text [overflow-wrap:anywhere] ' +
          '[box-shadow:0_4px_16px_rgb(0_0_0/0.2)] focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:outline-offset-2 ' +
          'motion-safe:data-[state=open]:animate-rop-toast-in motion-safe:data-[state=closed]:animate-rop-toast-out data-[state=closed]:pointer-events-none',
        classes.box,
      )}
    >
      {/* One text line tall, centred on the cap height of the first line (title or description). */}
      <CapIconSlot>
        <Icon size="md" className={classes.icon}>
          {internalIcons[tone]}
        </Icon>
      </CapIconSlot>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{labels?.tones?.[tone] ?? TONE_LABEL[tone]}: </span>
        {hasContent(title) ? <strong className="block font-[700]">{title}</strong> : null}
        <div>{description}</div>
        {action ? (
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={onAction}>
              {action.label}
            </Button>
          </div>
        ) : null}
      </div>
      <Button size="icon-xs" variant="ghost" aria-label={closeName} onClick={onUserDismiss} className="-my-0.5 -mr-1">
        {internalIcons.close}
      </Button>
    </div>
  );
}

// The viewport never covers the page: it is as tall as its toast. `pointer-events: none` here and
// `auto` on the toast itself: the toast stays clickable while a modal Dialog has set
// `pointer-events: none` on the body.
const VIEWPORT_CLASS =
  'pointer-events-none fixed inset-x-4 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-96 sm:max-w-[calc(100%_-_2rem)]';
// The lower edge stays above the home indicator and above an on-screen keyboard (`Field` publishes
// its height as `--rop-keyboard-inset` on <html>). Inline: a class name cannot carry a comma.
const VIEWPORT_STYLE = {
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--rop-keyboard-inset, 0px) + 1rem)',
} as const;

/**
 * Hosts the toast: one toast at a time, shown by `useToast().show(...)`. A new `show` replaces the
 * visible toast (`onDismiss('replaced')`); a future queue is a provider-level policy, not a change
 * of the `show` / `dismiss` signatures.
 *
 * - **Live regions mounted with the provider**, empty, in a portal on `document.body`: a polite one
 *   (`role="status"`) and an assertive one (`role="alert"`, for the `error` tone). A message
 *   appears inside an already existing region, which is what makes screen readers announce it. The
 *   regions are not re-written on re-render.
 * - **Never takes the focus**. F8 (`hotkey`) is the explicit gesture that moves it to the toast;
 *   Escape with the focus inside closes it and, like any close while the focus is inside, returns the
 *   focus to the element that had it before (when it is still connected and enabled; never to an
 *   arbitrary node).
 * - Sits on the `toast` z-index level (above modals and popovers, below tooltips). Inside a modal
 *   `Dialog` / `Sheet` it stays visible, clickable and announced: the regions carry `aria-live`
 *   (which `aria-hidden` skips), the toast sets `pointer-events: auto` and the viewport is a Radix
 *   `DismissableLayer.Branch`, so a click on it is not an "outside click" of the modal.
 * - Declared limit: the focus trap of a modal keeps the focus inside the modal, so F8 cannot reach
 *   the toast while it is open. A toast with an `action` therefore stays until closed, and the
 *   action is reachable as soon as the modal closes.
 * - Declared limit (SSR): the regions are portalled to `document.body`, so they appear in the render
 *   after hydration, not in the server HTML. A `show` called in the mount effect of a child may run
 *   before the regions exist in the DOM and not be announced; call it from an event or after mount.
 * - An update by `id` that changes the tone between `error` and the others moves the toast to the
 *   other live region (a new node); the focus, if inside it, goes back to the previous element.
 * - Declared limit: the timer keeps running while the window is in the background or the toast is
 *   hovered/focused (pausing is outside the single-toast scope).
 *
 * `className` and the other HTML props go to the viewport container.
 */
export const ToastProvider = /* @__PURE__ */ forwardRef<HTMLDivElement, ToastProviderProps>(function ToastProvider(
  { labels, hotkey = 'F8', defaultDuration = DEFAULT_DURATION, className, style, children, ...rest },
  ref,
) {
  // false while rendering on the server / hydrating, so that no `document` is touched in render.
  const canPortal = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [current, setCurrent] = useState<ToastItem | null>(null);
  const [leaving, setLeaving] = useState<ToastItem | null>(null);
  const currentRef = useRef<ToastItem | null>(null);
  const keyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const toastNodeRef = useRef<HTMLDivElement | null>(null);
  // The last element outside the toast that had the focus: where the focus goes back to.
  const lastOutsideRef = useRef<HTMLElement | null>(null);
  const defaultDurationRef = useRef(defaultDuration);
  useLayoutEffect(() => {
    defaultDurationRef.current = defaultDuration;
  });

  const setViewport = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const rememberFocus = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !viewportRef.current?.contains(active)) {
      lastOutsideRef.current = active;
    }
  }, []);

  useEffect(() => {
    rememberFocus();
    const onFocusIn = () => rememberFocus();
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [rememberFocus]);

  const durationRef = useRef<number | null>(null);

  /** If the focus is inside the toast, gives it back to the last element outside (when still usable). */
  const restoreFocus = useCallback(() => {
    if (!viewportRef.current?.contains(document.activeElement)) return;
    const target = lastOutsideRef.current;
    if (canTakeFocus(target)) target.focus();
  }, []);

  const closeCurrent = useCallback(
    (reason: ToastDismissReason, onlyKey?: number) => {
      const item = currentRef.current;
      if (!item || (onlyKey !== undefined && item.key !== onlyKey)) return;
      clearTimeout(timerRef.current);
      currentRef.current = null;
      durationRef.current = null;
      // A close while the focus is inside the toast must not drop it on <body>.
      restoreFocus();
      setCurrent(null);
      setLeaving(item);
      item.options.onDismiss?.(reason);
    },
    [restoreFocus],
  );

  const show = useCallback(
    (options: ToastOptions): string => {
      const id = options.id ?? nextId();
      if (!hasContent(options.description)) {
        if (isDev()) {
          console.error('[react-object-page] useToast().show() needs a non-empty `description`; no toast is shown.');
        }
        return id;
      }
      if (isDev() && options.action && typeof options.duration === 'number') {
        console.warn(
          '[react-object-page] A toast with an `action` and a numeric `duration` disappears on a timer: the action may become unreachable (WCAG 2.2.1). Omit `duration` to keep it until it is closed.',
        );
      }
      const previous = currentRef.current;
      const sameToast = previous !== null && previous.id === id;
      keyRef.current += 1;
      const item: ToastItem = { id, key: previous && sameToast ? previous.key : keyRef.current, options };
      // Replaced: the old node goes at once (no exit animation) and the focus, if it was inside,
      // goes back to where it came from.
      // Same for an update that moves the toast between the polite and the assertive region: React
      // mounts a new node there, so a focus inside the old one would be lost.
      const changesRegion = sameToast && (previous.options.tone === 'error') !== (options.tone === 'error');
      if (previous && (!sameToast || changesRegion)) restoreFocus();
      currentRef.current = item;
      setLeaving(null);
      setCurrent(item);
      if (previous && !sameToast) previous.options.onDismiss?.('replaced');

      clearTimeout(timerRef.current);
      const duration =
        options.duration !== undefined ? options.duration : options.action ? null : defaultDurationRef.current;
      durationRef.current = typeof duration === 'number' ? duration : null;
      if (typeof duration === 'number') {
        timerRef.current = setTimeout(() => closeCurrent('timeout', item.key), duration);
      }
      return id;
    },
    [closeCurrent, restoreFocus],
  );

  const dismiss = useCallback(
    (id?: string) => {
      const item = currentRef.current;
      if (!item || (id !== undefined && item.id !== id)) return;
      closeCurrent('programmatic', item.key);
    },
    [closeCurrent],
  );

  // The cleanup only stops the timer: the effects of a mounted tree can be torn down and set up
  // again (`<Activity>` hidden then visible, Fast Refresh) while the toast is still on screen, so
  // `currentRef` must keep pointing at it and the timer is re-armed here.
  useEffect(() => {
    const item = currentRef.current;
    const duration = durationRef.current;
    if (item && typeof duration === 'number') {
      // A child's mount effect runs before this one and may already have armed a timer through
      // `show()`: stop it first, or it would be orphaned and close a later update of the same id.
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => closeCurrent('timeout', item.key), duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [closeCurrent]);

  const api = useMemo<UseToastReturn>(() => ({ show, dismiss }), [show, dismiss]);

  // F8 (explicit gesture): the focus moves to the visible toast. Nothing else ever moves it there.
  useEffect(() => {
    if (!hotkey) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== hotkey || event.defaultPrevented) return;
      const node = toastNodeRef.current;
      if (!currentRef.current || !node) return;
      rememberFocus();
      event.preventDefault();
      node.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hotkey, rememberFocus]);

  const shown = current ?? leaving;
  const view = shown ? (
    <ToastView
      key={shown.key}
      item={shown}
      open={current !== null}
      labels={labels}
      nodeRef={toastNodeRef}
      onUserDismiss={() => closeCurrent('user', shown.key)}
      onAction={() => {
        shown.options.action?.onClick();
        closeCurrent('user', shown.key);
      }}
      onExited={() => setLeaving((now) => (now?.key === shown.key ? null : now))}
    />
  ) : null;
  const assertive = shown?.options.tone === 'error';

  return (
    <ToastContext.Provider value={api}>
      {children}
      {canPortal
        ? createPortal(
            <DismissableLayer.Branch
              {...rest}
              ref={setViewport}
              className={cn(VIEWPORT_CLASS, overlayLayer.toast, className)}
              style={{ ...VIEWPORT_STYLE, ...style }}
            >
              <div role="status" aria-live="polite" className="flex flex-col gap-2">
                {assertive ? null : view}
              </div>
              <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
                {assertive ? view : null}
              </div>
            </DismissableLayer.Branch>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
});
