import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type TableHTMLAttributes,
} from 'react';
import { hasContent, textOf } from '../internal/react-nodes';
import { cn } from '../utils/cn';
import { composeRefs } from '../utils/compose-refs';
import { useResizeAndMutationEffect } from '../utils/use-resize-and-mutation-effect';
import { ListReportTableHead } from './ListReportTableHead';
import {
  DEFAULT_LABELS,
  DEFAULT_LOADING_ROW_COUNT,
  ErrorContent,
  Filler,
  NoResultsContent,
  SkeletonRows,
  StateRow,
  wholeRows,
  type ListReportTableLabels,
} from './ListReportTableStates';
import { tableSize } from './list-report-table-layout';
import {
  captionClass,
  containerClass,
  ROW_ACTIONS_COLUMN_WIDTH,
  ROW_ACTIONS_INLINE_COLUMN_WIDTH,
  rowActionsInlineContainerClass,
  rowActionsInlineTableClass,
  SELECT_COLUMN_WIDTH,
  tableClass,
} from './list-report-table-styles';
import type { ListReportRowActions, UseListReportReturn } from './types';

export type ListReportTableStatus = 'ready' | 'loading' | 'error';

/** The table must have an accessible name: at least one of the three. */
type TableName =
  | {
      /** Accessible name of the table. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      'aria-label': string;
      /** Id of the element that names the table. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      'aria-labelledby'?: string;
      /** Visible `<caption>` of the table, which also names it. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      caption?: ReactNode;
    }
  | {
      /** Id of the element that names the table. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      'aria-labelledby': string;
      /** Accessible name of the table. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      'aria-label'?: string;
      /** Visible `<caption>` of the table, which also names it. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      caption?: ReactNode;
    }
  | {
      /** Visible `<caption>` of the table, which also names it. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      caption: NonNullable<ReactNode>;
      /** Accessible name of the table. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      'aria-label'?: string;
      /** Id of the element that names the table. Required: at least one of `aria-label`, `aria-labelledby`, `caption`. */
      'aria-labelledby'?: string;
    };

export type ListReportTableProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'aria-label' | 'aria-labelledby'> & {
  /** What `useListReport` returned: the table only renders it. */
  table: UseListReportReturn<Row>;
  /**
   * Maximum height of the scroll container (px or any CSS length). Without it the container takes
   * the height its parent gives it (e.g. a flex child with `min-height: 0`).
   */
  maxHeight?: number | string;
  /**
   * `loading` keeps the rows it has (or shows `loadingRowCount` skeleton rows when there are none);
   * `error` replaces the body with an error strip. Default `ready`.
   */
  status?: ListReportTableStatus;
  /**
   * Skeleton rows while loading without rows, and the minimum height of the body in every state
   * (`loadingRowCount x row height`), so that loading, empty, error and data share one footprint.
   * Default 5; with 0 the body is one row tall.
   */
  loadingRowCount?: number;
  /** Content of the error strip. Default: `labels.error`. */
  errorMessage?: ReactNode;
  /**
   * Adds a retry button to the error strip. The focus stays on it while the error stays; when the
   * strip goes away (now or later, e.g. a reload), the focus moves to the table container.
   */
  onRetry?: () => void;
  /**
   * Adds a "clear filters" button to the "no results" state. Same focus rule as `onRetry`: it moves to
   * the table container only when the button goes away with the state.
   */
  onClearFilters?: () => void;
  /** Overrides the texts (partial: the rest keeps the English defaults). */
  labels?: Partial<ListReportTableLabels>;
  /**
   * Actions of each row, in a menu: adds a trailing column (not one of `columns`, as wide as a row is
   * tall, sticky at the inline end so it stays in view while a narrow table scrolls sideways) with,
   * for every row that has actions, a "…" button named `labels.rowActions(getRowLabel(row))` that opens
   * a menu with one item per action. Each action's `onSelect` gets the trigger as `returnFocusRef`
   * (pass it to a dialog the action opens). A row with no actions (`[]`) has an empty cell. Called
   * while a row renders: memoize it like `columns` (see `ListReportRowActions`). Without it the DOM is
   * the same as before. Never rendered to the DOM.
   */
  rowActions?: ListReportRowActions<Row>;
  /**
   * How many actions with an `icon` are inline buttons when the table's container is at least 40rem
   * wide. Default 0.
   *
   * With `n` > 0 the first `n` actions with an `icon` of every row are icon buttons in the actions
   * column (a `Tooltip` with the label on hover/keyboard focus, named `labels.rowAction(label,
   * rowLabel)`: "Delete FT-2026-0001"), followed by the "…" menu with the other actions (no "…" when
   * none is left). Below 40rem every action is in the "…" menu. The switch is CSS alone (a container
   * query on the scroll container, not the viewport: a table in a narrow panel of a wide page uses the
   * narrow form): both forms are rendered from the same descriptors, only one is displayed, and the
   * other is out of the accessibility tree and of the tab order. The 40rem threshold is fixed.
   *
   * - The column is as wide as `n` icon slots plus the trigger's slot in the wide form, one slot in
   *   the narrow one, whatever the actions of each row (a row with fewer inline actions leaves slots
   *   empty), in every state (loading, empty, data).
   * - A disabled action inline is `aria-disabled` (still focusable, its tooltip still shows) and a
   *   click, Enter or Space does nothing; in the menu it is a disabled item.
   * - `onSelect` gets the control that was used (the inline button, or the trigger of the menu) as
   *   `returnFocusRef`.
   * - A menu open when the form changes (a tablet rotated, a panel resized) closes without running
   *   anything, and the focus goes to the visible control of the same row.
   * - The scroll container gets inline-size containment: its width must come from its parent (a block
   *   or a stretched flex/grid item), not from the table; in a shrink-to-fit parent it collapses.
   *
   * A negative or fractional value is floored to a whole number ≥ 0 (reported in development).
   */
  rowActionsInline?: number;
} & TableName;

