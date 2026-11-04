import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { Button } from '../button/Button';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { Title, type TitleLevel } from '../typography/Title';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { ListReportFilterBar } from './ListReportFilterBar';
import { ListReportTable, type ListReportTableStatus } from './ListReportTable';
import type { ListReportTableLabels } from './ListReportTableStates';
import {
  actionsClass,
  countClass,
  countFlashClass,
  countHiddenClass,
  filterBarClass,
  headerClass,
  rootClass,
  selectionActionsClass,
  selectionBarClass,
  selectionCountClass,
  selectionStatusClass,
  tableClass,
  titleClass,
} from './list-report-styles';
import type { ListReportSelection, UseListReportReturn } from './types';
import { useChangeFlash } from './use-change-flash';

/** Texts of `ListReport`: those of `ListReportTable` plus the count in the header (the count default is English). */
export interface ListReportLabels extends ListReportTableLabels {
  /** The count next to the title. Default: `(n)`, and `(n of m)` when a pill or the search hide some of the rows. */
  count: (resultCount: number, totalCount: number) => string;
  /**
   * Text of the selection bar (with `selectable`): the selected rows among the results and the selected
   * ones hidden by the filters. Default: "No items selected", "3 selected", "1 selected (2 hidden by filters)".
   */
  selectionCount: (selectedCount: number, hiddenCount: number) => string;
  /** Button of the selection bar that empties the selection (hidden ids included). Default "Clear selection". */
  clearSelection: string;
  /** Name of the selection bar, followed by the title ("Selection Invoices"). Default "Selection". */
  selectionBar: string;
}

const DEFAULT_COUNT = (resultCount: number, totalCount: number): string =>
  resultCount === totalCount ? `(${resultCount})` : `(${resultCount} of ${totalCount})`;

const DEFAULT_SELECTION_COUNT = (selectedCount: number, hiddenCount: number): string =>
  hiddenCount > 0
    ? `${selectedCount} selected (${hiddenCount} hidden by filters)`
    : selectedCount === 0
      ? 'No items selected'
      : `${selectedCount} selected`;

export type ListReportProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  /** Heading of the report. Its text (and only its text) is the accessible name of the table. */
  title: ReactNode;
  /** Heading level of the title. Default 2 (the page's own `h1` sits above the report). */
  titleLevel?: TitleLevel;
  /** What `useListReport` returned. */
  table: UseListReportReturn<Row>;
  /** Buttons next to the title (below it on a narrow screen). */
  actions?: ReactNode;
  /** Passed to `ListReportTable` as is. */
  status?: ListReportTableStatus;
  /** Passed to `ListReportTable` as is. */
  errorMessage?: ReactNode;
  /** Passed to `ListReportTable` as is. */
  onRetry?: () => void;
  /**
   * The "clear filters" button of the "no results" state. Default: `table.clearFilters()` and the
   * focus on the search box (or, without one, on the first pill). Passing it replaces that default.
   */
  onClearFilters?: () => void;
  /** Passed to `ListReportTable` as is. */
  loadingRowCount?: number;
  /** Texts of the table (passed as is) and of the count. */
  labels?: Partial<ListReportLabels>;
  /** Accessible name of the group of pills (see `ListReportFilterBar`). */
  filtersLabel?: string;
  /** Accessible name of the search box (see `ListReportFilterBar`). */
  searchLabel?: string;
  /** Renders the search box. Default `true`. Without it and without `filters` there is no bar at all. */
  showSearch?: boolean;
  /**
   * Ref of the element that scrolls: the table's container (`overflow: auto`), the one `ListReportTable`
   * forwards its `ref` to. Give it `useListReportScrollRestoration().ref`. Never reaches the DOM as an attribute.
   */
  scrollerRef?: Ref<HTMLDivElement>;
  /**
   * Bulk actions of the selection bar (with `useListReport({ selectable: true })`): rendered at 0 selected
   * too, so they decide themselves whether to be disabled (`selection.selectedResultCount === 0`). Act on
   * `selection.getSelectedRows()`: only the selected rows the user can see. Never reaches the DOM.
   */
  bulkActions?: (selection: ListReportSelection<Row>) => ReactNode;
};

