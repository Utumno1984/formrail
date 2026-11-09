// Story-only: the mini-router of the Invoices showcases (#150, shared since #363). No new library API: ~80
// lines on `history` + `popstate`.
//   - the route is ONE tagged value, `Route` = list | record(id) | create. In the URL it is carried by the
//     `record=<id>` and `create=1` query parameters, but they are only ever READ through `parseRoute` (one
//     value: with both present `record` wins, documented) and only ever WRITTEN through `routeUrl`, which
//     sets exactly one of them and removes the other. So "both present" can be parsed but never produced,
//     and leaving a page clears both. A route added later (Delete, #365/#366) is one more member of the union;
//     every other parameter (the list's own, the page's) is kept byte for byte by `updateSearch`;
//   - opening = `pushState` (so Back/Forward work) with a marker in `history.state`;
//   - leaving = `history.back()` when this entry was pushed by the list (exact restoration, and Forward
//     reopens the page), otherwise (deep link) a `replaceState` to the list URL;
//   - the list restores its scroll by itself (`useListReportScrollRestoration`, keyed on the list's own
//     parameters: neither route parameter is one of them).
import { updateSearch } from '../list-report/use-list-report-url-state';

export type Route = { kind: 'list' } | { kind: 'record'; id: string } | { kind: 'create' };

/** One canonical string per route. */
export const routeKey = (route: Route): string => (route.kind === 'record' ? `record:${route.id}` : route.kind);

const LIST: Route = { kind: 'list' };

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const record = params.get('record');
  if (record) return { kind: 'record', id: record }; // `record` wins when both are present
  return params.get('create') === '1' ? { kind: 'create' } : LIST;
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
/** Primitive snapshots for `useSyncExternalStore`, both derived from the ONE parsed route (never both set). */
export const readRecord = (): string | null => {
  const route = readRoute();
  return route.kind === 'record' ? route.id : null;
};
export const readCreate = (): boolean => readRoute().kind === 'create';

const stateObject = (): Record<string, unknown> => {
  const s: unknown = window.history.state;
  return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
};

/** The current URL with the route parameters set for `route`: exactly one of them, or none for the list. */
const routeUrl = (route: Route): string =>
  `${window.location.pathname}${updateSearch(window.location.search, {
    record: route.kind === 'record' ? route.id : null,
    create: route.kind === 'create' ? '1' : null,
  })}${window.location.hash}`;

/** The href of a record: the current list parameters plus `record=<id>`. */
export const recordHref = (id: string): string => routeUrl({ kind: 'record', id });

function open(route: Route): void {
  if (routeKey(readRoute()) === routeKey(route)) return; // a double click leaves ONE history entry
  window.history.pushState({ ...stateObject(), [FROM_LIST]: true }, '', routeUrl(route));
  notifyRoute();
}

export const openRecord = (id: string): void => open({ kind: 'record', id });
export const openCreate = (): void => open({ kind: 'create' });

// `history.back()` is asynchronous: until its `popstate` the page is still on screen and still carries the
// marker, so a second click would go back TWO entries (out of the app). One at a time.
let leaving = false;
export const isLeaving = (): boolean => leaving;

/** Leaves the current page for the list, whichever page it is. */
export function leaveRoute(): void {
  if (stateObject()[FROM_LIST] === true) {
    if (leaving) return;
    leaving = true;
    window.addEventListener('popstate', () => (leaving = false), { once: true });
    window.history.back(); // `popstate` re-renders the list
    return;
  }
  // Deep link: there is no list entry before this one. The list URL carries NO route parameter at all.
  window.history.replaceState(stateObject(), '', routeUrl(LIST));
  notifyRoute();
}
