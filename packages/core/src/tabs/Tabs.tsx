import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type RefObject,
} from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { isDev } from '../internal/is-dev';
import { scrollFromStart, towardsEndSign } from '../internal/rtl-scroll';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export type TabsActivationMode = 'automatic' | 'manual';
export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabsProps extends Omit<ComponentPropsWithoutRef<'div'>, 'defaultValue' | 'dir' | 'onChange'> {
  /**
   * Controlled selection: the `value` of the selected tab. Omit the prop (leave it `undefined`)
   * to leave the tabs uncontrolled. A value that matches no tab shows no panel (and logs an error
   * in development); it is never "corrected" through `onValueChange`.
   */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  /**
   * Called with the tab's value **only** for a user gesture (click, arrow keys in `automatic`,
   * Enter/Space in `manual`). Never called when `value` changes from outside.
   */
  onValueChange?: (value: string) => void;
  /** Direction of the arrow keys (and `aria-orientation`). Default `horizontal`. */
  orientation?: TabsOrientation;
  /** Text direction; left/right arrows are swapped in `rtl`. Default: inherited from the document. */
  dir?: 'ltr' | 'rtl';
  /**
   * `automatic` (default): moving focus with the arrows selects the tab. `manual`: the arrows only
   * move focus; Enter or Space selects.
   */
  activationMode?: TabsActivationMode;
  /**
   * Keep inactive panels mounted (with the `hidden` attribute), so their state (e.g. a typed
   * value) survives a tab change. Default `false` (inactive panels are unmounted). Can be
   * overridden per `TabsContent`.
   */
  keepMounted?: boolean;
}

export interface TabsListProps extends ComponentPropsWithoutRef<'div'> {
  /** Accessible name of the tab list. Required: this or `aria-labelledby`. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface TabsTriggerProps extends Omit<ComponentPropsWithoutRef<'button'>, 'value' | 'type'> {
  /** The value this tab stands for. Must be unique inside the `Tabs`; pairs with a `TabsContent`. */
  value: string;
  /** A disabled tab is skipped by the arrow keys; if it is the selected one it stays selected. */
  disabled?: boolean;
}

export interface TabsContentProps extends Omit<ComponentPropsWithoutRef<'div'>, 'value'> {
  /** The tab this panel belongs to. */
  value: string;
  /** Overrides `Tabs`' `keepMounted` for this panel. */
  keepMounted?: boolean;
}

interface TabsState {
  orientation: TabsOrientation;
  keepMounted: boolean;
  /** The selected value (controlled or internal), so a panel can tell if it is the active one. */
  current: string | undefined;
  /** The effective text direction (the `dir` prop, else the inherited one once mounted). */
  dir: 'ltr' | 'rtl' | undefined;
}

const TabsContext = /* @__PURE__ */ createContext<TabsState>({
  orientation: 'horizontal',
  keepMounted: false,
  current: undefined,
  dir: undefined,
});

// Full literals (Tailwind scan). The selected indicator is a transparent-by-default border of the
// same width in every state, so selecting a tab changes colours only, never the box: no layout shift.
const ROOT =
  'flex min-w-0 max-w-full font-rop-sans text-rop-body text-rop-text ' +
  'data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row';
const LIST =
  'flex min-w-0 shrink-0 data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:overflow-x-auto ' +
  'data-[orientation=horizontal]:border-b data-[orientation=horizontal]:border-rop-border-subtle ' +
  // Horizontal: the edge indicators replace the native scrollbar (hidden on most platforms anyway,
  // and a second, inconsistent affordance where it is not). `scroll-padding` keeps a tab brought
  // into view by the keyboard clear of the indicator that sits over the edge.
  'data-[orientation=horizontal]:[scrollbar-width:none] data-[orientation=horizontal]:[&::-webkit-scrollbar]:hidden ' +
  'data-[orientation=horizontal]:scroll-px-12 ' +
  'data-[orientation=vertical]:flex-col data-[orientation=vertical]:overflow-y-auto ' +
  'data-[orientation=vertical]:border-e data-[orientation=vertical]:border-rop-border-subtle';
