// Internal: everything `Dialog` and `Sheet` have in common (#11, #12). Not exported from the package.
// The two public components only add what differs: the panel's position and size, and the names
// of their parts (error messages, console warning).
import {
  cloneElement,
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
  type ComponentType,
  type ElementRef,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Button, ghostIconXsButtonClass, ICON_XS_BUTTON_ICON_SIZE } from '../button/Button';
import { iconClass } from '../icon/Icon';
import { overlayLayer } from '../overlay/layers';
import { useReturnFocus } from '../overlay/use-return-focus';
import { cn } from '../utils/cn';
import { internalIcons } from './icons';
import { useBeganBeforeOpening } from './outside-interaction';

interface ModalContextValue {
  /** Where the content publishes its `returnFocusRef`, read by `useReturnFocus` at close time. */
  fallbackHolder: { current: RefObject<HTMLElement | null> | undefined };
  /** The trigger node, if any: the last-resort target when the focus never sat on the opener. */
  triggerHolder: { current: HTMLElement | null };
  /** Whether the panel is open (the requested state, not whether its node is still mounted). */
  open: boolean;
  /** Reported by the portal's content: true while the panel node exists, including its exit animation. */
  setPanelMounted: (mounted: boolean) => void;
  /** Asks the root to close, as Radix's own dismissal does (`onOpenChange(false)`). Stable. */
  requestClose: () => void;
}

/** What a panel lends the others: the whole Escape, as its own Radix layer handles it. */
interface PanelLayer {
  /** `dismissible`, `onEscapeKeyDown`, then the close (`requestClose`) unless the default was prevented. */
  escape: (event: KeyboardEvent) => void;
}

/**
 * The layers of the modal panels (content node -> panel), in the order Radix's `DismissableLayer` keeps
 * its own. It is not an order of ours: it changes on the same event as Radix's. Each panel holds its
 * layer node in state, set by the same ref callback chain as Radix's own `node` state (Radix composes
 * the panel's ref with its setter), so the two change in the same render; and an effect of the same
 * form as the one that registers the layer (`[node]`, added on setup, removed on cleanup) runs in the
 * same commit, right after Radix's (the layer is a descendant of the panel, effects run children
 * first). A node joins at the end when its layer registers and leaves when it unregisters, so whatever
 * makes Radix move a layer to the top moves it here too: a new node (a remount, a parent's `key`);
 * effects that disconnect and reconnect on the same node (`<Activity>` hidden and shown again,
 * StrictMode's double run); a ref detached and attached again (a `<Suspense>` that suspends its shown
 * content). A panel reopened during its exit keeps its node and its registration, so it keeps its
 * place, as in Radix. Restricted to modal panels, it is a subsequence of Radix's order.
 *
 * What lags is Radix's keydown listener: it sits on the layer that was the highest at its last
 * render, and the other layers re-render after a registration only through an update React schedules
 * as a task, one or two frames later on an idle page and longer on a busy one. An Escape in that gap
 * reached the panel underneath, which closed, and with it the nested panel on top (#714).
 */
const layerOrder = new Map<HTMLElement, PanelLayer>();

/**
 * Escapes already handed to the panel on top in place of Radix's pick. In the same gap, several
 * layers can be listening at once (panels remounted together, e.g. by a parent's `key`: each new layer
 * counts itself the highest until the layers re-render), so the same press reaches the lower ones and
 * the top one's own listener too. The panel on top handles it once.
 */
const redirectedEscapes = new WeakSet<Event>();

/** True when the focus sits inside a modal that is open (not one that is exiting). */
function focusIsInOpenModal(): boolean {
  const active = document.activeElement;
  return !!active?.closest('[role="dialog"][data-state="open"]');
}

const ModalContext =/* @__PURE__ */ createContext<ModalContextValue | null>(null);

/**
 * What a panel tells the parts rendered inside it (#721). Given by `ModalPanel` around its children, so a part of a
 * nested panel (a Dialog opened from a Sheet) talks to its own panel, never to the one underneath.
 */
