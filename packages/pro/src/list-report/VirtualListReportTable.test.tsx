import { createRef, useMemo, type Ref } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  ListReportTable,
  useListReport,
  type ListReportColumn,
  type ListReportFilter,
  type ListReportTableStatus,
} from '@formrail/core';
import { VirtualListReportTable, type VirtualListReportTableHandle } from './VirtualListReportTable';
import {
  CLIENT,
  HEAD,
  PITCH,
  installResizeObserverStub,
  mockTableLayout,
  normalizeIds,
  spyScrollListeners,
} from '../../test/virtual-table-utils';

interface Item {
  id: string;
  name: string;
  n: number;
}

const cache = new Map<number, Item[]>();
const makeRows = (count: number): Item[] => {
  if (!cache.has(count)) cache.set(count, Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `Item ${i}`, n: i })));
  return cache.get(count)!;
};

const COLUMNS: ListReportColumn<Item>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name, width: 200 },
  { id: 'n', header: 'Number', accessor: (r) => r.n, align: 'end' },
];
const NO_TRUNCATE: ListReportColumn<Item>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name, truncate: false },
  { id: 'note', header: 'Note', accessor: (r) => `note ${r.n}`, truncate: false },
  { id: 'n', header: 'Number', accessor: (r) => r.n },
];

const FILTERS: ListReportFilter<Item>[] = [
  { id: 'all', label: 'All' },
  { id: 'first150', label: 'First 150', predicate: (r) => r.n < 150 },
  { id: 'notR5', label: 'Not r5', predicate: (r) => r.n !== 5 },
  { id: 'none', label: 'None', predicate: () => false },
  { id: 'odd', label: 'Odd', predicate: (r) => r.n % 2 === 1 },
];

interface HostProps {
  count?: number;
  free?: boolean;
  threshold?: number;
  overscan?: number;
  filter?: string;
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  status?: ListReportTableStatus;
  columns?: ListReportColumn<Item>[];
  handleRef?: Ref<VirtualListReportTableHandle>;
  onRetry?: () => void;
}

function Host({ count = 100_000, free, threshold, overscan, filter, selectable, selectedIds, onSelectedIdsChange, status, columns = COLUMNS, handleRef, onRetry }: HostProps) {
  const rows = useMemo(() => makeRows(count), [count]);
  const table = useListReport<Item>({ rows, columns, getRowId: (r) => r.id, filters: FILTERS, filter, selectable, selectedIds, onSelectedIdsChange });
  return free ? (
    <ListReportTable table={table} aria-label="Items" status={status} onRetry={onRetry} />
  ) : (
    <VirtualListReportTable
      table={table}
      aria-label="Items"
      status={status}
      onRetry={onRetry}
      virtualizeThreshold={threshold}
      overscan={overscan}
      handleRef={handleRef}
    />
  );
}

const scroller = () => screen.getByRole('table', { name: 'Items' }).parentElement as HTMLElement;
const dataRows = () => Array.from(scroller().querySelectorAll('tbody > tr[aria-rowindex]'));
const rowIndices = () => dataRows().map((r) => Number(r.getAttribute('aria-rowindex')));
const spacers = () => Array.from(scroller().querySelectorAll('tbody > tr[data-rop-spacer]'));
const scrollTo = (top: number) => {
  act(() => {
    scroller().scrollTop = top;
    fireEvent.scroll(scroller());
  });
};
/** The bound of the ticket: ceil(viewport / pitch) + 2 * overscan + 1. */
const BOUND = Math.ceil((CLIENT - HEAD) / PITCH) + 2 * 10 + 1;

let layout: ReturnType<typeof mockTableLayout>;
beforeEach(() => {
  layout = mockTableLayout();
});
afterEach(() => {
  cleanup();
  layout.restore();
  vi.restoreAllMocks();
});

