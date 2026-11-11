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
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { adjacentTabbable } from '../internal/focus';
import { useTouchOutsideSwallow } from '../internal/outside-interaction';
import { composeRefs } from '../utils/compose-refs';
import { overlayLayer } from '../overlay/layers';
import { useReturnFocus } from '../overlay/use-return-focus';
import { cn } from '../utils/cn';

type OpenedBy = 'pointer' | 'first' | 'last';

interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: { current: HTMLElement | null };
  contentRef: { current: HTMLDivElement | null };
  openedBy: { current: OpenedBy };
  mounted: { current: boolean };
  /** Set by Tab when there is nowhere to go: the focus leaves the page, it is not given back to the trigger. */
  skipReturn: { current: boolean };
  modal: boolean;
}

const MenuContext = /* @__PURE__ */ createContext<MenuContextValue | null>(null);

function useMenuContext(part: string): MenuContextValue {
  const context = useContext(MenuContext);
  if (!context) throw new Error(`[formrail] <${part}> must be rendered inside <Menu>.`);
  return context;
}

export interface MenuProps {
  /** The `MenuTrigger` and the `MenuContent`. */
  children?: ReactNode;
  /**
   * Controlled open state. Whatever opens the menu (the trigger, or the application setting `open`),
   * the focus goes to the first enabled item, and back to where it was when the menu closes.
   * `onOpenChange` reports the user's opening and closing, not the application's own changes.
   */
  open?: boolean;
  /** Open state at mount, when `open` is not controlled. Default `false`. */
  defaultOpen?: boolean;
  /** Called when the user opens or closes the menu (trigger, Escape, outside click, an item's selection). */
  onOpenChange?: (open: boolean) => void;
  /**
   * Modal (default `true`): the page behind is inert while the menu is open, and an outside click or
   * tap only closes it (it never reaches what is underneath). With `false` the page stays
   * interactive.
   */
  modal?: boolean;
  /** Reading direction. Default: inherited. */
  dir?: 'ltr' | 'rtl';
}

/**
 * Menu button pattern (wraps `@radix-ui/react-dropdown-menu`): a trigger and a `role="menu"` in a
 * portal, on the `popover` level (above a Dialog or Sheet). The focus returns to the trigger on
 * close through `useReturnFocus`, however the menu was opened (trigger or `open` state).
 *
 * Declared limits:
 * - If the trigger is unmounted while the menu is open the menu closes and the focus is left alone.
 * - Do not give the trigger an `id` (or an `asChild` child with one): the menu takes its name from
 *   the trigger through the id Radix generates for it.
 * - Opening a `Dialog` from an item: pass the trigger's ref as the dialog's `returnFocusRef`, so the
 *   focus comes back to the trigger when the dialog closes.
 * - Tab closes the menu and moves the focus to the next tabbable element after the trigger (inside
 *   the enclosing modal `Dialog`/`Sheet` when there is one, wrapping around); positive `tabindex`
 *   ordering is not honoured. With nothing tabbable beyond the trigger on a page, the focus leaves
 *   the page (it ends on `body`) and is not returned to the trigger.
 * - `MenuContent` `loop` (default `true`) wraps the arrow keys from the last item to the first and
 *   back; `loop={false}` stops at the ends. Typeahead and Home / End are Radix's and unaffected.
 */
