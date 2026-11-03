// Story-only: List Report -> Object Page as a DEDICATED PAGE (#150). The list is the one of the List Report
// showcase (shared definition in `invoice-list-shared.ts`) reading its rows from the in-memory store of
// #149; the "Number" cell is a real link; opening it writes `record=<id>` in the URL and shows the
// detail INSTEAD of the list (the list is unmounted); Back brings the list back with pill, search, sort,
// scroll and focus restored.
//
// RECIPE (documented here, no new library API): the "router" below is ~40 lines on `history` + `popstate`.
//   - the route is the `record` query parameter; every other parameter (the list's own, the page's) is kept
//     byte for byte by `updateSearch`;
//   - opening = `pushState` (so Back/Forward work) with a marker in `history.state`;
//   - "Back to list" = `history.back()` when this entry was pushed by the list (exact restoration, and
//     Forward reopens the record), otherwise (deep link) a `replaceState` to the same URL without `record`;
//   - the list restores its scroll by itself (`useListReportScrollRestoration`, keyed on the list's own
//     parameters: `record` is not one of them); focus goes back to the opened row's link, or to the title.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { ListReport } from '../list-report/ListReport';
import { useListReport } from '../list-report/use-list-report';
import { useListReportScrollRestoration } from '../list-report/use-list-report-scroll-restoration';
import { updateSearch, useListReportUrlState } from '../list-report/use-list-report-url-state';
import type { DemoInvoice } from '../internal/demo-invoices';
import { InvoiceRecordPage } from './InvoiceRecordPage';
import { COLUMNS, FILTERS, LABELS, PAGE, SORTABLE } from './invoice-list-shared';
import { createInvoiceStore, type InvoiceStore } from './invoice-store';

export type NavigateEvent = { to: 'record'; id: string } | { to: 'list' };

export interface InvoiceListToRecordProps {
  /** How a list gesture (pill, search, sort) writes the URL. Navigation to a record is always a `push`. */
  history: 'replace' | 'push';
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
  /** Called on the list <-> record navigations the user starts (link, "Back to list"), never on Back/Forward. */
  onNavigate: (event: NavigateEvent) => void;
}

declare global {
  interface Window {
    /** The store of the mounted story, for e2e assertions. */
    __ropShowcaseStore?: InvoiceStore;
  }
}

/* ---------------------------------------------------------------- mini router */

const FROM_LIST = 'ropFromList';
let routeListeners: (() => void)[] = [];
const notifyRoute = () => routeListeners.forEach((l) => l());
const subscribeRoute = (listener: () => void) => {
  routeListeners = [...routeListeners, listener];
  window.addEventListener('popstate', listener);
  return () => {
    routeListeners = routeListeners.filter((l) => l !== listener);
    window.removeEventListener('popstate', listener);
  };
};
const readRecord = (): string | null => new URLSearchParams(window.location.search).get('record') || null;
const stateObject = (): Record<string, unknown> => {
  const s: unknown = window.history.state;
  return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
};
const urlWith = (record: string | null): string =>
  `${window.location.pathname}${updateSearch(window.location.search, { record })}${window.location.hash}`;

function openRecord(id: string): void {
  if (readRecord() === id) return; // a double click leaves ONE history entry
  window.history.pushState({ ...stateObject(), [FROM_LIST]: true }, '', urlWith(id));
  notifyRoute();
}

function leaveRecord(): void {
  if (stateObject()[FROM_LIST] === true) {
    window.history.back(); // `popstate` re-renders the list
    return;
  }
  // Deep link: there is no list entry before this one.
  window.history.replaceState(stateObject(), '', urlWith(null));
  notifyRoute();
}

/** The href of a record: the current list parameters plus `record=<id>`. */
const recordHref = (id: string): string => urlWith(id);

/* ----------------------------------------------------------------------- list */

function RecordLink({ row, onOpen }: { row: DemoInvoice; onOpen: (id: string) => void }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd/Shift/Alt/middle click: the browser opens the real href (new tab/window), untouched.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(row.id);
  };
  return (
    <a href={recordHref(row.id)} data-record-id={row.id} onClick={click} style={{ color: 'inherit' }}>
      {row.number}
    </a>
  );
}

interface ListViewProps {
  store: InvoiceStore;
  history: 'replace' | 'push';
  /** The list is back from a record: focus goes to the opened row's link (or the title) once the data is in. */
  returning: boolean;
  returnedFrom: string | null;
  onOpen: (id: string) => void;
}

