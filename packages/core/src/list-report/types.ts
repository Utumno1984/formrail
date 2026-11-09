import type { ReactNode, RefObject } from 'react';

export type ListReportSortDirection = 'asc' | 'desc';

/** Single-column sort state. `null` = no sort (the input order). */
export type ListReportSort = { columnId: string; direction: ListReportSortDirection } | null;

export interface ListReportColumn<Row> {
  /** Unique, stable id of the column. */
  id: string;
  header: ReactNode;
  /**
   * Value used for sorting (and, in the future, filtering and searching). Without `cell` it is also
   * the text of the cell: the rules on `cell` about memoized rows apply to it in that role.
   */
  accessor?: (row: Row) => unknown;
  /**
   * Cell content for the table that consumes the hook; the hook itself never calls it.
   *
   * Table rows are memoized, so a render of the parent alone does not call `cell`. It runs for a row
   * only when that row renders: when the row object or the `columns` array is a different one, when
   * the row becomes selected or deselected, or when its id, its selection label or the function
   * `labels.selectRow` changes.
   *
   * - **Compute the content from `row` and from values `columns` was built with.** With the same
   *   `columns` array, a value read in any other way (a ref, a module variable such as the current
   *   language, a store snapshot, `Date.now()`, the selection of other rows) stays on screen as it was
   *   when the row last rendered, even if the parent renders with a new value. To refresh every row,
   *   make that value a dependency of the `useMemo` that builds `columns`. To refresh only a part of
   *   the cell, return a component that subscribes to the value itself (context, store hook): it
   *   updates on its own, without a render of the row.
   * - **Replace a changed row, never mutate it.** `row.status = 'paid'` followed by a render of the
   *   parent shows the old status, because the object is the same: pass a new object in `rows`
   *   (`rows.map((r) => (r.id === id ? { ...r, status: 'paid' } : r))`).
   */
  cell?: (row: Row) => ReactNode;
  /** Sortable only with an `accessor` or a `compare`; `false` opts out. */
  sortable?: boolean;
  /**
   * Replaces the default comparator. The hook applies the direction (it negates the result for
   * `desc`) and keeps the sort stable. Empty values go last only with the default comparator: a
   * custom `compare` receives every row and decides on its own.
   */
  compare?: (a: Row, b: Row) => number;
  /**
   * Included in the text search when `accessor` returns a string or a number (default: yes);
   * `false` opts out. Numbers are searched as `String(value)`: no localized formatting.
   */
  searchable?: boolean;
  /** Direction of the first click on this column. Default: `'asc'`. The cycle is first -> opposite -> none. */
  firstSortDirection?: ListReportSortDirection;
  // Layout fields: only declared here, consumed by the table component.
  align?: 'start' | 'center' | 'end';
  /** Column width: a number (px) or a CSS length/percentage. Columns without one share the remaining space equally. */
  width?: number | string;
  /**
   * Counted in the minimum width of the whole table (default 120px) so that a narrow container
   * scrolls instead of squeezing the columns. It does not reserve space for this column alone:
   * columns without a `width` share what is left equally.
   */
  minWidth?: number | string;
  /**
   * Truncate text cells with an ellipsis (default `true`). With `false` the text wraps and the row
   * grows beyond `--rop-list-report-row-height`.
   */
  truncate?: boolean;
}

/** One single-choice filter pill. Without `predicate` it keeps every row (e.g. "All"). */
export interface ListReportFilter<Row> {
  id: string;
  label: string;
  predicate?: (row: Row) => boolean;
}

