import { Slot } from '@radix-ui/react-slot';
import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { Button } from '../button/Button';
import { navMenuIcon } from '../internal/icons';
import { isDev } from '../internal/is-dev';
import { ModalRoot } from '../internal/modal';
import { handleNavigationClick, hasNavigableHref, isAppNavigationClick, isModifiedClick } from '../internal/navigation';
import { SheetBody, SheetClose, SheetContent, SheetHeader, SheetTitle } from '../sheet/Sheet';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import {
  boxStyle,
  headerCenterClass,
  headerClass,
  headerEndClass,
  headerStartClass,
  mainBottomBorderKeys,
  mainClass,
  mainStyle,
  navClass,
  navItemClass,
  navLinkActiveClass,
  navLinkClass,
  navLinkDisabledClass,
  navLinkEnabledClass,
  navLinkIconClass,
  navListClass,
  navSheetBodyClass,
  navTriggerClass,
  rootClass,
  rootParentClass,
  rootStyle,
  rootViewportClass,
  skipLinkClass,
} from './app-shell-styles';
import { APP_SHELL_WIDE_QUERY } from './breakpoint';

export interface AppShellLabels {
  /** Text of the skip link, the first stop of the Tab order, which moves the focus to the content. Default `Skip to content`. */
  skipToContent: string;
  /**
   * Accessible name of the navigation landmark (`AppShellNav`), unless it has its own `aria-label`, and the title of
   * the navigation Sheet below the breakpoint. Default `Main`.
   */
  nav: string;
  /** Accessible name of `AppShellNavTrigger`, the button that opens the navigation below the breakpoint. Default `Open navigation`. */
  openNav: string;
}

/** @internal Not public API: exported only for the test of the documented defaults (label-defaults.test.tsx, #549). */
export const DEFAULT_LABELS: AppShellLabels = {
  skipToContent: 'Skip to content',
  nav: 'Main',
  openNav: 'Open navigation',
};

interface AppShellContextValue {
  mainId: string;
  setMainId: (id: string) => void;
  labels: AppShellLabels;
}

const AppShellContext = /* @__PURE__ */ createContext<AppShellContextValue | null>(null);

/**
 * The navigation Sheet, shared by `AppShellNavTrigger` (in the header) and `AppShellNav` (which renders the Sheet with
 * its own children). Apart from the shell's context, so that opening it does not render the main again.
 */
interface AppShellNavSheetValue {
  /** Whether the Sheet is open (the requested state, not whether its panel is still on screen). */
  open: boolean;
  /** The edge the Sheet comes from: the start edge in the trigger's direction, read when it opens. */
  side: 'left' | 'right';
  /** Opens the Sheet from this trigger. */
  openFrom: (trigger: HTMLButtonElement) => void;
  setOpen: (open: boolean) => void;
  /** `id` of the Sheet's panel (the trigger's `aria-controls` while it is open). */
  sheetId: string;
  /**
   * The trigger, where the focus goes back: the one the Sheet was opened from while it is mounted, else another
   * mounted one (the first mounted until the Sheet opens), else `null`.
   */
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  /** Called by `AppShellNavTrigger` with its button when it mounts; returns the function to call when it unmounts. */
  registerTrigger: (trigger: HTMLButtonElement) => () => void;
  /** Whether the shell has an `AppShellNav`: without one the trigger opens nothing. */
  hasNav: boolean;
  /** Called by `AppShellNav` when it mounts; returns the function to call when it unmounts (which closes the Sheet). */
  registerNav: () => () => void;
  /**
   * The Sheet `AppShellNav` renders its children in, given by `AppShellNavTrigger` when it mounts (`null` until then):
   * only the trigger imports it, so a shell without one (an app for wide screens only) does not ship the Sheet.
   */
  Sheet: ComponentType<NavSheetProps> | null;
  provideSheet: (sheet: ComponentType<NavSheetProps>) => void;
}

interface NavSheetProps {
  /** `aria-label` of the Sheet's `<nav>` (the name of the column). */
  label: string | undefined;
  /** `aria-labelledby` of the Sheet's `<nav>` (the column's). */
  labelledBy: string | undefined;
  /** Text of the Sheet's title. */
  title: string;
  /** Called with the panel when it mounts and with `null` when it has left the DOM (after its exit animation). */
  panelRef: (node: HTMLDivElement | null) => void;
  /** The children of `AppShellNav` while they are in the Sheet, else `null`. */
  children: ReactNode;
}

const AppShellNavSheetContext = /* @__PURE__ */ createContext<AppShellNavSheetValue | null>(null);

/** Given by `AppShellNav` to the links it renders in its Sheet: closes the Sheet, focuses the trigger, then runs `then`. */
const NavInSheetContext = /* @__PURE__ */ createContext<((then: () => void) => void) | null>(null);

const noop = () => undefined;

/**
 * @internal Not public API (exported for the unit test). Whether the viewport is at or above the breakpoint of the
 * navigation column. Without `matchMedia`, or with one that throws (a restricted embed), it is not known: `false`, and
 * the CSS alone decides what is displayed.
 */