type BodyKind = 'loading' | 'error' | 'empty' | 'noResults' | 'data';

// Bundlers replace `process.env.NODE_ENV` in consumer builds; without `process` assume development.
const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

/** @internal What `ListReportTableShell` passes to `renderBody` for `view === 'rows'`. */
export interface ListReportTableBodyContext<Row> {
  table: UseListReportReturn<Row>;
  selectable: boolean;
  /**
   * `table.columns.length`, plus one for the leading selection column when `selectable` and one for
   * the trailing row actions column with `rowActions`.
   */
  columnCount: number;
  /** The `rowActions` prop: pass it to every `ListReportTableRow`. */
  rowActions: ListReportRowActions<Row> | undefined;
  /** The `rowActionsInline` prop as a whole number ≥ 0 (`0` without `rowActions`): pass it to every `ListReportTableRow`. */
  rowActionsInline: number;
  labels: ListReportTableLabels;
  /** Minimum number of rows the body must span (`loadingRowCount`, floored at 0). */
  minRows: number;
}

/** @internal Props of {@link ListReportTableShell}. */
export type ListReportTableShellProps<Row> = ListReportTableProps<Row> & {
  /** Renders the `<tbody>` content for `view === 'rows'` (every other state is the Shell's own). */
  renderBody: (ctx: ListReportTableBodyContext<Row>) => ReactNode;
  /** Extra attributes merged onto the `<table>` element (e.g. `aria-rowcount` in a virtualized table). */
  tableProps?: Omit<TableHTMLAttributes<HTMLTableElement>, 'className' | 'style' | 'children' | 'aria-label' | 'aria-labelledby'>;
  /** Extra attributes merged onto the header `<tr>` (e.g. `aria-rowindex={1}` in a virtualized table). */
  headRowProps?: HTMLAttributes<HTMLTableRowElement>;
};

