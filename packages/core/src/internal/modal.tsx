// Internal: everything `Dialog` and `Sheet` have in common (#11, #12). Not exported from the package.
// The two public components only add what differs: the panel's position and size, and the names
// of their parts (error messages, console warning).
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Button } from '../button/Button';
import { overlayLayer } from '../overlay/layers';
import { useReturnFocus } from '../overlay/use-return-focus';
import { cn } from '../utils/cn';
import { internalIcons } from './icons';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

interface ModalContextValue {
  /** Where the content publishes its `returnFocusRef`, read by `useReturnFocus` at close time. */
  fallbackHolder: { current: RefObject<HTMLElement | null> | undefined };
  /** The trigger node, if any: the last-resort target when the focus never sat on the opener. */
  triggerHolder: { current: HTMLElement | null };
  /** Whether the panel is open (the requested state, not whether its node is still mounted). */
  open: boolean;
  /** Reported by the portal's content: true while the panel node exists, including its exit animation. */
  setPanelMounted: (mounted: boolean) => void;
}

/** True when the focus sits inside a modal that is open (not one that is exiting). */
function focusIsInOpenModal(): boolean {
  const active = document.activeElement;
  return !!active?.closest('[role="dialog"][data-state="open"]');
}

const ModalContext =/* @__PURE__ */ createContext<ModalContextValue | null>(null);

function useModalContext(part: string, root: string): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error(`[react-object-page] <${part}> must be rendered inside <${root}>.`);
  return ctx;
}

export interface ModalRootProps {
  /** Controlled open state. With it, the panel behaves the same whoever sets it (trigger, button, effect). */
  open?: boolean;
  /** Initial state when uncontrolled. A panel mounted open has no opener to return the focus to. */
  defaultOpen?: boolean;
  /** Called with the requested state (Escape, backdrop, close button, trigger). */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

/**
 * Modal root (wraps `@radix-ui/react-dialog`). The open state is tracked here, not only inside
 * Radix, so that `useReturnFocus` sees every way of opening: with the trigger, or from application
 * state with no trigger at all. The focus returns to the element that had it before opening (or to
 * the content's `returnFocusRef`), never through Radix's own trigger-only return.
 */
export function ModalRoot({ open, defaultOpen = false, onOpenChange, children }: ModalRootProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const current = open ?? innerOpen;
  // True from the moment the panel's portal mounts until it has really unmounted, i.e. including
  // the exit animation: Radix's `Presence` keeps the nodes in the DOM until the animation ends.
  const [panelMounted, setPanelMounted] = useState(false);
  const fallbackHolder = useRef<RefObject<HTMLElement | null> | undefined>(undefined);
  const triggerHolder = useRef<HTMLElement | null>(null);
  // Stable object whose `current` is resolved when the focus is returned, i.e. after the content
  // (which publishes the ref) has unmounted. Order: `returnFocusRef`, then the trigger
  // (Safari and Firefox on macOS do not focus a button on click, so the remembered opener can be
  // missing even though the panel was opened by its own trigger, as Radix itself handles).
  const fallbackRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        const explicit = fallbackHolder.current?.current;
        if (explicit?.isConnected && !explicit.matches(':disabled')) return explicit;
        return triggerHolder.current ?? explicit ?? null;
      },
      set current(_value) {
        /* read-only view */
      },
    }),
    [],
  );
  // The focus must come back after the exit animation, not in the middle of it: `useReturnFocus`
  // gets "open or still on screen". The opener is still captured at the moment `current` turns true
  // (`panelMounted` is only set once the portal has mounted), and the focus returns in the frame
  // after the panel has really unmounted. Without an animation (reduced motion) the panel unmounts
  // in the same commit as the close, so the timing is the one from before the animation existed.
  // `skipWhen`: with the exit delayed, another modal may have opened in the meantime (a chain "close
  // this one, open that one" in one handler). The focus then belongs to it: pulling it back to this
  // panel's opener would make the other panel's focus trap bounce it back and select its text.
  useReturnFocus({ open: current || panelMounted, fallbackRef, skipWhen: focusIsInOpenModal });

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (open === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const ctx = useMemo(
    () => ({ fallbackHolder, triggerHolder, open: current, setPanelMounted }),
    [current],
  );
  return (
    <ModalContext.Provider value={ctx}>
      <RadixDialog.Root open={current} onOpenChange={handleOpenChange}>
        {children}
      </RadixDialog.Root>
    </ModalContext.Provider>
  );
}

export type ModalTriggerProps = ComponentPropsWithoutRef<typeof RadixDialog.Trigger>;

