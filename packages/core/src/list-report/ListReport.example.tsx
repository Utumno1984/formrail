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
  return (
    <div style={{ height: 420 }}>
      <ListReport title="Invoices" table={table} actions={<Button variant="primary">New invoice</Button>} />
    </div>
  );
}