export interface UseListReportOptions<Row> {
  rows: readonly Row[];
  columns: readonly ListReportColumn<Row>[];
  /** Unique, stable id of a row (a duplicate is reported with a development warning). */
  getRowId: (row: Row) => string;
  /** Controlled sort (`null` = none). `undefined` leaves the hook uncontrolled. */
  sort?: ListReportSort;
  defaultSort?: ListReportSort;
  /** Called only for a gesture (`toggleSort`, `setSort`), never when `sort` changes from outside. */
  onSortChange?: (sort: ListReportSort) => void;
  /** Locale of the default string comparator (`Intl.Collator`). Default: the runtime locale. */
  locale?: string | string[];
  /** Single-choice filters. The active one defaults to `defaultFilter`, else the first. */
  filters?: readonly ListReportFilter<Row>[];
  /** Controlled filter id. `undefined` leaves the hook uncontrolled. */
  filter?: string;
  defaultFilter?: string;
  /** Called only for a gesture (`setFilter`, `clearFilters`), never when `filter` changes from outside. */
  onFilterChange?: (filter: string) => void;
  /** Controlled committed search query. `undefined` leaves the hook uncontrolled. */
  searchQuery?: string;
  defaultSearchQuery?: string;
  /** Called only when the query is committed by the hook (`commitSearch`, the delay, `clearFilters`). */
  onSearchQueryChange?: (query: string) => void;
  /**
   * Milliseconds after the last `setSearchDraft` before the draft is committed. Default 300;
   * `null` = only `commitSearch()` commits. A change applies from the next draft edit.
   */
  searchCommitDelay?: number | null;
  /** Replaces the per-column search text of a row (`searchable` and `accessor` are then ignored). */
  getSearchText?: (row: Row) => string;
  /**
   * Multiple selection on the data (ids, never the DOM). Default `false`: `selection.enabled` is
   * `false`, no selection is computed and `ListReportTable`/`ListReport` render exactly as without it.
   */
  selectable?: boolean;
  /**
   * Controlled selected ids. `undefined` leaves the hook uncontrolled. The hook never mutates it: pass
   * a new `Set` for every change (e.g. the one `onSelectedIdsChange` gave you).
   */
  selectedIds?: ReadonlySet<string>;
  defaultSelectedIds?: ReadonlySet<string>;
  /**
   * Called only for a gesture (`toggle`, `toggleAllResults`, `clearSelection`, `setSelectedIds`), never
   * when `selectedIds` changes from outside. Always receives a new `Set`.
   */
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  /**
   * Name of a row, used for the accessible names of its controls: its checkbox with `selectable`
   * ("Select INV-0001") and the trigger of its actions menu with `rowActions` ("Actions for
   * INV-0001"). Resolved with or without `selectable`. Default: the text of the first column with an
   * `accessor` (`String(accessor(row))`), else `getRowId(row)`. Memoize it like `columns`.
   */
  getRowLabel?: (row: Row) => string;
}

/** What `ListReportRowAction.onSelect` receives. */
export interface ListReportRowActionContext {
  /**
   * The element that should get the focus back when an overlay opened by the action closes: the
   * trigger of the row's actions menu. Pass it as the `returnFocusRef` of a `Dialog`, a
   * `ConfirmDialog` or `useConfirmDialog`'s `confirm()`.
   */
  returnFocusRef: RefObject<HTMLElement | null>;
}

/** One action of a row, an item of its actions menu (`rowActions` of `ListReportTable`/`ListReport`). */
export interface ListReportRowAction {
  /** Unique within the row and stable (the React key of the item). A duplicate is reported with a development error. */
  id: string;
  /** Text of the menu item. Name the action ("Delete…"), it is the item's accessible name. */
  label: string;
  /** Decorative icon shown before the label (an `<svg>`, sized by the item). */
  icon?: ReactNode;
  /**
   * Called once per click, Enter or Space on the enabled item, before the menu closes. Never called
   * while `disabled`.
   */
  onSelect: (context: ListReportRowActionContext) => void;
  /** Shown but not selectable, by pointer or keyboard (the arrow keys skip it); `aria-disabled` on the item. */
  disabled?: boolean;
  /** `danger`: a destructive action (the item's danger tone). Default `'default'`. */
  tone?: 'default' | 'danger';
}

/**
 * The actions of each row, for the actions column of `ListReportTable`/`ListReport`. An empty array
 * leaves the row's cell empty (the column stays). Called while a row renders, and rows are memoized:
 * the same rules as `ListReportColumn.cell` apply — compute the actions from `row` and from values
 * the function was built with, and memoize the function (`useCallback`) with those values as
 * dependencies: a new function re-renders every row (correct, only slower), a stable one reading
 * other values leaves the rows on screen as they were.
 */
export type ListReportRowActions<Row> = (row: Row) => readonly ListReportRowAction[];

