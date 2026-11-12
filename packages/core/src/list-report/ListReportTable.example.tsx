import { useMemo } from 'react';
import { ListReportTable, useListReport, type ListReportColumn } from '@formrail/core';

interface Invoice {
  id: string;
  customer: string;
  amount: number;
  date: string;
}

const invoices: Invoice[] = [
  { id: 'INV-0142', customer: 'Rossi Construction', amount: 1250.5, date: '2026-03-02' },
  { id: 'INV-0143', customer: 'Bianchi & Associates', amount: 380, date: '2026-03-04' },
  { id: 'INV-0144', customer: 'Verdi Industrial Supplies', amount: 9200, date: '2026-03-09' },
  { id: 'INV-0145', customer: 'Gialli Transport', amount: 74.9, date: '2026-03-11' },
];

export function InvoiceTable() {
  // Memoized: a new `columns` array on every render would recompute the rows each time.
  const columns = useMemo<ListReportColumn<Invoice>[]>(
    () => [
      { id: 'id', header: 'Number', accessor: (row) => row.id, width: 110 },
      { id: 'customer', header: 'Customer', accessor: (row) => row.customer, minWidth: 180 },
      { id: 'amount', header: 'Amount', accessor: (row) => row.amount, cell: (row) => `€ ${row.amount.toFixed(2)}`, align: 'end', width: 120 },
      { id: 'date', header: 'Date', accessor: (row) => row.date, firstSortDirection: 'desc', width: 120 },
    ],
    [],
  );

  // The hook owns sorting and filtering; the table renders what it returns.
  const table = useListReport({ rows: invoices, columns, getRowId: (row) => row.id });

  // The table fills its parent: a flex column with a bounded height. `minHeight: 0` lets the table shrink
  // below its content, so it scrolls inside its own container instead of growing the page.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 320 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ListReportTable table={table} aria-label="Invoices" />
      </div>
    </div>
  );
}
