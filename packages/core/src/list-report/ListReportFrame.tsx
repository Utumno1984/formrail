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
import type { ListReportTableLabels } from './ListReportTableStates';
import type { ListReportTableStatus } from './ListReportTableShell';
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
  selectionClearClass,
  tableClass,
  titleClass,
} from './list-report-styles';
import type { ListReportRowActions, ListReportSelection, UseListReportReturn } from './types';
import { useChangeFlash } from './use-change-flash';

/** Texts of `ListReportFrame`: those of the table plus the count in the header (the count default is English). */
export interface ListReportFrameLabels extends ListReportTableLabels {
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

/** @internal The props `ListReportFrame` computed for its table, handed to `renderTable`. */
export interface ListReportFrameTableProps<Row> {
  ref: Ref<HTMLDivElement> | undefined;
  id: string | undefined;
  table: UseListReportReturn<Row>;
  'aria-labelledby': string;
  className: string;
  status: ListReportTableStatus | undefined;
  errorMessage: ReactNode;
  onRetry: (() => void) | undefined;
  onClearFilters: () => void;
  loadingRowCount: number | undefined;
  labels: Partial<ListReportFrameLabels> | undefined;
  rowActions: ListReportRowActions<Row> | undefined;
  rowActionsInline: number | undefined;
}

/** @internal Props of {@link ListReportFrame}. */
export type ListReportFrameProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> & {
  /** Heading of the report. Its text (and only its text) is the accessible name of the table. */
  title: ReactNode;
  /** Heading level of the title. Default 2 (the page's own `h1` sits above the report). */
  titleLevel?: TitleLevel;
  /** What `useListReport` returned. */
  table: UseListReportReturn<Row>;
  /** Buttons next to the title (below it on a narrow screen). */
  actions?: ReactNode;
  /** Passed to `renderTable` as is. */
  status?: ListReportTableStatus;
  /** Passed to `renderTable` as is. */
  errorMessage?: ReactNode;
  /** Passed to `renderTable` as is. */
  onRetry?: () => void;
  /**
   * The "clear filters" button of the "no results" state. Default: `table.clearFilters()` and the
   * focus on the search box (or, without one, on the first pill). Passing it replaces that default.
   */
  onClearFilters?: () => void;
  /** Passed to `renderTable` as is. */
  loadingRowCount?: number;
  /** Texts of the table (passed as is) and of the count. */
  labels?: Partial<ListReportFrameLabels>;
  /** Accessible name of the group of pills (see `ListReportFilterBar`). */
  filtersLabel?: string;
  /** Accessible name of the search box (see `ListReportFilterBar`). */
  searchLabel?: string;
  /** Renders the search box. Default `true`. Without it and without `filters` there is no bar at all. */
  showSearch?: boolean;
  /**
   * Ref of the element that scrolls: the table's container (`overflow: auto`), the one the rendered
   * table forwards its `ref` to. Give it `useListReportScrollRestoration().ref`. Never reaches the DOM
   * as an attribute.
   */
  scrollerRef?: Ref<HTMLDivElement>;
  /**
   * Bulk actions of the selection bar (with `useListReport({ selectable: true })`): rendered at 0 selected
   * too, so they decide themselves whether to be disabled (`selection.selectedResultCount === 0`). Act on
   * `selection.getSelectedRows()`: only the selected rows the user can see. Never reaches the DOM.
   */
  bulkActions?: (selection: ListReportSelection<Row>) => ReactNode;
  /**
   * Actions of each row, in a menu in a trailing sticky column of the table (see `ListReportTable`'s
   * `rowActions`). Passed to `renderTable` as is; never reaches the DOM.
   */
  rowActions?: ListReportRowActions<Row>;
  /**
   * How many actions with an `icon` are inline buttons when the table's container is at least 40rem
   * wide (see `ListReportTable`'s `rowActionsInline`). Default 0. Passed to `renderTable` as is; never
   * reaches the DOM.
   */
  rowActionsInline?: number;
  /** Renders the table from the props the floorplan computed for it (ref, id, status, labels, …). */
  renderTable: (tableProps: ListReportFrameTableProps<Row>) => ReactNode;
};

function ListReportFrameImpl<Row>(props: ListReportFrameProps<Row>, ref: Ref<HTMLDivElement>) {
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
    rowActions,
    rowActionsInline,
    renderTable,
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
          <TruncatedText className={selectionCountClass} data-rop-selection-count="">
            {(labels?.selectionCount ?? DEFAULT_SELECTION_COUNT)(selection.selectedResultCount, selection.hiddenSelectedCount)}
          </TruncatedText>
          {bulkActions ? <div className={selectionActionsClass}>{bulkActions(selection)}</div> : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className={selectionClearClass}
            // Hidden, not removed: it keeps its box (the bar never changes height) and leaves the tab order.
            style={selectedAny ? undefined : { visibility: 'hidden' }}
          >
            {labels?.clearSelection ?? 'Clear selection'}
          </Button>
        </div>
      ) : null}
      {renderTable({
        ref: scrollerRef,
        id: selection.enabled ? tableId : undefined,
        table,
        'aria-labelledby': nameId,
        className: tableClass,
        status,
        errorMessage,
        onRetry,
        onClearFilters: onClearFilters ?? clearFilters,
        loadingRowCount,
        labels,
        rowActions,
        rowActionsInline,
      })}
    </div>
  );
}

/**
 * @internal The List Report floorplan without a fixed table: title with the result count, an actions
 * slot, the bar of pills and search and the selection bar, ending with whatever `renderTable` returns
 * for the table props the floorplan computed (ref, id, `aria-labelledby`, status, labels, …).
 * `ListReport` is `ListReportFrame` with `renderTable` = `ListReportTable`; a virtualized floorplan
 * (`@formrail/pro`) renders a different table from the same props. Exported from
 * `@formrail/core/internal`; not public API, no semver guarantee.
 */
export const ListReportFrame = /* @__PURE__ */ forwardRef(ListReportFrameImpl) as <Row>(
  props: ListReportFrameProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
