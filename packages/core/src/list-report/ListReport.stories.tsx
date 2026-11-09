import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import {
  DEMO_STATUS_LABEL,
  formatEuro,
  makeDemoInvoices,
  type DemoInvoice,
} from '../internal/demo-invoices';
import { ListReport } from './ListReport';
import type { ListReportColumn, ListReportFilter, ListReportSort, ListReportSortDirection } from './types';
import { useListReport } from './use-list-report';
import { createMemoryUrlAdapter } from '../internal/memory-url-adapter';
import { useListReportScrollRestoration } from './use-list-report-scroll-restoration';
import { useListReportUrlState } from './use-list-report-url-state';

/** How long "Simulate loading" keeps the report in `loading`. */
const LOADING_MS = 800;

const FILTERS: ListReportFilter<DemoInvoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To approve', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Rejected', predicate: (r) => r.status === 'rejected' },
];

function columns(firstDateDirection: ListReportSortDirection): ListReportColumn<DemoInvoice>[] {
  return [
    { id: 'number', header: 'Number', accessor: (r) => r.number, width: 150 },
    { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier, minWidth: 200 },
    { id: 'date', header: 'Date', accessor: (r) => r.date, firstSortDirection: firstDateDirection, width: 130 },
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
    { id: 'status', header: 'Status', accessor: (r) => DEMO_STATUS_LABEL[r.status], searchable: false, width: 150 },
  ];
}

type DelayChoice = 0 | 300 | 800 | 'Enter only';
type Dataset = 0 | 3 | 200;

interface ShowcaseArgs {
  status: 'ready' | 'loading' | 'error';
  dataset: Dataset;
  searchCommitDelay: DelayChoice;
  firstSortDirection: ListReportSortDirection;
  containerWidth: number;
  onSortChange: (sort: ListReportSort) => void;
  onFilterChange: (filter: string) => void;
  onSearchQueryChange: (query: string) => void;
  onRetry: () => void;
  /** Fixtures: not in Controls. */
  defaultFilter?: string;
  defaultSearchQuery?: string;
  /** No parent height: the report lives in the normal flow of the page. */
  flow?: boolean;
}

const PAGE: CSSProperties = {
  boxSizing: 'border-box',
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  fontFamily: 'system-ui, sans-serif',
};