/** Factory of the trigger: only the name used in the error message differs per component. */
export function createModalTrigger(part: string, root: string) {
  return /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Trigger>, ModalTriggerProps>(function ModalTrigger(
    props,
    forwardedRef,
  ) {
    const { triggerHolder } = useModalContext(part, root);
    const setRef = useCallback(
      (node: HTMLButtonElement | null) => {
        triggerHolder.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [triggerHolder, forwardedRef],
    );
    return <RadixDialog.Trigger {...props} ref={setRef} />;
  });
}

// The backdrop and the content sit in one fixed wrapper at the `modal` level, which is the stacking
// unit: a second (nested) panel's wrapper comes later in the DOM at the same level, so its backdrop
// covers the first, while its popovers (level `popover`) still sit above both.
// Enter / exit are keyframe animations (tokens in `tokens.css`), applied only under `motion-safe:`: with
// prefers-reduced-motion there is no `animation` at all, so Radix's Presence unmounts at once. (Not
// `motion-reduce:animate-none`: in the compiled CSS it loses to the `data-[state]` variants.)
// While closing, the wrapper and its parts let the pointer through: the exit must not swallow a click.
// The wrapper's own `hold` animation is invisible: it keeps the portal mounted until its children
// have finished animating out (Radix's Presence of the portal watches the wrapper, not the children).
export const MODAL_WRAPPER =
  'fixed inset-0 data-[state=closed]:pointer-events-none motion-safe:data-[state=closed]:animate-rop-modal-hold';
export const MODAL_BACKDROP =
  'fixed inset-0 bg-[rgb(0_0_0/0.4)] motion-safe:data-[state=open]:animate-rop-overlay-in motion-safe:data-[state=closed]:animate-rop-overlay-out';
// `--rop-vv-top` / `--rop-vv-h` follow the visual viewport (kept by `trackVisualViewport`, defaulting
// to the layout viewport; no comma in a class name: the stylesheet leak check splits selectors on
// commas), so an on-screen keyboard does not hide the active field. The surface is shared by every
// panel; its 1px border is drawn inset by the last two declarations: it takes no space, so the width
// classes are the exact outer width (the stylesheet has no box-sizing reset, see the styles test; the
// Tailwind scan reads comments too, so the bare utility name is not written here).
// A function, not a constant: callers build their class at module level, and a `/* @__PURE__ */`
// call is dropped by the bundler when the component is not imported (a template literal is not).
export function modalPanelClass(placement: string): string {
  return (
    `[--rop-vv-top:0px] [--rop-vv-h:100dvh] ${placement} ` +
    'flex flex-col overflow-hidden bg-rop-surface font-rop-sans text-rop-text ' +
    'motion-safe:data-[state=open]:animate-rop-modal-in motion-safe:data-[state=closed]:animate-rop-modal-out data-[state=closed]:pointer-events-none ' +
    '[outline:1px_solid_var(--color-rop-border)] [outline-offset:-1px]'
  );
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
  return Math.max(0, ...ms(style.animationDuration)) + Math.max(0, ...ms(style.animationDelay));
}

/** Tells the root that the portal's content is in the DOM (see `panelMounted`); renders nothing. */
function MountedReporter({ report }: { report: (mounted: boolean) => void }) {
  useLayoutEffect(() => {
    report(true);
    return () => report(false);
  }, [report]);
  return null;
}

/** Keeps `--rop-vv-top` / `--rop-vv-h` on the node in sync with `window.visualViewport`. */
function trackVisualViewport(node: HTMLElement): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  const update = () => {
    node.style.setProperty('--rop-vv-top', `${vv.offsetTop}px`);
    node.style.setProperty('--rop-vv-h', `${vv.height}px`);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}

function hasAccessibleName(node: HTMLElement): boolean {
  if (node.getAttribute('aria-label')?.trim()) return true;
  return (node.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .some((id) => !!id && !!document.getElementById(id)?.textContent?.trim());
}

export interface ModalPanelProps
  extends Omit<ComponentPropsWithoutRef<typeof RadixDialog.Content>, 'children' | 'forceMount'> {
  /**
   * Names of the public components, for the error / console messages. One object with a name that
   * is not an HTML attribute: `part` and `title` are valid attributes the consumer may pass to the
   * panel, and must reach the DOM untouched.
   */
  names: { part: string; root: string; title: string };
  /** Final class of the panel (the caller merges its own base, size, side and user `className`). */
  panelClassName: string;
  dismissible: boolean;
  returnFocusRef: RefObject<HTMLElement | null> | undefined;
  children?: ReactNode;
}

/**
 * The panel with its backdrop, rendered in a portal. `dismissible` and `returnFocusRef` are consumed
 * here and never reach the DOM. Without an accessible name (no title, no `aria-label`) a development
 * `console.error` is logged.
 */
export const ModalPanel = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Content>, ModalPanelProps>(
  function ModalPanel(
    {
      names: { part, root, title },
      panelClassName,
      dismissible,
      returnFocusRef,
      onCloseAutoFocus,
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
      children,
      ...rest
    },
    forwardedRef,
  ) {
    const { fallbackHolder, open, setPanelMounted } = useModalContext(part, root);
    useLayoutEffect(() => {
      fallbackHolder.current = returnFocusRef;
    });
    // When the panel was last (re)opened. Radix can deliver a "pointer down outside" late (a touch
    // is dispatched on the following `click`): with the exit animation, a tap on the opener while
    // the panel is leaving reopens it, and the late dismissal of that same tap would close it again.
    // An outside interaction that began before the current opening is not a dismissal of it.
    const openedAt = useRef(0);
    useLayoutEffect(() => {
      if (open) openedAt.current = performance.now();
    }, [open]);
    const beganBeforeOpening = (event: CustomEvent<{ originalEvent: Event }>) =>
      event.detail.originalEvent.timeStamp < openedAt.current;

    const cleanupRef = useRef<(() => void) | null>(null);
    const contentNode = useRef<HTMLDivElement | null>(null);
    const setNode = useCallback(
      (node: HTMLDivElement | null) => {
        contentNode.current = node;
        cleanupRef.current?.();
        cleanupRef.current = null;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
        if (!node) return;
        const stopTracking = trackVisualViewport(node);
        // Radix sets `aria-labelledby` only after the title has registered (a re-render following
        // the mount), so the name is checked one frame later, on the settled DOM.
        const frame = isDev()
          ? requestAnimationFrame(() => {
              if (node.isConnected && !hasAccessibleName(node)) {
                console.error(
                  `[react-object-page] <${part}> has no accessible name: render a <${title}> (use visuallyHidden to hide it) or pass aria-label / aria-labelledby.`,
                );
              }
            })
          : 0;
        cleanupRef.current = () => {
          stopTracking();
          cancelAnimationFrame(frame);
        };
      },
      [forwardedRef, part, title],
    );

    // While the panel exits (state closed, nodes still mounted) the whole wrapper is `inert`: Radix
    // leaves the backdrop with an inline `pointer-events: auto` and the panel focusable, so a CSS
    // class cannot make it transparent to the pointer, the keyboard and the accessibility tree.
    const wrapperRef = useRef<HTMLDivElement>(null);
    const wasOpen = useRef(open);
    const wasMounted = useRef(false);
    useLayoutEffect(() => {
      wrapperRef.current?.toggleAttribute('inert', !open);
      // Reopened while it was still leaving: the nodes never remounted, so Radix does not run its
      // opening focus again and the focus (on the opener that was just clicked, or lost to `body`
      // when the panel became inert) would stay outside the modal. Bring it back in.
      const reopened = open && !wasOpen.current && wasMounted.current;
      const content = contentNode.current;
      if (reopened && content && !content.contains(document.activeElement)) content.focus();
      wasOpen.current = open;
      wasMounted.current = wrapperRef.current !== null;
    });
    // Safety net: Radix's Presence unmounts on `animationend` / `animationcancel` only. If the
    // animation never ends (paused by the host, a stylesheet that names the animation without
    // defining it) the page would stay locked behind a closed panel for good: after the animation's
    // own duration plus a margin the panel is removed outright.
    const [expired, setExpired] = useState(false);
    useEffect(() => {
      if (open) {
        setExpired(false);
        return undefined;
      }
      const wrapper = wrapperRef.current;
      if (!wrapper) return undefined;
      const timer = setTimeout(() => setExpired(true), animationTotalMs(wrapper) + 500);
      return () => clearTimeout(timer);
    }, [open]);
    if (expired && !open) return null;

    return (
      <RadixDialog.Portal>
        <div
          ref={wrapperRef}
          className={cn(MODAL_WRAPPER, overlayLayer.modal)}
          data-state={open ? 'open' : 'closed'}
        >
          <MountedReporter report={setPanelMounted} />
          <RadixDialog.Overlay className={cn(MODAL_BACKDROP, overlayLayer.backdrop)} />
          <RadixDialog.Content
            aria-modal="true"
            {...rest}
            ref={setNode}
            className={panelClassName}
            // The return of the focus is `useReturnFocus`'s (opener-agnostic), not Radix's.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              onCloseAutoFocus?.(event);
            }}
            onEscapeKeyDown={(event) => {
              if (!dismissible) event.preventDefault();
              onEscapeKeyDown?.(event);
            }}
            onPointerDownOutside={(event) => {
              if (!dismissible || beganBeforeOpening(event)) event.preventDefault();
              onPointerDownOutside?.(event);
            }}
            onInteractOutside={(event) => {
              if (!dismissible || beganBeforeOpening(event)) event.preventDefault();
              onInteractOutside?.(event);
            }}
          >
            {children}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    );
  },
);

