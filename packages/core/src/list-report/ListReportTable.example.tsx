import { useMemo } from 'react';
import { ListReportTable, useListReport, type ListReportColumn } from '@formrail/core';

interface Row {
  code: string;
  name: string;
  amount: number;
  date: string;
}

const rows: Row[] = [
  { code: 'REC-0001', name: 'Amber Plan', amount: 1250.5, date: '2026-03-02' },
  { code: 'REC-0002', name: 'Café Report', amount: 380, date: '2026-03-04' },
  { code: 'REC-0003', name: 'Delta Summary', amount: 9200, date: '2026-03-09' },
  { code: 'REC-0004', name: 'Quartz Draft', amount: 74.9, date: '2026-03-11' },
];

export function RecordTable() {
  // Memoized: a new `columns` array on every render would recompute the rows each time.
  const columns = useMemo<ListReportColumn<Row>[]>(
    () => [
      { id: 'code', header: 'Code', accessor: (row) => row.code, width: 110 },
      { id: 'name', header: 'Name', accessor: (row) => row.name, minWidth: 180 },
      {
        id: 'amount',
        header: 'Amount',
        accessor: (row) => row.amount,
        cell: (row) => `€ ${row.amount.toFixed(2)}`,
        align: 'end',
        width: 120,
      },
      { id: 'date', header: 'Date', accessor: (row) => row.date, firstSortDirection: 'desc', width: 120 },
    ],
    [],
  );

  // The hook owns sorting and filtering; the table renders what it returns.
  const table = useListReport({ rows, columns, getRowId: (row) => row.code });

  // The table fills its parent: a flex column with a bounded height. `minHeight: 0` lets the table shrink
  // below its content, so it scrolls inside its own container instead of growing the page.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 320 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ListReportTable table={table} aria-label="Records" />
      </div>
    </div>
  );
}
