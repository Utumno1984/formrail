import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { exampleStory } from '../internal/example-story';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { useConfirmDialog } from '../confirm-dialog/use-confirm-dialog';
import { Checkbox } from '../checkbox/Checkbox';
import { StatusBadge } from '../status-badge/StatusBadge';
import {
  DEPARTMENT_LABEL,
  ENROLMENT_STATUS_LABEL,
  ENROLMENT_STATUS_TONE,
  PRODUCT_CATEGORY_LABEL,
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  SUPPORT_CASE_PRIORITY_LABEL,
  SUPPORT_CASE_PRIORITY_TONE,
  formatMoney,
  getSupplier,
  makeEmployees,
  makeEnrolments,
  makeProducts,
  makePurchaseOrders,
  makeRecords,
  makeSupportCases,
  type DemoEmployee,
  type DemoEnrolment,
  type DemoProduct,
  type DemoPurchaseOrder,
  type DemoRecord,
  type DemoSupportCase,
  type DemoSupportCasePriority,
} from '../internal/demo-data';
import { useCaseStory as describeUseCase } from '../internal/story-example';
import { ColumnsReport } from './ListReport.column-examples';
import { ListReport } from './ListReport';
import { FILTERS, SEARCH_WORD, recordColumns } from './ListReport.stories-data';
import type {
  ListReportColumn,
  ListReportRowAction,
  ListReportSort,
  ListReportSortDirection,
} from './types';
import { useListReport } from './use-list-report';
import { createMemoryUrlAdapter } from '../internal/memory-url-adapter';
import { storyControl, withoutControls } from '../internal/story-docs';
import { useListReportScrollRestoration } from './use-list-report-scroll-restoration';
import { useListReportUrlState } from './use-list-report-url-state';

/** How long "Simulate loading" keeps the report in `loading`. */
const LOADING_MS = 800;

const URL_FILTERS = FILTERS;

type DelayChoice = 0 | 300 | 800 | 'Enter only';
type Dataset = 0 | 3 | 200 | 1200;
type LocaleChoice = 'en-US' | 'de-DE' | 'fr-FR';

