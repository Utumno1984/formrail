// Dedicated regression guard for #230 (splitting ListReportTable into ListReportTableShell /
// ListReportTableHead / ListReportTableRow, so @formrail/pro can reuse them): the
// snapshot below was written against the code BEFORE that refactor and must stay byte-for-byte
// identical after it. A diff here means the DOM changed, which the ticket forbids.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReportTable, type ListReportTableStatus } from './ListReportTable';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Invoice {
  id: string;
  number: string;
  customer: string;
  amount: number;
}

const ROWS: Invoice[] = [
  { id: 'a', number: 'INV-1', customer: 'Rossi', amount: 10 },
  { id: 'b', number: 'INV-2', customer: 'Bianchi', amount: 2 },
  { id: 'c', number: 'INV-3', customer: 'Verdi', amount: 30 },
];

const COLUMNS: ListReportColumn<Invoice>[] = [
  { id: 'number', header: 'Number', width: 90, accessor: (r) => r.number },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customer },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, align: 'end', width: '20%' },
];

const FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'None', predicate: () => false },
];

interface HostProps {
  selectable?: boolean;
  rows?: Invoice[];
  filter?: string;
  selectedIds?: ReadonlySet<string>;
  status?: ListReportTableStatus;
}

function Host({ selectable, rows = ROWS, filter, status, selectedIds }: HostProps) {
  const table = useListReport<Invoice>({
    rows,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    filter,
    selectable,
    selectedIds,
  });
  return <ListReportTable table={table} aria-label="Invoices" status={status} />;
}

describe('ListReportTable DOM identity (#230: the packaging refactor must not change the DOM)', () => {
  it.each<[string, HostProps]>([
    ['data, not selectable', {}],
    ['loading, not selectable', { rows: [], status: 'loading' }],
    ['empty, not selectable', { rows: [] }],
    ['noResults, not selectable', { filter: 'none' }],
    ['error, not selectable', { status: 'error' }],
    ['data, selectable, no selection', { selectable: true }],
    ['data, selectable, partial selection', { selectable: true, selectedIds: new Set(['b']) }],
    ['loading, selectable', { selectable: true, rows: [], status: 'loading' }],
    ['empty, selectable', { selectable: true, rows: [] }],
    ['noResults, selectable', { selectable: true, filter: 'none' }],
    ['error, selectable', { selectable: true, status: 'error' }],
  ])('%s', (_label, props) => {
    const { container } = render(<Host {...props} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
