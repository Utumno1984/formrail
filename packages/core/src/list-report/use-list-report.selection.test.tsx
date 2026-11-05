import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListReportColumn, ListReportFilter, UseListReportOptions } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  name: string | null;
  open: boolean;
  amount: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', open: true, amount: 30 },
  { id: 'b', name: 'Bravo', open: false, amount: 10 },
  { id: 'c', name: 'Charlie', open: true, amount: 20 },
  { id: 'd', name: null, open: false, amount: 40 },
];

const COLUMNS: ListReportColumn<Row>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount },
];

const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
];

const getRowId = (r: Row) => r.id;

type Props = Partial<UseListReportOptions<Row>>;

function setup(initial: Props = {}) {
  return renderHook((props: Props) => useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, filters: FILTERS, selectable: true, searchCommitDelay: null, ...props }), {
    initialProps: initial,
  });
}

const ids = (set: ReadonlySet<string>) => [...set].sort();

describe('useListReport selection: off by default', () => {
  it('is disabled without `selectable`, computes nothing and ignores the gestures', () => {
    const counted = vi.fn(getRowId);
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: counted, onSelectedIdsChange: onChange, defaultSelectedIds: new Set(['a']) }),
    );
    const before = counted.mock.calls.length;
    const { selection } = result.current;
    expect(selection.enabled).toBe(false);
    expect(selection.isSelected('a')).toBe(false);
    expect(selection.selectedResultCount).toBe(0);
    expect(selection.allResultsState).toBe(false);
    expect(selection.getSelectedRows()).toEqual([]);
    act(() => {
      result.current.selection.toggle('b');
      result.current.selection.toggleAllResults();
      result.current.selection.clearSelection();
      result.current.selection.setSelectedIds(new Set(['c']));
    });
    expect(onChange).not.toHaveBeenCalled();
    // No extra work for the selection: `getRowId` is only called by the duplicate-id check.
    expect(counted.mock.calls.length).toBe(before);
  });
});

