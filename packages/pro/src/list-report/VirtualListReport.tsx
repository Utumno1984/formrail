import { forwardRef, useMemo, useRef, type ReactElement, type ReactNode, type Ref } from 'react';
import { Button, composeRefs, type ListReportSelection } from '@formrail/core';
import { ListReportFrame, type ListReportFrameLabels, type ListReportFrameProps } from '@formrail/core/internal';
import { VirtualListReportTable, type VirtualListReportTableProps } from './VirtualListReportTable';

/** Texts of `VirtualListReport`: those of the core floorplan plus the Pro selection action. */
export interface VirtualListReportLabels extends ListReportFrameLabels {
  /**
   * The "select every result" action of the selection bar, shown when some but not all of the results
   * are selected. Distinct from the header checkbox's `selectAllResults` on purpose (two controls, two
   * names). Default: "Select all 100,000 results".
   */
  selectAllResultsAction: (resultCount: number) => string;
}

const DEFAULT_SELECT_ALL_ACTION = (resultCount: number): string =>
  `Select all ${resultCount.toLocaleString('en-US')} ${resultCount === 1 ? 'result' : 'results'}`;

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
  const selectAllLabel = labels?.selectAllResultsAction ?? DEFAULT_SELECT_ALL_ACTION;

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
      renderTable={(tableProps) => (
        <VirtualListReportTable {...tableProps} virtualizeThreshold={virtualizeThreshold} overscan={overscan} handleRef={handleRef} />
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