function Showcase({
  status,
  dataset,
  searchCommitDelay,
  firstSortDirection,
  containerWidth,
  onSortChange,
  onFilterChange,
  onSearchQueryChange,
  onRetry,
  defaultFilter,
  defaultSearchQuery,
  flow,
}: ShowcaseArgs) {
  const all = useMemo(() => makeDemoInvoices(dataset), [dataset]);
  const [simulating, setSimulating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cols = useMemo(() => columns(firstSortDirection), [firstSortDirection]);

  const table = useListReport<DemoInvoice>({
    // While "loading" there are no rows yet: the skeleton shows, and filter and search survive.
    rows: simulating ? [] : all,
    columns: cols,
    getRowId: (r) => r.id,
    filters: FILTERS,
    defaultFilter,
    defaultSearchQuery,
    searchCommitDelay: searchCommitDelay === 'Enter only' ? null : searchCommitDelay,
    onSortChange,
    onFilterChange,
    onSearchQueryChange,
  });

  const simulate = () => {
    clearTimeout(timer.current);
    setSimulating(true);
    timer.current = setTimeout(() => setSimulating(false), LOADING_MS);
  };

  return (
    <div style={PAGE}>
      <div>
        <Button variant="secondary" onClick={simulate}>
          Simulate loading
        </Button>
      </div>
      <div style={{ width: containerWidth, maxWidth: '100%', height: flow ? undefined : 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Invoices"
          table={table}
          actions={<Button>New invoice</Button>}
          status={simulating ? 'loading' : status}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

const meta: Meta<ShowcaseArgs> = {
  title: 'Floorplans/List Report',
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: ListReport as never,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: { control: 'radio', options: ['ready', 'loading', 'error'], description: '`status` of `ListReport`' },
    dataset: { control: 'select', options: [0, 3, 200], description: 'Rows of the invoice queue: none, 3 or 200' },
    searchCommitDelay: {
      control: 'select',
      options: [0, 300, 800, 'Enter only'],
      description: '`searchCommitDelay` of `useListReport` (ms); "Enter only" = commits only on Enter',
    },
    firstSortDirection: {
      control: 'radio',
      options: ['asc', 'desc'],
      description: '`firstSortDirection` of the "Date" column: direction of the first click',
    },
    containerWidth: { control: { type: 'range', min: 320, max: 1280, step: 10 }, description: 'Container width (px)' },
    onSortChange: { control: false },
    onFilterChange: { control: false },
    onSearchQueryChange: { control: false },
    onRetry: { control: false },
    defaultFilter: { control: false, table: { disable: true } },
    defaultSearchQuery: { control: false, table: { disable: true } },
    flow: { control: false, table: { disable: true } },
  },
  args: {
    status: 'ready',
    dataset: 200,
    searchCommitDelay: 300,
    firstSortDirection: 'desc',
    containerWidth: 1100,
    onSortChange: fn(),
    onFilterChange: fn(),
    onSearchQueryChange: fn(),
    onRetry: fn(),
  },
  render: (args) => <Showcase {...args} />,
};

export default meta;
type Story = StoryObj<ShowcaseArgs>;

const NO_CONTROLS = { controls: { disable: true } };

const heading = (canvas: ReturnType<typeof within>) => canvas.getByRole('heading', { name: /Invoices/ });
const bodyRows = (canvas: ReturnType<typeof within>) => canvas.getAllByRole('row').slice(1);

/**
 * The vistato invoice queue: title with count, actions, filters and search, and a table that
 * fills the space with a single scroller. Controls: `status`, `dataset`, `searchCommitDelay`,
 * `firstSortDirection` of the "Date" column and container width; the callbacks show up in Actions.
 * The play function picks "To approve", searches for a supplier, sorts by amount descending, checks
 * the first rows and the "n of 200" count, then searches for a non-existent text, clicks "Clear filters"
 * and checks that 200 rows are back and that the focus is on the search field.
 */
export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: with another dataset or status (picked in Controls)
    // the scenario has nothing to check.
    if (args.dataset !== 200 || args.status !== 'ready') return;
    const canvas = within(canvasElement);
    const all = makeDemoInvoices(200);
    const pending = all.filter((r) => r.status === 'pending');

    await userEvent.click(canvas.getByRole('radio', { name: 'To approve' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('pending');
    await expect(heading(canvas)).toHaveTextContent(`Invoices (${pending.length} of 200)`);

    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(search, 'Ferrari{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('Ferrari');
    const found = pending.filter((r) => r.supplier.includes('Ferrari'));
    await expect(found.length).toBeGreaterThan(2);
    await expect(heading(canvas)).toHaveTextContent(`Invoices (${found.length} of 200)`);

    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
    const sorted = [...found].sort((a, b) => b.amount - a.amount);
    const rows = bodyRows(canvas);
    await expect(rows).toHaveLength(found.length);
    await expect(rows[0]).toHaveTextContent(sorted[0]!.number);
    await expect(rows[0]).toHaveTextContent(formatEuro(sorted[0]!.amount));
    await expect(rows[1]).toHaveTextContent(sorted[1]!.number);

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz{Enter}');
    await expect(canvas.getByText('No results for the current filters', { selector: 'p' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(bodyRows(canvas)).toHaveLength(200));
    await expect(heading(canvas)).toHaveTextContent('Invoices (200)');
    await expect(canvas.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(search).toHaveValue('');
    await expect(search).toHaveFocus();
  },
};

/** Active filter ("To approve"): the count says "n of 200". */
export const WithActiveFilter: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { defaultFilter: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pending = makeDemoInvoices(200).filter((r) => r.status === 'pending').length;
    await expect(canvas.getByRole('radio', { name: 'To approve' })).toBeChecked();
    await expect(heading(canvas)).toHaveTextContent(`Invoices (${pending} of 200)`);
    await expect(bodyRows(canvas)).toHaveLength(pending);
  },
};

/** Loading with no rows: skeletons in the same footprint, the count is not there yet (but its space is). */
export const Loading: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { status: 'loading', dataset: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('table', { name: 'Invoices' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton]').length).toBeGreaterThan(0);
  },
};

/** No data. */
export const Empty: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { dataset: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No data', { selector: 'p' })).toBeVisible();
    await expect(heading(canvas)).toHaveTextContent('Invoices (0)');
  },
};

/** A search that finds nothing: "Clear filters" works with no extra wiring. */
export const NoResults: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { defaultSearchQuery: 'zzz' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No results for the current filters', { selector: 'p' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await expect(heading(canvas)).toHaveTextContent('Invoices (0 of 200)');
  },
};

/**
 * Error: the body becomes a strip with "Retry" (the callback shows up in Actions). The status stays `error`
 * after the click, so the button stays and keeps the focus: no focus indicator around the whole table.
 */
export const ErrorState: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { status: 'error' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Unable to load data')).toBeVisible();
    const retry = canvas.getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
    await expect(retry).toHaveFocus();
  },
};

/**
 * The count is a small pill that briefly changes colour when the number changes (not on mount).
 * No Controls (the callbacks and Controls are in the Playground). The play function picks "To approve" and checks
 * that the pill marks the change (`data-changed`) and then returns to rest, then goes back to "All" and checks the
 * same cycle. With `prefers-reduced-motion` the tone does not change (see e2e): the number just appears.
 */
export const CountPill: Story = {
  parameters: NO_CONTROLS,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvasElement.querySelector('[data-rop-count]');
    if (!(pill instanceof HTMLElement)) throw new Error('count pill not found');
    await expect(pill).not.toHaveAttribute('data-changed');
    const pending = makeDemoInvoices(200).filter((r) => r.status === 'pending').length;

    await userEvent.click(canvas.getByRole('radio', { name: 'To approve' }));
    await expect(pill).toHaveTextContent(`(${pending} of 200)`);
    await expect(pill).toHaveAttribute('data-changed');
    await waitFor(() => expect(pill).not.toHaveAttribute('data-changed'));

    await userEvent.click(canvas.getByRole('radio', { name: 'All' }));
    await expect(pill).toHaveTextContent('(200)');
    await expect(pill).toHaveAttribute('data-changed');
    await waitFor(() => expect(pill).not.toHaveAttribute('data-changed'));
  },
};

/** Fixture of the e2e suite: the showcase as it opens, without the play function (the e2e interacts on its own). */
export const NoPlay: Story = {
  tags: ['internal'],
  parameters: NO_CONTROLS,
};

/** Fixture of the e2e suite: no parent height, the report is in the normal flow and the page scrolls. */
export const FlowLayout: Story = {
  parameters: NO_CONTROLS,
  args: { flow: true },
};

// --- URL state ---------------------------------------------------------------------------------

const URL_STATUS_LABEL: Record<DemoInvoice['status'], string> = {
  pending: 'Open',
  approved: 'Approved',
  rejected: 'Rejected',
};

const URL_FILTERS: ListReportFilter<DemoInvoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approved', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Rejected', predicate: (r) => r.status === 'rejected' },
];

const URL_COLUMNS: ListReportColumn<DemoInvoice>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number, width: 150 },
  { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier, minWidth: 200 },
  { id: 'date', header: 'Date', accessor: (r) => r.date, width: 130 },
  {
    id: 'amount',
    header: 'Amount',
    accessor: (r) => r.amount,
    cell: (r) => formatEuro(r.amount),
    align: 'end',
    searchable: false,
    width: 140,
  },
  { id: 'status', header: 'Status', accessor: (r) => URL_STATUS_LABEL[r.status], searchable: false, width: 150 },
];
const URL_SORTABLE = URL_COLUMNS.map((c) => c.id);
const URL_ROWS = makeDemoInvoices(200);