interface ShowcaseArgs {
  status: 'ready' | 'loading' | 'error';
  dataset: Dataset;
  locale: LocaleChoice;
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
  selectable?: boolean;
  /** Fixture: a long custom `labels.count` (it must wrap, not overflow the page at 320px). */
  longCountLabel?: boolean;
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
  locale,
  selectable,
  searchCommitDelay,
  firstSortDirection,
  containerWidth,
  onSortChange,
  onFilterChange,
  onSearchQueryChange,
  onRetry,
  defaultFilter,
  defaultSearchQuery,
  longCountLabel,
  flow,
}: ShowcaseArgs) {
  const all = useMemo(() => makeRecords(dataset), [dataset]);
  const [simulating, setSimulating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cols = useMemo(() => recordColumns({ dueFirstDirection: firstSortDirection, amountFirstDirection: 'desc' }), [firstSortDirection]);

  const table = useListReport<DemoRecord>({
    // While "loading" there are no rows yet: the skeleton shows, and filter and search survive.
    rows: simulating ? [] : all,
    columns: cols,
    getRowId: (r) => r.id,
    filters: FILTERS,
    defaultFilter,
    defaultSearchQuery,
    locale,
    selectable,
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
          title="Records"
          table={table}
          actions={<Button>New record</Button>}
          status={simulating ? 'loading' : status}
          onRetry={onRetry}
          labels={longCountLabel ? { count: (shown, total) => `Showing ${shown} of ${total} records matching the filters` } : undefined}
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
    status: { control: 'radio', options: ['ready', 'loading', 'error'] },
    onRetry: { control: false },
    // Set by the demo (`table` from useListReport, the title and actions, default texts and layout).
    ...withoutControls(
      'title',
      'table',
      'labels',
      'titleLevel',
      'actions',
      'errorMessage',
      'onClearFilters',
      'loadingRowCount',
      'filtersLabel',
      'searchLabel',
      'showSearch',
      'scrollerRef',
      'bulkActions',
      'rowActions',
      'rowActionsInline',
      'ref',
    ),
    dataset: storyControl({ control: 'select', options: [0, 3, 200, 1200], description: 'Rows given to `useListReport({ rows })`: none, 3, 200 or 1,200 records.' }),
    locale: storyControl({
      control: 'select',
      options: ['en-US', 'de-DE', 'fr-FR'],
      description: 'An option of the hook, not a prop: `useListReport({ locale })`. Formats the numbers of the default count and selection text with `Intl.NumberFormat`.',
    }),
    searchCommitDelay: storyControl({
      control: 'select',
      options: [0, 300, 800, 'Enter only'],
      description: 'An option of the hook, not a prop: `useListReport({ searchCommitDelay })` (ms); "Enter only" = `null`, commits only on Enter.',
    }),
    firstSortDirection: storyControl({
      control: 'radio',
      options: ['asc', 'desc'],
      description: 'The `firstSortDirection` of the "Due date" column (a column option of `useListReport({ columns })`): direction of the first click.',
    }),
    containerWidth: storyControl({ control: { type: 'range', min: 320, max: 1280, step: 10 }, description: 'Width of the demo container (px).' }),
    onSortChange: storyControl({ control: false, description: 'An option of the hook: `useListReport({ onSortChange })`.' }),
    onFilterChange: storyControl({ control: false, description: 'An option of the hook: `useListReport({ onFilterChange })`.' }),
    onSearchQueryChange: storyControl({ control: false, description: 'An option of the hook: `useListReport({ onSearchQueryChange })`.' }),
    defaultFilter: { control: false, table: { disable: true } },
    defaultSearchQuery: { control: false, table: { disable: true } },
    flow: { control: false, table: { disable: true } },
    longCountLabel: { control: false, table: { disable: true } },
    selectable: { control: false, table: { disable: true } },
  },
  args: {
    status: 'ready',
    dataset: 200,
    locale: 'en-US',
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

const heading = (canvas: ReturnType<typeof within>) => canvas.getByRole('heading', { name: /Records/ });
const bodyRows = (canvas: ReturnType<typeof within>) => canvas.getAllByRole('row').slice(1);

/**
 * Copy-paste example: the whole floorplan (title, actions, filter pills, search and table) from one `useListReport` call, in a parent with a bounded height.
 */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('ListReport.example.tsx', {}, { layout: 'padded' }),
};

/**
 * Demo code: "Show code" prints this story's demo wrapper with the live Controls, not code to paste (see
 * the example at the top of the page).
 *
 * A record list example: title with count, actions, filters and search, and a table that
 * fills the space with a single scroller. Controls: `status`, `dataset`, `searchCommitDelay`,
 * `firstSortDirection` of the "Due date" column and container width; the callbacks show up in Actions.
 * The play function picks "Pending", searches for a name, sorts by amount descending (the raw amount, in the currency of each record), checks
 * the first rows and the "n of 200" count, then searches for a non-existent text, clicks "Clear filters"
 * and checks that 200 rows are back and that the focus is on the search field.
 */
export const Playground: Story = {
  tags: ['playground'],
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: with another dataset or status (picked in Controls)
    // the scenario has nothing to check.
    if (args.dataset !== 200 || args.status !== 'ready') return;
    const canvas = within(canvasElement);
    const all = makeRecords(200);
    const pending = all.filter((r) => r.status === 'pending');

    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('pending');
    await expect(heading(canvas)).toHaveTextContent(`Records (${pending.length} of 200)`);

    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(search, `${SEARCH_WORD}{Enter}`);
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith(SEARCH_WORD);
    const found = pending.filter((r) => r.name.includes(SEARCH_WORD));
    await expect(found.length).toBeGreaterThan(2);
    await expect(heading(canvas)).toHaveTextContent(`Records (${found.length} of 200)`);

    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
    const sorted = [...found].sort((a, b) => b.amountMinor - a.amountMinor);
    const rows = bodyRows(canvas);
    await expect(rows).toHaveLength(found.length);
    await expect(rows[0]).toHaveTextContent(sorted[0]!.code);
    await expect(rows[0]).toHaveTextContent(formatMoney(sorted[0]!.amountMinor, sorted[0]!.currency));
    await expect(rows[1]).toHaveTextContent(sorted[1]!.code);

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz{Enter}');
    await expect(canvas.getByText('No results for the current filters', { selector: 'p' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(bodyRows(canvas)).toHaveLength(200));
    await expect(heading(canvas)).toHaveTextContent('Records (200)');
    await expect(canvas.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(search).toHaveValue('');
    await expect(search).toHaveFocus();
  },
};

/**
 * Numbers in the locale of `useListReport({ locale })` (Control `locale`): 1,200 records. The play function
 * searches a name, checks the "n of 1,200" count in the chosen locale, selects all the rows from the header and
 * checks the selection text, also with most of the selection hidden by the search. Stories and baselines always use a fixed locale.
 */
export const LocaleCount: Story = {
  args: { dataset: 1200, selectable: true },
  argTypes: { dataset: { control: false } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const fmt = new Intl.NumberFormat(args.locale);
    const selectionText = () => canvasElement.querySelector('[data-rop-selection-count]')?.textContent;
    await expect(heading(canvas).textContent).toBe(`Records (${fmt.format(1200)})`);
    // Select every row from the header, then narrow the list: most of the selection ends up hidden by the filter.
    await userEvent.click(canvas.getAllByRole('checkbox')[0]!);
    await expect(selectionText()).toBe(`${fmt.format(1200)} selected`);
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search' }), `${SEARCH_WORD}{Enter}`);
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith(SEARCH_WORD);
    const found = makeRecords(1200).filter((r) => r.name.includes(SEARCH_WORD)).length;
    await expect(1200 - found).toBeGreaterThanOrEqual(1000);
    await waitFor(() => expect(heading(canvas).textContent).toBe(`Records (${fmt.format(found)} of ${fmt.format(1200)})`));
    await expect(selectionText()).toBe(`${fmt.format(found)} selected (${fmt.format(1200 - found)} hidden by filters)`);
  },
};

/** Fixture of the e2e suite: `LocaleCount` without the play function (`tags: ['internal']`: hidden from the public sidebar, #296; it still inherits `autodocs`). */
export const LocaleCountNoPlay: Story = { ...LocaleCount, tags: ['internal'], play: undefined };

/** Fixture of the e2e suite: `LocaleCountNoPlay` with a long custom `labels.count` (no `whitespace-nowrap`: it wraps). */
export const LocaleCountLongLabel: Story = { ...LocaleCountNoPlay, tags: ['internal'], args: { ...LocaleCountNoPlay.args, longCountLabel: true } };

/** Active filter ("Pending"): the count says "n of 200". */
export const WithActiveFilter: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { defaultFilter: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pending = makeRecords(200).filter((r) => r.status === 'pending').length;
    await expect(canvas.getByRole('radio', { name: 'Pending' })).toBeChecked();
    await expect(heading(canvas)).toHaveTextContent(`Records (${pending} of 200)`);
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
    await expect(canvas.getByRole('table', { name: 'Records' })).toBeVisible();
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
    await expect(heading(canvas)).toHaveTextContent('Records (0)');
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
    await expect(heading(canvas)).toHaveTextContent('Records (0 of 200)');
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
 * No Controls (the callbacks and Controls are in the Playground). The play function picks "Pending" and checks
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
    const pending = makeRecords(200).filter((r) => r.status === 'pending').length;

    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
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

const URL_COLUMNS = recordColumns();
const URL_SORTABLE = URL_COLUMNS.map((c) => c.id);
const URL_ROWS = makeRecords(200);

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
  const table = useListReport<DemoRecord>({
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
        <ListReport title="Records" table={table} labels={URL_LABELS} filtersLabel="Filters" searchLabel="Search" />
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
 * picks "Pending", searches "plan" with Enter, clicks "Amount" twice and checks the query string, the
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

    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('pending');
    await expect(own()).toBe(`${filterKey}=pending&${searchKey}=&${sortKey}=`);
    await expect(win.history.length).toBe(length + step);

    // No pause between keystrokes (`delay: null`): the five characters land within any commit delay, even
    // on a slow machine, so the search is committed once (by Enter) and not halfway through the word.
    await userEvent.type(search, 'plan{Enter}', { delay: null });
    await expect(args.onSearchQueryChange).toHaveBeenCalledOnce();
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('plan');
    await expect(own()).toBe(`${filterKey}=pending&${searchKey}=plan&${sortKey}=`);
    await expect(win.history.length).toBe(length + 2 * step);

    const amount = canvas.getByRole('button', { name: 'Amount' });
    await userEvent.click(amount);
    await userEvent.click(amount);
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
    await expect(win.location.search).toContain(`${filterKey}=pending&${searchKey}=plan&${sortKey}=amount.desc`);
    await expect(win.history.length).toBe(length + 4 * step);

    // The report shows what the URL says.
    await expect(canvas.getByRole('radio', { name: 'Pending' })).toBeChecked();
    await expect(canvas.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending');
    const expected = URL_ROWS.filter((r) => r.status === 'pending' && r.name.includes('Plan')).sort(
      (a, b) => b.amountMinor - a.amountMinor,
    );
    await expect(expected.length).toBeGreaterThan(2);
    const rows = canvas.getAllByRole('row').slice(1);
    await expect(rows).toHaveLength(expected.length);
    await expect(rows[0]).toHaveTextContent(expected[0]!.code);
    await expect(rows[1]).toHaveTextContent(expected[1]!.code);
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
  const table = useListReport<DemoRecord>({
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
        <ListReport title="Records" table={table} labels={URL_LABELS} filtersLabel="Filters" searchLabel="Search" />
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
 * import type { ListReportUrlAdapter } from '@formrail/core';
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
 * import type { ListReportUrlAdapter } from '@formrail/core';
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
 * The play function picks "Pending", sorts by "Amount", picks "Active", presses "Back" and checks that the
 * pill returns to "Pending" while `onFilterChange` was called only for the two clicks.
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

    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Amount' }));
    await expect(query()).toHaveTextContent('filter=pending&sort=amount.asc');
    await userEvent.click(canvas.getByRole('radio', { name: 'Active' }));
    await expect(query()).toHaveTextContent('filter=active&sort=amount.asc');
    await expect(args.onFilterChange).toHaveBeenCalledTimes(2);
    await expect(args.onWrite).toHaveBeenCalledTimes(3);
    await expect(args.onWrite).toHaveBeenLastCalledWith('filter=active&sort=amount.asc', args.history);

    if (args.history === 'push') {
      await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
      await expect(canvas.getByRole('radio', { name: 'Pending' })).toBeChecked();
      await expect(query()).toHaveTextContent('filter=pending&sort=amount.asc');
      // Navigation is not a gesture: no callback, no write.
      await expect(args.onFilterChange).toHaveBeenCalledTimes(2);
      await expect(args.onWrite).toHaveBeenCalledTimes(3);
      await userEvent.click(canvas.getByRole('button', { name: 'Forward' }));
      await expect(canvas.getByRole('radio', { name: 'Active' })).toBeChecked();
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
  onOpenDetail: (recordId: string) => void;
  onCancel: () => void;
}

const scrollColumns = (open: (id: string) => void): ListReportColumn<DemoRecord>[] =>
  URL_COLUMNS.map((c) =>
    c.id === 'code'
      ? {
          ...c,
          cell: (r: DemoRecord) => (
            <button
              type="button"
              onClick={() => open(r.id)}
              style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
            >
              {r.code}
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
  onOpen: (recordId: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), loadDelayMs);
    return () => clearTimeout(timer);
  }, [loadDelayMs]);
  const url = useListReportUrlState({ filters: URL_FILTERS, sortableColumnIds: URL_SORTABLE, history });
  const scroll = useListReportScrollRestoration({ ready: loaded });
  const columns = useMemo(() => scrollColumns(onOpen), [onOpen]);
  const table = useListReport<DemoRecord>({
    rows: loaded ? URL_ROWS : [],
    columns,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    ...url,
  });
  return (
    <ListReport
      title="Records"
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
    () => (recordId: string) => {
      const params = new URLSearchParams(window.location.search);
      params.set('view', 'detail');
      const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.pushState(window.history.state, '', url);
      setDetail(true);
      onOpenDetail(recordId);
    },
    [onOpenDetail],
  );
  return (
    <div style={PAGE}>
      {detail ? (
        <div>
          <p style={{ marginTop: 0 }}>Record detail (a page of its own: the list is unmounted).</p>
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
 * `useListReportScrollRestoration` with `useListReportUrlState`: the list and a record "detail" are two
 * pages of a mini-router (the detail is pushed to the history, so Cancel and the browser's Back both
 * return). Going to the detail unmounts the list; coming back mounts it with no data and, `loadDelayMs`
 * later, with the data: only then is the table's container scrolled where it was, with the same pill
 * selected. Another pill (another URL) starts at the top. The position lives in `sessionStorage`, never in the URL.
 * Controls: the load delay (a range) and how the pills write the URL (`history`).
 * The play function picks "Pending", scrolls the table, opens a record, presses Cancel, waits for the data
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

    const scroller = () => canvas.getByRole('table', { name: 'Records' }).parentElement as HTMLElement;
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBeGreaterThan(10));
    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
    await waitFor(() => expect(canvas.getByRole('radio', { name: 'Pending' })).toBeChecked());

    scroller().scrollTop = 600;
    await waitFor(() => expect(scroller().scrollTop).toBe(600));
    // The position is stored (throttled); then the user opens a record and the list unmounts.
    const storedKey = `rop:list-report-scroll:#${win.location.pathname}?filter=pending`;
    await waitFor(() => expect(win.sessionStorage.getItem(storedKey)).not.toBeNull(), { timeout: 3000 });
    const windowScroll = win.scrollY;
    await userEvent.click(canvas.getAllByRole('button', { name: /^REC-/ })[0]!);
    await expect(args.onOpenDetail).toHaveBeenCalledOnce();
    await expect(canvas.queryByRole('table')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
    // First the loading state (the skeleton is not scrolled), then the data and the saved position, with the same pill.
    await waitFor(() => expect(canvas.getByRole('radio', { name: 'Pending' })).toBeChecked());
    await waitFor(() => expect(scroller()).toHaveAttribute('aria-busy', 'true'));
    await expect(scroller().scrollTop).toBe(0);
    await waitFor(() => expect(Math.abs(scroller().scrollTop - 600)).toBeLessThanOrEqual(1), { timeout: 5000 });
    await expect(canvas.getByRole('radio', { name: 'Pending' })).toBeChecked();
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

const SELECTION_ROWS = makeRecords(200);
// The scenario of the play function and of the "some" preset: the first pending record and the first two
// that are not pending, in the input order. On the "Pending" pill two of the three are hidden.
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
  /** Whether the selection bar gets bulk actions. Default true. */
  withBulkActions?: boolean;
  /** Replaces `labels.clearSelection` with a long text (a localized label can be much longer than the default). */
  longClearLabel?: boolean;
  /** Width of the demo container (px). Default 1100. */
  containerWidth?: number;
}

function SelectionReport({
  selectable,
  controlled,
  preselected,
  onSelectedIdsChange,
  onApprove,
  onExport,
  defaultFilter,
  withBulkActions = true,
  longClearLabel = false,
  containerWidth = 1100,
}: SelectionArgs) {
  // Controlled: the parent owns the set and applies what the hook reports (a new Set every time).
  const [parentIds, setParentIds] = useState<ReadonlySet<string>>(PRESELECTED[preselected]);
  const table = useListReport<DemoRecord>({
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
  const numbers = () => table.selection.getSelectedRows().map((r) => r.code);
  return (
    <div style={PAGE}>
      {controlled ? (
        <p style={{ margin: 0, fontSize: 14 }}>
          Parent state: <output data-testid="parent-state">{parentIds.size} ids</output>
        </p>
      ) : null}
      <div style={{ width: containerWidth, maxWidth: '100%', height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Records"
          table={table}
          filtersLabel="Filters"
          searchLabel="Search"
          labels={longClearLabel ? { clearSelection: 'Remove every record from the selection' } : undefined}
          bulkActions={
            withBulkActions
              ? (selection) => (
            <>
              <Button size="sm" variant="primary" disabled={selection.selectedResultCount === 0} onClick={() => onApprove(numbers())}>
                Approve
              </Button>
              <Button size="sm" disabled={selection.selectedResultCount === 0} onClick={() => onExport(numbers())}>
                Export
              </Button>
            </>
              )
              : undefined
          }
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
    description: 'Initial selection: none, three records (one pending, two not) or all 200',
  },
  onSelectedIdsChange: { control: false },
  onApprove: { control: false },
  onExport: { control: false },
  defaultFilter: HIDDEN,
  longClearLabel: HIDDEN,
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

const selectionBar = (canvas: ReturnType<typeof within>) => canvas.getByRole('group', { name: 'Selection Records' });
const rowBox = (canvas: ReturnType<typeof within>, number: string) => canvas.getByRole('checkbox', { name: `Select ${number}` });
const allBox = (canvas: ReturnType<typeof within>) => canvas.getByRole('checkbox', { name: 'Select all results' }) as HTMLInputElement;

/**
 * Multiple selection on the data (`useListReport({ selectable: true })`): a checkbox column with a tri-state
 * "Select all results" header, and a selection bar between the filters and the table that is always there
 * (the table never moves), with the count, "Clear selection" and the bulk actions ("Approve", "Export",
 * disabled at 0; they receive only the selected rows the user can see). Ids hidden by a pill stay selected:
 * the bar says how many. Controls: `selectable`, `controlled` (the parent's set is shown above) and the
 * initial selection; `onSelectedIdsChange` and the bulk actions show up in Actions.
 * The play function selects three records, picks "Pending" (one left visible, two hidden; the header is
 * indeterminate), approves (Actions gets only the visible record), goes back to "All" (the three are
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
    for (const row of SCENARIO) await userEvent.click(rowBox(canvas, row.code));
    await expect(selectionBar(canvas)).toHaveTextContent('3 selected');
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(3);
    await expect(allBox(canvas).indeterminate).toBe(true);

    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
    await expect(selectionBar(canvas)).toHaveTextContent('1 selected (2 hidden by filters)');
    await expect(allBox(canvas).indeterminate).toBe(OPEN_COUNT > 1);
    await userEvent.click(canvas.getByRole('button', { name: 'Approve' }));
    await expect(args.onApprove).toHaveBeenLastCalledWith([FIRST_OPEN.code]);

    await userEvent.click(canvas.getByRole('radio', { name: 'All' }));
    for (const row of SCENARIO) await expect(rowBox(canvas, row.code)).toBeChecked();
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

/**
 * `Selection` without bulk actions: below 640px the count and "Clear selection" share one line and the
 * bar keeps the same box at 0 and at n selected. The `withBulkActions` Control adds the bulk actions back (two
 * lines below 640px, as before); `containerWidth` narrows the demo container. The play function selects
 * three records, checks the count and that "Clear selection" shows up, that the bar did not move, then
 * clears and checks that the focus is on the header checkbox.
 */
export const SelectionWithoutBulkActions: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['visual'],
  argTypes: {
    ...SELECTION_ARG_TYPES,
    withBulkActions: { control: 'boolean', description: 'Pass `bulkActions` to the frame (Approve, Export)' },
    longClearLabel: { control: 'boolean', description: 'A long `labels.clearSelection`: the bar wraps to two lines instead of squeezing the count' },
    containerWidth: { control: { type: 'range', min: 320, max: 1280, step: 10 }, description: 'Width of the demo container (px)' },
  },
  args: { ...SELECTION_ARGS, withBulkActions: false, longClearLabel: false, containerWidth: 1100 },
  play: async ({ args, canvasElement }) => {
    if (!args.selectable || args.preselected !== 'none') return;
    const canvas = within(canvasElement);
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    const before = selectionBar(canvas).getBoundingClientRect();
    for (const row of SCENARIO) await userEvent.click(rowBox(canvas, row.code));
    await expect(selectionBar(canvas)).toHaveTextContent('3 selected');
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(3);
    const clear = canvas.getByRole('button', { name: 'Clear selection' });
    await expect(clear).toBeVisible();
    const after = selectionBar(canvas).getBoundingClientRect();
    await expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.5);
    await expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(0.5);
    // Below 640px the count is never squeezed under its minimum (8ch), whatever the width or the text size;
    // from 640px there is no minimum.
    const countEl = canvasElement.querySelector<HTMLElement>('[data-rop-selection-count]')!;
    const minWidth = parseFloat(getComputedStyle(countEl).minWidth);
    if (window.innerWidth < 640) await expect(minWidth).toBeGreaterThan(0);
    else await expect(minWidth).toBe(0);
    await expect(countEl.getBoundingClientRect().width).toBeGreaterThanOrEqual(minWidth - 0.5);
    await userEvent.click(clear);
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    await expect(allBox(canvas)).toHaveFocus();
  },
};

/** Fixture of the e2e suite: `SelectionWithoutBulkActions` without the play function. */
export const SelectionWithoutBulkActionsNoPlay: StoryObj<SelectionArgs> = {
  ...SelectionWithoutBulkActions,
  tags: ['internal'],
  play: undefined,
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

/** Three records selected: the header checkbox is indeterminate, the rows are tinted. */
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

/** Every record selected. */
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
 * the wrapper. Same three preselected records as "Selection some".
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
    const selected = row(FIRST_OPEN.code);
    await expect(selected).toHaveAttribute('data-selected');
    await expect(near(channels(selected), tint(SCOPED_VIOLET, 8))).toBe(true);
    await expect(near(channels(selected), tint(DEFAULT_BLUE, 8))).toBe(false);

    const other = SELECTION_ROWS.find((r) => !SCENARIO.includes(r))!;
    await expect(row(other.code)).not.toHaveAttribute('data-selected');
    await expect(near(channels(row(other.code)), tint(SCOPED_VIOLET, 8))).toBe(false);

    await userEvent.click(rowBox(canvas, FIRST_OPEN.code));
    await expect(selected).not.toHaveAttribute('data-selected');
    await expect(near(channels(selected), tint(SCOPED_VIOLET, 8))).toBe(false);
    await userEvent.click(rowBox(canvas, FIRST_OPEN.code));
    await expect(near(channels(selected), tint(SCOPED_VIOLET, 8))).toBe(true);

    const pill = canvasElement.querySelector('[data-rop-count]');
    if (!(pill instanceof HTMLElement)) throw new Error('count pill not found');
    await userEvent.click(canvas.getByRole('radio', { name: 'Pending' }));
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

/** The same three records on the "Pending" pill: one visible, two hidden by the filter. */
export const SelectionHiddenByFilter: StoryObj<SelectionArgs> = {
  ...Selection,
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { ...SELECTION_ARGS, preselected: 'some', defaultFilter: 'pending' },
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
  const [rows, setRows] = useState<readonly DemoRecord[]>(() => makeRecords(20));
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const table = useListReport<DemoRecord>({
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
    onDelete(gone.map((r) => r.code));
  };
  return (
    <div style={PAGE}>
      <div style={{ width: 1100, maxWidth: '100%', height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Records"
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
 * The play function selects two records, deletes them and checks that 18 are left and nothing is selected.
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
    const [first, second] = makeRecords(20);
    await userEvent.click(rowBox(canvas, first!.code));
    await userEvent.click(rowBox(canvas, second!.code));
    await expect(selectionBar(canvas)).toHaveTextContent('2 selected');
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));
    await expect(args.onDelete).toHaveBeenCalledWith([first!.code, second!.code]);
    await expect(canvas.getByRole('heading', { name: /Records/ })).toHaveTextContent('Records (18)');
    await expect(canvas.queryByRole('checkbox', { name: `Select ${first!.code}` })).toBeNull();
    await expect(selectionBar(canvas)).toHaveTextContent('No items selected');
    await expect(canvas.getByRole('button', { name: 'Delete' })).toBeDisabled();
  },
};

// --- Row actions ---

const ROW_ACTION_ROWS = makeRecords(20);
const THIRD_ROW = ROW_ACTION_ROWS[2]!;
const FIRST_ARCHIVED = ROW_ACTION_ROWS.find((r) => r.status === 'archived')!;

type DisabledFor = DemoRecord['status'] | 'none';

// A trash can on the 24x24 grid of the library's icons (stroke, current colour).
const trashIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

// Width of the box around the report: `wide` is well above the 40rem of the inline actions (on a
// viewport narrower than that the box is capped to it), `narrow` is a 30rem panel, below them.
const ROW_ACTIONS_CONTAINER_WIDTH = { wide: 1100, narrow: 480 } as const;

interface RowActionsArgs {
  /** Status of the records whose "Delete" is disabled. */
  disabledFor: DisabledFor;
  /** Tone of the "Delete" action. */
  deleteTone: 'danger' | 'default';
  /** Whether "Delete" has an `icon` (only actions with one can be inline). */
  deleteIcon: boolean;
  /** Label of the "Duplicate" action. */
  duplicateLabel: string;
  selectable: boolean;
  /** `rowActionsInline` of the report. */
  rowActionsInline: number;
  containerWidth: keyof typeof ROW_ACTIONS_CONTAINER_WIDTH;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Fixture: ids selected at mount. Not in Controls. */
  preselectedIds?: readonly string[];
  /** `useListReport({ onSelectedIdsChange })`: wired by the stories that check a selection gesture. */
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  /** Fixture: the records of this status have no "Delete" at all (fewer actions than the others). Not in Controls. */
  withoutDeleteFor?: DisabledFor;
  /** Fixture: `status` of the report. Not in Controls. */
  status?: 'ready' | 'loading';
}

function RowActionsReport({
  disabledFor,
  deleteTone,
  deleteIcon,
  duplicateLabel,
  selectable,
  rowActionsInline,
  containerWidth,
  onDuplicate,
  onDelete,
  preselectedIds,
  withoutDeleteFor = 'none',
  status,
  onSelectedIdsChange,
}: RowActionsArgs) {
  const [rows, setRows] = useState<readonly DemoRecord[]>(ROW_ACTION_ROWS);
  const table = useListReport<DemoRecord>({
    rows,
    columns: URL_COLUMNS,
    getRowId: (r) => r.id,
    filters: URL_FILTERS,
    selectable,
    defaultSelectedIds: preselectedIds ? new Set(preselectedIds) : undefined,
    onSelectedIdsChange,
  });
  const [confirm, confirmDialog] = useConfirmDialog();
  // Memoized with what it reads: the rows are memoized, a stable function that read other values
  // would leave them as they were.
  const rowActions = useCallback(
    (row: DemoRecord): readonly ListReportRowAction[] => {
      const duplicate: ListReportRowAction = { id: 'duplicate', label: duplicateLabel, onSelect: () => onDuplicate(row.id) };
      if (row.status === withoutDeleteFor) return [duplicate];
      return [
        duplicate,
        {
          id: 'delete',
          label: 'Delete…',
          icon: deleteIcon ? trashIcon : undefined,
          tone: deleteTone,
          disabled: row.status === disabledFor,
          // The confirmation gives the focus back to the control that was used (this row's inline button
          // or "…" button) when it closes (Cancel), or to the table once the row is deleted (Delete record).
          onSelect: async ({ returnFocusRef }) => {
            const confirmed = await confirm({
              title: `Delete record ${row.code}?`,
              description: 'The record is removed from the list. This cannot be undone.',
              confirmLabel: 'Delete record',
              returnFocusRef,
            });
            if (!confirmed) return;
            setRows((current) => current.filter((r) => r.id !== row.id));
            onDelete(row.id);
          },
        },
      ];
    },
    [confirm, deleteIcon, deleteTone, disabledFor, duplicateLabel, onDelete, onDuplicate, withoutDeleteFor],
  );
  return (
    <div style={PAGE}>
      <div style={{ width: ROW_ACTIONS_CONTAINER_WIDTH[containerWidth], maxWidth: '100%', height: 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Records"
          table={table}
          filtersLabel="Filters"
          searchLabel="Search"
          rowActions={rowActions}
          rowActionsInline={rowActionsInline}
          status={status}
        />
      </div>
      {confirmDialog}
    </div>
  );
}

const ROW_ACTIONS_ARG_TYPES = {
  disabledFor: {
    control: 'select',
    options: ['archived', 'pending', 'active', 'on-hold', 'none'],
    description: 'Records whose "Delete" is `disabled` (by status): shown in the menu, skipped by the arrows, never selected',
  },
  deleteTone: { control: 'radio', options: ['danger', 'default'], description: '`tone` of the "Delete" action' },
  deleteIcon: {
    control: 'boolean',
    description: '`icon` of the "Delete" action: only actions with an icon can be inline (without one it stays in the "…" menu)',
  },
  duplicateLabel: { control: 'text', description: '`label` of the first action: a long one wraps inside the menu' },
  selectable: { control: 'boolean', description: '`selectable` of `useListReport`: a checkbox column before, the actions column after' },
  rowActionsInline: {
    control: { type: 'number', min: 0, max: 3, step: 1 },
    description:
      '`rowActionsInline`: how many actions with an icon are inline buttons when the table is at least 40rem wide (0: the "…" menu alone)',
  },
  containerWidth: {
    control: 'select',
    options: ['wide', 'narrow'],
    description:
      'Width of the box around the report: `wide` (1100px, capped to the viewport) or `narrow` (a 30rem panel). The inline actions follow the width of the table, not of the viewport: below 40rem they are in the "…" menu. Narrower than its columns, the table scrolls sideways and the actions column stays in view',
  },
  onDuplicate: { control: false },
  onDelete: { control: false },
  preselectedIds: HIDDEN,
  withoutDeleteFor: HIDDEN,
  ...{ status: HIDDEN, dataset: HIDDEN, searchCommitDelay: HIDDEN, firstSortDirection: HIDDEN, onRetry: HIDDEN },
  ...{ onSortChange: HIDDEN, onFilterChange: HIDDEN, onSearchQueryChange: HIDDEN },
} as const;

// The menu-only configuration (no inline action, no icon): the fixtures of the menu alone.
const ROW_ACTIONS_ARGS: RowActionsArgs = {
  disabledFor: 'archived',
  deleteTone: 'danger',
  deleteIcon: false,
  duplicateLabel: 'Duplicate',
  selectable: false,
  rowActionsInline: 0,
  containerWidth: 'wide',
  onDuplicate: fn(),
  onDelete: fn(),
};

// "Delete…" (with an icon) inline on a wide table, "Duplicate" (without one) in the "…" menu.
const ROW_ACTIONS_INLINE_ARGS: RowActionsArgs = { ...ROW_ACTIONS_ARGS, deleteIcon: true, rowActionsInline: 1 };

// The first record that "Delete…" can delete (not archived), at the top of the table.
const FIRST_DELETABLE = ROW_ACTION_ROWS.find((r) => r.status !== 'archived')!;

/**
 * Per-row actions (`rowActions`): a trailing column, sticky at the end of the table. "Delete…" (danger,
 * with a trash icon, disabled for the archived records; it asks for a confirmation, then deletes the
 * row) is an inline icon button named "Delete… <number>" (`rowActionsInline={1}`) while the table is at
 * least 40rem wide, with its label as a tooltip on hover or keyboard focus; "Duplicate" (no icon) is in
 * the "…" menu named "Actions for <number>". With `containerWidth: narrow` (a 30rem panel, whatever the
 * viewport) both are in the "…" menu: the same descriptors, the same calls. Cancel on the confirmation
 * returns the focus to the control that was used, a confirmed deletion to the table. Controls: the
 * number of inline actions, the icon of "Delete" (without one it never goes inline), the status whose
 * "Delete" is disabled, its tone, `selectable` and the width of the box. `onDuplicate`/`onDelete` show
 * up in Actions with the id of the row. The play function (wide box) deletes an record from its inline
 * button, checks that click and Enter on the disabled inline button of an archived record call nothing,
 * then chooses "Duplicate" in that row's "…" menu from the keyboard and checks the focus back on it.
 */
export const RowActions: StoryObj<RowActionsArgs> = {
  name: 'Row actions',
  argTypes: ROW_ACTIONS_ARG_TYPES,
  args: ROW_ACTIONS_INLINE_ARGS,
  render: (args) => <RowActionsReport {...args} />,
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration, on a viewport where the wide box is at least 40rem.
    if (
      args.disabledFor !== 'archived' ||
      args.duplicateLabel !== 'Duplicate' ||
      args.rowActionsInline !== 1 ||
      !args.deleteIcon ||
      args.containerWidth !== 'wide' ||
      rowActionsScroller(canvasElement).clientWidth < 640
    ) {
      return;
    }
    // The menu and the dialog are in portals: query the whole document. The hidden form of each cell
    // (`display: none`) is out of the accessibility tree: one control per action and row.
    const page = within(canvasElement.ownerDocument.body);
    const inline = (number: string) => page.getByRole('button', { name: `Delete… ${number}` });
    const trigger = (number: string) => page.getByRole('button', { name: `Actions for ${number}` });

    // Inline "Delete…": the confirmation, then the call with the row's id.
    await userEvent.click(inline(FIRST_DELETABLE.code));
    const dialog = await page.findByRole('dialog', { name: `Delete record ${FIRST_DELETABLE.code}?` });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete record' }));
    await expect(args.onDelete).toHaveBeenCalledTimes(1);
    await expect(args.onDelete).toHaveBeenCalledWith(FIRST_DELETABLE.id);
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(page.queryByRole('button', { name: `Delete… ${FIRST_DELETABLE.code}` })).toBeNull());

    // An archived record: its inline "Delete…" is aria-disabled; click and Enter open nothing, call nothing.
    const disabled = inline(FIRST_ARCHIVED.code);
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(disabled);
    disabled.focus();
    await userEvent.keyboard('{Enter}');
    await expect(page.queryByRole('dialog')).toBeNull();
    await expect(args.onDelete).toHaveBeenCalledTimes(1);

    // Its "…" menu holds what is not inline: "Duplicate", chosen from the keyboard.
    trigger(FIRST_ARCHIVED.code).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus());
    await expect(page.queryByRole('menuitem', { name: 'Delete…' })).toBeNull();
    await userEvent.keyboard('{Enter}');
    await expect(args.onDuplicate).toHaveBeenCalledTimes(1);
    await expect(args.onDuplicate).toHaveBeenCalledWith(FIRST_ARCHIVED.id);
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger(FIRST_ARCHIVED.code)).toHaveFocus());
  },
};

/**
 * Fixture of the e2e suite: the menu alone (`rowActionsInline` 0, "Delete…" without an icon), the
 * play function of that configuration.
 */
export const RowActionsMenuOnly: StoryObj<RowActionsArgs> = {
  name: 'Row actions: menu only',
  tags: ['internal'],
  argTypes: ROW_ACTIONS_ARG_TYPES,
  args: ROW_ACTIONS_ARGS,
  render: (args) => <RowActionsReport {...args} />,
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration ("Delete…" disabled for the archived records, "Duplicate").
    if (args.disabledFor !== 'archived' || args.duplicateLabel !== 'Duplicate') return;
    // The menu is in a portal: query the whole document.
    const page = within(canvasElement.ownerDocument.body);
    const trigger = (number: string) => page.getByRole('button', { name: `Actions for ${number}`, hidden: true });

    // An archived record: "Delete…" is there, disabled, and the arrows skip it.
    trigger(FIRST_ARCHIVED.code).focus();
    await userEvent.keyboard('{Enter}');
    const remove = await page.findByRole('menuitem', { name: 'Delete…' });
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger(FIRST_ARCHIVED.code)).toHaveFocus());
    await expect(args.onDelete).not.toHaveBeenCalled();

    // The third row, from the keyboard: Enter opens on "Duplicate", Enter chooses it.
    trigger(THIRD_ROW.code).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    await expect(args.onDuplicate).toHaveBeenCalledTimes(1);
    await expect(args.onDuplicate).toHaveBeenCalledWith(THIRD_ROW.id);
    await waitFor(() => expect(page.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger(THIRD_ROW.code)).toHaveFocus());
  },
};

/** Fixture of the e2e suite: the menu alone (`rowActionsInline` 0, no icon), without a play function. */
export const RowActionsNoPlay: StoryObj<RowActionsArgs> = {
  ...RowActionsMenuOnly,
  name: 'Row actions (no play)',
  tags: ['internal'],
  play: undefined,
};

/** Fixture of the e2e suite: `RowActions` (one inline action) without the play function. */
export const RowActionsInlineNoPlay: StoryObj<RowActionsArgs> = {
  ...RowActions,
  name: 'Row actions: inline (no play)',
  tags: ['internal'],
  play: undefined,
};

/**
 * Visual fixture: one inline action, wide box, `selectable` with the second record selected. The
 * inline "Delete…" of the archived records is disabled; on a mobile viewport the box is below 40rem
 * and the narrow form (the "…" alone) shows instead.
 */
export const RowActionsInlineWide: StoryObj<RowActionsArgs> = {
  name: 'Row actions: inline, wide',
  tags: ['internal', 'visual'],
  argTypes: ROW_ACTIONS_ARG_TYPES,
  args: { ...ROW_ACTIONS_INLINE_ARGS, selectable: true, preselectedIds: [ROW_ACTION_ROWS[1]!.id] },
  render: (args) => <RowActionsReport {...args} />,
};

/** Visual fixture: one inline action in a 30rem box: the narrow form on every viewport. */
export const RowActionsInlineNarrow: StoryObj<RowActionsArgs> = {
  name: 'Row actions: inline, narrow',
  tags: ['internal', 'visual'],
  argTypes: ROW_ACTIONS_ARG_TYPES,
  args: { ...ROW_ACTIONS_INLINE_ARGS, containerWidth: 'narrow' },
  render: (args) => <RowActionsReport {...args} />,
};

const SECOND_ROW = ROW_ACTION_ROWS[1]!;
const rowActionsScroller = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('table', { name: /Records/, hidden: true }).parentElement as HTMLElement;

/**
 * Visual fixture: with `selectable`, the second record selected (its sticky actions cell has the tint
 * of the row) and the table scrolled sideways by half of what it can scroll (on a narrow viewport the
 * columns pass under the sticky actions column; on a wide one there is nothing to scroll).
 */
export const RowActionsSelectedScrolled: StoryObj<RowActionsArgs> = {
  name: 'Row actions: selected row, scrolled',
  tags: ['internal', 'visual'],
  argTypes: ROW_ACTIONS_ARG_TYPES,
  args: { ...ROW_ACTIONS_ARGS, selectable: true, preselectedIds: [SECOND_ROW.id] },
  render: (args) => <RowActionsReport {...args} />,
  play: async ({ canvasElement }) => {
    const scroller = rowActionsScroller(canvasElement);
    scroller.scrollLeft = Math.round((scroller.scrollWidth - scroller.clientWidth) / 2);
    await waitFor(() => expect(scroller.scrollLeft).toBe(Math.round((scroller.scrollWidth - scroller.clientWidth) / 2)));
  },
};

/** Visual fixture: the menu of the third record open (opened from the keyboard, "Duplicate" focused). */
export const RowActionsMenuOpen: StoryObj<RowActionsArgs> = {
  name: 'Row actions: menu open',
  tags: ['internal', 'visual'],
  argTypes: ROW_ACTIONS_ARG_TYPES,
  args: ROW_ACTIONS_ARGS,
  render: (args) => <RowActionsReport {...args} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    page.getByRole('button', { name: `Actions for ${THIRD_ROW.code}` }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus());
  },
};

/**
 * Columns hidden sideways: the 30rem box is narrower than the columns, so the table scrolls inside it
 * and a shade marks each inline edge past which columns are hidden (the end one stops before the sticky
 * actions column). The play function checks the end shade alone at the start, then scrolls the table
 * just enough to bring the first row's checkbox under the start shade: the point under the shade is
 * still the checkbox (the shade takes no pointer event), a click selects the row and
 * `onSelectedIdsChange` reports it. Controls: those of the row actions (`containerWidth: wide` shows
 * every column on a wide viewport, and then no shade).
 */
export const ColumnsHiddenSideways: StoryObj<RowActionsArgs> = {
  name: 'Columns hidden sideways',
  tags: ['visual'],
  argTypes: { ...ROW_ACTIONS_ARG_TYPES, onSelectedIdsChange: { control: false } },
  args: { ...ROW_ACTIONS_ARGS, selectable: true, containerWidth: 'narrow', onSelectedIdsChange: fn() },
  render: (args) => <RowActionsReport {...args} />,
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: a narrow box, a selection column.
    if (args.containerWidth !== 'narrow' || !args.selectable) return;
    const scroller = rowActionsScroller(canvasElement);
    const shade = (edge: 'start' | 'end') => scroller.querySelector(`[data-rop-overflow-edge="${edge}"]`) as HTMLElement;
    await waitFor(() => expect(scroller).toHaveAttribute('data-rop-overflow-end'));
    await expect(scroller).not.toHaveAttribute('data-rop-overflow-start');
    await waitFor(() => expect(getComputedStyle(shade('end')).opacity).toBe('1'));
    await expect(getComputedStyle(shade('start')).visibility).toBe('hidden');

    // The first row's checkbox, its centre 4px from the start edge (the right one in rtl, where
    // `scrollLeft` is negative): under the start shade.
    const box = within(scroller).getAllByRole('checkbox')[1]!;
    const row = box.closest('tr')!;
    const rtl = getComputedStyle(scroller).direction === 'rtl';
    const centreX = () => box.getBoundingClientRect().left + box.getBoundingClientRect().width / 2;
    const fromStart = rtl ? scroller.getBoundingClientRect().right - centreX() : centreX() - scroller.getBoundingClientRect().left;
    scroller.scrollLeft = (rtl ? -1 : 1) * Math.round(fromStart - 4);
    await waitFor(() => expect(scroller).toHaveAttribute('data-rop-overflow-start'));
    await waitFor(() => expect(getComputedStyle(shade('start')).opacity).toBe('1'));
    const shadeBox = shade('start').getBoundingClientRect();
    const x = centreX();
    const y = box.getBoundingClientRect().top + box.getBoundingClientRect().height / 2;
    await expect(x).toBeGreaterThanOrEqual(shadeBox.left);
    await expect(x).toBeLessThanOrEqual(shadeBox.right);
    const hit = canvasElement.ownerDocument.elementFromPoint(x, y);
    await expect(hit === box || box.contains(hit)).toBe(true);

    await userEvent.click(box);
    await expect(box).toBeChecked();
    await expect(row).toHaveAttribute('data-selected');
    await expect(args.onSelectedIdsChange).toHaveBeenCalledTimes(1);
  },
};

/**
 * `ColumnsHiddenSideways` inside a `dir="rtl"` wrapper (the document language stays English): the
 * columns start on the right, the end shade is on the left, and each gradient is darkest on the
 * scroller's outer edge. The same play function, in the mirrored direction.
 */
export const ColumnsHiddenSidewaysRtl: StoryObj<RowActionsArgs> = {
  ...ColumnsHiddenSideways,
  name: 'Columns hidden sideways (rtl)',
  tags: ['visual'],
  render: (args) => (
    <div dir="rtl">
      <RowActionsReport {...args} />
    </div>
  ),
};

/** An app's direction switch: a toggle button above a wrapper whose `dir` it sets. */
function DirectionSwitch({ children }: { children: ReactNode }) {
  const [rtl, setRtl] = useState(false);
  return (
    <>
      <Button variant="secondary" aria-pressed={rtl} onClick={() => setRtl((on) => !on)}>
        Right to left
      </Button>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ marginTop: 8 }}>
        {children}
      </div>
    </>
  );
}

/**
 * `ColumnsHiddenSideways` under a direction switch, as an app with a language menu has it. Switching
 * the direction moves the scroll back to the start of the new direction; Firefox does not fire a
 * `scroll` event for it, and the shades still follow at once (the table watches `dir` attributes).
 * The play function scrolls to the middle (both shades), switches to right to left (the end shade
 * alone, now on the left), scrolls to the end (the start shade alone) and switches back (the end shade
 * alone, on the right), checking each state with no scroll in between.
 */
export const ColumnsHiddenSidewaysDirectionSwitch: StoryObj<RowActionsArgs> = {
  ...ColumnsHiddenSideways,
  name: 'Columns hidden sideways: direction switched after a scroll',
  tags: [],
  render: (args) => (
    <DirectionSwitch>
      <RowActionsReport {...args} />
    </DirectionSwitch>
  ),
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: a narrow box.
    if (args.containerWidth !== 'narrow') return;
    const scroller = rowActionsScroller(canvasElement);
    const toggle = within(canvasElement).getByRole('button', { name: 'Right to left' });
    const edges = () => ({ start: scroller.hasAttribute('data-rop-overflow-start'), end: scroller.hasAttribute('data-rop-overflow-end') });
    const max = () => scroller.scrollWidth - scroller.clientWidth;
    await waitFor(() => expect(edges()).toEqual({ start: false, end: true }));

    scroller.scrollLeft = Math.round(max() / 2);
    await waitFor(() => expect(edges()).toEqual({ start: true, end: true }));
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(getComputedStyle(scroller).direction).toBe('rtl'));
    await expect(scroller.scrollLeft).toBe(0);
    await expect(edges()).toEqual({ start: false, end: true });

    // The end of an rtl scroller is at a negative `scrollLeft`.
    scroller.scrollLeft = -max();
    await waitFor(() => expect(edges()).toEqual({ start: true, end: false }));
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(getComputedStyle(scroller).direction).toBe('ltr'));
    await expect(scroller.scrollLeft).toBe(0);
    await expect(edges()).toEqual({ start: false, end: true });
  },
};

// ---------------------------------------------------------------------------------------------------------
// "Example: configured for ..." (ticket #627): six stories, one aspect of the column configuration each, on a
// different vertical. The component stays neutral; the domain lives only in the `columns` below, written as a
// consumer writes them (formatting with `Intl.*` inside `cell`, raw values in `accessor`).
// ---------------------------------------------------------------------------------------------------------

/** The Controls the neutral stories above define and these ones do not use: hidden, so they control nothing here. */
const NEUTRAL_ARGS_HIDDEN = {
  status: HIDDEN,
  dataset: HIDDEN,
  searchCommitDelay: HIDDEN,
  firstSortDirection: HIDDEN,
  containerWidth: HIDDEN,
  onRetry: HIDDEN,
  onFilterChange: HIDDEN,
  onSearchQueryChange: HIDDEN,
} as const;
const LOCALE_HIDDEN = { locale: HIDDEN } as const;
const SORT_CALLBACK = { onSortChange: { control: false, table: { disable: true } } } as const;

/** An amount in minor units (cents, pence, yen) as money: `Intl` knows how many decimals the currency has. */
function formatMinor(minor: number, currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

/** An ISO date (`2026-06-12`) in the reader's locale. The date has no time zone, so format it in UTC. */
function formatDay(iso: string, locale: string, dateStyle: 'short' | 'medium' | 'long'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle, timeZone: 'UTC' }).format(new Date(iso));
}

const rowsOf = (canvas: ReturnType<typeof within>): HTMLElement[] => canvas.getAllByRole('row').slice(1);

/** Index of a column among the cells of a row (the selection checkbox column counts). */
const columnIndex = (canvas: ReturnType<typeof within>, name: string): number =>
  canvas.getAllByRole('columnheader').findIndex((header: HTMLElement) => header.textContent?.trim() === name);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- 1. ERP: defining the columns ------------------------------------------------------------------------

type PurchaseOrderColumnId = 'number' | 'supplier' | 'status';

interface ErpArgs {
  searchableColumns: PurchaseOrderColumnId[];
  onSortChange: (sort: ListReportSort) => void;
}

const PURCHASE_ORDERS = makePurchaseOrders(40);
const supplierName = (order: DemoPurchaseOrder): string => getSupplier(order.supplierId)?.name ?? order.supplierId;

function ErpPurchaseOrders({ searchableColumns, onSortChange }: ErpArgs) {
  const columns = useMemo<ListReportColumn<DemoPurchaseOrder>[]>(
    () => [
      // `id` is the stable key; `header` is what the reader sees; `accessor` is the raw value (sorting, search).
      { id: 'number', header: 'Order', accessor: (o) => o.number, searchable: searchableColumns.includes('number'), width: 200 },
      { id: 'supplier', header: 'Supplier', accessor: supplierName, searchable: searchableColumns.includes('supplier'), minWidth: 240 },
      {
        id: 'status',
        header: 'Status',
        accessor: (o) => PURCHASE_ORDER_STATUS_LABEL[o.status],
        // `cell` is only the rendering: the accessor above is still what is sorted and searched.
        cell: (o) => <StatusBadge tone={PURCHASE_ORDER_STATUS_TONE[o.status]}>{PURCHASE_ORDER_STATUS_LABEL[o.status]}</StatusBadge>,
        searchable: searchableColumns.includes('status'),
        width: 150,
      },
      {
        id: 'ordered',
        header: 'Ordered',
        accessor: (o) => o.orderDate,
        cell: (o) => formatDay(o.orderDate, 'en-GB', 'medium'),
        firstSortDirection: 'desc',
        searchable: false,
        width: 140,
      },
      {
        // The raw amount in minor units of the record's own currency: sorting does not convert between currencies.
        id: 'total',
        header: 'Total',
        accessor: (o) => o.totalMinor,
        cell: (o) => formatMinor(o.totalMinor, o.currency, 'en-GB'),
        align: 'end',
        searchable: false,
        width: 170,
      },
    ],
    [searchableColumns],
  );
  return <ColumnsReport title="Purchase orders" rows={PURCHASE_ORDERS} columns={columns} getRowId={(o) => o.id} onSortChange={onSortChange} />;
}

const searchbox = (canvas: ReturnType<typeof within>) => canvas.getByRole('searchbox', { name: 'Search' });

/**
 * Defining columns: `id` (stable key), `header`, `accessor` (the raw value, used to sort and search), `cell` (only
 * the rendering: here a status badge, a date and an amount in the currency of each order) and `searchable`
 * (`false` keeps a column out of the text search). The "Total" accessor returns the amount in minor units of the
 * order's own currency, so sorting is by amount in that currency, never converted. Controls: `searchableColumns`
 * (which columns the search looks into). The play function searches for the first order's supplier: with
 * "Supplier" searchable it finds the order, without it the search finds nothing while the order number still works.
 */
export const UseCaseErpPurchaseOrder: StoryObj<ErpArgs> = {
  name: 'Example: configured for an ERP purchase-order list',
  tags: ['use-case', 'vertical:erp', 'visual'],
  ...describeUseCase({
    vertical: 'erp',
    problem: 'A buyer finds purchase orders by number or supplier, and sorts them by total even though each order is in its supplier\'s currency.',
    configuration:
      'Each column has an `id`, a `header`, an `accessor` with the raw value (the number, the supplier name, the amount in minor units) and, where the display differs, a `cell` (badge, date, money). `searchable: false` keeps the date and the amount out of the search; the Controls decide whether the supplier and the status are searched too.',
  }),
  argTypes: {
    searchableColumns: storyControl({
      control: 'check',
      options: ['number', 'supplier', 'status'],
      description: '`searchable` of the "Order", "Supplier" and "Status" columns: `false` on a column keeps it out of the text search',
    }),
    ...SORT_CALLBACK,
    ...NEUTRAL_ARGS_HIDDEN,
    ...LOCALE_HIDDEN,
  },
  args: { searchableColumns: ['number', 'supplier'], onSortChange: fn() },
  render: (args) => <ErpPurchaseOrders {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const first = PURCHASE_ORDERS[0]!;
    const term = supplierName(first).split(' ')[0]!;
    await waitFor(() => expect(rowsOf(canvas).length).toBe(PURCHASE_ORDERS.length));
    const search = async (text: string) => {
      await userEvent.clear(searchbox(canvas));
      await userEvent.type(searchbox(canvas), `${text}{Enter}`);
    };
    const expectedWithSupplier = PURCHASE_ORDERS.filter((o) => supplierName(o).includes(term)).length;
    await expect(expectedWithSupplier).toBeGreaterThan(0);
    await search(term);
    if (args.searchableColumns.includes('supplier')) {
      await waitFor(() => expect(rowsOf(canvas)).toHaveLength(expectedWithSupplier));
      await expect(rowsOf(canvas)[0]).toHaveTextContent(supplierName(first));
    } else {
      await waitFor(() => expect(canvas.queryAllByRole('row').length).toBeLessThanOrEqual(1));
      await expect(canvas.getByText('No results for the current filters')).toBeVisible();
      // The other searchable column still works.
      if (args.searchableColumns.includes('number')) {
        await search(first.number);
        await waitFor(() => expect(rowsOf(canvas)).toHaveLength(1));
      }
    }
  },
};

// ---- 2. E-commerce: width and truncation ------------------------------------------------------------------

type NameWidth = 'auto' | 240 | '18rem';

interface CatalogueArgs {
  nameWidth: NameWidth;
  truncate: boolean;
  onSortChange: (sort: ListReportSort) => void;
}

const PRODUCTS = makeProducts(40);

function ProductCatalogue({ nameWidth, truncate, onSortChange }: CatalogueArgs) {
  const columns = useMemo<ListReportColumn<DemoProduct>[]>(
    () => [
      // A fixed width in px: an SKU never changes length.
      { id: 'sku', header: 'SKU', accessor: (p) => p.sku, width: 130 },
      {
        id: 'name',
        header: 'Product',
        accessor: (p) => p.name,
        // `width` takes px or any CSS length; without one the column shares the free space. `minWidth` counts
        // in the table's minimum width, so a narrow container scrolls instead of squeezing the name.
        width: nameWidth === 'auto' ? undefined : nameWidth,
        minWidth: 160,
        // `true` (default): one line with an ellipsis and a tooltip with the full text on hover or focus.
        truncate,
      },
      { id: 'category', header: 'Category', accessor: (p) => PRODUCT_CATEGORY_LABEL[p.category], width: 170 },
      {
        id: 'price',
        header: 'Price',
        accessor: (p) => p.listPriceMinor.EUR,
        cell: (p) => formatMinor(p.listPriceMinor.EUR, 'EUR', 'en-GB'),
        align: 'end',
        searchable: false,
        width: 120,
      },
    ],
    [nameWidth, truncate],
  );
  return <ColumnsReport title="Products" rows={PRODUCTS} columns={columns} getRowId={(p) => p.id} onSortChange={onSortChange} />;
}

/**
 * Width and truncation: `width` (a number in px, or a CSS length such as `18rem`; without one the column shares
 * the free space), `minWidth` (counted in the minimum width of the table, so a narrow container scrolls) and
 * `truncate` (one line with an ellipsis, or wrapped). The SKU has a fixed width, the product name is long.
 * Controls: `nameWidth`, `truncate`. The play function checks the header width the Control asked for, then, with
 * `truncate` on, that the name is cut (`scrollWidth > clientWidth`) inside a real `max-width`, with no tooltip at
 * mount and the full text in a tooltip on hover; with `truncate` off, that the name wraps and opens no tooltip.
 */
export const UseCaseEcommerceProductCatalogue: StoryObj<CatalogueArgs> = {
  name: 'Example: configured for an e-commerce product catalogue',
  tags: ['use-case', 'vertical:e-commerce', 'visual'],
  ...describeUseCase({
    vertical: 'e-commerce',
    problem: 'Product names run past 50 characters while the SKU and the price are short; the table has to keep its rows one line high on a phone.',
    configuration:
      'The SKU gets a fixed `width` in px, the name a `width` of `240` or `18rem` (or none, to take the free space) with a `minWidth` of 160, and `truncate` (the default) keeps it to one line with a tooltip. `truncate: false` lets the name wrap, and the row grows.',
  }),
  argTypes: {
    nameWidth: storyControl({
      control: 'select',
      options: ['auto', 240, '18rem'],
      description: '`width` of the "Product" column: none (it takes the free space), 240 (px) or `18rem`',
    }),
    truncate: storyControl({ control: 'boolean', description: '`truncate` of the "Product" column: an ellipsis and a tooltip, or wrapped text' }),
    ...SORT_CALLBACK,
    ...NEUTRAL_ARGS_HIDDEN,
    ...LOCALE_HIDDEN,
  },
  args: { nameWidth: 240, truncate: true, onSortChange: fn() },
  render: (args) => <ProductCatalogue {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(PRODUCTS.length));
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const header = canvas.getByRole('columnheader', { name: 'Product' });
    const width = header.getBoundingClientRect().width;
    // `minWidth` is 160: a `rem` width is never narrower than it.
    await expect(width).toBeGreaterThanOrEqual(160 - 1);
    if (args.nameWidth !== 'auto') {
      const wanted = typeof args.nameWidth === 'number' ? args.nameWidth : Number.parseFloat(args.nameWidth) * rem;
      await expect(Math.abs(width - wanted)).toBeLessThanOrEqual(1);
    } else {
      await expect(width).toBeGreaterThan(240);
      return;
    }
    const nameIndex = columnIndex(canvas, 'Product');
    const longest = [...PRODUCTS].sort((a, b) => b.name.length - a.name.length)[0]!;
    const row = rowsOf(canvas)[PRODUCTS.indexOf(longest)]!;
    const cell = within(row).getAllByRole('cell')[nameIndex]!;
    // Nothing yet: the tooltip is judged at the gesture, never at mount.
    await expect(body.queryByRole('tooltip')).toBeNull();
    if (args.truncate) {
      const text = cell.firstElementChild as HTMLElement;
      await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
      await expect(getComputedStyle(text).maxWidth).not.toBe('none');
      await userEvent.hover(text);
      await waitFor(() => expect(body.getByRole('tooltip')).toHaveTextContent(longest.name), { timeout: 3000 });
      await userEvent.unhover(text);
    } else {
      const shortest = [...PRODUCTS].sort((a, b) => a.name.length - b.name.length)[0]!;
      const shortRow = rowsOf(canvas)[PRODUCTS.indexOf(shortest)]!;
      await expect(row.getBoundingClientRect().height).toBeGreaterThan(shortRow.getBoundingClientRect().height);
      await expect(cell).toHaveTextContent(longest.name);
      await userEvent.hover(cell);
      await sleep(900);
      await expect(body.queryByRole('tooltip')).toBeNull();
      await userEvent.unhover(cell);
    }
  },
};

// ---- 3. B2B: right-aligned numbers and currency ------------------------------------------------------------

type PriceCurrency = 'EUR' | 'USD' | 'GBP' | 'JPY';
type PriceLocale = 'en-GB' | 'de-DE' | 'ja-JP';

interface PriceListArgs {
  currency: PriceCurrency;
  locale: PriceLocale;
  onSortChange: (sort: ListReportSort) => void;
}

function PriceList({ currency, locale, onSortChange }: PriceListArgs) {
  const columns = useMemo<ListReportColumn<DemoProduct>[]>(
    () => [
      { id: 'sku', header: 'SKU', accessor: (p) => p.sku, width: 130 },
      { id: 'name', header: 'Product', accessor: (p) => p.name, minWidth: 240 },
      {
        id: 'price',
        header: `List price (${currency})`,
        // Sorting is on the raw number, never on the formatted text.
        accessor: (p) => p.listPriceMinor[currency],
        // Numbers line up on the right; `Intl.NumberFormat` knows that EUR has two decimals and JPY none.
        cell: (p) => formatMinor(p.listPriceMinor[currency], currency, locale),
        align: 'end',
        searchable: false,
        width: 190,
      },
    ],
    [currency, locale],
  );
  return <ColumnsReport title="Price list" rows={PRODUCTS} columns={columns} getRowId={(p) => p.id} onSortChange={onSortChange} />;
}

/** The characters of an amount that are not digits, as the reader sees them. */
const decimalSeparatorOf = (locale: string): string =>
  new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')!.value;

/**
 * Right-aligned numbers and money: `align: 'end'` puts the header and the cells of the price column on the
 * right, and `cell` formats the raw amount with `Intl.NumberFormat` (`style: 'currency'`): two decimals in EUR,
 * USD and GBP, none in JPY, and the separators of the reader's locale. The `accessor` stays the number, so
 * the column sorts by value. Controls: `currency`, `locale`. The play function checks the alignment of the header
 * and of the cells, that a JPY price has no decimal digits while the others have two, and that the decimal
 * separator is the one of the locale.
 */
export const UseCaseB2bPriceList: StoryObj<PriceListArgs> = {
  name: 'Example: configured for a B2B price list',
  tags: ['use-case', 'vertical:b2b', 'visual'],
  ...describeUseCase({
    vertical: 'b2b',
    problem: 'A buyer compares list prices in the currency of the contract, and reads them in the format of their own country.',
    configuration:
      '`align: \'end\'` on the price column (header and cells), `accessor` returning the number, and a `cell` that formats it with `Intl.NumberFormat(locale, { style: \'currency\', currency })`. Changing the currency or the locale changes only the `cell`: the sort order and the layout stay.',
  }),
  argTypes: {
    currency: storyControl({ control: 'radio', options: ['EUR', 'USD', 'GBP', 'JPY'], description: 'Currency of the price column: its `accessor` and the `currency` of its `Intl.NumberFormat`' }),
    locale: storyControl({ control: 'select', options: ['en-GB', 'de-DE', 'ja-JP'], description: 'Locale of the `Intl.NumberFormat` in the `cell`: separators and the place of the symbol' }),
    ...SORT_CALLBACK,
    ...NEUTRAL_ARGS_HIDDEN,
  },
  args: { currency: 'EUR', locale: 'en-GB', onSortChange: fn() },
  render: (args) => <PriceList {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(PRODUCTS.length));
    const header = canvas.getByRole('columnheader', { name: `List price (${args.currency})` });
    await expect(getComputedStyle(header).textAlign).toMatch(/^(end|right)$/);
    const index = columnIndex(canvas, `List price (${args.currency})`);
    const cells = rowsOf(canvas).map((row) => within(row).getAllByRole('cell')[index]!);
    for (const cell of cells) await expect(getComputedStyle(cell).textAlign).toMatch(/^(end|right)$/);
    const prices = PRODUCTS.map((p) => p.listPriceMinor[args.currency]);
    // The digits on screen are the amount: in JPY the minor unit is the yen, in the others the amount has two decimals.
    const digits = (text: string) => text.replace(/\D/g, '');
    for (const [i, cell] of cells.entries()) await expect(digits(cell.textContent ?? '')).toBe(String(prices[i]));
    const sample = cells[0]!.textContent ?? '';
    const separator = decimalSeparatorOf(args.locale);
    if (args.currency === 'JPY') {
      // No decimal part: the last group is never one or two digits after a separator.
      await expect(sample).not.toMatch(/[.,]\d{1,2}(?!\d)/);
    } else {
      await expect(sample).toMatch(new RegExp(`\\${separator}\\d{2}(?!\\d)`));
    }
    // The price column still sorts by number: the first click goes ascending.
    await userEvent.click(canvas.getByRole('button', { name: `List price (${args.currency})` }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'price', direction: 'asc' });
    const sorted = within(rowsOf(canvas)[0]!).getAllByRole('cell')[index]!.textContent ?? '';
    await expect(digits(sorted)).toBe(String(Math.min(...prices)));
  },
};

// ---- 4. E-learning: dates and status -----------------------------------------------------------------------

type EnrolmentDateStyle = 'short' | 'medium' | 'long';
type EnrolmentLocale = 'en-GB' | 'de-DE' | 'ja-JP';

interface EnrolmentArgs {
  dateStyle: EnrolmentDateStyle;
  locale: EnrolmentLocale;
  onSortChange: (sort: ListReportSort) => void;
}

const ENROLMENTS = makeEnrolments(40);

/** A missing value shown as a dash that a screen reader announces as what is missing (spec 1.13.1). */
function Absent({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label}>
      —
    </span>
  );
}

function CourseEnrolments({ dateStyle, locale, onSortChange }: EnrolmentArgs) {
  const columns = useMemo<ListReportColumn<DemoEnrolment>[]>(
    () => [
      { id: 'learner', header: 'Learner', accessor: (e) => e.learner.name, minWidth: 200 },
      {
        id: 'status',
        header: 'Status',
        accessor: (e) => ENROLMENT_STATUS_LABEL[e.status],
        cell: (e) => <StatusBadge tone={ENROLMENT_STATUS_TONE[e.status]}>{ENROLMENT_STATUS_LABEL[e.status]}</StatusBadge>,
        searchable: false,
        width: 150,
      },
      {
        id: 'enrolled',
        header: 'Enrolled',
        accessor: (e) => e.enrolledOn,
        cell: (e) => formatDay(e.enrolledOn, locale, dateStyle),
        searchable: false,
        width: 170,
      },
      {
        id: 'completed',
        header: 'Completed',
        // An empty value sorts last; the cell says what is missing instead of leaving a bare dash.
        accessor: (e) => e.completedOn,
        cell: (e) => (e.completedOn ? formatDay(e.completedOn, locale, dateStyle) : <Absent label="Not completed" />),
        searchable: false,
        width: 170,
      },
      {
        id: 'score',
        header: 'Score',
        accessor: (e) => e.score,
        cell: (e) => (e.score === null ? <Absent label="No score" /> : `${e.score}%`),
        align: 'end',
        searchable: false,
        width: 110,
      },
    ],
    [dateStyle, locale],
  );
  return <ColumnsReport title="Enrolments" rows={ENROLMENTS} columns={columns} getRowId={(e) => e.id} onSortChange={onSortChange} />;
}

/**
 * Dates and status: `cell` formats an ISO date with `Intl.DateTimeFormat` (`dateStyle`, in the reader's
 * locale) and shows the state as a `StatusBadge` whose tone comes from a map. A missing completion date or score
 * is a dash with an accessible name ("Not completed", "No score"), never an empty cell or a zero: it is not the
 * same as 0%. Controls: `dateStyle`, `locale`. The play function finds a withdrawn enrolment (dash named "Not
 * completed", badge "Withdrawn") and a completed one, and checks its date against `Intl.DateTimeFormat` for the
 * Controls' `dateStyle` and `locale`.
 */
export const UseCaseElearningEnrolments: StoryObj<EnrolmentArgs> = {
  name: 'Example: configured for e-learning enrolments',
  tags: ['use-case', 'vertical:e-learning', 'visual'],
  ...describeUseCase({
    vertical: 'e-learning',
    problem: 'A learning manager reads when each person enrolled and finished a course, in their own date format, and tells a withdrawn learner from one who has not finished yet.',
    configuration:
      '`cell` with `Intl.DateTimeFormat(locale, { dateStyle })` for the dates (the `accessor` keeps the ISO string, so it sorts by date), a `StatusBadge` with the tone of the status, and an `Absent` dash with an accessible name for a missing completion date or score.',
  }),
  argTypes: {
    dateStyle: storyControl({ control: 'radio', options: ['short', 'medium', 'long'], description: '`dateStyle` of the `Intl.DateTimeFormat` in the date cells' }),
    locale: storyControl({ control: 'select', options: ['en-GB', 'de-DE', 'ja-JP'], description: 'Locale of the `Intl.DateTimeFormat` in the date cells' }),
    ...SORT_CALLBACK,
    ...NEUTRAL_ARGS_HIDDEN,
  },
  args: { dateStyle: 'medium', locale: 'en-GB', onSortChange: fn() },
  render: (args) => <CourseEnrolments {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(ENROLMENTS.length));
    const withdrawn = ENROLMENTS.findIndex((e) => e.status === 'withdrawn');
    const completed = ENROLMENTS.findIndex((e) => e.completedOn !== null);
    await expect(withdrawn).toBeGreaterThanOrEqual(0);
    await expect(completed).toBeGreaterThanOrEqual(0);
    const cellsOf = (index: number) => within(rowsOf(canvas)[index]!).getAllByRole('cell');
    const completedIndex = columnIndex(canvas, 'Completed');
    const scoreIndex = columnIndex(canvas, 'Score');
    const statusIndex = columnIndex(canvas, 'Status');

    const gone = cellsOf(withdrawn);
    await expect(within(gone[completedIndex]!).getByRole('img', { name: 'Not completed' })).toHaveTextContent('—');
    await expect(within(gone[scoreIndex]!).getByRole('img', { name: 'No score' })).toBeVisible();
    await expect(gone[statusIndex]).toHaveTextContent(ENROLMENT_STATUS_LABEL.withdrawn);

    const done = cellsOf(completed);
    const record = ENROLMENTS[completed]!;
    await expect(done[statusIndex]).toHaveTextContent(ENROLMENT_STATUS_LABEL.completed);
    await expect(done[completedIndex]).toHaveTextContent(formatDay(record.completedOn!, args.locale, args.dateStyle));
    await expect(within(done[completedIndex]!).queryByRole('img', { name: 'Not completed' })).toBeNull();
    await expect(done[scoreIndex]).toHaveTextContent(`${record.score}%`);
  },
};