interface PanelPartsValue {
  /** Called by every `ModalClose` while it is mounted in the panel; returns the function that unregisters it. */
  registerClose: () => () => void;
  /** Called by every `ModalHeader` while it is mounted in the panel; returns the function that unregisters it. */
  registerHeader: () => () => void;
  /** Whether the panel draws its own close button over the end of the header (the header keeps room for it). */
  defaultCloseShown: boolean;
  /** Whether the default close buttons of the panel are 44 x 44 px under a coarse pointer (Sheet). */
  touchTargets: boolean;
}

const PanelPartsContext = /* @__PURE__ */ createContext<PanelPartsValue | null>(null);

// Under a coarse pointer (a phone, a tablet) the default close button of a Sheet is 44 x 44 px, the touch target of
// WCAG 2.5.5 and of the platforms' guidelines; with a precise pointer it keeps the `icon-xs` size (24 x 24).
const TOUCH_CLOSE = 'pointer-coarse:size-11';
// The panel's own close button sits where a `SheetClose` at the end of the header would: at the top end corner.
// After the children in the DOM, so it is the last Tab stop and never takes the opening focus from a field.
const DEFAULT_CLOSE_PLACE = 'absolute top-4 end-6 pointer-coarse:top-2 pointer-coarse:end-2';
// Room the header keeps at its end for that button (24 px from the edge + 24 px + a 12 px gap; 8 + 44 + 12 under a
// coarse pointer: 64 px in both cases).
const DEFAULT_CLOSE_HEADER_ROOM = 'pe-16';
// With no header, the panel keeps that room above its first part instead: an element of its own (first in the
// panel), not a padding of the panel, which a `p-*` / `py-*` in the consumer's `className` would take away.
const DEFAULT_CLOSE_TOP_ROOM = 'h-8 shrink-0 pointer-coarse:h-10';

function useModalContext(part: string, root: string): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error(`${process.env.NODE_ENV !== 'production' ? '[formrail] ' : ''}<${part}> must be rendered inside <${root}>.`);
  return ctx;
}

export interface ModalRootProps {
  /** Controlled open state. With it, the panel behaves the same whoever sets it (trigger, button, effect). */
  open?: boolean;
  /**
   * Initial state when uncontrolled. A panel mounted open has no opener to return the focus to.
   * @default false
   */
  defaultOpen?: boolean;
  /** Called with the requested state (Escape, backdrop, close button, trigger). */
  onOpenChange?: (open: boolean) => void;
  /** The trigger and the content of the dialog / sheet. */
  children?: ReactNode;
}

/**
 * Props of `ModalRoot` that only the library's own components pass. Not part of `DialogProps` /
 * `SheetProps` (they are `ModalRootProps`), never exported from the package.
 */
export interface ModalRootInternalProps extends ModalRootProps {
  /**
   * Checked when the focus is about to be returned, after "the focus is in another open modal":
   * `true` leaves the focus where it is. For a component that hands the focus on itself when it
   * closes (`AppSwitcher`: to its trigger, then the consumer's `onNavigate` may move it to the new
   * page), so the return after the exit animation does not take it back. Default: none, as `Dialog`
   * and `Sheet`.
   */
  keepFocusWhen?: () => boolean;
}

/**
 * Modal root (wraps `@radix-ui/react-dialog`). The open state is tracked here, not only inside
 * Radix, so that `useReturnFocus` sees every way of opening: with the trigger, or from application
 * state with no trigger at all. The focus returns to the element that had it before opening (or to
 * the content's `returnFocusRef`), never through Radix's own trigger-only return.
 */
export function ModalRoot({ open, defaultOpen = false, onOpenChange, keepFocusWhen, children }: ModalRootInternalProps) {
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
  useReturnFocus({
    open: current || panelMounted,
    fallbackRef,
    skipWhen: keepFocusWhen ? () => focusIsInOpenModal() || keepFocusWhen() : focusIsInOpenModal,
  });

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (open === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );
  // Through a ref, so the context value does not change with an inline `onOpenChange`.
  const handleOpenChangeRef = useRef(handleOpenChange);
  useLayoutEffect(() => {
    handleOpenChangeRef.current = handleOpenChange;
  });
  const requestClose = useCallback(() => handleOpenChangeRef.current(false), []);

  const ctx = useMemo(
    () => ({ fallbackHolder, triggerHolder, open: current, setPanelMounted, requestClose }),
    [current, requestClose],
  );
  return (
    <ModalContext.Provider value={ctx}>
      <RadixDialog.Root open={current} onOpenChange={handleOpenChange}>
        {children}
      </RadixDialog.Root>
    </ModalContext.Provider>
  );
}