const URL_LABELS = {
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

/** Strings, so that the e2e can pick one through the URL args of Storybook (`searchCommitDelay:800`). */
type UrlDelayChoice = '0' | '300' | '800' | 'Enter only';

interface UrlStateArgs {
  history: 'replace' | 'push';
  prefix: string;
  searchCommitDelay: UrlDelayChoice;
  onFilterChange: (filter: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSortChange: (sort: ListReportSort) => void;
}

function UrlStateDemo({ history, prefix, searchCommitDelay, onFilterChange, onSearchQueryChange, onSortChange }: UrlStateArgs) {
  const url = useListReportUrlState({
    filters: URL_FILTERS,
    sortableColumnIds: URL_SORTABLE,
    prefix: prefix || undefined,
    history,
  });
  const table = useListReport<DemoInvoice>({
    rows: URL_ROWS,
    columns: URL_COLUMNS,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    searchCommitDelay: searchCommitDelay === 'Enter only' ? null : Number(searchCommitDelay),
    ...url,
    // The URL is written first, then the story's callbacks are told (they show up in Actions).
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
  // Read at render: the story re-renders whenever the hook's values change.
  const search = typeof window === 'undefined' ? '' : window.location.search;
  return (
    <div style={PAGE}>
      <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
        Query string of this frame: <code data-testid="url-search">{search || '(empty)'}</code>
      </p>
      <div style={{ width: 1100, maxWidth: '100%', height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport title="Invoices" table={table} labels={URL_LABELS} filtersLabel="Filters" searchLabel="Search" />
      </div>
    </div>
  );
}

const HIDDEN = { control: false, table: { disable: true } } as const;

/**
 * `useListReportUrlState` wired into `useListReport`: the active pill, the committed search and the sort
 * live in the query string of the frame (shown above the report; open the story in its own tab to see
 * the address bar, then reload or use Back/Forward). The text being typed never goes in the URL.
 * Controls: `history` (`replace` keeps the history as it is, `push` adds one entry per gesture), `prefix`
 * (parameters become `<prefix>.filter`, `<prefix>.q`, `<prefix>.sort`) and the search commit delay; the
 * callbacks show up in Actions only for gestures, never for Back/Forward.
 * The play function starts from a URL without the report's parameters (as Back would: no callback),
 * picks "Open", searches "rossi" with Enter, clicks "Amount" twice and checks the query string, the
 * selected pill, the sorted rows and the history length.
 */
export const UrlState: StoryObj<UrlStateArgs> = {
  argTypes: {
    history: {
      control: 'radio',
      options: ['replace', 'push'],
      description: '`history` of `useListReportUrlState`: how a gesture writes the URL',
    },
    prefix: { control: 'text', description: '`prefix` of `useListReportUrlState` (empty = none)' },
    searchCommitDelay: {
      control: 'select',
      options: ['0', '300', '800', 'Enter only'],
      description: '`searchCommitDelay` of `useListReport` (ms); "Enter only" commits on Enter only',
    },
    onFilterChange: { control: false },
    onSearchQueryChange: { control: false },
    onSortChange: { control: false },
    // The showcase's other controls do not apply here.
    ...{ status: HIDDEN, dataset: HIDDEN, firstSortDirection: HIDDEN, containerWidth: HIDDEN, onRetry: HIDDEN },
  },
  args: {
    history: 'replace',
    prefix: '',
    searchCommitDelay: '300',
    onFilterChange: fn(),
    onSearchQueryChange: fn(),
    onSortChange: fn(),
  },
  render: (args) => <UrlStateDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('UrlState: no window');
    const keys = ['filter', 'q', 'sort'].map((name) => (args.prefix ? `${args.prefix}.${name}` : name));
    const [filterKey, searchKey, sortKey] = keys as [string, string, string];
    /** The report's own parameters, as `filter=..&q=..&sort=..` (empty when missing). */
    const own = () => {
      const params = new URLSearchParams(win.location.search);
      return keys.map((k) => `${k}=${params.get(k) ?? ''}`).join('&');
    };

    // Start from a URL without the report's parameters, the way Back would: no callback is called.
    const start = new URLSearchParams(win.location.search);
    for (const k of keys) start.delete(k);
    const clean = start.toString();
    win.history.replaceState(win.history.state, '', `${win.location.pathname}${clean ? `?${clean}` : ''}${win.location.hash}`);
    win.dispatchEvent(new PopStateEvent('popstate', { state: win.history.state }));
    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await waitFor(() => expect(canvas.getByRole('radio', { name: 'All' })).toBeChecked());
    await waitFor(() => expect(search).toHaveValue(''));
    await expect(args.onFilterChange).not.toHaveBeenCalled();
    await expect(args.onSearchQueryChange).not.toHaveBeenCalled();
    await expect(args.onSortChange).not.toHaveBeenCalled();
    const length = win.history.length;
    const step = args.history === 'push' ? 1 : 0;

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('open');
    await expect(own()).toBe(`${filterKey}=open&${searchKey}=&${sortKey}=`);
    await expect(win.history.length).toBe(length + step);

    // No pause between keystrokes (`delay: null`): the five characters land within any commit delay, even
    // on a slow machine, so the search is committed once (by Enter) and not halfway through the word.
    await userEvent.type(search, 'rossi{Enter}', { delay: null });
    await expect(args.onSearchQueryChange).toHaveBeenCalledOnce();
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('rossi');
    await expect(own()).toBe(`${filterKey}=open&${searchKey}=rossi&${sortKey}=`);
    await expect(win.history.length).toBe(length + 2 * step);

    const amount = canvas.getByRole('button', { name: 'Amount' });
    await userEvent.click(amount);
    await userEvent.click(amount);
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
    await expect(win.location.search).toContain(`${filterKey}=open&${searchKey}=rossi&${sortKey}=amount.desc`);
    await expect(win.history.length).toBe(length + 4 * step);

    // The report shows what the URL says.
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect(canvas.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
    const expected = URL_ROWS.filter((r) => r.status === 'pending' && r.supplier.startsWith('Rossi')).sort(
      (a, b) => b.amount - a.amount,
    );
    await expect(expected.length).toBeGreaterThan(2);
    const rows = canvas.getAllByRole('row').slice(1);
    await expect(rows).toHaveLength(expected.length);
    await expect(rows[0]).toHaveTextContent(expected[0]!.number);
    await expect(rows[1]).toHaveTextContent(expected[1]!.number);
    await expect(canvas.getByTestId('url-search')).toHaveTextContent(`${sortKey}=amount.desc`);
  },
};

/** Fixture of the e2e suite: `UrlState` without the play function (the e2e drives the URL on its own). */
export const UrlStateNoPlay: StoryObj<UrlStateArgs> = {
  ...UrlState,
  tags: ['internal'],
  play: undefined,
};

interface UrlStateRouterRecipeArgs {
  history: 'replace' | 'push';
  onFilterChange: (filter: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSortChange: (sort: ListReportSort) => void;
  /** Tracks the calls `useListReportUrlState` makes to `adapter.write`. */
  onWrite: (search: string, mode: 'replace' | 'push') => void;
}

function UrlStateRouterRecipeDemo({ history, onFilterChange, onSearchQueryChange, onSortChange, onWrite }: UrlStateRouterRecipeArgs) {
  const latestOnWrite = useRef(onWrite);
  latestOnWrite.current = onWrite;
  // One simulated router per story: the real URL of the frame is never touched.
  const [adapter] = useState(() => createMemoryUrlAdapter({ onWrite: (s, m) => latestOnWrite.current(s, m) }));
  const [, setVersion] = useState(0);
  useEffect(() => adapter.subscribe(() => setVersion((v) => v + 1)), [adapter]);
  const url = useListReportUrlState({ filters: URL_FILTERS, sortableColumnIds: URL_SORTABLE, history, adapter });
  const table = useListReport<DemoInvoice>({
    rows: URL_ROWS,
    columns: URL_COLUMNS,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    ...url,
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
  const query = adapter.read().toString();
  return (
    <div style={PAGE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" disabled={adapter.index === 0} onClick={() => adapter.go(-1)}>
          Back
        </Button>
        <Button variant="secondary" disabled={adapter.index >= adapter.entries.length - 1} onClick={() => adapter.go(1)}>
          Forward
        </Button>
        <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
          Current query: <code data-testid="router-query">{query || '(empty)'}</code>
        </p>
      </div>
      <div style={{ width: 1100, maxWidth: '100%', height: 'min(600px, calc(100dvh - 140px))' }}>
        <ListReport title="Invoices" table={table} labels={URL_LABELS} filtersLabel="Filters" searchLabel="Search" />
      </div>
    </div>
  );
}

/**
 * Recipe for a client-side router: `useListReportUrlState` with an `adapter` (`{ read, write, subscribe }`)
 * instead of `window.location`. Here the "router" is an in-memory query string with a simulated history
 * (the Back/Forward buttons): the real URL of the frame never changes. Copy the adapter below, swapping
 * the memory for your router.
 *
 * ### React Router (v6.4+/v7), covered by a unit test
 *
 * ```tsx
 * import { useMemo } from 'react';
 * import { useLocation, useNavigate, useSearchParams } from 'react-router';
 * import type { ListReportUrlAdapter } from '@react-object-page/core';
 *
 * function useReactRouterAdapter(): ListReportUrlAdapter {
 *   const [searchParams] = useSearchParams();
 *   const { hash, state } = useLocation();
 *   const navigate = useNavigate();
 *   // Rebuilt on every navigation; the re-render is the notification, so `subscribe` does nothing.
 *   // The hash and the location `state` are carried over (`navigate({ search })` alone drops them).
 *   return useMemo(
 *     () => ({
 *       read: () => new URLSearchParams(searchParams),
 *       write: (next, mode) => {
 *         void navigate({ search: next.toString(), hash }, { replace: mode === 'replace', state });
 *       },
 *       subscribe: () => () => undefined,
 *     }),
 *     [searchParams, hash, state, navigate],
 *   );
 * }
 *
 * const adapter = useReactRouterAdapter();
 * const url = useListReportUrlState({ filters: FILTERS, adapter, history: 'push' });
 * ```
 *
 * ### TanStack Router (not covered by an automated test)
 *
 * ```tsx
 * import { useMemo } from 'react';
 * import { useRouter } from '@tanstack/react-router';
 * import type { ListReportUrlAdapter } from '@react-object-page/core';
 *
 * function useTanStackAdapter(): ListReportUrlAdapter {
 *   const router = useRouter();
 *   return useMemo(
 *     () => ({
 *       read: () => new URLSearchParams(router.state.location.searchStr),
 *       write: (next, mode) => {
 *         // Untyped search: the router keeps the query as the object it parses from the string.
 *         void router.navigate({
 *           to: '.',
 *           search: Object.fromEntries(next) as never,
 *           hash: true, // keep the current hash
 *           replace: mode === 'replace',
 *         });
 *       },
 *       subscribe: (listener) => router.subscribe('onResolved', listener),
 *     }),
 *     [router],
 *   );
 * }
 *
 * // TanStack's default search serializer JSON-encodes values: a search "2024" would land in the URL as
 * // `q="2024"`. Give the router plain-string (de)serialization for the query:
 * const router = createRouter({
 *   routeTree,
 *   parseSearch: (searchStr) => Object.fromEntries(new URLSearchParams(searchStr)),
 *   stringifySearch: (search) => {
 *     const query = new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString();
 *     return query ? `?${query}` : '';
 *   },
 * });
 * ```
 *
 * Limits of the TanStack snippet: a parameter repeated in the query (`tag=a&tag=b`) keeps only its last
 * value through `Object.fromEntries`; keep the page's other parameters single-valued.
 *
 * Notes: `write` receives every parameter of the page (not only the report's) and replaces the query string.
 * Keep the adapter stable (`useMemo`, as above): a new object re-subscribes and re-reads, with no write and
 * no callback. `subscribe` may notify synchronously or later, and for the hook's own writes too: the
 * values update with no callback and no response write. `read()` may lag behind `write()` until the router
 * renders (two writes of one gesture, as in "Clear filters", still add up). If `write` throws, the error
 * reaches the caller. With server rendering the hook returns the defaults and reads the adapter after hydration.
 * With TanStack Router, a route with typed `validateSearch` may parse values (numbers, JSON) that the
 * hook then reads back as strings: keep this report's parameters as plain strings.
 *
 * The play function picks "Open", sorts by "Amount", picks "Approved", presses "Back" and checks that the
 * pill returns to "Open" while `onFilterChange` was called only for the two clicks.
 */
export const UrlStateRouterRecipe: StoryObj<UrlStateRouterRecipeArgs> = {
  argTypes: {
    history: {
      control: 'radio',
      options: ['replace', 'push'],
      description: '`history` of `useListReportUrlState`: `replace` leaves Back with nothing to go back to',
    },
    onFilterChange: { control: false },
    onSearchQueryChange: { control: false },
    onSortChange: { control: false },
    onWrite: { control: false, description: 'Calls the hook makes to `adapter.write` (search, mode)' },
    ...{ status: HIDDEN, dataset: HIDDEN, firstSortDirection: HIDDEN, containerWidth: HIDDEN, onRetry: HIDDEN },
  },
  args: {
    history: 'push',
    onFilterChange: fn(),
    onSearchQueryChange: fn(),
    onSortChange: fn(),
    onWrite: fn(),
  },
  render: (args) => <UrlStateRouterRecipeDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('UrlStateRouterRecipe: no window');
    const frameSearch = win.location.search;
    const query = () => canvas.getByTestId('router-query');

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(query()).toHaveTextContent('filter=open&sort=amount.asc');
    await userEvent.click(canvas.getByRole('radio', { name: 'Approved' }));
    await expect(query()).toHaveTextContent('filter=approved&sort=amount.asc');
    await expect(args.onFilterChange).toHaveBeenCalledTimes(2);
    await expect(args.onWrite).toHaveBeenCalledTimes(3);
    await expect(args.onWrite).toHaveBeenLastCalledWith('filter=approved&sort=amount.asc', args.history);

    if (args.history === 'push') {
      await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
      await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
      await expect(query()).toHaveTextContent('filter=open&sort=amount.asc');
      // Navigation is not a gesture: no callback, no write.
      await expect(args.onFilterChange).toHaveBeenCalledTimes(2);
      await expect(args.onWrite).toHaveBeenCalledTimes(3);
      await userEvent.click(canvas.getByRole('button', { name: 'Forward' }));
      await expect(canvas.getByRole('radio', { name: 'Approved' })).toBeChecked();
    } else {
      await expect(canvas.getByRole('button', { name: 'Back' })).toBeDisabled();
    }
    // The simulated router never touches the real URL.
    await expect(win.location.search).toBe(frameSearch);
  },
};

/** Fixture of the e2e suite: `UrlStateRouterRecipe` without the play function. */
export const UrlStateRouterRecipeNoPlay: StoryObj<UrlStateRouterRecipeArgs> = {
  ...UrlStateRouterRecipe,
  tags: ['internal'],
  play: undefined,
};

// --- Scroll restoration ------------------------------------------------------------------------

interface ScrollRestorationArgs {
  loadDelayMs: number;
  history: 'replace' | 'push';
  onOpenDetail: (invoiceId: string) => void;
  onCancel: () => void;
}

const scrollColumns = (open: (id: string) => void): ListReportColumn<DemoInvoice>[] =>
  URL_COLUMNS.map((c) =>
    c.id === 'number'
      ? {
          ...c,
          cell: (r: DemoInvoice) => (
            <button
              type="button"
              onClick={() => open(r.id)}
              style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
            >
              {r.number}
            </button>
          ),
        }
      : c,
  );

/** The "list page": mounts with no data and gets it after `loadDelayMs`, like a route that fetches on entry. */
function ScrollRestorationList({
  loadDelayMs,
  history,
  onOpen,
}: {
  loadDelayMs: number;
  history: 'replace' | 'push';
  onOpen: (invoiceId: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), loadDelayMs);
    return () => clearTimeout(timer);
  }, [loadDelayMs]);
  const url = useListReportUrlState({ filters: URL_FILTERS, sortableColumnIds: URL_SORTABLE, history });
  const scroll = useListReportScrollRestoration({ ready: loaded });
  const columns = useMemo(() => scrollColumns(onOpen), [onOpen]);
  const table = useListReport<DemoInvoice>({
    rows: loaded ? URL_ROWS : [],
    columns,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    ...url,
  });
  return (
    <ListReport
      title="Invoices"
      table={table}
      status={loaded ? 'ready' : 'loading'}
      labels={URL_LABELS}
      filtersLabel="Filters"
      searchLabel="Search"
      scrollerRef={scroll.ref}
    />
  );
}

const readView = (): string | null =>
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('view');

function ScrollRestorationDemo({ loadDelayMs, history, onOpenDetail, onCancel }: ScrollRestorationArgs) {
  const [detail, setDetail] = useState(() => readView() === 'detail');
  useEffect(() => {
    const onPop = () => setDetail(readView() === 'detail');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const open = useMemo(
    () => (invoiceId: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set('view', 'detail');
      const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.pushState(window.history.state, '', url);
      setDetail(true);
      onOpenDetail(invoiceId);
    },
    [onOpenDetail],
  );
  return (
    <div style={PAGE}>
      {detail ? (
        <div>
          <p style={{ marginTop: 0 }}>Invoice detail (a page of its own: the list is unmounted).</p>
          <Button
            variant="secondary"
            onClick={() => {
              onCancel();
              window.history.back();
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div style={{ width: 1100, maxWidth: '100%', height: 'min(400px, calc(100dvh - 104px))' }}>
          <ScrollRestorationList loadDelayMs={loadDelayMs} history={history} onOpen={open} />
        </div>
      )}
    </div>
  );
}

/**
 * `useListReportScrollRestoration` with `useListReportUrlState`: the list and an invoice "detail" are two
 * pages of a mini-router (the detail is pushed to the history, so Cancel and the browser's Back both
 * return). Going to the detail unmounts the list; coming back mounts it with no data and, `loadDelayMs`
 * later, with the data: only then is the table's container scrolled where it was, with the same pill
 * selected. Another pill (another URL) starts at the top. The position lives in `sessionStorage`, never in the URL.
 * Controls: the load delay (a range) and how the pills write the URL (`history`).
 * The play function picks "Open", scrolls the table, opens an invoice, presses Cancel, waits for the data
 * and checks the scroll position and the pill.
 */
export const ScrollRestoration: StoryObj<ScrollRestorationArgs> = {
  argTypes: {
    loadDelayMs: {
      control: { type: 'range', min: 0, max: 2000, step: 100 },
      description: 'Time the list takes to get its data after (re)mounting, in ms',
    },
    history: {
      control: 'radio',
      options: ['replace', 'push'],
      description: '`history` of `useListReportUrlState`: how a pill writes the URL',
    },
    onOpenDetail: { control: false },
    onCancel: { control: false },
    ...{ status: HIDDEN, dataset: HIDDEN, searchCommitDelay: HIDDEN, firstSortDirection: HIDDEN, containerWidth: HIDDEN, onRetry: HIDDEN },
  },
  args: { loadDelayMs: 400, history: 'replace', onOpenDetail: fn(), onCancel: fn() },
  render: (args) => <ScrollRestorationDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) throw new Error('ScrollRestoration: no window');
    // Start clean: no report parameters, the list page, nothing stored by an earlier run.
    for (const key of Object.keys(win.sessionStorage)) {
      if (key.startsWith('rop:list-report-scroll:')) win.sessionStorage.removeItem(key);
    }
    win.history.replaceState(win.history.state, '', win.location.pathname);
    win.dispatchEvent(new PopStateEvent('popstate', { state: win.history.state }));

    const scroller = () => canvas.getByRole('table', { name: 'Invoices' }).parentElement as HTMLElement;
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10));
    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await waitFor(() => expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked());

    scroller().scrollTop = 600;
    await waitFor(() => expect(scroller().scrollTop).toBe(600));
    // The position is stored (throttled); then the user opens an invoice and the list unmounts.
    const storedKey = `rop:list-report-scroll:#${win.location.pathname}?filter=open`;
    await waitFor(() => expect(win.sessionStorage.getItem(storedKey)).not.toBeNull(), { timeout: 3000 });
    const windowScroll = win.scrollY;
    await userEvent.click(canvas.getAllByRole('button', { name: /^FT-2026-/ })[0]!);
    await expect(args.onOpenDetail).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole('table')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
    // First the loading state (the skeleton is not scrolled), then the data and the saved position, with the same pill.
    await waitFor(() => expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked());
    await waitFor(() => expect(scroller()).toHaveAttribute('aria-busy', 'true'));
    await expect(scroller().scrollTop).toBe(0);
    await waitFor(() => expect(Math.abs(scroller().scrollTop - 600)).toBeLessThanOrEqual(1), { timeout: 5000 });
    await expect(canvas.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect(win.scrollY).toBe(windowScroll);
  },
};

/** Fixture of the e2e suite: `ScrollRestoration` without the play function. */
export const ScrollRestorationNoPlay: StoryObj<ScrollRestorationArgs> = {
  ...ScrollRestoration,
  tags: ['internal'],
  play: undefined,
};

// --- Selection -----------------------------------------------------------------------------------

const SELECTION_ROWS = makeDemoInvoices(200);
// The scenario of the play function and of the "some" preset: the first open invoice and the first two
// that are not open, in the input order. On the "Open" pill two of the three are hidden.
const FIRST_OPEN = SELECTION_ROWS.find((r) => r.status === 'pending')!;
const FIRST_TWO_OTHERS = SELECTION_ROWS.filter((r) => r.status !== 'pending').slice(0, 2);
const SCENARIO = [FIRST_OPEN, ...FIRST_TWO_OTHERS];
const OPEN_COUNT = SELECTION_ROWS.filter((r) => r.status === 'pending').length;

type Preselected = 'none' | 'some' | 'all';
const PRESELECTED: Record<Preselected, ReadonlySet<string>> = {
  none: new Set(),
  some: new Set(SCENARIO.map((r) => r.id)),
  all: new Set(SELECTION_ROWS.map((r) => r.id)),
};

interface SelectionArgs {
  selectable: boolean;
  controlled: boolean;
  preselected: Preselected;
  onSelectedIdsChange: (ids: ReadonlySet<string>) => void;
  onApprove: (numbers: string[]) => void;
  onExport: (numbers: string[]) => void;
  /** Fixture: not in Controls. */
  defaultFilter?: string;
}

function SelectionReport({
  selectable,
  controlled,
  preselected,
  onSelectedIdsChange,
  onApprove,
  onExport,
  defaultFilter,
}: SelectionArgs) {
  // Controlled: the parent owns the set and applies what the hook reports (a new Set every time).
  const [parentIds, setParentIds] = useState<ReadonlySet<string>>(PRESELECTED[preselected]);
  const table = useListReport<DemoInvoice>({
    rows: SELECTION_ROWS,
    columns: URL_COLUMNS,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    defaultFilter,
    selectable,
    defaultSelectedIds: controlled ? undefined : PRESELECTED[preselected],
    selectedIds: controlled ? parentIds : undefined,
    onSelectedIdsChange: (ids) => {
      if (controlled) setParentIds(ids);
      onSelectedIdsChange(ids);
    },
  });
  const numbers = () => table.selection.getSelectedRows().map((r) => r.number);
  return (
    <div style={PAGE}>
      {controlled ? (
        <p style={{ margin: 0, fontSize: 14 }}>
          Parent state: <output data-testid="parent-state">{parentIds.size} ids</output>
        </p>
      ) : null}
      <div style={{ width: 1100, maxWidth: '100%', height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Invoices"
          table={table}
          filtersLabel="Filters"
          searchLabel="Search"
          bulkActions={(selection) => (
            <>
              <Button size="sm" variant="primary" disabled={selection.selectedResultCount === 0} onClick={() => onApprove(numbers())}>
                Approve
              </Button>
              <Button size="sm" disabled={selection.selectedResultCount === 0} onClick={() => onExport(numbers())}>
                Export
              </Button>
            </>
          )}
        />
      </div>
    </div>
  );
}

const SELECTION_ARG_TYPES = {
  selectable: { control: 'boolean', description: '`selectable` of `useListReport`: without it there is no checkbox column and no selection bar' },
  controlled: { control: 'boolean', description: 'Controlled `selectedIds` (the parent state is shown above the report) or uncontrolled `defaultSelectedIds`' },
  preselected: {
    control: 'select',
    options: ['none', 'some', 'all'],
    description: 'Initial selection: none, three invoices (one open, two not) or all 200',
  },
  onSelectedIdsChange: { control: false },
  onApprove: { control: false },
  onExport: { control: false },
  defaultFilter: HIDDEN,
  ...{ status: HIDDEN, dataset: HIDDEN, searchCommitDelay: HIDDEN, firstSortDirection: HIDDEN, containerWidth: HIDDEN, onRetry: HIDDEN },
  ...{ onSortChange: HIDDEN, onFilterChange: HIDDEN, onSearchQueryChange: HIDDEN },
} as const;

const SELECTION_ARGS: SelectionArgs = {
  selectable: true,
  controlled: false,
  preselected: 'none',
  onSelectedIdsChange: fn(),
  onApprove: fn(),
  onExport: fn(),
};

const selectionBar = (canvas: ReturnType<typeof within>) => canvas.getByRole('group', { name: 'Selection Invoices' });
const rowBox = (canvas: ReturnType<typeof within>, number: string) => canvas.getByRole('checkbox', { name: `Select ${number}` });
const allBox = (canvas: ReturnType<typeof within>) => canvas.getByRole('checkbox', { name: 'Select all results' }) as HTMLInputElement;

/**
 * Multiple selection on the data (`useListReport({ selectable: true })`): a checkbox column with a tri-state
 * "Select all results" header, and a selection bar between the filters and the table that is always there
 * (the table never moves), with the count, "Clear selection" and the bulk actions ("Approve", "Export",
 * disabled at 0; they receive only the selected rows the user can see). Ids hidden by a pill stay selected:
 * the bar says how many. Controls: `selectable`, `controlled` (the parent's set is shown above) and the
 * initial selection; `onSelectedIdsChange` and the bulk actions show up in Actions.
 * The play function selects three invoices, picks "Open" (one left visible, two hidden; the header is
 * indeterminate), approves (Actions gets only the visible invoice), goes back to "All" (the three are
 * still selected), selects all, then clears the selection and checks that the focus is on the header checkbox.
 */
export const Selection: StoryObj<SelectionArgs> = {
  argTypes: SELECTION_ARG_TYPES,
  args: SELECTION_ARGS,
  render: (args) => <SelectionReport key={`${String(args.controlled)}-${args.preselected}`} {...args} />,
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration (selectable, nothing preselected).
    if (!args.selectable || args.preselected !== 'none') return;
    const canvas = within(canvasElement);
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    for (const row of SCENARIO) await userEvent.click(rowBox(canvas, row.number));
    await expect(selectionBar(canvas)).toHaveTextContent('3 selected');
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(3);
    await expect(allBox(canvas).indeterminate).toBe(true);

    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await expect(selectionBar(canvas)).toHaveTextContent('1 selected (2 hidden by filters)');
    await expect(allBox(canvas).indeterminate).toBe(OPEN_COUNT > 1);
    await userEvent.click(canvas.getByRole('button', { name: 'Approve' }));
    await expect(args.onApprove).toHaveBeenLastCalledWith([FIRST_OPEN.number]);

    await userEvent.click(canvas.getByRole('radio', { name: 'All' }));
    for (const row of SCENARIO) await expect(rowBox(canvas, row.number)).toBeChecked();
    await userEvent.click(allBox(canvas));
    await expect(allBox(canvas)).toBeChecked();
    await expect(selectionBar(canvas)).toHaveTextContent('200 selected');

    await userEvent.click(canvas.getByRole('button', { name: 'Clear selection' }));
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    await expect(allBox(canvas)).not.toBeChecked();
    await expect(allBox(canvas)).toHaveFocus();
    await expect(canvas.getByRole('button', { name: 'Approve' })).toBeDisabled();
  },
};

/** Fixture of the e2e suite: `Selection` without the play function. */
export const SelectionNoPlay: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['internal'],
  play: undefined,
};

/** Selectable, nothing selected: the bar says so and the bulk actions are disabled. */
export const SelectionNone: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['visual'],
  parameters: NO_CONTROLS,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    await expect(allBox(canvas)).not.toBeChecked();
  },
};

/** Three invoices selected: the header checkbox is indeterminate, the rows are tinted. */
export const SelectionSome: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { ...SELECTION_ARGS, preselected: 'some' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(selectionBar(canvas)).toHaveTextContent('3 selected');
    await expect(allBox(canvas).indeterminate).toBe(true);
  },
};

/** Every invoice selected. */
export const SelectionAll: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { ...SELECTION_ARGS, preselected: 'all' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(selectionBar(canvas)).toHaveTextContent('200 selected');
    await expect(allBox(canvas)).toBeChecked();
  },
};

/** `color-mix(in srgb, <base> <percent>%, white)` in 8-bit channels (what the primary tints are). */
function tint(base: [number, number, number], percent: number): number[] {
  return base.map((c) => Math.round((c * percent) / 100 + (255 * (100 - percent)) / 100));
}

/** A computed colour as 8-bit channels, whatever serialization the browser uses (rgb() or color(srgb ...)). */
function channels(el: Element): number[] {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = getComputedStyle(el).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
}

const near = (actual: number[], expected: number[]) => actual.every((c, i) => Math.abs(c - expected[i]!) <= 1);
const SCOPED_VIOLET: [number, number, number] = [107, 63, 160]; // #6b3fa0
const DEFAULT_BLUE: [number, number, number] = [10, 110, 209]; // #0a6ed1

/**
 * Only `--color-rop-primary` is redeclared on a wrapper (Violet, `#6b3fa0`) and the selection follows it:
 * the selected rows are tinted with 8% of the violet (16% when hovered or pressed) and the count pill flashes
 * with it, not with the default blue. The tint tokens are computed where they are used, so they stay unset on
 * the wrapper. Same three preselected invoices as "Selection some".
 * The play function checks that the tinted rows are violet (and not the default blue family), that an
 * unselected row is not tinted, that a row follows its checkbox off and on, and that the count pill
 * flashes when a filter changes the number. A script cannot trigger the CSS `:hover`/`:active` nor read the
 * flash mid-transition: the hover, pressed and flash colours are proved with a real mouse in
 * `e2e/list-report-scoped-primary.spec.ts`.
 */
export const SelectionScopedPrimary: StoryObj<SelectionArgs> = {
  ...Selection,
  parameters: NO_CONTROLS,
  args: { ...SELECTION_ARGS, preselected: 'some' },
  decorators: [
    (Story) => (
      <div data-testid="violet-scope" style={{ '--color-rop-primary': '#6b3fa0' } as CSSProperties}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scope = getComputedStyle(canvas.getByTestId('violet-scope'));
    await expect(scope.getPropertyValue('--color-rop-primary')).toBe('#6b3fa0');
    for (const token of ['primary-subtle', 'primary-subtle-hover', 'primary-muted']) {
      await expect(scope.getPropertyValue(`--color-rop-${token}`)).toBe('');
    }

    const row = (number: string) => rowBox(canvas, number).closest('tr')!;
    const selected = row(FIRST_OPEN.number);
    await expect(selected).toHaveAttribute('data-selected');
    await expect(near(channels(selected), tint(SCOPED_VIOLET, 8))).toBe(true);
    await expect(near(channels(selected), tint(DEFAULT_BLUE, 8))).toBe(false);

    const other = SELECTION_ROWS.find((r) => !SCENARIO.includes(r))!;
    await expect(row(other.number)).not.toHaveAttribute('data-selected');
    await expect(near(channels(row(other.number)), tint(SCOPED_VIOLET, 8))).toBe(false);

    await userEvent.click(rowBox(canvas, FIRST_OPEN.number));
    await expect(selected).not.toHaveAttribute('data-selected');
    await expect(near(channels(selected), tint(SCOPED_VIOLET, 8))).toBe(false);
    await userEvent.click(rowBox(canvas, FIRST_OPEN.number));
    await expect(near(channels(selected), tint(SCOPED_VIOLET, 8))).toBe(true);

    const pill = canvasElement.querySelector('[data-rop-count]');
    if (!(pill instanceof HTMLElement)) throw new Error('count pill not found');
    await userEvent.click(canvas.getByRole('radio', { name: 'Open' }));
    await expect(pill).toHaveAttribute('data-changed');
    await waitFor(() => expect(pill).not.toHaveAttribute('data-changed'));
  },
};

/** Fixture of the e2e suite: `SelectionScopedPrimary` without the play function. */
export const SelectionScopedPrimaryNoPlay: StoryObj<SelectionArgs> = {
  ...SelectionScopedPrimary,
  tags: ['internal'],
  play: undefined,
};

/** The same three invoices on the "Open" pill: one visible, two hidden by the filter. */
export const SelectionHiddenByFilter: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { ...SELECTION_ARGS, preselected: 'some', defaultFilter: 'open' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(selectionBar(canvas)).toHaveTextContent('1 selected (2 hidden by filters)');
  },
};

// --- Selection recipe: delete the selected rows ---

interface DeleteRecipeArgs {
  onDelete: (numbers: string[]) => void;
  onSelectedIdsChange: (ids: ReadonlySet<string>) => void;
}

function DeleteRecipe({ onDelete, onSelectedIdsChange }: DeleteRecipeArgs) {
  const [rows, setRows] = useState<readonly DemoInvoice[]>(() => makeDemoInvoices(20));
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const table = useListReport<DemoInvoice>({
    rows,
    columns: URL_COLUMNS,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    selectable: true,
    selectedIds,
    onSelectedIdsChange: (ids) => {
      setSelectedIds(ids);
      onSelectedIdsChange(ids);
    },
  });
  // Delete only what the user sees selected; then drop those ids from the selection: the hook never
  // prunes ids that left the data (that would be a change nobody asked for), the consumer does.
  const remove = () => {
    const gone = table.selection.getSelectedRows();
    const goneIds = new Set(gone.map((r) => r.id));
    setRows((current) => current.filter((r) => !goneIds.has(r.id)));
    setSelectedIds((current) => new Set([...current].filter((id) => !goneIds.has(id))));
    onDelete(gone.map((r) => r.number));
  };
  return (
    <div style={PAGE}>
      <div style={{ width: 1100, maxWidth: '100%', height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Invoices"
          table={table}
          filtersLabel="Filters"
          searchLabel="Search"
          bulkActions={(selection) => (
            <Button size="sm" variant="danger" disabled={selection.selectedResultCount === 0} onClick={remove}>
              Delete
            </Button>
          )}
        />
      </div>
    </div>
  );
}

/**
 * Recipe: a "Delete" bulk action. It deletes `selection.getSelectedRows()` (only the selected rows that are
 * visible) and removes those ids from its own controlled `selectedIds`: the hook keeps ids that left the
 * data, so the consumer that deletes rows updates the selection itself. Ids hidden by a pill stay selected.
 * The play function selects two invoices, deletes them and checks that 18 are left and nothing is selected.
 */
export const SelectionDeleteRecipe: StoryObj<DeleteRecipeArgs> = {
  argTypes: {
    onDelete: { control: false },
    onSelectedIdsChange: { control: false },
    ...{ status: HIDDEN, dataset: HIDDEN, searchCommitDelay: HIDDEN, firstSortDirection: HIDDEN, containerWidth: HIDDEN, onRetry: HIDDEN },
    ...{ onSortChange: HIDDEN, onFilterChange: HIDDEN, onSearchQueryChange: HIDDEN },
  },
  args: { onDelete: fn(), onSelectedIdsChange: fn() },
  render: (args) => <DeleteRecipe {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const [first, second] = makeDemoInvoices(20);
    await userEvent.click(rowBox(canvas, first!.number));
    await userEvent.click(rowBox(canvas, second!.number));
    await expect(selectionBar(canvas)).toHaveTextContent('2 selected');
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));
    await expect(args.onDelete).toHaveBeenCalledWith([first!.number, second!.number]);
    await expect(canvas.getByRole('heading', { name: /Invoices/ })).toHaveTextContent('Invoices (18)');
    await expect(canvas.queryByRole('checkbox', { name: `Select ${first!.number}` })).toBeNull();
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    await expect(canvas.getByRole('button', { name: 'Delete' })).toBeDisabled();
  },
};