const TRIGGER =
  'inline-flex max-w-64 min-w-0 shrink-0 cursor-pointer items-center border-0 border-solid border-transparent bg-transparent ' +
  'px-3 py-2 font-rop-sans text-rop-body font-medium text-rop-text-muted ' +
  'data-[orientation=horizontal]:border-b-2 ' +
  'data-[orientation=vertical]:border-e-2 data-[orientation=vertical]:justify-start data-[orientation=vertical]:text-start ' +
  'not-forced-colors:data-[state=active]:border-rop-primary not-forced-colors:data-[state=active]:text-rop-text ' +
  'forced-colors:data-[state=active]:border-[Highlight] ' +
  'not-disabled:not-data-[state=active]:rop-hover:bg-rop-surface-subtle not-disabled:not-data-[state=active]:rop-hover:text-rop-text ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  // Drawn inside the box: never clipped by the scrolling list.
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:-outline-offset-2 ' +
  'motion-safe:[transition-property:border-color,color,background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)]';
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),' +
  'textarea:not([disabled]),summary,[contenteditable]:not([contenteditable="false"]),[tabindex]:not([tabindex^="-"])';
const LABEL ='min-w-0 truncate';
// Horizontal list only: a positioning box around the tablist, so the edge indicators are not
// children of `role="tablist"` (which may only own tabs).
// `isolate`: the indicators' sticky-level layer stays local to this box.
const SCROLL_BOX = 'relative isolate flex min-w-0 shrink-0 flex-col';
// An edge indicator: a fade towards the hidden tabs ending in a chevron, shown only on the side
// where tabs are hidden. Pointer affordance (a click scrolls one view towards that side); keyboard
// users reach every tab with the arrows, so it is `aria-hidden` and never focusable. It stops 1px
// above the bottom so the list's own border stays continuous under it.
const EDGE =
  // The chevron sits at the outer edge, on the opaque half; the inner half fades the hidden tab out.
  // No padding on the box: the library has no box-sizing reset, so `w-12` must be its full width
  // (it matches `scroll-px-12`); the chevron's own margin keeps it off the edge.
  'absolute top-0 bottom-px z-rop-sticky flex w-12 cursor-pointer select-none items-center text-rop-text-muted ' +
  'from-rop-surface from-50% to-transparent rop-hover:text-rop-text ' +
  'forced-colors:bg-none forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]';
// Physical gradient direction, chosen from the computed direction (no `[dir=rtl]` selector).
const EDGE_TOWARDS_RIGHT = 'bg-linear-to-r';
const EDGE_TOWARDS_LEFT = 'bg-linear-to-l';
/**
 * Width of an edge indicator (`w-12`) only where nothing is laid out (jsdom). In a browser the
 * scroll step uses the indicator's rendered width instead, so it follows `w-12` / `scroll-px-12`
 * (rem based) under text zoom or a changed root font size.
 */
const EDGE_FALLBACK_PX = 48;
/** Sub-pixel tolerance: a fractional scroll position at either end does not count as hidden content. */
const EDGE_EPSILON = 1;
const CONTENT =
  'min-w-0 flex-1 data-[state=inactive]:hidden focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:-outline-offset-2';

const NO_NAME_WARNING = '[react-object-page] <TabsList> has no accessible name: pass `aria-label` or `aria-labelledby`.';
const noMatchWarning = (value: string) =>
  `[react-object-page] <Tabs value="${value}"> matches no tab: no panel is shown.`;

/**
 * Tabs: tablist / tab / tabpanel pattern with roving tabindex and arrow keys (Home/End, wrap,
 * disabled tabs skipped, RTL and vertical aware), `automatic` or `manual` activation, and an
 * optional `keepMounted` for inactive panels. Built on Radix Tabs. `onValueChange` is called only
 * for user gestures, never when a controlled `value` changes from outside.
 */
