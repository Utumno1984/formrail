import { useEffect, useMemo, useState } from 'react';
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
import {
  DEPARTMENT_LABEL,
  EMPLOYEE_STATUS_LABEL,
  formatDate,
  makeEmployees,
  type DemoEmployee,
} from '../internal/demo-data';
import { useCaseStory as describeUseCase } from '../internal/story-example';
import { LABELS, PAGE } from './record-list-shared';
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

const ROWS = makeEmployees(200);

// The example is configured for an HR employee directory: pills by status and by department, search by name or
// by personnel number, sorted by hire date (most recent first on the first click).
const FILTERS: ListReportFilter<DemoEmployee>[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: EMPLOYEE_STATUS_LABEL.active, predicate: (e) => e.status === 'active' },
  { id: 'on-leave', label: EMPLOYEE_STATUS_LABEL['on-leave'], predicate: (e) => e.status === 'on-leave' },
  { id: 'sales', label: DEPARTMENT_LABEL.sales, predicate: (e) => e.department === 'sales' },
  { id: 'finance', label: DEPARTMENT_LABEL.finance, predicate: (e) => e.department === 'finance' },
  { id: 'it', label: DEPARTMENT_LABEL.it, predicate: (e) => e.department === 'it' },
];

const COLUMNS: ListReportColumn<DemoEmployee>[] = [
  { id: 'code', header: 'Number', accessor: (e) => e.code, width: 120 },
  { id: 'name', header: 'Name', accessor: (e) => e.fullName, minWidth: 200 },
  { id: 'department', header: 'Department', accessor: (e) => DEPARTMENT_LABEL[e.department], searchable: false, minWidth: 150 },
  {
    id: 'hired',
    header: 'Hire date',
    accessor: (e) => e.hireDate,
    cell: (e) => formatDate(e.hireDate),
    firstSortDirection: 'desc',
    searchable: false,
    width: 150,
  },
  { id: 'status', header: 'Status', accessor: (e) => EMPLOYEE_STATUS_LABEL[e.status], searchable: false, width: 130 },
];
const SORTABLE = COLUMNS.map((c) => c.id);

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
    <Field label="Employee name">
      <Input />
    </Field>
  );
  return kind === 'dialog' ? (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New employee</DialogTitle>
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
        <SheetTitle>New employee</SheetTitle>
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
  const table = useListReport<DemoEmployee>({
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
          title="Employees"
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
  canvas.getByRole('table', { name: /Employees/ }).parentElement as HTMLElement;

/**
 * The List Report showcase: `useListReportUrlState` (pill, committed search and sort live in the URL of the
 * frame), `useListReportScrollRestoration`, and "New" opening a Dialog (a Sheet on mobile, Controls: `overlay`)
 * with "Cancel". The play function does the whole round: picks the "Active" pill, commits a search, sorts by
 * "Hire date", scrolls the table, opens "New", types in the form and presses "Cancel"; then checks the URL, the
 * scroll position, the pill, the search text and the focus on "New". Controls: `history`, `overlay`,
 * `loadDelayMs`, `state`.
 */
export const SmartFilterBarShowcase: Story = {
  name: 'Example: configured for an HR employee directory',
  tags: ['use-case', 'vertical:hr', 'visual'],
  ...describeUseCase({
    vertical: 'hr',
    problem: 'An HR team looks people up by name or personnel number, narrows the list by status or department, and comes back to the same place after opening a form.',
    configuration:
      'Pills for status and department, search by name or number, sort by hire date, with the pill, the search and the sort in the URL and the scroll position restored. "New" opens a Dialog (a Sheet on mobile, Controls: `overlay`) with "Cancel": the report comes back exactly as it was.',
  }),
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

    await userEvent.click(canvas.getByRole('radio', { name: 'Active' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('active');
    // "E-10" matches the first 99 personnel numbers: still enough rows to scroll after the "Active" pill.
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search' }), 'E-10{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('E-10');
    await userEvent.click(canvas.getByRole('button', { name: 'Hire date' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'hired', direction: 'desc' });
    const firstRow = () => canvas.getAllByRole('row')[1]!.textContent;
    const rowBefore = firstRow();

    const scroller = scrollerOf(canvas);
    scroller.scrollTop = 600;
    await waitFor(() => expect(scroller.scrollTop).toBe(600));
    const before = scroller.scrollTop;

    const trigger = canvas.getByRole('button', { name: 'New' });
    await userEvent.click(trigger);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    const overlay = await body.findByRole('dialog', { name: 'New employee' });
    await settleMotion();
    await userEvent.type(within(overlay).getByRole('textbox', { name: 'Employee name' }), 'Jordan Avery');
    await expect(within(overlay).getByRole('textbox', { name: 'Employee name' })).toHaveValue('Jordan Avery');

    await userEvent.click(within(overlay).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());

    const params = new URLSearchParams(win.location.search);
    await expect(params.get('filter')).toBe('active');
    await expect(params.get('q')).toBe('E-10');
    await expect(params.get('sort')).toBe('hired.desc');
    await expect(scrollerOf(canvas).scrollTop).toBe(before);
    await expect(canvas.getByRole('radio', { name: 'Active' })).toBeChecked();
    await expect(canvas.getByRole('searchbox', { name: 'Search' })).toHaveValue('E-10');
    await expect(firstRow()).toBe(rowBefore);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** Fixture of the e2e suite and visual baseline: the showcase without the play function, as it opens. */
export const SmartFilterBarShowcaseNoPlay: Story = {
  name: 'Example: configured for an HR employee directory (no play)',
  tags: ['use-case', 'vertical:hr', 'visual', 'internal'],
  parameters: { controls: { disable: true } },
};

/** Visual variant: the "Active" pill selected and the table sorted by hire date. */
export const SmartFilterBarShowcaseActiveFilter: Story = {
  name: 'Example: configured for an HR employee directory, Active pill',
  tags: ['use-case', 'vertical:hr', 'visual', 'internal'],
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('SmartFilterBarShowcaseActiveFilter: no window');
    resetBrowserState(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10));
    await userEvent.click(canvas.getByRole('radio', { name: 'Active' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Hire date' }));
    await expect(canvas.getByRole('radio', { name: 'Active' })).toBeChecked();
    await waitFor(() => expect(win.location.search).toContain('sort=hired.desc'));
  },
};

/**
 * Visual variant: "New" has opened the Dialog. Pinned to `dialog` (not `auto`) on every viewport: a Sheet is
 * full-height by contract, so with this one-field form it would leave a ~70% empty band on mobile (#308). The
 * Sheet-on-mobile behaviour is covered by the `overlay: auto` e2e and the Sheet stories.
 */
export const SmartFilterBarShowcaseOverlayOpen: Story = {
  name: 'Example: configured for an HR employee directory, New employee open',
  tags: ['use-case', 'vertical:hr', 'visual', 'visual-viewport-only', 'internal'],
  args: { overlay: 'dialog' },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('SmartFilterBarShowcaseOverlayOpen: no window');
    resetBrowserState(win);
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10));
    await userEvent.click(canvas.getByRole('radio', { name: 'Active' }));
    await userEvent.click(canvas.getByRole('button', { name: 'New' }));
    await within(document.body).findByRole('dialog', { name: 'New employee' });
    // Entry motion finished and the overlay measured on its final geometry before the picture (#111).
    await repositionAfterMotion();
  },
};
