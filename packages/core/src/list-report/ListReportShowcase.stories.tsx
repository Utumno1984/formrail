import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog/Dialog';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { formatEuro, type DemoInvoice } from '../internal/demo-invoices';
import { makeShowcaseInvoices, STATUS_LABEL } from '../showcase/showcase-data';
import { repositionAfterMotion, settleMotion } from '../internal/settle-motion';
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../sheet/Sheet';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter, ListReportSort } from './types';
import { useListReport } from './use-list-report';
import { useListReportScrollRestoration } from './use-list-report-scroll-restoration';
import { useListReportUrlState } from './use-list-report-url-state';

type OverlayChoice = 'dialog' | 'sheet' | 'auto';
type ShowcaseState = 'data' | 'loading' | 'empty' | 'error';

interface ShowcaseArgs {
  history: 'replace' | 'push';
  /** `auto` = a Sheet below the mobile threshold, a Dialog above it. */
  overlay: OverlayChoice;
  /** The rows arrive this long after mount (`state: data`); the report is `loading` until then. */
  loadDelayMs: number;
  state: ShowcaseState;
  onFilterChange: (filter: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSortChange: (sort: ListReportSort) => void;
  /** Click handler of the "New" button. */
  onClick: () => void;
}

/** Below this width `overlay: auto` opens a Sheet. */
const MOBILE_QUERY = '(max-width: 600px)';

const LABELS = {
  loading: 'Loading…',
  empty: 'No data',
  noResults: 'No results for the current filters',
  error: 'Could not load the data',
  retry: 'Retry',
  clearFilters: 'Clear filters',
  resultCount: (count: number) => (count === 1 ? '1 result' : `${count} results`),
  count: (resultCount: number, totalCount: number) =>
    resultCount === totalCount ? `(${resultCount})` : `(${resultCount} of ${totalCount})`,
};

const FILTERS: ListReportFilter<DemoInvoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Rejected', predicate: (r) => r.status === 'rejected' },
];

const COLUMNS: ListReportColumn<DemoInvoice>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number, width: 150 },
  { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier, minWidth: 200 },
  { id: 'date', header: 'Date', accessor: (r) => r.date, width: 130 },
  {
    id: 'amount',
    header: 'Amount',
    accessor: (r) => r.amount,
    cell: (r) => formatEuro(r.amount),
    align: 'end',
    firstSortDirection: 'desc',
    searchable: false,
    width: 140,
  },
  { id: 'status', header: 'Status', accessor: (r) => STATUS_LABEL[r.status], searchable: false, width: 150 },
];
const SORTABLE = COLUMNS.map((c) => c.id);
const ROWS = makeShowcaseInvoices(200);

const PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  fontFamily: 'system-ui, sans-serif',
  height: '100dvh',
  display: 'flex',
  flexDirection: 'column',
};

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return mobile;
}

function NewForm({ kind }: { kind: 'dialog' | 'sheet' }) {
  const field = (
    <Field label="Supplier name">
      <Input />
    </Field>
  );
  return kind === 'dialog' ? (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New invoice</DialogTitle>
        <DialogClose aria-label="Close" />
      </DialogHeader>
      <DialogBody>{field}</DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button variant="primary">Create</Button>
      </DialogFooter>
    </DialogContent>
  ) : (
    <SheetContent>
      <SheetHeader>
        <SheetTitle>New invoice</SheetTitle>
        <SheetClose aria-label="Close" />
      </SheetHeader>
      <SheetBody>{field}</SheetBody>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="ghost">Cancel</Button>
        </SheetClose>
        <Button variant="primary">Create</Button>
      </SheetFooter>
    </SheetContent>
  );
}

function ShowcaseDemo({
  history,
  overlay,
  loadDelayMs,
  state,
  onFilterChange,
  onSearchQueryChange,
  onSortChange,
  onClick,
}: ShowcaseArgs) {
  const mobile = useIsMobile();
  const kind: 'dialog' | 'sheet' = overlay === 'auto' ? (mobile ? 'sheet' : 'dialog') : overlay;

  const [elapsed, setElapsed] = useState(loadDelayMs === 0);
  useEffect(() => {
    if (loadDelayMs === 0) {
      setElapsed(true);
      return;
    }
    setElapsed(false);
    const id = setTimeout(() => setElapsed(true), loadDelayMs);
    return () => clearTimeout(id);
  }, [loadDelayMs]);

  const status = state === 'error' ? 'error' : state === 'loading' || !elapsed ? 'loading' : 'ready';
  const rows = useMemo(() => (status === 'ready' && state === 'data' ? ROWS : []), [status, state]);

  const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: SORTABLE, history });
  const scroll = useListReportScrollRestoration({ ready: status === 'ready' });
  const table = useListReport<DemoInvoice>({
    rows,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    ...url,
    // The URL is written first, then the story's callbacks are told: they fire on a gesture, never on Back/Forward.
    onFilterChange: (id) => {
      url.onFilterChange(id);
      onFilterChange(id);
    },
    onSearchQueryChange: (query) => {
      url.onSearchQueryChange(query);
      onSearchQueryChange(query);
    },
    onSortChange: (sort) => {
      url.onSortChange(sort);
      onSortChange(sort);
    },
  });

  const newButton = (
    <Button variant="primary" onClick={onClick}>
      New
    </Button>
  );
  const actions =
    kind === 'dialog' ? (
      <Dialog>
        <DialogTrigger asChild>{newButton}</DialogTrigger>
        <NewForm kind="dialog" />
      </Dialog>
    ) : (
      <Sheet>
        <SheetTrigger asChild>{newButton}</SheetTrigger>
        <NewForm kind="sheet" />
      </Sheet>
    );

  return (
    <div style={PAGE}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ListReport
          title="Invoices"
          table={table}
          actions={actions}
          status={status}
          filtersLabel="Filters"
          searchLabel="Search"
          labels={LABELS}
          scrollerRef={scroll.ref}
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

const meta: Meta<ShowcaseArgs> = {
  title: 'Floorplans/List Report',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    history: {
      control: 'radio',
      options: ['replace', 'push'],
      description: '`history` of `useListReportUrlState`: how a gesture writes the URL',
    },
    overlay: {
      control: 'radio',
      options: ['dialog', 'sheet', 'auto'],
      description: 'What "New" opens; `auto` is a Sheet below 600px, a Dialog above',
    },
    loadDelayMs: {
      control: { type: 'range', min: 0, max: 2000, step: 100 },
      description: 'Time the rows take to arrive after mount (`state: data`), in ms',
    },
    state: {
      control: 'select',
      options: ['data', 'loading', 'empty', 'error'],
      description: 'State of the report',
    },
    onFilterChange: { control: false },
    onSearchQueryChange: { control: false },
    onSortChange: { control: false },
    onClick: { control: false },
  },
  args: {
    history: 'replace',
    overlay: 'auto',
    loadDelayMs: 0,
    state: 'data',
    onFilterChange: fn(),
    onSearchQueryChange: fn(),
    onSortChange: fn(),
    onClick: fn(),
  },
  render: (args) => <ShowcaseDemo {...args} />,
};

