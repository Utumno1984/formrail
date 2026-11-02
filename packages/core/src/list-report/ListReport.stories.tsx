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
import { useListReportUrlState } from './use-list-report-url-state';

/** How long "Simula caricamento" keeps the report in `loading`. */
const LOADING_MS = 800;

const FILTERS: ListReportFilter<DemoInvoice>[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'pending', label: 'Da approvare', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approvate', predicate: (r) => r.status === 'approved' },
  { id: 'rejected', label: 'Respinte', predicate: (r) => r.status === 'rejected' },
];

function columns(firstDateDirection: ListReportSortDirection): ListReportColumn<DemoInvoice>[] {
  return [
    { id: 'number', header: 'Numero', accessor: (r) => r.number, width: 150 },
    { id: 'supplier', header: 'Fornitore', accessor: (r) => r.supplier, minWidth: 200 },
    { id: 'date', header: 'Data', accessor: (r) => r.date, firstSortDirection: firstDateDirection, width: 130 },
    {
      id: 'amount',
      header: 'Importo',
      accessor: (r) => r.amount,
      cell: (r) => formatEuro(r.amount),
      align: 'end',
      firstSortDirection: 'desc',
      searchable: false,
      width: 140,
    },
    { id: 'status', header: 'Stato', accessor: (r) => DEMO_STATUS_LABEL[r.status], searchable: false, width: 150 },
  ];
}

type DelayChoice = 0 | 300 | 800 | 'solo Invio';
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
    searchCommitDelay: searchCommitDelay === 'solo Invio' ? null : searchCommitDelay,
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
          Simula caricamento
        </Button>
      </div>
      <div style={{ width: containerWidth, maxWidth: '100%', height: flow ? undefined : 'min(600px, calc(100dvh - 104px))' }}>
        <ListReport
          title="Fatture"
          table={table}
          actions={<Button>Nuova fattura</Button>}
          status={simulating ? 'loading' : status}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

