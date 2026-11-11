import { forwardRef, type ReactElement, type Ref } from 'react';
import { ListReportTableRow } from './ListReportTableRow';
import { Filler } from './ListReportTableStates';
import { ListReportTableShell, type ListReportTableProps } from './ListReportTableShell';

export type { ListReportTableLabels } from './ListReportTableStates';
export type { ListReportTableProps, ListReportTableStatus } from './ListReportTableShell';

function ListReportTableImpl<Row>(props: ListReportTableProps<Row>, ref: Ref<HTMLDivElement>) {
  return (
    <ListReportTableShell
      {...props}
      ref={ref}
      renderBody={(ctx) => (
        <>
          {ctx.table.rows.map((row) => (
            <ListReportTableRow
              key={ctx.table.getRowId(row)}
              table={ctx.table}
              row={row}
              selectable={ctx.selectable}
              labels={ctx.labels}
              rowActions={ctx.rowActions}
              rowActionsInline={ctx.rowActionsInline}
            />
          ))}
          <Filler columnCount={ctx.columnCount} rows={ctx.minRows - ctx.table.rows.length} />
        </>
      )}
    />
  );
}

// Implementation: `ListReportTableShell` (with the Head/Row/`renderCell`/`tableSize` building blocks) and a
// `renderBody` that renders every result row (`ListReportTableRow`) plus a `Filler`.
/**
 * The List Report table: a native `<table>` that renders the state of `useListReport`.
 *
 * - Widths are declared (`<colgroup>` + `table-layout: fixed`): a long cell never widens its
 *   column. The table has a `min-width` (sum of `width`/`minWidth`, default `minWidth` 120px) and
 *   scrolls inside its own container; the page does not overflow.
 * - Sortable headers are buttons inside `<th aria-sort>`; the sort logic stays in the hook.
 * - Text cells (a string/number from `cell`, or `String(accessor(row))`) are truncated with
 *   `TruncatedText` unless the column sets `truncate: false`. A `cell` that returns a React node is
 *   placed in a `min-width: 0; overflow: hidden` wrapper; its layout (and its height) is the
 *   consumer's responsibility. `null`/`undefined` give an empty cell.
 * - Rows are memoized: a render of the parent does not re-evaluate `cell` or `accessor` for a row whose
 *   object, `columns`, selected state, selection label and id are unchanged. A cell that reads anything
 *   else, or a row mutated in place, keeps what is on screen: see `ListReportColumn.cell` for what to do.
 * - One scroller: the container (`forwardRef`) scrolls both ways and the header sticks to its top.
 *   Size it with the parent (flex) or with `maxHeight`. It is a tab stop so the keyboard can scroll.
 * - Every row has the height of `--rop-list-report-row-height`.
 * - States: `status="loading"` shows `loadingRowCount` skeleton rows (or keeps the rows it has),
 *   `"error"` replaces the body with an error strip, and a `ready` table without visible rows says
 *   whether there is no data at all or no result for the current filters. The header, the column
 *   widths and a body of at least `loadingRowCount` rows are the same in every state. A polite live
 *   region, always mounted, announces each change of state (never the first render).
 *
 * - Selection (`useListReport({ selectable: true })`): a leading column, not one of `columns`, as wide as a
 *   row is tall, with a tri-state "select all results" checkbox in the header (over the current results
 *   only; disabled with none) and one checkbox per row named `labels.selectRow(getRowLabel(row))`. A
 *   selected row has `data-selected` and a tinted background. There is no `aria-selected` on the rows (not
 *   allowed in a native table): the checkbox carries the state. A click elsewhere in the row does nothing,
 *   so cells can hold their own links and buttons. Selecting announces nothing beyond the checkbox itself.
 *   Without `selectable` the DOM is the same as before.
 * - Row actions (`rowActions`): a trailing column, not one of `columns`, as wide as a row is tall and
 *   sticky at the inline end of the scroller (it stays in view while a narrow table scrolls sideways),
 *   with a visually hidden header (`labels.rowActionsColumn`) and, in every row that has actions, a "…"
 *   button named `labels.rowActions(getRowLabel(row))` that opens a `Menu`. Each action's `onSelect`
 *   receives `{ returnFocusRef }` (the trigger) for a dialog it opens. With `rowActions` every row is
 *   given an opaque surface background. Without it the DOM is the same as before.
 *   With `rowActionsInline={n}` the first `n` actions with an `icon` are inline icon buttons when the
 *   scroll container is at least 40rem wide (a container query: both forms are in the DOM, one is
 *   displayed), and the column widens by `n` icon slots; below 40rem they are back in the "…" menu.
 *
 * An accessible name is required: `aria-label`, `aria-labelledby` or a (visually hidden) `caption`.
 */
export const ListReportTable = /* @__PURE__ */ forwardRef(ListReportTableImpl) as <Row>(
  props: ListReportTableProps<Row> & {
    /** The table's scroll container (the focusable `<div>` around the `<table>`). */
    ref?: Ref<HTMLDivElement>;
  },
) => ReactElement | null;