export const Tabs = /* @__PURE__ */ forwardRef<HTMLDivElement, TabsProps>(function Tabs(props, ref) {
  const {
    orientation = 'horizontal',
    keepMounted = false,
    className,
    value,
    defaultValue,
    onValueChange,
    ...rest
  } = props;
  // The selection is kept here (not in Radix) so panels know whether they are the active one.
  // Radix only calls its callback for user gestures, which is what keeps `onValueChange` echo-free.
  const [internal, setInternal] = useState(defaultValue);
  const current = value !== undefined ? value : internal;
  // Radix reports a click on mousedown and again on focus (same task): the second report of the
  // same gesture is dropped, but a later gesture towards the same tab (a controlled parent that
  // refused the change) is a new request and goes through.
  const recent = useRef<string | undefined>(undefined);
  const handleValueChange = (next: string) => {
    if (next === current || next === recent.current) return;
    recent.current = next;
    setTimeout(() => {
      recent.current = undefined;
    }, 0);
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };
  const root = useRef<HTMLDivElement>(null);
  const mergedRef = useMemo(() => composeRefs(ref, root), [ref]);
  // Radix falls back to LTR (and writes `dir="ltr"`) when no `dir` is given: inherit the real
  // direction of the surrounding document once mounted instead.
  const [inheritedDir, setInheritedDir] = useState<'ltr' | 'rtl' | undefined>(undefined);
  useIsomorphicLayoutEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent || rest.dir) return;
    const computed = getComputedStyle(parent).direction === 'rtl' ? 'rtl' : 'ltr';
    setInheritedDir((prev) => (prev === computed ? prev : computed));
  }, [rest.dir]);
  const dir = rest.dir ?? inheritedDir;
  const state = useMemo(
    () => ({ orientation, keepMounted, current, dir }),
    [orientation, keepMounted, current, dir],
  );
  // Radix's root is always controlled and needs a string: "nothing selected" is a per-instance
  // value no consumer tab can have (an empty string would select a tab with `value=""`).
  const noSelection = `\u0000rop-no-selection:${useId()}`;

  useEffect(() => {
    if (!isDev() || value === undefined) return;
    const el = root.current;
    if (!el) return;
    const own = (node: Element) => node.closest('[data-rop-tabs]') === el;
    let warned = false;
    const check = () => {
      const tabs = Array.from(el.querySelectorAll('[role="tab"]')).filter(own);
      const unmatched = tabs.length > 0 && !tabs.some((t) => t.getAttribute('aria-selected') === 'true');
      if (unmatched && !warned) console.error(noMatchWarning(value));
      warned = unmatched;
    };
    check();
    // The set of tabs can change without `Tabs` rendering (a child owns the list) while `value`
    // stays the same: look again whenever tabs are added or removed.
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [value]);

  return (
    <TabsContext.Provider value={state}>
      <RadixTabs.Root
        {...rest}
        dir={dir}
        value={current ?? noSelection}
        onValueChange={handleValueChange}
        orientation={orientation}
        ref={mergedRef}
        data-rop-tabs=""
        className={cn(ROOT, className)}
      />
    </TabsContext.Provider>
  );
});

interface EdgeState {
  /** Tabs are hidden past the inline start / end of the list. */
  start: boolean;
  end: boolean;
  rtl: boolean;
}

const NO_EDGES: EdgeState = { start: false, end: false, rtl: false };

/**
 * Which sides of a horizontally scrolling list hide content. The distance from the inline start is
 * normalised over the engine's RTL `scrollLeft` convention (negative, reverse or default).
 */
function readEdges(list: HTMLElement): EdgeState {
  const rtl = getComputedStyle(list).direction === 'rtl';
  const max = list.scrollWidth - list.clientWidth;
  if (max <= EDGE_EPSILON) return { start: false, end: false, rtl };
  const offset = scrollFromStart(list, rtl);
  return { start: offset > EDGE_EPSILON, end: offset < max - EDGE_EPSILON, rtl };
}

/**
 * Tracks the hidden sides of the horizontal list: on scroll, on a resize of the list, on a
 * resize, addition or removal of a tab (a late web font or a new tab changes the content width
 * without changing the list's box), and on a change of direction (`dir`: same sizes, mirrored sides).
 */