describe('below the threshold, with no rows and in every state: the Free table', () => {
  const cases: [string, HostProps][] = [
    ['50 rows', { count: 50 }],
    ['199 rows (default threshold 200)', { count: 199 }],
    ['50 rows, selectable, with a selection', { count: 50, selectable: true, selectedIds: new Set(['r3']) }],
    ['0 rows (empty)', { count: 0 }],
    ['loading without rows', { count: 0, status: 'loading' }],
    ['noResults (100,000 rows filtered to none)', { filter: 'none' }],
    ['error (100,000 rows)', { status: 'error', onRetry: () => {} }],
    ['error, selectable', { status: 'error', selectable: true }],
  ];

  it.each(cases)('%s: same serialized HTML as ListReportTable', (_label, props) => {
    const free = normalizeIds(render(<Host {...props} free />).container.innerHTML);
    cleanup();
    const pro = normalizeIds(render(<Host {...props} />).container.innerHTML);
    expect(pro).toBe(free);
    expect(pro).not.toContain('data-rop-spacer');
    expect(pro).not.toContain('aria-rowcount');
    expect(pro).not.toContain('aria-rowindex');
    // Two full renders of up to 199 rows (jsdom) plus HTML serialization: CPU-bound, scales with contention.
  }, 20_000);

  it.each(cases)('%s: no scroll listener, no ResizeObserver beyond those of the Free table', (_label, props) => {
    const ro = installResizeObserverStub();
    try {
      const scrolls = spyScrollListeners();
      render(<Host {...props} free />);
      const freeScrolls = scrolls();
      const freeObservers = ro.instances.length;
      cleanup();
      ro.instances.length = 0;
      vi.restoreAllMocks();
      const proScrolls = spyScrollListeners();
      render(<Host {...props} />);
      expect(proScrolls()).toBe(freeScrolls);
      expect(ro.instances.length).toBe(freeObservers);
    } finally {
      ro.restore();
    }
  });

  it('at or above the threshold it virtualizes (the threshold is configurable)', () => {
    render(<Host count={200} />);
    expect(spacers().length).toBeGreaterThan(0);
    cleanup();
    render(<Host count={1000} threshold={2000} />);
    expect(spacers()).toHaveLength(0);
    expect(scroller().querySelectorAll('tbody > tr')).toHaveLength(1000);
    // Mounts 1,000 plain rows in jsdom (about 2s alone): wall time scales with CPU contention.
  }, 20_000);
});