/** Top row: title (and description) plus, typically, a close button. Never scrolls away. */
export const ModalHeader = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ModalHeader(
  { className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={cn('flex shrink-0 items-start justify-between gap-3 border-b border-rop-border px-6 py-4', className)}
    />
  );
});

export interface ModalTitleProps extends ComponentPropsWithoutRef<typeof RadixDialog.Title> {
  /** Hides the title visually; it stays in the accessible name of the panel. */
  visuallyHidden?: boolean;
}

/** The panel's accessible name. */
export const ModalTitle = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Title>, ModalTitleProps>(function ModalTitle(
  { visuallyHidden = false, className, ...rest },
  ref,
) {
  return (
    <RadixDialog.Title
      {...rest}
      ref={ref}
      className={cn(
        'm-0 min-w-0 flex-1 text-rop-title-md font-[600] [overflow-wrap:anywhere]',
        visuallyHidden && 'sr-only',
        className,
      )}
    />
  );
});

/** The panel's accessible description. */
export const ModalDescription = /* @__PURE__ */ forwardRef<
  ElementRef<typeof RadixDialog.Description>,
  ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(function ModalDescription({ className, ...rest }, ref) {
  return (
    <RadixDialog.Description
      {...rest}
      ref={ref}
      className={cn('m-0 text-rop-body text-rop-text-muted', className)}
    />
  );
});

