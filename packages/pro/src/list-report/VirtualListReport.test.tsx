import { useEffect, useMemo, useState } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, useListReport, useListReportScrollRestoration, type ListReportColumn, type ListReportFilter } from '@formrail/core';
import { VirtualListReport, type VirtualListReportLabels, type VirtualListReportProps } from './VirtualListReport';
import { PITCH, installResizeObserverStub, mockTableLayout } from '../../test/virtual-table-utils';

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

function Report({ onSelectedIdsChange, onApprove, locale = 'en-US' }: { onSelectedIdsChange?: (ids: ReadonlySet<string>) => void; onApprove?: (n: number) => void; locale?: string | string[] }) {
  const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true, onSelectedIdsChange, locale });
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
    expect(screen.getByRole('heading', { name: /Items/ })).toHaveTextContent('Items (100,000)');
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
    expect(screen.getByText('100,000 selected')).toBeInTheDocument();
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

  describe('numbers of the default texts follow the locale of useListReport', () => {
    it('en-US: grouped, and the raw number is gone from the default texts', async () => {
      render(<Report />);
      const user = userEvent.setup();
      const heading = screen.getByRole('heading', { name: /Items/ });
      expect(heading).toHaveTextContent('Items (100,000)');
      expect(heading.textContent).not.toContain('100000');
      await user.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
      expect(selectAllAction()).toHaveTextContent('Select all 100,000 results');
      await user.click(selectAllAction());
      expect(screen.getByText('100,000 selected')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('100000 ');
    });

    it('de-DE: the thousands separator is a dot, in the count, the selection text and the action', async () => {
      render(<Report locale="de-DE" />);
      const user = userEvent.setup();
      const heading = screen.getByRole('heading', { name: /Items/ });
      expect(heading).toHaveTextContent('Items (100.000)');
      expect(heading.textContent).not.toContain('100000');
      await user.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
      expect(selectAllAction()).toHaveTextContent('Select all 100.000 results');
      await user.click(selectAllAction());
      expect(screen.getByText('100.000 selected')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('100000');
    });

    it('custom labels still receive the raw numbers, whatever the locale', async () => {
      const count = vi.fn((r: number, t: number) => `[${r}/${t}]`);
      const selectionCount = vi.fn((s: number, h: number) => `sel ${s}+${h}`);
      const action = vi.fn((n: number) => `All ${n}`);
      function Labelled() {
        const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true, locale: 'de-DE' });
        return <VirtualListReport title="Items" table={table} labels={{ count, selectionCount, selectAllResultsAction: action }} />;
      }
      render(<Labelled />);
      expect(screen.getByRole('heading', { name: /Items/ })).toHaveTextContent('Items [100000/100000]');
      expect(count).toHaveBeenCalledWith(100_000, 100_000);
      expect(selectionCount).toHaveBeenCalledWith(0, 0);
      expect(selectAllAction()).toHaveTextContent('All 100000');
      expect(action).toHaveBeenCalledWith(100_000);
    });
  });
});

