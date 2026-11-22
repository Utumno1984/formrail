import { useMemo } from 'react';
import {
  ListReportFilterBar,
  ListReportTable,
  useListReport,
  type ListReportColumn,
  type ListReportFilter,
} from '@formrail/core';

interface Row {
  code: string;
  name: string;
  status: 'active' | 'pending' | 'on-hold';
}

const rows: Row[] = [
  { code: 'REC-0001', name: 'Amber Plan', status: 'active' },
  { code: 'REC-0002', name: 'Café Report', status: 'pending' },
  { code: 'REC-0003', name: 'Delta Summary', status: 'on-hold' },
];

const filters: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active', predicate: (row) => row.status === 'active' },
  { id: 'pending', label: 'Pending', predicate: (row) => row.status === 'pending' },
  { id: 'on-hold', label: 'On hold', predicate: (row) => row.status === 'on-hold' },
];

export function FilteredRecords() {
  const columns = useMemo<ListReportColumn<Row>[]>(
    () => [
      { id: 'code', header: 'Code', accessor: (row) => row.code, width: 110 },
      { id: 'name', header: 'Name', accessor: (row) => row.name, minWidth: 180 },
    ],
    [],
  );
  // One `table` drives both: the bar sets the filter and the search, the table shows the result.
  const table = useListReport({ rows, columns, getRowId: (row) => row.code, filters });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ListReportFilterBar table={table} />
      <ListReportTable table={table} aria-label="Records" />
    </div>
  );
}