export function wideViewport(view: Window | null | undefined): boolean {
  if (!view || typeof view.matchMedia !== 'function') return false;
  try {
    return view.matchMedia(APP_SHELL_WIDE_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * @internal Not public API (exported for the unit test). Calls `onChange` every time the viewport crosses the
 * breakpoint of the navigation column, with whether it is now at or above it; returns the function that stops
 * watching. Without `matchMedia`, or with one that throws, nothing is watched.
 */
export function watchWideViewport(view: Window | null | undefined, onChange: (wide: boolean) => void): () => void {
  if (!view || typeof view.matchMedia !== 'function') return noop;
  let list: MediaQueryList;
  try {
    list = view.matchMedia(APP_SHELL_WIDE_QUERY);
  } catch {
    return noop;
  }
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  list.addEventListener('change', listener);
  return () => list.removeEventListener('change', listener);
}

/**
 * @internal Not public API (exported for the unit test). The link that takes the focus when a navigation is shown
 * (the Sheet opening, the column coming back): the current page, else the first link that can be followed, else the
 * first link, else `null`.
 */
export function navFocusTarget(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  const links = [...container.querySelectorAll<HTMLElement>('[data-rop-app-shell-nav-link]')];
  return (
    links.find((link) => link.getAttribute('aria-current') === 'page') ??
    links.find((link) => link.getAttribute('aria-disabled') !== 'true') ??
    links[0] ??
    null
  );
}

/** The start edge in the element's writing direction. */
function startSide(element: HTMLElement): 'left' | 'right' {
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === 'rtl' ? 'right' : 'left';
}

// SSR: useLayoutEffect warns on the server (React 18).
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The height the shell takes. `viewport`: the whole height of the window (`100dvh`, which follows a phone's
   * address bar), for a shell that is the page; the page itself must add nothing around it (no margin on `body`),
   * or the document scrolls by that much. `parent`: the height of its parent (`height: 100%`), for a shell inside
   * a box of its own (a demo, a frame, a split view); the parent must have a height, or the shell grows with its
   * content and the document scrolls.
   * @default 'viewport'
   */
  fill?: 'viewport' | 'parent';
  /** Texts for localization; every key falls back to the English default. */
  labels?: Partial<AppShellLabels>;
  /** `AppShellHeader`, `AppShellNav` and `AppShellMain`, in this order (it is the order of the Tab key). */
  children?: ReactNode;
}

/**
 * The frame of an app in a product made of several apps: a header across the top (`AppShellHeader`), a
 * navigation column (`AppShellNav`) and the content (`AppShellMain`), which hosts a List Report, an Object Page or
 * a plain page. A "Skip to content" link is the first stop of the Tab order and moves the focus to the content.
 *
 * ## Layout and sizing
 *
 * - **Height**: the whole window (`fill="viewport"`, the default: `100dvh`) or the parent's (`fill="parent"`).
 *   The document never scrolls: give the page no margin around the shell (a `body` margin makes the document
 *   scroll by that much), and in `parent` mode give the parent a height.
 * - **One scroller**: header and navigation never scroll with the content. `AppShellMain` is the only scroller
 *   of a plain page. A floorplan that takes the height of its parent (`ListReport`, `ObjectPage`) placed directly
 *   in `AppShellMain` fills it exactly and scrolls by itself, so there is still one scroller. A wrapper between
 *   them (a router outlet) needs `height: 100%`; without it the floorplan grows with its rows and `AppShellMain`
 *   scrolls instead (still one scroller, but the List Report's own scroll restoration and the Object Page's save
 *   bar at the bottom of the window are lost).
 * - **Stable footprint**: the header's height is `--rop-app-shell-header-height` (default 3.5rem, its 1px rule
 *   included) and the navigation's width is `--rop-app-shell-nav-width` (default 16rem, rule included), set on any
 *   ancestor to change them. Neither depends on what the slots hold: empty slots, slots filled after the mount (a
 *   user loaded asynchronously) and long texts leave the content where it is.
 * - **Breakpoint**: from 64rem (1024px with the default font size) the navigation is a column beside the content;
 *   below it the column is not displayed, the content takes the whole width and the navigation opens in a Sheet
 *   from the `AppShellNavTrigger` of the header. Decided in CSS: nothing moves at the first paint or at hydration.
 * - **No horizontal overflow**: every part of the header shrinks; put long text in a `TruncatedText` (or any
 *   child with a zero minimum width and an ellipsis) and it is cut at the part's real width.
 * - **Virtual keyboard** (a focused `Field`): `AppShellMain` ends above the keyboard (a transparent bottom border
 *   of the keyboard's height) and keeps a focused field above it; the header stays at the top. The keyboard is
 *   counted once: a floorplan inside becomes shorter by the keyboard's height (an Object Page's save bar stays above
 *   the keyboard) and adds nothing.
 * - **Padding of the content**: `AppShellMain` has none of its own. Give it yours with `style` (`padding: 24`) or a
 *   class (`p-6`): it is kept whole, the bottom one too, and the keyboard's room is added below it, never in its
 *   place. The bottom border of `AppShellMain` is the shell's (the keyboard's room): a bottom border of yours goes
 *   on a child (one in `style` is an error in development, one in a class is not drawn).
 * - **One `main`**: the shell is the frame of the page, with one `AppShellMain` (the page's `main` landmark). Do
 *   not nest it in a page that already has a `main` (two `main` landmarks, one inside the other, are invalid): the
 *   shell goes at the top of the page, and the page's own content goes in `AppShellMain`.
 * - **Layers**: the shell adds no layer of its own (the skip link aside, at the sticky level while focused):
 *   toasts, dialogs and popovers opened from the content are above the header, as everywhere else.
 *
 * ```tsx
 * <AppShell>
 *   <AppShellHeader start={<><AppShellNavTrigger /><Text>App one</Text></>} end={<UserMenu />} />
 *   <AppShellNav>
 *     <AppShellNavLink href="/a" active>Section A</AppShellNavLink>
 *     <AppShellNavLink href="/b">Section B</AppShellNavLink>
 *   </AppShellNav>
 *   <AppShellMain>
 *     <ListReport title="Records" table={table} />
 *   </AppShellMain>
 * </AppShell>
 * ```
 */
export const AppShell = /* @__PURE__ */ forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  { fill = 'viewport', labels: labelsProp, className, style, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const [mainId, setMainId] = useState(`${generatedId}-main`);
  const skipToContent = labelsProp?.skipToContent ?? DEFAULT_LABELS.skipToContent;
  const nav = labelsProp?.nav ?? DEFAULT_LABELS.nav;
  const openNav = labelsProp?.openNav ?? DEFAULT_LABELS.openNav;
  const context = useMemo<AppShellContextValue>(
    () => ({ mainId, setMainId, labels: { skipToContent, nav, openNav } }),
    [mainId, skipToContent, nav, openNav],
  );

  const [navOpen, setNavOpen] = useState(false);
  const [navSide, setNavSide] = useState<'left' | 'right'>('left');
  const [navCount, setNavCount] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const triggers = useRef<HTMLButtonElement[]>([]);
  const openFrom = useCallback((trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setNavSide(startSide(trigger));
    setNavOpen(true);
  }, []);
  // Every mounted trigger, so that the focus has one to go back to when the one the Sheet opened from unmounts.
  const registerTrigger = useCallback((trigger: HTMLButtonElement) => {
    const list = triggers.current;
    list.push(trigger);
    triggerRef.current ??= trigger;
    return () => {
      list.splice(list.indexOf(trigger), 1);
      if (triggerRef.current === trigger) triggerRef.current = list[0] ?? null;
    };
  }, []);
  // The Sheet is rendered by `AppShellNav`: a nav that leaves takes the Sheet with it, so it closes it too (else the
  // trigger would announce an open Sheet that is not there, and a nav mounted later would open it by itself).
  const registerNav = useCallback(() => {
    setNavCount((count) => count + 1);
    return () => {
      setNavCount((count) => count - 1);
      setNavOpen(false);
    };
  }, []);
  const [Sheet, setSheet] = useState<ComponentType<NavSheetProps> | null>(null);
  const provideSheet = useCallback((sheet: ComponentType<NavSheetProps>) => setSheet(() => sheet), []);
  const sheetId = `${generatedId}-nav-sheet`;
  const navSheet = useMemo<AppShellNavSheetValue>(
    () => ({
      open: navOpen,
      side: navSide,
      openFrom,
      setOpen: setNavOpen,
      sheetId,
      triggerRef,
      registerTrigger,
      hasNav: navCount > 0,
      registerNav,
      Sheet,
      provideSheet,
    }),
    [navOpen, navSide, openFrom, sheetId, registerTrigger, navCount, registerNav, Sheet, provideSheet],
  );

  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    // The focus moves without touching the URL: a fragment would be read as a route by a hash router. Cancelled
    // even when there is no content to focus (no AppShellMain yet), for the same reason.
    event.preventDefault();
    event.currentTarget.ownerDocument.getElementById(mainId)?.focus({ preventScroll: true });
  };

  return (
    <AppShellContext.Provider value={context}>
      <AppShellNavSheetContext.Provider value={navSheet}>
        <div
          {...rest}
          ref={ref}
          data-rop-app-shell=""
          className={cn(rootClass, fill === 'parent' ? rootParentClass : rootViewportClass, className)}
          style={{ ...(rootStyle as CSSProperties), ...style }}
        >
          <a href={`#${mainId}`} data-rop-app-shell-skip-link="" className={skipLinkClass} onClick={skip}>
            {skipToContent}
          </a>
          {children}
        </div>
      </AppShellNavSheetContext.Provider>
    </AppShellContext.Provider>
  );
});

