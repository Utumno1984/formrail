import { Suspense, lazy, startTransition, useMemo, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useListReport, type ListReportColumn } from '@formrail/core';
import { VirtualListReportTable } from './VirtualListReportTable';
import { PITCH, mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
}

const ROWS: Item[] = Array.from({ length: 5_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));

/** Cell renders per row id: one `cell` call is one render of that row. */
const renders = new Map<string, number>();
const countingColumns = (suffix = ''): ListReportColumn<Item>[] => [
  {
    id: 'name',
    header: 'Name',
    accessor: (r) => r.name,
    cell: (r) => {
      renders.set(r.id, (renders.get(r.id) ?? 0) + 1);
      return r.name + suffix;
    },
  },
];
const COLUMNS = countingColumns();

interface Controls {
  rerender: () => void;
  setColumns: (c: ListReportColumn<Item>[]) => void;
  setRows: (r: Item[]) => void;
  setSelectRow: (f: (label: string) => string) => void;
  setFilter: (f: string) => void;
  setSuspended: (suspended: boolean) => void;
}
let controls: Controls;

/** Suspends forever: the transition that mounts it renders but never commits. */
const NeverReady = lazy(() => new Promise<{ default: () => null }>(() => undefined));

function Host() {
  const [, setTick] = useState(0);
  const [columns, setColumns] = useState(COLUMNS);
  const [rows, setRows] = useState(ROWS);
  const [selectRow, setSelectRow] = useState<(label: string) => string>(() => (label: string) => `Select ${label}`);
  const [filter, setFilter] = useState('all');
  const [suspended, setSuspended] = useState(false);
  controls = { rerender: () => setTick((t) => t + 1), setColumns, setRows, setSelectRow: (f) => setSelectRow(() => f), setFilter, setSuspended };
  const filters = useMemo(
    () => [
      { id: 'all', label: 'All' },
      { id: 'odd', label: 'Odd', predicate: (r: Item) => Number(r.id.slice(1)) % 2 === 1 },
      { id: 'few', label: 'Few', predicate: (r: Item) => Number(r.id.slice(1)) < 10 },
    ],
    [],
  );
  const table = useListReport<Item>({ rows, columns, getRowId: (r) => r.id, selectable: true, filters, filter });
  const labels = useMemo(() => ({ selectRow }), [selectRow]);
  return (
    <Suspense fallback={null}>
      <VirtualListReportTable table={table} aria-label="Items" labels={labels} />
      {suspended ? <NeverReady /> : null}
    </Suspense>
  );
}

const scroller = () => screen.getByRole('table', { name: 'Items' }).parentElement as HTMLElement;
const mountedIds = () =>
  Array.from(scroller().querySelectorAll('tbody > tr[aria-rowindex] input[type="checkbox"]')).map((el) =>
    (el.getAttribute('aria-label') ?? '').replace(/^.*Item /, 'r'),
  );
const scrollBy = (rows: number) => {
  act(() => {
    scroller().scrollTop = rows * PITCH;
    fireEvent.scroll(scroller());
  });
};
const rendered = () => [...renders.entries()].filter(([, n]) => n > 0).map(([id]) => id).sort();
const reset = () => renders.clear();

let layout: ReturnType<typeof mockTableLayout>;
beforeEach(() => {
  layout = mockTableLayout();
  renders.clear();
});
afterEach(() => {
  cleanup();
  layout.restore();
});

