import { useMemo, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useListReport, type ListReportColumn, type ListReportRowAction, type ListReportRowActions } from '@formrail/core';
import { VirtualListReport } from './VirtualListReport';
import { VirtualListReportTable } from './VirtualListReportTable';
import { PITCH, mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
  n: number;
}

const ROWS: Item[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}`, n: i }));
const COLUMNS: ListReportColumn<Item>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name, width: 200 },
  { id: 'n', header: 'Number', accessor: (r) => r.n, align: 'end' },
];

function Host({ rowActions, floorplan }: { rowActions: ListReportRowActions<Item>; floorplan?: boolean }) {
  const rows = useMemo(() => ROWS, []);
  const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
  return floorplan ? (
    <VirtualListReport title="Items" table={table} rowActions={rowActions} />
  ) : (
    <VirtualListReportTable table={table} aria-label="Items" rowActions={rowActions} />
  );
}

// `hidden`: an open modal menu hides the rest of the page from the accessibility tree.
const scroller = () => screen.getByRole('table', { hidden: true }).parentElement as HTMLElement;
const scrollTo = (top: number) => {
  act(() => {
    scroller().scrollTop = top;
    fireEvent.scroll(scroller());
  });
};
const trigger = (label: string) => screen.getByRole('button', { name: `Actions for ${label}`, hidden: true });

let layout: ReturnType<typeof mockTableLayout>;
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});
beforeEach(() => {
  layout = mockTableLayout();
});
afterEach(() => {
  cleanup();
  layout.restore();
  vi.restoreAllMocks();
});

const actions =
  (onSelect: ListReportRowAction['onSelect']): ListReportRowActions<Item> =>
  () => [{ id: 'dup', label: 'Duplicate', onSelect }];

describe('VirtualListReportTable rowActions', () => {
  it('virtualized: the same trailing column and a trigger per mounted row', () => {
    render(<Host rowActions={actions(() => {})} />);
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('colgroup > col')).toHaveLength(COLUMNS.length + 1);
    expect(screen.getAllByRole('columnheader').at(-1)).toHaveAccessibleName('Actions');
    const mounted = table.querySelectorAll('tbody > tr[aria-rowindex]');
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(ROWS.length);
    for (const row of mounted) expect(row.lastElementChild!.querySelector('button')).toHaveAttribute('aria-label', expect.stringMatching(/^Actions for Item \d+$/));
    // Spacers span the actions column too.
    expect(table.querySelector('tbody > tr[data-rop-spacer] td')).toHaveAttribute('colspan', String(COLUMNS.length + 1));
  });

  it('the menu of a mounted row: onSelect with the trigger as returnFocusRef', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Host rowActions={actions(onSelect)} />);
    await user.click(trigger('Item 2'));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].returnFocusRef.current).toBe(trigger('Item 2'));
  });

  it('a scroll far away with a menu open: no exception, the row stays mounted (the focus in its menu pins it), the menu stays on it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Host rowActions={actions(onSelect)} />);
    await user.click(trigger('Item 2'));
    await screen.findByRole('menu');
    expect(() => scrollTo(5_000 * PITCH)).not.toThrow();
    // The focus inside the (portalled) menu reaches the row through React's tree: the row is pinned.
    expect(trigger('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 5000')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].returnFocusRef.current).toBe(trigger('Item 2'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('the row with an open menu leaves the results: no exception, the menu closes, the focus goes to the container', async () => {
    const user = userEvent.setup();
    let setRows: (rows: Item[]) => void = () => {};
    function Removable() {
      const [rows, set] = useState(ROWS);
      setRows = set;
      const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
      return <VirtualListReportTable table={table} aria-label="Items" rowActions={actions(() => {})} />;
    }
    render(<Removable />);
    await user.click(trigger('Item 2'));
    await screen.findByRole('menu');
    expect(() => act(() => setRows(ROWS.filter((r) => r.id !== 'r2')))).not.toThrow();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(scroller()).toHaveFocus());
  });

  it('VirtualListReport passes rowActions to its table', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Host floorplan rowActions={actions(onSelect)} />);
    await user.click(trigger('Item 0'));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
