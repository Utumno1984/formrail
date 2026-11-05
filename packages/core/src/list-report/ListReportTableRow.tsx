import { memo, useRef, type HTMLAttributes, type MouseEvent, type ReactElement } from 'react';
import { Checkbox } from '../checkbox/Checkbox';
import { cn } from '../utils/cn';
import { renderCell, type RenderCellOptions } from './list-report-cell';
import type { ListReportTableLabels } from './ListReportTableStates';
import { ALIGN_TEXT, bodyCellClass, selectableRowClass, selectBodyCellClass, selectBoxClass } from './list-report-table-styles';
import type { UseListReportReturn } from './types';

/** @internal Props of {@link ListReportTableRow}. */
export interface ListReportTableRowProps<Row> {
  table: UseListReportReturn<Row>;
  row: Row;
  selectable: boolean;
  labels: ListReportTableLabels;
  /**
   * Extra attributes merged onto the `<tr>` (e.g. `aria-rowindex`, a shift-click handler in a
   * virtualized table). Never changes `data-selected` or the selection class; without it the `<tr>`
   * is exactly what it was before this was a separate component.
   */
  rowProps?: HTMLAttributes<HTMLTableRowElement>;
  /**
   * Replaces `selection.toggle(id)` as the effect of the row checkbox (only with `selectable`): called
   * once per user toggle with the row id and the `click` event of the checkbox (modifier keys included,
   * e.g. `shiftKey` for a range-selection gesture in a virtualized table; the event has already been
   * dispatched, so read the checkbox from `event.target`, not `currentTarget`). It decides itself what to
   * change (`selection.toggle`, `selection.setSelectedIds`, …). Without it the checkbox calls
   * `selection.toggle(id)`, exactly as before. Never rendered to the DOM.
   */
  onToggle?: (id: string, event: MouseEvent<HTMLInputElement>) => void;
  /** Passed to `renderCell` for every cell of the row (e.g. `forceTruncate`). Without it, `renderCell(column, row)`. */
  renderCellOptions?: RenderCellOptions;
}

function ListReportTableRowImpl<Row>({
  table,
  row,
  selectable,
  labels,
  rowProps,
  onToggle,
  renderCellOptions,
}: ListReportTableRowProps<Row>) {
  const { columns, selection } = table;
  // The checkbox calls `onClick` before `onCheckedChange` within the same click: keep the event for `onToggle`.
  const lastClick = useRef<MouseEvent<HTMLInputElement> | null>(null);
  const id = table.getRowId(row);
  const selected = selectable && selection.isSelected(id);
  const { className: extraClassName, ...restRowProps } = rowProps ?? {};
  // `cn()` always returns a string (possibly ''), which would render an empty `class=""` attribute
  // where the original markup had none at all: only merge through `cn` when there is a selection
  // class to merge with, so a plain, non-selectable row (no `rowProps`) keeps no `class` attribute.
  const className = selectable ? cn(selectableRowClass, extraClassName) : extraClassName;
  return (
    <tr {...restRowProps} data-selected={selected ? '' : undefined} className={className}>
      {selectable ? (
        <td className={selectBodyCellClass}>
          <div className={selectBoxClass}>
            <Checkbox
              checked={selected}
              aria-label={labels.selectRow(selection.getRowLabel(row))}
              onClick={
                onToggle
                  ? (event) => {
                      lastClick.current = event;
                    }
                  : undefined
              }
              onCheckedChange={() => {
                const event = lastClick.current;
                lastClick.current = null;
                if (onToggle && event) onToggle(id, event);
                else selection.toggle(id);
              }}
            />
          </div>
        </td>
      ) : null}
      {columns.map((column) => (
        <td key={column.id} className={cn(bodyCellClass, ALIGN_TEXT[column.align ?? 'start'])}>
          {renderCell(column, row, renderCellOptions)}
        </td>
      ))}
    </tr>
  );
}

const sameRowProps = (a: HTMLAttributes<HTMLTableRowElement> | undefined, b: HTMLAttributes<HTMLTableRowElement> | undefined): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof typeof a)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
};

/**
 * The render reads only the members of `table` checked here. A skipped render keeps a stale `table`
 * object, which is safe only because everything it is used for is unchanged: `selection.toggle` is
 * stable in the hook, and `isSelected` changes identity on every selection change, so it is compared
 * through its result for this row.
 */
function rowPropsAreEqual<Row>(prev: ListReportTableRowProps<Row>, next: ListReportTableRowProps<Row>): boolean {
  if (
    prev.row !== next.row ||
    prev.selectable !== next.selectable ||
    prev.onToggle !== next.onToggle ||
    prev.renderCellOptions !== next.renderCellOptions ||
    prev.labels.selectRow !== next.labels.selectRow ||
    !sameRowProps(prev.rowProps, next.rowProps)
  ) {
    return false;
  }
  const a = prev.table;
  const b = next.table;
  if (a.columns !== b.columns || a.selection.toggle !== b.selection.toggle) return false;
  // `getRowId` and `getRowLabel` are compared by result: an inline `getRowId` changes identity on every
  // render of the consumer, and with it `getRowLabel`, which would defeat the memo for every row.
  const id = b.getRowId(next.row);
  if (a.getRowId(prev.row) !== id) return false;
  if (!next.selectable) return true;
  return a.selection.isSelected(id) === b.selection.isSelected(id) && a.selection.getRowLabel(prev.row) === b.selection.getRowLabel(next.row);
}

/**
 * @internal One data `<tr>` of the List Report table body: the optional leading checkbox cell and
 * one `<td>` per column. The default `renderBody` of `ListReportTable` renders one of these per
 * row; a virtualized table (`@react-object-page/pro`) renders the same row for whatever subset it
 * mounts. Memoized: it re-renders only when its row, its selected state, `columns`, its id and
 * label, `labels.selectRow`, `rowProps` (shallow) or the extension props change; a `cell` that
 * reads state outside `columns`/`row` is not re-evaluated by a parent render. Exported from
 * `@react-object-page/core/internal`; not public API, no semver guarantee.
 */
export const ListReportTableRow = /* @__PURE__ */ memo(ListReportTableRowImpl, rowPropsAreEqual) as <Row>(
  props: ListReportTableRowProps<Row>,
) => ReactElement | null;
