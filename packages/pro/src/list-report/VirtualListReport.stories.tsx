import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  Button,
  ListReport,
  useListReport,
  useListReportScrollRestoration,
  useListReportUrlState,
  type ListReportColumn,
  type ListReportFilter,
} from '@formrail/core';
import { VirtualListReport } from './VirtualListReport';
import type { VirtualListReportTableHandle } from './VirtualListReportTable';
import { DEMO_STATUS_LABEL, formatAmount, makeDemoRows, type DemoRow } from './demo-rows';

const FILTERS: ListReportFilter<DemoRow>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Rejected', predicate: (r) => r.status === 'rejected' },
];

const COLUMNS: ListReportColumn<DemoRow>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number, width: 150 },
  { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier, minWidth: 200 },
  { id: 'date', header: 'Date', accessor: (r) => r.date, firstSortDirection: 'desc', width: 130 },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, cell: (r) => formatAmount(r.amount), align: 'end', firstSortDirection: 'desc', searchable: false, width: 140 },
  { id: 'status', header: 'Status', accessor: (r) => DEMO_STATUS_LABEL[r.status], searchable: false, width: 130 },
];

const PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  fontFamily: 'system-ui, sans-serif',
};
const BOX: CSSProperties = { width: 1100, maxWidth: '100%', height: 'min(600px, calc(var(--rop-demo-viewport-height, 100dvh) - 104px))' };

// `rowHeight: '3rem'`: overrides the row height variable on the table's scroll container, what a
// consumer does with its own CSS (the container declares the default itself, so a parent cannot).
const REM3_CLASS = 'rop-demo-row-height-3rem';
function RowHeightStyle({ rowHeight }: { rowHeight: RowHeight }) {
  return rowHeight === '3rem' ? <style>{`.${REM3_CLASS} [tabindex="0"]:has(> table) { --rop-list-report-row-height: 3rem; }`}</style> : null;
}

type RowCount = 50 | 1000 | 100_000 | 200_000;
type RowHeight = 'default' | '3rem';

interface DemoArgs {
  rowCount: RowCount;
  virtualizeThreshold: number;
  overscan: number;
  rowHeight: RowHeight;
  selectable: boolean;
  onSelectedIdsChange: (ids: ReadonlySet<string>) => void;
  onApprove: (numbers: string[]) => void;
  onExport: (numbers: string[]) => void;
}

declare global {
  interface Window {
    /** ms from the first render of the demo to its first layout effect (mount of the report). Read by the e2e suite. */
    __ropVirtualMountMs?: number;
  }
}

function Demo({ rowCount, virtualizeThreshold, overscan, rowHeight, selectable, onSelectedIdsChange, onApprove, onExport }: DemoArgs) {
  const rows = makeDemoRows(rowCount);
  const [renderStart] = useState(() => performance.now());
  useLayoutEffect(() => {
    window.__ropVirtualMountMs = performance.now() - renderStart;
  }, [renderStart]);
  const handle = useRef<VirtualListReportTableHandle>(null);
  const table = useListReport<DemoRow>({ rows, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, selectable, onSelectedIdsChange });
  const last = rows[rows.length - 1];
  return (
    <div style={PAGE}>
      <RowHeightStyle rowHeight={rowHeight} />
      <div style={BOX}>
        <VirtualListReport
          title="Invoices"
          table={table}
          virtualizeThreshold={virtualizeThreshold}
          overscan={overscan}
          handleRef={handle}
          filtersLabel="Status"
          searchLabel="Search invoices"
          className={rowHeight === '3rem' ? REM3_CLASS : undefined}
          actions={
            last ? (
              <Button variant="secondary" onClick={() => handle.current?.scrollToRowId(last.id, { align: 'center' })}>
                Go to {last.number}
              </Button>
            ) : undefined
          }
          bulkActions={(selection) => (
            <>
              <Button size="sm" disabled={selection.selectedResultCount === 0} onClick={() => onApprove(selection.getSelectedRows().map((r) => r.number))}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" disabled={selection.selectedResultCount === 0} onClick={() => onExport(selection.getSelectedRows().map((r) => r.number))}>
                Export
              </Button>
            </>
          )}
        />
      </div>
    </div>
  );
}