// ---- 5. HR: hidden and optional columns --------------------------------------------------------------------

type OptionalColumnId = 'department' | 'manager' | 'hired';
const OPTIONAL_COLUMNS: readonly { id: OptionalColumnId; label: string }[] = [
  { id: 'department', label: 'Department' },
  { id: 'manager', label: 'Manager' },
  { id: 'hired', label: 'Hire date' },
];

interface DirectoryArgs {
  visibleColumns: OptionalColumnId[];
  onSortChange: (sort: ListReportSort) => void;
}

const EMPLOYEES = makeEmployees(40);
const EMPLOYEE_BY_ID = new Map(EMPLOYEES.map((e) => [e.id, e]));
const managerName = (e: DemoEmployee): string => (e.managerId ? (EMPLOYEE_BY_ID.get(e.managerId)?.fullName ?? '') : '');

/** The consumer's recipe: a checkbox group picks the optional columns and the `columns` array is filtered, memoized. */
function EmployeeDirectory({ visibleColumns, onSortChange }: DirectoryArgs) {
  const [visible, setVisible] = useState<readonly OptionalColumnId[]>(visibleColumns);
  const columns = useMemo<ListReportColumn<DemoEmployee>[]>(() => {
    const all: (ListReportColumn<DemoEmployee> & { optional?: OptionalColumnId })[] = [
      { id: 'name', header: 'Name', accessor: (e) => e.fullName, minWidth: 200 },
      { id: 'title', header: 'Title', accessor: (e) => e.title, minWidth: 200 },
      { id: 'department', header: 'Department', accessor: (e) => DEPARTMENT_LABEL[e.department], width: 170, optional: 'department' },
      { id: 'manager', header: 'Manager', accessor: managerName, minWidth: 180, optional: 'manager' },
      {
        id: 'hired',
        header: 'Hire date',
        accessor: (e) => e.hireDate,
        cell: (e) => formatDay(e.hireDate, 'en-GB', 'medium'),
        searchable: false,
        width: 150,
        optional: 'hired',
      },
    ];
    // A column without `optional` is always there; the others only while their box is checked.
    return all.filter((column) => !column.optional || visible.includes(column.optional));
  }, [visible]);
  const toolbar = (
    <fieldset style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: 0, border: 0, padding: 0 }}>
      <legend style={{ marginBottom: 4 }}>Optional columns</legend>
      {OPTIONAL_COLUMNS.map(({ id, label }) => (
        <Checkbox
          key={id}
          checked={visible.includes(id)}
          onCheckedChange={(checked) => setVisible((now) => (checked ? [...now, id] : now.filter((c) => c !== id)))}
        >
          {label}
        </Checkbox>
      ))}
    </fieldset>
  );
  return (
    <ColumnsReport
      title="Employees"
      rows={EMPLOYEES}
      columns={columns}
      getRowId={(e) => e.id}
      onSortChange={onSortChange}
      selectable
      toolbar={toolbar}
    />
  );
}