describe('virtualized (100,000 rows)', () => {
  it('mounts a bounded number of rows, with aria-rowcount, aria-rowindex and spacers', () => {
    render(<Host />);
    const table = screen.getByRole('table', { name: 'Items' });
    expect(table).toHaveAttribute('aria-rowcount', '100001');
    expect(table.querySelector('thead tr')).toHaveAttribute('aria-rowindex', '1');
    expect(dataRows().length).toBeLessThanOrEqual(BOUND);
    expect(rowIndices()[0]).toBe(2);
    expect(spacers()).toHaveLength(1);
    // Spacers are hidden from assistive technology and span every column.
    expect(spacers()[0]).toHaveAttribute('aria-hidden', 'true');
    expect(spacers()[0]!.querySelector('td')).toHaveAttribute('colspan', '2');
    // Measured pitch: the bottom spacer is the rows that are not mounted, in px.
    const mountedCount = dataRows().length;
    expect((spacers()[0]!.querySelector('td') as HTMLElement).style.height).toBe(`${(100_000 - mountedCount) * PITCH}px`);
  });

  it('in the middle: the rows of the position, within the bound; at the bottom: the last row', () => {
    render(<Host />);
    scrollTo(50_000 * PITCH);
    const indices = rowIndices();
    expect(indices.length).toBeLessThanOrEqual(BOUND);
    // first visible row = 50,000 -> aria-rowindex 50,002, with 10 rows of overscan above
    expect(indices[0]).toBe(50_002 - 10);
    expect(indices).toContain(50_002);
    expect(screen.getByText('Item 50000')).toBeInTheDocument();
    expect(spacers()).toHaveLength(2);

    scrollTo(100_000 * PITCH);
    expect(rowIndices().at(-1)).toBe(100_001);
    expect(screen.getByText('Item 99999')).toBeInTheDocument();
    expect(dataRows().length).toBeLessThanOrEqual(BOUND);
  });

  it('a scroll inside the same range does not re-render the rows', () => {
    render(<Host />);
    scrollTo(10_000 * PITCH);
    const before = dataRows();
    scrollTo(10_000 * PITCH + 5);
    expect(dataRows()).toEqual(before);
  });

  it('a filter shortens the list: the range is clamped to it, no exception', () => {
    const { rerender } = render(<Host />);
    scrollTo(90_000 * PITCH);
    rerender(<Host filter="first150" threshold={100} />);
    expect(rowIndices().at(-1)).toBe(151);
    expect(screen.getByRole('table', { name: 'Items' })).toHaveAttribute('aria-rowcount', '151');
  });

  it('the pitch is re-measured (ResizeObserver) and the spacers follow it', () => {
    const ro = installResizeObserverStub();
    try {
      render(<Host />);
      expect(ro.instances.length).toBeGreaterThan(0);
      layout.state.pitch = 51;
      act(() => ro.trigger());
      const mountedCount = dataRows().length;
      expect((spacers()[0]!.querySelector('td') as HTMLElement).style.height).toBe(`${(100_000 - mountedCount) * 51}px`);
      scrollTo(1000 * 51);
      expect(rowIndices()).toContain(1002);
    } finally {
      ro.restore();
    }
  });

  it('the observer watches the body, and a range change never touches what it observes', () => {
    const ro = installResizeObserverStub();
    try {
      render(<Host />);
      const observed = () => ro.instances.flatMap((i) => i.observed);
      const before = observed();
      expect(before).toContain(document.querySelector('tbody'));
      expect(before).toContain(document.querySelector('thead'));
      scrollTo(10_000 * PITCH);
      expect(observed()).toEqual(before);
    } finally {
      ro.restore();
    }
  });

  it('the observer leaves the scroll position to the scroll event', () => {
    const ro = installResizeObserverStub();
    try {
      render(<Host />);
      const before = rowIndices();
      scroller().scrollTop = 1000 * PITCH;
      act(() => ro.trigger());
      expect(rowIndices()).toEqual(before);
      act(() => {
        fireEvent.scroll(scroller());
      });
      expect(rowIndices()).toContain(1002);
    } finally {
      ro.restore();
    }
  });

  it('the commit of a scroll event does not read scrollTop a second time (the getter forces a layout)', () => {
    render(<Host />);
    scroller().scrollTop = 1000 * PITCH;
    const reads = vi.spyOn(Element.prototype, 'scrollTop', 'get');
    try {
      act(() => {
        fireEvent.scroll(scroller());
      });
      expect(rowIndices()).toContain(1002);
      expect(reads).toHaveBeenCalledTimes(1);
    } finally {
      reads.mockRestore();
    }
  });

  it('after the commit of a scroll event, a later commit still picks up a scrollTop changed without an event', () => {
    const { rerender } = render(<Host />);
    scrollTo(1000 * PITCH);
    scroller().scrollTop = 5000 * PITCH;
    rerender(<Host />);
    expect(rowIndices()).toContain(5002);
  });

  it('unmounting removes the scroll listener and disconnects the observer', () => {
    const ro = installResizeObserverStub();
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    try {
      const { unmount } = render(<Host />);
      unmount();
      expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
      expect(ro.instances.every((i) => i.observed.length === 0)).toBe(true);
    } finally {
      ro.restore();
    }
  });
});

