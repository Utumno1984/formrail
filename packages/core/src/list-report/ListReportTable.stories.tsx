import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { addons } from 'storybook/preview-api';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { storyControl, withoutControls } from '../internal/story-docs';
import { ListReportTable } from './ListReportTable';
import type { ListReportColumn, ListReportFilter, ListReportSort, ListReportSortDirection } from './types';
import { useListReport } from './use-list-report';

interface Invoice {
  id: string;
  customer: string;
  description: string;
  amount: number;
  date: string;
}

const CUSTOMERS = [
  'Bianchi & Associates Ltd - Administrative consulting services',
  'Rossi Construction',
  'Verdi Industrial Supplies Inc. - North-West Division',
  'Neri',
  'Gialli International Transport and Logistics Ltd',
];

// Deterministic (no Math.random): the visual baselines must never change between runs.
function makeInvoices(count: number): Invoice[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `F-${String(i + 1).padStart(4, '0')}`,
    customer: CUSTOMERS[i % CUSTOMERS.length]!,
    description: `Invoice awaiting approval from the purchasing office, order reference ${1000 + i * 7}`,
    amount: ((i * 7919) % 9973) + 0.5,
    date: new Date(Date.UTC(2026, 0, 1 + ((i * 13) % 300))).toISOString().slice(0, 10),
  }));
}

const money = (value: number): string => `€ ${value.toFixed(2)}`;

function columns(firstDateDirection: ListReportSortDirection = 'desc'): ListReportColumn<Invoice>[] {
  return [
    { id: 'id', header: 'N.', accessor: (r) => r.id, width: 90 },
    { id: 'customer', header: 'Customer', accessor: (r) => r.customer, minWidth: 160 },
    { id: 'description', header: 'Description', accessor: (r) => r.description, sortable: false, minWidth: 200 },
    { id: 'amount', header: 'Amount', accessor: (r) => r.amount, cell: (r) => money(r.amount), align: 'end', width: 120 },
    { id: 'date', header: 'Date', accessor: (r) => r.date, firstSortDirection: firstDateDirection, width: 120 },
  ];
}

// The "none" filter excludes every row: it makes the "no results" state (rows exist, none shown).
const DEMO_FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'None', predicate: () => false },
];

interface TableDemoProps {
  rows: Invoice[];
  columns: ListReportColumn<Invoice>[];
  maxHeight?: number;
  onSortChange?: (sort: ListReportSort) => void;
  defaultSort?: ListReportSort;
  dir?: 'ltr' | 'rtl';
  label?: string;
  /** Initial filter: `'none'` excludes every row. */
  defaultFilter?: 'all' | 'none';
  status?: 'ready' | 'loading' | 'error';
  loadingRowCount?: number;
  errorMessage?: ReactNode;
  onRetry?: () => void;
  /** Called, and then the filters are really cleared. */
  onClearFilters?: () => void;
}

function TableDemo({
  rows,
  columns: cols,
  maxHeight,
  onSortChange,
  defaultSort,
  dir,
  label = 'Invoices',
  defaultFilter,
  status,
  loadingRowCount,
  errorMessage,
  onRetry,
  onClearFilters,
}: TableDemoProps) {
  // The demo starts on `defaultFilter` and clearing the filters goes back to "all". `filter` is
  // controlled here with no `onFilterChange` wired to the hook, so the hook's own `clearFilters`
  // would not move this local state at all; the reset has to happen in this demo's own handler.
  const [filter, setFilter] = useState<string>(defaultFilter ?? 'all');
  // A new `defaultFilter` (another dataset picked in Controls) restarts from it, without re-mounting.
  const [seenDefault, setSeenDefault] = useState(defaultFilter);
  if (seenDefault !== defaultFilter) {
    setSeenDefault(defaultFilter);
    setFilter(defaultFilter ?? 'all');
  }
  const table = useListReport<Invoice>({
    rows,
    columns: cols,
    getRowId: (r) => r.id,
    onSortChange,
    defaultSort,
    filters: DEMO_FILTERS,
    filter,
  });
  return (
    <ListReportTable
      table={table}
      aria-label={label}
      maxHeight={maxHeight}
      dir={dir}
      data-testid="scroller"
      status={status}
      loadingRowCount={loadingRowCount}
      errorMessage={errorMessage}
      onRetry={onRetry}
      onClearFilters={
        onClearFilters
          ? () => {
              onClearFilters();
              setFilter('all');
            }
          : undefined
      }
    />
  );
}

