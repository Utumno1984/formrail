import { useState } from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeText } from '../internal/normalize-text';
import { matchesSearch, parseSearchTerms } from './search';
import type { ListReportColumn, ListReportFilter, UseListReportOptions } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  name: string;
  city?: string;
  amount: number | null;
  open?: boolean;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Rossi Mario', city: 'Roma', amount: 1250.5, open: true },
  { id: 'b', name: 'Bianchi Anna', city: 'Café', amount: 2, open: false },
  { id: 'c', name: 'Rossi Luca', city: 'Milano', amount: 30, open: true },
  { id: 'd', name: 'Verdi (SRL)', city: 'Cafe', amount: null, open: true },
];
const COLUMNS: ListReportColumn<Row>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name },
  { id: 'city', header: 'City', accessor: (r) => r.city },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount },
];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open === true },
];
const getRowId = (r: Row) => r.id;
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

function setup(options: Partial<UseListReportOptions<Row>> = {}) {
  return renderHook(
    (props: Partial<UseListReportOptions<Row>>) =>
      useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, filters: FILTERS, ...props }),
    { initialProps: options },
  );
}

describe('normalizeText / search helpers', () => {
  it('normalizeText lower-cases and strips diacritics without trimming', () => {
    expect(normalizeText(' Café ')).toBe(' cafe ');
  });

  it('parseSearchTerms trims, splits on whitespace, normalizes; blank gives no terms', () => {
    expect(parseSearchTerms('  Rossi   CAFÉ ')).toEqual(['rossi', 'cafe']);
    expect(parseSearchTerms('   ')).toEqual([]);
    expect(parseSearchTerms('')).toEqual([]);
  });

  it('matchesSearch: every term in at least one searchable column; searchable:false and getSearchText', () => {
    const row = ROWS[0]!;
    expect(matchesSearch(row, ['rossi', 'roma'], COLUMNS)).toBe(true);
    expect(matchesSearch(row, ['rossi', 'milano'], COLUMNS)).toBe(false);
    expect(matchesSearch(row, ['1250'], COLUMNS)).toBe(true);
    const hidden = [{ ...COLUMNS[0]!, searchable: false }, COLUMNS[1]!];
    expect(matchesSearch(row, ['mario'], hidden)).toBe(false);
    expect(matchesSearch(row, ['mario'], hidden, () => 'Mario')).toBe(true);
  });

  it('skips non-string/number cells (null, undefined, NaN, objects, booleans)', () => {
    const cols: ListReportColumn<Record<string, unknown>>[] = ['a', 'b', 'c', 'd'].map((k) => ({
      id: k,
      header: k,
      accessor: (r) => r[k],
    }));
    const row = { a: null, b: undefined, c: Number.NaN, d: { toString: () => 'secret' } };
    expect(matchesSearch(row, ['null'], cols)).toBe(false);
    expect(matchesSearch(row, ['nan'], cols)).toBe(false);
    expect(matchesSearch(row, ['secret'], cols)).toBe(false);
  });
});

