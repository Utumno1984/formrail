import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListReportColumn, ListReportSort, UseListReportOptions } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  name?: string | null;
  amount?: unknown;
}

const col = (id: string, extra: Partial<ListReportColumn<Row>> = {}): ListReportColumn<Row> => ({
  id,
  header: id,
  accessor: (r) => (r as unknown as Record<string, unknown>)[id],
  ...extra,
});

const ROWS: Row[] = [
  { id: 'a', name: 'b', amount: 10 },
  { id: 'b', name: 'a', amount: 2 },
  { id: 'c', name: 'c', amount: null },
  { id: 'd', name: 'a', amount: 2 },
];
const COLUMNS = [col('name'), col('amount')];
const getRowId = (r: Row) => r.id;
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);

function setup(options: Partial<UseListReportOptions<Row>> = {}) {
  return renderHook((props: Partial<UseListReportOptions<Row>>) =>
    useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, ...props }),
    { initialProps: options },
  );
}

describe('useListReport: rows and the cycle', () => {
  it('keeps the input order without a sort and never mutates a frozen input', () => {
    const rows = Object.freeze(ROWS.map((r) => Object.freeze({ ...r }))) as Row[];
    const { result } = setup({ rows });
    expect(result.current.rows).toBe(rows);
    act(() => result.current.toggleSort('amount'));
    expect(ids(result.current.rows)).toEqual(['b', 'd', 'a', 'c']);
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cycles asc -> desc -> none and restores the original order', () => {
    const { result } = setup();
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'asc' });
    expect(ids(result.current.rows)).toEqual(['b', 'd', 'a', 'c']);
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'desc' });
    expect(ids(result.current.rows)).toEqual(['a', 'b', 'd', 'c']);
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toBeNull();
    expect(ids(result.current.rows)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('honours firstSortDirection: desc -> asc -> none', () => {
    const { result } = setup({ columns: [col('amount', { firstSortDirection: 'desc' })] });
    const dirs: (string | undefined)[] = [];
    for (let i = 0; i < 3; i += 1) {
      act(() => result.current.toggleSort('amount'));
      dirs.push(result.current.sort?.direction);
    }
    expect(dirs).toEqual(['desc', 'asc', undefined]);
  });

  it('switching column starts from the new column first direction (single column)', () => {
    const { result } = setup({
      columns: [col('name'), col('amount', { firstSortDirection: 'desc' })],
      defaultSort: { columnId: 'name', direction: 'desc' },
    });
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'desc' });
    expect(result.current.getHeaderProps('name')).toEqual({});
  });

  it('a non-sortable column: toggleSort is a no-op, no onSortChange, no handler and no aria-sort', () => {
    const onSortChange = vi.fn();
    const { result } = setup({ columns: [col('name', { sortable: false }), { id: 'x', header: 'x' }], onSortChange });
    act(() => result.current.toggleSort('name'));
    act(() => result.current.toggleSort('x'));
    act(() => result.current.toggleSort('missing'));
    expect(onSortChange).not.toHaveBeenCalled();
    expect(result.current.sort).toBeNull();
    expect(result.current.getHeaderProps('name')).toEqual({});
    expect(result.current.getSortButtonProps('name')).toEqual({});
    expect(result.current.getSortButtonProps('x')).toEqual({});
  });

  it('sortable defaults to true with compare only', () => {
    const { result } = setup({ columns: [{ id: 'c', header: 'c', compare: (a, b) => a.id.localeCompare(b.id) }] });
    expect(result.current.getSortButtonProps('c').onClick).toBeTypeOf('function');
  });

  it('works on empty rows', () => {
    const { result } = setup({ rows: [] });
    act(() => result.current.toggleSort('amount'));
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'asc' });
    expect(result.current.rows).toEqual([]);
  });

  it('sorts a new rows array with the same criterion', () => {
    const { result, rerender } = setup({ defaultSort: { columnId: 'amount', direction: 'asc' } });
    rerender({ rows: [{ id: 'z', amount: 5 }, { id: 'y', amount: 1 }] });
    expect(ids(result.current.rows)).toEqual(['y', 'z']);
  });
});