const scrollerOf = (canvasElement: HTMLElement) => within(canvasElement).getByRole('table', { name: 'Invoices' }).parentElement as HTMLElement;
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Scrolls the table's container and waits until the rows of the new position are mounted. */
async function scrollTable(canvasElement: HTMLElement, top: number) {
  const scroller = scrollerOf(canvasElement);
  scroller.scrollTop = top;
  await frame();
  await frame();
}

const meta: Meta<DemoArgs> = {
  title: 'Pro/Floorplans/Virtual List Report',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '`VirtualListReport` / `VirtualListReportTable` (`@formrail/pro`): the core List Report with virtualized rows. ' +
          'Same props and `useListReport` state as the Free `ListReport`; below `virtualizeThreshold` it is the Free table (same DOM, no virtualizer). ' +
          'Rows are mounted only around the viewport, between spacer rows of a native `<table>`; the focused row stays mounted; ' +
          'shift-click / Shift+Space select a range over the current results; "Select all N results" and Escape act on the data.',
      },
    },
  },
  argTypes: {
    rowCount: { control: 'select', options: [50, 1000, 100_000], description: 'Rows in the dataset (deterministic, generated once)' },
    virtualizeThreshold: { control: { type: 'number', min: 0, step: 50 }, description: '`virtualizeThreshold`: results from which the rows are virtualized' },
    overscan: { control: { type: 'number', min: 0, max: 50, step: 1 }, description: '`overscan`: rows mounted above and below the viewport' },
    rowHeight: {
      control: 'radio',
      options: ['default', '3rem'],
      description: 'Overrides `--rop-list-report-row-height` on the scroll container: the pitch is re-measured',
    },
    selectable: { control: 'boolean', description: '`useListReport({ selectable })`' },
    onSelectedIdsChange: { control: false },
    onApprove: { control: false },
    onExport: { control: false },
  },
  args: {
    rowCount: 100_000,
    virtualizeThreshold: 200,
    overscan: 10,
    rowHeight: 'default',
    selectable: true,
    onSelectedIdsChange: fn(),
    onApprove: fn(),
    onExport: fn(),
  },
  render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<DemoArgs>;

/**
 * 100,000 invoices. Controls: dataset size, threshold, overscan, row height, selection. The play function
 * scrolls to the bottom (last row `aria-rowindex` = N + 1), selects INV-000010, scrolls to INV-005000
 * and shift-clicks it (4,991 selected, across rows that are not mounted), selects all the results with
 * the selection bar's action, then empties the selection with Escape.
 */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const table = canvas.getByRole('table', { name: 'Invoices' });
    const count = args.rowCount;
    await expect(table).toHaveAttribute('aria-rowcount', String(count + 1));
    const mounted = () => table.querySelectorAll('tbody > tr[aria-rowindex]');
    await expect(mounted().length).toBeLessThan(60);

    // To the bottom: the last row is mounted, with its aria-rowindex.
    await scrollTable(canvasElement, scrollerOf(canvasElement).scrollHeight);
    await waitFor(() => expect(Array.from(mounted()).at(-1)).toHaveAttribute('aria-rowindex', String(count + 1)));
    await expect(canvas.getByText(`INV-${String(count).padStart(6, '0')}`)).toBeVisible();

    // A range across unmounted rows: INV-000010 ... INV-005000. One user-event instance keeps Shift held.
    const user = userEvent.setup();
    await scrollTable(canvasElement, 0);
    await user.click(await canvas.findByRole('checkbox', { name: 'Select INV-000010' }));
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(1);
    const pitch = (mounted()[0] as HTMLElement).getBoundingClientRect().height;
    await scrollTable(canvasElement, 4990 * pitch);
    const target = await canvas.findByRole('checkbox', { name: 'Select INV-005000' });
    await user.keyboard('{Shift>}');
    await user.click(target);
    await user.keyboard('{/Shift}');
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(2);
    await expect(canvas.getByText('4991 selected')).toBeInTheDocument();
    await expect(canvas.queryByRole('checkbox', { name: 'Select INV-000010' })).toBeNull();

    // Select every result from the selection bar, then Escape empties the selection.
    await user.click(canvas.getByRole('button', { name: `Select all ${count.toLocaleString('en-US')} results` }));
    await expect(canvas.getByText(`${count} selected`)).toBeInTheDocument();
    await expect(canvas.getByRole('checkbox', { name: 'Select all results' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await expect(canvas.getByText('No items selected')).toBeInTheDocument();
    await expect(args.onSelectedIdsChange).toHaveBeenLastCalledWith(new Set());
  },
};

/** Fixture of the e2e suite: `Default` without the play function. */
export const DefaultNoPlay: Story = { ...Default, play: undefined };

/** Fixture of the e2e suite: the declared ceiling, 200,000 rows (not offered in Controls). */
export const Ceiling200k: Story = {
  args: { rowCount: 200_000 },
  argTypes: { rowCount: { control: false } },
};

/** Fixture of the e2e suite: the Free `ListReport` with the same columns and the same 1,000 rows, for the geometry comparison. */
export const FreeReference: Story = {
  args: { rowCount: 1000 },
  argTypes: { rowCount: { control: false }, virtualizeThreshold: { control: false }, overscan: { control: false } },
  render: function FreeReferenceStory({ rowCount, rowHeight, selectable }) {
    const table = useListReport<DemoRow>({ rows: makeDemoRows(rowCount), columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, selectable });
    return (
      <div style={PAGE}>
        <RowHeightStyle rowHeight={rowHeight} />
        <div style={BOX}>
          <ListReport
            title="Invoices"
            table={table}
            filtersLabel="Status"
            searchLabel="Search invoices"
            className={rowHeight === '3rem' ? REM3_CLASS : undefined}
          />
        </div>
      </div>
    );
  },
};

// --- Visual regression: top / middle / bottom / with a selection --------------------------------

/** Visual baseline: the top of 100,000 rows (compare with `FreeReference` at the same rows). */
export const VisualTop: Story = {
  tags: ['visual'],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('table', { name: 'Invoices' })).toHaveAttribute('aria-rowcount', '100001');
  },
};

