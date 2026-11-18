// Story-only (#519, from the list -> record showcase of #150): the list of a module, part of the record-editing
// shell. The module gives the columns, the pills and the texts (`RecordModule.list`); this file holds what every
// list does the same way: it reads its rows from the store, keeps its pill, search and sort in the URL, restores
// its scroll, turns one cell into a real link to the record page and, back from a page, gives the focus to the
// link of the record that was open (or to the title). Not exported by the package.
//
// RECIPE (documented in `showcase-router.ts`, no new library API): opening a link writes `record=<id>` in the URL
// and the shell shows the page INSTEAD of the list (the list is unmounted); Back brings the list back with pill,
// search, sort, scroll and focus restored. The list parameters and the saved scroll are the module's own
// (`listParamPrefix`): two modules in one iframe never share them.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ListReport } from '../list-report/ListReport';
import { EMPTY_IDS, useListReport } from '../list-report/use-list-report';
import { useListReportScrollRestoration } from '../list-report/use-list-report-scroll-restoration';
import { useListReportUrlState } from '../list-report/use-list-report-url-state';
import type { ListReportColumn, ListReportRowActions, ListReportSelection } from '../list-report/types';
import { LIST_PAGE } from './list-page';
import { capitalize, type RecordModule } from './record-module';
import type { RecordStore } from './record-store';
import { listParamPrefix, recordHref } from './showcase-router';

// A negative offset on the focus indicator: the cell wraps its content in a clipping box that starts at the
// link's edge, so an indicator drawn outside the link would be cut off; it is drawn inside instead (#152).
function RecordLink({ id, module, text, onOpen }: { id: string; module: string; text: string; onOpen: (id: string) => void }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd/Shift/Alt/middle click: the browser opens the real href (new tab/window), untouched.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(id);
  };
  return (
    <a href={recordHref(id, module)} data-record-id={id} onClick={click} style={{ color: 'inherit', outlineOffset: -2 }}>
      {text}
    </a>
  );
}

export interface RecordListViewProps<T extends { id: string }> {
  /** Only the parts of the module a list reads. */
  module: Pick<RecordModule<T, object, unknown>, 'name' | 'noun' | 'recordName' | 'list'>;
  store: Pick<RecordStore<T, unknown>, 'list'>;
  history: 'replace' | 'push';
  /** The list is back from a page: focus goes to the opened row's link (or the title) once the data is in. */
  returning: boolean;
  returnedFrom: string | null;
  onOpen: (id: string) => void;
  /** The List Report `actions` slot (the shell's "New …"). */
  actions?: ReactNode;
  /**
   * A record just created (#363). Once the data is in, `onCreatedReady` is called ONCE for it with whether it
   * is among the rows the current filters show (the shell raises its toast from there).
   */
  created?: { id: string } | null;
  onCreatedReady?: (visible: boolean) => void;
  /**
   * Ids left out of the rows given to `useListReport` (#365: the shell's deletes, in flight or done).
   * The rows stay DERIVED from the loaded data: an id that leaves the set brings its row back exactly where
   * the current filters, search and sort put it.
   */
  hiddenIds?: ReadonlySet<string>;
  /** The List Report `rowActions` (#365: the shell's "Delete"). */
  rowActions?: ListReportRowActions<T>;
  /**
   * Makes the list selectable (#366: the shell's bulk delete), the selection controlled by the caller so it
   * outlives the list (a page opened and closed meanwhile). Without it the list is not selectable.
   */
  selection?: { selectedIds: ReadonlySet<string>; onChange: (ids: ReadonlySet<string>) => void };
  /** The List Report `bulkActions` slot (with `selection`). */
  bulkActions?: (selection: ListReportSelection<T>) => ReactNode;
}

export function RecordListView<T extends { id: string }>({
  module,
  store,
  history,
  returning,
  returnedFrom,
  onOpen,
  actions,
  created,
  onCreatedReady,
  hiddenIds = EMPTY_IDS,
  rowActions,
  selection,
  bulkActions,
}: RecordListViewProps<T>) {
  const { name, list, recordName } = module;
  const [load, setLoad] = useState<{ rows: T[] } | { error: true } | null>(null);
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
  const rows = useMemo(() => {
    const loaded = load && 'rows' in load ? load.rows : [];
    return hiddenIds.size === 0 ? loaded : loaded.filter((r) => !hiddenIds.has(r.id));
  }, [load, hiddenIds]);

  // The module's own parameters and scroll: none shared with another module (see `listParamPrefix`).
  const prefix = listParamPrefix(name);
  const filters = list.filters;
  const sortable = useMemo(() => list.columns.map((c) => c.id), [list.columns]);
  const url = useListReportUrlState({ filters, sortableColumnIds: sortable, history, prefix });
  const scroll = useListReportScrollRestoration({ ready: status === 'ready', prefix });
  // The cell is re-created when the list parameters change, so every href keeps the current ones.
  const columns = useMemo(
    (): ListReportColumn<T>[] =>
      list.columns.map((c) =>
        c.id === list.linkColumn
          ? { ...c, cell: (r: T) => <RecordLink id={r.id} module={name} text={recordName(r)} onOpen={onOpen} /> }
          : c,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the URL values are the cache key of the hrefs
    [list, name, recordName, onOpen, url.filter, url.searchQuery, url.sort],
  );
  const table = useListReport<T>({
    rows,
    columns,
    getRowId: (r) => r.id,
    filters,
    // #523: the module's own search text (the customers' city), when it has one.
    ...(list.getSearchText ? { getSearchText: list.getSearchText } : {}),
    ...url,
    ...(selection
      ? { selectable: true, selectedIds: selection.selectedIds, onSelectedIdsChange: selection.onChange }
      : {}),
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
    <div style={LIST_PAGE}>
      <div ref={root} style={{ flex: 1, minHeight: 0 }}>
        <ListReport
          title={capitalize(module.noun.many)}
          actions={actions}
          table={table}
          status={status}
          filtersLabel="Filters"
          searchLabel="Search"
          labels={list.labels}
          scrollerRef={scroll.ref}
          rowActions={rowActions}
          bulkActions={bulkActions}
          onRetry={() => setAttempt((n) => n + 1)}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}