describe('useListReport: default comparator', () => {
  const sorted = (values: unknown[], direction: 'asc' | 'desc', locale?: string) => {
    const rows = values.map((amount, i) => ({ id: String(i), amount }));
    const { result } = renderHook(() =>
      useListReport<Row>({
        rows,
        columns: [col('amount')],
        getRowId,
        defaultSort: { columnId: 'amount', direction },
        locale,
      }),
    );
    return result.current.rows.map((r) => r.amount);
  };

  it('numbers numerically (2 before 10)', () => {
    expect(sorted([10, 2, 33, 1], 'asc')).toEqual([1, 2, 10, 33]);
  });

  it('strings: numeric, case and diacritics insensitive', () => {
    expect(sorted(['Invoice 10', 'Invoice 2', 'invoice 1'], 'asc')).toEqual(['invoice 1', 'Invoice 2', 'Invoice 10']);
    const rows = [
      { id: 'x', amount: 'café' },
      { id: 'y', amount: 'Cafe' },
      { id: 'z', amount: 'cafè' },
    ];
    const { result } = renderHook(() =>
      useListReport<Row>({ rows, columns: [col('amount')], getRowId, defaultSort: { columnId: 'amount', direction: 'desc' } }),
    );
    // all equal under the collator: the input order holds in both directions
    expect(ids(result.current.rows)).toEqual(['x', 'y', 'z']);
  });

  it('honours the locale option', () => {
    // Swedish sorts "ä" after "z"; with sensitivity base "a" and "ä" differ only by locale rules
    expect(sorted(['ä', 'z', 'a'], 'asc', 'sv')).toEqual(['a', 'z', 'ä']);
  });

  it('dates by time and booleans false < true', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2025-01-01');
    expect(sorted([d2, d1], 'asc')).toEqual([d1, d2]);
    expect(sorted([true, false, true], 'asc')).toEqual([false, true, true]);
  });

  it('mixed types are compared as String(...)', () => {
    expect(sorted([10, 'b', 2, 'a'], 'asc')).toEqual([2, 10, 'a', 'b']);
  });

  it('null, undefined, empty string, NaN and Invalid Date go last in both directions', () => {
    const empties = [null, undefined, '', Number.NaN, new Date('nope')];
    for (const direction of ['asc', 'desc'] as const) {
      const out = sorted([empties[0], 3, empties[1], 1, empties[2], empties[3], 2, empties[4]], direction);
      const expected = direction === 'asc' ? [1, 2, 3] : [3, 2, 1];
      expect(out.slice(0, 3)).toEqual(expected);
      expect(out.slice(3)).toHaveLength(5);
      expect(out.slice(3)).toEqual([null, undefined, '', Number.NaN, empties[4]]); // input order kept
    }
  });

  it('is stable on duplicate keys in both directions', () => {
    for (const direction of ['asc', 'desc'] as const) {
      const rows = [
        { id: '1', amount: 1 },
        { id: '2', amount: 2 },
        { id: '3', amount: 1 },
        { id: '4', amount: 2 },
        { id: '5', amount: 1 },
      ];
      const { result } = renderHook(() =>
        useListReport<Row>({ rows, columns: [col('amount')], getRowId, defaultSort: { columnId: 'amount', direction } }),
      );
      expect(ids(result.current.rows)).toEqual(direction === 'asc' ? ['1', '3', '5', '2', '4'] : ['2', '4', '1', '3', '5']);
    }
  });

  it('a custom compare replaces the default and the hook applies the direction', () => {
    const rows = [{ id: 'bb' }, { id: 'a' }, { id: 'ccc' }];
    const columns = [{ id: 'len', header: 'len', compare: (a: Row, b: Row) => a.id.length - b.id.length }];
    const asc = renderHook(() => useListReport<Row>({ rows, columns, getRowId, defaultSort: { columnId: 'len', direction: 'asc' } }));
    const desc = renderHook(() => useListReport<Row>({ rows, columns, getRowId, defaultSort: { columnId: 'len', direction: 'desc' } }));
    expect(ids(asc.result.current.rows)).toEqual(['a', 'bb', 'ccc']);
    expect(ids(desc.result.current.rows)).toEqual(['ccc', 'bb', 'a']);
  });

  it('an accessor that throws propagates the error', () => {
    const boom = col('amount', { accessor: () => { throw new Error('boom'); } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderHook(() => useListReport<Row>({ rows: ROWS, columns: [boom], getRowId, defaultSort: { columnId: 'amount', direction: 'asc' } })),
    ).toThrow('boom');
  });
});