/**
 * Hidden or optional columns, with no API of their own: the consumer keeps the optional columns in state (here a
 * `Checkbox` group), filters its `columns` array and memoizes the result. A column that is not in the array is
 * not drawn, not searched and not sortable; sorting and selection keep working on the others. Controls:
 * `visibleColumns` (the initial choice; the checkboxes change it from then on). The play function makes sure
 * "Manager" is on, searches the CEO's name (found in every report of the CEO and in the CEO's own row), unchecks
 * "Manager" (the header goes and the same search finds only the CEO's own row), then sorts by "Hire date" and
 * selects a row.
 */
export const UseCaseHrEmployeeDirectory: StoryObj<DirectoryArgs> = {
  name: 'Example: configured for an HR employee directory (optional columns)',
  tags: ['use-case', 'vertical:hr', 'visual'],
  ...describeUseCase({
    vertical: 'hr',
    problem: 'People pick what they need to see in a directory: some want the manager and the hire date, others only the name and the title.',
    configuration:
      'A `Checkbox` group for the optional columns and a memoized `columns` array filtered by it (`useMemo` on the chosen ids). The required columns are always in the array, so with every box unchecked the table keeps its name and title.',
  }),
  argTypes: {
    visibleColumns: storyControl({
      control: 'check',
      options: ['department', 'manager', 'hired'],
      description: 'The optional columns in the `columns` array at the start: the consumer filters the array, the component has no such prop',
    }),
    ...SORT_CALLBACK,
    ...NEUTRAL_ARGS_HIDDEN,
    ...LOCALE_HIDDEN,
  },
  args: { visibleColumns: ['department', 'manager', 'hired'], onSortChange: fn() },
  render: (args) => <EmployeeDirectory key={args.visibleColumns.join()} {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(EMPLOYEES.length));
    const box = (name: string) => canvas.getByRole('checkbox', { name }) as HTMLInputElement;
    if (!box('Manager').checked) await userEvent.click(box('Manager'));
    await expect(canvas.getByRole('columnheader', { name: 'Manager' })).toBeVisible();

    const ceo = EMPLOYEES[0]!;
    const term = ceo.lastName;
    const withManager = EMPLOYEES.filter((e) => e.fullName.includes(term) || managerName(e).includes(term)).length;
    await expect(withManager).toBeGreaterThan(1);
    await userEvent.type(searchbox(canvas), `${term}{Enter}`);
    await waitFor(() => expect(rowsOf(canvas)).toHaveLength(withManager));

    await userEvent.click(box('Manager'));
    await expect(canvas.queryByRole('columnheader', { name: 'Manager' })).toBeNull();
    // Required columns stay; the search now looks only into the columns that are there.
    await expect(canvas.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(canvas.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    const withoutManager = EMPLOYEES.filter((e) => e.fullName.includes(term) || e.title.includes(term)).length;
    await expect(withoutManager).toBeLessThan(withManager);
    await waitFor(() => expect(rowsOf(canvas)).toHaveLength(withoutManager));

    // Sorting and selection still work on the other columns.
    await userEvent.clear(searchbox(canvas));
    await userEvent.type(searchbox(canvas), '{Enter}');
    await waitFor(() => expect(rowsOf(canvas)).toHaveLength(EMPLOYEES.length));
    if (box('Hire date').checked) {
      await userEvent.click(canvas.getByRole('button', { name: 'Hire date' }));
      await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'hired', direction: 'asc' });
      await expect(canvas.getByRole('columnheader', { name: 'Hire date' })).toHaveAttribute('aria-sort', 'ascending');
    }
    await userEvent.click(canvas.getByRole('checkbox', { name: `Select ${EMPLOYEES[0]!.fullName}` }));
    await expect(canvas.getByText('1 selected')).toBeVisible();
  },
};

