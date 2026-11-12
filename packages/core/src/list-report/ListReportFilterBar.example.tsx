import { useMemo } from 'react';
import { ListReportFilterBar, ListReportTable, useListReport, type ListReportColumn, type ListReportFilter } from '@formrail/core';

interface Invoice {
  id: string;
  customer: string;
  status: 'pending' | 'approved';
}

const invoices: Invoice[] = [
  { id: 'INV-0142', customer: 'Rossi Construction', status: 'pending' },
  { id: 'INV-0143', customer: 'Bianchi & Associates', status: 'approved' },
  { id: 'INV-0144', customer: 'Verdi Industrial Supplies', status: 'pending' },
];

const filters: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To approve', predicate: (row) => row.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (row) => row.status === 'approved' },
];

export function FilteredInvoices() {
  const columns = useMemo<ListReportColumn<Invoice>[]>(
    () => [
      { id: 'id', header: 'Number', accessor: (row) => row.id, width: 110 },
      { id: 'customer', header: 'Customer', accessor: (row) => row.customer, minWidth: 180 },
    ],
    [],
  );
  // One `table` drives both: the bar sets the filter and the search, the table shows the result.
  const table = useListReport({ rows: invoices, columns, getRowId: (row) => row.id, filters });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ListReportFilterBar table={table} />
      <ListReportTable table={table} aria-label="Invoices" />
    </div>
  );
}