export default meta;
type Story = StoryObj<ShowcaseArgs>;

/** Start clean: no report parameters in the URL, nothing stored by an earlier run. */
function resetBrowserState(win: Window): void {
  for (const key of Object.keys(win.sessionStorage)) {
    if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
  }
  const params = new URLSearchParams(win.location.search);
  for (const key of ['filter', 'q', 'sort']) params.delete(key);
  win.history.replaceState(win.history.state, '', `${win.location.pathname}?${params.toString()}`);
  win.dispatchEvent(new PopStateEvent('popstate', { state: win.history.state }));
}

const scrollerOf = (canvas: ReturnType<typeof within>): HTMLElement =>
  canvas.getByRole('table', { name: /Invoices/ }).parentElement as HTMLElement;

/**
 * The List Report showcase: `useListReportUrlState` (pill, committed search and sort live in the URL of the
 * frame), `useListReportScrollRestoration`, and "New" opening a Dialog (a Sheet on mobile, Controls: `overlay`)
 * with "Cancel". The play function does the whole round: picks the "Open" pill, commits a search, sorts by
 * "Amount", scrolls the table, opens "New", types in the form and presses "Cancel"; then checks the URL, the
 * scroll position, the pill, the search text and the focus on "New". Controls: `history`, `overlay`,
 * `loadDelayMs`, `state`.
 */
export const SmartFilterBarShowcase: Story = {
  tags: ['visual'],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('SmartFilterBarShowcase: no window');
    resetBrowserState(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10), { timeout: 5000 });
    await expect(canvas.getByRole('radio', { name: 'All' })).toBeChecked();
    // Resetting the URL (a navigation, not a gesture) must not be reported in Actions.
    await expect(args.onFilterChange).not.toHaveBeenCalled();
    await expect(args.onSearchQueryChange).not.toHaveBeenCalled();
    await expect(args.onSortChange).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('open');
    // "FT-2026-00" matches the first 99 invoice numbers: still enough rows to scroll after the "Open" pill.
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search' }), 'FT-2026-00{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('FT-2026-00');
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
    const firstRow = () => canvas.getAllByRole('row')[1]!.textContent;
    const rowBefore = firstRow();

    const scroller = scrollerOf(canvas);
    scroller.scrollTop = 600;
    await waitFor(() => expect(scroller.scrollTop).toBe(600));
    const before = scroller.scrollTop;

    const trigger = canvas.getByRole('button', { name: 'New' });
    await userEvent.click(trigger);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    const overlay = await body.findByRole('dialog', { name: 'New invoice' });
    await settleMotion();
    await userEvent.type(within(overlay).getByRole('textbox', { name: 'Supplier name' }), 'Acme');
    await expect(within(overlay).getByRole('textbox', { name: 'Supplier name' })).toHaveValue('Acme');

    await userEvent.click(within(overlay).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());

    const params = new URLSearchParams(win.location.search);
    await expect(params.get('filter')).toBe('open');
    await expect(params.get('q')).toBe('FT-2026-00');
    await expect(params.get('sort')).toBe('amount.desc');
    await expect(scrollerOf(canvas).scrollTop).toBe(before);
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect(canvas.getByRole('searchbox', { name: 'Search' })).toHaveValue('FT-2026-00');
    await expect(firstRow()).toBe(rowBefore);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Fixture of the e2e suite and visual baseline: the showcase without the play function, as it opens. */
export const SmartFilterBarShowcaseNoPlay: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
};

/** Visual variant: the "Open" pill active and the table sorted by amount. */
export const SmartFilterBarShowcaseActiveFilter: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('SmartFilterBarShowcaseActiveFilter: no window');
    resetBrowserState(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10));
    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await waitFor(() => expect(win.location.search).toContain('sort=amount.desc'));
  },
};

/** Visual variant: "New" has opened the Dialog (the Sheet on mobile). */
export const SmartFilterBarShowcaseOverlayOpen: Story = {
  tags: ['visual', 'visual-viewport-only'],
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('SmartFilterBarShowcaseOverlayOpen: no window');
    resetBrowserState(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10));
    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await userEvent.click(canvas.getByRole('button', { name: 'New' }));
    await within(document.body).findByRole('dialog', { name: 'New invoice' });
    // Entry motion finished and the overlay measured on its final geometry before the picture (#111).
    await repositionAfterMotion();
  },
};