export interface AppShellHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Start of the header: the identity of the app (a logo, its name, an app switcher). */
  start?: ReactNode;
  /** Middle of the header, which takes the free room: the current context (an organisation, a search). */
  center?: ReactNode;
  /** End of the header: the user's area (an `Avatar` with a `Menu`, notifications). */
  end?: ReactNode;
}

/**
 * The header of the shell: a `<header>` (the page's banner landmark) across the top, with three parts, `start`,
 * `center` and `end`, which hold whatever the product needs (no prop of a domain: the user, the organisation and
 * the app are the consumer's content). Its height never depends on that content (see `AppShell`, "Layout and
 * sizing"). The three parts are always there, so `end` stays at the end whatever is empty.
 */
export const AppShellHeader = /* @__PURE__ */ forwardRef<HTMLElement, AppShellHeaderProps>(function AppShellHeader(
  { start, center, end, className, style, ...rest },
  ref,
) {
  return (
    <header {...rest} ref={ref} data-rop-app-shell-header="" className={cn(headerClass, className)} style={{ ...boxStyle, ...style }}>
      <div data-rop-app-shell-header-start="" className={headerStartClass}>
        {start}
      </div>
      <div data-rop-app-shell-header-center="" className={headerCenterClass}>
        {center}
      </div>
      <div data-rop-app-shell-header-end="" className={headerEndClass}>
        {end}
      </div>
    </header>
  );
});