/** Visual baseline: scrolled to row 50,000. */
export const VisualMiddle: Story = {
  tags: ['visual'],
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole('table', { name: 'Invoices' });
    const pitch = (table.querySelector('tbody > tr[aria-rowindex]') as HTMLElement).getBoundingClientRect().height;
    await scrollTable(canvasElement, 50_000 * pitch);
    await waitFor(() => expect(within(canvasElement).getByText('INV-050001')).toBeVisible());
  },
};

/** Visual baseline: scrolled to the bottom. */
export const VisualBottom: Story = {
  tags: ['visual'],
  play: async ({ canvasElement }) => {
    await scrollTable(canvasElement, scrollerOf(canvasElement).scrollHeight);
    await waitFor(() => expect(within(canvasElement).getByText('INV-100000')).toBeVisible());
  },
};

/** Visual baseline: a range selected with shift-click, scrolled into its middle. */
export const VisualSelection: Story = {
  tags: ['visual'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();
    await user.click(canvas.getByRole('checkbox', { name: 'Select INV-000002' }));
    await user.keyboard('{Shift>}');
    await user.click(canvas.getByRole('checkbox', { name: 'Select INV-000006' }));
    await user.keyboard('{/Shift}');
    await expect(canvas.getByText('5 selected')).toBeInTheDocument();
    // Leave the focus off the rows: no focus ring in the picture.
    (document.activeElement as HTMLElement | null)?.blur();
  },
};

// --- Scroll restoration: list -> detail -> back ------------------------------------------------

interface ScrollRestorationArgs {
  loadDelayMs: number;
  rowHeight: RowHeight;
  onOpenDetail: (invoiceId: string) => void;
}

const readView = (): string | null => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('view'));

function RestorationList({ loadDelayMs, rowHeight, onOpen }: { loadDelayMs: number; rowHeight: RowHeight; onOpen: (id: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), loadDelayMs);
    return () => clearTimeout(timer);
  }, [loadDelayMs]);
  const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: ['number', 'date', 'amount'] });
  const scroll = useListReportScrollRestoration({ ready: loaded });
  const columns = useMemo<ListReportColumn<DemoRow>[]>(
    () =>
      COLUMNS.map((c) =>
        c.id === 'number'
          ? {
              ...c,
              cell: (r: DemoRow) => (
                <button type="button" onClick={() => onOpen(r.id)} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}>
                  {r.number}
                </button>
              ),
            }
          : c,
      ),
    [onOpen],
  );
  const table = useListReport<DemoRow>({ rows: loaded ? makeDemoRows(100_000) : [], columns, getRowId: (r) => r.id, filters: FILTERS, ...url });
  return (
    <VirtualListReport
      title="Invoices"
      table={table}
      status={loaded ? 'ready' : 'loading'}
      filtersLabel="Status"
      searchLabel="Search invoices"
      scrollerRef={scroll.ref}
      className={rowHeight === '3rem' ? REM3_CLASS : undefined}
    />
  );
}

