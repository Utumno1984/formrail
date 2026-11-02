// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';
// A static import: if the module touched `window` while loading, this file would fail before any test.
import { useListReportUrlState } from './use-list-report-url-state';

interface Row {
  id: string;
  amount: number;
  open: boolean;
}
const ROWS: Row[] = [
  { id: 'a', amount: 10, open: true },
  { id: 'b', amount: 2, open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'amount', header: 'Amount', accessor: (r) => r.amount }];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
];

function Page({ defaults }: { defaults: boolean }) {
  const url = useListReportUrlState({
    filters: FILTERS,
    sortableColumnIds: ['amount'],
    prefix: 'inv',
    ...(defaults ? { defaultFilter: 'open', defaultSearchQuery: '1', defaultSort: { columnId: 'amount', direction: 'desc' } as const } : {}),
  });
  const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, ...url });
  const sort = table.sort ? `${table.sort.columnId}.${table.sort.direction}` : 'none';
  return <p>{`${table.filter}|${table.searchQuery}|${sort}|${table.rows.map((r) => r.id).join(',')}`}</p>;
}

describe('useListReportUrlState on the server (node environment, no DOM globals)', () => {
  it('does not throw and returns the defaults, with no warning', () => {
    expect(typeof window).toBe('undefined');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(renderToString(<Page defaults={false} />)).toContain('all||none|a,b');
    expect(renderToString(<Page defaults />)).toContain('open|1|amount.desc|a');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