// #504: below 640px without consumer bulkActions the bar has no "Select all N results" (CSS) and the header
// checkbox, which selects every result there, is described.
describe('without consumer bulkActions (#504)', () => {
  const FILTERS: ListReportFilter<Item>[] = [
    { id: 'all', label: 'All' },
    { id: 'even', label: 'Even', predicate: (r) => Number(r.id.slice(1)) % 2 === 0 },
  ];
  function Bare({
    rows = ROWS,
    locale = 'en-US',
    bulk,
    labels,
    onSelectedIdsChange,
  }: {
    rows?: Item[];
    locale?: string;
    bulk?: VirtualListReportProps<Item>['bulkActions'];
    labels?: VirtualListReportProps<Item>['labels'];
    onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  }) {
    const table = useListReport<Item>({ rows, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, selectable: true, locale, onSelectedIdsChange });
    return <VirtualListReport title="Items" table={table} bulkActions={bulk} labels={labels} />;
  }
  const bar = () => screen.getByRole('group', { name: 'Selection Items' });
  const allBox = () => screen.getByRole('checkbox', { name: 'Select all results' });
  const approve: VirtualListReportProps<Item>['bulkActions'] = () => (
    <Button size="sm" variant="secondary">
      Approve
    </Button>
  );

  it('the bar takes the one-line variant and the slot of the action is hidden below 640px (CSS, decided at render)', () => {
    render(<Bare />);
    expect(bar()).toHaveAttribute('data-rop-bulk-actions', 'false');
    expect(selectAllAction().parentElement!.className.split(' ')).toContain('max-sm:hidden');
  });

  it.each([
    ['a function that renders an action', approve],
    ['a function that returns null (the prop decides, as in the core)', () => null],
  ] as const)('with consumer bulkActions (%s): the two-line variant, the action in the slot, as before', (_label, bulk) => {
    render(<Bare bulk={bulk} />);
    expect(bar()).toHaveAttribute('data-rop-bulk-actions', 'true');
    expect(selectAllAction().parentElement!.className.split(' ')).not.toContain('max-sm:hidden');
  });

  it('the header checkbox keeps its name and is described: at 0, at a partial selection, with a filter (the number follows resultCount)', async () => {
    render(<Bare />);
    const user = userEvent.setup();
    expect(allBox()).toHaveAccessibleDescription('All 100,000 results, including those not on screen');
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    expect(allBox()).toHaveAccessibleDescription('All 100,000 results, including those not on screen');
    // A name distinct from the action's (jsdom has no media query: the action is shown here, as from 640px).
    expect(screen.getByRole('button', { name: 'Select all 100,000 results' })).toBe(selectAllAction());
    await user.click(screen.getByRole('radio', { name: 'Even' }));
    // Item 3 is odd: hidden by the filter.
    expect(screen.getByText('0 selected (1 hidden by filters)')).toBeInTheDocument();
    expect(allBox()).toHaveAccessibleDescription('All 50,000 results, including those not on screen');
  });

  it('a filter with selected rows hidden: the header checkbox selects every CURRENT result, the description says how many', async () => {
    const onSelectedIdsChange = vi.fn();
    render(<Bare onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 2' }));
    await user.click(screen.getByRole('radio', { name: 'Even' }));
    expect(screen.getByText('1 selected (1 hidden by filters)')).toBeInTheDocument();
    expect(allBox()).toHaveAccessibleDescription('All 50,000 results, including those not on screen');
    await user.click(allBox());
    expect(screen.getByText('50,000 selected (1 hidden by filters)')).toBeInTheDocument();
    expect(onSelectedIdsChange.mock.lastCall![0].size).toBe(50_001);
  });

  it.each([
    ['click', async (user: ReturnType<typeof userEvent.setup>) => user.click(allBox())],
    [
      'Space',
      async (user: ReturnType<typeof userEvent.setup>) => {
        allBox().focus();
        await user.keyboard(' ');
      },
    ],
  ] as const)('partial selection, the header checkbox (%s) selects all 100,000 results, also those never mounted', async (_label, activate) => {
    const onSelectedIdsChange = vi.fn();
    render(<Bare onSelectedIdsChange={onSelectedIdsChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
    expect(allBox()).toBePartiallyChecked();
    await activate(user);
    expect(onSelectedIdsChange.mock.lastCall![0].size).toBe(100_000);
    expect(onSelectedIdsChange.mock.lastCall![0].has('r99999')).toBe(true);
    expect(screen.getByText('100,000 selected')).toBeInTheDocument();
    expect(allBox()).toBeChecked();
    expect(allBox()).toHaveFocus();
  });

  it('no result: the checkbox is disabled and has no description (no "All 0 results")', () => {
    const { container } = render(<Bare rows={[]} />);
    expect(allBox()).toBeDisabled();
    expect(allBox()).not.toHaveAttribute('aria-describedby');
    expect(allBox()).not.toHaveAccessibleDescription();
    expect(container.textContent).not.toContain('including those not on screen');
  });

  it('one result: "1 result"; the description node is a hidden node of the floorplan, referenced by id', () => {
    render(<Bare rows={ROWS.slice(0, 1)} />);
    expect(allBox()).toHaveAccessibleDescription('1 result');
    const node = document.getElementById(allBox().getAttribute('aria-describedby')!)!;
    expect(node).toHaveAttribute('hidden');
    expect(node.closest('table')).toBeNull();
  });

  it('de-DE: the number of the description is formatted like the other default texts', () => {
    render(<Bare locale="de-DE" />);
    expect(allBox()).toHaveAccessibleDescription('All 100.000 results, including those not on screen');
  });

  it('labels.selectAllResultsDescription receives the raw number', () => {
    const describe = vi.fn((n: number) => `Every one of the ${n} rows`);
    render(<Bare locale="de-DE" labels={{ selectAllResultsDescription: describe }} />);
    expect(allBox()).toHaveAccessibleDescription('Every one of the 100000 rows');
    expect(describe).toHaveBeenCalledWith(100_000);
  });

  it('without selection: no description and no checkbox (nothing changes)', () => {
    function Plain() {
      const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
      return <VirtualListReport title="Items" table={table} />;
    }
    const { container } = render(<Plain />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(container.querySelector('[hidden]')).toBeNull();
  });

  it('consumer bulkActions dropped after mount while one of them has the focus: the focus goes to the header checkbox', async () => {
    // jsdom has no layout: what is laid out is what `checkVisibility` says (here: whatever is in the document).
    Element.prototype.checkVisibility ??= () => true;
    vi.spyOn(Element.prototype, 'checkVisibility').mockImplementation(function (this: Element) {
      return this.isConnected;
    });
    const { rerender } = render(<Bare bulk={approve} />);
    act(() => screen.getByRole('button', { name: 'Approve' }).focus());
    rerender(<Bare />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(bar()).toHaveAttribute('data-rop-bulk-actions', 'false');
    await waitFor(() => expect(allBox()).toHaveFocus());
    // And back: two lines again, nothing thrown.
    rerender(<Bare bulk={approve} />);
    expect(bar()).toHaveAttribute('data-rop-bulk-actions', 'true');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('the internal props of the frame are not props of VirtualListReport', () => {
    function Typed() {
      const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
      // @ts-expect-error internal to the core's frame, never a prop of the floorplan
      return <VirtualListReport title="Items" table={table} bulkActionsWideOnly />;
    }
    function TypedFocus() {
      const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
      // @ts-expect-error internal to the core's frame, never a prop of the floorplan
      return <VirtualListReport title="Items" table={table} keepBulkActionsFocus={false} />;
    }
    expect([Typed, TypedFocus]).toHaveLength(2);
  });

  it('#571: bulkActionsSlotRef, the frame\'s internal ref of the slot, is not a prop of VirtualListReport either', () => {
    function TypedSlot() {
      const table = useListReport<Item>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, selectable: true });
      // @ts-expect-error internal to the core's frame, never a prop of the floorplan
      return <VirtualListReport title="Items" table={table} bulkActionsSlotRef={() => {}} />;
    }
    expect(TypedSlot).toBeTypeOf('function');
  });

  it('#571 (decision B): a complete VirtualListReportLabels object may leave out selectAllResultsDescription (it has a default)', () => {
    // Optional: an object with every other key compiles as a `VirtualListReportLabels`.
    expectTypeOf<Omit<VirtualListReportLabels, 'selectAllResultsDescription'>>().toExtend<VirtualListReportLabels>();
    expectTypeOf<VirtualListReportLabels['selectAllResultsDescription']>().toEqualTypeOf<((resultCount: number) => string) | undefined>();
    // Only that key changed: `selectAllResultsAction` stays required, as before.
    expectTypeOf<Omit<VirtualListReportLabels, 'selectAllResultsAction'>>().not.toExtend<VirtualListReportLabels>();
    // And at runtime the default is used when the key is absent from `labels` (unchanged).
    render(<Bare labels={{ selectAllResultsAction: (n) => `All ${n}` }} />);
    const describedBy = screen.getByRole('checkbox', { name: 'Select all results' }).getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toHaveTextContent('All 100,000 results, including those not on screen');
  });

  // #571, review point 1: activating "Select all N results" hides it (`visibility: hidden`) and focuses the header
  // checkbox in the same click. React re-renders in a microtask queued before the one that reads the `focusout`, so
  // that read saw the action already hidden and kept tracking it: observers left on at rest, and once the user put
  // the focus on `body`, any later change of the slot "recovered" the focus to the header checkbox (and scrolled).
  // Run with React's real scheduling (no `act` around the gesture), as in a browser.
  describe('#571: a real activation of "Select all N results", then the focus on body: nothing tracked, nothing stolen', () => {
    let ro: ReturnType<typeof installResizeObserverStub>;
    const mutationObservers: { targets: Node[] }[] = [];
    const OriginalMutationObserver = globalThis.MutationObserver;
    const actEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    beforeEach(() => {
      ro = installResizeObserverStub();
      globalThis.MutationObserver = class extends OriginalMutationObserver {
        private entry = { targets: [] as Node[] };
        constructor(callback: MutationCallback) {
          super(callback);
          mutationObservers.push(this.entry);
        }
        override observe(target: Node, options?: MutationObserverInit) {
          this.entry.targets.push(target);
          super.observe(target, options);
        }
        override disconnect() {
          this.entry.targets.length = 0;
          super.disconnect();
        }
      };
      // Laid out = in the document (jsdom has no layout); the action's `visibility: hidden` is its inline style.
      Element.prototype.checkVisibility ??= () => true;
      vi.spyOn(Element.prototype, 'checkVisibility').mockImplementation(function (this: Element) {
        return this.isConnected;
      });
    });
    afterEach(() => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
      globalThis.MutationObserver = OriginalMutationObserver;
      ro.restore();
      mutationObservers.length = 0;
    });
    const realScheduling = () => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    };
    /** Every microtask and a task: React's render, the observers' callbacks, the `focusout` read. */
    const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    /** The observers still observing the slot or anything inside it. */
    const observing = (slot: Element) => ({
      mutation: mutationObservers.filter((o) => o.targets.some((t) => slot.contains(t))),
      resize: ro.instances.filter((o) => o.observed.some((t) => slot.contains(t))),
    });

    for (const [gesture, activate] of [
      ['a click (focus, then click: as a mouse in Chrome and Firefox)', async (action: HTMLElement) => {
        realScheduling();
        action.focus();
        await settle();
        action.click();
      }],
      ['the mouse (user-event: pointer down focuses it, then click)', async (action: HTMLElement) => userEvent.setup().click(action)],
      ['Enter', async (action: HTMLElement) => {
        act(() => action.focus());
        await userEvent.setup().keyboard('{Enter}');
      }],
      ['Space', async (action: HTMLElement) => {
        act(() => action.focus());
        await userEvent.setup().keyboard(' ');
      }],
    ] as const) {
      it(`activated with ${gesture}: the header checkbox gets the focus, then body keeps it through a change and a resize of the slot`, async () => {
        render(<Bare />);
        await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Item 3' }));
        const action = selectAllAction();
        const slot = action.parentElement!;
        await activate(action);
        realScheduling();
        await settle();
        expect(screen.getByText('100,000 selected')).toBeInTheDocument();
        expect(action.style.visibility).toBe('hidden');
        expect(allBox()).toHaveFocus();
        // The focus moved on purpose: nothing of the slot is tracked any more.
        expect(observing(slot)).toEqual({ mutation: [], resize: [] });
        // The user clicks a blank area: the focus is on body.
        allBox().blur();
        expect(document.activeElement).toBe(document.body);
        // Changes of the slot (class, style, children) and a resize (the viewport crossing 640px, a tablet rotated).
        slot.classList.add('rop-test-changed');
        slot.style.outline = '1px solid';
        slot.append(document.createElement('span'));
        await settle();
        expect(document.activeElement).toBe(document.body);
        // Every resize observer still connected (a disconnected one never calls back).
        for (const o of ro.instances.filter((i) => i.observed.length > 0)) o.callback([], o as unknown as ResizeObserver);
        await settle();
        expect(document.activeElement).toBe(document.body);
        expect(observing(slot)).toEqual({ mutation: [], resize: [] });
      });
    }
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
