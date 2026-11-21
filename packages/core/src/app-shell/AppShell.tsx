import { Slot } from '@radix-ui/react-slot';
import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { isDev } from '../internal/is-dev';
import { handleNavigationClick, hasNavigableHref, isAppNavigationClick } from '../internal/navigation';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import {
  headerCenterClass,
  headerClass,
  headerEndClass,
  headerStartClass,
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
  rootClass,
  rootParentClass,
  rootStyle,
  rootViewportClass,
  skipLinkClass,
} from './app-shell-styles';

export interface AppShellLabels {
  /** Text of the skip link, the first stop of the Tab order, which moves the focus to the content. Default `Skip to content`. */
  skipToContent: string;
  /** Accessible name of the navigation landmark (`AppShellNav`), unless it has its own `aria-label`. Default `Main`. */
  nav: string;
}

/** @internal Not public API: exported only for the test of the documented defaults (label-defaults.test.tsx, #549). */
export const DEFAULT_LABELS: AppShellLabels = {
  skipToContent: 'Skip to content',
  nav: 'Main',
};

interface AppShellContextValue {
  mainId: string;
  setMainId: (id: string) => void;
  labels: AppShellLabels;
}

const AppShellContext = /* @__PURE__ */ createContext<AppShellContextValue | null>(null);

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
 *   below it the navigation is not displayed and the content takes the whole width. Decided in CSS: nothing moves
 *   at the first paint or at hydration.
 * - **No horizontal overflow**: every part of the header shrinks; put long text in a `TruncatedText` (or any
 *   child with a zero minimum width and an ellipsis) and it is cut at the part's real width.
 * - **Virtual keyboard** (a focused `Field`): `AppShellMain` adds the keyboard's height below its content and
 *   keeps a focused field above it; the header stays at the top. The keyboard is counted once: a floorplan inside
 *   becomes shorter by the keyboard's height (an Object Page's save bar stays above the keyboard) and adds nothing.
 * - **Layers**: the shell adds no layer of its own (the skip link aside, at the sticky level while focused):
 *   toasts, dialogs and popovers opened from the content are above the header, as everywhere else.
 *
 * ```tsx
 * <AppShell>
 *   <AppShellHeader start={<Text>App one</Text>} end={<UserMenu />} />
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
  const context = useMemo<AppShellContextValue>(
    () => ({ mainId, setMainId, labels: { skipToContent, nav } }),
    [mainId, skipToContent, nav],
  );

  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = event.currentTarget.ownerDocument.getElementById(mainId);
    if (!main) return;
    // The focus moves without touching the URL: a fragment would be read as a route by a hash router.
    event.preventDefault();
    main.focus({ preventScroll: true });
  };

  return (
    <AppShellContext.Provider value={context}>
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
  { start, center, end, className, ...rest },
  ref,
) {
  return (
    <header {...rest} ref={ref} data-rop-app-shell-header="" className={cn(headerClass, className)}>
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

export interface AppShellNavProps extends HTMLAttributes<HTMLElement> {
  /** `AppShellNavLink`s, in the order of the Tab key. */
  children?: ReactNode;
}

/**
 * The navigation of the app: a named `<nav>` landmark holding a list of `AppShellNavLink`. From the breakpoint
 * up it is a column beside the content; below it, it is not displayed (see `AppShell`, "Layout and sizing"). It
 * scrolls on its own only when its links are taller than the room it has, and never with the content.
 *
 * The landmark is named by `labels.nav` of the `AppShell` (`Main` by default); its own `aria-label` or
 * `aria-labelledby` takes the place of that name.
 */
export const AppShellNav = /* @__PURE__ */ forwardRef<HTMLElement, AppShellNavProps>(function AppShellNav(
  { className, children, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...rest },
  ref,
) {
  const shell = useContext(AppShellContext);
  const label = ariaLabel ?? (ariaLabelledBy ? undefined : (shell?.labels.nav ?? DEFAULT_LABELS.nav));
  return (
    <nav
      {...rest}
      ref={ref}
      aria-label={label}
      aria-labelledby={ariaLabelledBy}
      data-rop-app-shell-nav=""
      className={cn(navClass, className)}
    >
      <ul className={navListClass}>{children}</ul>
    </nav>
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
   * link has the focus when it is called. Not used with `asChild`: the child (your router's link) navigates by
   * itself, and passing both is an error in development.
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

    const activate = (native: boolean) => (event: MouseEvent<AppShellNavLinkElement>) => {
      onClick?.(event);
      if (disabled) {
        event.preventDefault();
        return;
      }
      if (!onNavigate) return;
      const link = event.currentTarget;
      const rule = { native };
      // A click handed to `onNavigate` gives the link the focus first (Safari does not focus a clicked link), so a
      // dialog opened from `onNavigate` (a dirty guard) returns the focus to it.
      if (isAppNavigationClick(event, rule) && link.ownerDocument.activeElement !== link) link.focus({ preventScroll: true });
      handleNavigationClick(event, onNavigate, rule);
    };

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
          onClick={onClick}
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
 * -1). It adds no padding: a floorplan brings its own, a plain page adds its own. It scrolls a plain page; a
 * floorplan that takes the height of its parent fills it and scrolls by itself (see `AppShell`, "Layout and
 * sizing").
 */
export const AppShellMain = /* @__PURE__ */ forwardRef<HTMLElement, AppShellMainProps>(function AppShellMain(
  { id: idProp, className, style, children, ...rest },
  ref,
) {
  const shell = useContext(AppShellContext);
  const generatedId = useId();
  const id = idProp ?? shell?.mainId ?? `${generatedId}-main`;
  const setMainId = shell?.setMainId;
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
      style={{ ...(mainStyle as CSSProperties), ...style }}
    >
      {children}
    </main>
  );
});
