import { useRef, type HTMLAttributes, type MouseEvent } from 'react';
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
   * e.g. `shiftKey` for a range-selection gesture in a virtualized table). It decides itself what to
   * change (`selection.toggle`, `selection.setSelectedIds`, …). Without it the checkbox calls
   * `selection.toggle(id)`, exactly as before. Never rendered to the DOM.
   */
  onToggle?: (id: string, event: MouseEvent<HTMLInputElement>) => void;
  /** Passed to `renderCell` for every cell of the row (e.g. `forceTruncate`). Without it, `renderCell(column, row)`. */
  renderCellOptions?: RenderCellOptions;
}

/**
 * @internal One data `<tr>` of the List Report table body: the optional leading checkbox cell and
 * one `<td>` per column. The default `renderBody` of `ListReportTable` renders one of these per
 * row; a virtualized table (`@react-object-page/pro`) renders the same row for whatever subset it
 * mounts. Exported from `@react-object-page/core/internal`; not public API, no semver guarantee.
 */
export function ListReportTableRow<Row>({
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
