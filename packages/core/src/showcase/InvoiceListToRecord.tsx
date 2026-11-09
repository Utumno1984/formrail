// Story-only: List Report -> Object Page as a DEDICATED PAGE (#150). The list is the one of the List Report
// showcase (shared definition in `invoice-list-shared.ts`) reading its rows from the in-memory store of
// #149; the "Number" cell is a real link; opening it writes `record=<id>` in the URL and shows the
// detail INSTEAD of the list (the list is unmounted); Back brings the list back with pill, search, sort,
// scroll and focus restored.
//
// RECIPE (documented in `showcase-router.ts`, no new library API): the "router" is ~60 lines on `history` +
// `popstate`, shared with the CRUD showcase (#363). The list restores its scroll by itself
// (`useListReportScrollRestoration`); focus goes back to the opened row's link, or to the title.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ListReport } from '../list-report/ListReport';
import { useListReport } from '../list-report/use-list-report';
import { useListReportScrollRestoration } from '../list-report/use-list-report-scroll-restoration';
import { useListReportUrlState } from '../list-report/use-list-report-url-state';
import type { DemoInvoice } from '../internal/demo-invoices';
import { InvoiceRecordPage } from './InvoiceRecordPage';
import { COLUMNS, FILTERS, LABELS, PAGE, SORTABLE } from './invoice-list-shared';
import { createInvoiceApi } from './invoice-api';
import { createInvoiceStore, type InvoiceStore, type SaveOutcome, type StoredInvoice } from './invoice-store';
import { isLeaving, leaveRoute, openRecord, readRecord, recordHref, subscribeRoute } from './showcase-router';

export type NavigateEvent = { to: 'record'; id: string } | { to: 'list' };

export interface InvoiceListToRecordProps {
  /** How a list gesture (pill, search, sort) writes the URL. Navigation to a record is always a `push`. */
  history: 'replace' | 'push';
  listLoadDelayMs: number;
  recordLoadDelayMs: number;
  /** Called on the list <-> record navigations the user starts (link, "Back to list"), never on Back/Forward. */
  onNavigate: (event: NavigateEvent) => void;
  /** How long a save takes (#151). Default 400. A promise holds every save until it settles (for tests). */
  saveDelayMs?: number | Promise<void>;
  /** `error`: the save fails, the form stays dirty and the store is unchanged (#151). Default `success`. */
  saveOutcome?: SaveOutcome;
  /** Called once per successful save with the record as the server stored it, even if the page was left meanwhile. */
  onSaved?: (invoice: StoredInvoice) => void;
}

declare global {
  interface Window {
    /** The store of the mounted story, for e2e assertions. */
    __ropShowcaseStore?: InvoiceStore;
  }
}

/* ----------------------------------------------------------------------- list */

// A negative offset on the focus indicator: the cell wraps its content in a clipping box that starts at the
// link's edge, so an indicator drawn outside the link would be cut off; it is drawn inside instead (#152).
function RecordLink({ row, onOpen }: { row: DemoInvoice; onOpen: (id: string) => void }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd/Shift/Alt/middle click: the browser opens the real href (new tab/window), untouched.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(row.id);
  };
  return (
    <a href={recordHref(row.id)} data-record-id={row.id} onClick={click} style={{ color: 'inherit', outlineOffset: -2 }}>
      {row.number}
    </a>
  );
}

export interface ListViewProps {
  store: InvoiceStore;
  history: 'replace' | 'push';
  /** The list is back from a record: focus goes to the opened row's link (or the title) once the data is in. */
  returning: boolean;
  returnedFrom: string | null;
  onOpen: (id: string) => void;
  /** The List Report `actions` slot (the CRUD showcase's "New invoice"). */
  actions?: ReactNode;
  /**
   * A record just created (#363). Once the data is in, `onCreatedReady` is called ONCE for it with whether it
   * is among the rows the current filters show (the CRUD showcase raises its toast from there).
   */
  created?: { id: string } | null;
  onCreatedReady?: (visible: boolean) => void;
}

export function ListView({
  store,
  history,
  returning,
  returnedFrom,
  onOpen,
  actions,
  created,
  onCreatedReady,
}: ListViewProps) {
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

  const reported = useRef<string | null>(null);
  const readyCallback = useRef(onCreatedReady);
  useEffect(() => {
    readyCallback.current = onCreatedReady;
  });
  const createdId = created?.id ?? null;
  const visibleRows = table.rows;
  useEffect(() => {
    if (!createdId || status !== 'ready' || reported.current === createdId) return;
    reported.current = createdId;
    readyCallback.current?.(visibleRows.some((r) => r.id === createdId));
  }, [createdId, status, visibleRows]);

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
          actions={actions}
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

export function InvoiceListToRecord({
  history,
  listLoadDelayMs,
  recordLoadDelayMs,
  onNavigate,
  saveDelayMs = 400,
  saveOutcome = 'success',
  onSaved,
}: InvoiceListToRecordProps) {
  // One store per mount of the story: nothing shared between stories.
  const [store] = useState(() => createInvoiceStore());
  const delays = useRef({ listLoadDelayMs, recordLoadDelayMs });
  const callbacks = useRef(onNavigate);
  const savedCallback = useRef(onSaved);
  useEffect(() => {
    delays.current = { listLoadDelayMs, recordLoadDelayMs };
    callbacks.current = onNavigate;
    savedCallback.current = onSaved;
  });
  // Layout effect: applies before the page's passive effects, so a changed control reaches the next call.
  useLayoutEffect(() => {
    store.configure({ saveDelayMs, saveOutcome });
  }, [store, saveDelayMs, saveOutcome]);
  // The store has ONE read delay: the list and the record each set theirs just before their call
  // (the store reads its configuration when the call is made).
  // A save outlives the page that started it (leave with "Leave anyway" while it runs). Reads wait for the
  // saves in flight, so a list or a re-opened record never shows (and a later save never builds on) a value
  // older than the one the server is about to hold: no stale echo can overwrite a fresher save.
  const api = useMemo<InvoiceStore>(() => createInvoiceApi(store, delays), [store]);
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
  const saved = useRef((invoice: StoredInvoice) => savedCallback.current?.(invoice)).current;
  const back = useRef(() => {
    if (isLeaving()) return; // already on its way back: no second navigation, no second report
    callbacks.current({ to: 'list' });
    leaveRoute();
  }).current;

  if (record) return <InvoiceRecordPage store={api} recordId={record} onBack={back} onSaved={saved} />;
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