/**
 * The navigation Sheet, rendered by `AppShellNav` (so that its children stay in their own tree of contexts) but
 * referenced only by `AppShellNavTrigger`, which gives it to the shell: the Sheet's code comes with the trigger.
 */
function NavSheet({ label, labelledBy, title, panelRef, children }: NavSheetProps) {
  const navSheet = useContext(AppShellNavSheetContext)!;
  const sheetNavRef = useRef<HTMLElement | null>(null);
  const panelNode = useRef<HTMLDivElement | null>(null);
  const setPanel = useMemo(() => composeRefs<HTMLDivElement>(panelNode, panelRef), [panelRef]);
  const { open, setOpen: close, triggerRef: trigger } = navSheet;
  // Reopened during its exit animation, the panel is the one still on screen (it never left the DOM): Radix runs no
  // opening focus for it (no `onOpenAutoFocus`) and the panel itself took the focus. The current link takes it, as at
  // any opening. Read in a layout effect, so before the focus trap is on again and before anything is painted.
  const leavingPanel = useRef<HTMLDivElement | null>(null);
  useIsomorphicLayoutEffect(() => {
    const panel = panelNode.current;
    if (!open) {
      leavingPanel.current = panel;
      return;
    }
    if (panel && panel === leavingPanel.current) navFocusTarget(sheetNavRef.current)?.focus();
    leavingPanel.current = null;
  }, [open]);
  // An `AppShellNav` unmounted while the Sheet is on screen takes it away with no closing, so the Sheet's own return
  // of the focus never runs. Run here, before the panel leaves the DOM: a focus in the panel (or lost to `body` during
  // its exit) goes back to the trigger in the next frame, unless something else has taken it by then (a focus that was
  // elsewhere, in a dialog of the app, is left alone).
  useIsomorphicLayoutEffect(
    () => () => {
      const panel = panelNode.current;
      const doc = panel?.ownerDocument;
      if (!panel || !doc || !(panel.contains(doc.activeElement) || doc.activeElement === doc.body)) return;
      doc.defaultView?.requestAnimationFrame(() => {
        if (doc.activeElement === doc.body) trigger.current?.focus();
      });
    },
    [trigger],
  );
  /** Closes the Sheet, gives the focus to the trigger, then runs `then` (which may throw: the Sheet is closed). */
  const closeThen = (then: () => void) => {
    flushSync(() => close(false));
    trigger.current?.focus();
    then();
  };
  // After its exit animation (once its panel has left the DOM, taking a focus it held with it) the Sheet gives the
  // focus back to the trigger. When something already has the focus (the trigger, given it by `closeThen`; the
  // heading `onNavigate` moved it to; the column after a crossing of the breakpoint) it is left there.
  const focusIsElsewhere = () => {
    const doc = trigger.current?.ownerDocument ?? document;
    return doc.activeElement !== doc.body;
  };
  const onOpenAutoFocus = (event: Event) => {
    const target = navFocusTarget(sheetNavRef.current);
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  return (
    <ModalRoot open={open} onOpenChange={close} keepFocusWhen={focusIsElsewhere}>
      <SheetContent
        ref={setPanel}
        id={navSheet.sheetId}
        side={navSheet.side}
        size="sm"
        returnFocusRef={trigger}
        onOpenAutoFocus={onOpenAutoFocus}
        data-rop-app-shell-nav-sheet=""
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className={navSheetBodyClass}>
          <nav ref={sheetNavRef} aria-label={label} aria-labelledby={labelledBy} data-rop-app-shell-nav-sheet-nav="">
            <NavInSheetContext.Provider value={closeThen}>
              <ul className={navListClass}>{children}</ul>
            </NavInSheetContext.Provider>
          </nav>
        </SheetBody>
      </SheetContent>
    </ModalRoot>
  );
}

export interface AppShellNavTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  /** Called first, for every click. Cancel the event (`event.preventDefault()`) to keep the Sheet closed. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * The button that opens the navigation of the app (`AppShellNav`) in a Sheet below the breakpoint, where the column
 * is not displayed. Put it in the header, at the start (before the name of the app). It is displayed only below the
 * breakpoint, decided in CSS like the column: nothing moves at the first paint or at hydration, and from the
 * breakpoint up it is neither drawn nor a Tab stop. An icon button named by `labels.openNav` of the `AppShell`
 * (`Open navigation`) unless it has its own `aria-label`, with `aria-haspopup="dialog"`, `aria-expanded`, and
 * `aria-controls` while the Sheet is open. Must be rendered inside an `AppShell` (it throws otherwise).
 *
 * The Sheet comes from the start edge (the right one in a right-to-left page), as tall as the visible viewport,
 * titled with the name of the navigation, and holds the same links as the column (see `AppShellNav`). It opens with
 * the focus on the link of the current page (else the first link that can be followed) and the rest of the page
 * inert; Escape, its close button or the backdrop close it, and the focus goes back to the trigger.
 *
 * Several triggers in one shell (one in the header, one in an empty page) share the Sheet: the focus goes back to the
 * one the Sheet was opened from, or, when that one has unmounted, to another mounted one; a trigger mounted again
 * while the Sheet is open (a new `key`) gets it too.
 *
 * Declared limits: in a shell without an `AppShellNav` it opens nothing. When no trigger is mounted as the Sheet
 * closes, or the one the focus goes back to is disabled, the focus is not given back, and nothing else is focused.
 */
export const AppShellNavTrigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, AppShellNavTriggerProps>(function AppShellNavTrigger(
  { onClick, className, 'aria-label': ariaLabel, ...rest },
  ref,
) {
  const shell = useContext(AppShellContext);
  const navSheet = useContext(AppShellNavSheetContext);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const composedRef = useMemo(() => composeRefs<HTMLButtonElement>(buttonRef, ref), [ref]);
  // Kept once given (a trigger unmounted while the Sheet is open: the Sheet can still close).
  const provideSheet = navSheet?.provideSheet;
  useIsomorphicLayoutEffect(() => provideSheet?.(NavSheet), [provideSheet]);
  const registerTrigger = navSheet?.registerTrigger;
  useIsomorphicLayoutEffect(() => (buttonRef.current ? registerTrigger?.(buttonRef.current) : undefined), [registerTrigger]);
  if (!shell || !navSheet) throw new Error('[formrail] <AppShellNavTrigger> must be rendered inside <AppShell>.');
  const { open, hasNav, openFrom, sheetId } = navSheet;
  const onTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    const button = event.currentTarget;
    // From the breakpoint up the column is there (a click made in code, or in the frame the viewport crossed it).
    if (event.defaultPrevented || !hasNav || wideViewport(button.ownerDocument.defaultView)) return;
    // The Sheet gives the focus back to the element that had it when it opened: the trigger (a click does not
    // focus a button in every browser).
    if (button.ownerDocument.activeElement !== button) button.focus({ preventScroll: true });
    openFrom(button);
  };
  return (
    <Button
      {...rest}
      ref={composedRef as Ref<HTMLElement>}
      variant="ghost"
      size="icon-md"
      aria-label={ariaLabel ?? shell.labels.openNav}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? sheetId : undefined}
      data-rop-app-shell-nav-trigger=""
      className={cn(navTriggerClass, className)}
      onClick={onTriggerClick}
    >
      {navMenuIcon}
    </Button>
  );
});

