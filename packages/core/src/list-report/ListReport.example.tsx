import { useMemo } from 'react';
import {
  Button,
  ListReport,
  StatusBadge,
  useListReport,
  type ListReportColumn,
  type ListReportFilter,
} from '@formrail/core';

interface RecordRow {
  code: string;
  name: string;
  owner: string;
  amount: number;
  status: 'pending' | 'active';
}

const records: RecordRow[] = [
  { code: 'REC-00001', name: 'Café Report', owner: 'Ilaria Pellegrini', amount: 1250.5, status: 'pending' },
  { code: 'REC-00002', name: 'Indigo Plan', owner: 'James Brooks', amount: 380, status: 'active' },
  { code: 'REC-00003', name: 'Crème Review', owner: 'James Foster', amount: 9200, status: 'pending' },
  { code: 'REC-00004', name: 'Summit Checklist', owner: 'Élodie Martin', amount: 74.9, status: 'active' },
  { code: 'REC-00005', name: 'Tundra Plan', owner: 'Ayaka Sasaki', amount: 2310, status: 'pending' },
  { code: 'REC-00006', name: 'Amber Draft', owner: 'Charlotte Sullivan', amount: 645.25, status: 'active' },
  { code: 'REC-00007', name: 'Fjord Summary', owner: 'Ilaria Pellegrini', amount: 118.4, status: 'pending' },
  { code: 'REC-00008', name: 'Orchid Brief', owner: 'James Brooks', amount: 905, status: 'active' },
  { code: 'REC-00009', name: 'Ridge Entry', owner: 'Ayaka Sasaki', amount: 56.2, status: 'pending' },
  { code: 'REC-00010', name: 'Pebble Update', owner: 'Élodie Martin', amount: 3480.75, status: 'active' },
];

const filters: ListReportFilter<RecordRow>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending', predicate: (row) => row.status === 'pending' },
  { id: 'active', label: 'Active', predicate: (row) => row.status === 'active' },
];

export function RecordList() {
  const columns = useMemo<ListReportColumn<RecordRow>[]>(
    () => [
      { id: 'code', header: 'Code', accessor: (row) => row.code, width: 130 },
      { id: 'name', header: 'Name', accessor: (row) => row.name, minWidth: 180 },
      { id: 'owner', header: 'Owner', accessor: (row) => row.owner, minWidth: 160 },
      {
        id: 'amount',
        header: 'Amount',
        accessor: (row) => row.amount,
        cell: (row) => `€ ${row.amount.toFixed(2)}`,
        align: 'end',
        width: 120,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        cell: (row) => (
          <StatusBadge tone={row.status === 'pending' ? 'info' : 'success'}>
            {row.status === 'pending' ? 'Pending' : 'Active'}
          </StatusBadge>
        ),
        width: 140,
      },
    ],
    [],
  );
  const table = useListReport({ rows: records, columns, getRowId: (row) => row.code, filters });

  // The floorplan (title, actions, filter bar, table) fills a parent with a bounded height: the page itself
  // never scrolls, the table does. In a flex or grid layout, give its cell `min-height: 0`.
  // The height follows the viewport (at least 20rem, at most 40rem, always 4rem short of the viewport
  // so the page can still be scrolled by a touch that starts outside the example). `maxHeight` repeats it
  // in `dvh`, which follows a phone's address bar; a browser without `dvh` drops that line and keeps the
  // `vh` height.
  return (
    <div
      style={{
        height: 'clamp(20rem, calc(100vh - 4rem), 40rem)',
        maxHeight: 'clamp(20rem, calc(100dvh - 4rem), 40rem)',
      }}
    >
      <ListReport title="Records" table={table} actions={<Button variant="primary">New record</Button>} />
    </div>
  );
}