function RestorationDemo({ loadDelayMs, rowHeight, onOpenDetail }: ScrollRestorationArgs) {
  const [detail, setDetail] = useState(() => readView() === 'detail');
  useEffect(() => {
    const onPop = () => setDetail(readView() === 'detail');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = useMemo(
    () => (id: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set('view', 'detail');
      window.history.pushState(window.history.state, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
      setDetail(true);
      onOpenDetail(id);
    },
    [onOpenDetail],
  );
  return (
    <div style={PAGE}>
      <RowHeightStyle rowHeight={rowHeight} />
      {detail ? (
        <div>
          <p style={{ marginTop: 0 }}>Invoice detail (a page of its own: the list is unmounted).</p>
          <Button variant="secondary" onClick={() => window.history.back()}>
            Back to the list
          </Button>
        </div>
      ) : (
        <div style={{ ...BOX, height: 'min(500px, calc(var(--rop-demo-viewport-height, 100dvh) - 104px))' }}>
          <RestorationList loadDelayMs={loadDelayMs} rowHeight={rowHeight} onOpen={open} />
        </div>
      )}
    </div>
  );
}

/**
 * The core's `useListReportScrollRestoration` (unchanged) on `VirtualListReport` with 100,000 rows: scroll
 * deep into the list, open an invoice (the list unmounts), come back: once the data arrives (`loadDelayMs`
 * later) the container is scrolled where it was and the rows mounted are those of that position. The
 * play function does the round trip at row ~60,000.
 */
export const ScrollRestoration: StoryObj<ScrollRestorationArgs> = {
  argTypes: {
    loadDelayMs: { control: { type: 'range', min: 0, max: 2000, step: 100 }, description: 'Time the list takes to get its data after (re)mounting, in ms' },
    rowHeight: { control: 'radio', options: ['default', '3rem'], description: 'Overrides `--rop-list-report-row-height`' },
    onOpenDetail: { control: false },
    ...{ rowCount: { table: { disable: true } }, virtualizeThreshold: { table: { disable: true } }, overscan: { table: { disable: true } }, selectable: { table: { disable: true } } },
    ...{ onSelectedIdsChange: { table: { disable: true } }, onApprove: { table: { disable: true } }, onExport: { table: { disable: true } } },
  },
  args: { loadDelayMs: 400, rowHeight: 'default', onOpenDetail: fn() },
  render: (args) => <RestorationDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView!;
    for (const key of Object.keys(win.sessionStorage)) if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
    win.history.replaceState(win.history.state, '', win.location.pathname);
    win.dispatchEvent(new PopStateEvent('popstate', { state: win.history.state }));

    const table = () => canvas.getByRole('table', { name: 'Invoices' });
    await waitFor(() => expect(table()).toHaveAttribute('aria-rowcount', '100001'), { timeout: 5000 });
    const pitch = (table().querySelector('tbody > tr[aria-rowindex]') as HTMLElement).getBoundingClientRect().height;
    const target = 60_000 * pitch;
    await scrollTable(canvasElement, target);
    await waitFor(() => expect(canvas.getByText('INV-060001')).toBeInTheDocument());
    const storedKey = `rop:list-report-scroll:#${win.location.pathname}?`;
    await waitFor(() => expect(win.sessionStorage.getItem(storedKey)).not.toBeNull(), { timeout: 3000 });

    await userEvent.click(canvas.getByRole('button', { name: 'INV-060005' }));
    await expect(args.onOpenDetail).toHaveBeenCalledWith('inv-60005');
    await userEvent.click(await canvas.findByRole('button', { name: 'Back to the list' }));
    await waitFor(() => expect(table()).toHaveAttribute('aria-rowcount', '100001'), { timeout: 5000 });
    await waitFor(() => expect(Math.abs(scrollerOf(canvasElement).scrollTop - target)).toBeLessThanOrEqual(1), { timeout: 5000 });
    await waitFor(() => expect(canvas.getByText('INV-060001')).toBeVisible());
  },
};

/** Fixture of the e2e suite: `ScrollRestoration` without the play function. */
export const ScrollRestorationNoPlay: StoryObj<ScrollRestorationArgs> = { ...ScrollRestoration, play: undefined };