export function Menu({ children, open: openProp, defaultOpen = false, onOpenChange, modal = true, dir }: MenuProps) {
  const controlled = openProp !== undefined;
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ? openProp : inner;
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openedBy = useRef<OpenedBy>('first');
  const mounted = useRef(true);
  const skipReturn = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const openRef = useRef(open);
  openRef.current = open;

  // Layout effect: its cleanup runs in the commit that removes the menu, before the microtask that
  // checks whether the trigger went away on its own.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInner(next);
      if (next !== openRef.current) onOpenChangeRef.current?.(next);
    },
    [controlled],
  );

  useReturnFocus({
    open,
    fallbackRef: triggerRef,
    skipWhen: () => {
      // Tab with nothing tabbable beyond the trigger: the focus leaves the page, as it would have
      // from the trigger itself, instead of bouncing back to it.
      if (skipReturn.current) {
        skipReturn.current = false;
        return true;
      }
      // Another overlay (a Dialog opened by an item) already took the focus: leave it there.
      const active = document.activeElement;
      return !!active && active !== document.body && !contentRef.current?.contains(active);
    },
  });

  const value = useMemo(
    () => ({ open, setOpen, triggerRef, contentRef, openedBy, mounted, skipReturn, modal }),
    [open, setOpen, modal],
  );
  return (
    <MenuContext.Provider value={value}>
      <RadixMenu.Root open={open} onOpenChange={setOpen} modal={modal} dir={dir}>
        {children}
      </RadixMenu.Root>
    </MenuContext.Provider>
  );
}

export interface MenuTriggerProps extends Omit<ComponentPropsWithoutRef<'button'>, 'id'> {
  /** Render the child as the trigger instead of a `<button>`. */
  asChild?: boolean;
}

/** The button that opens the menu: Enter, Space or ArrowDown open it on the first item, ArrowUp on the last. */
export const MenuTrigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, MenuTriggerProps>(
  function MenuTrigger(props, ref) {
    const { onKeyDown, onPointerDown, ...rest } = props;
    const menu = useMenuContext('MenuTrigger');
    const { triggerRef, openedBy, open, setOpen, modal, mounted } = menu;
    const openRef = useRef(open);
    openRef.current = open;
    // A trigger that goes away under an open menu closes it. The check is deferred a microtask: a
    // ref detached and re-attached in the same commit (StrictMode, a re-parent) is not an unmount,
    // and neither is the whole menu going away (then nothing is reported).
    const track = useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node;
        if (node) return;
        queueMicrotask(() => {
          if (mounted.current && !triggerRef.current && openRef.current) setOpen(false);
        });
      },
      [triggerRef, mounted, setOpen],
    );
    // `track` is stable, so `composed` changes only with the consumer's `ref`. An unstable ref (an
    // inline callback) detaches and re-attaches the node on every render: harmless because `track`
    // reacts to the detach in a microtask and by then the node is attached again in the same commit
    // (`triggerRef.current` is set again). Keep it that way: do not act synchronously on `null`.
    const composed = useMemo(() => composeRefs(ref, track), [ref, track]);
    return (
      <RadixMenu.Trigger
        {...rest}
        ref={composed}
        // A modal menu hides everything outside itself with `aria-hidden`, trigger included; a
        // focusable control under `aria-hidden` is an axe violation. The focus is in the panel while
        // open and comes back on close (a programmatic focus ignores tabindex).
        tabIndex={modal && open ? -1 : rest.tabIndex}
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
          onPointerDown?.(event);
          // Radix opens on the primary button only. `openedBy` is "pointer" just for the instant in
          // which that opening happens: a press that opens nothing (right button, a consumer that
          // refuses `onOpenChange(true)`) must not leave it set for a later opening from state.
          if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || rest.disabled) return;
          openedBy.current = 'pointer';
          setTimeout(() => {
            if (!openRef.current) openedBy.current = 'first';
          }, 0);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === 'ArrowUp' && !open && !(event.currentTarget as HTMLButtonElement).disabled) {
            event.preventDefault();
            openedBy.current = 'last';
            setOpen(true);
          } else if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
            openedBy.current = 'first';
          }
        }}
      />
    );
  },
);

type RadixMenuContentProps = ComponentPropsWithoutRef<typeof RadixMenu.Content>;

