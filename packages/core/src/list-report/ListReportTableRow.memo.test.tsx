import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ListReportTable } from './ListReportTable';
import type { ListReportColumn } from './types';
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
