// Story-only: the invoice list definition (pills, columns, labels, page frame) shared by the List Report
// showcase (#132) and the list -> record showcase (#150), so the second one reuses the first instead of
// copying it. Not exported by the package.
import type { CSSProperties } from 'react';
import { formatEuro, type DemoInvoice } from '../internal/demo-invoices';
import type { ListReportColumn, ListReportFilter } from '../list-report/types';
import { STATUS_LABEL } from './showcase-data';

export const LABELS = {
  loading: 'Loading…',
  empty: 'No data',
  noResults: 'No results for the current filters',
  error: 'Could not load the data',
  retry: 'Retry',
  clearFilters: 'Clear filters',
  resultCount: (count: number) => (count === 1 ? '1 result' : `${count} results`),
  count: (resultCount: number, totalCount: number) =>
    resultCount === totalCount ? `(${resultCount})` : `(${resultCount} of ${totalCount})`,
};

export const FILTERS: ListReportFilter<DemoInvoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Rejected', predicate: (r) => r.status === 'rejected' },
];

export const COLUMNS: ListReportColumn<DemoInvoice>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number, width: 150 },
  { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier, minWidth: 200 },
  { id: 'date', header: 'Date', accessor: (r) => r.date, width: 130 },
  {
    id: 'amount',
    header: 'Amount',
    accessor: (r) => r.amount,
    cell: (r) => formatEuro(r.amount),
    align: 'end',
    firstSortDirection: 'desc',
    searchable: false,
    width: 140,
  },
  { id: 'status', header: 'Status', accessor: (r) => STATUS_LABEL[r.status], searchable: false, width: 150 },
];
export const SORTABLE = COLUMNS.map((c) => c.id);

export const PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  fontFamily: 'system-ui, sans-serif',
  height: 'var(--rop-demo-viewport-height, 100dvh)',
  display: 'flex',
  flexDirection: 'column',
};