/**
 * Selection state and gestures (`UseListReportReturn.selection`). The effective selection is
 * "selected ∩ current results": ids hidden by the filter or the search stay selected (going back to
 * the pill shows them again), but they are not counted in `allResultsState`/`selectedResultCount` and
 * never returned by `getSelectedRows()`, so a bulk action only acts on rows the user can see. Ids no
 * longer in the data are ignored by every count and kept in `selectedIds` (pruning them would be a
 * change that is not a gesture): a consumer that deletes rows updates the selection itself.
 */
export interface ListReportSelection<Row> {
  /** The `selectable` option. */
  enabled: boolean;
  /** The selected ids as they are (including hidden or missing ones). */
  selectedIds: ReadonlySet<string>;
  /** O(1). */
  isSelected: (id: string) => boolean;
  /** Gesture: adds or removes one id. */
  toggle: (id: string) => void;
  /** Gesture: replaces the whole selection (a primitive for extensions, e.g. range selection). */
  setSelectedIds: (ids: ReadonlySet<string>) => void;
  /**
   * Gesture: when every current result is selected, removes the results (ids hidden by the filters
   * stay selected); otherwise adds every current result. No-op with no results.
   */
  toggleAllResults: () => void;
  /** Gesture: empties the selection, hidden ids included. No-op when already empty. */
  clearSelection: () => void;
  /** State of the "select all results" checkbox, over the current results only (`false` with none). */
  allResultsState: boolean | 'indeterminate';
  /** Selected ids among the current results (filter + search). */
  selectedResultCount: number;
  /** Selected ids present in the data but hidden by the filter or the search. */
  hiddenSelectedCount: number;
  /** The selected rows among the current results, in the order of `rows`. */
  getSelectedRows: () => readonly Row[];
  /** The `getRowLabel` option, resolved (with its default), also when `enabled` is `false`. */
  getRowLabel: (row: Row) => string;
}

export interface ListReportHeaderProps {
  'aria-sort'?: 'ascending' | 'descending';
}

export interface ListReportSortButtonProps {
  type?: 'button';
  onClick?: () => void;
}

export interface UseListReportReturn<Row> {
  /** The sorted rows (the input array itself when no sort is active; the input is never mutated). */
  rows: readonly Row[];
  columns: readonly ListReportColumn<Row>[];
  /** The `getRowId` option, handed back so a table can key its rows. */
  getRowId: (row: Row) => string;
  /** The effective sort: `null` when the requested column is missing or not sortable. */
  sort: ListReportSort;
  /** Next step of the cycle for a column; no-op for an unknown or non-sortable column. */
  toggleSort: (columnId: string) => void;
  setSort: (sort: ListReportSort) => void;
  /** `aria-sort` only on the sorted column. Spread it on the `<th>`. */
  getHeaderProps: (columnId: string) => ListReportHeaderProps;
  /** `type` and `onClick` for the button inside the header; `{}` for a non-sortable column. */
  getSortButtonProps: (columnId: string) => ListReportSortButtonProps;
  filters: readonly ListReportFilter<Row>[];
  /** Id of the active filter (`null` when there are no filters). Unknown ids apply no filter. */
  filter: string | null;
  /** No-op for the active filter or an unknown id. */
  setFilter: (filter: string) => void;
  /** The committed query, the one the rows are filtered with. */
  searchQuery: string;
  /** What the user typed; it never goes back on its own while it differs from the committed query. */
  searchDraft: string;
  setSearchDraft: (draft: string) => void;
  /** Commits the draft now and cancels the pending timer. No-op when equal to the committed query. */
  commitSearch: () => void;
  /**
   * Back to the default filter and an empty search, notifying only the values that actually
   * change. When the default filter would leave nothing to see (rows exist, none matches its
   * predicate), goes to the unfiltered pill instead — one decision, taken from the current
   * `rows`/`filters`, never from a later render.
   */
  clearFilters: () => void;
  /** Rows in input. */
  totalCount: number;
  /** Rows after filter and search (the length of `rows`). */
  resultCount: number;
  /** Multiple selection (always present; `enabled` is `false` without `selectable`). */
  selection: ListReportSelection<Row>;
}
