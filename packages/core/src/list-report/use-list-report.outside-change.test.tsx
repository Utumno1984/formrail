import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListReportColumn, UseListReportOptions } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers();
});

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'Rossi' },
  { id: 'b', name: 'Bianchi' },
  { id: 'c', name: 'Ross' },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

function setup(props: Partial<UseListReportOptions<Row>>) {
  return renderHook(
    (p: Partial<UseListReportOptions<Row>>) => useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, ...p }),
    { initialProps: props },
  );
}

describe('useListReport: an outside change of the committed query while a delayed commit is pending', () => {
  it('keeps the draft the user is editing and drops the pending commit (Back in the browser wins)', () => {
    const onSearchQueryChange = vi.fn();
    const { result, rerender } = setup({ searchQuery: 'rossi', onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross')); // a 300 ms commit is now pending
    rerender({ searchQuery: 'bianchi', onSearchQueryChange });
    expect(result.current.searchDraft).toBe('ross');
    expect(ids(result.current.rows)).toEqual(['b']);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onSearchQueryChange).not.toHaveBeenCalled();
    expect(ids(result.current.rows)).toEqual(['b']);
    // The text is still the user's: an explicit commit (Enter) sends it.
    act(() => result.current.commitSearch());
    expect(onSearchQueryChange).toHaveBeenCalledExactlyOnceWith('ross');
  });

  it('the next edit after the outside change schedules a commit again', () => {
    const onSearchQueryChange = vi.fn();
    const { result, rerender } = setup({ searchQuery: 'rossi', onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross'));
    rerender({ searchQuery: 'bianchi', onSearchQueryChange });
    act(() => result.current.setSearchDraft('ros'));
    act(() => void vi.advanceTimersByTime(300));
    expect(onSearchQueryChange).toHaveBeenCalledExactlyOnceWith('ros');
  });

  it('a late echo of an emitted query is not an outside change: a commit pending after it still fires', () => {
    const onSearchQueryChange = vi.fn();
    const { result, rerender } = setup({ searchQuery: '', searchCommitDelay: null, onSearchQueryChange });
    act(() => result.current.setSearchDraft('ross'));
    act(() => result.current.commitSearch());
    rerender({ searchQuery: '', searchCommitDelay: 300, onSearchQueryChange });
    act(() => result.current.setSearchDraft('rossi')); // pending
    rerender({ searchQuery: 'ross', searchCommitDelay: 300, onSearchQueryChange }); // the echo
    act(() => void vi.advanceTimersByTime(300));
    expect(onSearchQueryChange.mock.calls).toEqual([['ross'], ['rossi']]);
  });
});
