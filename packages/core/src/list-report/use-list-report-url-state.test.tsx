import { StrictMode, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter, ListReportSort } from './types';
import { useListReport } from './use-list-report';
import {
  parseSortParam,
  updateSearch,
  useListReportUrlState,
  type UseListReportUrlStateOptions,
  type UseListReportUrlStateReturn,
} from './use-list-report-url-state';

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
  { id: 'r4', name: 'Rossini', amount: 40, open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, searchable: false },
  { id: 'note', header: 'Note', cell: () => '-' },
];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
  { id: 'closed', label: 'Closed', predicate: (r) => !r.open },
];
const SORTABLE = ['name', 'amount'];

/** Puts the page on `/list` + `search` + `hash` without a history entry. */
function setUrl(search: string, hash = ''): void {
  window.history.replaceState(null, '', `/list${search}${hash}`);
}
/** What Back/Forward does: the URL changes, then `popstate`. */
function navigate(search: string): void {
  act(() => {
    window.history.replaceState(null, '', `/list${search}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  });
}
const params = () => new URLSearchParams(window.location.search);

let replaceSpy: ReturnType<typeof vi.spyOn>;
let pushSpy: ReturnType<typeof vi.spyOn>;
/** Spies the writes from now on (after the test has prepared the URL). */
function spyWrites() {
  replaceSpy = vi.spyOn(window.history, 'replaceState');
  pushSpy = vi.spyOn(window.history, 'pushState');
}

beforeEach(() => setUrl(''));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type HostProps = Partial<Omit<UseListReportUrlStateOptions, 'filters'>> & {
  filters?: ListReportFilter<Row>[];
  onFilterChange?: (id: string) => void;
  onSearchQueryChange?: (q: string) => void;
  onSortChange?: (s: ListReportSort) => void;
  onRender?: (url: UseListReportUrlStateReturn) => void;
  searchCommitDelay?: number | null;
  title?: string;
};

/** The report wired to the URL, with the consumer's own callbacks chained after the hook's. */
function Host({ onFilterChange, onSearchQueryChange, onSortChange, onRender, searchCommitDelay = null, title = 'Invoices', ...options }: HostProps) {
  const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE, ...options });
  onRender?.(url);
  const table = useListReport<Row>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: options.filters ?? FILTERS,
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
  return <ListReport title={title} table={table} searchLabel={`Search ${title}`} filtersLabel={`Filters ${title}`} />;
}

const pill = (name: string, title = 'Invoices') =>
  within(screen.getByRole('radiogroup', { name: `Filters ${title}` })).getByRole('radio', { name });
const searchBox = (title = 'Invoices') => screen.getByRole('searchbox', { name: `Search ${title}` }) as HTMLInputElement;
const rowNames = (title = 'Invoices') =>
  Array.from(screen.getByRole('table', { name: title }).querySelectorAll('tbody tr:not([aria-hidden])')).map(
    (tr) => tr.querySelector('td')?.textContent,
  );

describe('helpers', () => {
  it('parseSortParam splits on the last dot and checks the direction', () => {
    expect(parseSortParam('amount.desc')).toEqual({ columnId: 'amount', direction: 'desc' });
    expect(parseSortParam('a.b.asc')).toEqual({ columnId: 'a.b', direction: 'asc' });
    expect(parseSortParam('amount.sideways')).toBeUndefined();
    expect(parseSortParam('amount')).toBeUndefined();
    expect(parseSortParam('.asc')).toBeUndefined();
    expect(parseSortParam('')).toBeUndefined();
    expect(parseSortParam('amount.ASC')).toBeUndefined();
  });

  it('updateSearch keeps the other parameters byte for byte and in place, drops repetitions, removes with null', () => {
    expect(updateSearch('?tab=2&filter=a&x=%20y&filter=b&flag', { filter: 'open' })).toBe('?tab=2&filter=open&x=%20y&flag');
    expect(updateSearch('?tab=2', { filter: 'open' })).toBe('?tab=2&filter=open');
    expect(updateSearch('?filter=a&filter=b', { filter: null })).toBe('');
    expect(updateSearch('', { q: 'a&b=c#d+e f' })).toBe('?q=a%26b%3Dc%23d%2Be+f');
    expect(updateSearch('?bad=%E0%A4%A&q=1', { q: '2' })).toBe('?bad=%E0%A4%A&q=2');
    expect(updateSearch('?a+b=1', { 'a b': null })).toBe('');
    expect(updateSearch('?q=x', { q: '' })).toBe('?q=');
  });
});

describe('reading the URL at mount', () => {
  it('applies filter, search and sort at the very first render, no intermediate default render', () => {
    setUrl('?filter=open&q=rossi&sort=amount.desc');
    const seen: UseListReportUrlStateReturn[] = [];
    render(<Host onRender={(url) => seen.push(url)} />);
    expect(seen[0]).toMatchObject({ filter: 'open', searchQuery: 'rossi', sort: { columnId: 'amount', direction: 'desc' } });
    for (const url of seen) expect(url.filter).toBe('open');
    expect(pill('Open')).toBeChecked();
    expect(searchBox()).toHaveValue('rossi');
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
    expect(rowNames()).toEqual(['Rossi']);
  });

  it.each([
    ['?filter=nonexistent', 'filter'],
    ['?sort=note.asc', 'sort on a non-sortable column'],
    ['?sort=missing.asc', 'sort on an unknown column'],
    ['?sort=amount.sideways', 'unknown direction'],
    ['?sort=amount', 'no direction'],
    ['?sort=', 'empty sort'],
    ['?q=', 'empty search'],
    ['?filter=', 'empty filter'],
  ])('%s (%s): the default, no exception, no warning, no rewrite', (search) => {
    setUrl(search);
    spyWrites();
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE }));
    expect(result.current).toMatchObject({ filter: 'all', searchQuery: '', sort: null });
    render(<Host />);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });

  it('repeated parameters: the first valid value wins, without rewriting the URL', () => {
    setUrl('?filter=zzz&filter=closed&filter=open&sort=bad.asc&sort=name.asc&sort=amount.desc&q=one&q=two');
    spyWrites();
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE }));
    expect(result.current.filter).toBe('closed');
    expect(result.current.sort).toEqual({ columnId: 'name', direction: 'asc' });
    expect(result.current.searchQuery).toBe('one');
    expect(replaceSpy).not.toHaveBeenCalled();
    // The gesture that rewrites a repeated parameter leaves a single copy.
    act(() => result.current.onFilterChange('open'));
    expect(params().getAll('filter')).toEqual(['open']);
    expect(params().getAll('sort')).toHaveLength(3);
  });

  it('without defaultFilter the default is the first filter; defaultFilter picks another one', () => {
    const first = renderHook(() => useListReportUrlState({ filters: FILTERS }));
    expect(first.result.current.filter).toBe('all');
    const picked = renderHook(() => useListReportUrlState({ filters: FILTERS, defaultFilter: 'open' }));
    expect(picked.result.current.filter).toBe('open');
    const none = renderHook(() => useListReportUrlState({ filters: [] }));
    expect(none.result.current.filter).toBeUndefined();
  });

  it('without sortableColumnIds any well-formed sort is accepted; ids with dots are valid', () => {
    setUrl('?sort=a.b.c.desc');
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS }));
    expect(result.current.sort).toEqual({ columnId: 'a.b.c', direction: 'desc' });
    const checked = renderHook(() => useListReportUrlState({ filters: FILTERS, sortableColumnIds: ['a.b.c'] }));
    expect(checked.result.current.sort).toEqual({ columnId: 'a.b.c', direction: 'desc' });
  });

  it('filters that arrive after the mount make a URL pill valid: applied with no callback and no write', () => {
    setUrl('?filter=open');
    spyWrites();
    const onFilterChange = vi.fn();
    const { rerender } = render(<Host filters={[]} onFilterChange={onFilterChange} />);
    expect(rowNames()).toHaveLength(4);
    rerender(<Host filters={FILTERS} onFilterChange={onFilterChange} />);
    expect(pill('Open')).toBeChecked();
    expect(rowNames()).toEqual(['Rossi', 'Bianchi']);
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?filter=open');
  });

  it('the returned sort keeps its identity while it does not change, the callbacks always', () => {
    setUrl('?sort=amount.desc');
    const { result, rerender } = renderHook(() => useListReportUrlState({ filters: FILTERS, sortableColumnIds: [...SORTABLE] }));
    const first = result.current;
    rerender();
    expect(result.current.sort).toBe(first.sort);
    act(() => result.current.onFilterChange('open'));
    expect(result.current.sort).toBe(first.sort);
    expect(result.current.onFilterChange).toBe(first.onFilterChange);
    expect(result.current.onSearchQueryChange).toBe(first.onSearchQueryChange);
    expect(result.current.onSortChange).toBe(first.onSortChange);
  });
});

describe('writing on a gesture', () => {
  it('replace (default): pill, committed search and sort header update the URL, history.length unchanged', async () => {
    const user = userEvent.setup();
    render(<Host />);
    spyWrites();
    const length = window.history.length;
    await user.click(pill('Open'));
    expect(window.location.search).toBe('?filter=open');
    await user.type(searchBox(), 'rossi{Enter}');
    expect(window.location.search).toBe('?filter=open&q=rossi');
    await user.click(screen.getByRole('button', { name: 'Amount' }));
    await user.click(screen.getByRole('button', { name: 'Amount' }));
    expect(window.location.search).toBe('?filter=open&q=rossi&sort=amount.desc');
    expect(window.history.length).toBe(length);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(4);
  });

  it('push: every gesture adds exactly one entry', async () => {
    const user = userEvent.setup();
    render(<Host history="push" />);
    spyWrites();
    const length = window.history.length;
    await user.click(pill('Open'));
    expect(window.history.length).toBe(length + 1);
    await user.click(pill('Closed'));
    expect(window.history.length).toBe(length + 2);
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(window.history.length).toBe(length + 3);
    // A gesture that changes nothing (the active pill) writes nothing.
    await user.click(pill('Closed'));
    expect(window.history.length).toBe(length + 3);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('push: five typed characters commit once (debounce or Enter): one entry, the draft never in the URL', async () => {
    const urls: string[] = [];
    const record = () => urls.push(window.location.search);
    for (const commit of ['debounce', 'enter'] as const) {
      // Fake timers and synchronous keystrokes: the five characters are typed within the 300 ms commit
      // delay whatever the load of the machine (the e2e types them for real in a browser).
      vi.useFakeTimers();
      setUrl('');
      cleanup();
      render(<Host history="push" searchCommitDelay={commit === 'debounce' ? 300 : null} />);
      spyWrites();
      pushSpy.mockImplementation(function (this: History, ...args: Parameters<History['pushState']>) {
        History.prototype.pushState.apply(this, args);
        record();
      });
      const length = window.history.length;
      for (const typed of ['r', 'ro', 'ros', 'ross', 'rossi']) {
        fireEvent.change(searchBox(), { target: { value: typed } });
        act(() => void vi.advanceTimersByTime(50));
      }
      if (commit === 'enter') fireEvent.keyDown(searchBox(), { key: 'Enter' });
      expect(urls).toEqual(commit === 'debounce' ? [] : ['?q=rossi']);
      act(() => void vi.advanceTimersByTime(1000));
      expect(window.location.search).toBe('?q=rossi');
      expect(window.history.length).toBe(length + 1);
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(urls).toEqual(['?q=rossi']);
      urls.length = 0;
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('a gesture back to the default removes the parameter', async () => {
    setUrl('?filter=open&q=rossi&sort=amount.desc');
    const user = userEvent.setup();
    render(<Host />);
    await user.click(pill('All'));
    expect(params().has('filter')).toBe(false);
    await user.clear(searchBox());
    await user.keyboard('{Enter}');
    expect(params().has('q')).toBe(false);
    // "Amount" starts ascending: desc is the second step, the next click removes the sort.
    await user.click(screen.getByRole('button', { name: 'Amount' }));
    expect(window.location.search).toBe('');
  });

  it('non-empty defaults: clearing writes an explicit empty value, read back as "none"', () => {
    const defaults = { defaultSearchQuery: 'rossi', defaultSort: { columnId: 'amount', direction: 'asc' } as ListReportSort };
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE, ...defaults }));
    expect(result.current).toMatchObject({ searchQuery: 'rossi', sort: { columnId: 'amount', direction: 'asc' } });
    act(() => result.current.onSearchQueryChange(''));
    act(() => result.current.onSortChange(null));
    expect(window.location.search).toBe('?q=&sort=');
    expect(result.current).toMatchObject({ searchQuery: '', sort: null });
    act(() => result.current.onSortChange({ columnId: 'amount', direction: 'asc' }));
    act(() => result.current.onSearchQueryChange('rossi'));
    expect(window.location.search).toBe('');
  });

  it('foreign parameters, parameters of another instance and the hash stay intact; history.state is kept', () => {
    setUrl('?tab=2&other.q=x&other.filter=open', '#top');
    window.history.replaceState({ router: 'state' }, '', window.location.href);
    const { result } = renderHook(() => useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE }));
    act(() => result.current.onFilterChange('open'));
    act(() => result.current.onSearchQueryChange('a b'));
    act(() => result.current.onSortChange({ columnId: 'amount', direction: 'asc' }));
    expect(window.location.search).toBe('?tab=2&other.q=x&other.filter=open&filter=open&q=a+b&sort=amount.asc');
    expect(window.location.hash).toBe('#top');
    expect(window.location.pathname).toBe('/list');
    expect(window.history.state).toEqual({ router: 'state' });
  });

  it('a search with special characters round-trips exactly (and survives a reload)', () => {
    const text = 'a&b=c #d +e  f 😀 %41';
    const { result, unmount } = renderHook(() => useListReportUrlState({ filters: FILTERS }));
    act(() => result.current.onSearchQueryChange(text));
    expect(result.current.searchQuery).toBe(text);
    expect(params().get('q')).toBe(text);
    expect(window.location.hash).toBe('');
    unmount();
    const reloaded = renderHook(() => useListReportUrlState({ filters: FILTERS }));
    expect(reloaded.result.current.searchQuery).toBe(text);
  });

  it('an own write is not read back as an outside change: no render with other values, no extra callback', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const filters: (string | undefined)[] = [];
    render(<Host onFilterChange={onFilterChange} onRender={(url) => filters.push(url.filter)} />);
    filters.length = 0;
    await user.click(pill('Open'));
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every((f) => f === 'open')).toBe(true);
    expect(onFilterChange).toHaveBeenCalledExactlyOnceWith('open');
  });

  it('a commit followed by more typing before the URL value comes back: the field keeps the newer text', async () => {
    const user = userEvent.setup();
    let table: ReturnType<typeof useListReport<Row>> | undefined;
    function Probe() {
      const url = useListReportUrlState({ filters: FILTERS });
      table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, searchCommitDelay: null, ...url });
      return <input aria-label="probe" value={table.searchDraft} onChange={(e) => table!.setSearchDraft(e.target.value)} />;
    }
    render(<Probe />);
    // Same batch: commit "abc" and type "d" before React re-renders with the value read from the URL.
    act(() => {
      table!.setSearchDraft('abc');
      table!.commitSearch();
      table!.setSearchDraft('abcd');
    });
    expect(params().get('q')).toBe('abc');
    expect(screen.getByRole('textbox', { name: 'probe' })).toHaveValue('abcd');
    expect(table!.searchQuery).toBe('abc');
    act(() => table!.commitSearch());
    expect(params().get('q')).toBe('abcd');
    // Same with real typing through the report.
    cleanup();
    setUrl('');
    render(<Host />);
    await user.type(searchBox(), 'abc{Enter}d');
    expect(searchBox()).toHaveValue('abcd');
    expect(params().get('q')).toBe('abc');
    await user.keyboard('{Enter}');
    expect(params().get('q')).toBe('abcd');
  });

  it('two instances writing in the same tick both land in the URL', () => {
    const a = renderHook(() => useListReportUrlState({ filters: FILTERS, prefix: 'a' }));
    const b = renderHook(() => useListReportUrlState({ filters: FILTERS, prefix: 'b' }));
    act(() => {
      a.result.current.onFilterChange('open');
      b.result.current.onFilterChange('closed');
    });
    expect(window.location.search).toBe('?a.filter=open&b.filter=closed');
    expect(a.result.current.filter).toBe('open');
    expect(b.result.current.filter).toBe('closed');
  });
});

describe('prefix and params', () => {
  it('two prefixed reports: a gesture on "a" changes only a.filter, "b" stays identical (and does not re-render)', async () => {
    setUrl('?b.filter=closed&b.q=verdi');
    const user = userEvent.setup();
    const bRenders: UseListReportUrlStateReturn[] = [];
    render(
      <>
        <Host prefix="a" title="A" />
        <Host prefix="b" title="B" onRender={(url) => bRenders.push(url)} />
      </>,
    );
    const before = bRenders.at(-1)!;
    const count = bRenders.length;
    await user.click(pill('Open', 'A'));
    expect(window.location.search).toBe('?b.filter=closed&b.q=verdi&a.filter=open');
    expect(bRenders).toHaveLength(count);
    expect(bRenders.at(-1)).toBe(before);
    expect(pill('Closed', 'B')).toBeChecked();
    expect(rowNames('B')).toEqual(['Verdi']);
  });

  it('an instance without prefix next to a prefixed one', () => {
    setUrl('?filter=open&inv.filter=closed');
    const plain = renderHook(() => useListReportUrlState({ filters: FILTERS }));
    const inv = renderHook(() => useListReportUrlState({ filters: FILTERS, prefix: 'inv' }));
    expect(plain.result.current.filter).toBe('open');
    expect(inv.result.current.filter).toBe('closed');
    act(() => inv.result.current.onFilterChange('all'));
    expect(window.location.search).toBe('?filter=open');
    expect(plain.result.current.filter).toBe('open');
    act(() => plain.result.current.onSearchQueryChange('x'));
    expect(window.location.search).toBe('?filter=open&q=x');
    expect(inv.result.current.searchQuery).toBe('');
  });

  it('params renames the keys, under the prefix too', () => {
    setUrl('?find=rossi&q=ignored&p.find=verdi');
    const plain = renderHook(() => useListReportUrlState({ filters: FILTERS, params: { search: 'find' } }));
    const prefixed = renderHook(() => useListReportUrlState({ filters: FILTERS, params: { search: 'find', filter: 'tab', sort: 'order' }, prefix: 'p' }));
    expect(plain.result.current.searchQuery).toBe('rossi');
    expect(prefixed.result.current.searchQuery).toBe('verdi');
    act(() => plain.result.current.onSearchQueryChange('bianchi'));
    act(() => prefixed.result.current.onFilterChange('open'));
    act(() => prefixed.result.current.onSortChange({ columnId: 'name', direction: 'desc' }));
    expect(window.location.search).toBe('?find=bianchi&q=ignored&p.find=verdi&p.tab=open&p.order=name.desc');
  });
});

describe('Back/Forward (popstate)', () => {
  it('updates the values, calls no consumer callback and writes nothing', () => {
    const onFilterChange = vi.fn();
    const onSearchQueryChange = vi.fn();
    const onSortChange = vi.fn();
    render(<Host onFilterChange={onFilterChange} onSearchQueryChange={onSearchQueryChange} onSortChange={onSortChange} searchCommitDelay={300} />);
    spyWrites();
    navigate('?filter=closed&q=verdi&sort=amount.asc');
    expect(pill('Closed')).toBeChecked();
    expect(searchBox()).toHaveValue('verdi');
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual(['Verdi']);
    navigate('');
    expect(pill('All')).toBeChecked();
    expect(searchBox()).toHaveValue('');
    expect(rowNames()).toHaveLength(4);
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(2); // the two `navigate` calls themselves, nothing from the hook
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('a draft being typed stays in the field while the table follows the URL; a draft equal to the committed follows it', async () => {
    setUrl('?q=rossi');
    const user = userEvent.setup();
    render(<Host />);
    await user.type(searchBox(), '{Backspace}'); // draft "ross", committed "rossi"
    navigate('?q=bianchi');
    expect(searchBox()).toHaveValue('ross');
    expect(rowNames()).toEqual(['Bianchi']);
    // Not typing: the field follows.
    cleanup();
    setUrl('?q=rossi');
    render(<Host />);
    navigate('?q=bianchi');
    expect(searchBox()).toHaveValue('bianchi');
    expect(rowNames()).toEqual(['Bianchi']);
  });

  it('popstate while the search commit is pending: the commit is dropped, the text stays, nothing is written', () => {
    vi.useFakeTimers();
    setUrl('?q=rossi');
    const onSearchQueryChange = vi.fn();
    let table: ReturnType<typeof useListReport<Row>> | undefined;
    function Probe() {
      const url = useListReportUrlState({ filters: FILTERS, history: 'push' });
      table = useListReport<Row>({
        rows: ROWS,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        filters: FILTERS,
        ...url,
        onSearchQueryChange: (q) => {
          url.onSearchQueryChange(q);
          onSearchQueryChange(q);
        },
      });
      return null;
    }
    render(<Probe />);
    act(() => table!.setSearchDraft('ross')); // 300 ms commit pending
    spyWrites();
    navigate('?q=bianchi');
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?q=bianchi');
    expect(table!.searchDraft).toBe('ross');
    expect(table!.searchQuery).toBe('bianchi');
    // The user's next gesture commits their text.
    act(() => table!.commitSearch());
    expect(window.location.search).toBe('?q=ross');
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['only the pill', '?filter=closed'],
    ['only the sort', '?sort=amount.desc'],
  ])('popstate that moves %s while the search commit is pending: the commit is dropped, nothing is written', (_, target) => {
    vi.useFakeTimers();
    const onSearchQueryChange = vi.fn();
    render(<Host history="push" searchCommitDelay={300} onSearchQueryChange={onSearchQueryChange} />);
    fireEvent.change(searchBox(), { target: { value: 'ross' } }); // 300 ms commit pending
    spyWrites();
    navigate(target);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalledTimes(1); // `navigate` itself
    expect(window.location.search).toBe(target);
    expect(searchBox()).toHaveValue('ross');
  });

  it('popstate that changes only parameters of another instance or the hash: no render change, the commit still fires', () => {
    vi.useFakeTimers();
    const onSearchQueryChange = vi.fn();
    render(<Host searchCommitDelay={300} onSearchQueryChange={onSearchQueryChange} />);
    fireEvent.change(searchBox(), { target: { value: 'ross' } });
    navigate('?other.filter=open');
    act(() => void vi.advanceTimersByTime(300));
    // Nothing of this report moved: the user's own pending commit is not a reaction to the navigation.
    expect(onSearchQueryChange).toHaveBeenCalledExactlyOnceWith('ross');
    expect(window.location.search).toBe('?other.filter=open&q=ross');
  });

  it('popstate on a draft equal to the committed one (nothing pending): the field follows, nothing is written', () => {
    vi.useFakeTimers();
    setUrl('?q=rossi');
    render(<Host searchCommitDelay={300} />);
    spyWrites();
    navigate('?q=verdi');
    act(() => void vi.advanceTimersByTime(1000));
    expect(searchBox()).toHaveValue('verdi');
    expect(window.location.search).toBe('?q=verdi');
    expect(replaceSpy).toHaveBeenCalledTimes(1); // `navigate` itself
  });
});

describe('lifecycle', () => {
  it('unmount removes the popstate listener', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useListReportUrlState({ filters: FILTERS }));
    const listener = add.mock.calls.find(([type]) => type === 'popstate')?.[1];
    expect(listener).toBeDefined();
    unmount();
    expect(remove).toHaveBeenCalledWith('popstate', listener);
  });

  it('StrictMode: no orphan listener, one write per gesture, no write at mount', async () => {
    setUrl('?filter=nonexistent');
    spyWrites();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const user = userEvent.setup();
    const { unmount } = render(
      <StrictMode>
        <Host />
      </StrictMode>,
    );
    expect(replaceSpy).not.toHaveBeenCalled();
    await user.click(pill('Open'));
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    unmount();
    const added = add.mock.calls.filter(([type]) => type === 'popstate').map(([, l]) => l);
    const removed = remove.mock.calls.filter(([type]) => type === 'popstate').map(([, l]) => l);
    expect(added.length).toBeGreaterThan(0);
    expect(removed).toHaveLength(added.length);
    for (const listener of added) expect(removed).toContain(listener);
    // After the unmount a popstate reaches nobody (no React warning about an unmounted component).
    const error = vi.spyOn(console, 'error');
    navigate('?filter=closed');
    expect(error).not.toHaveBeenCalled();
  });

  it('hydration: the server renders the defaults, the client applies the URL with no mismatch', () => {
    setUrl('?filter=open&q=rossi&sort=amount.desc');
    function Page() {
      const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE });
      const sort = url.sort ? `${url.sort.columnId}.${url.sort.direction}` : 'none';
      return <p>{`${url.filter}|${url.searchQuery}|${sort}`}</p>;
    }
    const html = renderToString(<Page />);
    expect(html).toContain('all||none');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const error = vi.spyOn(console, 'error');
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => {
      root = hydrateRoot(container, <Page />, { onRecoverableError: recoverable });
    });
    expect(container.textContent).toBe('open|rossi|amount.desc');
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    act(() => root!.unmount());
    container.remove();
  });

  it('a mount effect of the consumer sees the URL values already', () => {
    setUrl('?filter=closed');
    const seen: (string | undefined)[] = [];
    function Probe() {
      const { filter } = useListReportUrlState({ filters: FILTERS });
      useEffect(() => void seen.push(filter), [filter]);
      return null;
    }
    render(<Probe />);
    expect(seen).toEqual(['closed']);
  });
});
