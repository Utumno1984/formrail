import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareKeys, createCollator, toSortKey } from './compare';
import { matchesSearch, parseSearchTerms } from './search';
import type {
  ListReportColumn,
  ListReportFilter,
  ListReportHeaderProps,
  ListReportSelection,
  ListReportSort,
  ListReportSortButtonProps,
  ListReportSortDirection,
  UseListReportOptions,
  UseListReportReturn,
} from './types';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

const NO_FILTERS: readonly never[] = [];
const DEFAULT_COMMIT_DELAY = 300;

const isSortable = <Row,>(column: ListReportColumn<Row>): boolean =>
  column.sortable !== false && (column.accessor !== undefined || column.compare !== undefined);

const opposite = (direction: ListReportSortDirection): ListReportSortDirection =>
  direction === 'asc' ? 'desc' : 'asc';

/** A comparable key for a sort (`''` = none). */
const sortToKey = (sort: ListReportSort | undefined): string => (sort ? `${sort.columnId}\u0000${sort.direction}` : '');

/** `value` is one we emitted: forget it and the older ones, true. Otherwise forget them all, false. */
const acknowledge = (emitted: string[], value: string): boolean => {
  const index = emitted.indexOf(value);
  if (index >= 0) emitted.splice(0, index + 1);
  else emitted.length = 0;
  return index >= 0;
};

/**
 * Headless List Report engine (columns + single-column sort). No DOM, no style.
 *
 * - Click cycle: `firstSortDirection` (default `'asc'`) -> the opposite -> no sort.
 * - Default comparator: numbers numerically, strings with `Intl.Collator` (numeric, case and
 *   diacritics insensitive), dates by time, booleans `false < true`, mixed types as `String(...)`.
 *   `null`, `undefined`, `''`, `NaN` and invalid dates always go last, in both directions. A
 *   custom `compare` replaces it and does not get that guarantee.
 *   The mixed-type fallback is not a total order (it is not transitive across types): do not rely
 *   on a specific order for columns that mix types.
 * - Memoize `columns` (e.g. `useMemo` or a module constant): a new array each render defeats the
 *   memoization of the handlers and the sorted rows.
 * - An uncontrolled `defaultSort`/`setSort` on a column that is not there yet stays pending until the
 *   column appears (it warns in development if `columns` is not empty); it resets to no sort only if
 *   a column that was active is removed. A `sortable: true` column with neither `accessor` nor
 *   `compare` is treated as not sortable.
 * - The sort is stable and never mutates `rows`.
 * - Pipeline: single-choice filter -> text search -> sort. `rows` is the result of all three.
 * - Filter: the active one is `filter` / the uncontrolled choice / `defaultFilter` / the first. An id
 *   that matches no filter applies no filter (all rows), is returned as `filter` and warns in
 *   development; `setFilter` with an unknown id is a no-op that warns in development.
 * - Search: `setSearchDraft` stores what the user typed; the rows follow the committed `searchQuery`,
 *   set by `commitSearch()` or `searchCommitDelay` ms after the last draft edit. The committed query is
 *   trimmed and split on whitespace; every term must be a case/diacritics-insensitive substring of a
 *   searchable column (or of `getSearchText`). A committed query changed from outside never overwrites
 *   a draft the user is editing, and drops its pending delayed commit (the draft is committed at the
 *   next edit or `commitSearch()`). So does a controlled `filter` or `sort` that changes from outside
 *   (not as the echo of a value the hook reported), e.g. Back in the browser moving only the pill.
 * - `onFilterChange`/`onSearchQueryChange` are called only for gestures, never for outside changes.
 * - Controlled `searchQuery`: the hook assumes the parent applies what `onSearchQueryChange` reports. A
 *   late echo of a reported value (e.g. a router that applies it asynchronously) never overwrites the
 *   draft; a parent that refuses a reported value should not rely on the same text being reported again,
 *   and an outside change equal to a reported, not yet applied value is treated as that echo.
 * - Memoize `getSearchText` (like `columns`): the search is recomputed whenever it changes.
 * - `onSortChange` is called only for a gesture (`toggleSort`/`setSort`), never when a controlled
 *   `sort` changes from outside.
 * - Selection (`selectable`): a set of ids on the data, controlled (`selectedIds`) or not
 *   (`defaultSelectedIds`), with the same contract: `onSelectedIdsChange` only for gestures, always a new
 *   `Set`, the received one never mutated. Sorting, filtering, searching and new data never change it; the
 *   derived counts follow the current results (see `ListReportSelection`). The gestures are no-ops while
 *   `selectable` is off.
 */