export interface ModalTriggerProps extends ComponentPropsWithoutRef<typeof RadixDialog.Trigger> {
  /** Renders your single child element (e.g. a `Button`) instead of the default `<button>`, with the trigger's props and behavior merged onto it. */
  asChild?: boolean;
}

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

type RadixContentProps = ComponentPropsWithoutRef<typeof RadixDialog.Content>;

/**
 * The Radix props `DialogContent` and `SheetContent` pass through. The ones `ModalPanel` intercepts, or
 * whose Radix description does not hold for a modal panel, are redeclared (same types) with the TSDoc
 * the props table shows: Radix's text would promise what the wrapper does not do (ticket #401).
 * `deferPointerDownOutside` keeps Radix's own text: the wrapper does not change it.
 */
export interface ModalContentBaseProps extends Omit<RadixContentProps, 'children' | 'forceMount'> {
  /**
   * Called when the panel opens, just before the focus moves into it (to its first focusable
   * element, or to the panel itself when it has none). Call `event.preventDefault()` and focus an
   * element of the panel yourself to choose where the focus starts. Not called when an element of
   * the panel already took the focus (`autoFocus`), nor when the panel is reopened while its exit
   * animation is still running: its nodes never left the DOM, and the panel itself takes the focus.
   */
  onOpenAutoFocus?: RadixContentProps['onOpenAutoFocus'];
  /**
   * Called once the panel has closed and left the DOM (after its exit animation). It does not
   * control the focus: the component returns it itself, to the element that had it before opening
   * (else `returnFocusRef`, else the trigger). So `event.preventDefault()` has no effect, and a focus
   * moved from here can be overridden by that return, which may run right after this call. Not
   * called when the panel is reopened before its exit animation ends.
   */
  onCloseAutoFocus?: RadixContentProps['onCloseAutoFocus'];
  /**
   * Called on Escape while the panel is the topmost layer (a menu, popover or tooltip open above it
   * gets the Escape instead), before the panel closes. Call `event.preventDefault()` to keep it open. With
   * `dismissible={false}` it is still called, and the panel stays open whatever it does.
   */
  onEscapeKeyDown?: RadixContentProps['onEscapeKeyDown'];
  /**
   * Called on a pointer press outside the panel (in practice on the backdrop), before it closes.
   * Call `event.preventDefault()` to keep it open. Still called, with the panel staying open
   * whatever it does, for a press that is not a dismissal: with `dismissible={false}`, a right or
   * Ctrl+click, and the late press of the tap that reopened the panel during its exit animation.
   */
  onPointerDownOutside?: RadixContentProps['onPointerDownOutside'];
  /**
   * Called when the focus moves outside the panel. The panel never closes for it (it is modal: the
   * focus is kept inside), so there is nothing to prevent.
   */
  onFocusOutside?: RadixContentProps['onFocusOutside'];
  /**
   * Called on any interaction outside the panel, right after `onPointerDownOutside` or
   * `onFocusOutside`, with the same event. Call `event.preventDefault()` to keep the panel open
   * after a pointer press; the same presses as there, and a focus moving out, never close it
   * whatever it does.
   */
  onInteractOutside?: RadixContentProps['onInteractOutside'];
}

