// Internal fixture for `useListReport`: a raw `<table>`, no style. Inline neutral rows built on purpose for the sort edge
// cases (empty values, a tie between "Café" and "Cafe", equal amounts): `makeRecords` has none of these by design. Not exported from the package
// and never to be re-exported from it.
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useListReport } from '../list-report/use-list-report';
import type { ListReportColumn, ListReportFilter, ListReportSort } from '../list-report/types';

interface Item {
  id: string;
  name: string | null;
  amount: number | null;
  date: Date | null;
}

const ITEMS: Item[] = [
  { id: 'i1', name: 'Ember', amount: 10, date: new Date('2025-03-10') },
  { id: 'i2', name: 'alder', amount: 2, date: new Date('2025-01-05') },
  { id: 'i3', name: 'Fjord', amount: null, date: new Date('2025-07-21') },
  { id: 'i4', name: 'Café', amount: 100, date: null },
  { id: 'i5', name: 'Ember', amount: 2, date: new Date('2024-11-30') },
  { id: 'i6', name: null, amount: 33, date: new Date('2025-05-02') },
  { id: 'i7', name: 'Cafe', amount: 10, date: new Date('2025-02-14') },
  { id: 'i8', name: 'Delta', amount: 1, date: new Date('2025-09-09') },
];

const COLUMNS: ListReportColumn<Item>[] = [
  { id: 'id', header: 'No.' },
  { id: 'name', header: 'Name', accessor: (r) => r.name },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount },
  { id: 'date', header: 'Date', accessor: (r) => r.date, firstSortDirection: 'desc' },
];

const FILTERS: ListReportFilter<Item>[] = [
  { id: 'all', label: 'All' },
  { id: 'large', label: 'Large', predicate: (r) => r.amount !== null && r.amount >= 10 },
  { id: 'dated', label: 'With date', predicate: (r) => r.date !== null },
];

const fmt = (row: Item, id: string): string => {
  const value = row[id as keyof Item];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value === null ? '' : String(value);
};

interface DemoArgs {
  controlled: boolean;
  onSortChange: (sort: ListReportSort) => void;
}

function ListReportDemo({ controlled, onSortChange }: DemoArgs) {
  const [sort, setSort] = useState<ListReportSort>(null);
  const [log, setLog] = useState<string[]>([]);
  // Controlled mode also controls the committed search query (the external button sets it).
  const [query, setQuery] = useState('');
  const report = useListReport<Item>({
    rows: ITEMS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    searchQuery: controlled ? query : undefined,
    // Controlled story: only the Commit button commits, so the e2e does not race a timer.
    searchCommitDelay: controlled ? null : undefined,
    onSearchQueryChange: (next) => {
      if (controlled) setQuery(next);
      setLog((entries) => [...entries, `search:${next}`]);
    },
    sort: controlled ? sort : undefined,
    onSortChange: (next) => {
      if (controlled) setSort(next);
      setLog((entries) => [...entries, JSON.stringify(next)]);
      onSortChange(next);
    },
    locale: 'it',
  });

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'grid', gap: 8, justifyItems: 'start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          aria-label="Search"
          value={report.searchDraft}
          onChange={(e) => report.setSearchDraft(e.target.value)}
        />
        <button type="button" onClick={report.commitSearch}>
          Commit
        </button>
        {report.filters.map((f) => (
          <button key={f.id} type="button" aria-pressed={report.filter === f.id} onClick={() => report.setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <button type="button" onClick={report.clearFilters}>
          Reset
        </button>
        {controlled && (
          <button type="button" onClick={() => setQuery('alder')}>
            Set search: alder
          </button>
        )}
      </div>
      <p data-testid="counts" style={{ margin: 0 }}>
        {report.resultCount}/{report.totalCount}
      </p>
      <table>
        <thead>
          <tr>
            {report.columns.map((column) => (
              <th key={column.id} {...report.getHeaderProps(column.id)}>
                {column.sortable === false || (!column.accessor && !column.compare) ? (
                  column.header
                ) : (
                  <button {...report.getSortButtonProps(column.id)}>{column.header}</button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.id}>
              {report.columns.map((column) => (
                <td key={column.id}>{fmt(row, column.id)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {controlled && (
        <button type="button" onClick={() => setSort({ columnId: 'name', direction: 'asc' })}>
          Sort by Name
        </button>
      )}
      <p data-testid="sort-state" style={{ margin: 0 }}>
        {report.sort ? `${report.sort.columnId} ${report.sort.direction}` : 'none'}
      </p>
      <ol data-testid="log" aria-label="onSortChange log">
        {log.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ol>
    </div>
  );
}

const meta: Meta<DemoArgs> = {
  title: 'Internal/UseListReportFixture',
  // Test fixture / state matrix, not a documented component: no Docs page; `internal`: hidden from the public sidebar (#296).
  tags: ['!autodocs', 'internal'],
  parameters: { layout: 'padded' },
  argTypes: { controlled: { control: 'boolean' }, onSortChange: { control: false } },
  args: { controlled: false, onSortChange: fn() },
  render: (args) => <ListReportDemo {...args} />,
};

export default meta;
type Story = StoryObj<DemoArgs>;

/** Uncontrolled: the hook owns the sort state. No play function: the e2e tests drive it. */
export const Uncontrolled: Story = {};

/** Controlled by the fixture; the external button changes `sort` without calling `onSortChange`. */
export const Controlled: Story = { args: { controlled: true } };