type Dataset = 'empty' | '3 rows' | '40 rows' | '200 rows' | 'filter that excludes everything';

interface PlaygroundArgs {
  maxHeight: number;
  containerWidth: number;
  dir: 'ltr' | 'rtl';
  dateFirstSort: ListReportSortDirection;
  status: 'ready' | 'loading' | 'error';
  loadingRowCount: number;
  dataset: Dataset;
  onSortChange: (sort: ListReportSort) => void;
  onRetry: () => void;
  onClearFilters: () => void;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Data/ListReportTable',
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: ListReportTable as never,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    maxHeight: { control: { type: 'range', min: 160, max: 700, step: 10 } },
    dir: { control: 'radio', options: ['ltr', 'rtl'], description: 'Native `dir` of the scroll container: `rtl` mirrors the columns and the scroll.' },
    status: { control: 'radio', options: ['ready', 'loading', 'error'] },
    loadingRowCount: { control: { type: 'number', min: 0, max: 20, step: 1 } },
    onRetry: { control: false },
    onClearFilters: { control: false },
    // Set by the demo (`table` from useListReport, the name, the texts and row actions).
    ...withoutControls('table', 'errorMessage', 'labels', 'rowActions', 'rowActionsInline', 'aria-label', 'aria-labelledby', 'caption', 'ref'),
    containerWidth: storyControl({ control: { type: 'range', min: 320, max: 1200, step: 10 }, description: 'Width of the demo box (px).' }),
    dateFirstSort: storyControl({
      control: 'radio',
      options: ['asc', 'desc'],
      description: 'The `firstSortDirection` of the "Date" column (a column option of `useListReport({ columns })`).',
    }),
    dataset: storyControl({
      control: 'select',
      options: ['empty', '3 rows', '40 rows', '200 rows', 'filter that excludes everything'],
      description: 'The rows given to `useListReport({ rows })`; "filter that excludes everything" starts with a filter that hides every row.',
    }),
    onSortChange: storyControl({ control: false, description: 'An option of the hook, not a prop of the table: `useListReport({ onSortChange })`.' }),
  },
  args: {
    maxHeight: 360,
    containerWidth: 900,
    dir: 'ltr',
    dateFirstSort: 'desc',
    status: 'ready',
    loadingRowCount: 5,
    dataset: '40 rows',
    onSortChange: fn(),
    onRetry: fn(),
    onClearFilters: fn(),
  },
};

const DATASETS: Record<Exclude<Dataset, 'filter that excludes everything'>, Invoice[]> = {
  empty: [],
  '3 rows': makeInvoices(3),
  '40 rows': makeInvoices(40),
  '200 rows': makeInvoices(200),
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

const PAGE: CSSProperties = { padding: 16, fontFamily: 'system-ui, sans-serif' };
const NO_CONTROLS = { controls: { disable: true } };
const INVOICES = makeInvoices(40);

/**
 * Controls: `maxHeight` of the scroll container, `containerWidth` of the demo box (narrow it to see the
 * horizontal scroll stay inside the box), `dir`, `firstSortDirection` of the "Date" column, `status`
 * (`ready` / `loading` / `error`), `loadingRowCount` and the `dataset` (empty, 3, 40 or 200 rows, or a
 * filter that excludes everything); switch them and the header and the minimum body do not move.
 * `onSortChange`, `onRetry` and `onClearFilters` show up in Actions. The play function clicks "Amount"
 * twice and checks that the rows are in descending order, that the header says so and that exactly
 * two sort changes were notified.
 */
export const Playground: Story = {
  render: ({ maxHeight, containerWidth, dir, dateFirstSort, status, loadingRowCount, dataset, onSortChange, onRetry, onClearFilters }) => {
    const cols = columns(dateFirstSort);
    const excludeAll = dataset === 'filter that excludes everything';
    return (
      <div style={PAGE}>
        <div style={{ width: containerWidth, maxWidth: '100%' }} data-testid="box">
          <TableDemo
            rows={excludeAll ? INVOICES : DATASETS[dataset]}
            defaultFilter={excludeAll ? 'none' : 'all'}
            columns={cols}
            maxHeight={maxHeight}
            onSortChange={onSortChange}
            dir={dir}
            status={status}
            loadingRowCount={loadingRowCount}
            onRetry={onRetry}
            onClearFilters={onClearFilters}
          />
        </div>
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    // The sort scenario is written for the default configuration (40 rows, ready): with another
    // `status` or `dataset` (picked in Controls or by a test) there is nothing to sort.
    if (args.status !== 'ready' || args.dataset !== '40 rows') return;
    const canvas = within(canvasElement);
    const header = canvas.getByRole('columnheader', { name: 'Amount' });
    const button = within(header).getByRole('button');
    await userEvent.click(button);
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(button);
    await expect(header).toHaveAttribute('aria-sort', 'descending');

    const expected = [...INVOICES].sort((a, b) => b.amount - a.amount).slice(0, 3).map((r) => money(r.amount));
    const rows = canvas.getAllByRole('row').slice(1, 4);
    await expect(rows.map((r) => within(r).getAllByRole('cell')[3]!.textContent)).toEqual(expected);

    await expect(args.onSortChange).toHaveBeenCalledTimes(2);
    await expect(args.onSortChange).toHaveBeenNthCalledWith(1, { columnId: 'amount', direction: 'asc' });
    await expect(args.onSortChange).toHaveBeenNthCalledWith(2, { columnId: 'amount', direction: 'desc' });
  },
};

/** The table as it comes, unsorted: a stable starting point for the keyboard and geometry checks. */
export const Plain: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 900 }}>
        <TableDemo rows={INVOICES} columns={columns()} maxHeight={360} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('columnheader')).toHaveLength(5);
    await expect(canvas.getAllByRole('row')).toHaveLength(INVOICES.length + 1);
    for (const header of canvas.getAllByRole('columnheader')) await expect(header).not.toHaveAttribute('aria-sort');
  },
};