export interface ModalPanelProps extends ModalContentBaseProps {
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
  /**
   * The touch exit of #721 (Sheet only; `undefined` for a Dialog, which keeps none of it). `true`: while the panel
   * has no `ModalClose` of its own, it draws one (named `closeLabel`, else "Close: `<title>`"). `false`: it never
   * does. In both cases its default close buttons are 44 x 44 px under a coarse pointer, and in development a
   * dismissible panel that was open with no close button at all is reported once, when it closes.
   */
  closeButton?: boolean;
  /** Accessible name of the panel's own close button; else "Close: `<title>`" (see `ModalClose`). */
  closeLabel?: string;
  /**
   * What draws the panel's own close button (`ModalOwnClose`), given by the Sheet. A prop rather than a direct
   * reference, so a Dialog (which never draws one) does not ship that button and its `Button` in its bundle.
   */
  closeSlot?: ComponentType<ModalOwnCloseProps>;
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
      closeButton,
      closeLabel,
      closeSlot: CloseSlot,
      onCloseAutoFocus,
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
      children,
      ...rest
    },
    forwardedRef,
  ) {
    const { fallbackHolder, open, setPanelMounted, requestClose } = useModalContext(part, root);
    useLayoutEffect(() => {
      fallbackHolder.current = returnFocusRef;
    });

    // #721: the touch exit. A touch screen has no Escape key, and a panel as wide as the screen leaves no backdrop
    // to tap, so a close button is the only way out a finger has. The panel counts the `ModalClose`s and headers
    // rendered in it (in state, for what it draws; the closes in a ref too, for the check below, which must see
    // the count of the commit it runs in, not of the last render).
    const touchExit = closeButton !== undefined;
    const [closeCount, setCloseCount] = useState(0);
    const [headerCount, setHeaderCount] = useState(0);
    const mountedCloses = useRef(0);
    // Whether a `ModalClose` was mounted in the panel at some point since it opened: one that arrives later (the
    // content is loaded asynchronously) counts as much as one rendered at once.
    const closeSeen = useRef(false);
    const registerClose = useCallback(() => {
      mountedCloses.current += 1;
      closeSeen.current = true;
      setCloseCount((count) => count + 1);
      return () => {
        mountedCloses.current -= 1;
        setCloseCount((count) => count - 1);
      };
    }, []);
    const registerHeader = useCallback(() => {
      setHeaderCount((count) => count + 1);
      return () => setHeaderCount((count) => count - 1);
    }, []);
    // With `asChild` the panel is the consumer's element: nothing can be added to its children.
    const canDrawClose = closeButton === true && dismissible && !rest.asChild && CloseSlot !== undefined;
    // Set by the slot after the children once their own registrations have run (see `ModalOwnClose`), so a
    // `ModalClose` rendered at once never shows the panel's button for a frame next to it.
    const [slotReady, setSlotReady] = useState(false);
    const defaultCloseShown = canDrawClose && slotReady && closeCount === 0;
    const parts = useMemo<PanelPartsValue>(
      () => ({ registerClose, registerHeader, defaultCloseShown, touchTargets: touchExit }),
      [registerClose, registerHeader, defaultCloseShown, touchExit],
    );
    // In development: a dismissible panel that was open with no close button at all (`closeButton={false}`, or
    // `asChild`, and no `ModalClose` mounted) is reported once per instance, when it closes. Not at the mount: a
    // close button that comes with content loaded later would make any earlier moment a false report. Not with
    // `dismissible={false}`: there the way out is an action of the panel, by contract.
    const wasOpenForExit = useRef(open);
    const warnedNoExit = useRef(false);
    useLayoutEffect(() => {
      const wasOpen = wasOpenForExit.current;
      wasOpenForExit.current = open;
      // Each opening starts its own record: with the closes mounted at that moment (the children's layout effects ran
      // first, and a close still mounted from the exit animation of the previous opening counts), plus every one
      // registered while it lasts. Not reset at the close: during the exit animation the closes are still mounted,
      // and they would count for an opening that has none.
      if (open && !wasOpen) closeSeen.current = mountedCloses.current > 0;
      if (open || !wasOpen) return;
      const seen = closeSeen.current;
      if (process.env.NODE_ENV === 'production' || !touchExit || !dismissible || canDrawClose || seen || warnedNoExit.current) return;
      warnedNoExit.current = true;
      console.warn(
        `[formrail] <${part}> was open with no close button: on a touch screen (no Escape key) only the backdrop could close it, and a panel as wide as the screen leaves none. Render a <${root}Close> (or wrap your own button in <${root}Close asChild>), keep closeButton on, or pass dismissible={false} if only an action of the panel may close it.`,
      );
    }, [open, touchExit, dismissible, canDrawClose, part, root]);

    // The panel's part of an Escape, before Radix's dismissal (which closes unless it was prevented).
    const ownEscape = (event: KeyboardEvent) => {
      if (!dismissible) event.preventDefault();
      onEscapeKeyDown?.(event);
    };
    const ownEscapeRef = useRef(ownEscape);
    useLayoutEffect(() => {
      ownEscapeRef.current = ownEscape;
    });
    const contentNode = useRef<HTMLDivElement | null>(null);
    // This panel's entry in `layerOrder`. Never replaced: a new entry would move the layer to the top.
    const panelEscapeRef = useRef<(event: KeyboardEvent) => void>(() => {});
    useLayoutEffect(() => {
      panelEscapeRef.current = (event) => {
        ownEscapeRef.current(event);
        if (!event.defaultPrevented) requestClose();
      };
    });
    const [layer] = useState<PanelLayer>(() => ({ escape: (event) => panelEscapeRef.current(event) }));
    // The layer node as Radix's `DismissableLayer` holds it: state, set by the same ref callback chain
    // as Radix's own `node` state (this panel's `setNode` is the ref Radix composes with its setter), so
    // both change in the same render; and an effect of the same form as the one that registers the
    // layer (`[node]`, added on setup, removed on cleanup), which runs in the same commit, right after
    // Radix's (the layer is a descendant of this panel). See `layerOrder`.
    const [layerNode, setLayerNode] = useState<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!layerNode) return undefined;
      layerOrder.set(layerNode, layer);
      return () => {
        layerOrder.delete(layerNode);
      };
    }, [layerNode, layer]);
    // See `useBeganBeforeOpening`: a late outside dismissal of the tap that reopened the panel.
    const beganBeforeOpening = useBeganBeforeOpening(open);

    const cleanupRef = useRef<(() => void) | null>(null);
    const setNode = useCallback(
      (node: HTMLDivElement | null) => {
        contentNode.current = node;
        setLayerNode(node);
        cleanupRef.current?.();
        cleanupRef.current = null;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
        if (!node) return;
        const stopTracking = trackVisualViewport(node);
        // Radix sets `aria-labelledby` only after the title has registered (a re-render following
        // the mount), so the name is checked one frame later, on the settled DOM.
        const frame = process.env.NODE_ENV !== 'production'
          ? requestAnimationFrame(() => {
              if (node.isConnected && !hasAccessibleName(node)) {
                console.error(
                  `[formrail] <${part}> has no accessible name: render a <${title}> (use visuallyHidden to hide it) or pass aria-label / aria-labelledby.`,
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
    // `dismissible={false}` must mean "the focus stays inside" too, not only "it does not close": a
    // press on the backdrop (not focusable) makes the browser move the focus to `body`, and the focus
    // trap does not bring it back from there. Its default is prevented, the focus stays put. It listens
    // to `pointerdown` (one event for mouse, touch and pen; the same convention as the outside-press
    // handling elsewhere in the library) in capture phase, and it never stops the propagation, so
    // Radix still sees the press (and `dismissible={false}` still keeps it from closing). Limited to
    // the panel's own wrapper (backdrop): a popover portaled above the modal is a different layer and
    // keeps its normal focus behaviour. (The Tailwind scan reads comments too: no utility names here.)
    useEffect(() => {
      if (dismissible || !open) return undefined;
      const keepFocus = (event: PointerEvent) => {
        const wrapper = wrapperRef.current;
        const content = contentNode.current;
        const target = event.target;
        if (wrapper && target instanceof Node && wrapper.contains(target) && !content?.contains(target)) {
          event.preventDefault();
        }
      };
      document.addEventListener('pointerdown', keepFocus, true);
      return () => document.removeEventListener('pointerdown', keepFocus, true);
    }, [dismissible, open]);
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
          <PanelPartsContext.Provider value={parts}>
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
              // Radix's listener is on the layer that was the highest at its last render. If Radix has
              // since registered a layer above it (see `layerOrder`), the layers have not re-rendered
              // yet: the Escape is that layer's, as it will be once Radix catches up (open or exiting,
              // as at rest), and this panel's own dismissal is prevented. Otherwise Radix's choice stands.
              // A press already handed over is done (prevented then): see `redirectedEscapes`.
              if (redirectedEscapes.has(event)) return;
              let top: [HTMLElement, PanelLayer] | undefined;
              for (const registered of layerOrder) top = registered;
              if (top && top[0] !== contentNode.current) {
                redirectedEscapes.add(event);
                top[1].escape(event);
                event.preventDefault();
                return;
              }
              ownEscape(event);
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
            {rest.asChild ? (
              children
            ) : (
              <>
                {defaultCloseShown && headerCount === 0 ? (
                  <div aria-hidden="true" data-rop-close-room="" className={DEFAULT_CLOSE_TOP_ROOM} />
                ) : null}
                {children}
                {canDrawClose ? (
                  <CloseSlot show={defaultCloseShown} label={closeLabel} part={part} report={setSlotReady} />
                ) : null}
              </>
            )}
          </RadixDialog.Content>
          </PanelPartsContext.Provider>
        </div>
      </RadixDialog.Portal>
    );
  },
);

/** Props `ModalPanel` gives its `closeSlot`. */
export interface ModalOwnCloseProps {
  /** Whether the button is drawn (no `ModalClose` is mounted in the panel). */
  show: boolean;
  /** Its accessible name, used as given (a blank one is an error in development); else "Close: `<title>`". */
  label: string | undefined;
  /** The name of the panel's component, for the development error. */
  part: string;
  /** Called with `true` once the slot's layout effect has run (after the children's), `false` when it unmounts. */
  report: (ready: boolean) => void;
}

/**
 * The panel's own close button (#721), after the children. Its layout effect runs after theirs (siblings in order),
 * so by then every `ModalClose` rendered with the content has registered: it reports itself ready, and the panel
 * draws the button only if none did, in the same commit, before anything is painted. Passed as `closeSlot` by the
 * Sheet only.
 */
export function ModalOwnClose({ show, label, part, report }: ModalOwnCloseProps) {
  useLayoutEffect(() => {
    report(true);
    return () => report(false);
  }, [report]);
  return show ? <OwnCloseButton label={label} part={part} /> : null;
}

/**
 * The button itself: a plain Radix `Close` with the classes of a ghost `icon-xs` `Button` and of an `Icon` (the same
 * helpers those components are drawn with), not the `Button` component, so that an isolated `SheetContent` import
 * does not ship `Button` with its `asChild` branch and its label typography for one icon button. Named like the
 * default `ModalClose`.
 */
function OwnCloseButton({ label, part }: { label: string | undefined; part: string }) {
  const own = label !== undefined;
  const { naming, closeId, setRef } = useCloseNaming(own, undefined, null);
  // §1.13.1 (rule of absent values): `''` is not `undefined`. A given label is used as given, never replaced by the
  // default; a blank one leaves the button without a name, which is reported in development.
  const blank = own && label.trim() === '';
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && blank) {
      console.error(
        `[formrail] <${part}> labels.close is blank: the sheet's own close button has no accessible name. Pass a text, or leave the key out for the default "Close: <title>".`,
      );
    }
  }, [blank, part]);
  return (
    <RadixDialog.Close
      {...(own ? { 'aria-label': label } : naming)}
      id={closeId}
      ref={setRef}
      className={cn(ghostIconXsButtonClass(), TOUCH_CLOSE, DEFAULT_CLOSE_PLACE)}
      data-rop-default-close=""
    >
      {cloneElement(internalIcons.close, {
        className: iconClass(ICON_XS_BUTTON_ICON_SIZE),
        'aria-hidden': true,
        focusable: 'false',
      })}
    </RadixDialog.Close>
  );
}

