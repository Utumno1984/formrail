import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { Button } from '../button/Button';
import { isLaidOut } from '../internal/focus';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { Title, type TitleLevel } from '../typography/Title';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { useResizeAndMutationEffect } from '../utils/use-resize-and-mutation-effect';
import { ListReportFilterBar } from './ListReportFilterBar';
import type { ListReportTableLabels } from './ListReportTableStates';
import type { ListReportTableStatus } from './ListReportTableShell';
import {
  actionsClass,
  countClass,
  countWrapClass,
  countFlashClass,
  countHiddenClass,
  filterBarClass,
  headerClass,
  rootClass,
  selectionActionsClass,
  selectionActionsWideOnlyClass,
  selectionBarClass,
  selectionCountClass,
  selectionClearClass,
  tableClass,
  titleClass,
} from './list-report-styles';
import type { ListReportRowActions, ListReportSelection, UseListReportReturn } from './types';
import { useChangeFlash } from './use-change-flash';
import { getNumberFormat } from './number-format';

/** Texts of `ListReportFrame`: those of the table plus the count in the header (the count default is English). */
export interface ListReportFrameLabels extends ListReportTableLabels {
  /**
   * The count next to the title. Default: `(n)`, and `(n of m)` when a pill or the search hide some of the rows,
   * the numbers formatted in the `locale` of `useListReport` (`Intl.NumberFormat`; with SSR pass `locale`).
   * A custom function receives the raw numbers and formats them itself.
   */
  count: (resultCount: number, totalCount: number) => string;
  /**
   * Text of the selection bar (with `selectable`): the selected rows among the results and the selected
   * ones hidden by the filters. Default: "No items selected", "3 selected", "1,234 selected (2 hidden by filters)",
   * the numbers formatted in the `locale` of `useListReport`. A custom function receives the raw numbers and formats them itself.
   */
  selectionCount: (selectedCount: number, hiddenCount: number) => string;
  /** Button of the selection bar that empties the selection (hidden ids included). Default `Clear selection`. */
  clearSelection: string;
  /** Name of the selection bar, followed by the title ("Selection Invoices"). Default `Selection`. */
  selectionBar: string;
}

const defaultCount =
  (fmt: (n: number) => string) =>
  (resultCount: number, totalCount: number): string =>
    resultCount === totalCount ? `(${fmt(resultCount)})` : `(${fmt(resultCount)} of ${fmt(totalCount)})`;

const defaultSelectionCount =
  (fmt: (n: number) => string) =>
  (selectedCount: number, hiddenCount: number): string =>
    hiddenCount > 0
      ? `${fmt(selectedCount)} selected (${fmt(hiddenCount)} hidden by filters)`
      : selectedCount === 0
        ? 'No items selected'
        : `${fmt(selectedCount)} selected`;

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
  /**
   * Heading level of the title.
   * @default 2
   */
  titleLevel?: TitleLevel;
  /** What `useListReport` returned. */
  table: UseListReportReturn<Row>;
  /** Buttons next to the title (below it on a narrow screen). */
  actions?: ReactNode;
  /**
   * Passed to `renderTable` as is.
   * @default 'ready'
   */
  status?: ListReportTableStatus;
  /** Passed to `renderTable` as is. */
  errorMessage?: ReactNode;
  /** Passed to `renderTable` as is. */
  onRetry?: () => void;
  /**
   * The "clear filters" button of the "no results" state. Without it, it clears the
   * filters and puts the focus on the search box (or, without one, on the first pill). Passing it replaces that default.
   * @default `table.clearFilters()` and focus on the search box
   */
  onClearFilters?: () => void;
  /**
   * Passed to `renderTable` as is.
   * @default 5
   */
  loadingRowCount?: number;
  /** Texts of the table (passed as is) and of the count. */
  labels?: Partial<ListReportFrameLabels>;
  /**
   * Accessible name of the group of pills (see `ListReportFilterBar`).
   * @default 'Filters'
   */
  filtersLabel?: string;
  /**
   * Accessible name of the search box (see `ListReportFilterBar`).
   * @default 'Search'
   */
  searchLabel?: string;
  /**
   * Renders the search box. Without it and without `filters` there is no bar at all.
   * @default true
   */
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
   *
   * The presence of the prop decides the layout of the bar below 640px, not what it returns: without it the
   * count and "Clear selection" share one line (the count yields down to a minimum width of 8ch, then the bar wraps
   * to two lines; from 640px there is no minimum); with it, even a function that returns `null`, the count has its own line and the actions
   * and "Clear selection" are below it.
   */
  bulkActions?: (selection: ListReportSelection<Row>) => ReactNode;
  /**
   * Actions of each row, in a menu in a trailing sticky column of the table (see `ListReportTable`'s
   * `rowActions`). Passed to `renderTable` as is; never reaches the DOM.
   */
  rowActions?: ListReportRowActions<Row>;
  /**
   * How many actions with an `icon` are inline buttons when the table's container is at least 40rem
   * wide (see `ListReportTable`'s `rowActionsInline`). Passed to `renderTable` as is; never
   * reaches the DOM.
   * @default 0
   */
  rowActionsInline?: number;
  /** Renders the table from the props the floorplan computed for it (ref, id, status, labels, …). */
  renderTable: (tableProps: ListReportFrameTableProps<Row>) => ReactNode;
};

/**
 * @internal Props of {@link ListReportFrame} that only `@formrail/pro` passes (`VirtualListReport`, which always
 * hands the frame a `bulkActions` of its own: "Select all N results" followed by the consumer's actions). Not
 * part of `ListReportFrameProps`, so they are neither in the props of `ListReport` nor in those of
 * `VirtualListReport`; destructured like every prop, they never reach the DOM. `ListReport` never sets them:
 * without them the frame is exactly the one of before.
 */