const WIDE_BOX: CSSProperties = { width: 1000 };

/** Every column declares a width (px and %): each keeps it, the table is as wide as the columns together. */
export const MixedWidths: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={WIDE_BOX}>
        <TableDemo
          rows={INVOICES.slice(0, 4)}
          columns={[
            { id: 'id', header: 'N.', accessor: (r) => r.id, width: 200 },
            { id: 'customer', header: 'Customer', accessor: (r) => r.customer, width: '30%' },
          ]}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [first, second] = within(canvasElement).getAllByRole('columnheader');
    await expect(Math.round(first!.getBoundingClientRect().width)).toBe(200);
    // 30% is a share of the table itself, which is 200px / 0.7 wide
    await expect(Math.abs(second!.getBoundingClientRect().width - 0.3 * (200 / 0.7))).toBeLessThanOrEqual(1);
  },
};

/** Every column in rem: no stretching to the container either. */
export const RemWidths: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={WIDE_BOX}>
        <TableDemo
          rows={INVOICES.slice(0, 4)}
          columns={[
            { id: 'id', header: 'N.', accessor: (r) => r.id, width: '10rem' },
            { id: 'customer', header: 'Customer', accessor: (r) => r.customer, width: '10rem' },
          ]}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByRole('columnheader');
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(Math.abs(first!.getBoundingClientRect().width - 10 * rem)).toBeLessThanOrEqual(1);
  },
};

/** Long texts truncated, right-aligned amounts, a sorted column (the arrow marks the direction). */
export const LongTexts: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <TableDemo rows={INVOICES.slice(0, 8)} columns={columns()} defaultSort={{ columnId: 'amount', direction: 'desc' }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
    const first = canvas.getAllByRole('row')[1]!;
    const description = within(first).getAllByRole('cell')[2]!.firstElementChild as HTMLElement;
    await expect(description.scrollWidth).toBeGreaterThan(description.clientWidth);
  },
};

/** A narrow box: the table scrolls horizontally inside it, the page does not. */
export const NarrowContainer: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 340, maxWidth: '100%' }}>
        <TableDemo rows={INVOICES.slice(0, 8)} columns={columns()} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scroller = within(canvasElement).getByTestId('scroller');
    await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  },
};

/** Scrolled down and to the side: the header stays on top of the scroll container. */
export const StickyAfterScroll: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 420, maxWidth: '100%' }}>
        <TableDemo rows={INVOICES} columns={columns()} maxHeight={260} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scroller = within(canvasElement).getByTestId('scroller');
    scroller.scrollTop = 220;
    scroller.scrollLeft = 80;
    await expect(scroller.scrollTop).toBeGreaterThan(0);
    const header = within(canvasElement).getAllByRole('columnheader')[0]!;
    await expect(Math.abs(header.getBoundingClientRect().top - scroller.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
  },
};