describe('useListReport: filter', () => {
  it('defaults to the first filter, which without predicate keeps every row; counts', () => {
    const { result } = setup();
    expect(result.current.filter).toBe('all');
    expect(ids(result.current.rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.current.totalCount).toBe(4);
    expect(result.current.resultCount).toBe(4);
    expect(result.current.filters).toBe(FILTERS);
  });

  it('defaultFilter picks the initial one', () => {
    const { result } = setup({ defaultFilter: 'open' });
    expect(result.current.filter).toBe('open');
    expect(ids(result.current.rows)).toEqual(['a', 'c', 'd']);
  });

  it('setFilter filters, calls onFilterChange once, and is a no-op on the active filter', () => {
    const onFilterChange = vi.fn();
    const { result } = setup({ onFilterChange });
    act(() => result.current.setFilter('open'));
    expect(ids(result.current.rows)).toEqual(['a', 'c', 'd']);
    expect(result.current.resultCount).toBe(3);
    expect(result.current.totalCount).toBe(4);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith('open');
    act(() => result.current.setFilter('open'));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    act(() => result.current.setFilter('all'));
    expect(ids(result.current.rows)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('controlled: a gesture only reports; an outside change updates rows without echo', () => {
    const onFilterChange = vi.fn();
    const { result, rerender } = setup({ filter: 'all', onFilterChange });
    act(() => result.current.setFilter('open'));
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(result.current.filter).toBe('all');
    onFilterChange.mockClear();
    rerender({ filter: 'open', onFilterChange });
    expect(ids(result.current.rows)).toEqual(['a', 'c', 'd']);
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('unknown filter id: no filter applied, no crash, one development warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, rerender } = setup({ filter: 'nope' });
    expect(ids(result.current.rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.current.filter).toBe('nope');
    rerender({ filter: 'nope' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"nope"');
  });

  it('no warning for a defaultFilter while filters are still empty (asynchronous loading)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, rerender } = setup({ filters: [], defaultFilter: 'open' });
    expect(result.current.rows).toHaveLength(4);
    expect(warn).not.toHaveBeenCalled();
    rerender({ filters: FILTERS, defaultFilter: 'open' });
    expect(ids(result.current.rows)).toEqual(['a', 'c', 'd']);
  });

  it('setFilter with an unknown id (or without filters) is a no-op that warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onFilterChange = vi.fn();
    const { result } = setup({ onFilterChange });
    act(() => result.current.setFilter('nope'));
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(result.current.filter).toBe('all');
    expect(warn).toHaveBeenCalledTimes(1);

    const bare = setup({ filters: undefined, onFilterChange });
    expect(bare.result.current.filter).toBeNull();
    expect(ids(bare.result.current.rows)).toEqual(['a', 'b', 'c', 'd']);
    act(() => bare.result.current.setFilter('open'));
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('useListReport: search draft and committed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('the draft does not filter; commitSearch commits once, no-op when equal', () => {
    const onSearchQueryChange = vi.fn();
    const { result } = setup({ searchCommitDelay: null, onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross'));
    expect(result.current.searchDraft).toBe('ross');
    expect(result.current.searchQuery).toBe('');
    expect(result.current.rows).toHaveLength(4);
    act(() => result.current.commitSearch());
    expect(result.current.searchQuery).toBe('ross');
    expect(ids(result.current.rows)).toEqual(['a', 'c']);
    expect(result.current.resultCount).toBe(2);
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
    expect(onSearchQueryChange).toHaveBeenCalledWith('ross');
    act(() => result.current.commitSearch());
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
  });

  it('commits by itself after the default 300 ms from the last edit (not at 299 ms)', () => {
    const onSearchQueryChange = vi.fn();
    const { result } = setup({ onSearchQueryChange });
    act(() => result.current.setSearchDraft('ro'));
    act(() => void vi.advanceTimersByTime(200));
    act(() => result.current.setSearchDraft('ross'));
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current.searchQuery).toBe('');
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.searchQuery).toBe('ross');
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
  });

  it('searchCommitDelay null: only commitSearch commits; a custom delay is honoured, also when it changes', () => {
    const { result, rerender } = setup({ searchCommitDelay: null });
    act(() => result.current.setSearchDraft('ross'));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current.searchQuery).toBe('');

    rerender({ searchCommitDelay: 50 });
    act(() => result.current.setSearchDraft('rossi'));
    act(() => void vi.advanceTimersByTime(50));
    expect(result.current.searchQuery).toBe('rossi');
  });

  it('an explicit commitSearch cancels the pending timer (no double commit)', () => {
    const onSearchQueryChange = vi.fn();
    const { result } = setup({ onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross'));
    act(() => result.current.commitSearch());
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
  });

  it('a draft equal to the committed value schedules nothing', () => {
    const onSearchQueryChange = vi.fn();
    const { result } = setup({ defaultSearchQuery: 'ross', onSearchQueryChange });
    expect(result.current.searchDraft).toBe('ross');
    act(() => result.current.setSearchDraft('ross'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
  });

  it('controlled: the gesture only reports; an outside change filters with no echo', () => {
    const onSearchQueryChange = vi.fn();
    const { result, rerender } = setup({ searchQuery: '', searchCommitDelay: null, onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross'));
    act(() => result.current.commitSearch());
    expect(onSearchQueryChange).toHaveBeenCalledWith('ross');
    expect(result.current.searchQuery).toBe('');
    onSearchQueryChange.mockClear();
    rerender({ searchQuery: 'bianchi', searchCommitDelay: null, onSearchQueryChange });
    expect(ids(result.current.rows)).toEqual(['b']);
    expect(onSearchQueryChange).not.toHaveBeenCalled();
  });

  it('no "going back": an outside change keeps a draft the user is editing', () => {
    const { result, rerender } = setup({ searchQuery: 'rossi', searchCommitDelay: null });
    act(() => result.current.setSearchDraft('ross mar'));
    rerender({ searchQuery: 'bianchi', searchCommitDelay: null });
    expect(result.current.searchQuery).toBe('bianchi');
    expect(result.current.searchDraft).toBe('ross mar');
    // and it keeps it on further outside changes
    rerender({ searchQuery: 'verdi', searchCommitDelay: null });
    expect(result.current.searchDraft).toBe('ross mar');
  });

  it('a draft equal to the previous committed (user not editing) follows the outside change, no commit', () => {
    const onSearchQueryChange = vi.fn();
    const { result, rerender } = setup({ searchQuery: 'rossi', onSearchQueryChange });
    act(() => result.current.setSearchDraft('rossi x'));
    act(() => result.current.setSearchDraft('rossi'));
    rerender({ searchQuery: 'bianchi', onSearchQueryChange });
    expect(result.current.searchDraft).toBe('bianchi');
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
  });

  it('an outside change that makes the pending draft equal to the committed value leaves no commit', () => {
    const onSearchQueryChange = vi.fn();
    const { result, rerender } = setup({ searchQuery: '', onSearchQueryChange });
    act(() => result.current.setSearchDraft('verdi'));
    rerender({ searchQuery: 'verdi', onSearchQueryChange });
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(result.current.searchDraft).toBe('verdi');
  });

  describe('controlled parent that applies the reported query late', () => {
    // A parent that applies `onSearchQueryChange` asynchronously (router, transition).
    function lateParent(lag: number, delay: number | null = null) {
      const onSearchQueryChange = vi.fn();
      const hook = renderHook(
        ({ query }: { query: string }) =>
          useListReport<Row>({
            rows: ROWS,
            columns: COLUMNS,
            getRowId,
            searchQuery: query,
            searchCommitDelay: delay,
            onSearchQueryChange: (next) => {
              onSearchQueryChange(next);
              setTimeout(() => hook.rerender({ query: next }), lag);
            },
          }),
        { initialProps: { query: '' } },
      );
      return { ...hook, onSearchQueryChange };
    }

    it('manual commit, then the field is cleared before the echo: the clear is committed and the echo does not refill it', () => {
      const { result, onSearchQueryChange } = lateParent(50);
      act(() => result.current.setSearchDraft('ross'));
      act(() => result.current.commitSearch());
      act(() => result.current.setSearchDraft(''));
      act(() => result.current.commitSearch());
      expect(onSearchQueryChange.mock.calls).toEqual([['ross'], ['']]);
      act(() => void vi.advanceTimersByTime(200));
      expect(result.current.searchDraft).toBe('');
      expect(result.current.searchQuery).toBe('');
      expect(result.current.rows).toHaveLength(4);
    });

    it('delayed commit (300 ms) with a slower parent (400 ms): clearing the field still wins', () => {
      const { result, onSearchQueryChange } = lateParent(400, 300);
      act(() => result.current.setSearchDraft('ross'));
      act(() => void vi.advanceTimersByTime(300));
      act(() => result.current.setSearchDraft(''));
      act(() => void vi.advanceTimersByTime(300));
      expect(onSearchQueryChange.mock.calls).toEqual([['ross'], ['']]);
      act(() => void vi.advanceTimersByTime(1000));
      expect(result.current.searchDraft).toBe('');
      expect(result.current.searchQuery).toBe('');
    });

    it('clearFilters before the echo emits the clear and the echo does not refill the field', () => {
      const { result, onSearchQueryChange } = lateParent(50);
      act(() => result.current.setSearchDraft('ross'));
      act(() => result.current.commitSearch());
      act(() => result.current.clearFilters());
      expect(onSearchQueryChange.mock.calls).toEqual([['ross'], ['']]);
      act(() => void vi.advanceTimersByTime(200));
      expect(result.current.searchDraft).toBe('');
      expect(result.current.searchQuery).toBe('');
    });

    it('typing on after a commit: the late echo does not overwrite the newer text', () => {
      const { result } = lateParent(50);
      act(() => result.current.setSearchDraft('ross'));
      act(() => result.current.commitSearch());
      act(() => result.current.setSearchDraft('rossi'));
      act(() => void vi.advanceTimersByTime(50));
      expect(result.current.searchDraft).toBe('rossi');
      expect(result.current.searchQuery).toBe('ross');
    });
  });

  it('rows changing while a commit is pending: the commit filters the new array', () => {
    const { result, rerender } = setup();
    act(() => result.current.setSearchDraft('neri'));
    const next = [...ROWS, { id: 'e', name: 'Neri', amount: 5 }];
    rerender({ rows: next });
    act(() => void vi.advanceTimersByTime(300));
    expect(ids(result.current.rows)).toEqual(['e']);
  });

  it('unmount with a pending timer: no commit, no React warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSearchQueryChange = vi.fn();
    const { result, unmount } = setup({ onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross'));
    unmount();
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('useListReport: search matching', () => {
  const search = (query: string, extra: Partial<UseListReportOptions<Row>> = {}) =>
    setup({ defaultSearchQuery: query, ...extra }).result.current;

  it('every term must match, case and diacritics insensitive, across columns', () => {
    expect(ids(search('ROSSI roma').rows)).toEqual(['a']);
    expect(ids(search('cafe').rows)).toEqual(['b', 'd']);
    expect(ids(search('café').rows)).toEqual(['b', 'd']);
    expect(ids(search('rossi milano').rows)).toEqual(['c']);
  });

  it('whitespace-only query is no search; the query is trimmed', () => {
    const blank = search('   ');
    expect(blank.rows).toHaveLength(4);
    expect(ids(search('  luca  ').rows)).toEqual(['c']);
  });

  it('regex characters are literal text', () => {
    expect(ids(search('(srl)').rows)).toEqual(['d']);
    expect(search('.*').rows).toHaveLength(0);
    expect(search('(').rows.map((r) => r.id)).toEqual(['d']);
  });

  it('numbers are searched as String(value)', () => {
    expect(ids(search('1250').rows)).toEqual(['a']);
    expect(ids(search('1250.5').rows)).toEqual(['a']);
  });

  it('searchable: false opts a column out; getSearchText replaces the rule', () => {
    const columns = [{ ...COLUMNS[0]!, searchable: false }, COLUMNS[1]!];
    expect(search('mario', { columns }).rows).toHaveLength(0);
    expect(ids(search('roma', { columns }).rows)).toEqual(['a']);
    const custom = search('zzz', { getSearchText: (r) => (r.id === 'b' ? 'zzz' : '') });
    expect(ids(custom.rows)).toEqual(['b']);
  });

  it('pipeline filter -> search -> sort: the sort applies to the subset', () => {
    const { result } = setup({
      defaultFilter: 'open',
      defaultSearchQuery: 'ross',
      defaultSort: { columnId: 'amount', direction: 'desc' },
    });
    expect(ids(result.current.rows)).toEqual(['a', 'c']);
    act(() => result.current.toggleSort('amount')); // desc -> none
    act(() => result.current.toggleSort('amount')); // none -> asc
    expect(ids(result.current.rows)).toEqual(['c', 'a']);
    expect(result.current.totalCount).toBe(4);
    expect(result.current.resultCount).toBe(2);
  });
});

describe('useListReport: clearFilters and identities', () => {
  it('restores the default filter, empties draft and committed, cancels the timer, notifies only changes', () => {
    vi.useFakeTimers();
    const onFilterChange = vi.fn();
    const onSearchQueryChange = vi.fn();
    const { result } = setup({ defaultFilter: 'all', onFilterChange, onSearchQueryChange, searchCommitDelay: 100 });
    act(() => result.current.setFilter('open'));
    act(() => result.current.setSearchDraft('ross'));
    act(() => void vi.advanceTimersByTime(100));
    act(() => result.current.setSearchDraft('rossi'));
    onFilterChange.mockClear();
    onSearchQueryChange.mockClear();
    act(() => result.current.clearFilters());
    expect(result.current.filter).toBe('all');
    expect(result.current.searchDraft).toBe('');
    expect(result.current.searchQuery).toBe('');
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith('all');
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
    expect(onSearchQueryChange).toHaveBeenCalledWith('');
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);

    act(() => result.current.clearFilters());
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onSearchQueryChange).toHaveBeenCalledTimes(1);
  });

  it('with defaults already in place and only a draft, clearFilters resets the draft and calls nothing', () => {
    const onFilterChange = vi.fn();
    const onSearchQueryChange = vi.fn();
    const { result } = setup({ onFilterChange, onSearchQueryChange });
    act(() => result.current.setSearchDraft('x'));
    act(() => result.current.clearFilters());
    expect(result.current.searchDraft).toBe('');
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onSearchQueryChange).not.toHaveBeenCalled();
  });

  describe('default pill with no results, controlled filter and search applied asynchronously', () => {
    const NONE_OPEN = ROWS.map((r) => ({ ...r, open: false }));
    const PILLS: ListReportFilter<Row>[] = [
      { id: 'open', label: 'Open', predicate: (r) => r.open === true },
      { id: 'all', label: 'All' },
      { id: 'closed', label: 'Closed', predicate: (r) => r.open === false },
    ];

    function setupAsync(initialFilter: string) {
      const onFilterChange = vi.fn();
      const onSearchQueryChange = vi.fn();
      const hook = renderHook(() => {
        const [filter, setFilter] = useState(initialFilter);
        const [query, setQuery] = useState('rossi');
        return useListReport<Row>({
          rows: NONE_OPEN, columns: COLUMNS, getRowId, filters: PILLS, defaultFilter: 'open',
          filter, searchQuery: query,
          // The parent applies what is reported one macrotask later, never in the same tick.
          onFilterChange: (id) => { onFilterChange(id); setTimeout(() => setFilter(id), 0); },
          onSearchQueryChange: (q) => { onSearchQueryChange(q); setTimeout(() => setQuery(q), 0); },
          searchCommitDelay: null,
        });
      });
      return { ...hook, onFilterChange, onSearchQueryChange };
    }

    it('reports the unfiltered pill once, even though the parent has not applied anything yet', async () => {
      vi.useFakeTimers();
      const { result, onFilterChange, onSearchQueryChange } = setupAsync('closed');
      act(() => result.current.clearFilters());
      expect(onFilterChange).toHaveBeenCalledTimes(1);
      expect(onFilterChange).toHaveBeenCalledWith('all');
      expect(onSearchQueryChange).toHaveBeenCalledWith('');
      expect(result.current.filter).toBe('closed');
      await act(async () => void vi.advanceTimersByTime(50));
      expect(result.current.filter).toBe('all');
      expect(result.current.searchQuery).toBe('');
      expect(result.current.resultCount).toBe(4);
      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });

    it('already on the unfiltered pill: no filter change at all, before or after the parent applies the search', async () => {
      vi.useFakeTimers();
      const { result, onFilterChange } = setupAsync('all');
      act(() => result.current.clearFilters());
      await act(async () => void vi.advanceTimersByTime(50));
      expect(result.current.searchQuery).toBe('');
      expect(result.current.filter).toBe('all');
      expect(onFilterChange).not.toHaveBeenCalled();
    });
  });

  it('the returned functions keep their identity across renders and state changes', () => {
    const { result, rerender } = setup({ onFilterChange: () => undefined, onSearchQueryChange: () => undefined });
    const first = result.current;
    act(() => result.current.setFilter('open'));
    act(() => result.current.setSearchDraft('r'));
    rerender({ onFilterChange: () => undefined, onSearchQueryChange: () => undefined });
    for (const key of ['setFilter', 'setSearchDraft', 'commitSearch', 'clearFilters'] as const) {
      expect(result.current[key], key).toBe(first[key]);
    }
  });
});

describe('useListReport: search no leak', () => {
  function Bar() {
    const report = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, filters: FILTERS, searchCommitDelay: null });
    return (
      <div>
        <input aria-label="search" value={report.searchDraft} onChange={(e) => report.setSearchDraft(e.target.value)} />
        <button type="button" onClick={report.commitSearch}>
          commit
        </button>
        {report.filters.map((f) => (
          <button key={f.id} type="button" aria-pressed={report.filter === f.id} onClick={() => report.setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <ul>
          {report.rows.map((r) => (
            <li key={r.id}>{r.name}</li>
          ))}
        </ul>
      </div>
    );
  }

  it('wired to a real input and buttons: no React warning, only own attributes on the DOM', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Bar />);
    await user.type(screen.getByLabelText('search'), 'verdi');
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'commit' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    for (const el of screen.getAllByRole('button')) {
      for (const name of el.getAttributeNames()) expect(name, `${el.tagName} ${name}`).toMatch(/^(type|aria-pressed)$/);
    }
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