export interface ListReportFrameInternalProps {
  /**
   * The bulk actions exist from 640px only. Below 640px their slot is under `display: none`, decided by the CSS
   * at the bar's own breakpoint (no measure, no `matchMedia`, the same markup on the server): out of the layout,
   * of the accessibility tree and of the tab order. The bar then takes the one-line layout of a bar without
   * `bulkActions` (`data-rop-bulk-actions="false"`). From 640px nothing changes (the bar is one line either way).
   * `VirtualListReport` sets it when the consumer passes no `bulkActions`: its "Select all N results" is then
   * the only action, and below 640px the header checkbox does the same (it selects every result too).
   */
  bulkActionsWideOnly?: boolean;
  /**
   * A control of the bulk actions that has the focus and stops being laid out (its slot hidden below 640px,
   * a viewport resized or a tablet rotated across it) or is removed (the consumer's `bulkActions` dropped):
   * the focus goes to the header checkbox (to the table container when it is disabled), as after "Clear
   * selection", never to `body`. A focus the user moved elsewhere in the meantime is left where it is.
   * The only JS of the rule, and only while one of those controls has the focus: an observer on the slot.
   */
  keepBulkActionsFocus?: boolean;
}

/** The "select all results" checkbox of the table, or the table container when it is disabled (no results). */
function focusSelectAllOrTable(root: HTMLElement | null, tableId: string): void {
  const header = root?.querySelector<HTMLInputElement>('th[data-rop-select] input');
  const target = header && !header.disabled ? header : root?.querySelector<HTMLElement>(`[id="${tableId}"]`);
  target?.focus();
}

/**
 * Whether the focus of `node` was lost with it: the node is gone or not laid out any more, and the focus is
 * on `body` (or nowhere, or still on the hidden node), not somewhere the user moved it on purpose.
 */
function focusLostWith(node: Element): boolean {
  if (node.isConnected && isLaidOut(node)) return false;
  const active = document.activeElement;
  return !active || active === document.body || active === node || !active.isConnected;
}

function ListReportFrameImpl<Row>(props: ListReportFrameProps<Row> & ListReportFrameInternalProps, ref: Ref<HTMLDivElement>) {
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
    bulkActionsWideOnly = false,
    keepBulkActionsFocus = false,
    ...rest
  } = props;
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const barRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, rootRef), [ref]);
  const { selection } = table;
  // The default texts format their numbers in the locale of `useListReport`; a custom function gets raw numbers.
  const numberFormat = getNumberFormat(table.locale);
  const fmt = (n: number) => numberFormat.format(n);
  const count = labels?.count ?? defaultCount(fmt);
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
    focusSelectAllOrTable(rootRef.current, tableId);
  };

  // `keepBulkActionsFocus`: the control of the bulk actions holding the focus, observed only while it does.
  // A blur that leaves the control laid out is the user moving on; a blur with the control hidden or removed
  // keeps it, because that is the very change the observer reacts to. (Prose here is read by the Tailwind
  // scan of `src/`: no utility names as bare words.)
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [focusedAction, setFocusedAction] = useState<Element | null>(null);
  useResizeAndMutationEffect(() => {
    const slot = actionsRef.current;
    const node = focusedAction;
    if (!keepBulkActionsFocus || !slot || !node) return undefined;
    // An environment without layout (nothing is ever laid out) never moves the focus.
    const wasLaidOut = isLaidOut(node);
    return {
      target: slot,
      // A removed action changes the slot's children; a hidden slot collapses its own box.
      children: true,
      update: () => {
        if (!wasLaidOut || !focusLostWith(node)) return;
        setFocusedAction(null);
        focusSelectAllOrTable(rootRef.current, tableId);
      },
    };
  }, [keepBulkActionsFocus, focusedAction, tableId]);

  return (
    <div {...rest} ref={mergedRef} className={cn(rootClass, className)}>
      <div className={headerClass}>
        <Title level={titleLevel} className={titleClass}>
          <span id={nameId}>{title}</span>{' '}
          <span
            data-rop-count=""
            data-changed={countChanged ? '' : undefined}
            className={cn(countClass, labels?.count && countWrapClass, countChanged && countFlashClass, !countShown && countHiddenClass)}
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
          data-rop-bulk-actions={bulkActions && !bulkActionsWideOnly ? 'true' : 'false'}
          className={selectionBarClass}
        >
          <span id={`${baseId}-selection`} hidden>
            {labels?.selectionBar ?? 'Selection'}
          </span>
          <TruncatedText className={selectionCountClass} data-rop-selection-count="">
            {(labels?.selectionCount ?? defaultSelectionCount(fmt))(selection.selectedResultCount, selection.hiddenSelectedCount)}
          </TruncatedText>
          {bulkActions ? (
            <div
              ref={actionsRef}
              className={cn(selectionActionsClass, bulkActionsWideOnly && selectionActionsWideOnlyClass)}
              onFocus={keepBulkActionsFocus ? (event) => setFocusedAction(event.target) : undefined}
              onBlur={
                keepBulkActionsFocus
                  ? (event) => {
                      const node = event.target;
                      if (node.isConnected && isLaidOut(node)) setFocusedAction((current) => (current === node ? null : current));
                    }
                  : undefined
              }
            >
              {bulkActions(selection)}
            </div>
          ) : null}
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
  props: ListReportFrameProps<Row> & ListReportFrameInternalProps & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
