import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ListReportSort, ListReportSortDirection } from './types';

export interface UseListReportUrlStateOptions {
  /** The pills of the report (only their `id` is used): an id in the URL that is not here is ignored. */
  filters: readonly { id: string }[];
  /**
   * Ids of the sortable columns: a `sort` in the URL on another column is ignored. Without it any
   * column id is accepted (and `useListReport` warns in development if the column does not exist).
   */
  sortableColumnIds?: readonly string[];
  /** Default pill: written as "no parameter". Without it, the first of `filters` (as in `useListReport`). */
  defaultFilter?: string;
  /** Default committed search. Default `''`. */
  defaultSearchQuery?: string;
  /** Default sort. Default `null` (none). */
  defaultSort?: ListReportSort;
  /** Names of the parameters. Default `filter`, `q`, `sort`. */
  params?: { filter?: string; search?: string; sort?: string };
  /** Namespace of the parameters, for two reports in the same page: `'inv'` gives `inv.filter`, `inv.q`, `inv.sort`. */
  prefix?: string;
  /** How a gesture writes the URL. `'replace'` (default) leaves the history alone; `'push'` adds one entry per gesture. */
  history?: 'replace' | 'push';
  /**
   * Where the query string lives, instead of `window.location`/`history` (see `ListReportUrlAdapter`):
   * a client-side router. Without it the hook uses the browser APIs.
   */
  adapter?: ListReportUrlAdapter;
}

/**
 * The query string of a router (or of any store), as three functions. The core depends on no router:
 * wrap yours in this shape (recipes for React Router and TanStack Router in the List Report docs).
 */