// ---- 6. Helpdesk: sorting -----------------------------------------------------------------------------------

type CaseSortChoice = 'none' | 'priority' | 'opened' | 'sla';

interface QueueArgs {
  defaultSort: CaseSortChoice;
  priorityFirstDirection: ListReportSortDirection;
  onSortChange: (sort: ListReportSort) => void;
}

const SUPPORT_CASES = makeSupportCases(40);
/** Urgent above high above normal above low: an order the alphabet does not give. */
const PRIORITY_RANK: Readonly<Record<DemoSupportCasePriority, number>> = { low: 0, normal: 1, high: 2, urgent: 3 };

function SupportQueue({ defaultSort, priorityFirstDirection, onSortChange }: QueueArgs) {
  const columns = useMemo<ListReportColumn<DemoSupportCase>[]>(
    () => [
      { id: 'number', header: 'Case', accessor: (c) => c.number, width: 130 },
      // `sortable: false`: a free-text subject has no useful order, so it has no sort button.
      { id: 'subject', header: 'Subject', accessor: (c) => c.subject, sortable: false, minWidth: 260 },
      {
        id: 'priority',
        header: 'Priority',
        accessor: (c) => SUPPORT_CASE_PRIORITY_LABEL[c.priority],
        // The alphabet would put "High" before "Urgent" and "Low" before "Normal": compare by rank instead.
        compare: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
        cell: (c) => <StatusBadge tone={SUPPORT_CASE_PRIORITY_TONE[c.priority]}>{SUPPORT_CASE_PRIORITY_LABEL[c.priority]}</StatusBadge>,
        firstSortDirection: priorityFirstDirection,
        searchable: false,
        width: 130,
      },
      {
        // The first click shows the newest case; sorting is on the ISO string, which orders as a date.
        id: 'opened',
        header: 'Opened',
        accessor: (c) => c.openedOn,
        cell: (c) => formatDay(c.openedOn, 'en-GB', 'medium'),
        firstSortDirection: 'desc',
        searchable: false,
        width: 140,
      },
      {
        // The first click shows the case that is due first.
        id: 'sla',
        header: 'Reply due',
        accessor: (c) => c.slaDueDate,
        cell: (c) => formatDay(c.slaDueDate, 'en-GB', 'medium'),
        firstSortDirection: 'asc',
        searchable: false,
        width: 140,
      },
    ],
    [priorityFirstDirection],
  );
  const initial = useMemo<ListReportSort>(() => {
    if (defaultSort === 'none') return null;
    const direction = defaultSort === 'priority' ? priorityFirstDirection : defaultSort === 'opened' ? 'desc' : 'asc';
    return { columnId: defaultSort === 'sla' ? 'sla' : defaultSort, direction };
  }, [defaultSort, priorityFirstDirection]);
  return <ColumnsReport title="Support cases" rows={SUPPORT_CASES} columns={columns} getRowId={(c) => c.id} defaultSort={initial} onSortChange={onSortChange} />;
}

