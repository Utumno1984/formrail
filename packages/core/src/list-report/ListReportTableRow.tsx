import { memo, useLayoutEffect, useRef, type HTMLAttributes, type MouseEvent, type ReactElement } from 'react';
import { Checkbox } from '../checkbox/Checkbox';
import { cn } from '../utils/cn';
import { renderCell, type RenderCellOptions } from './list-report-cell';
import type { ListReportTableLabels } from './ListReportTableStates';
import { keepFocusInTable, tableContainerOf } from './keep-focus-in-table';
import { ListReportRowActionsCell } from './ListReportRowActions';
import {
  ALIGN_TEXT,
  bodyCellClass,
  rowActionsRowClass,
  selectableRowClass,
  selectBodyCellClass,
  selectBoxClass,
} from './list-report-table-styles';
import type { ListReportRowActions, UseListReportReturn } from './types';

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
  /**
   * The table's `rowActions` (`ListReportTableBodyContext.rowActions`): adds the trailing, sticky actions
   * cell and gives the `<tr>` an opaque surface. Compared by identity. Without it the `<tr>` is exactly
   * what it was before. Never rendered to the DOM.
   */
  rowActions?: ListReportRowActions<Row>;
}

function ListReportTableRowImpl<Row>({
  table,
  row,
  selectable,
  labels,
  rowProps,
  onToggle,
  renderCellOptions,
  rowActions,
}: ListReportTableRowProps<Row>) {
  const { columns, selection } = table;
  // The checkbox calls `onClick` before `onCheckedChange` within the same click: keep the event for `onToggle`.
  const lastClick = useRef<MouseEvent<HTMLInputElement> | null>(null);
  // A row removed while one of its controls has the focus (its checkbox, a link in a cell, its actions
  // trigger; deleted, filtered out): the focus goes to the table's scroll container, never `body`.
  // Taken in a layout cleanup, while the row is still in the document.
  const trRef = useRef<HTMLTableRowElement | null>(null);
  useLayoutEffect(
    () => () => {
      const tr = trRef.current;
      keepFocusInTable(tableContainerOf(tr), [tr]);
    },
    [],
  );
  const id = table.getRowId(row);
  const selected = selectable && selection.isSelected(id);
  const { className: extraClassName, ...restRowProps } = rowProps ?? {};
  // `cn()` always returns a string (possibly ''), which would render an empty `class=""` attribute
  // where the original markup had none at all: only merge through `cn` when there is a selection
  // class to merge with, so a plain, non-selectable row (no `rowProps`) keeps no `class` attribute.
  // With `rowActions` the row is opaque: the sticky actions cell inherits its background, and a content
  // scrolled under that cell must not show through.
  const className =
    selectable || rowActions
      ? cn(rowActions && rowActionsRowClass, selectable && selectableRowClass, extraClassName)
      : extraClassName;
  return (
    <tr {...restRowProps} ref={trRef} data-selected={selected ? '' : undefined} className={className}>
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
      {rowActions ? <ListReportRowActionsCell actions={rowActions(row)} triggerLabel={labels.rowActions(selection.getRowLabel(row))} /> : null}
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
    prev.rowActions !== next.rowActions ||
    prev.labels.selectRow !== next.labels.selectRow ||
    (next.rowActions !== undefined && prev.labels.rowActions !== next.labels.rowActions) ||
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
  if (!next.selectable && !next.rowActions) return true;
  // The label names the checkbox and the actions trigger.
  if (a.selection.getRowLabel(prev.row) !== b.selection.getRowLabel(next.row)) return false;
  return !next.selectable || a.selection.isSelected(id) === b.selection.isSelected(id);
}

/**
 * @internal One data `<tr>` of the List Report table body: the optional leading checkbox cell and
 * one `<td>` per column. The default `renderBody` of `ListReportTable` renders one of these per
 * row; a virtualized table (`@react-object-page/pro`) renders the same row for whatever subset it
 * mounts. Memoized: it re-renders only when its row, its selected state, `columns`, its id and
 * label, `labels.selectRow`, `labels.rowActions` (with `rowActions`), `rowActions`, `rowProps`
 * (shallow) or the extension props change; see `ListReportColumn.cell` for what that means for a
 * cell (and `ListReportRowActions` for the actions). `onToggle`, `renderCellOptions` and `rowActions`
 * are compared by identity: keep them stable, or every render of the parent renders the row. Exported
 * from `@react-object-page/core/internal`; not public API, no semver guarantee.
 */
export const ListReportTableRow = /* @__PURE__ */ memo(ListReportTableRowImpl, rowPropsAreEqual) as <Row>(
  props: ListReportTableRowProps<Row>,
) => ReactElement | null;
