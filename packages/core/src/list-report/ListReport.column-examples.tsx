// Story-only: the frame shared by the six "Example: configured for ..." stories of `Floorplans/List Report`
// (ticket #627). It owns nothing about columns: each story builds its own `columns` (with the `cell` written
// as a consumer writes it) and passes them here, so the "Show code" of the story is where the configuration is.
// Not exported by the package.
import type { CSSProperties, ReactNode } from 'react';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter, ListReportSort } from './types';
import { useListReport } from './use-list-report';

const PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  fontFamily: 'system-ui, sans-serif',
};

export interface ColumnsReportProps<Row> {
  title: string;
  rows: readonly Row[];
  columns: readonly ListReportColumn<Row>[];
  getRowId: (row: Row) => string;
  defaultSort?: ListReportSort;
  onSortChange?: (sort: ListReportSort) => void;
  filters?: readonly ListReportFilter<Row>[];
  selectable?: boolean;
  /** Rendered above the report (the consumer's own controls, e.g. the optional-column checkboxes). */
  toolbar?: ReactNode;
}

/** A bounded-height page with one report, from one `useListReport` call. */
export function ColumnsReport<Row>({
  title,
  rows,
  columns,
  getRowId,
  defaultSort,
  onSortChange,
  filters,
  selectable,
  toolbar,
}: ColumnsReportProps<Row>) {
  const table = useListReport<Row>({ rows, columns, getRowId, defaultSort, onSortChange, filters, selectable });
  return (
    <div style={PAGE}>
      {toolbar}
      <div style={{ height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport title={title} table={table} />
      </div>
    </div>
  );
}