describe('useListReport: controlled / uncontrolled', () => {
  it('uncontrolled calls onSortChange once per gesture', () => {
    const onSortChange = vi.fn();
    const { result } = setup({ onSortChange });
    act(() => result.current.toggleSort('name'));
    act(() => result.current.setSort({ columnId: 'amount', direction: 'desc' }));
    expect(onSortChange.mock.calls).toEqual([
      [{ columnId: 'name', direction: 'asc' }],
      [{ columnId: 'amount', direction: 'desc' }],
    ]);
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'desc' });
  });

  it('controlled: the gesture only reports, the parent decides; no echo when the parent changes sort', () => {
    const onSortChange = vi.fn();
    const { result, rerender } = setup({ sort: null, onSortChange });
    act(() => result.current.toggleSort('name'));
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(result.current.sort).toBeNull(); // the parent has not applied it
    rerender({ sort: { columnId: 'amount', direction: 'asc' }, onSortChange });
    rerender({ sort: { columnId: 'name', direction: 'desc' }, onSortChange });
    rerender({ sort: null, onSortChange });
    expect(onSortChange).toHaveBeenCalledTimes(1);
    rerender({ sort: { columnId: 'amount', direction: 'asc' }, onSortChange });
    expect(ids(result.current.rows)).toEqual(['b', 'd', 'a', 'c']);
    act(() => result.current.toggleSort('amount'));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
  });

  it('sort pointing at a missing or non-sortable column: original order, one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, rerender } = setup({ sort: { columnId: 'ghost', direction: 'asc' } });
    rerender({ sort: { columnId: 'ghost', direction: 'asc' } });
    expect(result.current.rows).toBe(ROWS);
    expect(result.current.sort).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('ghost');
    const fixed = setup({ columns: [col('name', { sortable: false })], sort: { columnId: 'name', direction: 'asc' } });
    expect(fixed.result.current.rows).toBe(ROWS);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('removing the sorted column resets an uncontrolled sort to null, without crashing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, rerender } = setup({ defaultSort: { columnId: 'amount', direction: 'asc' } });
    rerender({ columns: [col('name')] });
    expect(result.current.sort).toBeNull();
    expect(result.current.rows).toBe(ROWS);
    rerender({ columns: COLUMNS }); // the column is back: the sort does not resurrect
    expect(result.current.sort).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('uncontrolled defaultSort or setSort on a missing column warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setup({ defaultSort: { columnId: 'ghost', direction: 'asc' } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('ghost');
    const { result } = setup();
    act(() => result.current.setSort({ columnId: 'phantom', direction: 'asc' }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]![0]).toContain('phantom');
    expect(result.current.rows).toBe(ROWS);
  });

  it('defaultSort waits for asynchronously loaded columns and then applies', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, rerender } = setup({ columns: [], defaultSort: { columnId: 'amount', direction: 'asc' } });
    expect(result.current.rows).toBe(ROWS);
    expect(warn).not.toHaveBeenCalled();
    rerender({ columns: COLUMNS, defaultSort: { columnId: 'amount', direction: 'asc' } });
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'asc' });
    expect(ids(result.current.rows)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('two toggleSort calls in the same batch advance the cycle twice', () => {
    const { result } = setup();
    act(() => {
      result.current.toggleSort('amount');
      result.current.toggleSort('amount');
    });
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'desc' });
  });

  it('sortable: true without accessor or compare is not sortable and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = setup({ columns: [{ id: 'x', header: 'x', sortable: true }] });
    expect(result.current.getSortButtonProps('x')).toEqual({});
    act(() => result.current.toggleSort('x'));
    expect(result.current.sort).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('"x"');
  });
});