function useScrollEdges(
  list: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  dir: 'ltr' | 'rtl' | undefined,
): EdgeState {
  const [edges, setEdges] = useState<EdgeState>(NO_EDGES);
  useIsomorphicLayoutEffect(() => {
    const el = list.current;
    if (!enabled || !el) {
      setEdges(NO_EDGES);
      return;
    }
    const update = () => {
      const next = readEdges(el);
      setEdges((prev) => (prev.start === next.start && prev.end === next.end && prev.rtl === next.rtl ? prev : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const observeAll = () => {
      if (!resize) return;
      resize.disconnect();
      resize.observe(el);
      for (const child of Array.from(el.children)) resize.observe(child);
    };
    observeAll();
    const mutations =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            observeAll();
            update();
          });
    mutations?.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', update);
      resize?.disconnect();
      mutations?.disconnect();
    };
  }, [enabled, dir]);
  return edges;
}

/**
 * The row (or column, when vertical) of tabs. Scrolls on its own axis when it does not fit; the
 * focused tab is always brought into view, so every tab is reachable with the arrow keys. A
 * horizontal list that overflows shows an indicator on each side that hides tabs (a fade ending in
 * a chevron); clicking it scrolls one view towards that side.
 */
export const TabsList = /* @__PURE__ */ forwardRef<HTMLDivElement, TabsListProps>(function TabsList(props, ref) {
  const { className, ...rest } = props;
  const named = Boolean(rest['aria-label'] ?? rest['aria-labelledby']);
  const { orientation, dir } = useContext(TabsContext);
  useEffect(() => {
    if (!named && isDev()) console.error(NO_NAME_WARNING);
  }, [named]);
  const horizontal = orientation === 'horizontal';
  const listEl = useRef<HTMLDivElement>(null);
  const mergedRef = useMemo(() => composeRefs(ref, listEl), [ref]);
  const edges = useScrollEdges(listEl, horizontal, dir);

  const scrollTowards = (side: 'start' | 'end', indicator: HTMLElement) => {
    const el = listEl.current;
    if (!el) return;
    // The indicator's rendered width (rem based: it grows with text zoom), not a copy of it in JS.
    const edgeWidth = indicator.offsetWidth || EDGE_FALLBACK_PX;
    // One view minus both indicators, so the tab half-hidden under the indicator ends up in clear view.
    const step = Math.max(el.clientWidth - 2 * edgeWidth, edgeWidth);
    // Towards the inline end is +x in LTR; in RTL it depends on the engine's `scrollLeft` convention.
    const sign = (side === 'end' ? 1 : -1) * towardsEndSign(edges.rtl);
    // A `matchMedia` that throws (a restricted embed) must not cost the scroll: smooth, as by default.
    let reduced = false;
    try {
      reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    if (typeof el.scrollBy === 'function') el.scrollBy({ left: sign * step, behavior: reduced ? 'auto' : 'smooth' });
    else el.scrollLeft += sign * step;
  };
  const edge = (side: 'start' | 'end') => {
    // The start indicator fades towards the inline end, and vice versa.
    const towardsRight = (side === 'start') !== edges.rtl;
    return (
      <div
        aria-hidden="true"
        data-rop-tabs-edge={side}
        // A press must not take the focus from the tab that has it (the div is not focusable, but
        // a mousedown on it would still move the focus away from that tab).
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => scrollTowards(side, event.currentTarget)}
        className={cn(EDGE, side === 'start' ? 'start-0 justify-start' : 'end-0 justify-end', towardsRight ? EDGE_TOWARDS_RIGHT : EDGE_TOWARDS_LEFT)}
      >
        <svg
          viewBox="0 0 16 16"
          className="mx-1 size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          {/* Points at the hidden tabs: left for start in LTR, right for end in LTR, mirrored in RTL. */}
          <path d={towardsRight ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} />
        </svg>
      </div>
    );
  };
  return (
    // Always rendered, so switching orientation never remounts the tablist (which would drop the
    // focus); vertical: `contents`, the list stays the flex item of the root as before.
    <div className={horizontal ? SCROLL_BOX : 'contents'} data-rop-tabs-scroll="">
      <RadixTabs.List {...rest} ref={mergedRef} data-orientation={orientation} className={cn(LIST, className)} />
      {edges.start ? edge('start') : null}
      {edges.end ? edge('end') : null}
    </div>
  );
});

