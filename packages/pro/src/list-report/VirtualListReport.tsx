import { forwardRef, useId, useMemo, useRef, type ReactElement, type ReactNode, type Ref } from 'react';
import { Button, composeRefs, type ListReportSelection } from '@formrail/core';
import { ListReportFrame, getNumberFormat, type ListReportFrameLabels, type ListReportFrameProps } from '@formrail/core/internal';
import { VirtualListReportTable, type VirtualListReportTableInternalProps, type VirtualListReportTableProps } from './VirtualListReportTable';

/** Texts of `VirtualListReport`: those of the core floorplan plus the Pro selection action. */
export interface VirtualListReportLabels extends ListReportFrameLabels {
  /**
   * The "select every result" action of the selection bar, shown when some but not all of the results
   * are selected. Distinct from the header checkbox's `selectAllResults` on purpose (two controls, two
   * names). Default: "Select all 100,000 results", the number formatted in the `locale` of `useListReport`
   * (`Intl.NumberFormat`; with SSR pass `locale`). A custom function receives the raw number and formats it itself.
   */
  selectAllResultsAction: (resultCount: number) => string;
  /**
   * Description of the header checkbox (its name stays `selectAllResults`), linked with `aria-describedby`: it
   * selects every current result, also the rows the virtualization has not mounted. Not rendered while there is no
   * result (the checkbox is disabled then). Default: "All 10,000 results, including those not on screen" ("1 result"
   * for one), the number formatted in the `locale` of `useListReport` (`Intl.NumberFormat`; with SSR pass `locale`).
   * A custom function receives the raw number and formats it itself.
   */
  selectAllResultsDescription: (resultCount: number) => string;
}

const defaultSelectAllAction =
  (fmt: (n: number) => string) =>
  (resultCount: number): string =>
    `Select all ${fmt(resultCount)} ${resultCount === 1 ? 'result' : 'results'}`;

const defaultSelectAllDescription =
  (fmt: (n: number) => string) =>
  (resultCount: number): string =>
    resultCount === 1 ? `${fmt(1)} result` : `All ${fmt(resultCount)} results, including those not on screen`;

// The table with the props only this floorplan passes (the header checkbox's description).
const Table = VirtualListReportTable as <Row>(
  props: VirtualListReportTableProps<Row> & VirtualListReportTableInternalProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;

export type VirtualListReportProps<Row> = Omit<ListReportFrameProps<Row>, 'renderTable' | 'labels'> &
  Pick<VirtualListReportTableProps<Row>, 'virtualizeThreshold' | 'overscan' | 'handleRef'> & {
    /** Texts of the table, of the count and of the selection bar (partial: the rest keeps the English defaults). */
    labels?: Partial<VirtualListReportLabels>;
  };

function VirtualListReportImpl<Row>(props: VirtualListReportProps<Row>, ref: Ref<HTMLDivElement>) {
  const { virtualizeThreshold, overscan, handleRef, bulkActions, labels, scrollerRef, ...frameProps } = props;
  const { table } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const mergedScrollerRef = useMemo(() => composeRefs(scrollerRef, scroller), [scrollerRef]);
  const fmt = (n: number) => getNumberFormat(table.locale).format(n);
  const selectAllLabel = labels?.selectAllResultsAction ?? defaultSelectAllAction(fmt);
  // The header checkbox selects every result, mounted or not: a description says so (and how many), since the
  // "Select all N results" action that says it on a wide screen is not there below 640px without consumer actions.
  const descriptionId = `${useId()}-select-all-description`;
  const description =
    table.selection.enabled && table.resultCount > 0
      ? (labels?.selectAllResultsDescription ?? defaultSelectAllDescription(fmt))(table.resultCount)
      : undefined;

  const renderBulkActions = (selection: ListReportSelection<Row>): ReactNode => {
    const partial = selection.selectedResultCount > 0 && selection.selectedResultCount < table.resultCount;
    const selectAll = () => {
      selection.toggleAllResults();
      // The action hides itself (everything is selected): the focus goes to the header checkbox.
      scroller.current?.querySelector<HTMLInputElement>('th[data-rop-select] input')?.focus();
    };
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          onClick={selectAll}
          data-rop-select-all-results=""
          // Hidden, not removed: it keeps its box (nothing in the bar moves) and leaves the tab order.
          style={partial ? undefined : { visibility: 'hidden' }}
        >
          {selectAllLabel(table.resultCount)}
        </Button>
        {bulkActions?.(selection)}
      </>
    );
  };

  return (
    <ListReportFrame
      {...frameProps}
      ref={ref}
      labels={labels}
      scrollerRef={mergedScrollerRef}
      bulkActions={table.selection.enabled ? renderBulkActions : bulkActions}
      // Without consumer actions (the prop, not what it returns, as in the core), "Select all N results" is the only
      // one: below 640px the bar drops it (CSS) and keeps the one line of a bar without actions; the header
      // checkbox selects every result there. The focus of an action hidden or removed goes to that checkbox.
      bulkActionsWideOnly={table.selection.enabled && !bulkActions}
      keepBulkActionsFocus={table.selection.enabled}
      renderTable={(tableProps) => (
        <>
          <Table
            {...tableProps}
            virtualizeThreshold={virtualizeThreshold}
            overscan={overscan}
            handleRef={handleRef}
            headSelectAllProps={description === undefined ? undefined : { 'aria-describedby': descriptionId }}
          />
          {description === undefined ? null : (
            <span id={descriptionId} hidden>
              {description}
            </span>
          )}
        </>
      )}
    />
  );
}

/**
 * The List Report floorplan of `@formrail/core` (`ListReport`) with the virtualized table
 * (`VirtualListReportTable`): the same title/count, actions, filter bar and selection bar (the core's
 * `ListReportFrame`, not a copy), the same props, plus `virtualizeThreshold`, `overscan` and `handleRef`.
 *
 * - With `useListReport({ selectable: true })` the selection bar gains "Select all N results"
 *   (`labels.selectAllResultsAction`), visible only while some but not all of the results are selected:
 *   it selects every current result (the core's `toggleAllResults`, on the data — no row is mounted for
 *   it), then the focus goes to the header checkbox. The consumer's `bulkActions` follow it.
 * - Below 640px without the consumer's `bulkActions` (the prop: one that returns `null` counts as given) the
 *   action is not there (CSS at the bar's breakpoint: out of the layout, of the accessibility tree and of the
 *   tab order) and the bar is one line, count and "Clear selection", as in `ListReport`. The header checkbox
 *   selects every result there too, unmounted rows included; its description says so ("All 10,000 results,
 *   including those not on screen", `labels.selectAllResultsDescription`). With the consumer's `bulkActions`, or
 *   from 640px, the bar is as above. When the action (or a consumer action) has the focus and goes away (a
 *   viewport resized or a tablet rotated across 640px, `bulkActions` dropped), the focus goes to the header checkbox.
 * - `scrollerRef` is the table's scroll container, as in `ListReport` (`useListReportScrollRestoration`).
 *
 * See `VirtualListReportTable` for the virtualization contract (threshold, fixed pitch, focus, range
 * selection, Escape, limits).
 */
export const VirtualListReport = /* @__PURE__ */ forwardRef(VirtualListReportImpl) as <Row>(
  props: VirtualListReportProps<Row> & {
    /** The floorplan's root `<div>` (the table's scroll container is `scrollerRef`). */
    ref?: Ref<HTMLDivElement>;
  },
) => ReactElement | null;