/**
 * The only part that scrolls. When its content overflows it becomes focusable, so a keyboard user
 * can scroll it. A wide child (table) scrolls horizontally inside it; the panel never widens.
 */
export const ModalBody = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ModalBody(
  { className, tabIndex, ...rest },
  ref,
) {
  const node = useRef<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = node.current;
    if (!el) return undefined;
    const measure = () => setScrollable(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      node.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  return (
    <div
      {...rest}
      ref={setRef}
      tabIndex={tabIndex ?? (scrollable ? 0 : undefined)}
      className={cn(
        'min-h-0 min-w-0 flex-1 overflow-auto px-6 py-4 text-rop-body focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:-outline-offset-2',
        className,
      )}
    />
  );
});

/** Bottom row for the actions. Never scrolls away. */
export const ModalFooter = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ModalFooter(
  { className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={cn('flex shrink-0 flex-wrap justify-end gap-2 border-t border-rop-border px-6 py-3', className)}
    />
  );
});

export type ModalCloseProps = ComponentPropsWithoutRef<typeof RadixDialog.Close>;

/**
 * Closes the panel. With no children and no `asChild` it renders the default close button: a ghost
 * `icon-xs` `Button` with the close icon, named "Chiudi: <title>" (from the panel's title) unless
 * you pass `aria-label` / `aria-labelledby`. With `children` / `asChild` it is Radix's plain Close.
 */
export const ModalClose = /* @__PURE__ */ forwardRef<HTMLButtonElement, ModalCloseProps>(function ModalClose(props, ref) {
  const { asChild, children, ...rest } = props;
  if (asChild || children !== undefined) {
    return (
      <RadixDialog.Close {...rest} asChild={asChild} ref={ref}>
        {children}
      </RadixDialog.Close>
    );
  }
  return <DefaultClose {...rest} forwardedRef={ref} />;
});

function DefaultClose({
  forwardedRef,
  className,
  ...rest
}: Omit<ModalCloseProps, 'asChild' | 'children'> & { forwardedRef: ForwardedRef<HTMLButtonElement> }) {
  const node = useRef<HTMLButtonElement | null>(null);
  const [titleId, setTitleId] = useState<string | null>(null);
  const ownName = !!rest['aria-label']?.trim() || !!rest['aria-labelledby']?.trim();
  // The title's id belongs to Radix's context (not exposed) and is put on the panel node only
  // once the title has registered: read it from there and follow it.
  useLayoutEffect(() => {
    const dialog = node.current?.closest('[role="dialog"]');
    if (!dialog) return undefined;
    const read = () => setTitleId(dialog.getAttribute('aria-labelledby'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(dialog, { attributes: true, attributeFilter: ['aria-labelledby'] });
    return () => observer.disconnect();
  }, []);
  const generatedId = useId();
  const closeId = rest.id ?? generatedId;
  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      node.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );
  const naming = ownName
    ? {}
    : titleId
      ? { 'aria-label': 'Chiudi:', 'aria-labelledby': `${closeId} ${titleId}` }
      : { 'aria-label': 'Chiudi' };
  return (
    <RadixDialog.Close asChild>
      <Button {...({ ...naming, ...rest } as { 'aria-label': string })} id={closeId} ref={setRef} variant="ghost" size="icon-xs" className={className}>
        {internalIcons.close}
      </Button>
    </RadixDialog.Close>
  );
}
