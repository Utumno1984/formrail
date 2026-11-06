import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
} from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { isDev } from '../internal/is-dev';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';

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
}

const TabsContext = /* @__PURE__ */ createContext<TabsState>({
  orientation: 'horizontal',
  keepMounted: false,
  current: undefined,
});

// Full literals (Tailwind scan). The selected indicator is a transparent-by-default border of the
// same width in every state, so selecting a tab changes colours only, never the box: no layout shift.
const ROOT =
  'flex min-w-0 max-w-full font-rop-sans text-rop-body text-rop-text ' +
  'data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row';
const LIST =
  'flex min-w-0 shrink-0 data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:overflow-x-auto ' +
  'data-[orientation=horizontal]:border-b data-[orientation=horizontal]:border-rop-border-subtle ' +
  'data-[orientation=vertical]:flex-col data-[orientation=vertical]:overflow-y-auto ' +
  'data-[orientation=vertical]:border-e data-[orientation=vertical]:border-rop-border-subtle';
const TRIGGER =
  'inline-flex max-w-64 min-w-0 shrink-0 cursor-pointer items-center border-0 border-solid border-transparent bg-transparent ' +
  'px-3 py-2 font-rop-sans text-rop-body font-medium text-rop-text-muted ' +
  'data-[orientation=horizontal]:border-b-2 ' +
  'data-[orientation=vertical]:border-e-2 data-[orientation=vertical]:justify-start data-[orientation=vertical]:text-start ' +
  'not-forced-colors:data-[state=active]:border-rop-primary not-forced-colors:data-[state=active]:text-rop-text ' +
  'forced-colors:data-[state=active]:border-[Highlight] ' +
  'not-disabled:not-data-[state=active]:hover:bg-rop-surface-subtle not-disabled:not-data-[state=active]:hover:text-rop-text ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  // Inset ring: never clipped by the scrolling list.
  'focus-visible:[outline:2px_solid_var(--color-rop-primary)] focus-visible:-outline-offset-2 ' +
  'motion-safe:[transition-property:border-color,color,background-color] motion-safe:duration-[var(--motion-rop-feedback-duration)] ' +
  'motion-safe:ease-[var(--motion-rop-feedback-easing)]';
const LABEL = 'min-w-0 truncate';
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
  const latest = useRef(current);
  // Follows the prop / state after every render (an external change included, which is no gesture).
  latest.current = current;
  const handleValueChange =(next: string) => {
    // Radix reports a click on mousedown and again on focus: only a real change is a gesture's result.
    // The ref is the value as of the last gesture: the render that follows has not happened yet.
    if (next === latest.current) return;
    latest.current = next;
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };
  const root = useRef<HTMLDivElement>(null);
  const mergedRef = useMemo(() => composeRefs(ref, root), [ref]);
  const state = useMemo(() => ({ orientation, keepMounted, current }), [orientation, keepMounted, current]);

  useEffect(() => {
    if (!isDev() || value === undefined) return;
    const el = root.current;
    if (!el) return;
    const own = (node: Element) => node.closest('[data-rop-tabs]') === el;
    const tabs = Array.from(el.querySelectorAll('[role="tab"]')).filter(own);
    if (tabs.length > 0 && !tabs.some((t) => t.getAttribute('aria-selected') === 'true')) {
      console.error(noMatchWarning(value));
    }
  }, [value]);

  return (
    <TabsContext.Provider value={state}>
      <RadixTabs.Root
        {...rest}
        value={current ?? ''}
        onValueChange={handleValueChange}
        orientation={orientation}
        ref={mergedRef}
        data-rop-tabs=""
        className={cn(ROOT, className)}
      />
    </TabsContext.Provider>
  );
});

/** The row (or column, when vertical) of tabs. Scrolls on its own axis when it does not fit. */
export const TabsList = /* @__PURE__ */ forwardRef<HTMLDivElement, TabsListProps>(function TabsList(props, ref) {
  const { className, ...rest } = props;
  const named = Boolean(rest['aria-label'] ?? rest['aria-labelledby']);
  const { orientation } = useContext(TabsContext);
  useEffect(() => {
    if (!named && isDev()) console.error(NO_NAME_WARNING);
  }, [named]);
  return <RadixTabs.List {...rest} ref={ref} data-orientation={orientation} className={cn(LIST, className)} />;
});

/** One tab. The selected one is drawn with a border of the same width as the others. */
export const TabsTrigger = /* @__PURE__ */ forwardRef<HTMLButtonElement, TabsTriggerProps>(
  function TabsTrigger(props, ref) {
    const { className, children, onFocus, ...rest } = props;
    const { orientation } = useContext(TabsContext);
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
          const next =
            list.querySelector<HTMLElement>('[role="tab"][tabindex="0"]') ??
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
    // Radix only hides a panel that is not present: with `forceMount` it must be told explicitly.
    return (
      <RadixTabs.Content
        {...rest}
        ref={ref}
        forceMount={keep ? true : undefined}
        hidden={state.current !== rest.value}
        className={cn(CONTENT, className)}
      />
    );
  },
);