/**
 * Sorting: `compare` replaces the default comparator (the priority has an order of its own, not the alphabet),
 * `firstSortDirection` chooses what the first click does (newest first on "Opened", earliest due first on
 * "Reply due", the Control's choice on "Priority") and `sortable: false` removes the button from "Subject".
 * Controls: `defaultSort` (the sort at mount), `priorityFirstDirection`. The play function clicks "Priority"
 * (the top row is the most urgent, or the least with `asc`), "Opened" (the newest on top) and "Reply due" (the
 * earliest on top), and checks that "Subject" has no sort button.
 */
export const UseCaseHelpdeskSupportQueue: StoryObj<QueueArgs> = {
  name: 'Example: configured for a helpdesk support queue',
  tags: ['use-case', 'vertical:helpdesk', 'visual'],
  ...describeUseCase({
    vertical: 'helpdesk',
    problem: 'A support lead wants the urgent cases first, then the newest, then the ones about to breach their reply time; the priority names do not sort in that order alphabetically.',
    configuration:
      '`compare` on the priority column ranks urgent > high > normal > low, `firstSortDirection: \'desc\'` on the opening date and `\'asc\'` on the reply-due date make the first click useful, and `sortable: false` on the subject leaves it without a sort button.',
  }),
  argTypes: {
    defaultSort: storyControl({
      control: 'select',
      options: ['none', 'priority', 'opened', 'sla'],
      description: '`defaultSort` of `useListReport`: the column sorted at mount, in the direction of its first click',
    }),
    priorityFirstDirection: storyControl({ control: 'radio', options: ['asc', 'desc'], description: '`firstSortDirection` of the "Priority" column: what the first click does' }),
    ...SORT_CALLBACK,
    ...NEUTRAL_ARGS_HIDDEN,
    ...LOCALE_HIDDEN,
  },
  args: { defaultSort: 'none', priorityFirstDirection: 'desc', onSortChange: fn() },
  render: (args) => <SupportQueue key={`${args.defaultSort}-${args.priorityFirstDirection}`} {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(rowsOf(canvas).length).toBe(SUPPORT_CASES.length));
    const top = (column: string) => within(rowsOf(canvas)[0]!).getAllByRole('cell')[columnIndex(canvas, column)]!;
    await expect(canvas.queryByRole('button', { name: 'Subject' })).toBeNull();
    await expect(canvas.getByRole('columnheader', { name: 'Subject' })).toBeVisible();

    if (args.defaultSort !== 'none') {
      const id = { priority: 'Priority', opened: 'Opened', sla: 'Reply due' }[args.defaultSort];
      await expect(canvas.getByRole('columnheader', { name: id })).toHaveAttribute('aria-sort', /ascending|descending/);
      return;
    }
    const ranks = SUPPORT_CASES.map((c) => PRIORITY_RANK[c.priority]);
    const wanted = args.priorityFirstDirection === 'desc' ? Math.max(...ranks) : Math.min(...ranks);
    const wantedPriority = SUPPORT_CASES.find((c) => PRIORITY_RANK[c.priority] === wanted)!.priority;
    await userEvent.click(canvas.getByRole('button', { name: 'Priority' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'priority', direction: args.priorityFirstDirection });
    await expect(top('Priority')).toHaveTextContent(SUPPORT_CASE_PRIORITY_LABEL[wantedPriority]);

    await userEvent.click(canvas.getByRole('button', { name: 'Opened' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'opened', direction: 'desc' });
    const newest = SUPPORT_CASES.map((c) => c.openedOn).sort().at(-1)!;
    await expect(top('Opened')).toHaveTextContent(formatDay(newest, 'en-GB', 'medium'));

    await userEvent.click(canvas.getByRole('button', { name: 'Reply due' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'sla', direction: 'asc' });
    const earliest = SUPPORT_CASES.map((c) => c.slaDueDate).sort()[0]!;
    await expect(top('Reply due')).toHaveTextContent(formatDay(earliest, 'en-GB', 'medium'));
  },
};
