// Story-only (#525, epic #512): the record-editing showcase as a small business app. A bar of modules (Sales orders,
// Customers) above the record-editing shell (`RecordCrud`), and a link from an order to its customer, so the same
// patterns (List Report, Object Page, dirty-guard) show on records of different types in one application.
// No new library API; what it adds, all in this showcase:
//   - the active module is the router's `module` parameter (`showcase-router.ts`), the `module` prop only the one
//     shown while the URL names none. The bar is made of real links (`href` = the list of the module with every
//     module's own list parameters kept): a plain click is a `pushState`, a modified click opens the href untouched;
//   - each module keeps its list parameters (pill, search, sort: the module's own prefix in the URL) and its saved
//     scroll (`useListReportScrollRestoration`, per prefix), so coming back to a module shows its list as it was left;
//   - the "servers" (one `RecordStore` per module) live HERE, not in the shell: a module left and shown again finds
//     its records as they were, and a save in flight when the user changes module still lands in its store;
//   - the dirty-guard: the page on screen registers its guard (`RecordAppContext`), the bar asks it before leaving, and
//     the order's customer link goes through it too ("Unsaved changes" dialog; leaving opens the customer, browser Back
//     returns to the order as the server holds it, with no edit);
//   - a page opened from another module (the order's customer) leaves to ITS module's list with "Back to list": the
//     entry before it is not that list (`openRelated` in the router).
// Not exported by the package.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react';
import { createCustomerStore, makeCustomersReferencedBy } from './customer-store';
import { CUSTOMERS } from './modules/customers/customers-module';
import { SALES_ORDERS_CRUD } from './modules/sales-orders/sales-orders-module';
import { RecordAppContext, type PageGuard, type RecordAppContextValue } from './record-app-context';
import { RecordCrud, type RecordCrudProps } from './RecordCrud';
import type { SaveOutcome } from './record-store';
import { moduleHref, openModule, openRelated, recordHref, replaceRoute, subscribeRoute } from './showcase-router';

/** The modules of the app, in the order of the bar: the router name and the text of the link. */
export const APP_MODULES = [
  { name: 'sales-orders', label: 'Sales orders' },
  { name: 'customers', label: 'Customers' },
] as const;
export type AppModuleName = (typeof APP_MODULES)[number]['name'];

const isAppModule = (name: string | null): name is AppModuleName => APP_MODULES.some((m) => m.name === name);

/** What the user starts in the app (never what Back/Forward does, and never what a page reports by itself). */
export type AppNavigateEvent = { to: 'module'; module: AppModuleName } | { to: 'related'; module: string; id: string };

export interface RecordAppProps {
  /** The module shown when the URL names none (and the one a changed control brings back). */
  module: AppModuleName;
  history: RecordCrudProps<{ id: string }, object, unknown>['history'];
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
  saveDelayMs: number;
  saveOutcome: SaveOutcome;
  /** Called on the navigations the app starts: a link of the bar, the order's customer. */
  onNavigate: (event: AppNavigateEvent) => void;
}

/** The height of the bar: a single row, also at 375 px (two links, no wrapping). The pages take the rest. */
export const APP_BAR_HEIGHT = 48;

const BAR: CSSProperties = {
  boxSizing: 'border-box',
  height: APP_BAR_HEIGHT,
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  padding: '0 16px',
  margin: 0,
  listStyle: 'none',
  overflowX: 'auto',
  whiteSpace: 'nowrap',
  fontFamily: 'system-ui, sans-serif',
  borderBottom: '1px solid var(--color-rop-border-subtle)',
};

const linkStyle = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 12px',
  textDecoration: 'none',
  fontWeight: 500,
  color: active ? 'var(--color-rop-text)' : 'var(--color-rop-text-muted)',
  borderBottom: `2px solid ${active ? 'var(--color-rop-primary)' : 'transparent'}`,
  outlineOffset: -2,
});

/** The module the URL names when it is one of the app's, `null` otherwise (no `module`, or another record type). */
const readAppModule = (): AppModuleName | null => {
  // The raw parameter, not `readRoute()`: a URL with no `module` parses to the router's first module, but here it
  // means "the URL names none", so the `module` prop decides (#527).
  const module = new URLSearchParams(window.location.search).get('module');
  return module !== null && isAppModule(module) ? module : null;
};
const readNoModule = (): null => null;

/** Forgets the saved scroll of every list (`useListReportScrollRestoration`), as at the start of a story. */
const forgetListScroll = (win: Window): void => {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
};

/** The URL of the list of `module` with no route parameter and no list parameter of the app's modules (the others stay). */
const startUrl = (win: Window, module: AppModuleName): string => {
  const params = new URLSearchParams(win.location.search);
  for (const key of [...params.keys()]) {
    if (key === 'module' || key === 'record' || key === 'create' || APP_MODULES.some((m) => key.startsWith(`${m.name}.`))) params.delete(key);
  }
  params.set('module', module);
  return `${win.location.pathname}?${params.toString()}`;
};

/**
 * For the START of a `play` function only, on a story just mounted (as the `reset*` helpers of the other showcase
 * stories): the URL back to the list of `module` (every route and list parameter of the app's modules goes, and so
 * does the saved scroll), then a `popstate` so the lists already mounted read it again. Never while the app runs: a
 * `popstate` sent over a dirty page is taken by its dirty-guard for browser Back (a control changed while the app runs
 * goes through `RecordApp` itself, behind the page's guard and with no `popstate`).
 */