function ListView({ store, history, returning, returnedFrom, onOpen }: ListViewProps) {
  const [load, setLoad] = useState<{ rows: DemoInvoice[] } | { error: true } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Tracks the last request: a response for a superseded one is dropped.
    let current = true;
    setLoad(null);
    store.list().then(
      (rows) => current && setLoad({ rows }),
      () => current && setLoad({ error: true }),
    );
    return () => {
      current = false;
    };
  }, [store, attempt]);

  const status = load === null ? 'loading' : 'error' in load ? 'error' : 'ready';
  const rows = useMemo(() => (load && 'rows' in load ? load.rows : []), [load]);

  const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE, history });
  const scroll = useListReportScrollRestoration({ ready: status === 'ready' });
  // The cell is re-created when the list parameters change, so every href keeps the current ones.
  const columns = useMemo(
    () =>
      COLUMNS.map((c) =>
        c.id === 'number' ? { ...c, cell: (r: DemoInvoice) => <RecordLink row={r} onOpen={onOpen} /> } : c,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the URL values are the cache key of the hrefs
    [onOpen, url.filter, url.searchQuery, url.sort],
  );
  const table = useListReport<DemoInvoice>({
    rows,
    columns,
    getRowId: (r) => r.id,
    filters: FILTERS,
    ...url,
  });

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!returning || status !== 'ready') return;
    // After the scroll restoration (layout effect) and the rows' first paint.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return; // the user already moved the focus: leave it
        const container = root.current;
        if (!container) return;
        const link = returnedFrom
          ? container.querySelector<HTMLElement>(`a[data-record-id="${CSS.escape(returnedFrom)}"]`)
          : null;
        const tableEl = container.querySelector('table');
        const scroller = tableEl?.parentElement;
        if (link && scroller) {
          const box = link.getBoundingClientRect();
          const area = scroller.getBoundingClientRect();
          // The header cells stick to the top of the container (the <thead> itself scrolls away).
          const headBottom = Math.max(area.top, tableEl?.querySelector('th')?.getBoundingClientRect().bottom ?? 0);
          if (box.top >= headBottom - 1 && box.bottom <= area.bottom + 1) {
            link.focus({ preventScroll: true });
            return;
          }
        }
        const title = container.querySelector<HTMLElement>('h2');
        if (title) {
          title.tabIndex = -1;
          title.focus({ preventScroll: true });
        }
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [returning, returnedFrom, status]);

  return (
    <div style={PAGE}>
      <div ref={root} style={{ flex: 1, minHeight: 0 }}>
        <ListReport
          title="Invoices"
          table={table}
          status={status}
          filtersLabel="Filters"
          searchLabel="Search"
          labels={LABELS}
          scrollerRef={scroll.ref}
          onRetry={() => setAttempt((n) => n + 1)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- demo */

export function InvoiceListToRecord({ history, listLoadDelayMs, recordLoadDelayMs, onNavigate }: InvoiceListToRecordProps) {
  // One store per mount of the story: nothing shared between stories.
  const [store] = useState(() => createInvoiceStore());
  const delays = useRef({ listLoadDelayMs, recordLoadDelayMs });
  const callbacks = useRef(onNavigate);
  useEffect(() => {
    delays.current = { listLoadDelayMs, recordLoadDelayMs };
    callbacks.current = onNavigate;
  });
  // The store has ONE read delay: the list and the record each set theirs just before their call
  // (the store reads its configuration when the call is made).
  const api = useMemo<InvoiceStore>(
    () => ({
      ...store,
      list: () => {
        store.configure({ loadDelayMs: delays.current.listLoadDelayMs });
        return store.list();
      },
      get: (id) => {
        store.configure({ loadDelayMs: delays.current.recordLoadDelayMs });
        return store.get(id);
      },
    }),
    [store],
  );
  useEffect(() => {
    window.__ropShowcaseStore = store;
    return () => {
      if (window.__ropShowcaseStore === store) delete window.__ropShowcaseStore;
    };
  }, [store]);

  const record = useSyncExternalStore(subscribeRoute, readRecord, () => null);
  // Written in an effect (after the record page committed), read at the list's mount: a list that
  // appears after a record page is a return.
  const cameFromRecord = useRef(false);
  const lastRecord = useRef<string | null>(null);
  useEffect(() => {
    if (record) {
      cameFromRecord.current = true;
      lastRecord.current = record;
    }
  }, [record]);

  const open = useRef((id: string) => {
    callbacks.current({ to: 'record', id });
    openRecord(id);
  }).current;
  const back = useRef(() => {
    callbacks.current({ to: 'list' });
    leaveRecord();
  }).current;

  if (record) return <InvoiceRecordPage store={api} recordId={record} onBack={back} />;
  return (
    <ListView
      store={api}
      history={history}
      returning={cameFromRecord.current}
      returnedFrom={lastRecord.current}
      onOpen={open}
    />
  );
}