const meta: Meta<ShowcaseArgs> = {
  title: 'Floorplans/List Report',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: { control: 'radio', options: ['ready', 'loading', 'error'], description: '`status` di `ListReport`' },
    dataset: { control: 'select', options: [0, 3, 200], description: 'Righe della coda fatture: nessuna, 3 o 200' },
    searchCommitDelay: {
      control: 'select',
      options: [0, 300, 800, 'solo Invio'],
      description: '`searchCommitDelay` di `useListReport` (ms); "solo Invio" = committa solo con Invio',
    },
    firstSortDirection: {
      control: 'radio',
      options: ['asc', 'desc'],
      description: '`firstSortDirection` della colonna "Data": direzione del primo click',
    },
    containerWidth: { control: { type: 'range', min: 320, max: 1280, step: 10 }, description: 'Larghezza del contenitore (px)' },
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

const heading = (canvas: ReturnType<typeof within>) => canvas.getByRole('heading', { name: /Fatture/ });
const bodyRows = (canvas: ReturnType<typeof within>) => canvas.getAllByRole('row').slice(1);

/**
 * La coda fatture di vistato: titolo con conteggio, azioni, filtri e ricerca, e una tabella che
 * riempie lo spazio con un solo scroller. Controls: `status`, `dataset`, `searchCommitDelay`,
 * `firstSortDirection` della colonna "Data" e larghezza del contenitore; le callback compaiono in Actions.
 * La play function sceglie "Da approvare", cerca un fornitore, ordina per importo decrescente, controlla
 * le prime righe e il conteggio "n di 200", poi cerca un testo inesistente, clicca "Azzera filtri" e
 * verifica che tornino 200 righe e che il fuoco sia sul campo di ricerca.
 */
export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: with another dataset or status (picked in Controls)
    // the scenario has nothing to check.
    if (args.dataset !== 200 || args.status !== 'ready') return;
    const canvas = within(canvasElement);
    const all = makeDemoInvoices(200);
    const pending = all.filter((r) => r.status === 'pending');

    await userEvent.click(canvas.getByRole('radio', { name: 'Da approvare' }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith('pending');
    await expect(heading(canvas)).toHaveTextContent(`Fatture (${pending.length} di 200)`);

    const search = canvas.getByRole('searchbox', { name: 'Cerca' });
    await userEvent.type(search, 'Ferrari{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('Ferrari');
    const found = pending.filter((r) => r.supplier.includes('Ferrari'));
    await expect(found.length).toBeGreaterThan(2);
    await expect(heading(canvas)).toHaveTextContent(`Fatture (${found.length} di 200)`);

    await userEvent.click(canvas.getByRole('button', { name: 'Importo' }));
    await expect(args.onSortChange).toHaveBeenLastCalledWith({ columnId: 'amount', direction: 'desc' });
    const sorted = [...found].sort((a, b) => b.amount - a.amount);
    const rows = bodyRows(canvas);
    await expect(rows).toHaveLength(found.length);
    await expect(rows[0]).toHaveTextContent(sorted[0]!.number);
    await expect(rows[0]).toHaveTextContent(formatEuro(sorted[0]!.amount));
    await expect(rows[1]).toHaveTextContent(sorted[1]!.number);

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz{Enter}');
    await expect(canvas.getByText('Nessun risultato per i filtri correnti', { selector: 'p' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Azzera filtri' }));
    await waitFor(() => expect(bodyRows(canvas)).toHaveLength(200));
    await expect(heading(canvas)).toHaveTextContent('Fatture (200)');
    await expect(canvas.getByRole('radio', { name: 'Tutte' })).toBeChecked();
    await expect(search).toHaveValue('');
    await expect(search).toHaveFocus();
  },
};

/** Filtro attivo ("Da approvare"): il conteggio dice "n di 200". */
export const WithActiveFilter: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { defaultFilter: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pending = makeDemoInvoices(200).filter((r) => r.status === 'pending').length;
    await expect(canvas.getByRole('radio', { name: 'Da approvare' })).toBeChecked();
    await expect(heading(canvas)).toHaveTextContent(`Fatture (${pending} di 200)`);
    await expect(bodyRows(canvas)).toHaveLength(pending);
  },
};

/** Caricamento senza righe: scheletri nella stessa impronta, il conteggio non c'è ancora (ma lo spazio sì). */
export const Loading: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { status: 'loading', dataset: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('table', { name: 'Fatture' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton]').length).toBeGreaterThan(0);
  },
};

/** Nessun dato. */
export const Empty: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { dataset: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nessun dato', { selector: 'p' })).toBeVisible();
    await expect(heading(canvas)).toHaveTextContent('Fatture (0)');
  },
};

/** Una ricerca che non trova nulla: "Azzera filtri" funziona senza collegamenti. */
export const NoResults: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { defaultSearchQuery: 'zzz' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nessun risultato per i filtri correnti', { selector: 'p' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Azzera filtri' })).toBeVisible();
    await expect(heading(canvas)).toHaveTextContent('Fatture (0 di 200)');
  },
};

/** Errore: il corpo diventa una striscia con "Riprova" (la callback compare in Actions). */
export const ErrorState: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { status: 'error' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Impossibile caricare i dati')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Riprova' }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

/**
 * Il conteggio e' una piccola pillola che si colora per un attimo quando il numero cambia (non al
 * montaggio). Senza Controls (le callback e i Controls sono nel Playground). La play function sceglie "Da approvare" e verifica
 * che la pillola segni il cambio (`data-changed`) e poi torni a riposo, poi torna a "Tutte" e controlla lo
 * stesso ciclo. Con `prefers-reduced-motion` il tono non cambia (vedi e2e): il numero compare e basta.
 */
export const CountPill: Story = {
  parameters: NO_CONTROLS,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvasElement.querySelector('[data-rop-count]');
    if (!(pill instanceof HTMLElement)) throw new Error('count pill not found');
    await expect(pill).not.toHaveAttribute('data-changed');
    const pending = makeDemoInvoices(200).filter((r) => r.status === 'pending').length;

    await userEvent.click(canvas.getByRole('radio', { name: 'Da approvare' }));
    await expect(pill).toHaveTextContent(`(${pending} di 200)`);
    await expect(pill).toHaveAttribute('data-changed');
    await waitFor(() => expect(pill).not.toHaveAttribute('data-changed'));

    await userEvent.click(canvas.getByRole('radio', { name: 'Tutte' }));
    await expect(pill).toHaveTextContent('(200)');
    await expect(pill).toHaveAttribute('data-changed');
    await waitFor(() => expect(pill).not.toHaveAttribute('data-changed'));
  },
};

/** Fixture of the e2e suite: the showcase as it opens, without the play function (the e2e interacts on its own). */
export const NoPlay: Story = {
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

    await userEvent.type(search, 'rossi{Enter}');
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
  play: undefined,
};