describe('useListReport selection: uncontrolled', () => {
  it('starts from defaultSelectedIds and toggles, one callback per gesture, with a new Set', () => {
    const onChange = vi.fn();
    const initial = new Set(['a']);
    const { result } = setup({ defaultSelectedIds: initial, onSelectedIdsChange: onChange });
    expect(result.current.selection.isSelected('a')).toBe(true);
    act(() => result.current.selection.toggle('b'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0]?.[0] as ReadonlySet<string>;
    expect(ids(emitted)).toEqual(['a', 'b']);
    expect(emitted).not.toBe(initial);
    expect(ids(initial)).toEqual(['a']); // never mutated
    expect(ids(result.current.selection.selectedIds)).toEqual(['a', 'b']);
    act(() => result.current.selection.toggle('a'));
    expect(ids(result.current.selection.selectedIds)).toEqual(['b']);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('chains two gestures in the same batch', () => {
    const { result } = setup();
    act(() => {
      result.current.selection.toggle('a');
      result.current.selection.toggle('b');
    });
    expect(ids(result.current.selection.selectedIds)).toEqual(['a', 'b']);
  });

  it('setSelectedIds copies the given set (a later mutation does not leak in)', () => {
    const onChange = vi.fn();
    const { result } = setup({ onSelectedIdsChange: onChange });
    const mine = new Set(['a', 'c']);
    act(() => result.current.selection.setSelectedIds(mine));
    mine.add('b');
    expect(ids(result.current.selection.selectedIds)).toEqual(['a', 'c']);
    expect(onChange.mock.calls[0]?.[0]).not.toBe(mine);
  });

  it('clearSelection empties everything (hidden ids included) and is a no-op when empty', () => {
    const onChange = vi.fn();
    const { result, rerender } = setup({ defaultSelectedIds: new Set(['a', 'b']), onSelectedIdsChange: onChange });
    rerender({ defaultSelectedIds: new Set(['a', 'b']), onSelectedIdsChange: onChange, filter: 'open' });
    expect(result.current.selection.hiddenSelectedCount).toBe(1);
    act(() => result.current.selection.clearSelection());
    expect(result.current.selection.selectedIds.size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => result.current.selection.clearSelection());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('useListReport selection: controlled', () => {
  it('follows selectedIds from outside with no callback (no echo)', () => {
    const onChange = vi.fn();
    const { result, rerender } = setup({ selectedIds: new Set(['a']), onSelectedIdsChange: onChange });
    expect(result.current.selection.selectedResultCount).toBe(1);
    rerender({ selectedIds: new Set(['a', 'b', 'c']), onSelectedIdsChange: onChange });
    expect(result.current.selection.selectedResultCount).toBe(3);
    expect(result.current.selection.isSelected('c')).toBe(true);
    expect(result.current.selection.allResultsState).toBe('indeterminate');
    rerender({ selectedIds: new Set(), onSelectedIdsChange: onChange });
    expect(result.current.selection.selectedResultCount).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a gesture only reports: the state moves when the parent applies it, and the received Set is never mutated', () => {
    const onChange = vi.fn();
    const outside = new Set(['a']);
    const { result, rerender } = setup({ selectedIds: outside, onSelectedIdsChange: onChange });
    act(() => result.current.selection.toggle('b'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0]?.[0] as ReadonlySet<string>;
    expect(ids(emitted)).toEqual(['a', 'b']);
    expect(ids(outside)).toEqual(['a']);
    expect(result.current.selection.isSelected('b')).toBe(false); // not applied yet
    rerender({ selectedIds: emitted, onSelectedIdsChange: onChange });
    expect(result.current.selection.isSelected('b')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1); // applying it is not a new gesture
  });

  it('every gesture reports exactly once', () => {
    const onChange = vi.fn();
    const { result } = setup({ selectedIds: new Set(['a']), onSelectedIdsChange: onChange });
    act(() => result.current.selection.toggle('b'));
    act(() => result.current.selection.toggleAllResults());
    act(() => result.current.selection.setSelectedIds(new Set(['c'])));
    act(() => result.current.selection.clearSelection());
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe('useListReport selection: the effective selection is selected ∩ results', () => {
  it('sorting, filtering, searching and new data never change the state; the counts follow', () => {
    const onChange = vi.fn();
    const { result, rerender } = setup({ defaultSelectedIds: new Set(['a', 'b']), onSelectedIdsChange: onChange });
    const sel = () => result.current.selection;
    expect(sel().selectedResultCount).toBe(2);
    expect(sel().hiddenSelectedCount).toBe(0);

    act(() => result.current.toggleSort('amount'));
    expect(ids(sel().selectedIds)).toEqual(['a', 'b']);
    expect(sel().selectedResultCount).toBe(2);

    act(() => result.current.setFilter('open')); // b is closed
    expect(ids(sel().selectedIds)).toEqual(['a', 'b']);
    expect(sel().selectedResultCount).toBe(1);
    expect(sel().hiddenSelectedCount).toBe(1);
    expect(sel().allResultsState).toBe('indeterminate'); // a of a, c

    act(() => result.current.setSearchDraft('charlie'));
    act(() => result.current.commitSearch());
    expect(sel().selectedResultCount).toBe(0);
    expect(sel().hiddenSelectedCount).toBe(2);
    expect(sel().allResultsState).toBe(false);

    act(() => result.current.clearFilters());
    expect(sel().selectedResultCount).toBe(2);
    expect(sel().hiddenSelectedCount).toBe(0);

    // A selected id that leaves the data is ignored by the counts, not pruned; it counts again when it is back.
    rerender({ defaultSelectedIds: new Set(['a', 'b']), onSelectedIdsChange: onChange, rows: ROWS.filter((r) => r.id !== 'b') });
    expect(ids(sel().selectedIds)).toEqual(['a', 'b']);
    expect(sel().selectedResultCount).toBe(1);
    expect(sel().hiddenSelectedCount).toBe(0);
    expect(sel().allResultsState).toBe('indeterminate');
    rerender({ defaultSelectedIds: new Set(['a', 'b']), onSelectedIdsChange: onChange, rows: ROWS });
    expect(sel().selectedResultCount).toBe(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allResultsState: false with no results, true when every result is selected', () => {
    const { result, rerender } = setup({ selectedIds: new Set(['a', 'c']) });
    expect(result.current.selection.allResultsState).toBe('indeterminate');
    rerender({ selectedIds: new Set(['a', 'c']), filter: 'open' });
    expect(result.current.selection.allResultsState).toBe(true);
    rerender({ selectedIds: new Set(['a', 'c']), rows: [] });
    expect(result.current.selection.allResultsState).toBe(false);
  });

  it('toggleAllResults from false / indeterminate adds the results, from true removes them and keeps the hidden ids', () => {
    const { result } = setup({ defaultSelectedIds: new Set(['b']), defaultFilter: 'open' });
    const sel = () => result.current.selection;
    expect(sel().allResultsState).toBe(false);
    expect(sel().hiddenSelectedCount).toBe(1);
    act(() => sel().toggleAllResults());
    expect(ids(sel().selectedIds)).toEqual(['a', 'b', 'c']);
    expect(sel().allResultsState).toBe(true);
    act(() => sel().toggleAllResults());
    expect(ids(sel().selectedIds)).toEqual(['b']); // b is hidden by the pill: left alone
    act(() => sel().toggle('a'));
    expect(sel().allResultsState).toBe('indeterminate');
    act(() => sel().toggleAllResults());
    expect(ids(sel().selectedIds)).toEqual(['a', 'b', 'c']);
  });

  it('toggleAllResults is a no-op with no results', () => {
    const onChange = vi.fn();
    const { result } = setup({ rows: [], onSelectedIdsChange: onChange });
    act(() => result.current.selection.toggleAllResults());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('getSelectedRows returns selected ∩ results in the current order', () => {
    const { result } = setup({ defaultSelectedIds: new Set(['a', 'b', 'c', 'zzz']), defaultSort: { columnId: 'amount', direction: 'desc' } });
    expect(result.current.selection.getSelectedRows().map((r) => r.id)).toEqual(['a', 'c', 'b']);
    act(() => result.current.setFilter('open'));
    expect(result.current.selection.getSelectedRows().map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('useListReport selection: getRowLabel', () => {
  it('defaults to the text of the first column with an accessor, else the row id', () => {
    const { result } = setup();
    const label = result.current.selection.getRowLabel;
    expect(label(ROWS[0] as Row)).toBe('Alpha');
    expect(label(ROWS[3] as Row)).toBe('d'); // null name
  });

  it('skips columns without accessor and falls back to the id without any', () => {
    const { result, rerender } = setup({ columns: [{ id: 'x', header: 'X', cell: () => 'x' }, ...COLUMNS.slice(1)] });
    expect(result.current.selection.getRowLabel(ROWS[0] as Row)).toBe('30');
    rerender({ columns: [{ id: 'x', header: 'X', cell: () => 'x' }] });
    expect(result.current.selection.getRowLabel(ROWS[0] as Row)).toBe('a');
  });

  it('uses the option when given', () => {
    const { result } = setup({ getRowLabel: (r) => `Invoice ${r.id}` });
    expect(result.current.selection.getRowLabel(ROWS[1] as Row)).toBe('Invoice b');
  });
});

describe('useListReport selection: work on the data, not per row', () => {
  it('100,000 rows: a change of selection calls getRowId zero times, select all is linear', () => {
    const many = Array.from({ length: 100_000 }, (_, i): Row => ({ id: `r${i}`, name: `Row ${i}`, open: i % 2 === 0, amount: i }));
    const counted = vi.fn(getRowId);
    const { result } = setup({ rows: many, getRowId: counted });
    counted.mockClear();
    act(() => result.current.selection.toggle('r5'));
    expect(counted).toHaveBeenCalledTimes(0);
    act(() => result.current.selection.toggleAllResults());
    expect(counted).toHaveBeenCalledTimes(0);
    expect(result.current.selection.selectedResultCount).toBe(100_000);
    expect(result.current.selection.allResultsState).toBe(true);
    // A change of the results computes their ids once: O(n), never O(n²).
    act(() => result.current.setFilter('open'));
    expect(counted.mock.calls.length).toBeLessThanOrEqual(100_000);
    expect(result.current.selection.selectedResultCount).toBe(50_000);
    expect(result.current.selection.hiddenSelectedCount).toBe(50_000);
  });
});