function ListReportImpl<Row>(props: ListReportProps<Row>, ref: Ref<HTMLDivElement>) {
  const {
    title,
    titleLevel = 2,
    table,
    actions,
    status,
    errorMessage,
    onRetry,
    onClearFilters,
    loadingRowCount,
    labels,
    filtersLabel,
    searchLabel,
    showSearch = true,
    scrollerRef,
    bulkActions,
    className,
    ...rest
  } = props;
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const barRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, rootRef), [ref]);
  const { selection } = table;
  const count = labels?.count ?? DEFAULT_COUNT;
  // The pill eases to a stronger tone when the numbers change (not at mount); the text itself just changes.
  const countChanged = useChangeFlash(`${table.resultCount}/${table.totalCount}`);

  const showBar = showSearch || table.filters.length > 0;
  // The count is hidden (not removed) while there is nothing true to say: no rows yet, or an error.
  const countShown = status !== 'error' && !(status === 'loading' && table.totalCount === 0);

  // The button that was clicked leaves with the state: the focus goes to the search box (the first pill
  // when there is none), where the user goes on filtering, never to the body.
  const clearFilters = () => {
    table.clearFilters();
    // Only the bar is searched (an `actions` slot may hold its own inputs).
    const bar = barRef.current;
    const target = bar?.querySelector<HTMLElement>('input[type="search"]') ?? bar?.querySelector<HTMLElement>('[role="radio"]');
    target?.focus();
  };

  // "Clear selection" hides itself: the focus goes to the "select all results" checkbox of the table
  // (or, when it is disabled because there are no results, to the table container), never to the body.
  const tableId = `${baseId}-table`;
  const selectedAny = selection.selectedResultCount + selection.hiddenSelectedCount > 0;
  const clearSelection = () => {
    selection.clearSelection();
    const root = rootRef.current;
    const header = root?.querySelector<HTMLInputElement>('th[data-rop-select] input');
    const target = header && !header.disabled ? header : root?.querySelector<HTMLElement>(`[id="${tableId}"]`);
    target?.focus();
  };

  return (
    <div {...rest} ref={mergedRef} className={cn(rootClass, className)}>
      <div className={headerClass}>
        <Title level={titleLevel} className={titleClass}>
          <span id={nameId}>{title}</span>{' '}
          <span
            data-rop-count=""
            data-changed={countChanged ? '' : undefined}
            className={cn(countClass, countChanged && countFlashClass, !countShown && countHiddenClass)}
          >
            {count(table.resultCount, table.totalCount)}
          </span>
        </Title>
        {actions ? <div className={actionsClass}>{actions}</div> : null}
      </div>
      {showBar ? (
        <ListReportFilterBar
          ref={barRef}
          table={table}
          filtersLabel={filtersLabel}
          searchLabel={searchLabel}
          showSearch={showSearch}
          className={filterBarClass}
        />
      ) : null}
      {selection.enabled ? (
        <div
          role="group"
          aria-labelledby={`${baseId}-selection ${nameId}`}
          aria-controls={tableId}
          data-rop-selection-bar=""
          className={selectionBarClass}
        >
          <span id={`${baseId}-selection`} hidden>
            {labels?.selectionBar ?? 'Selection'}
          </span>
          <div className={selectionStatusClass}>
            <TruncatedText className={selectionCountClass} data-rop-selection-count="">
              {(labels?.selectionCount ?? DEFAULT_SELECTION_COUNT)(selection.selectedResultCount, selection.hiddenSelectedCount)}
            </TruncatedText>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              className="shrink-0"
              // Hidden, not removed: it keeps its box (the bar never changes height) and leaves the tab order.
              style={selectedAny ? undefined : { visibility: 'hidden' }}
            >
              {labels?.clearSelection ?? 'Clear selection'}
            </Button>
          </div>
          {bulkActions ? <div className={selectionActionsClass}>{bulkActions(selection)}</div> : null}
        </div>
      ) : null}
      <ListReportTable
        ref={scrollerRef}
        id={selection.enabled ? tableId : undefined}
        table={table}
        aria-labelledby={nameId}
        className={tableClass}
        status={status}
        errorMessage={errorMessage}
        onRetry={onRetry}
        onClearFilters={onClearFilters ?? clearFilters}
        loadingRowCount={loadingRowCount}
        labels={labels}
      />
    </div>
  );
}

/**
 * The List Report floorplan (simple version): title with the result count, an actions slot, the bar of
 * pills and search and the table in one flex column that fills its parent, with a **single scroller**
 * (the table's container: title, actions and the bar stay put, the table header sticks to its top).
 *
 * - Give it a parent with a height (`height`, or a flex/grid cell with `min-height: 0`) and only the
 *   table scrolls. In the normal flow of the document (no height) it does not collapse: the table grows
 *   with its rows and the page scrolls. Either way there is one scroller.
 * - The table is named by the title text (`aria-labelledby`, no duplicated text; a title with an icon
 *   still names it by its text). The count `(n)` / `(n of m)` is part of the heading and **not** a live
 *   region. The only live region is the table's: it announces its changes of state (loading, empty, no
 *   results, error, data back), not a change of the number of results while the data stays on screen.
 * - "Clear filters" works without wiring (`table.clearFilters()`; when the default pill itself leaves no
 *   result the hook goes to the unfiltered pill), then the focus goes to the search box or the first pill of the bar.
 * - The count is part of the heading's name ("Fatture (12 of 40)"); the table's name stays "Fatture".
 * - `status`, `errorMessage`, `onRetry`, `loadingRowCount` and `labels` reach `ListReportTable` unchanged;
 *   `filtersLabel`, `searchLabel` and `showSearch` reach `ListReportFilterBar`. The other props go on the root.
 *
 * - Selection (`useListReport({ selectable: true })`): a bar between the filters and the table, always
 *   mounted (its height is the same at 0 and at n selected, so the table never moves), with the count
 *   ("3 selected (2 hidden by filters)"), "Clear selection" (shown only with a selection; then the focus
 *   goes to the "select all results" checkbox) and the `bulkActions` slot. The bar is a named group, not a
 *   live region: like the count in the title, numbers are not announced; the checkbox that was toggled
 *   already says its new state.
 *
 * The parts stay exported (`ListReportFilterBar`, `ListReportTable`) for other layouts.
 */
export const ListReport = /* @__PURE__ */ forwardRef(ListReportImpl) as <Row>(
  props: ListReportProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