describe('ListReportTableRow memoization in the virtualized table', () => {
  it('a range change renders only the rows that enter the range', () => {
    render(<Host />);
    const before = mountedIds();
    reset();
    scrollBy(5);
    const after = mountedIds();
    const entering = after.filter((id) => !before.includes(id)).sort();
    expect(entering.length).toBeGreaterThan(0);
    expect(entering.length).toBeLessThan(after.length);
    expect(rendered()).toEqual(entering);
    for (const [, n] of renders) expect(n).toBe(1);
  });

  it('a render of the parent that changes nothing renders no row', () => {
    render(<Host />);
    reset();
    act(() => controls.rerender());
    expect(rendered()).toEqual([]);
  });

  it('selecting a row renders only that row, and its checkbox reflects it', () => {
    render(<Host />);
    reset();
    const box = screen.getByRole('checkbox', { name: 'Select Item 3' });
    fireEvent.click(box);
    expect(screen.getByRole('checkbox', { name: 'Select Item 3' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Item 4' })).not.toBeChecked();
    expect(rendered()).toEqual(['r3']);
  });

  it('deselecting renders only that row', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    reset();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    expect(screen.getByRole('checkbox', { name: 'Select Item 3' })).not.toBeChecked();
    expect(rendered()).toEqual(['r3']);
  });

  it('a shift-click range after scrolling uses the live selection and results', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Item 2' }));
    scrollBy(3);
    reset();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Item 6' }), { shiftKey: true });
    for (const n of [2, 3, 4, 5, 6]) expect(screen.getByRole('checkbox', { name: `Select Item ${n}` })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Item 7' })).not.toBeChecked();
    // Only the rows whose state changed (3..6; 2 was already selected) render.
    expect(rendered()).toEqual(['r3', 'r4', 'r5', 'r6']);
  });

  it('a shift-click keeps a selection made outside its range and follows a clicked row already selected', () => {
    render(<Host />);
    const box = (n: number) => screen.getByRole('checkbox', { name: `Select Item ${n}` });
    fireEvent.click(box(9));
    fireEvent.click(box(2));
    fireEvent.click(box(4), { shiftKey: true });
    for (const n of [2, 3, 4, 9]) expect(box(n)).toBeChecked();
    // The clicked row is selected: the gesture deselects the range, and only the range.
    fireEvent.click(box(2));
    fireEvent.click(box(2));
    fireEvent.click(box(3), { shiftKey: true });
    for (const n of [2, 3]) expect(box(n)).not.toBeChecked();
    for (const n of [4, 9]) expect(box(n)).toBeChecked();
  });

  it('a shift-click after a filter walks the current results, not those of the first render', () => {
    render(<Host />);
    act(() => controls.setFilter('odd'));
    const box = (n: number) => screen.getByRole('checkbox', { name: `Select Item ${n}` });
    fireEvent.click(box(1));
    fireEvent.click(box(5), { shiftKey: true });
    for (const n of [1, 3, 5]) expect(box(n)).toBeChecked();
    expect(box(7)).not.toBeChecked();
    act(() => controls.setFilter('all'));
    for (const n of [0, 2, 4, 7]) expect(box(n)).not.toBeChecked();
    for (const n of [1, 3, 5]) expect(box(n)).toBeChecked();
  });

  it('a shift-click during a suspended transition walks the results on screen, not the pending ones', async () => {
    render(<Host />);
    const box = (n: number) => screen.getByRole('checkbox', { name: `Select Item ${n}` });
    fireEvent.click(box(1));
    await act(async () => {
      startTransition(() => {
        controls.setSuspended(true);
        controls.setFilter('odd');
      });
      await Promise.resolve();
    });
    // The transition is rendered, not committed: the even rows are still on screen.
    fireEvent.click(box(4), { shiftKey: true });
    for (const n of [1, 2, 3, 4]) expect(box(n)).toBeChecked();
    expect(box(5)).not.toBeChecked();
  });

  it('the handlers cache never holds more than the mounted rows, however far the scroll went', () => {
    const maps = new Set<Map<unknown, unknown>>();
    const realSet = Map.prototype.set;
    const spy = vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key, value) {
      if ((value as { onBlur?: unknown } | null)?.onBlur) maps.add(this);
      return realSet.call(this, key, value);
    });
    render(<Host />);
    for (let rows = 100; rows <= 1_000; rows += 100) scrollBy(rows);
    spy.mockRestore();
    expect(maps.size).toBeGreaterThan(0);
    const mounted = mountedIds().length;
    for (const map of maps) expect(map.size).toBeLessThanOrEqual(mounted);
  });

  it('changing the columns renders every mounted row with the new cell', () => {
    render(<Host />);
    const mounted = mountedIds();
    reset();
    act(() => controls.setColumns(countingColumns(' !')));
    expect(rendered()).toEqual([...mounted].sort());
    expect(screen.getByText('Item 3 !')).toBeInTheDocument();
  });

  it('changing labels.selectRow renders every mounted row with the new name', () => {
    render(<Host />);
    const mounted = mountedIds();
    reset();
    act(() => controls.setSelectRow((label) => `Pick ${label}`));
    expect(rendered()).toEqual([...mounted].sort());
    expect(screen.getByRole('checkbox', { name: 'Pick Item 3' })).toBeInTheDocument();
  });

  it('replacing one row object renders only that row', () => {
    render(<Host />);
    reset();
    act(() => controls.setRows(ROWS.map((r) => (r.id === 'r4' ? { ...r, name: 'Item 4' } : r))));
    expect(rendered()).toEqual(['r4']);
  });

  it('a filter that moves rows keeps aria-rowindex and the selected state of the surviving rows', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    act(() => controls.setFilter('odd'));
    const row = screen.getByRole('checkbox', { name: 'Select Item 3' }).closest('tr')!;
    // Odd ids only: r1 is index 0, r3 index 1; the header is rowindex 1.
    expect(row.getAttribute('aria-rowindex')).toBe('3');
    expect(screen.getByRole('checkbox', { name: 'Select Item 3' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Item 5' }).closest('tr')!.getAttribute('aria-rowindex')).toBe('4');
  });

  it('crossing the threshold gives the rows the right props in both directions', () => {
    render(<Host />);
    const row = () => screen.getByRole('checkbox', { name: 'Select Item 3' }).closest('tr')!;
    expect(row().getAttribute('aria-rowindex')).toBe('5');
    expect(row().classList.contains('rop-pro-virtual-row')).toBe(true);
    act(() => controls.setFilter('few'));
    expect(row().hasAttribute('aria-rowindex')).toBe(false);
    expect(row().classList.contains('rop-pro-virtual-row')).toBe(false);
    act(() => controls.setFilter('all'));
    expect(row().getAttribute('aria-rowindex')).toBe('5');
    expect(row().classList.contains('rop-pro-virtual-row')).toBe(true);
  });

  it('a jump of the whole range renders each new row once and not the pinned focused row', () => {
    render(<Host />);
    const box = screen.getByRole('checkbox', { name: 'Select Item 3' });
    act(() => box.focus());
    reset();
    scrollBy(2_000);
    expect(mountedIds()).toContain('r3');
    expect(renders.has('r3')).toBe(false);
    expect(renders.size).toBeGreaterThan(0);
    for (const [, n] of renders) expect(n).toBe(1);
  });
});
