import { forwardRef, type ReactElement, type Ref } from 'react';
import { ListReportFrame, type ListReportFrameLabels, type ListReportFrameProps } from './ListReportFrame';
import { ListReportTable } from './ListReportTable';

export type ListReportLabels = ListReportFrameLabels;
export type ListReportProps<Row> = Omit<ListReportFrameProps<Row>, 'renderTable'>;

function ListReportImpl<Row>(props: ListReportProps<Row>, ref: Ref<HTMLDivElement>) {
  return <ListReportFrame {...props} ref={ref} renderTable={(tableProps) => <ListReportTable {...tableProps} />} />;
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
 *
 * Built on `ListReportFrame` of `@react-object-page/core/internal` (not public API): `ListReport` is the
 * Frame with `renderTable` = `ListReportTable`.
 */
export const ListReport = /* @__PURE__ */ forwardRef(ListReportImpl) as <Row>(
  props: ListReportProps<Row> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null;
