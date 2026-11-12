import { useMemo, useRef } from 'react';
import { Button, useListReport, type ListReportColumn, type ListReportFilter } from '@formrail/core';
import { VirtualListReport, type VirtualListReportTableHandle } from '@formrail/pro';

interface Invoice {
  id: string;
  number: string;
  supplier: string;
  amount: number;
  status: 'pending' | 'approved';
}

const suppliers = ['Rossi Construction', 'Bianchi & Associates', 'Verdi Industrial Supplies', 'Gialli Transport'];

// 10,000 invoices: only the rows around the visible ones are in the DOM.
const invoices: Invoice[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: `inv-${index + 1}`,
  number: `INV-${String(index + 1).padStart(5, '0')}`,
  supplier: suppliers[index % suppliers.length] ?? '',
  amount: ((index * 37) % 5000) + 0.5,
  status: index % 3 === 0 ? 'pending' : 'approved',
}));

const filters: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To approve', predicate: (row) => row.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (row) => row.status === 'approved' },
];

export function InvoiceArchive() {
  const columns = useMemo<ListReportColumn<Invoice>[]>(
    () => [
      { id: 'number', header: 'Number', accessor: (row) => row.number, width: 130 },
      { id: 'supplier', header: 'Supplier', accessor: (row) => row.supplier, minWidth: 200 },
      { id: 'amount', header: 'Amount', accessor: (row) => row.amount, cell: (row) => `€ ${row.amount.toFixed(2)}`, align: 'end', width: 130 },
      { id: 'status', header: 'Status', accessor: (row) => (row.status === 'pending' ? 'To approve' : 'Approved'), width: 130 },
    ],
    [],
  );
  // The same state hook as the Free `ListReport`: filters, search, sorting and selection work on all the rows.
  const table = useListReport({ rows: invoices, columns, getRowId: (row) => row.id, filters, selectable: true });
  // Scrolls to a row by id, also when it is far from the mounted ones.
  const handle = useRef<VirtualListReportTableHandle>(null);
  const last = invoices[invoices.length - 1];

  // A parent with a bounded height: the table scrolls, not the page. Shift-click selects a range of rows.
  return (
    <div style={{ height: 480 }}>
      <VirtualListReport
        title="Invoices"
        table={table}
        handleRef={handle}
        filtersLabel="Status"
        searchLabel="Search invoices"
        actions={
          last && (
            <Button variant="secondary" onClick={() => handle.current?.scrollToRowId(last.id, { align: 'center' })}>
              Go to {last.number}
            </Button>
          )
        }
      />
    </div>
  );
}
