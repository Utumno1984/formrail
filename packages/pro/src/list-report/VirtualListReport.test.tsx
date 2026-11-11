import { useEffect, useMemo, useState } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, useListReport, useListReportScrollRestoration, type ListReportColumn } from '@formrail/core';
import { VirtualListReport } from './VirtualListReport';
import { PITCH, mockTableLayout } from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
}
const ROWS: Item[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));
const COLUMNS: ListReportColumn<Item>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];

let layout: ReturnType<typeof mockTableLayout>;
beforeEach(() => {
  layout = mockTableLayout();
});
afterEach(() => {
  cleanup();
  layout.restore();
  vi.restoreAllMocks();
});

function Report({ onSelectedIdsChange, onApprove }: { onSelectedIdsChange?: (ids: ReadonlySet<string>) => void; onApprove?: (n: number) => void }) {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true, onSelectedIdsChange });
  return (
    <VirtualListReport
      title="Items"
      table={table}
      bulkActions={(selection) => (
        <Button size="sm" disabled={selection.selectedResultCount === 0} onClick={() => onApprove?.(selection.getSelectedRows().length)}>
          Approve
        </Button>
      )}
    />
  );
}

// Hidden with `visibility` when not applicable (no accessible name then): found by its marker.
const selectAllAction = () => document.querySelector<HTMLButtonElement>('[data-rop-select-all-results]')!;

describe('VirtualListReport', () => {
  it('is the core floorplan (title, count, selection bar) around the virtualized table', () => {
    render(<Report />);
    expect(screen.getByRole('heading', { name: /Items/ })).toHaveTextContent('Items (100000)');
    const table = screen.getByRole('table', { name: 'Items' });
    expect(table).toHaveAttribute('aria-rowcount', '100001');
    expect(table.querySelectorAll('tbody > tr[aria-rowindex]').length).toBeLessThanOrEqual(31);
    expect(screen.getByRole('group', { name: 'Selection Items' })).toBeInTheDocument();
  });

  it('"Select all N results": only while some but not all results are selected; then the focus goes to the header checkbox', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Report onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    expect(selectAllAction()).not.toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    expect(selectAllAction()).toBeVisible();
    expect(screen.getByRole('button', { name: 'Select all 100,000 results' })).toBe(selectAllAction());
    // A name distinct from the header checkbox.
    expect(screen.getByRole('checkbox', { name: 'Select all results' })).toBeInTheDocument();
    await user.click(selectAllAction());
    expect(onSelectedIdsChange).toHaveBeenCalledTimes(2);
    expect(onSelectedIdsChange.mock.calls[1]![0].size).toBe(100_000);
    expect(selectAllAction()).not.toBeVisible();
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all results' }));
    expect(screen.getByText('100000 selected')).toBeInTheDocument();
  });

  it('the consumer bulk actions follow the Pro action and act on the selected rows', async () => {
    const onApprove = vi.fn();
    render(<Report onApprove={onApprove} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 1' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 4' }));
    await user.keyboard('{/Shift}');
    const bar = screen.getByRole('group', { name: 'Selection Items' });
    expect(within(bar).getByText('4 selected')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith(4);
  });

  it('labels.selectAllResultsAction renames the action', async () => {
    function Labelled() {
      const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
      return <VirtualListReport title="Items" table={table} labels={{ selectAllResultsAction: (n) => `All ${n}` }} />;
    }
    render(<Labelled />);
    expect(selectAllAction()).toHaveTextContent('All 100000');
  });
});

describe('scroll restoration (core useListReportScrollRestoration, unchanged)', () => {
  function makeStorage(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  function Restored({ storage }: { storage: ReturnType<typeof makeStorage> }) {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setLoaded(true), 10);
      return () => clearTimeout(t);
    }, []);
    const scroll = useListReportScrollRestoration({ ready: loaded, key: 'list', storage });
    const rows = useMemo(() => (loaded ? ROWS : []), [loaded]);
    const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
    return <VirtualListReport title="Items" table={table} status={loaded ? 'ready' : 'loading'} scrollerRef={scroll.ref} />;
  }

  it.each([
    ['1,200px', 1200, PITCH],
    ['a deep position (row ~80,000)', 80_000 * PITCH, PITCH],
    ['a deep position with the row height overridden (3rem: pitch 51)', 80_000 * 51, 51],
  ])('%s: after the async data, the mounted rows are those of the position', async (_label, top, pitch) => {
    layout.state.pitch = pitch;
    vi.useFakeTimers();
    try {
      render(<Restored storage={makeStorage({ 'rop:list-report-scroll:list': JSON.stringify({ top, left: 0 }) })} />);
      const scroller = screen.getByRole('table', { name: 'Items' }).parentElement as HTMLElement;
      expect(scroller).toHaveAttribute('aria-busy', 'true');
      await act(async () => {
        vi.advanceTimersByTime(20);
      });
      expect(scroller.scrollTop).toBe(top);
      const first = Math.floor(top / pitch);
      const indices = Array.from(scroller.querySelectorAll('tbody > tr[aria-rowindex]')).map((r) => Number(r.getAttribute('aria-rowindex')));
      expect(indices).toContain(first + 2);
      expect(indices[0]).toBe(Math.max(2, first + 2 - 10));
    } finally {
      vi.useRealTimers();
    }
  });
});
