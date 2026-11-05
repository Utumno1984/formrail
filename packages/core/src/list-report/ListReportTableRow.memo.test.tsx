import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListReportTable } from './ListReportTable';
import { ListReportTableRow, type ListReportTableRowProps } from './ListReportTableRow';
import type { ListReportColumn, UseListReportReturn } from './types';
import { useListReport } from './use-list-report';

interface Item {
  id: string;
  name: string;
}

const ROWS: Item[] = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
/** One `cell` call is one render of that row. */
const renders = new Map<string, number>();
const countingColumns = (): ListReportColumn<Item>[] => [
  {
    id: 'name',
    header: 'Name',
    accessor: (r) => r.name,
    cell: (r) => {
      renders.set(r.id, (renders.get(r.id) ?? 0) + 1);
      return r.name;
    },
  },
];
const COLUMNS = countingColumns();
const rendered = () => [...renders.entries()].filter(([, n]) => n > 0).map(([id]) => id).sort();

let rerender: () => void;
let setColumns: (columns: ListReportColumn<Item>[]) => void;
let setRows: (rows: Item[]) => void;

function Host() {
  const [, setTick] = useState(0);
  const [columns, setCols] = useState(COLUMNS);
  const [rows, setRowList] = useState(ROWS);
  rerender = () => setTick((t) => t + 1);
  setColumns = setCols;
  setRows = setRowList;
  // Inline `getRowId` on purpose: its identity changes on every render.
  const table = useListReport<Item>({ rows, columns, getRowId: (r) => r.id, selectable: true });
  return <ListReportTable table={table} aria-label="Items" />;
}

beforeEach(() => renders.clear());
afterEach(cleanup);

describe('ListReportTableRow memoization', () => {
  it('a parent render that changes nothing renders no row, even with an inline getRowId', () => {
    render(<Host />);
    renders.clear();
    act(() => rerender());
    expect(rendered()).toEqual([]);
  });

  it('selecting a row renders only that row', () => {
    render(<Host />);
    renders.clear();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Item 1' }));
    expect(screen.getByRole('checkbox', { name: 'Select Item 1' })).toBeChecked();
    expect(rendered()).toEqual(['r1']);
  });

  it('a new row object renders only that row; new columns render every row', () => {
    render(<Host />);
    renders.clear();
    act(() => setRows(ROWS.map((r) => (r.id === 'r2' ? { ...r } : r))));
    expect(rendered()).toEqual(['r2']);
    renders.clear();
    act(() => setColumns(countingColumns()));
    expect(rendered()).toEqual(['r0', 'r1', 'r2', 'r3']);
  });

  it('a changed selection label (accessor of the label column) updates the checkbox name', () => {
    render(<Host />);
    act(() => setColumns([{ id: 'name', header: 'Name', accessor: (r) => `${r.name}!` }]));
    expect(screen.getByRole('checkbox', { name: 'Select Item 1!' })).toBeInTheDocument();
  });
});

describe('ListReportTableRow comparator', () => {
  type Props = ListReportTableRowProps<Item>;
  const ROW = ROWS[0] as Item;
  const LABELS = { selectRow: (label: string) => `Select ${label}` } as Props['labels'];
  const noToggle = () => undefined;
  const makeTable = (over: { getRowId?: (r: Item) => string; toggle?: (id: string) => void; getRowLabel?: (r: Item) => string } = {}) =>
    ({
      columns: COLUMNS,
      getRowId: over.getRowId ?? ((r: Item) => r.id),
      selection: { isSelected: () => false, toggle: over.toggle ?? noToggle, getRowLabel: over.getRowLabel ?? ((r: Item) => r.name) },
    }) as unknown as UseListReportReturn<Item>;
  const ui = (props: Partial<Props> = {}) => (
    <table>
      <tbody>
        <ListReportTableRow table={makeTable()} row={ROW} selectable labels={LABELS} {...props} />
      </tbody>
    </table>
  );
  const tr = () => document.querySelector('tbody tr') as HTMLTableRowElement;

  it('new `table` and `rowProps` objects with the same content render nothing', () => {
    const { rerender: update } = render(ui({ rowProps: { id: 'a', title: 't' } }));
    renders.clear();
    update(ui({ rowProps: { id: 'a', title: 't' } }));
    expect(rendered()).toEqual([]);
  });

  it('applies a changed, an added and a removed `rowProps` key, with and without an object', () => {
    const { rerender: update } = render(ui({ rowProps: { title: 'a' } }));
    update(ui({ rowProps: { title: 'b' } }));
    expect(tr().title).toBe('b');
    update(ui({ rowProps: { title: 'b', id: 'x' } }));
    expect(tr().id).toBe('x');
    update(ui({ rowProps: { id: 'x', lang: 'en' } }));
    expect(tr().title).toBe('');
    expect(tr().lang).toBe('en');
    update(ui());
    expect(tr().id).toBe('');
    update(ui({ rowProps: { id: 'y' } }));
    expect(tr().id).toBe('y');
  });

  it('`selectable` turned off removes the checkbox', () => {
    const { rerender: update } = render(ui());
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    update(ui({ selectable: false }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('calls the current `onToggle`, not the one of the first render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender: update } = render(ui({ onToggle: first }));
    update(ui({ onToggle: second }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('calls the current `selection.toggle` with the current id', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender: update } = render(ui({ table: makeTable({ toggle: first }) }));
    update(ui({ table: makeTable({ toggle: second }) }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('r0');
    update(ui({ table: makeTable({ toggle: second, getRowId: () => 'other' }) }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(second).toHaveBeenLastCalledWith('other');
  });

  it('a changed `renderCellOptions` renders the row', () => {
    const { rerender: update } = render(ui());
    renders.clear();
    update(ui({ renderCellOptions: { forceTruncate: true } }));
    expect(rendered()).toEqual(['r0']);
  });

  it('a changed `labels.selectRow` updates the checkbox name', () => {
    const { rerender: update } = render(ui());
    update(ui({ labels: { ...LABELS, selectRow: (label: string) => `Pick ${label}` } }));
    expect(screen.getByRole('checkbox', { name: 'Pick Item 0' })).toBeInTheDocument();
  });

  it('a selection label changed with the same `columns` updates the checkbox name', () => {
    const { rerender: update } = render(ui());
    update(ui({ table: makeTable({ getRowLabel: () => 'other' }) }));
    expect(screen.getByRole('checkbox', { name: 'Select other' })).toBeInTheDocument();
  });

  it('a non-selectable row ignores a changed selection label', () => {
    const { rerender: update } = render(ui({ selectable: false }));
    renders.clear();
    update(ui({ selectable: false, table: makeTable({ getRowLabel: () => 'other' }) }));
    expect(rendered()).toEqual([]);
  });
});
