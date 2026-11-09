// Story-only: the mini-router of the Invoices showcases (#150, shared since #363). No new library API: ~60
// lines on `history` + `popstate`.
//   - the routes are two query parameters, `record=<id>` (an existing invoice) and `create=1` (the creation
//     page); they are separate so that no record id can ever collide with a reserved word. With BOTH
//     present, `record` wins (documented, not an error). Every other parameter (the list's own, the page's)
//     is kept byte for byte by `updateSearch`;
//   - opening = `pushState` (so Back/Forward work) with a marker in `history.state`;
//   - leaving = `history.back()` when this entry was pushed by the list (exact restoration, and Forward
//     reopens the page), otherwise (deep link) a `replaceState` to the same URL without the parameter;
//   - the list restores its scroll by itself (`useListReportScrollRestoration`, keyed on the list's own
//     parameters: neither route parameter is one of them).
import { updateSearch } from '../list-report/use-list-report-url-state';

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

export const readRecord = (): string | null => new URLSearchParams(window.location.search).get('record') || null;
export const readCreate = (): boolean => new URLSearchParams(window.location.search).get('create') === '1';

const stateObject = (): Record<string, unknown> => {
  const s: unknown = window.history.state;
  return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
};

type RouteParam = 'record' | 'create';
const urlWith = (patch: Partial<Record<RouteParam, string | null>>): string =>
  `${window.location.pathname}${updateSearch(window.location.search, patch)}${window.location.hash}`;

/** The href of a record: the current list parameters plus `record=<id>`. */
export const recordHref = (id: string): string => urlWith({ record: id });

export function openRecord(id: string): void {
  if (readRecord() === id) return; // a double click leaves ONE history entry
  window.history.pushState({ ...stateObject(), [FROM_LIST]: true }, '', urlWith({ record: id }));
  notifyRoute();
}

export function openCreate(): void {
  if (readCreate()) return; // a double click leaves ONE history entry
  window.history.pushState({ ...stateObject(), [FROM_LIST]: true }, '', urlWith({ create: '1' }));
  notifyRoute();
}

// `history.back()` is asynchronous: until its `popstate` the page is still on screen and still carries the
// marker, so a second click would go back TWO entries (out of the app). One at a time.
let leaving = false;
export const isLeaving = (): boolean => leaving;

/** Leaves the record page or the creation page, whichever is the current route. */
export function leaveRoute(): void {
  if (stateObject()[FROM_LIST] === true) {
    if (leaving) return;
    leaving = true;
    window.addEventListener('popstate', () => (leaving = false), { once: true });
    window.history.back(); // `popstate` re-renders the list
    return;
  }
  // Deep link: there is no list entry before this one. Only the parameter that is on screen goes away.
  window.history.replaceState(stateObject(), '', urlWith(readRecord() ? { record: null } : { create: null }));
  notifyRoute();
}