export function useListReport<Row>(options: UseListReportOptions<Row>): UseListReportReturn<Row> {
  const {
    rows, columns, getRowId, sort: controlledSort, defaultSort, onSortChange, locale,
    filters: filtersOption, filter: controlledFilter, defaultFilter, onFilterChange,
    searchQuery: controlledQuery, defaultSearchQuery, onSearchQueryChange,
    searchCommitDelay, getSearchText,
    selectable, selectedIds: controlledSelected, defaultSelectedIds, onSelectedIdsChange, getRowLabel: getRowLabelOption,
  } = options;
  const controlled = controlledSort !== undefined;

  const [internalSort, setInternalSort] = useState<ListReportSort>(defaultSort ?? null);
  // Id of the uncontrolled sort column once it has actually been present and sortable.
  const [seenColumnId, setSeenColumnId] = useState<string | null>(null);
  const requested = controlled ? controlledSort : internalSort;

  const activeColumn = useMemo(() => {
    if (!requested) return undefined;
    const column = columns.find((c) => c.id === requested.columnId);
    return column && isSortable(column) ? column : undefined;
  }, [columns, requested]);
  const sort: ListReportSort = requested && activeColumn ? requested : null;

  // Uncontrolled: a sort whose column has not appeared yet (e.g. columns loaded asynchronously) stays
  // pending. Once the column was active and then goes away (or stops being sortable) the state goes
  // back to "no sort" instead of resurrecting if the column comes back.
  if (!controlled && internalSort !== null) {
    if (activeColumn && seenColumnId !== internalSort.columnId) setSeenColumnId(internalSort.columnId);
    else if (!activeColumn && seenColumnId === internalSort.columnId) {
      setInternalSort(null);
      setSeenColumnId(null);
    }
  }

  // --- Filter (single choice) ---
  const filters: readonly ListReportFilter<Row>[] = filtersOption ?? NO_FILTERS;
  const filterControlled = controlledFilter !== undefined;
  const [internalFilter, setInternalFilter] = useState<string | undefined>(defaultFilter);
  const defaultFilterId = defaultFilter ?? filters[0]?.id ?? null;
  const requestedFilter = (filterControlled ? controlledFilter : internalFilter) ?? defaultFilterId;
  const activeFilter = useMemo(
    () => (requestedFilter === null ? undefined : filters.find((f) => f.id === requestedFilter)),
    [filters, requestedFilter],
  );
  const predicate = activeFilter?.predicate;

  const filteredRows = useMemo<readonly Row[]>(
    () => (predicate ? rows.filter((row) => predicate(row)) : rows),
    [rows, predicate],
  );

  // --- Search: a draft (what the user typed) and a committed query (what filters the rows) ---
  const searchControlled = controlledQuery !== undefined;
  const [internalQuery, setInternalQuery] = useState(defaultSearchQuery ?? '');
  const committed = (searchControlled ? controlledQuery : internalQuery) ?? '';
  const [draft, setDraft] = useState(committed);
  const [seenCommitted, setSeenCommitted] = useState(committed);
  // Controlled mode: queries this hook emitted that the parent has not applied yet, oldest first.
  const inflight = useRef<string[]>([]);
  // Set when the committed query changed from outside: the effect below drops a pending commit.
  const outsideChange = useRef(false);
  // The committed query changed. A value we emitted coming back (a late echo) never touches the draft:
  // the user may have kept typing, or cleared the field, in the meantime. An outside change makes the
  // draft follow it if the user was not editing (draft equal to the previous committed query); if they
  // typed something else, their text stays: no "going back". Its pending delayed commit is dropped,
  // though: the outside value (e.g. Back in the browser) wins until the user edits again or commits,
  // so the timer does not overwrite it behind the user's back.
  if (committed !== seenCommitted) {
    setSeenCommitted(committed);
    const echo = inflight.current.indexOf(committed);
    if (echo >= 0) inflight.current.splice(0, echo + 1);
    else {
      inflight.current = [];
      // Uncontrolled, only our own commits move the committed query (they are not tracked in `inflight`).
      if (searchControlled) outsideChange.current = true;
      if (draft === seenCommitted) setDraft(committed);
    }
  }

  // Controlled filter and sort: the values this hook emitted that the parent has not applied yet (oldest
  // first) and the last value seen. A change that is not one of them comes from outside (e.g. Back that
  // only moves the pill): like an outside change of the query, it drops the pending delayed commit, so
  // the timer does not write the search on top of the navigation. The draft itself is left alone.
  const emittedFilters = useRef<string[]>([]);
  const emittedSorts = useRef<string[]>([]);
  const filterKey = controlledFilter !== undefined ? controlledFilter : null;
  const sortKey = controlledSort !== undefined ? sortToKey(controlledSort) : null;
  const seenControlled = useRef({ filter: filterKey, sort: sortKey });
  if (filterKey !== seenControlled.current.filter) {
    // Going from uncontrolled to controlled (or back) is not a change of value.
    if (filterKey !== null && seenControlled.current.filter !== null && !acknowledge(emittedFilters.current, filterKey)) {
      outsideChange.current = true;
    }
    seenControlled.current.filter = filterKey;
  }
  if (sortKey !== seenControlled.current.sort) {
    if (sortKey !== null && seenControlled.current.sort !== null && !acknowledge(emittedSorts.current, sortKey)) {
      outsideChange.current = true;
    }
    seenControlled.current.sort = sortKey;
  }

  const terms = useMemo(() => parseSearchTerms(committed), [committed]);
  const searchedRows = useMemo<readonly Row[]>(
    () =>
      terms.length === 0 ? filteredRows : filteredRows.filter((row) => matchesSearch(row, terms, columns, getSearchText)),
    [filteredRows, terms, columns, getSearchText],
  );

  // Latest values for the handlers (assigned during render so they never see a stale value).
  const fs = useRef({
    rows, filterControlled, filters, filter: requestedFilter, defaultFilterId, onFilterChange,
    searchControlled, committed, draft, delay: searchCommitDelay, onSearchQueryChange,
  });
  fs.current = {
    rows, filterControlled, filters, filter: requestedFilter, defaultFilterId, onFilterChange,
    searchControlled, committed, draft, delay: searchCommitDelay, onSearchQueryChange,
  };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const commitQuery = useCallback((next: string) => {
    const current = fs.current;
    if (!current.searchControlled) {
      setInternalQuery(next);
      current.committed = next;
    } else inflight.current.push(next);
    current.onSearchQueryChange?.(next);
  }, []);

  /** The last query committed or emitted, whether or not the parent has applied it yet. */
  const lastCommitted = useCallback((): string => inflight.current.at(-1) ?? fs.current.committed, []);
  // The committed query moved under a draft that now equals it, or the query, the filter or the sort
  // changed from outside: nothing left to commit on a timer.
  useEffect(() => {
    if (outsideChange.current || fs.current.draft === lastCommitted()) clearTimer();
    outsideChange.current = false;
  }, [committed, draft, filterKey, sortKey, clearTimer, lastCommitted]);

  const commitSearch = useCallback(() => {
    clearTimer();
    const text = fs.current.draft;
    if (text !== lastCommitted()) commitQuery(text);
  }, [clearTimer, commitQuery, lastCommitted]);

  const setSearchDraft = useCallback(
    (next: string) => {
      clearTimer();
      setDraft(next);
      const current = fs.current;
      current.draft = next;
      if (current.delay !== null && next !== lastCommitted()) {
        timer.current = setTimeout(() => {
          timer.current = null;
          commitSearch();
        }, current.delay ?? DEFAULT_COMMIT_DELAY);
      }
    },
    [clearTimer, commitSearch, lastCommitted],
  );

  const changeFilter = useCallback((id: string) => {
    const current = fs.current;
    if (!current.filterControlled) {
      setInternalFilter(id);
      current.filter = id;
    } else emittedFilters.current.push(id);
    current.onFilterChange?.(id);
  }, []);

  const setFilter = useCallback(
    (id: string) => {
      const current = fs.current;
      if (id === current.filter) return;
      if (!current.filters.some((f) => f.id === id)) {
        if (isDev()) {
          console.warn(`[react-object-page] useListReport: setFilter("${id}") ignored, no such filter.`);
        }
        return;
      }
      changeFilter(id);
    },
    [changeFilter],
  );

  const clearFilters = useCallback(() => {
    clearTimer();
    const current = fs.current;
    // The search is cleared too, so only the pill decides what is left. When the default pill leaves
    // nothing to see (rows exist, none matches) go to the unfiltered pill instead: one decision, one
    // `onFilterChange`, taken from the current inputs and not from a later render.
    let target = current.defaultFilterId;
    const defaultFilter = current.filters.find((f) => f.id === target);
    if (defaultFilter?.predicate && current.rows.length > 0 && !current.rows.some((row) => defaultFilter.predicate?.(row))) {
      target = (current.filters.find((f) => f.predicate === undefined) ?? current.filters[0])?.id ?? target;
    }
    if (target !== null && target !== current.filter) changeFilter(target);
    setDraft('');
    current.draft = '';
    if (lastCommitted() !== '') commitQuery('');
  }, [clearTimer, changeFilter, commitQuery, lastCommitted]);

  const direction = sort?.direction;
  const hasActive = activeColumn !== undefined;
  const accessor = activeColumn?.accessor;
  const compare = activeColumn?.compare;
  const collator = useMemo(() => createCollator(locale), [locale]);

  const sortedRows = useMemo<readonly Row[]>(() => {
    if (!direction || !hasActive) return searchedRows;
    const sign = direction === 'asc' ? 1 : -1;
    if (compare) {
      return searchedRows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => compare(a.row, b.row) * sign || a.index - b.index)
        .map((entry) => entry.row);
    }
    const entries = searchedRows.map((row, index) => ({ row, index, key: toSortKey(accessor?.(row)) }));
    const filled = entries.filter((e) => !e.key.empty);
    const empty = entries.filter((e) => e.key.empty);
    filled.sort((a, b) => compareKeys(a.key, b.key, collator) * sign || a.index - b.index);
    return [...filled, ...empty].map((entry) => entry.row);
  }, [searchedRows, direction, hasActive, accessor, compare, collator]);

  // Latest values for the handlers, so their identity does not depend on inline callbacks.
  // Assigned during render (not in an effect) so handlers never see a stale value.
  const latest = useRef({ columns, sort, controlled, onSortChange });
  latest.current = { columns, sort, controlled, onSortChange };

  const setSort = useCallback((next: ListReportSort) => {
    if (!latest.current.controlled) {
      setInternalSort(next);
      // Make a second gesture in the same batch start from this one, before the next render.
      const column = next && latest.current.columns.find((c) => c.id === next.columnId);
      latest.current.sort = column && isSortable(column) ? next : null;
    } else emittedSorts.current.push(sortToKey(next));
    latest.current.onSortChange?.(next);
  }, []);

  const toggleSort = useCallback(
    (columnId: string) => {
      const { columns: cols, sort: current } = latest.current;
      const column = cols.find((c) => c.id === columnId);
      if (!column || !isSortable(column)) return;
      const first = column.firstSortDirection ?? 'asc';
      let next: ListReportSort;
      if (current?.columnId === columnId && current.direction !== first) next = null;
      else if (current?.columnId === columnId) next = { columnId, direction: opposite(first) };
      else next = { columnId, direction: first };
      setSort(next);
    },
    [setSort],
  );

  const sortColumnId = sort?.columnId;
  const getHeaderProps = useCallback(
    (columnId: string): ListReportHeaderProps => {
      if (sortColumnId !== columnId || !direction) return {};
      return { 'aria-sort': direction === 'asc' ? 'ascending' : 'descending' };
    },
    [sortColumnId, direction],
  );

  const getSortButtonProps = useCallback(
    (columnId: string): ListReportSortButtonProps => {
      const column = columns.find((c) => c.id === columnId);
      if (!column || !isSortable(column)) return {};
      return { type: 'button', onClick: () => toggleSort(columnId) };
    },
    [columns, toggleSort],
  );

  // Development warnings, once per distinct problem.
  const warned = useRef(new Set<string>());
  const invalidId = requested && !activeColumn ? requested.columnId : null;
  // Like columns: no filters yet (asynchronous loading) is expected, not a mistake.
  const unknownFilter = requestedFilter !== null && !activeFilter && filters.length > 0 ? requestedFilter : null;
  useEffect(() => {
    if (!isDev()) return;
    const warnOnce = (key: string, message: string) => {
      if (warned.current.has(key)) return;
      warned.current.add(key);
      console.warn(`[react-object-page] useListReport: ${message}`);
    };
    // No columns yet (asynchronous loading): a pending sort is expected, not a mistake.
    if (invalidId !== null && columns.length > 0) {
      warnOnce(
        `sort:${invalidId}`,
        `the sort points at "${invalidId}", which is missing or not sortable; rows keep the input order.`,
      );
    }
    if (unknownFilter !== null) {
      warnOnce(`filter:${unknownFilter}`, `the filter "${unknownFilter}" does not exist; no filter is applied.`);
    }
    const columnIds = new Set<string>();
    for (const column of columns) {
      if (column.sortable === true && !column.accessor && !column.compare) {
        warnOnce(
          `nosort:${column.id}`,
          `column "${column.id}" is \`sortable\` but has no \`accessor\` or \`compare\`; it is treated as not sortable.`,
        );
      }
      if (columnIds.has(column.id)) warnOnce(`column:${column.id}`, `duplicate column id "${column.id}".`);
      columnIds.add(column.id);
    }
    const rowIds = new Set<string>();
    for (const row of rows) {
      const id = getRowId(row);
      if (rowIds.has(id)) warnOnce(`row:${id}`, `\`getRowId\` returned the duplicate id "${id}".`);
      rowIds.add(id);
    }
  }, [invalidId, unknownFilter, columns, rows, getRowId]);

  const selection = useSelection({
    enabled: selectable === true,
    rows,
    resultRows: sortedRows,
    columns,
    getRowId,
    controlledSelected,
    defaultSelectedIds,
    onSelectedIdsChange,
    getRowLabel: getRowLabelOption,
  });

  return {
    rows: sortedRows,
    columns,
    getRowId,
    sort,
    toggleSort,
    setSort,
    getHeaderProps,
    getSortButtonProps,
    filters,
    filter: requestedFilter,
    setFilter,
    searchQuery: committed,
    searchDraft: draft,
    setSearchDraft,
    commitSearch,
    clearFilters,
    totalCount: rows.length,
    resultCount: searchedRows.length,
    selection,
  };
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const NO_IDS: readonly string[] = [];

