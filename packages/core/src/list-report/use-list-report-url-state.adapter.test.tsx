import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUrlAdapter } from '../internal/memory-url-adapter';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter, ListReportSort } from './types';
import { useListReport } from './use-list-report';
import { useListReportUrlState, type ListReportUrlAdapter } from './use-list-report-url-state';

interface Row {
  id: string;
  name: string;
  amount: number;
  open: boolean;
}
const ROWS: Row[] = [
  { id: 'r1', name: 'Rossi', amount: 30, open: true },
  { id: 'r2', name: 'Bianchi', amount: 10, open: true },
  { id: 'r3', name: 'Verdi', amount: 20, open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, searchable: false },
];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
  { id: 'closed', label: 'Closed', predicate: (r) => !r.open },
];

interface HostProps {
  adapter: ListReportUrlAdapter | (() => ListReportUrlAdapter);
  history?: 'replace' | 'push';
  onFilterChange?: (id: string) => void;
  onSearchQueryChange?: (q: string) => void;
  onSortChange?: (s: ListReportSort) => void;
  searchCommitDelay?: number | null;
}
function Host({ adapter, history, onFilterChange, onSearchQueryChange, onSortChange, searchCommitDelay = null }: HostProps) {
  // A function builds a new object on every render (the inline literal case).
  const url = useListReportUrlState({
    filters: FILTERS,
    sortableColumnIds: ['name', 'amount'],
    adapter: typeof adapter === 'function' ? adapter() : adapter,
    history,
  });
  const table = useListReport<Row>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    searchCommitDelay,
    ...url,
    onFilterChange: (id) => {
      url.onFilterChange(id);
      onFilterChange?.(id);
    },
    onSearchQueryChange: (q) => {
      url.onSearchQueryChange(q);
      onSearchQueryChange?.(q);
    },
    onSortChange: (s) => {
      url.onSortChange(s);
      onSortChange?.(s);
    },
  });
  return <ListReport title="Invoices" table={table} searchLabel="Search" filtersLabel="Filters" />;
}
const pill = (name: string) => within(screen.getByRole('radiogroup', { name: 'Filters' })).getByRole('radio', { name });
const searchBox = () => screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('useListReportUrlState with an adapter', () => {
  it('reads only from the adapter and never touches window.history or popstate', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    const add = vi.spyOn(window, 'addEventListener');
    window.history.replaceState(null, '', '/?filter=closed');
    replace.mockClear();
    const adapter = createMemoryUrlAdapter({ initial: '?filter=open' });
    render(<Host adapter={adapter} />);
    expect(pill('Open')).toBeChecked(); // from the adapter, not from window.location
    fireEvent.click(pill('Closed'));
    expect(adapter.read().get('filter')).toBe('closed');
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(add.mock.calls.filter(([type]) => type === 'popstate')).toHaveLength(0);
    expect(window.location.search).toBe('?filter=closed'); // untouched since the setup
  });

  it.each([
    ['replace (default)', undefined, 'replace'],
    ['replace', 'replace', 'replace'],
    ['push', 'push', 'push'],
  ] as const)('a gesture calls write once with the history option (%s), keeping other parameters', (_n, history, mode) => {
    const write = vi.fn();
    const adapter = createMemoryUrlAdapter({ initial: '?utm=1&inv.filter=x', onWrite: write });
    render(<Host adapter={adapter} history={history} />);
    fireEvent.click(pill('Open'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('utm=1&inv.filter=x&filter=open', mode);
  });

  it('a synchronous echo of its own write does not repeat callbacks nor loop', () => {
    const write = vi.fn();
    const adapter = createMemoryUrlAdapter({ notify: 'sync', onWrite: write });
    const onFilterChange = vi.fn();
    const onSortChange = vi.fn();
    render(
      <StrictMode>
        <Host adapter={adapter} onFilterChange={onFilterChange} onSortChange={onSortChange} />
      </StrictMode>,
    );
    fireEvent.click(pill('Open'));
    fireEvent.click(screen.getByRole('button', { name: 'Amount' }));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(pill('Open')).toBeChecked();
  });

  it('an asynchronous echo does not overwrite the text typed in the meantime', async () => {
    const adapter = createMemoryUrlAdapter({ notify: 'microtask' });
    const onSearchQueryChange = vi.fn();
    render(<Host adapter={adapter} onSearchQueryChange={onSearchQueryChange} />);
    const user = userEvent.setup();
    await user.type(searchBox(), 'ros{Enter}');
    expect(adapter.read().get('q')).toBe('ros');
    // Keeps typing before the echo of the next commit lands.
    await user.type(searchBox(), 's');
    expect(searchBox().value).toBe('ross');
    await act(async () => {
      await Promise.resolve();
    });
    expect(searchBox().value).toBe('ross');
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
  });

  it('an external change updates the state with no callback and no write', () => {
    const write = vi.fn();
    const adapter = createMemoryUrlAdapter({ onWrite: write });
    const onFilterChange = vi.fn();
    const onSortChange = vi.fn();
    render(<Host adapter={adapter} onFilterChange={onFilterChange} onSortChange={onSortChange} />);
    fireEvent.click(pill('Open'));
    write.mockClear();
    onFilterChange.mockClear();
    act(() => adapter.set('?filter=closed&sort=amount.desc'));
    expect(pill('Closed')).toBeChecked();
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('an adapter that is a new object on every render does not loop, write or call back', () => {
    const base = createMemoryUrlAdapter({ initial: '?filter=open' });
    const write = vi.spyOn(base, 'write');
    const onFilterChange = vi.fn();
    const inline = () => ({
      read: () => base.read(),
      write: (n: URLSearchParams, m: 'replace' | 'push') => base.write(n, m),
      subscribe: (l: () => void) => base.subscribe(l),
    });
    const { rerender } = render(<Host adapter={inline} onFilterChange={onFilterChange} />);
    rerender(<Host adapter={inline} onFilterChange={onFilterChange} />);
    rerender(<Host adapter={inline} onFilterChange={onFilterChange} />);
    expect(pill('Open')).toBeChecked();
    expect(write).not.toHaveBeenCalled();
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(base.listenerCount()).toBe(1);
    fireEvent.click(pill('Closed'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const adapter = createMemoryUrlAdapter();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((l: () => void) => {
      const off = adapter.subscribe(l);
      return () => {
        unsubscribe();
        off();
      };
    });
    const { unmount } = render(<Host adapter={{ read: adapter.read, write: adapter.write, subscribe }} />);
    expect(subscribe).toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(subscribe.mock.calls.length);
    expect(adapter.listenerCount()).toBe(0);
  });

  it('a different adapter after mount re-reads the state with no callback', () => {
    const a = createMemoryUrlAdapter({ initial: '?filter=open' });
    const b = createMemoryUrlAdapter({ initial: '?filter=closed' });
    const onFilterChange = vi.fn();
    const { rerender } = render(<Host adapter={a} onFilterChange={onFilterChange} />);
    expect(pill('Open')).toBeChecked();
    rerender(<Host adapter={b} onFilterChange={onFilterChange} />);
    expect(pill('Closed')).toBeChecked();
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(a.listenerCount()).toBe(0);
    expect(b.listenerCount()).toBe(1);
  });

  it('a router that normalizes the query causes no response write and no loop', () => {
    const write = vi.fn();
    // Re-orders the parameters and encodes spaces as %20.
    const normalize = (s: string) =>
      s
        .split('&')
        .sort()
        .join('&')
        .replace(/\+/g, '%20');
    const adapter = createMemoryUrlAdapter({ initial: '?z=1', onWrite: write, normalize });
    render(<Host adapter={adapter} />);
    fireEvent.click(pill('Open'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(adapter.read().get('filter')).toBe('open');
    expect(adapter.read().get('z')).toBe('1');
    expect(pill('Open')).toBeChecked();
  });

  it('a write that throws propagates and leaves the state consistent', () => {
    const base = createMemoryUrlAdapter({ initial: '?filter=open' });
    let fail = true;
    const adapter: ListReportUrlAdapter = {
      read: base.read,
      subscribe: base.subscribe,
      write: (n, m) => {
        if (fail) throw new Error('router refused');
        base.write(n, m);
      },
    };
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS, adapter }));
    expect(() => result.current.onFilterChange('closed')).toThrow('router refused');
    expect(result.current.filter).toBe('open');
    fail = false;
    act(() => result.current.onFilterChange('closed'));
    expect(result.current.filter).toBe('closed');
  });

  it('does not write when the gesture changes nothing', () => {
    const write = vi.fn();
    const adapter = createMemoryUrlAdapter({ initial: '?a=b+c', onWrite: write });
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS, adapter }));
    act(() => result.current.onFilterChange('all')); // the default, already "no parameter"
    expect(write).not.toHaveBeenCalled();
  });

  it('read() must return URLSearchParams (a string is a type error)', () => {
    const bad: ListReportUrlAdapter = {
      // @ts-expect-error a query string is not accepted: wrap it in URLSearchParams
      read: () => '?filter=open',
      write: () => undefined,
      subscribe: () => () => undefined,
    };
    expect(bad).toBeDefined();
  });
});