/** One tab. The selected one is drawn with a border of the same width as the others. */
export const TabsTrigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, TabsTriggerProps>(
  function TabsTrigger(props, ref) {
    const { className, children, onFocus, ...rest } = props;
    const { orientation, current } = useContext(TabsContext);
    const el = useRef<HTMLButtonElement>(null);
    const mergedRef = useMemo(() => composeRefs(ref, el), [ref]);

    // A removed tab that held the focus would leave it on <body>: hand it to the list's current tab.
    useLayoutEffect(() => {
      const node = el.current;
      const list = node?.closest<HTMLElement>('[role="tablist"]');
      return () => {
        if (!node || !list || document.activeElement !== node) return;
        queueMicrotask(() => {
          if (!list.isConnected) return;
          const active = document.activeElement;
          if (active && active !== document.body) return;
          // The selected tab first: focusing it changes nothing, whereas focusing another tab would
          // select it (automatic activation) and overwrite the consumer's choice.
          const next =
            list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]:not([disabled])') ??
            list.querySelector<HTMLElement>('[role="tab"]:not([disabled])');
          next?.focus();
        });
      };
    }, []);

    const handleFocus = (event: FocusEvent<HTMLButtonElement>) => {
      onFocus?.(event);
      // Keep the focused tab visible inside the scrolling list without moving the page more than needed.
      event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };

    return (
      <RadixTabs.Trigger
        {...rest}
        // The tab stop follows the selection, not the last focused tab (Radix's own roving state):
        // otherwise Shift+Tab from a panel would land on a stale tab and, in automatic mode, select it.
        // After the spread: a consumer `tabIndex` must not break the single tab stop.
        tabIndex={current === rest.value ? 0 : -1}
        ref={mergedRef}
        data-orientation={orientation}
        onFocus={handleFocus}
        className={cn(TRIGGER, className)}
      >
        <span className={LABEL}>{children}</span>
      </RadixTabs.Trigger>
    );
  },
);

/** The panel of one tab. Inactive panels are unmounted, or `hidden` with `keepMounted`. */
export const TabsContent = /* @__PURE__ */ forwardRef<HTMLDivElement, TabsContentProps>(
  function TabsContent(props, ref) {
    const { className, keepMounted, ...rest } = props;
    const state = useContext(TabsContext);
    const keep = keepMounted ?? state.keepMounted;
    const node = useRef<HTMLDivElement>(null);
    const mergedRef = useMemo(() => composeRefs(ref, node), [ref]);
    // The panel is a tab stop only when it has nothing focusable inside (otherwise Tab goes straight
    // to its first control).
    const [hasFocusable, setHasFocusable] = useState(false);
    useIsomorphicLayoutEffect(() => {
      const el = node.current;
      if (!el) return;
      const check = () => {
        const found = Boolean(el.querySelector(FOCUSABLE));
        setHasFocusable((prev) => (prev === found ? prev : found));
      };
      check();
      // Content can appear or change without this component rendering (Radix mounts it a beat
      // after the panel becomes active; children can be conditional).
      if (typeof MutationObserver === 'undefined') return;
      const observer = new MutationObserver(check);
      observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'tabindex', 'href'] });
      return () => observer.disconnect();
    }, []);
    // Radix only hides a panel that is not present: with `forceMount` it must be told explicitly.
    return (
      <RadixTabs.Content
        {...rest}
        // After the spread: a consumer `tabIndex` must not override this rule.
        tabIndex={hasFocusable ? undefined : 0}
        ref={mergedRef}
        forceMount={keep ? true : undefined}
        hidden={state.current !== rest.value}
        className={cn(CONTENT, className)}
      />
    );
  },
);
