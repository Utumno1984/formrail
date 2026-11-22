// Story-only: the neutral record list definition (filter pills, columns, labels, page frame) shared by the List
// Report stories (`ListReport.stories.tsx`, `ListReportCancelOverlay.stories.tsx`). The rows are `makeRecords`
// of the demo universe (`internal/demo-data`): generic "records" with a code, a name, a status, an owner, an
// amount and a due date, no business domain. Not exported by the package.
import type { CSSProperties } from 'react';
import { RECORD_STATUS_LABEL, formatDate, formatMoney, type DemoRecord } from '../internal/demo-data';
import type { ListReportColumn, ListReportFilter, ListReportSortDirection } from './types';
import { LIST_PAGE } from '../showcase/list-page';

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

/** One pill per status that matters, in the order of the legend: `pending` is the one most stories pick. */
export const FILTERS: ListReportFilter<DemoRecord>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: RECORD_STATUS_LABEL.pending, predicate: (r) => r.status === 'pending' },
  { id: 'active', label: RECORD_STATUS_LABEL.active, predicate: (r) => r.status === 'active' },
  { id: 'on-hold', label: RECORD_STATUS_LABEL['on-hold'], predicate: (r) => r.status === 'on-hold' },
];

/** The text the stories and the e2e type in the search box: a word of `makeRecords` names, searched by name. */
export const SEARCH_WORD = 'Plan';

/**
 * The columns of the list. "Amount" sorts on the raw amount in the currency of each record (EUR, USD, GBP or
 * JPY: the sort does not convert), and shows it formatted. "Due date" is empty for about one record in five.
 */
export function recordColumns(
  options: { dueFirstDirection?: ListReportSortDirection; amountFirstDirection?: ListReportSortDirection } = {},
): ListReportColumn<DemoRecord>[] {
  return [
    { id: 'code', header: 'Code', accessor: (r) => r.code, width: 150 },
    { id: 'name', header: 'Name', accessor: (r) => r.name, minWidth: 200 },
    { id: 'status', header: 'Status', accessor: (r) => RECORD_STATUS_LABEL[r.status], searchable: false, width: 130 },
    { id: 'owner', header: 'Owner', accessor: (r) => r.ownerName, minWidth: 170 },
    {
      id: 'amount',
      header: 'Amount',
      accessor: (r) => r.amountMinor,
      cell: (r) => formatMoney(r.amountMinor, r.currency),
      align: 'end',
      firstSortDirection: options.amountFirstDirection,
      searchable: false,
      width: 140,
    },
    {
      id: 'due',
      header: 'Due date',
      accessor: (r) => r.dueOn ?? '',
      cell: (r) => (r.dueOn ? formatDate(r.dueOn) : '—'),
      firstSortDirection: options.dueFirstDirection,
      searchable: false,
      width: 140,
    },
  ];
}

export const COLUMNS = recordColumns({ amountFirstDirection: 'desc' });
export const SORTABLE = COLUMNS.map((c) => c.id);

/** The frame of a list page, the same as the record-editing shell's (`LIST_PAGE`, list-page.ts). */
export const PAGE: CSSProperties = LIST_PAGE;