const MANY: ListReportColumn<Invoice>[] = Array.from({ length: 20 }, (_, i) => ({
  id: `c${i}`,
  header: i === 3 ? 'A very long header that must not wrap' : `Col. ${i + 1}`,
  accessor: (r: Invoice) => `${r.id}/${i + 1}`,
}));

/** Twenty columns in a phone-sized box: horizontal scroll inside the box, header sticky. */
export const TwentyColumns: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 360, maxWidth: '100%' }}>
        <TableDemo rows={INVOICES.slice(0, 12)} columns={MANY} maxHeight={240} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const scroller = within(canvasElement).getByTestId('scroller');
    await expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth * 3);
    const cols = within(canvasElement).getAllByRole('columnheader');
    await expect(cols).toHaveLength(20);
  },
};

/** `dir="rtl"`: start and end swap, the ellipsis and the sort arrow follow. */
export const Rtl: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <TableDemo rows={INVOICES.slice(0, 6)} columns={columns()} dir="rtl" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const th = canvas.getByRole('columnheader', { name: 'Amount' });
    await expect(getComputedStyle(th).textAlign).toBe('end');
    const scroller = canvas.getByTestId('scroller');
    // End in rtl is the left edge: the amount cell is to the left of the customer cell.
    const cells = within(canvas.getAllByRole('row')[1]!).getAllByRole('cell');
    await expect(cells[3]!.getBoundingClientRect().left).toBeLessThan(cells[1]!.getBoundingClientRect().left);
    await expect(getComputedStyle(scroller).direction).toBe('rtl');
  },
};

const STATE_BOX: CSSProperties = { width: 900, maxWidth: '100%' };

/**
 * A table in one fixed state, for the screenshots (one per state and viewport). Each export below
 * writes its own `tags: ['visual']`: Storybook reads tags statically, not through a helper.
 */
const stateRender =
  (props: Omit<TableDemoProps, 'columns'>): Story['render'] =>
  () => (
    <div style={PAGE}>
      <div style={STATE_BOX}>
        <TableDemo columns={columns()} {...props} />
      </div>
    </div>
  );
const stateParameters = (description: string) => ({ ...NO_CONTROLS, docs: { description: { story: description } } });

const rowsOf = (canvas: { getAllByRole: (role: string) => HTMLElement[] }): HTMLElement[] => canvas.getAllByRole('row').slice(1);

/** Loading without rows: five skeleton rows under the same header, `aria-busy` on the scroller. */
export const Loading: Story = {
  tags: ['visual'],
  parameters: stateParameters('`status="loading"` with no rows.'),
  render: stateRender({ rows: [], status: 'loading' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scroller')).toHaveAttribute('aria-busy', 'true');
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton]')).toHaveLength(5);
    await expect(canvas.getAllByRole('columnheader')).toHaveLength(5);
  },
};

/** Empty: the message in one cell across the columns. */
export const Empty: Story = {
  tags: ['visual'],
  parameters: stateParameters('No rows in the input.'),
  render: stateRender({ rows: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(rowsOf(canvas)).toHaveLength(1);
    await expect(canvas.getByRole('table').querySelector('td')).toHaveAttribute('colspan', '5');
    await expect(within(canvas.getByRole('table')).getByText('No data')).toBeVisible();
  },
};

/**
 * No results: rows exist but the filter hides them. The play only checks the state (the screenshot is
 * taken after it): clicking "Clear filters" is tried in the Playground and in the e2e suite.
 */
export const NoResults: Story = {
  tags: ['visual'],
  parameters: stateParameters('The filter excludes every row: "Clear filters" appears.'),
  render: stateRender({ rows: INVOICES.slice(0, 8), defaultFilter: 'none', onClearFilters: fn() }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(within(canvas.getByRole('table')).getByText('No results for the current filters')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('tbody tr:not([data-rop-state])')).toHaveLength(0);
  },
};

/**
 * Error: a Message Strip with "Retry" in place of the body; the header stays. The play function clicks
 * "Retry": the callback here changes nothing, so the error and the button stay, and so does the focus
 * (it moves to the table container only when the strip goes away).
 */
export const ErrorState: Story = {
  tags: ['visual'],
  parameters: stateParameters('Load error with `onRetry`.'),
  render: stateRender({ rows: [], status: 'error', onRetry: fn() }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(within(canvas.getByRole('table')).getByText('Unable to load data')).toBeVisible();
    const retry = canvas.getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await expect(retry).toHaveFocus();
    await expect(canvas.getByTestId('scroller')).not.toHaveFocus();
  },
};

/** A long error text on a narrow screen wraps inside the strip: the page does not scroll sideways. */
export const ErrorLongMessage: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 340, maxWidth: '100%' }}>
        <TableDemo
          columns={columns()}
          rows={[]}
          status="error"
          onRetry={fn()}
          errorMessage={`Unable to load the invoices: ${'the server is not responding '.repeat(8)}https://example.com/${'a'.repeat(60)}`}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    const strip = canvasElement.querySelector('tbody [class*="rounded-rop-md"]') as HTMLElement;
    await expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth);
  },
};