describe('focus', () => {
  it('the row holding the focus stays mounted (pinned) after 50 viewports of scroll', async () => {
    render(<Host selectable />);
    const checkbox = screen.getByRole('checkbox', { name: 'Select Item 3' });
    act(() => checkbox.focus());
    expect(document.activeElement).toBe(checkbox);
    for (let i = 1; i <= 50; i++) scrollTo(i * (CLIENT - HEAD));
    expect(document.activeElement).toBe(checkbox);
    expect(checkbox.isConnected).toBe(true);
    // The pinned row sits between a top spacer and a mid spacer, with its own aria-rowindex.
    expect(rowIndices()[0]).toBe(5);
    expect(spacers().length).toBe(3);
    expect(dataRows().length).toBeLessThanOrEqual(BOUND + 1);
    // 50 full re-commits of a selectable table in jsdom (about 2s alone): wall time scales with CPU contention.
  }, 20_000);

  it('Tab / Shift+Tab after scrolling away go on from the focused row to the next / previous one', async () => {
    render(<Host selectable />);
    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', { name: 'Select Item 3' });
    act(() => checkbox.focus());
    for (let i = 1; i <= 50; i++) scrollTo(i * (CLIENT - HEAD));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select Item 4' }));
    // scrolled back to it (auto: at the top edge, below the header)
    expect(scroller().scrollTop).toBe(4 * PITCH);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    // inside the range: the native order (no interception)
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select Item 5' }));
    // 50 full re-commits of a selectable table plus userEvent tabs in jsdom (about 2s alone): wall time scales with CPU contention.
  }, 20_000);

  it('a filter that removes the focused row moves the focus to the container, never the body', () => {
    const { rerender } = render(<Host selectable />);
    const checkbox = screen.getByRole('checkbox', { name: 'Select Item 5' });
    act(() => checkbox.focus());
    rerender(<Host selectable filter="notR5" />);
    expect(checkbox.isConnected).toBe(false);
    expect(document.activeElement).toBe(scroller());
  });

  it('crossing the threshold (100,000 -> 150 rows -> 100,000) keeps the same focused node', () => {
    const { rerender } = render(<Host selectable />);
    const checkbox = screen.getByRole('checkbox', { name: 'Select Item 7' });
    act(() => checkbox.focus());
    rerender(<Host selectable filter="first150" />);
    expect(spacers()).toHaveLength(0);
    expect(document.activeElement).toBe(checkbox);
    rerender(<Host selectable filter="all" />);
    expect(spacers().length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(checkbox);
  });
});

describe('selection', () => {
  it('the header checkbox selects all 100,000 results without mounting any more rows', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host selectable onSelectedIdsChange={onSelectedIdsChange} />);
    const mounted = dataRows().length;
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all results' }));
    expect(onSelectedIdsChange).toHaveBeenCalledTimes(1);
    expect(onSelectedIdsChange.mock.calls[0]![0].size).toBe(100_000);
    expect(dataRows().length).toBe(mounted);
    // Rows mounted later by a scroll show the right state.
    scrollTo(70_000 * PITCH);
    expect(screen.getByRole('checkbox', { name: 'Select Item 70000' })).toBeChecked();
  });

  it('shift-click: from the (unmounted) anchor to the clicked row, one onSelectedIdsChange', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host selectable onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 9' }));
    // the focus would pin row 9: move it away so the anchor row is really unmounted
    act(() => scroller().focus());
    scrollTo(4990 * PITCH);
    expect(screen.queryByRole('checkbox', { name: 'Select Item 9' })).toBeNull();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 4999' }));
    await user.keyboard('{/Shift}');
    expect(onSelectedIdsChange).toHaveBeenCalledTimes(2);
    const ids = onSelectedIdsChange.mock.calls[1]![0] as ReadonlySet<string>;
    expect(ids.size).toBe(4991);
    expect(ids.has('r9')).toBe(true);
    expect(ids.has('r4999')).toBe(true);
    expect(ids.has('r8')).toBe(false);
  });

  it('shift-click on a selected row deselects the whole range; the anchor stays', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host selectable count={300} onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select all results' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 2' })); // deselect: anchor = 2
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 6' }));
    await user.keyboard('{/Shift}');
    const ids = onSelectedIdsChange.mock.calls.at(-1)![0] as ReadonlySet<string>;
    expect(ids.size).toBe(300 - 5);
    for (const n of [2, 3, 4, 5, 6]) expect(ids.has(`r${n}`)).toBe(false);
  });

  it('Shift+Space on a row checkbox is a shift-click', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host selectable onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 1' }));
    act(() => screen.getByRole('checkbox', { name: 'Select Item 4' }).focus());
    await user.keyboard('{Shift>} {/Shift}');
    expect(onSelectedIdsChange).toHaveBeenCalledTimes(2);
    expect([...(onSelectedIdsChange.mock.calls[1]![0] as ReadonlySet<string>)].sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('the anchor leaves the results: shift-click acts as a plain click (also once it is back)', async () => {
    const onSelectedIdsChange = vi.fn();
    const { rerender } = render(<Host selectable onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 2' }));
    rerender(<Host selectable onSelectedIdsChange={onSelectedIdsChange} filter="odd" />);
    rerender(<Host selectable onSelectedIdsChange={onSelectedIdsChange} filter="all" />);
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 6' }));
    await user.keyboard('{/Shift}');
    expect([...(onSelectedIdsChange.mock.calls.at(-1)![0] as ReadonlySet<string>)].sort()).toEqual(['r2', 'r6']);
  });

  it('shift-click without an anchor is a plain click', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host selectable onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 6' }));
    await user.keyboard('{/Shift}');
    expect([...(onSelectedIdsChange.mock.calls[0]![0] as ReadonlySet<string>)]).toEqual(['r6']);
  });

  it('works below the threshold too (the extensions are not tied to virtualization)', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Host selectable count={50} onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 1' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    await user.keyboard('{/Shift}');
    expect([...(onSelectedIdsChange.mock.calls[1]![0] as ReadonlySet<string>)].sort()).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('Escape', () => {
  function InDialog({ onOpenChange, selectedIds }: { onOpenChange: (open: boolean) => void; selectedIds?: ReadonlySet<string> }) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Pick</DialogTitle>
          <Host selectable selectedIds={selectedIds} />
        </DialogContent>
      </Dialog>
    );
  }

  it('with a selection: empties it, keeps the focus where it was and leaves a parent Dialog open', async () => {
    const onOpenChange = vi.fn();
    const onSelectedIdsChange = vi.fn();
    function Controlled() {
      return (
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Pick</DialogTitle>
            <Host selectable onSelectedIdsChange={onSelectedIdsChange} />
          </DialogContent>
        </Dialog>
      );
    }
    render(<Controlled />);
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog');
    const checkbox = within(dialog).getByRole('checkbox', { name: 'Select Item 2' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    await user.keyboard('{Escape}');
    expect(onSelectedIdsChange).toHaveBeenLastCalledWith(new Set());
    expect(checkbox).not.toBeChecked();
    expect(document.activeElement).toBe(checkbox);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('with an empty selection: does nothing and does not stop the event (the Dialog closes)', async () => {
    const onOpenChange = vi.fn();
    render(<InDialog onOpenChange={onOpenChange} />);
    act(() => scroller().focus());
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('outside the table: not intercepted even with a selection', async () => {
    const onOpenChange = vi.fn();
    render(<InDialog onOpenChange={onOpenChange} selectedIds={new Set(['r1'])} />);
    act(() => screen.getByRole('dialog').focus());
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('truncate: false when virtualized', () => {
  it('one warning per column in development, cells truncated; none below the threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = render(<Host count={50} columns={NO_TRUNCATE} />);
    expect(warn).not.toHaveBeenCalled();
    const plain = scroller().querySelector('tbody td')!.innerHTML;
    rerender(<Host columns={NO_TRUNCATE} />);
    scrollTo(5000 * PITCH);
    rerender(<Host columns={[...NO_TRUNCATE]} />);
    const messages = warn.mock.calls.map(([m]) => String(m));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('"name"');
    expect(messages[1]).toContain('"note"');
    // forced truncation: no longer the plain node wrapper of a `truncate: false` cell
    const forced = scroller().querySelector('tbody tr[aria-rowindex] td')!.innerHTML;
    expect(plain).toContain('min-w-0 overflow-hidden');
    expect(forced).not.toContain('min-w-0 overflow-hidden');
  });
});

describe('handleRef.scrollToRowId', () => {
  it('false (no scroll) for an id outside the results; otherwise the row is mounted in view', () => {
    const handle = createRef<VirtualListReportTableHandle>();
    const { rerender } = render(<Host handleRef={handle} />);
    expect(handle.current!.scrollToRowId('nope')).toBe(false);
    expect(scroller().scrollTop).toBe(0);

    let result = false;
    act(() => {
      result = handle.current!.scrollToRowId('r5000');
    });
    expect(result).toBe(true);
    // auto: minimal scroll, the row's bottom at the bottom edge of the viewport
    expect(scroller().scrollTop).toBe(HEAD + 5001 * PITCH - CLIENT);
    expect(screen.getByText('Item 5000')).toBeInTheDocument();

    act(() => {
      handle.current!.scrollToRowId('r10', { align: 'start' });
    });
    // start: right below the sticky header
    expect(scroller().scrollTop).toBe(10 * PITCH);
    act(() => {
      handle.current!.scrollToRowId('r10');
    });
    expect(scroller().scrollTop).toBe(10 * PITCH); // already visible: no scroll

    rerender(<Host handleRef={handle} filter="odd" />);
    expect(handle.current!.scrollToRowId('r10')).toBe(false);
  });
});