export function resetApp(win: Window, module: AppModuleName): void {
  forgetListScroll(win);
  win.history.replaceState(null, '', startUrl(win, module));
  win.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

/** For e2e assertions: the two "servers" of the mounted app, by module name. */
type AppWindow = { __ropShowcaseAppStores?: Record<AppModuleName, unknown> };

export function RecordApp({ module: initial, history, listLoadDelayMs, recordLoadDelayMs, saveDelayMs, saveOutcome, onNavigate }: RecordAppProps) {
  // The customers are the 200 of the Customers story and those the orders name: every order's link opens a customer.
  const [stores] = useState(() => {
    const orders = SALES_ORDERS_CRUD.createStore();
    return { 'sales-orders': orders, customers: createCustomerStore(makeCustomersReferencedBy(orders.snapshot().map((o) => o.customerId))) };
  });
  useEffect(() => {
    const w = window as AppWindow;
    w.__ropShowcaseAppStores = stores;
    return () => {
      if (w.__ropShowcaseAppStores === stores) delete w.__ropShowcaseAppStores;
    };
  }, [stores]);

  const routed = useSyncExternalStore(subscribeRoute, readAppModule, readNoModule);
  const active = routed ?? initial;

  // The guard of the page on screen (none on a list, none on the not-found page).
  const guardRef = useRef<PageGuard | null>(null);

  // A control that changes the initial module shows that module's list, as at the start of a story (the first render
  // keeps the URL: a deep link wins). It leaves the page on screen as a link of the bar does: behind the page's guard
  // ("Keep editing" leaves URL and page as they were), and with no `popstate` (the guard would take it for browser
  // Back and undo it with `history.go`): `replaceRoute` tells the router's subscribers, and a new `generation` mounts
  // the shell again so its lists read their parameters (and their saved scroll) from the cleaned URL. The value read
  // when the reset runs is the control's latest: one changed again while the dialog is open is the one shown.
  const shownInitial = useRef(initial);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (shownInitial.current === initial) return;
    shownInitial.current = initial;
    const reset = () => {
      forgetListScroll(window);
      replaceRoute(startUrl(window, shownInitial.current));
      setGeneration((g) => g + 1);
    };
    const guard = guardRef.current;
    if (guard) guard(reset);
    else reset();
  }, [initial]);

  const callbacks = useRef({ onNavigate });
  useEffect(() => {
    callbacks.current = { onNavigate };
  });

  const context = useMemo<RecordAppContextValue>(
    () => ({
      hrefRelated: (module, id) => recordHref(id, module),
      openRelated: (module, id) => {
        callbacks.current.onNavigate({ to: 'related', module, id });
        openRelated(id, module);
      },
      registerGuard: (guard) => {
        guardRef.current = guard;
        return () => {
          if (guardRef.current === guard) guardRef.current = null;
        };
      },
    }),
    [],
  );

  const go = useCallback((module: AppModuleName) => {
    callbacks.current.onNavigate({ to: 'module', module });
    openModule(module);
  }, []);
  const click = (module: AppModuleName) => (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd/Shift/Alt/middle click: the browser opens the real href (new tab/window), untouched.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const guard = guardRef.current;
    if (guard) guard(() => go(module));
    else go(module);
  };

  // The pages are as tall as the story minus the bar: the shell reads `--rop-demo-viewport-height`, which the bar's
  // element hands down already reduced (the outer value is read under another name: a property cannot refer to itself).
  const outer = { '--rop-app-viewport': 'var(--rop-demo-viewport-height, 100dvh)' } as CSSProperties;
  const inner = { '--rop-demo-viewport-height': `calc(var(--rop-app-viewport) - ${APP_BAR_HEIGHT}px)` } as CSSProperties;
  const shell = {
    history,
    listLoadDelayMs,
    recordLoadDelayMs,
    saveDelayMs,
    saveOutcome,
    // The shell's own reports (rows, "New …") are not the app's: the app reports its bar and its related links.
    onNavigate: () => undefined,
  } as const;

  return (
    <RecordAppContext.Provider value={context}>
      <div style={outer}>
        <nav aria-label="Modules">
          <ul style={BAR}>
            {APP_MODULES.map((m) => (
              <li key={m.name} style={{ display: 'flex' }}>
                <a
                  href={moduleHref(m.name)}
                  aria-current={m.name === active ? 'page' : undefined}
                  onClick={click(m.name)}
                  style={linkStyle(m.name === active)}
                >
                  {m.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div style={inner}>
          {/* A key per module: another record type is another shell (its list, its toasts), the stores stay. And per
              reset by the control: the shell starts over on the cleaned URL. */}
          {active === 'customers' ? (
            <RecordCrud key={`customers:${generation}`} module={CUSTOMERS} store={stores.customers} {...shell} />
          ) : (
            <RecordCrud key={`sales-orders:${generation}`} module={SALES_ORDERS_CRUD} store={stores['sales-orders']} {...shell} />
          )}
        </div>
      </div>
    </RecordAppContext.Provider>
  );
}