function ListReportTableShellImpl<Row>(props: ListReportTableShellProps<Row>, ref: Ref<HTMLDivElement>) {
  const {
    table,
    maxHeight,
    status = 'ready',
    loadingRowCount = DEFAULT_LOADING_ROW_COUNT,
    errorMessage,
    onRetry,
    onClearFilters,
    labels: labelOverrides,
    caption,
    className,
    style,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    renderBody,
    tableProps,
    headRowProps,
    rowActions,
    rowActionsInline: rowActionsInlineProp,
    ...rest
  } = props;
  const { columns, selection } = table;
  const selectable = selection.enabled;
  const hasRowActions = rowActions !== undefined;
  const inlineUsed = wholeRows(rowActionsInlineProp ?? 0);
  const inlineCount = hasRowActions ? inlineUsed : 0;
  const invalidInline =
    rowActionsInlineProp !== undefined && !(Number.isInteger(rowActionsInlineProp) && rowActionsInlineProp >= 0);
  useEffect(() => {
    if (invalidInline && isDev()) {
      console.error(
        `[formrail] <ListReportTable> rowActionsInline must be a whole number ≥ 0; got ${String(rowActionsInlineProp)}, used ${inlineUsed}.`,
      );
    }
  }, [invalidInline, rowActionsInlineProp, inlineUsed]);
  const rowActionsWidth = inlineCount > 0 ? ROW_ACTIONS_INLINE_COLUMN_WIDTH : ROW_ACTIONS_COLUMN_WIDTH;
  // The selection and row actions columns are not among `columns`: every full-width row spans them too.
  const columnCount = columns.length + (selectable ? 1 : 0) + (hasRowActions ? 1 : 0);
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMemo(() => composeRefs(ref, containerRef), [ref]);

  const minRows = wholeRows(loadingRowCount);
  const hasRows = table.rows.length > 0;
  // What the body shows. `loading` with rows keeps them; `error` replaces them (declared behaviour).
  const view: 'error' | 'rows' | 'skeleton' | 'empty' | 'noResults' =
    status === 'error' ? 'error' : hasRows ? 'rows' : status === 'loading' ? 'skeleton' : table.totalCount === 0 ? 'empty' : 'noResults';
  // What is announced: the status wins over the rows (a reload with rows is still "loading").
  const kind: BodyKind = status === 'error' ? 'error' : status === 'loading' ? 'loading' : view === 'rows' ? 'data' : view === 'skeleton' ? 'loading' : view;
  const messageShown = view === 'error' || view === 'empty' || view === 'noResults';

  // The announcement of a change of state, derived while rendering (no effect, no announcement at
  // mount). The last change wins: the text is replaced, never queued. Inside `data` a change of the
  // result count (filter, search) is announced too, with the same text as the return from loading;
  // one derivation covers both, so a change that is both announces once.
  const [announced, setAnnounced] = useState<{ kind: BodyKind; count: number; text: string }>({
    kind,
    count: table.resultCount,
    text: '',
  });
  if (announced.kind !== kind || (kind === 'data' && announced.count !== table.resultCount)) {
    const text =
      kind === 'loading'
        ? labels.loading
        : kind === 'error'
          ? textOf(errorMessage).trim() || labels.error
          : kind === 'empty'
            ? labels.empty
            : kind === 'noResults'
              ? labels.noResults
              : labels.resultCount(table.resultCount);
    setAnnounced({ kind, count: table.resultCount, text });
  }

  // The message of a state sits in the visible part of the scroller: its width goes in a CSS variable
  // set on the element itself (no re-render of the table on every resize).
  useResizeAndMutationEffect(() => {
    const el = containerRef.current;
    if (!messageShown || !el || typeof ResizeObserver === 'undefined') return undefined;
    return {
      target: el,
      update: () => el.style.setProperty('--rop-list-report-view-width', `${el.clientWidth}px`),
      cleanup: () => el.style.removeProperty('--rop-list-report-view-width'),
    };
  }, [messageShown]);

  // The button of a state (Retry, Clear filters) may disappear with the state it belongs to: then the
  // focus must not fall on the body, it goes to the container. Only then: while the state (and so the
  // button) stays, e.g. a retry that fails again or a callback that changes nothing, the focus stays on
  // the button. Moving it eagerly would draw the container's focus indicator around the whole table (#307).
  // The action may change the state later (an async reload): the flag waits for the next change of view,
  // but only while the focus is still the one the click left on the button. A flag that just lived until
  // the next change of view would hand the focus to the container at a change the click did not cause
  // (a poll after the user moved the focus away on purpose): the same ring, only later.
  const stateActionRan = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    // Any focus that leaves an element of the table ends the click's sequence: after it the focus is no
    // longer the button's to lose (the user or the action moved it). Chromium fires a focusout also when
    // the focused button is removed, during the removal itself: so the flag is cleared in a microtask,
    // after the commit that removed the button, whose layout effect below has already used the flag
    // (React runs removal and layout effects in one synchronous commit). A removal without a change of
    // view (e.g. `onRetry` dropped) clears it too, instead of leaving it for an unrelated change later.
    // (Prose here is read by the Tailwind scan of `src/`: no utility names as bare words.)
    const onFocusOut = () => {
      queueMicrotask(() => {
        stateActionRan.current = false;
      });
    };
    el.addEventListener('focusout', onFocusOut);
    return () => el.removeEventListener('focusout', onFocusOut);
  }, []);
  useLayoutEffect(() => {
    if (!stateActionRan.current) return;
    stateActionRan.current = false;
    const active = document.activeElement;
    // Only a focus that was lost with the button; one the action moved elsewhere on purpose is kept.
    if (!active || active === document.body) containerRef.current?.focus();
  }, [view]);
  const thenFocusContainer = (action: (() => void) | undefined) =>
    action
      ? () => {
          // Only a focus inside the table can be lost with the button: a click that does not focus the
          // button (e.g. Safari) leaves nothing to restore.
          const active = document.activeElement;
          stateActionRan.current = !!active && active !== document.body && !!containerRef.current?.contains(active);
          action();
        }
      : undefined;

  const named = !!ariaLabel?.trim() || !!ariaLabelledby?.trim() || hasContent(caption);
  useEffect(() => {
    if (!named && isDev()) {
      console.warn('[formrail] <ListReportTable> needs an accessible name: pass `aria-label`, `aria-labelledby` or `caption`.');
    }
  }, [named]);

  const size = tableSize(columns, selectable ? SELECT_COLUMN_WIDTH : undefined, hasRowActions ? rowActionsWidth : undefined);
  // With inline actions the width of their column is a custom property the container query sets on the
  // table (see `rowActionsInlineTableClass`), from the count given here.
  const tableStyle: CSSProperties =
    inlineCount > 0
      ? ({ width: size.width, minWidth: size.minWidth, '--rop-list-report-row-actions-inline': inlineCount } as CSSProperties)
      : { width: size.width, minWidth: size.minWidth };
  const containerStyle: CSSProperties = { ...(maxHeight !== undefined ? { maxHeight } : null), ...style };

  return (
    <>
    <div
      // A scrollable region must be reachable by keyboard (axe `scrollable-region-focusable`).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      {...rest}
      ref={mergedRef}
      aria-busy={status === 'loading' ? true : undefined}
      className={cn(containerClass, inlineCount > 0 && rowActionsInlineContainerClass, className)}
      style={containerStyle}
    >
      <table
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={inlineCount > 0 ? cn(tableClass, rowActionsInlineTableClass) : tableClass}
        style={tableStyle}
        {...tableProps}
      >
        {hasContent(caption) ? <caption className={captionClass}>{caption}</caption> : null}
        <ListReportTableHead table={table} selectable={selectable} labels={labels} rowProps={headRowProps} rowActions={hasRowActions} rowActionsWidth={rowActionsWidth} />
        <tbody>
          {view === 'rows' ? renderBody({ table, selectable, columnCount, labels, minRows, rowActions, rowActionsInline: inlineCount }) : null}
          {view === 'skeleton' ? (
            <>
              <SkeletonRows columns={columns} count={minRows} selectable={selectable} rowActions={hasRowActions} />
              {/* loadingRowCount={0}: no skeleton, but the body keeps the height of one row */}
              <Filler columnCount={columnCount} rows={1 - minRows} />
            </>
          ) : null}
          {view === 'empty' ? (
            <StateRow columnCount={columnCount} rows={Math.max(1, minRows)}>
              <p className="m-0">{labels.empty}</p>
            </StateRow>
          ) : null}
          {view === 'noResults' ? (
            <StateRow columnCount={columnCount} rows={Math.max(1, minRows)}>
              <NoResultsContent
                message={labels.noResults}
                clearLabel={labels.clearFilters}
                onClearFilters={thenFocusContainer(onClearFilters)}
              />
            </StateRow>
          ) : null}
          {view === 'error' ? (
            <StateRow columnCount={columnCount} rows={Math.max(1, minRows)}>
              <ErrorContent
                message={hasContent(errorMessage) ? errorMessage : labels.error}
                retryLabel={labels.retry}
                onRetry={thenFocusContainer(onRetry)}
              />
            </StateRow>
          ) : null}
        </tbody>
      </table>
    </div>
    {/* Always mounted (a live region inserted already filled is not announced), empty until a state changes.
        A sibling after the container, not a child: inside the `aria-busy` element its changes may be withheld. */}
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announced.text}
    </div>
    </>
  );
}

/**
 * @internal The List Report table's shell: the scroll container (`forwardRef`), the `<table>`, the
 * head (`ListReportTableHead`), the stable-footprint states (skeleton/empty/noResults/error) and the
 * always-mounted announcement. `renderBody(ctx)` is called only for `view === 'rows'`; `ListReportTable`
 * uses it to render every row (`ListReportTableRow`) plus a `Filler`, and a virtualized table
 * (`@formrail/pro`) uses it to mount only a range of rows with spacer `<tr>`s around them.
 * Exported from `@formrail/core/internal`; not public API, no semver guarantee.
 */
export const ListReportTableShell = /* @__PURE__ */ forwardRef(ListReportTableShellImpl) as <Row>(
  props: ListReportTableShellProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