export interface AppShellNavProps extends HTMLAttributes<HTMLElement> {
  /** `AppShellNavLink`s, in the order of the Tab key. */
  children?: ReactNode;
}

/** The text of the elements with these ids, as `aria-labelledby` reads them (in this order, one space apart). */
function textOfIds(ids: string | undefined): string {
  return (ids ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

/**
 * The navigation of the app: a named `<nav>` landmark holding a list of `AppShellNavLink`. From the breakpoint
 * up it is a column beside the content (see `AppShell`, "Layout and sizing"). It scrolls on its own only when its
 * links are taller than the room it has, and never with the content.
 *
 * Below the breakpoint the column is not displayed, and `AppShellNavTrigger` (in the header) opens the navigation in
 * a Sheet: a modal dialog titled with the navigation's name, holding a `<nav>` with the same name and the same
 * links. One `AppShellNav` per shell, and its children are written once: they are mounted in one place at a time,
 * the column or the Sheet, never in both (no duplicate `id`, one navigation landmark). The column holds them
 * whenever the Sheet is not on screen, also below the breakpoint where it is not displayed; while the Sheet is open
 * (and during its exit animation) they are in the Sheet, so their own state (a search field) starts again at each
 * opening. In the Sheet:
 * - A plain click or Enter on a link closes the Sheet and gives the focus to the trigger, then calls the link's
 *   `onNavigate` (a dirty guard opened from there returns the focus to the trigger); a focus `onNavigate` moves
 *   elsewhere (the heading of the new page) stays there. A plain link without `onNavigate` and a router's link
 *   (`asChild`) close it too. A Ctrl/Cmd/Shift/Alt+click or the middle button on a link with an `href` is the
 *   browser's (a new tab) and the Sheet stays open; so does a click on a disabled link, or one an `onClick` cancelled.
 * - When the viewport crosses the breakpoint with the Sheet open (a tablet turned to landscape), the Sheet closes,
 *   the links are in the column at once and the focus goes to the link of the current page there. When it crosses
 *   it the other way with the focus in the column, the focus goes to the trigger.
 *
 * An `AppShellNav` unmounted while the Sheet is open (a navigation that depends on permissions loaded later) takes the
 * Sheet with it and closes it: the trigger is collapsed again, the focus the Sheet held goes back to the trigger (one
 * the app moved elsewhere at the same time, or that was not in the Sheet, stays where it is), and a navigation mounted
 * later opens nothing by itself.
 *
 * The landmark is named by `labels.nav` of the `AppShell` (`Main` by default); its own `aria-label` or
 * `aria-labelledby` takes the place of that name, in the Sheet's title too.
 *
 * The Sheet's code comes with `AppShellNavTrigger`: a shell without one (an app for wide screens only) does not ship it.
 */
export const AppShellNav = /* @__PURE__ */ forwardRef<HTMLElement, AppShellNavProps>(function AppShellNav(
  { className, style, children, onBlur, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...rest },
  ref,
) {
  const shell = useContext(AppShellContext);
  const navSheet = useContext(AppShellNavSheetContext);
  const label = ariaLabel ?? (ariaLabelledBy ? undefined : (shell?.labels.nav ?? DEFAULT_LABELS.nav));
  const columnRef = useRef<HTMLElement | null>(null);
  const composedRef = useMemo(() => composeRefs<HTMLElement>(columnRef, ref), [ref]);

  const registerNav = navSheet?.registerNav;
  useIsomorphicLayoutEffect(() => registerNav?.(), [registerNav]);

  const open = !!navSheet?.open;
  const setOpen = navSheet?.setOpen;
  const triggerRef = navSheet?.triggerRef;
  const openRef = useRef(open);
  openRef.current = open;
  // Whether the Sheet's panel is on screen (open, or in its exit animation): set by the panel's own ref.
  const [panelShown, setPanelShown] = useState(false);
  // The viewport crossed the breakpoint while the Sheet was open: the links go back to the column at once, and the
  // Sheet leaves without them (until it has left or opens again: the next exit keeps them in it again).
  const [leaving, setLeaving] = useState(false);
  // Reopened during that exit, the same panel is reused (it never left), so the reset happens here.
  if (open && leaving) setLeaving(false);
  const setPanel = useCallback((node: HTMLDivElement | null) => {
    setPanelShown(node !== null);
    if (!node) setLeaving(false);
  }, []);
  const inSheet = open || (panelShown && !leaving);

  // The focus left the column because the column stopped being displayed: the viewport crossed the breakpoint, and
  // the browser may drop the focus of a link it no longer displays before it reports the crossing (Chrome does, in
  // its own task, whenever a layout runs at the new size first).
  const focusLostWithColumn = useRef(false);
  const onColumnBlur = (event: FocusEvent<HTMLElement>) => {
    onBlur?.(event);
    const column = event.currentTarget;
    focusLostWithColumn.current = column.ownerDocument.defaultView?.getComputedStyle(column).display === 'none';
  };

  // The viewport crossing the breakpoint. Wide with the Sheet open: it closes and the column takes the focus (in a
  // passive effect, once the Sheet's focus trap is off). Narrow with the focus in the column, or lost with it to the
  // page: the trigger takes it.
  const focusColumn = useRef(false);
  useEffect(() => {
    const column = columnRef.current;
    if (!setOpen || !triggerRef || !column) return undefined;
    const doc = column.ownerDocument;
    return watchWideViewport(doc.defaultView, (wide) => {
      const lost = focusLostWithColumn.current;
      focusLostWithColumn.current = false;
      if (!wide) {
        const active = doc.activeElement;
        if ((lost && active === doc.body) || column.contains(active)) triggerRef.current?.focus();
        return;
      }
      if (!openRef.current) return;
      focusColumn.current = true;
      setLeaving(true);
      setOpen(false);
    });
  }, [setOpen, triggerRef]);
  useEffect(() => {
    if (!focusColumn.current) return;
    focusColumn.current = false;
    navFocusTarget(columnRef.current)?.focus();
  });

  // The title of the Sheet is the name of the navigation; with `aria-labelledby`, the text it points to, read at each
  // opening.
  const [labelledByText, setLabelledByText] = useState('');
  useIsomorphicLayoutEffect(() => {
    setLabelledByText(textOfIds(ariaLabelledBy));
  }, [open, ariaLabelledBy]);

  const Sheet = navSheet?.Sheet;
  const sheet = Sheet ? (
    <Sheet label={label} labelledBy={ariaLabelledBy} title={label ?? labelledByText} panelRef={setPanel}>
      {inSheet ? children : null}
    </Sheet>
  ) : null;

  return (
    <>
      <nav
        {...rest}
        ref={composedRef}
        aria-label={label}
        aria-labelledby={ariaLabelledBy}
        data-rop-app-shell-nav=""
        className={cn(navClass, className)}
        style={{ ...boxStyle, ...style }}
        onBlur={onColumnBlur}
      >
        <ul className={navListClass}>{inSheet ? null : children}</ul>
      </nav>
      {sheet}
    </>
  );
});

/** The element a navigation link is rendered as: a link with an `href`, a button without one. */
export type AppShellNavLinkElement = HTMLAnchorElement | HTMLButtonElement;

export interface AppShellNavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  /**
   * Where the link leads. With an `href` the link is a real `<a href>`: Ctrl/Cmd/Shift+click and the middle button
   * open it in a new tab or window, whatever `onNavigate` does. Without one (or with `''`) it is a button, and
   * every click goes to `onNavigate`. Ignored with `asChild` (the child brings its own).
   */
  href?: string;
  /**
   * Opens the page with your router. Called once, synchronously, for a plain primary click or Enter on an enabled
   * link; the browser's own navigation to the `href` is cancelled first. On a link with an `href`, never called for
   * Ctrl/Cmd/Shift/Alt+click or the middle button (the browser opens the real `href`). On a link without one,
   * called for every click, modifiers included. Not called when an `onClick` has already cancelled the click. The
   * link has the focus when it is called; in the navigation Sheet (below the breakpoint) it is called AFTER the Sheet
   * has closed, with the focus on `AppShellNavTrigger`. Not used with `asChild`: the child (your router's link)
   * navigates by itself, and passing both is an error in development.
   */
  onNavigate?: (event: MouseEvent<AppShellNavLinkElement>) => void;
  /** Called first, for every click (also on a disabled link). Cancel the event to keep `onNavigate` from running. */
  onClick?: MouseEventHandler<AppShellNavLinkElement>;
  /** The page the user is on: `aria-current="page"` and a visible marker (a bar, a heavier weight, a tint). */
  active?: boolean;
  /**
   * The page cannot be opened: the link loses its `href` (with `asChild` too: the child is not rendered, its text
   * is), is marked `aria-disabled` and ignores clicks, but keeps its place and its focus stop.
   */
  disabled?: boolean;
  /** Decorative icon before the text (hidden from assistive technology: the name is the text). */
  icon?: ReactNode;
  /**
   * Render the single child element (the link component of your router) instead of an `<a>`, giving it the
   * classes, `aria-current`, `onClick` and the ref. The child must forward its ref and spread unknown props; it
   * keeps its own `href` and does the navigation itself (so `onNavigate` is not used with `asChild`).
   *
   * A router link that styles itself from the URL (react-router's `NavLink`) is yours to keep in step: it sets its
   * own `aria-current` from its match, so pass `active` from the same match (or use the plain `Link`), and give it a
   * string `className` (a function `className` is not called: the active look comes from `active`).
   */
  asChild?: boolean;
  /** The text of the link (its accessible name), cut with an ellipsis; with `asChild`, the single router link element. */
  children?: ReactNode;
}

/** @internal Not public API: the development errors of a link, one message per problem (exported for the unit test). */
export function navLinkProblems(props: { href?: string; asChild?: boolean; disabled?: boolean; hasOnNavigate: boolean }): string[] {
  if (props.asChild) {
    return props.hasOnNavigate ? ['onNavigate is not used with asChild: the child (your router\'s link) navigates by itself'] : [];
  }
  if (props.disabled || hasNavigableHref(props.href) || props.hasOnNavigate) return [];
  return ['a link with no href and no onNavigate opens nothing'];
}

/**
 * A link of the navigation, in a list item of `AppShellNav`. With an `href` it is a real link, and a plain click
 * or Enter goes to `onNavigate` (any router) while a modified click opens a new tab; with `asChild` it is the
 * router's own link component, which navigates by itself. `active` marks the current page (`aria-current="page"`); `disabled` keeps the link
 * in place, focusable, but leading nowhere. The text is cut with an ellipsis at the column's width.
 */
export const AppShellNavLink = /* @__PURE__ */ forwardRef<AppShellNavLinkElement, AppShellNavLinkProps>(
  function AppShellNavLink(
    { href, onNavigate, onClick, active = false, disabled = false, icon, asChild = false, className, children, ...rest },
    ref,
  ) {
    const problems = navLinkProblems({ href, asChild, disabled, hasOnNavigate: !!onNavigate }).join('\n');
    useEffect(() => {
      if (!problems || !isDev()) return;
      for (const problem of problems.split('\n')) console.error(`[formrail] <AppShellNavLink>: ${problem}.`);
    }, [problems]);

    const classes = cn(navLinkClass, disabled ? navLinkDisabledClass : navLinkEnabledClass, active && navLinkActiveClass);
    const iconNode =
      icon !== undefined && icon !== null ? (
        <span aria-hidden="true" className={navLinkIconClass}>
          {icon}
        </span>
      ) : null;
    const body = (text: ReactNode) => (
      <>
        {iconNode}
        <TruncatedText>{text}</TruncatedText>
      </>
    );
    const current = active ? ('page' as const) : undefined;
    // Set when the link is in the navigation Sheet (below the breakpoint): closes it before the navigation.
    const closeSheetThen = useContext(NavInSheetContext);

    const activate = (native: boolean) => (event: MouseEvent<AppShellNavLinkElement>) => {
      onClick?.(event);
      if (disabled) {
        event.preventDefault();
        return;
      }
      if (!onNavigate) {
        // A plain link in the Sheet: the browser follows it, and the Sheet closes as for any navigation.
        if (closeSheetThen && native && isAppNavigationClick(event)) closeSheetThen(noop);
        return;
      }
      const link = event.currentTarget;
      const rule = { native };
      // A click handed to `onNavigate` gives the link the focus first (Safari does not focus a clicked link), so a
      // dialog opened from `onNavigate` (a dirty guard) returns the focus to it. In the Sheet the Sheet closes first
      // and the focus goes to the trigger, which such a dialog returns it to.
      if (isAppNavigationClick(event, rule) && link.ownerDocument.activeElement !== link) link.focus({ preventScroll: true });
      handleNavigationClick(event, closeSheetThen ? (e) => closeSheetThen(() => onNavigate(e)) : onNavigate, rule);
    };
    // A router's link (`asChild`) navigates by itself, in its own click handler, which runs before this one: in the
    // Sheet a plain primary click closes it (a modified one is the browser's, as for the router).
    const onRouterLinkClick = closeSheetThen
      ? (event: MouseEvent<AppShellNavLinkElement>) => {
          onClick?.(event);
          if (!isModifiedClick(event)) closeSheetThen(noop);
        }
      : onClick;

    let element: ReactNode;
    if (disabled) {
      // No `href` (with `asChild` the child is not rendered either: a router's link would still navigate). A
      // named, focusable link that leads nowhere, so the user can still find it.
      const text = asChild && isValidElement(children) ? (children as ReactElement<{ children?: ReactNode }>).props.children : children;
      element = (
        // A link that leads nowhere: Enter on it does nothing by design (no `href`), so there is no key handler;
        // the click handler only runs the consumer's `onClick` and cancels the click.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <a
          {...rest}
          ref={ref as Ref<HTMLAnchorElement>}
          role="link"
          tabIndex={0}
          aria-disabled="true"
          aria-current={current}
          data-rop-app-shell-nav-link=""
          className={cn(classes, className)}
          onClick={activate(false)}
        >
          {body(text)}
        </a>
      );
    } else if (asChild) {
      if (!isValidElement(children)) {
        throw new Error('[formrail] <AppShellNavLink asChild> expects exactly one React element as its child.');
      }
      const child = children as ReactElement<{ className?: string; children?: ReactNode; href?: string }>;
      // The class merge is done here (Slot only concatenates): the child's own classes go last.
      const merged = cloneElement(child, { className: cn(classes, className, child.props.className) }, body(child.props.children));
      element = (
        <Slot
          {...rest}
          ref={ref as Ref<HTMLElement>}
          aria-current={current}
          data-rop-app-shell-nav-link=""
          onClick={onRouterLinkClick}
        >
          {merged}
        </Slot>
      );
    } else if (hasNavigableHref(href)) {
      element = (
        <a
          {...rest}
          ref={ref as Ref<HTMLAnchorElement>}
          href={href}
          aria-current={current}
          data-rop-app-shell-nav-link=""
          className={cn(classes, className)}
          onClick={activate(true)}
        >
          {body(children)}
        </a>
      );
    } else {
      element = (
        <button
          {...(rest as HTMLAttributes<HTMLButtonElement>)}
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          aria-current={current}
          data-rop-app-shell-nav-link=""
          className={cn(classes, className)}
          onClick={activate(false)}
        >
          {body(children)}
        </button>
      );
    }
    return <li className={navItemClass}>{element}</li>;
  },
);

export interface AppShellMainProps extends HTMLAttributes<HTMLElement> {
  /** `id` of the `<main>`, the target of the skip link. Default: generated. */
  id?: string;
}

/**
 * The content of the shell: a `<main>` landmark, the target of the skip link (it takes the focus, `tabIndex`
 * -1). It adds no padding: a floorplan brings its own, a plain page adds its own, on a child or on `AppShellMain`
 * itself (`style={{ padding: 24 }}` or a class): that padding is kept whole, and the virtual keyboard's room is
 * added below it (the bottom border of `AppShellMain` is that room: a bottom border in `style` is an error in
 * development). It scrolls a plain page; a floorplan that takes the height of its parent fills it and scrolls by
 * itself (see `AppShell`, "Layout and sizing"). One per shell, never inside another `main`.
 */
export const AppShellMain = /* @__PURE__ */ forwardRef<HTMLElement, AppShellMainProps>(function AppShellMain(
  { id: idProp, className, style, children, ...rest },
  ref,
) {
  const shell = useContext(AppShellContext);
  const generatedId = useId();
  const id = idProp ?? shell?.mainId ?? `${generatedId}-main`;
  const setMainId = shell?.setMainId;
  const borderKeys = mainBottomBorderKeys(style).join(', ');
  useEffect(() => {
    if (!borderKeys || !isDev()) return;
    console.error(
      `[formrail] <AppShellMain>: its bottom border holds the room of the virtual keyboard, so ${borderKeys} in its style ` +
        'is replaced there. Put a border on a child of AppShellMain, or use the other sides only (borderTop, borderLeft, borderRight).',
    );
  }, [borderKeys]);
  // The skip link follows an `id` of the consumer's (the first render, on the server too, has the shell's own).
  useIsomorphicLayoutEffect(() => {
    setMainId?.(id);
  }, [id, setMainId]);
  return (
    <main
      {...rest}
      ref={ref}
      id={id}
      tabIndex={-1}
      data-rop-app-shell-main=""
      className={cn(mainClass, className)}
      // The keyboard's room last: the consumer's padding composes with it, its bottom border cannot remove it.
      style={{ ...style, ...(mainStyle as CSSProperties) }}
    >
      {children}
    </main>
  );
});
