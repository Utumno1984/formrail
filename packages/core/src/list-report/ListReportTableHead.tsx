import type { HTMLAttributes } from 'react';
import { Checkbox } from '../checkbox/Checkbox';
import { Icon } from '../icon/Icon';
import { CapIconSlot } from '../internal/CapIconSlot';
import { internalIcons } from '../internal/icons';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { cn } from '../utils/cn';
import type { ListReportTableLabels } from './ListReportTableStates';
import { toCss } from './list-report-table-layout';
import {
  ALIGN_JUSTIFY,
  ALIGN_TEXT,
  headerCellClass,
  SELECT_COLUMN_WIDTH,
  selectBoxClass,
  selectHeaderCellClass,
  sortButtonClass,
  sortIconAscendingClass,
  sortIconClass,
  sortIconIdleClass,
} from './list-report-table-styles';
import type { UseListReportReturn } from './types';

/** @internal Props of {@link ListReportTableHead}. */
export interface ListReportTableHeadProps<Row> {
  table: UseListReportReturn<Row>;
  /** Whether to render the leading selection column (header checkbox + its `<col>`). */
  selectable: boolean;
  labels: ListReportTableLabels;
  /** Extra attributes merged onto the header `<tr>` (e.g. `aria-rowindex={1}` in a virtualized table). Without it the `<tr>` has none. */
  rowProps?: HTMLAttributes<HTMLTableRowElement>;
}

/**
 * @internal `<colgroup>` + `<thead>` of the List Report table (`ListReportTableShell`'s head): column
 * widths, the optional leading selection column (tri-state "select all results" checkbox) and the
 * sortable column headers. Exported from `@react-object-page/core/internal` for
 * `@react-object-page/pro`; not public API, no semver guarantee, not meant to be used standalone.
 */
export function ListReportTableHead<Row>({ table, selectable, labels, rowProps }: ListReportTableHeadProps<Row>) {
  const { columns, selection } = table;
  return (
    <>
      <colgroup>
        {selectable ? <col style={{ width: SELECT_COLUMN_WIDTH }} /> : null}
        {columns.map((column) => (
          <col key={column.id} style={column.width !== undefined ? { width: toCss(column.width) } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr {...rowProps}>
          {selectable ? (
            <th scope="col" data-rop-select="" className={selectHeaderCellClass}>
              <div className={selectBoxClass}>
                <Checkbox
                  checked={selection.allResultsState}
                  disabled={table.resultCount === 0}
                  aria-label={labels.selectAllResults}
                  onCheckedChange={selection.toggleAllResults}
                />
              </div>
            </th>
          ) : null}
          {columns.map((column) => {
            const align = column.align ?? 'start';
            const sortable = table.getSortButtonProps(column.id).onClick !== undefined;
            const sorted = table.sort?.columnId === column.id ? table.sort.direction : null;
            return (
              <th
                key={column.id}
                scope="col"
                {...table.getHeaderProps(column.id)}
                className={cn(headerCellClass, ALIGN_TEXT[align])}
              >
                {sortable ? (
                  <button {...table.getSortButtonProps(column.id)} className={cn(sortButtonClass, ALIGN_JUSTIFY[align])}>
                    <TruncatedText>{column.header}</TruncatedText>
                    <CapIconSlot>
                      <Icon size="xs" className={cn(sortIconClass, sorted === null && sortIconIdleClass, sorted === 'asc' && sortIconAscendingClass)}>
                        {internalIcons['chevron-down']}
                      </Icon>
                    </CapIconSlot>
                  </button>
                ) : (
                  <TruncatedText>{column.header}</TruncatedText>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
    </>
  );
}
