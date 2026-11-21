// Story-only: the invoice list definition (pills, columns, labels, page frame) of the List Report showcase
// (`ListReportShowcase.stories.tsx`, #132). It lived in `showcase/` while the invoices' record-editing showcase
// shared it; #527 removed that one and moved this here (the story goes with the demo-data migration of #528).
// Not exported by the package.
import type { CSSProperties } from 'react';
import { formatEuro, type DemoInvoice } from '../internal/demo-invoices';
import type { ListReportColumn, ListReportFilter } from './types';
import { LIST_PAGE } from '../showcase/list-page';
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

/** The frame of a list page, the same as the record-editing shell's (`LIST_PAGE`, list-page.ts). */
export const PAGE: CSSProperties = LIST_PAGE;
