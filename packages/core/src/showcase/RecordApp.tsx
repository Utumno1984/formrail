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
import { moduleHref, openModule, openRelated, readRoute, recordHref, subscribeRoute } from './showcase-router';

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

/** The module of the URL when it is one of the app's, `null` otherwise (no `module`, or another record type). */
const readAppModule = (): AppModuleName | null => {
  const { module } = readRoute();
  return isAppModule(module) ? module : null;
};
const readNoModule = (): null => null;

/**
 * Brings the URL back to the list of `module` (a control changed): every route parameter and list parameter of the app's
 * modules goes, and so does the saved scroll, as at the start of a story. Not a navigation: `replaceState`.
 */
export function resetApp(win: Window, module: AppModuleName): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of [...params.keys()]) {
    if (key === 'module' || key === 'record' || key === 'create' || APP_MODULES.some((m) => key.startsWith(`${m.name}.`))) params.delete(key);
  }
  params.set('module', module);
  win.history.replaceState(null, '', `${win.location.pathname}?${params.toString()}`);
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
  // A control that changes the initial module shows that module's list (the first render keeps the URL: a deep link wins).
  const shownInitial = useRef(initial);
  useEffect(() => {
    if (shownInitial.current === initial) return;
    shownInitial.current = initial;
    resetApp(window, initial);
  }, [initial]);

  const callbacks = useRef({ onNavigate });
  useEffect(() => {
    callbacks.current = { onNavigate };
  });

  // The guard of the page on screen (none on a list, none on the not-found page).
  const guardRef = useRef<PageGuard | null>(null);
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
          {/* A key per module: another record type is another shell (its list, its toasts), the stores stay. */}
          {active === 'customers' ? (
            <RecordCrud key="customers" module={CUSTOMERS} store={stores.customers} {...shell} />
          ) : (
            <RecordCrud key="sales-orders" module={SALES_ORDERS_CRUD} store={stores['sales-orders']} {...shell} />
          )}
        </div>
      </div>
    </RecordAppContext.Provider>
  );
}