/**
 * Top row: title (and description) plus, typically, a close button. Never scrolls away. While the panel draws its
 * own close button (#721, a Sheet with no `SheetClose`) it keeps room at its end for it.
 */
export const ModalHeader = /* @__PURE__ */ forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ModalHeader(
  { className, ...rest },
  ref,
) {
  const parts = useContext(PanelPartsContext);
  const register = parts?.registerHeader;
  useLayoutEffect(() => register?.(), [register]);
  return (
    <div
      {...rest}
      ref={ref}
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-rop-border px-6 py-4',
        parts?.defaultCloseShown && DEFAULT_CLOSE_HEADER_ROOM,
        className,
      )}
    />
  );
});

export interface ModalTitleProps extends ComponentPropsWithoutRef<typeof RadixDialog.Title> {
  /**
   * Hides the title visually; it stays in the accessible name of the panel.
   * @default false
   */
  visuallyHidden?: boolean;
  /** Renders your single child element instead of the default `<h2>`, with the title's props merged onto it. */
  asChild?: boolean;
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

export interface ModalDescriptionProps extends ComponentPropsWithoutRef<typeof RadixDialog.Description> {
  /** Renders your single child element instead of the default `<p>`, with the description's props merged onto it. */
  asChild?: boolean;
}

/** The panel's accessible description. */
export const ModalDescription = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixDialog.Description>, ModalDescriptionProps>(function ModalDescription({ className, ...rest }, ref) {
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

export interface ModalCloseProps extends ComponentPropsWithoutRef<typeof RadixDialog.Close> {
  /** Renders your single child element (e.g. a `Button`) instead of the default close button, with the close behavior merged onto it. */
  asChild?: boolean;
}

/**
 * Closes the panel. With no children and no `asChild` it renders the default close button: a ghost
 * `icon-xs` `Button` with the close icon, named "Close: `<title>`" (from the panel's title) unless
 * you pass `aria-label` / `aria-labelledby` (in a Sheet, 44 x 44 px under a coarse pointer). With `children` /
 * `asChild` it is Radix's plain Close.
 */
export const ModalClose = /* @__PURE__ */ forwardRef<HTMLButtonElement, ModalCloseProps>(function ModalClose(props, ref) {
  const { asChild, children, ...rest } = props;
  // Every close of the panel, the default button and `asChild` / `children` alike, is a way out (#721).
  const register = useContext(PanelPartsContext)?.registerClose;
  useLayoutEffect(() => register?.(), [register]);
  if (asChild || children !== undefined) {
    return (
      <RadixDialog.Close {...rest} asChild={asChild} ref={ref}>
        {children}
      </RadixDialog.Close>
    );
  }
  return <DefaultClose {...rest} forwardedRef={ref} />;
});

/**
 * The accessible name of a default close button, shared by `ModalClose` and the Sheet's own button: "Close: `<title>`"
 * (the button's `id` and the title's, read from the panel and followed as the title registers), "Close" with no
 * title, nothing of its own when the caller names the button (`ownName`).
 */
function useCloseNaming(ownName: boolean, id: string | undefined, forwardedRef: ForwardedRef<HTMLButtonElement>) {
  const node = useRef<HTMLButtonElement | null>(null);
  const [titleId, setTitleId] = useState<string | null>(null);
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
  const closeId = id ?? generatedId;
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
      ? { 'aria-label': 'Close:', 'aria-labelledby': `${closeId} ${titleId}` }
      : { 'aria-label': 'Close' };
  return { naming, closeId, setRef };
}

function DefaultClose({
  forwardedRef,
  className,
  ...rest
}: Omit<ModalCloseProps, 'asChild' | 'children'> & { forwardedRef: ForwardedRef<HTMLButtonElement> }) {
  const touchTargets = !!useContext(PanelPartsContext)?.touchTargets;
  const ownName = !!rest['aria-label']?.trim() || !!rest['aria-labelledby']?.trim();
  const { naming, closeId, setRef } = useCloseNaming(ownName, rest.id, forwardedRef);
  return (
    <RadixDialog.Close asChild>
      <Button {...({ ...naming, ...rest } as { 'aria-label': string })} id={closeId} ref={setRef} variant="ghost" size="icon-xs" className={cn(touchTargets && TOUCH_CLOSE, className)}>
        {internalIcons.close}
      </Button>
    </RadixDialog.Close>
  );
}