export interface ListReportUrlAdapter {
  /** The current query string. Must return `URLSearchParams` (a string is rejected at compile time). */
  read(): URLSearchParams;
  /** Replaces the query string (`next` holds every parameter, the ones of the page included). Throwing propagates to the caller. */
  write(next: URLSearchParams, mode: 'replace' | 'push'): void;
  /** Calls `listener` whenever the query string may have changed (also, synchronously, after `write`). Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The controlled values and callbacks to hand to `useListReport` (spread them in its options). */
export interface UseListReportUrlStateReturn {
  /** The pill from the URL, or the default. `undefined` only with no `filters` and no `defaultFilter`. */
  filter: string | undefined;
  onFilterChange: (filter: string) => void;
  /** The committed search from the URL, or the default. Never the text being typed. */
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  /** The sort from the URL, or the default. Same identity while it does not change. */
  sort: ListReportSort;
  onSortChange: (sort: ListReportSort) => void;
}

type HistoryMode = 'replace' | 'push';

/**
 * Where the state lives. Internal for now: the browser URL below. A router adapter (separate ticket)
 * will make it injectable with the same shape.
 */
interface UrlSource {
  /** The current query string (`?a=1&b=2`, or `''`). */
  read: () => string;
  /** Replaces the query string, keeping path, hash and `history.state`. */
  write: (search: string, mode: HistoryMode) => void;
  /** Called on Back/Forward and after every `write` of any instance in the page. */
  subscribe: (listener: () => void) => () => void;
}

// Writes with `replaceState`/`pushState` do not fire `popstate`: the instances of the page tell each
// other through this list. An array literal (not a `Set`) so the module stays free of side effects.
let inPageListeners: (() => void)[] = [];

const browserSource: UrlSource = {
  read: () => window.location.search,
  write: (search, mode) => {
    const { pathname, hash } = window.location;
    const url = `${pathname}${search}${hash}`;
    // `history.state` is kept: routers and tools (Storybook among them) keep their own data there.
    if (mode === 'push') window.history.pushState(window.history.state, '', url);
    else window.history.replaceState(window.history.state, '', url);
    for (const listener of inPageListeners) listener();
  },
  subscribe: (listener) => {
    inPageListeners = [...inPageListeners, listener];
    window.addEventListener('popstate', listener);
    return () => {
      inPageListeners = inPageListeners.filter((l) => l !== listener);
      window.removeEventListener('popstate', listener);
    };
  },
};

/** The string-based source the hook works on, over an adapter. */
const fromAdapter = (adapter: ListReportUrlAdapter): UrlSource => ({
  read: () => {
    const query = adapter.read().toString();
    return query === '' ? '' : `?${query}`;
  },
  write: (search, mode) => adapter.write(new URLSearchParams(search), mode),
  subscribe: (listener) => adapter.subscribe(listener),
});

const DIRECTIONS: readonly string[] = ['asc', 'desc'];

/** `amount.desc` -> `{ columnId: 'amount', direction: 'desc' }`; split on the last `.` (ids may contain dots). */
export function parseSortParam(value: string): ListReportSort | undefined {
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const direction = value.slice(dot + 1);
  if (!DIRECTIONS.includes(direction)) return undefined;
  return { columnId: value.slice(0, dot), direction: direction as ListReportSortDirection };
}

export const formatSortParam = (sort: NonNullable<ListReportSort>): string => `${sort.columnId}.${sort.direction}`;

const decodeKey = (part: string): string | undefined => {
  const eq = part.indexOf('=');
  try {
    return decodeURIComponent((eq < 0 ? part : part.slice(0, eq)).replace(/\+/g, ' '));
  } catch {
    return undefined; // malformed escape: not one of ours, kept as is
  }
};

/**
 * Sets (`string`) or removes (`null`) parameters in a query string. Every other parameter is kept
 * byte for byte and in place; a parameter that is set takes the place of its first occurrence (its
 * repetitions are dropped), or goes at the end. Returns `''` or a string starting with `?`.
 */
export function updateSearch(search: string, updates: Readonly<Record<string, string | null>>): string {
  const parts = search.replace(/^\?/, '').split('&').filter((p) => p !== '');
  const done = new Set<string>();
  const out: string[] = [];
  const encode = (key: string, value: string) => new URLSearchParams([[key, value]]).toString();
  for (const part of parts) {
    const key = decodeKey(part);
    if (key === undefined || !Object.hasOwn(updates, key)) {
      out.push(part);
      continue;
    }
    const value = updates[key];
    if (value !== null && value !== undefined && !done.has(key)) out.push(encode(key, value));
    done.add(key);
  }
  for (const key of Object.keys(updates)) {
    const value = updates[key];
    if (!done.has(key) && value !== null && value !== undefined) out.push(encode(key, value));
  }
  return out.length > 0 ? `?${out.join('&')}` : '';
}

const sameSort = (a: ListReportSort, b: ListReportSort): boolean =>
  a === b || (a !== null && b !== null && a.columnId === b.columnId && a.direction === b.direction);

const EMPTY_SNAPSHOT = '[[],[],[]]';
const getServerSnapshot = (): string => EMPTY_SNAPSHOT;

/**
 * Keeps the active pill, the committed search and the sort of a List Report in the URL, with the
 * browser APIs only (`URLSearchParams`, `history.replaceState`/`pushState`, `popstate`; no router).
 * Spread the result in the options of `useListReport`:
 *
 * ```tsx
 * const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: ['amount', 'date'] });
 * const table = useListReport({ rows, columns, getRowId, filters: FILTERS, ...url });
 * ```
 *
 * - Format: `filter=<id>`, `q=<committed search>`, `sort=<columnId>.<asc|desc>` (split on the last
 *   `.`), each under `<prefix>.` when `prefix` is given and renamable with `params`. The text being
 *   typed and the scroll position never go in the URL. A later second group of pills will use a new
 *   key (e.g. `filter.<group>=<id>`); `filter=<id>` will keep meaning the current group.
 * - A value equal to its default is not written (the parameter is removed); a missing parameter is
 *   the default. A present but empty `q=`/`sort=` means "no search"/"no sort", which is the default
 *   unless `defaultSearchQuery`/`defaultSort` say otherwise (that is how a non-empty default is cleared).
 * - Invalid values (unknown pill, column not in `sortableColumnIds`, unknown direction, empty
 *   `filter=`) read as the default, with no warning and **no rewrite** of the URL: only a gesture writes.
 *   With a repeated parameter the first valid value wins; the gesture that rewrites it drops the copies.
 * - A gesture writes only its own parameter: other parameters (of the page, of another prefix), the
 *   hash and `history.state` are untouched, and so is an own parameter that is invalid *for now* (e.g. a
 *   pill id of filters that are still loading: it applies when `filters` contains it, with no callback).
 * - Back/Forward (`popstate`) updates the values with no callback of `useListReport` (not a gesture) and
 *   no write. A search typed and not committed stays in the field; when the navigation moves this
 *   report's pill, search or sort, `useListReport` also drops its pending commit, so the entry the user
 *   went back to is not rewritten behind them. A navigation that moves none of them (only other
 *   parameters, another prefix, the hash) leaves the pending commit alone: the user's typing goes on.
 * - Next to a router: without `adapter` the hook writes with the History API directly and keeps
 *   `history.state`, but the router is not told (it may not re-render, and a router that rewrites the URL
 *   from its own state can drop these parameters). With a router, pass an `adapter`.
 * - `adapter` (`ListReportUrlAdapter`: `read`/`write`/`subscribe`) moves the state to a client-side router:
 *   the hook then never touches `window.location`, `history` or `popstate`. A notification of `subscribe`
 *   (the echo of its own write, sync or async, or a router navigation) updates the values with no callback
 *   and no write. A query the router re-orders or re-encodes is read as is and not rewritten. If `write`
 *   throws the error propagates and nothing is kept. Changing the adapter re-reads the state.
 * - Server rendering returns the defaults (no `window` access); the client reads the URL right after
 *   hydration, with no mismatch. In the browser the URL is read at the first render (no flash of defaults).
 * - Memoization: `filters` and `sortableColumnIds` may be new arrays every render (only their ids count).
 */
export function useListReportUrlState(options: UseListReportUrlStateOptions): UseListReportUrlStateReturn {
  const {
    filters,
    sortableColumnIds,
    defaultFilter,
    defaultSearchQuery = '',
    defaultSort = null,
    params,
    prefix,
    history = 'replace',
    adapter,
  } = options;
  // Keyed on the adapter's identity: a new object (a different router, or an inline literal) re-subscribes
  // and re-reads, with no write and no callback. Memoize the adapter to avoid the re-subscription.
  const source = useMemo(() => (adapter ? fromAdapter(adapter) : browserSource), [adapter]);
  const scope = prefix ? `${prefix}.` : '';
  const filterKey = scope + (params?.filter ?? 'filter');
  const searchKey = scope + (params?.search ?? 'q');
  const sortKey = scope + (params?.sort ?? 'sort');

  // The snapshot is only this instance's raw values: a write of another instance (or of the page) to
  // other parameters gives the same string and no render.
  const getSnapshot = useCallback(() => {
    const query = new URLSearchParams(source.read());
    return JSON.stringify([query.getAll(filterKey), query.getAll(searchKey), query.getAll(sortKey)]);
  }, [source, filterKey, searchKey, sortKey]);
  const snapshot = useSyncExternalStore(source.subscribe, getSnapshot, getServerSnapshot);
  const [rawFilters, rawSearch, rawSort] = JSON.parse(snapshot) as [string[], string[], string[]];

  const filterIds = filters.map((f) => f.id);
  const defaultFilterId = defaultFilter ?? filterIds[0];
  const filter = rawFilters.find((id) => filterIds.includes(id)) ?? defaultFilterId;

  const searchQuery = rawSearch.length > 0 ? rawSearch[0]! : defaultSearchQuery;

  let parsedSort: ListReportSort | undefined;
  for (const value of rawSort) {
    if (value === '') parsedSort = null;
    else {
      const candidate = parseSortParam(value);
      if (candidate && (!sortableColumnIds || sortableColumnIds.includes(candidate.columnId))) parsedSort = candidate;
    }
    if (parsedSort !== undefined) break;
  }
  const effectiveSort = parsedSort === undefined ? defaultSort : parsedSort;
  const sortColumn = effectiveSort?.columnId;
  const sortDirection = effectiveSort?.direction;
  const sort = useMemo<ListReportSort>(
    () => (sortColumn !== undefined && sortDirection !== undefined ? { columnId: sortColumn, direction: sortDirection } : null),
    [sortColumn, sortDirection],
  );

  // Latest inputs for the callbacks, so their identity never changes.
  const latest = useRef({ filterKey, searchKey, sortKey, defaultFilterId, defaultSearchQuery, defaultSort, history });
  latest.current = { filterKey, searchKey, sortKey, defaultFilterId, defaultSearchQuery, defaultSort, history };

  const write = useCallback(
    (key: string, value: string | null) => {
      const current = source.read();
      const next = updateSearch(current, { [key]: value });
      // Nothing changes: no write, and above all no history entry.
      if (next === current || (next === '' && current === '?')) return;
      source.write(next, latest.current.history);
    },
    [source],
  );

  const onFilterChange = useCallback(
    (id: string) => {
      const { filterKey: key, defaultFilterId: fallback } = latest.current;
      write(key, id === fallback ? null : id);
    },
    [write],
  );

  const onSearchQueryChange = useCallback(
    (query: string) => {
      const { searchKey: key, defaultSearchQuery: fallback } = latest.current;
      write(key, query === fallback ? null : query);
    },
    [write],
  );

  const onSortChange = useCallback(
    (next: ListReportSort) => {
      const { sortKey: key, defaultSort: fallback } = latest.current;
      write(key, sameSort(next, fallback) ? null : next === null ? '' : formatSortParam(next));
    },
    [write],
  );

  return { filter, onFilterChange, searchQuery, onSearchQueryChange, sort, onSortChange };
}
