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
 * le prime righe e il conteggio "n of 200", poi cerca un testo inesistente, clicca "Azzera filtri" e
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
    await expect(heading(canvas)).toHaveTextContent(`Fatture (${pending.length} of 200)`);

    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(search, 'Ferrari{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('Ferrari');
    const found = pending.filter((r) => r.supplier.includes('Ferrari'));
    await expect(found.length).toBeGreaterThan(2);
    await expect(heading(canvas)).toHaveTextContent(`Fatture (${found.length} of 200)`);

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

/** Filtro attivo ("Da approvare"): il conteggio dice "n of 200". */
export const WithActiveFilter: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  args: { defaultFilter: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pending = makeDemoInvoices(200).filter((r) => r.status === 'pending').length;
    await expect(canvas.getByRole('radio', { name: 'Da approvare' })).toBeChecked();
    await expect(heading(canvas)).toHaveTextContent(`Fatture (${pending} of 200)`);
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
    await expect(heading(canvas)).toHaveTextContent('Fatture (0 of 200)');
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
    await expect(pill).toHaveTextContent(`(${pending} of 200)`);
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
