import type { ReactNode } from 'react';
import { Button } from '../button/Button';
import { MessageStrip } from '../message-strip/MessageStrip';
import { cn } from '../utils/cn';
import {
  ALIGN_TEXT,
  bodyCellClass,
  fillerCellClass,
  ROW_PITCH_EXTRA_PX,
  skeletonBarClass,
  stateBoxClass,
  stateCellClass,
  stateStripClass,
} from './list-report-table-styles';
import type { ListReportColumn } from './types';

/** Texts of `ListReportTable` (all overridable; the defaults are in Italian). */
export interface ListReportTableLabels {
  /** Announced when the table starts loading. */
  loading: string;
  /** `status="ready"` and no rows at all. */
  empty: string;
  /** There are rows, but the current filters (or search) leave none visible. */
  noResults: string;
  /** Message of the error strip when `errorMessage` is not given; also its announcement. */
  error: string;
  /** Button of the error strip (when `onRetry` is given). */
  retry: string;
  /** Button of the "no results" state (when `onClearFilters` is given). */
  clearFilters: string;
  /** Announced when the data is back: the number of results. */
  resultCount: (count: number) => string;
}

export const DEFAULT_LABELS: ListReportTableLabels = {
  loading: 'Loading…',
  empty: 'No data',
  noResults: 'No results for the current filters',
  error: 'Unable to load data',
  retry: 'Retry',
  clearFilters: 'Clear filters',
  resultCount: (count) => (count === 1 ? '1 result' : `${count} results`),
};

export const DEFAULT_LOADING_ROW_COUNT = 5;

/** A non-negative whole number of rows (anything else counts as 0). */
export const wholeRows = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

// `height` (content box) of a single cell whose whole box, together with its own padding (2px) and
// `trailing` px of border, is as tall as n data rows (each `height + 2px + 1px`).
const rowsHeight = (n: number, trailing: number): string =>
  `calc((var(--rop-list-report-row-height) + ${ROW_PITCH_EXTRA_PX}px) * ${n} - ${2 + trailing}px)`;

export function SkeletonRows<Row>({ columns, count }: { columns: readonly ListReportColumn<Row>[]; count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <tr key={index} aria-hidden="true" data-rop-skeleton="">
      {columns.map((column) => (
        <td key={column.id} className={cn(bodyCellClass, ALIGN_TEXT[column.align ?? 'start'])}>
          <span className={skeletonBarClass} />
        </td>
      ))}
    </tr>
  ));
}

/** Blank space under fewer data rows than the minimum, so that the body never shrinks below it. */
export function Filler({ columnCount, rows }: { columnCount: number; rows: number }) {
  if (rows <= 0) return null;
  return (
    <tr aria-hidden="true" data-rop-filler="">
      <td colSpan={Math.max(1, columnCount)} className={fillerCellClass} style={{ height: rowsHeight(rows, 0) }} />
    </tr>
  );
}

/** One row with one cell across all the columns, at least `rows` tall, holding the state content. */
export function StateRow({ columnCount, rows, children }: { columnCount: number; rows: number; children: ReactNode }) {
  return (
    <tr data-rop-state="">
      <td colSpan={Math.max(1, columnCount)} className={stateCellClass} style={{ height: rowsHeight(rows, 1) }}>
        <div className={stateBoxClass} style={{ width: 'calc(var(--rop-list-report-view-width, 100%) - 2rem)' }}>
          {children}
        </div>
      </td>
    </tr>
  );
}

export function ErrorContent({
  message,
  retryLabel,
  onRetry,
}: {
  message: ReactNode;
  retryLabel: string;
  onRetry: (() => void) | undefined;
}) {
  // `live={false}`: the announcement is the job of the always-mounted region of the table (a strip
  // mounted already filled is not reliably read).
  return (
    <MessageStrip tone="error" live={false} className={stateStripClass}>
      {message}
      {onRetry ? (
        <div className="mt-2">
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      ) : null}
    </MessageStrip>
  );
}

export function NoResultsContent({
  message,
  clearLabel,
  onClearFilters,
}: {
  message: ReactNode;
  clearLabel: string;
  onClearFilters: (() => void) | undefined;
}) {
  return (
    <>
      <p className="m-0">{message}</p>
      {onClearFilters ? (
        <Button size="sm" onClick={onClearFilters}>
          {clearLabel}
        </Button>
      ) : null}
    </>
  );
}