interface SelectionInput<Row> {
  enabled: boolean;
  rows: readonly Row[];
  resultRows: readonly Row[];
  columns: readonly ListReportColumn<Row>[];
  getRowId: (row: Row) => string;
  controlledSelected: ReadonlySet<string> | undefined;
  defaultSelectedIds: ReadonlySet<string> | undefined;
  onSelectedIdsChange: ((ids: ReadonlySet<string>) => void) | undefined;
  getRowLabel: ((row: Row) => string) | undefined;
}

/** Number of ids of `a` that are in `b`, walking the smaller of the two. */
function countShared(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const id of small) if (large.has(id)) n++;
  return n;
}

/**
 * The selection: a set of ids on the data, never the DOM. The ids of the input and of the results are
 * computed once per change of the data/results (one `getRowId` per row); a change of the selection only
 * walks the selected ids (or the result ids, whichever is smaller), never calls `getRowId` and never does
 * work per rendered row. With `enabled: false` nothing is computed.
 */
function useSelection<Row>(input: SelectionInput<Row>): ListReportSelection<Row> {
  const { enabled, rows, resultRows, columns, getRowId, controlledSelected, defaultSelectedIds, onSelectedIdsChange } = input;
  const getRowLabelOption = input.getRowLabel;
  const controlled = controlledSelected !== undefined;
  const [internalSelected, setInternalSelected] = useState<ReadonlySet<string>>(defaultSelectedIds ?? EMPTY_IDS);
  const selectedIds = (controlled ? controlledSelected : internalSelected) ?? EMPTY_IDS;

  // Ids of the input rows and of the results (in the order of the results), per change of the data.
  const inputIds = useMemo<ReadonlySet<string>>(
    () => (enabled ? new Set(rows.map((row) => getRowId(row))) : EMPTY_IDS),
    [enabled, rows, getRowId],
  );
  const resultIds = useMemo<readonly string[]>(
    () => (enabled ? resultRows.map((row) => getRowId(row)) : NO_IDS),
    [enabled, resultRows, getRowId],
  );
  const resultIdSet = useMemo<ReadonlySet<string>>(() => (enabled ? new Set(resultIds) : EMPTY_IDS), [enabled, resultIds]);

  const counts = useMemo(() => {
    if (!enabled || selectedIds.size === 0) return { inResults: 0, hidden: 0 };
    const inResults = countShared(selectedIds, resultIdSet);
    return { inResults, hidden: countShared(selectedIds, inputIds) - inResults };
  }, [enabled, selectedIds, resultIdSet, inputIds]);

  const allResultsState: boolean | 'indeterminate' =
    resultIdSet.size === 0 || counts.inResults === 0 ? false : counts.inResults === resultIdSet.size ? true : 'indeterminate';

  // Latest values for the gestures (assigned during render; a gesture also updates `selectedIds` right
  // away when uncontrolled, so a second gesture in the same batch starts from the first).
  const latest = useRef({ enabled, controlled, selectedIds, resultIds, onSelectedIdsChange });
  latest.current = { enabled, controlled, selectedIds, resultIds, onSelectedIdsChange };

  const emit = useCallback((next: ReadonlySet<string>) => {
    const current = latest.current;
    if (!current.controlled) {
      setInternalSelected(next);
      current.selectedIds = next;
    }
    current.onSelectedIdsChange?.(next);
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const current = latest.current;
      if (!current.enabled) return;
      const next = new Set(current.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      emit(next);
    },
    [emit],
  );

  const setSelectedIds = useCallback(
    (ids: ReadonlySet<string>) => {
      if (!latest.current.enabled) return;
      // A copy: a later mutation of the caller's set must not change the state behind the hook's back.
      emit(new Set(ids));
    },
    [emit],
  );

  const toggleAllResults = useCallback(() => {
    const current = latest.current;
    if (!current.enabled || current.resultIds.length === 0) return;
    const allSelected = current.resultIds.every((id) => current.selectedIds.has(id));
    const next = new Set(current.selectedIds);
    if (allSelected) for (const id of current.resultIds) next.delete(id);
    else for (const id of current.resultIds) next.add(id);
    emit(next);
  }, [emit]);

  const clearSelection = useCallback(() => {
    const current = latest.current;
    if (!current.enabled || current.selectedIds.size === 0) return;
    emit(new Set<string>());
  }, [emit]);

  const isSelected = useCallback((id: string) => enabled && selectedIds.has(id), [enabled, selectedIds]);

  const getSelectedRows = useCallback(
    (): readonly Row[] => (enabled && selectedIds.size > 0 ? resultRows.filter((_, index) => selectedIds.has(resultIds[index] as string)) : []),
    [enabled, selectedIds, resultRows, resultIds],
  );

  const labelColumn = useMemo(() => columns.find((column) => column.accessor !== undefined), [columns]);
  const getRowLabel = useCallback(
    (row: Row): string => {
      if (getRowLabelOption) return getRowLabelOption(row);
      const value = labelColumn?.accessor?.(row);
      const text = value === null || value === undefined ? '' : String(value).trim();
      return text !== '' ? text : getRowId(row);
    },
    [getRowLabelOption, labelColumn, getRowId],
  );

  return useMemo(
    () => ({
      enabled,
      selectedIds,
      isSelected,
      toggle,
      setSelectedIds,
      toggleAllResults,
      clearSelection,
      allResultsState,
      selectedResultCount: counts.inResults,
      hiddenSelectedCount: counts.hidden,
      getSelectedRows,
      getRowLabel,
    }),
    [enabled, selectedIds, isSelected, toggle, setSelectedIds, toggleAllResults, clearSelection, allResultsState, counts, getSelectedRows, getRowLabel],
  );
}