/** Reload with data: the rows stay, nothing changes height, the scroller is busy. */
export const Reloading: Story = {
  tags: ['visual'],
  parameters: stateParameters('`status="loading"` with rows already present: they stay visible, no skeletons.'),
  render: stateRender({ rows: INVOICES.slice(0, 8), status: 'loading' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scroller')).toHaveAttribute('aria-busy', 'true');
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton]')).toHaveLength(0);
    await expect(rowsOf(canvas)).toHaveLength(8);
    // sortable headers still work
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(canvas.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'ascending');
  },
};

// Changes the args of the running story, as the Controls panel does (the story is not re-mounted).
function setArgs(storyId: string, updatedArgs: Partial<PlaygroundArgs>): void {
  addons.getChannel().emit('updateStoryArgs', { storyId, updatedArgs });
}

/**
 * Starts loading (no rows), goes to error, clicks "Retry" (Actions gets the call) and ends on three
 * rows. In every step the header does not move and the body is never shorter than `loadingRowCount` rows.
 */
export const StatusTransitions: Story = {
  parameters: NO_CONTROLS,
  args: { status: 'loading', dataset: 'empty', loadingRowCount: 5 },
  render: ({ status, dataset, loadingRowCount, onRetry }) => (
    <div style={PAGE}>
      <div style={STATE_BOX}>
        <TableDemo columns={columns()} rows={dataset === 'empty' ? [] : DATASETS[dataset as '3 rows']} status={status} loadingRowCount={loadingRowCount} onRetry={onRetry} />
      </div>
    </div>
  ),
  play: async ({ args, canvasElement, id }) => {
    const canvas = within(canvasElement);
    const scroller = canvas.getByTestId('scroller');
    const headerTop = () => canvas.getAllByRole('columnheader')[0]!.getBoundingClientRect().top;
    const tableWidth = () => canvas.getByRole('table').getBoundingClientRect().width;
    const top = headerTop();
    const width = tableWidth();

    await expect(scroller).toHaveAttribute('aria-busy', 'true');
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton]')).toHaveLength(5);

    setArgs(id, { status: 'error' });
    const retry = await canvas.findByRole('button', { name: 'Retry' });
    await expect(scroller).not.toHaveAttribute('aria-busy');
    await expect(headerTop()).toBe(top);
    await expect(tableWidth()).toBe(width);

    await userEvent.click(retry);
    await expect(args.onRetry).toHaveBeenCalledTimes(1);

    setArgs(id, { status: 'ready', dataset: '3 rows' });
    await waitFor(() => expect(canvas.getAllByRole('row').filter((r) => r.querySelector('td') && !r.hasAttribute('aria-hidden'))).toHaveLength(3));
    await expect(headerTop()).toBe(top);
    await expect(tableWidth()).toBe(width);
  },
};

// --- Selection -----------------------------------------------------------------------------------

interface TableSelectionArgs {
  selectable: boolean;
  controlled: boolean;
  preselected: 'none' | 'some' | 'all';
  status: 'ready' | 'loading' | 'error';
  dataset: 'rows' | 'empty' | 'noResults';
  onSelectedIdsChange: (ids: ReadonlySet<string>) => void;
}

const SELECTION_INVOICES = makeInvoices(12);
const SELECTION_COLUMNS: ListReportColumn<Invoice>[] = [
  { id: 'id', header: 'No.', accessor: (r) => r.id, width: 90 },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customer, minWidth: 160 },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, cell: (r) => money(r.amount), align: 'end', width: 120 },
  { id: 'date', header: 'Date', accessor: (r) => r.date, width: 120 },
];
const NO_INVOICES: Invoice[] = [];
const TABLE_PRESELECTED: Record<TableSelectionArgs['preselected'], ReadonlySet<string>> = {
  none: new Set(),
  some: new Set(['F-0002', 'F-0003']),
  all: new Set(SELECTION_INVOICES.map((r) => r.id)),
};

