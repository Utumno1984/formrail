import { useMemo } from 'react';
import { Button, ListReport, StatusBadge, useListReport, type ListReportColumn, type ListReportFilter } from '@formrail/core';

interface Invoice {
  id: string;
  customer: string;
  amount: number;
  status: 'pending' | 'approved';
}

const invoices: Invoice[] = [
  { id: 'INV-0142', customer: 'Rossi Construction', amount: 1250.5, status: 'pending' },
  { id: 'INV-0143', customer: 'Bianchi & Associates', amount: 380, status: 'approved' },
  { id: 'INV-0144', customer: 'Verdi Industrial Supplies', amount: 9200, status: 'pending' },
  { id: 'INV-0145', customer: 'Gialli Transport', amount: 74.9, status: 'approved' },
  { id: 'INV-0146', customer: 'Neri Logistics', amount: 2310, status: 'pending' },
  { id: 'INV-0147', customer: 'Russo Electrical', amount: 645.25, status: 'approved' },
  { id: 'INV-0148', customer: 'Ferrari Office Supplies', amount: 118.4, status: 'pending' },
  { id: 'INV-0149', customer: 'Esposito Catering', amount: 905, status: 'approved' },
  { id: 'INV-0150', customer: 'Romano Packaging', amount: 3480.75, status: 'pending' },
  { id: 'INV-0151', customer: 'Colombo Printing', amount: 56.2, status: 'approved' },
];

const filters: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To approve', predicate: (row) => row.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (row) => row.status === 'approved' },
];

export function InvoiceList() {
  const columns = useMemo<ListReportColumn<Invoice>[]>(
    () => [
      { id: 'id', header: 'Number', accessor: (row) => row.id, width: 110 },
      { id: 'customer', header: 'Customer', accessor: (row) => row.customer, minWidth: 180 },
      { id: 'amount', header: 'Amount', accessor: (row) => row.amount, cell: (row) => `€ ${row.amount.toFixed(2)}`, align: 'end', width: 120 },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        cell: (row) => <StatusBadge tone={row.status === 'pending' ? 'warning' : 'success'}>{row.status === 'pending' ? 'To approve' : 'Approved'}</StatusBadge>,
        width: 140,
      },
    ],
    [],
  );
  const table = useListReport({ rows: invoices, columns, getRowId: (row) => row.id, filters });

  // The floorplan (title, actions, filter bar, table) fills a parent with a bounded height: the page itself
  // never scrolls, the table does. In a flex or grid layout, give its cell `min-height: 0`.
  // The height follows the viewport (at least 20rem, at most 40rem, always 4rem short of the viewport so the page
  // can still be scrolled by a touch that starts outside the example). `maxHeight` repeats it in `dvh`, which
  // follows a phone's address bar; a browser without `dvh` drops that line and keeps the `vh` height.
  return (
    <div style={{ height: 'clamp(20rem, calc(100vh - 4rem), 40rem)', maxHeight: 'clamp(20rem, calc(100dvh - 4rem), 40rem)' }}>
      <ListReport title="Invoices" table={table} actions={<Button variant="primary">New invoice</Button>} />
    </div>
  );
}
