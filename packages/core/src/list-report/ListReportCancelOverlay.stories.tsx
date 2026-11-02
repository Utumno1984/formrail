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
import { formatEuro, makeDemoInvoices, type DemoInvoice } from '../internal/demo-invoices';
import { settleMotion } from '../internal/settle-motion';
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
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

type OverlayKind = 'dialog' | 'sheet';

interface CancelOverlayArgs {
  overlay: OverlayKind;
  /** Click handler of the "New" button. */
  onClick: () => void;
  onOpenChange: (open: boolean) => void;
  /** Fixture (not in Controls): the rows arrive this many ms after mount; the report is `loading` until then. */
  loadMs?: number;
  /** Fixture (not in Controls): `searchCommitDelay` of `useListReport` in ms. Default 300 (the hook's own default). */
  searchCommitDelay?: number;
  /** Fixture (not in Controls): content below the report, so the document is taller than the viewport and the page scrolls. */
  tallPage?: boolean;
}

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

const STATUS_LABEL: Record<DemoInvoice['status'], string> = {
  pending: 'Open',
  approved: 'Approved',
  rejected: 'Rejected',
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

const PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  fontFamily: 'system-ui, sans-serif',
  height: '100dvh',
  display: 'flex',
  flexDirection: 'column',
};

function NewForm({ kind }: { kind: OverlayKind }) {
  const field = (
    <Field label="Supplier name">
      <Input />
    </Field>
  );
  return kind === 'dialog' ? (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New invoice</DialogTitle>
        <DialogClose />
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
        <SheetClose />
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

function CancelOverlayDemo({
  overlay,
  onClick,
  onOpenChange,
  loadMs = 0,
  searchCommitDelay = 300,
  tallPage = false,
}: CancelOverlayArgs) {
  const all = useMemo(() => makeDemoInvoices(200), []);
  const [loaded, setLoaded] = useState(loadMs === 0);
  useEffect(() => {
    if (loadMs === 0) return;
    const id = setTimeout(() => setLoaded(true), loadMs);
    return () => clearTimeout(id);
  }, [loadMs]);

  const table = useListReport<DemoInvoice>({
    rows: loaded ? all : [],
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    searchCommitDelay,
  });

  const newButton = (
    <Button variant="primary" onClick={onClick}>
      New
    </Button>
  );
  const actions =
    overlay === 'dialog' ? (
      <Dialog onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{newButton}</DialogTrigger>
        <NewForm kind="dialog" />
      </Dialog>
    ) : (
      <Sheet onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{newButton}</SheetTrigger>
        <NewForm kind="sheet" />
      </Sheet>
    );

  return (
    <div style={tallPage ? { ...PAGE, height: 'auto' } : PAGE}>
      <div style={tallPage ? { flex: 'none', height: '70dvh' } : { flex: 1, minHeight: 0 }}>
        <ListReport
          title="Invoices"
          table={table}
          actions={actions}
          status={loaded ? 'ready' : 'loading'}
          filtersLabel="Filters"
          searchLabel="Search"
          labels={LABELS}
          style={{ height: '100%' }}
        />
      </div>
      {tallPage ? <div aria-hidden style={{ flex: 'none', height: 1600 }} /> : null}
    </div>
  );
}

const meta: Meta<CancelOverlayArgs> = {
  title: 'Floorplans/List Report',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    overlay: {
      control: 'radio',
      options: ['dialog', 'sheet'],
      description: 'What the "New" action opens above the report',
    },
    onClick: { control: false },
    onOpenChange: { control: false },
    loadMs: { control: false, table: { disable: true } },
    searchCommitDelay: { control: false, table: { disable: true } },
    tallPage: { control: false, table: { disable: true } },
  },
  args: { overlay: 'dialog', onClick: fn(), onOpenChange: fn() },
  render: (args) => <CancelOverlayDemo {...args} />,
};

export default meta;
type Story = StoryObj<CancelOverlayArgs>;

/**
 * "New" opens a Dialog (or a Sheet, Controls: `overlay`) above a mounted List Report; "Cancel" closes it.
 * Nothing is left to restore: the report must come back exactly as it was. The play function picks the
 * "Open" pill, commits a search, sorts by "Amount", scrolls the table, opens "New" and checks the scroll is
 * unchanged while the overlay is open, then presses "Cancel" and checks scroll, pill, search text and sort
 * (the first row) are unchanged and the focus is back on "New". The e2e suite repeats it for Escape, a click
 * on the backdrop, reduced motion and the mobile/tablet viewports.
 */
export const CancelActionOverlay: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const scroller = canvas.getByRole('table', { name: /Invoices/ }).parentElement as HTMLElement;

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    // "FT-2026-00" matches the first 99 invoice numbers: still enough rows to scroll after the "Open" pill.
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search' }), 'FT-2026-00{Enter}');
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    const firstRow = () => canvas.getAllByRole('row')[1]!.textContent;
    const rowBefore = firstRow();

    scroller.scrollTop = 600;
    // Horizontal scroll too, where the table is wider than its container (narrow viewports).
    scroller.scrollLeft = Math.min(120, scroller.scrollWidth - scroller.clientWidth);
    await waitFor(() => expect(scroller.scrollTop).toBe(600));
    const before = { top: scroller.scrollTop, left: scroller.scrollLeft };

    const trigger = canvas.getByRole('button', { name: 'New' });
    await userEvent.click(trigger);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    const overlay = await body.findByRole('dialog', { name: 'New invoice' });
    await settleMotion();
    await expect(scroller.scrollTop).toBe(before.top);
    await expect(scroller.scrollLeft).toBe(before.left);

    await userEvent.click(within(overlay).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false);
    await expect(scroller.scrollTop).toBe(before.top);
    await expect(scroller.scrollLeft).toBe(before.left);
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect(canvas.getByRole('searchbox', { name: 'Search' })).toHaveValue('FT-2026-00');
    await expect(firstRow()).toBe(rowBefore);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Fixture of the e2e suite: the same page without the play function. */
export const CancelActionOverlayNoPlay: Story = {
  parameters: { controls: { disable: true } },
};

/** Fixture of the e2e suite: the document is taller than the viewport, so the page has a scrollbar. */
export const CancelActionOverlayTallPage: Story = {
  parameters: { controls: { disable: true } },
  args: { tallPage: true },
};

/** Fixture of the e2e suite: the rows arrive 1.5 s after mount (the report is loading until then). */
export const CancelActionOverlayLoading: Story = {
  parameters: { controls: { disable: true } },
  args: { loadMs: 1500 },
};