// The Radix props below are redeclared (same types) only to document them: Radix's own declarations
// carry no description, and the props table shows the TSDoc of the declaration (ticket #401).
export interface MenuContentProps extends Omit<RadixMenuContentProps, 'asChild' | 'forceMount'> {
  /**
   * Arrow-key navigation wraps from the last item to the first and back (default `true`). With
   * `false` it stops at the first / last item. (Radix's own default is `false`; this component
   * has always wrapped, so `true` is kept.)
   */
  loop?: boolean;
  /** The side of the trigger the menu opens on. Default `bottom`. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment of the menu against the trigger. Default `start`. */
  align?: 'start' | 'center' | 'end';
  /** Distance in px between the trigger and the menu. Default `4`. */
  sideOffset?: RadixMenuContentProps['sideOffset'];
  /** Offset in px from the `align` edge (`start` / `end`); ignored with `center`. Default `0`. */
  alignOffset?: RadixMenuContentProps['alignOffset'];
  /** Whether the menu flips side or shifts to stay inside the collision boundary. Default `true`. */
  avoidCollisions?: RadixMenuContentProps['avoidCollisions'];
  /** The element(s) the menu stays inside when `avoidCollisions` is on. Default: the viewport. */
  collisionBoundary?: RadixMenuContentProps['collisionBoundary'];
  /** Distance in px kept from the collision boundary edges (a number, or one per side). Default `8`. */
  collisionPadding?: RadixMenuContentProps['collisionPadding'];
  /** Padding in px between an arrow and the menu's corners. The menu draws no arrow, so it has no effect unless you add one. Default `0`. */
  arrowPadding?: RadixMenuContentProps['arrowPadding'];
  /** `partial` keeps the menu in the boundary on the align axis even when the trigger leaves it; `always` also keeps it when the trigger is fully out. Default `partial`. */
  sticky?: RadixMenuContentProps['sticky'];
  /** Hides the menu when the trigger is fully clipped out of view (e.g. scrolled away). Default `false`. */
  hideWhenDetached?: RadixMenuContentProps['hideWhenDetached'];
  /** `always` recomputes the position on every animation frame (for a trigger that moves without a scroll or resize); `optimized` only on layout changes. Default `optimized`. */
  updatePositionStrategy?: RadixMenuContentProps['updatePositionStrategy'];
  /** Called on Escape, before the menu closes. Call `event.preventDefault()` to keep it open. */
  onEscapeKeyDown?: RadixMenuContentProps['onEscapeKeyDown'];
  /** Called on a pointer press outside the menu, before it closes. Call `event.preventDefault()` to keep it open. */
  onPointerDownOutside?: RadixMenuContentProps['onPointerDownOutside'];
  /** Called when the focus moves outside the menu, before it closes. Call `event.preventDefault()` to keep it open. */
  onFocusOutside?: RadixMenuContentProps['onFocusOutside'];
  /** Called on any interaction outside the menu (pointer press or focus), before it closes. Call `event.preventDefault()` to keep it open. */
  onInteractOutside?: RadixMenuContentProps['onInteractOutside'];
}

// Full literals (Tailwind scan). The stacking level is `overlayLayer.popover`, set on the element.
// The library has no box-sizing reset, so the `max-h` subtracts what the box adds around its content
// (4px of padding and 1px of border on each side): the panel never exceeds the room that is left.
// The `10px` in the three `calc()` below is exactly that: 2 x (`p-1` = 4px) + 2 x (`border` = 1px).
// Change the padding or the border classes and this number with them.
const CONTENT =
  'min-w-[calc(10rem-10px)] max-w-[calc(var(--radix-dropdown-menu-content-available-width)-10px)] ' +
  'max-h-[calc(var(--radix-dropdown-menu-content-available-height)-10px)] ' +
  'overflow-y-auto overflow-x-hidden rounded-rop-md border border-rop-border bg-rop-surface p-1 font-rop-sans text-rop-body ' +
  'text-rop-text outline-none [box-shadow:0_4px_16px_rgb(0_0_0/0.2)]';