describe('useListReport: header props, identities, warnings', () => {
  it('aria-sort only on the sorted column; the sort button has type and onClick', () => {
    const { result } = setup({ defaultSort: { columnId: 'name', direction: 'desc' } });
    expect(result.current.getHeaderProps('name')).toEqual({ 'aria-sort': 'descending' });
    expect(result.current.getHeaderProps('amount')).toEqual({});
    act(() => result.current.setSort({ columnId: 'name', direction: 'asc' }));
    expect(result.current.getHeaderProps('name')).toEqual({ 'aria-sort': 'ascending' });
    const button = result.current.getSortButtonProps('amount');
    expect(button.type).toBe('button');
    act(() => button.onClick!());
    expect(result.current.sort).toEqual({ columnId: 'amount', direction: 'asc' });
  });

  it('keeps identities across rerenders with the same inputs', () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender({});
    expect(result.current.rows).toBe(first.rows);
    expect(result.current.toggleSort).toBe(first.toggleSort);
    expect(result.current.setSort).toBe(first.setSort);
    expect(result.current.getHeaderProps).toBe(first.getHeaderProps);
    expect(result.current.getSortButtonProps).toBe(first.getSortButtonProps);
    act(() => result.current.toggleSort('name'));
    const sortedRows = result.current.rows;
    rerender({});
    expect(result.current.rows).toBe(sortedRows);
  });

  it('keeps toggleSort identity with an inline onSortChange and still calls the latest one', () => {
    const calls: string[] = [];
    const { result, rerender } = setup({ onSortChange: () => calls.push('one') });
    const toggle = result.current.toggleSort;
    rerender({ onSortChange: () => calls.push('two') });
    expect(result.current.toggleSort).toBe(toggle);
    act(() => toggle('name'));
    expect(calls).toEqual(['two']);
  });

  it('warns once, naming the id, for duplicate column ids and duplicate row ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = setup({
      columns: [col('name'), col('name')],
      rows: [{ id: 'dup' }, { id: 'dup' }],
    });
    rerender({ columns: [col('name'), col('name')], rows: [{ id: 'dup' }, { id: 'dup' }] });
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m.includes('"name"'))).toBe(true);
    expect(messages.some((m) => m.includes('"dup"'))).toBe(true);
  });

  it('no warning for a clean setup', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setup({ defaultSort: { columnId: 'name', direction: 'asc' } });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('useListReport: no leak', () => {
  function Table({ onSort }: { onSort?: (s: ListReportSort) => void }) {
    const report = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, onSortChange: onSort });
    return (
      <table>
        <thead>
          <tr>
            {report.columns.map((c) => (
              <th key={c.id} {...report.getHeaderProps(c.id)}>
                <button {...report.getSortButtonProps(c.id)}>{c.id}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{String(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  it('spread on real th/button: no React warning, only valid attributes', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Table />);
    await user.click(screen.getByRole('button', { name: 'amount' }));
    const allowed = /^(type|aria-sort)$/;
    for (const el of [...screen.getAllByRole('columnheader'), ...screen.getAllByRole('button')]) {
      for (const name of el.getAttributeNames()) expect(name, `${el.tagName} ${name}`).toMatch(allowed);
    }
    expect(screen.getByRole('columnheader', { name: 'amount' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'name' })).not.toHaveAttribute('aria-sort');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
