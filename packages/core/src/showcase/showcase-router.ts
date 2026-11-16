// Story-only: the mini-router of the record-editing showcases (#150, shared since #363, with modules since
// #518). No new library API: ~100 lines on `history` + `popstate`.
//   - the route is ONE tagged value, `Route` = list | record(id) | create, of ONE module (a record type:
//     `/<module>`, `/<module>/<id>`, `/<module>/new`). In the URL it is carried by the `record=<id>` and
//     `create=1` query parameters, plus `module=<name>` for any module but the default one (so the URLs of the
//     default module, the invoices, are the same as before modules existed). They are only ever READ through
//     `parseRoute` (one value: with both `record` and `create` present `record` wins, documented; an unknown
//     module is the list of the default module) and only ever WRITTEN through `routeSearch`, which sets exactly
//     the ones of the route and removes the others. So "both present" can be parsed but never produced, and
//     leaving a page clears both. A route added later (Delete, #365/#366) is one more member of the union;
//     every other parameter (the list's own, the page's) is kept byte for byte by `updateSearch`;
//   - opening = `pushState` (so Back/Forward work) with a marker in `history.state`;
//   - leaving = `history.back()` when this entry was pushed by the list (exact restoration, and Forward
//     reopens the page), otherwise (deep link) a `replaceState` to the list URL of the same module;
//   - the list restores its scroll by itself (`useListReportScrollRestoration`, keyed on the list's own
//     parameters: no route parameter is one of them).
import { updateSearch } from '../list-report/use-list-report-url-state';

/** The modules the router knows, the default one first: it is the one whose URLs carry no `module` parameter. */
export const SHOWCASE_MODULES: readonly [string, ...string[]] = ['invoices'];
export const DEFAULT_MODULE: string = SHOWCASE_MODULES[0];

export type Route = { module: string } & ({ kind: 'list' } | { kind: 'record'; id: string } | { kind: 'create' });

/** One canonical string per route (unambiguous whatever the module name or the id contain). */
export const routeKey = (route: Route): string =>
  JSON.stringify([route.module, route.kind, route.kind === 'record' ? route.id : null]);

/**
 * The route of a query string. `modules`: the known ones, the default first (`SHOWCASE_MODULES`). A missing,
 * empty or unknown `module` is the default module; an unknown one shows its LIST, whatever else the URL asks.
 */
export function parseRoute(search: string, modules: readonly [string, ...string[]] = SHOWCASE_MODULES): Route {
  const params = new URLSearchParams(search);
  const named = params.get('module');
  const fallback = modules[0];
  if (named && !modules.includes(named)) return { module: fallback, kind: 'list' };
  const module = named || fallback;
  const record = params.get('record');
  if (record) return { module, kind: 'record', id: record }; // `record` wins when both are present
  return params.get('create') === '1' ? { module, kind: 'create' } : { module, kind: 'list' };
}

/**
 * `search` with the route parameters set for `route`: exactly the ones it needs (none for the list of the
 * default module), every other parameter kept byte for byte. `defaultModule`: the one with no `module` parameter.
 */
export function routeSearch(search: string, route: Route, defaultModule: string = DEFAULT_MODULE): string {
  return updateSearch(search, {
    module: route.module === defaultModule ? null : route.module,
    record: route.kind === 'record' ? route.id : null,
    create: route.kind === 'create' ? '1' : null,
  });
}

const FROM_LIST = 'ropFromList';
let routeListeners: (() => void)[] = [];
const notifyRoute = () => routeListeners.forEach((l) => l());

export const subscribeRoute = (listener: () => void) => {
  routeListeners = [...routeListeners, listener];
  window.addEventListener('popstate', listener);
  return () => {
    routeListeners = routeListeners.filter((l) => l !== listener);
    window.removeEventListener('popstate', listener);
  };
};

export const readRoute = (): Route => parseRoute(window.location.search);
/**
 * Primitive snapshots for `useSyncExternalStore`, both derived from the ONE parsed route (never both set), for
 * one module (the default one when not given: what `useSyncExternalStore` calls them with).
 */
export const readRecord = (module: string = DEFAULT_MODULE): string | null => {
  const route = readRoute();
  return route.module === module && route.kind === 'record' ? route.id : null;
};
export const readCreate = (module: string = DEFAULT_MODULE): boolean => {
  const route = readRoute();
  return route.module === module && route.kind === 'create';
};

const stateObject = (): Record<string, unknown> => {
  const s: unknown = window.history.state;
  return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
};

/** The current URL with the route parameters set for `route`. */
const routeUrl = (route: Route): string =>
  `${window.location.pathname}${routeSearch(window.location.search, route)}${window.location.hash}`;

/** The href of a record: the current list parameters plus `record=<id>` (and `module` when not the default). */
export const recordHref = (id: string, module: string = DEFAULT_MODULE): string => routeUrl({ module, kind: 'record', id });

function open(route: Route): void {
  if (routeKey(readRoute()) === routeKey(route)) return; // a double click leaves ONE history entry
  window.history.pushState({ ...stateObject(), [FROM_LIST]: true }, '', routeUrl(route));
  notifyRoute();
}

export const openRecord = (id: string, module: string = DEFAULT_MODULE): void => open({ module, kind: 'record', id });
export const openCreate = (module: string = DEFAULT_MODULE): void => open({ module, kind: 'create' });

// `history.back()` is asynchronous: until its `popstate` the page is still on screen and still carries the
// marker, so a second click would go back TWO entries (out of the app). One at a time.
let leaving = false;
export const isLeaving = (): boolean => leaving;

/** Leaves the current page for the list of its module, whichever page it is. */
export function leaveRoute(): void {
  if (stateObject()[FROM_LIST] === true) {
    if (leaving) return;
    leaving = true;
    window.addEventListener('popstate', () => (leaving = false), { once: true });
    window.history.back(); // `popstate` re-renders the list
    return;
  }
  // Deep link: there is no list entry before this one. The list URL carries no route parameter but its module.
  window.history.replaceState(stateObject(), '', routeUrl({ module: readRoute().module, kind: 'list' }));
  notifyRoute();
}