/**
 * Mounted with the panel: when the menu was not opened by a pointer (keyboard, or `open` state) the
 * focus goes to the first enabled item (the last for ArrowUp), else stays on the panel. Radix's
 * dropdown does not expose `onOpenAutoFocus`, and its focus scope focuses the panel in an effect
 * that runs after this one (it is an ancestor): the move waits for the end of that effect flush.
 */
function OpenFocus() {
  const { contentRef, openedBy } = useMenuContext('MenuContent');
  useEffect(() => {
    if (openedBy.current === 'pointer') return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      const panel = contentRef.current;
      if (cancelled || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])')];
      (openedBy.current === 'last' ? items[items.length - 1] : items[0])?.focus();
    });
    return () => {
      cancelled = true;
    };
  }, [contentRef, openedBy]);
  return null;
}

/** Modal menu, touch: a tap outside closes it and does not reach the page (see `useTouchOutsideSwallow`). */
function TouchOutsideGuard() {
  const { contentRef, triggerRef, setOpen, modal } = useMenuContext('MenuContent');
  const close = useCallback(() => setOpen(false), [setOpen]);
  useTouchOutsideSwallow({ enabled: modal, contentRef, anchorRef: triggerRef, close });
  return null;
}

/** The menu panel, in a portal on the `popover` level. Scrolls inside when the room runs out. */
export const MenuContent = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixMenu.Content>, MenuContentProps>(
  function MenuContent(props, ref) {
    const {
      className,
      side = 'bottom',
      align = 'start',
      loop = true,
      sideOffset = 4,
      collisionPadding = 8,
      onCloseAutoFocus,
      onKeyDownCapture,
      children,
      ...rest
    } = props;
    const { contentRef, openedBy, triggerRef, setOpen, skipReturn } = useMenuContext('MenuContent');
    const composed = useMemo(() => composeRefs(ref, contentRef), [ref, contentRef]);
    return (
      <RadixMenu.Portal>
        <RadixMenu.Content
          {...rest}
          ref={composed}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          loop={loop}
          // Radix swallows Tab inside a menu; here it closes the menu and moves on in the page.
          // Captured and stopped before Radix's handler and the focus trap, then the focus goes to
          // the neighbour of the trigger once the panel (and its trap) are gone.
          onKeyDownCapture={(event) => {
            onKeyDownCapture?.(event);
            if (event.key !== 'Tab' || event.defaultPrevented) return;
            event.preventDefault();
            event.stopPropagation();
            const from = triggerRef.current;
            const target = from ? adjacentTabbable(from, event.shiftKey, contentRef.current) : null;
            // Nowhere to go (a trigger that is the last or first tabbable of the page): do not let
            // `useReturnFocus` bounce the focus back to the trigger; it ends on `body`.
            if (!target) skipReturn.current = true;
            setOpen(false);
            requestAnimationFrame(() => target?.focus());
          }}
          // The return of the focus is `useReturnFocus`'s, not Radix's.
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            event.preventDefault();
            openedBy.current = 'first';
          }}
          className={cn(CONTENT, overlayLayer.popover, className)}
        >
          <OpenFocus />
          <TouchOutsideGuard />
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    );
  },
);

export type MenuItemTone = 'default' | 'danger';

export interface MenuItemProps extends Omit<ComponentPropsWithoutRef<typeof RadixMenu.Item>, 'asChild' | 'onSelect'> {
  /**
   * Called once per click, Enter or Space on an enabled item, before the menu closes. Call
   * `event.preventDefault()` to keep the menu open. Never called while `disabled` (also when it
   * becomes `true` while the menu is open).
   */
  onSelect?: (event: Event) => void;
  /** `danger`: a destructive action; marked with a bar besides the colour. Name the action in the text ("Delete…"). */
  tone?: MenuItemTone;
  /** Skipped by arrow keys and typeahead, and never calls `onSelect`. Default `false`. */
  disabled?: boolean;
  /** The text typeahead matches for this item. Default: the item's text content (set it when the content is not plain text). */
  textValue?: string;
}

