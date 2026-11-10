import { useMemo } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useListReport, type ListReportColumn, type ListReportRowAction, type ListReportRowActions } from '@react-object-page/core';
import { VirtualListReport } from './VirtualListReport';
import { VirtualListReportTable } from './VirtualListReportTable';
import { mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
  locked: boolean;
}

const ROWS: Item[] = Array.from({ length: 10_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}`, locked: i % 2 === 1 }));
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name, width: 200 }];

const trash = <svg />;

function Host({ rowActions, floorplan }: { rowActions: ListReportRowActions<Item>; floorplan?: boolean }) {
  const rows = useMemo(() => ROWS, []);
  const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
  return floorplan ? (
    <VirtualListReport title="Items" table={table} rowActions={rowActions} rowActionsInline={1} />
  ) : (
    <VirtualListReportTable table={table} aria-label="Items" rowActions={rowActions} rowActionsInline={1} />
  );
}

const rowOf = (name: string) => screen.getByRole('cell', { name }).closest('tr') as HTMLTableRowElement;
const form = (name: string, which: 'wide' | 'narrow') =>
  rowOf(name).lastElementChild!.querySelector(`[data-rop-row-actions-form="${which}"]`) as HTMLElement;

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
  (row) => [
    { id: 'dup', label: 'Duplicate', onSelect },
    { id: 'del', label: 'Delete', icon: trash, tone: 'danger', disabled: row.locked, onSelect },
  ];

describe('VirtualListReportTable rowActionsInline', () => {
  it('virtualized: both forms in every mounted row, the column width from the variable', () => {
    render(<Host rowActions={actions(() => {})} />);
    const table = screen.getByRole('table');
    expect((table.querySelector('colgroup > col:last-child') as HTMLElement).style.width).toBe('var(--rop-list-report-row-actions-width)');
    expect(table.style.getPropertyValue('--rop-list-report-row-actions-inline')).toBe('1');
    expect(table.parentElement!.className.split(' ')).toContain('@container');
    const mounted = table.querySelectorAll('tbody > tr[aria-rowindex]');
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(ROWS.length);
    for (const row of mounted) {
      expect(row.querySelector('[data-rop-row-actions-form="wide"] button')).toHaveAttribute('aria-label', expect.stringMatching(/^Delete Item \d+$/));
      expect(row.querySelector('[data-rop-row-actions-form="narrow"] button')).toHaveAttribute('aria-label', expect.stringMatching(/^Actions for Item \d+$/));
    }
  });

  it('the inline button and the menu item call onSelect once each, with the control used as returnFocusRef', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Host rowActions={actions(onSelect)} />);
    const inline = within(form('Item 2', 'wide')).getByRole('button', { name: 'Delete Item 2' });
    await user.click(inline);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].returnFocusRef.current).toBe(inline);
    const narrow = within(form('Item 2', 'narrow')).getByRole('button', { name: 'Actions for Item 2' });
    await user.click(narrow);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect.mock.calls[1]![0].returnFocusRef.current).toBe(narrow);
  });

  it('disabled: aria-disabled inline, nothing called by click or Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Host rowActions={actions(onSelect)} />);
    const inline = within(form('Item 1', 'wide')).getByRole('button', { name: 'Delete Item 1' });
    expect(inline).toHaveAttribute('aria-disabled', 'true');
    await user.click(inline);
    inline.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('VirtualListReport passes rowActionsInline to its table', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Host floorplan rowActions={actions(onSelect)} />);
    await user.click(within(form('Item 0', 'wide')).getByRole('button', { name: 'Delete Item 0' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
