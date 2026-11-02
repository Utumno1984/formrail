import { useMemo } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation, useNavigate, useSearchParams } from 'react-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';
import { useListReportUrlState, type ListReportUrlAdapter } from './use-list-report-url-state';

interface Row {
  id: string;
  name: string;
  open: boolean;
}
const ROWS: Row[] = [
  { id: 'r1', name: 'Rossi', open: true },
  { id: 'r2', name: 'Verdi', open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
  { id: 'closed', label: 'Closed', predicate: (r) => !r.open },
];

// --- The documented recipe (keep in sync with the List Report docs) -------------------------------
function useReactRouterAdapter(): ListReportUrlAdapter {
  const [searchParams] = useSearchParams();
  const { hash, state } = useLocation();
  const navigate = useNavigate();
  // `useSearchParams` re-renders on every navigation, so the adapter is rebuilt with the new
  // location; `subscribe` is a no-op because the re-render is the notification. `read()` may lag
  // behind `write()` until that render: the hook copes. The hash and `state` are carried over.
  return useMemo(
    () => ({
      read: () => new URLSearchParams(searchParams),
      write: (next, mode) => {
        void navigate({ search: next.toString(), hash }, { replace: mode === 'replace', state });
      },
      subscribe: () => () => undefined,
    }),
    [searchParams, hash, state, navigate],
  );
}
// ---------------------------------------------------------------------------------------------------

const onFilterChange = vi.fn();
function Page() {
  const adapter = useReactRouterAdapter();
  const url = useListReportUrlState({ filters: FILTERS, adapter, history: 'push' });
  const table = useListReport<Row>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    ...url,
    onFilterChange: (id) => {
      url.onFilterChange(id);
      onFilterChange(id);
    },
  });
  return <ListReport title="Invoices" table={table} searchLabel="Search" filtersLabel="Filters" />;
}
const pill = (name: string) => within(screen.getByRole('radiogroup', { name: 'Filters' })).getByRole('radio', { name });

afterEach(() => {
  cleanup();
  onFilterChange.mockReset();
});

describe('useListReportUrlState: React Router recipe', () => {
  it('writes through the router and follows router.navigate(-1) with no callback', async () => {
    const router = createMemoryRouter([{ path: '/', element: <Page /> }], { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(pill('Open'));
    expect(router.state.location.search).toBe('?filter=open');
    await userEvent.click(pill('Closed'));
    expect(router.state.location.search).toBe('?filter=closed');
    expect(onFilterChange).toHaveBeenCalledTimes(2);
    onFilterChange.mockClear();

    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe('?filter=open');
    expect(pill('Open')).toBeChecked();
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('keeps the hash, and "Clear filters" resets pill and search in one go (two writes in one gesture)', async () => {
    const router = createMemoryRouter([{ path: '/', element: <Page /> }], {
      initialEntries: ['/?filter=open&q=zzz&page=2#section'],
    });
    render(<RouterProvider router={router} />);
    expect(pill('Open')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
    expect(router.state.location.search).toBe('?page=2');
    expect(router.state.location.hash).toBe('#section');
    expect(pill('All')).toBeChecked();
  });
});

describe('core package.json', () => {
  it('has no router among its dependencies or peerDependencies', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const runtime = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
    expect(runtime.filter((name) => /router/i.test(name))).toEqual([]);
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      '@radix-ui/react-dialog',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-tooltip',
      'clsx',
      'tailwind-merge',
    ]);
    expect(Object.keys(pkg.peerDependencies ?? {}).sort()).toEqual(['react', 'react-dom']);
  });
});