const ITEM =
  'relative flex min-w-0 cursor-pointer select-none items-center rounded-rop-md py-1.5 ps-3 pe-3 outline-none ' +
  'data-[highlighted]:bg-rop-surface-subtle not-data-[disabled]:active:bg-rop-surface-pressed ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';
const ITEM_DANGER =
  'text-rop-error before:absolute before:inset-y-1 before:start-0 before:w-0.5 before:rounded-full before:bg-rop-error';

/** One action. `disabled` items are skipped by arrows and typeahead and never call `onSelect`. */
export const MenuItem = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixMenu.Item>, MenuItemProps>(
  function MenuItem(props, ref) {
    const { tone = 'default', disabled, onSelect, className, ...rest } = props;
    return (
      <RadixMenu.Item
        {...rest}
        ref={ref}
        disabled={disabled}
        data-tone={tone === 'danger' ? 'danger' : undefined}
        onSelect={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onSelect?.(event);
        }}
        className={cn(ITEM, tone === 'danger' && ITEM_DANGER, className)}
      />
    );
  },
);

const GroupContext = /* @__PURE__ */ createContext<{ register: (id: string, on: boolean) => void } | null>(null);

export interface MenuGroupProps extends ComponentPropsWithoutRef<typeof RadixMenu.Group> {
  /** Renders your single child element instead of the default `<div role="group">`, with the group's props merged onto it. */
  asChild?: boolean;
}

/** A named set of items: its `MenuLabel`s (usually one) are the group's accessible name. */
export const MenuGroup = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixMenu.Group>, MenuGroupProps>(
  function MenuGroup(props, ref) {
    const { children, ...rest } = props;
    const [labelIds, setLabelIds] = useState<readonly string[]>([]);
    const group = useMemo(
      () => ({
        register: (id: string, on: boolean) =>
          setLabelIds((ids) => (on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((other) => other !== id))),
      }),
      [],
    );
    return (
      // The labels and the consumer's own `aria-labelledby` compose into one name.
      <RadixMenu.Group
        {...rest}
        ref={ref}
        aria-labelledby={[...labelIds, rest['aria-labelledby']].filter(Boolean).join(' ') || undefined}
      >
        <GroupContext.Provider value={group}>{children}</GroupContext.Provider>
      </RadixMenu.Group>
    );
  },
);

export interface MenuLabelProps extends ComponentPropsWithoutRef<typeof RadixMenu.Label> {
  /** Renders your single child element instead of the default `<div>`, with the label's props merged onto it. */
  asChild?: boolean;
}

const LABEL = 'select-none px-3 py-1.5 text-rop-caption font-semibold text-rop-text-muted';

/** A caption: not focusable; inside a `MenuGroup` it names the group. */
export const MenuLabel = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixMenu.Label>, MenuLabelProps>(
  function MenuLabel(props, ref) {
    const { className, id, ...rest } = props;
    const ownId = useId();
    const labelId = id ?? ownId;
    const register = useContext(GroupContext)?.register;
    useEffect(() => {
      register?.(labelId, true);
      return () => register?.(labelId, false);
    }, [register, labelId]);
    return <RadixMenu.Label {...rest} ref={ref} id={labelId} className={cn(LABEL, className)} />;
  },
);

export interface MenuSeparatorProps extends ComponentPropsWithoutRef<typeof RadixMenu.Separator> {
  /** Renders your single child element instead of the default `<div role="separator">`, with the separator's props merged onto it. */
  asChild?: boolean;
}

/** A `role="separator"` rule between items (its own, not the `Divider`). */
export const MenuSeparator = /* @__PURE__ */ forwardRef<ElementRef<typeof RadixMenu.Separator>, MenuSeparatorProps>(
  function MenuSeparator(props, ref) {
    const { className, ...rest } = props;
    return (
      <RadixMenu.Separator {...rest} ref={ref} className={cn('-mx-1 my-1 h-px bg-rop-border-subtle', className)} />
    );
  },
);