function TableSelectionDemo({ selectable, controlled, preselected, status, dataset, onSelectedIdsChange }: TableSelectionArgs) {
  const [parentIds, setParentIds] = useState<ReadonlySet<string>>(TABLE_PRESELECTED[preselected]);
  const table = useListReport<Invoice>({
    rows: dataset === 'empty' ? NO_INVOICES : SELECTION_INVOICES,
    columns: SELECTION_COLUMNS,
    getRowId: (r) => r.id,
    filters: DEMO_FILTERS,
    filter: dataset === 'noResults' ? 'none' : 'all',
    selectable,
    defaultSelectedIds: controlled ? undefined : TABLE_PRESELECTED[preselected],
    selectedIds: controlled ? parentIds : undefined,
    onSelectedIdsChange: (ids) => {
      if (controlled) setParentIds(ids);
      onSelectedIdsChange(ids);
    },
  });
  return (
    <div style={{ ...PAGE, width: 760, maxWidth: '100%', boxSizing: 'border-box' }}>
      <p style={{ margin: '0 0 8px', fontSize: 14 }}>
        Selected: <output data-testid="selected-count">{table.selection.selectedResultCount}</output>
        {controlled ? ` (parent state: ${parentIds.size} ids)` : null}
      </p>
      <ListReportTable table={table} aria-label="Invoices" maxHeight={420} status={status} />
    </div>
  );
}

/**
 * The table alone with `useListReport({ selectable: true })`: a leading checkbox column (as wide as a row
 * is tall), a tri-state "Select all results" header and one distinctly named checkbox per row ("Select
 * F-0001"). A selected row is tinted; a click elsewhere in the row does nothing. Controls: `selectable`,
 * `controlled`, the initial selection, `status` and the dataset (the column keeps its place in every state);
 * `onSelectedIdsChange` shows up in Actions.
 * The play function selects two rows (the header becomes indeterminate), then uses the header to select
 * all and to deselect all, and checks the four reported changes.
 */
export const Selection: StoryObj<TableSelectionArgs> = {
  argTypes: {
    selectable: { control: 'boolean', description: '`selectable` of `useListReport`' },
    controlled: { control: 'boolean', description: 'Controlled `selectedIds` (parent state shown above) or uncontrolled' },
    preselected: { control: 'select', options: ['none', 'some', 'all'], description: 'Initial selection' },
    status: { control: 'radio', options: ['ready', 'loading', 'error'], description: '`status` of the table: the selection column keeps its place in every state' },
    dataset: {
      control: { type: 'select', labels: { rows: '12 rows', empty: 'empty', noResults: 'no results' } },
      options: ['rows', 'empty', 'noResults'], description: 'The rows, none at all, or a filter that hides them all (the header checkbox is then disabled)' },
    onSelectedIdsChange: { control: false },
    ...Object.fromEntries(
      ['maxHeight', 'containerWidth', 'dir', 'dateFirstSort', 'loadingRowCount', 'onSortChange', 'onRetry', 'onClearFilters'].map(
        (key) => [key, { control: false, table: { disable: true } }],
      ),
    ),
  },
  args: { selectable: true, controlled: false, preselected: 'none', status: 'ready', dataset: 'rows', onSelectedIdsChange: fn() },
  render: (args) => <TableSelectionDemo key={`${String(args.controlled)}-${args.preselected}`} {...args} />,
  play: async ({ args, canvasElement }) => {
    if (!args.selectable || args.preselected !== 'none' || args.status !== 'ready' || args.dataset !== 'rows') return;
    const canvas = within(canvasElement);
    const all = canvas.getByRole('checkbox', { name: 'Select all results' }) as HTMLInputElement;
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select F-0001' }));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select F-0004' }));
    await expect(all.indeterminate).toBe(true);
    await expect(canvas.getByRole('checkbox', { name: 'Select F-0004' }).closest('tr')).toHaveAttribute('data-selected');
    await expect(canvas.getByTestId('selected-count')).toHaveTextContent('2');
    await userEvent.click(all);
    await expect(all).toBeChecked();
    await expect(canvas.getByTestId('selected-count')).toHaveTextContent('12');
    await userEvent.click(all);
    await expect(all).not.toBeChecked();
    await expect(canvas.getByTestId('selected-count')).toHaveTextContent('0');
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(4);
  },
};
