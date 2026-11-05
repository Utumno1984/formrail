import type { ReactNode } from 'react';
import { TruncatedText } from '../truncated-text/TruncatedText';
import { nodeWrapperClass } from './list-report-table-styles';
import type { ListReportColumn } from './types';

export type CellValue = { kind: 'empty' } | { kind: 'text'; text: string } | { kind: 'node'; node: ReactNode };

export function cellValue<Row>(column: ListReportColumn<Row>, row: Row): CellValue {
  if (column.cell) {
    const content = column.cell(row);
    if (content === null || content === undefined || typeof content === 'boolean') return { kind: 'empty' };
    if (typeof content === 'string' || typeof content === 'number') return { kind: 'text', text: String(content) };
    return { kind: 'node', node: content };
  }
  if (!column.accessor) return { kind: 'empty' };
  const value = column.accessor(row);
  return value === null || value === undefined ? { kind: 'empty' } : { kind: 'text', text: String(value) };
}

export interface RenderCellOptions {
  /**
   * Truncates the cell regardless of `column.truncate`. A virtualized table (`@react-object-page/pro`)
   * forces this when its fixed row height cannot grow with a wrapped `truncate: false` column; it
   * warns once per column in development instead of silently changing the layout contract. Default
   * behaviour (no options, or `forceTruncate: false`) is exactly `column.truncate !== false`.
   */
  forceTruncate?: boolean;
}

export function renderCell<Row>(column: ListReportColumn<Row>, row: Row, options?: RenderCellOptions): ReactNode {
  const value = cellValue(column, row);
  if (value.kind === 'empty') return null;
  if (value.kind === 'node') return <div className={nodeWrapperClass}>{value.node}</div>;
  const truncate = options?.forceTruncate === true || column.truncate !== false;
  return truncate ? <TruncatedText>{value.text}</TruncatedText> : <div className={nodeWrapperClass}>{value.text}</div>;
}
