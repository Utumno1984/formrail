import { useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../dialog/Dialog';
import { ListReportFilterBar } from './ListReportFilterBar';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

interface Invoice {
  id: string;
  customer: string;
  status: 'pending' | 'approved';
}

const INVOICES: Invoice[] = [
  { id: 'F-001', customer: 'Rossi Costruzioni', status: 'pending' },
  { id: 'F-002', customer: 'Bianchi & Associati', status: 'approved' },
  { id: 'F-003', customer: 'Rossi Forniture', status: 'approved' },
  { id: 'F-004', customer: 'Verdi Industriale', status: 'pending' },
  { id: 'F-005', customer: 'Neri Trasporti', status: 'pending' },
  { id: 'F-006', customer: 'Rossini Logistica', status: 'pending' },
  { id: 'F-007', customer: 'Gialli', status: 'approved' },
  { id: 'F-008', customer: 'Rossetti Impianti', status: 'approved' },
];

const COLUMNS: ListReportColumn<Invoice>[] = [{ id: 'customer', header: 'Cliente', accessor: (r) => r.customer }];

const FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'pending', label: 'Da approvare', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approvate', predicate: (r) => r.status === 'approved' },
];

const LONG_FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'Tutte le fatture ricevute dai fornitori nell’esercizio corrente' },
  { id: 'pending', label: 'Da approvare entro la fine del mese da parte dell’ufficio acquisti e dell’amministrazione', predicate: (r) => r.status === 'pending' },
  { id: 'approved', label: 'Approvate', predicate: (r) => r.status === 'approved' },
];

interface DemoProps {
  filters?: ListReportFilter<Invoice>[];
  showSearch?: boolean;
  defaultFilter?: string;
  defaultSearchQuery?: string;
  searchCommitDelay?: number | null;
  filtersLabel?: string;
  searchLabel?: string;
  dir?: 'ltr' | 'rtl';
  onFilterChange?: (filter: string) => void;
  onSearchQueryChange?: (query: string) => void;
  /** Rendered after the bar, inside the same hook scope. */
  withRows?: boolean;
}

/** The bar and, next to it, the raw list of the resulting rows (what the table would show). */
function Demo({ filters = FILTERS, withRows = true, dir, showSearch, filtersLabel, searchLabel, ...options }: DemoProps) {
  const table = useListReport<Invoice>({ rows: INVOICES, columns: COLUMNS, getRowId: (r) => r.id, filters, ...options });
  return (
    <div dir={dir}>
      <ListReportFilterBar table={table} showSearch={showSearch} filtersLabel={filtersLabel} searchLabel={searchLabel} />
      {withRows ? (
        <ul data-testid="rows" style={{ margin: '16px 0 0', paddingInlineStart: 20 }}>
          {table.rows.map((r) => (
            <li key={r.id}>{r.customer}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const PAGE: CSSProperties = { padding: 16, fontFamily: 'system-ui, sans-serif' };
const NO_CONTROLS = { controls: { disable: true } };

type DelayChoice = 0 | 300 | 800 | 'solo Invio';

interface PlaygroundArgs {
  searchCommitDelay: DelayChoice;
  showSearch: boolean;
  filtersLabel: string;
  searchLabel: string;
  dir: 'ltr' | 'rtl';
  onFilterChange: (filter: string) => void;
  onSearchQueryChange: (query: string) => void;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Data/ListReportFilterBar',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    searchCommitDelay: {
      control: 'select',
      options: [0, 300, 800, 'solo Invio'],
      mapping: { 0: 0, 300: 300, 800: 800, 'solo Invio': null },
      description: '`searchCommitDelay` di `useListReport` (ms); "solo Invio" = `null`: committa solo con Invio',
    },
    showSearch: { control: 'boolean' },
    filtersLabel: { control: 'text', description: 'Nome accessibile del gruppo di pillole' },
    searchLabel: { control: 'text', description: 'Nome accessibile (e segnaposto) del campo di ricerca' },
    dir: { control: 'radio', options: ['ltr', 'rtl'] },
    onFilterChange: { control: false },
    onSearchQueryChange: { control: false },
  },
  args: {
    searchCommitDelay: 300,
    showSearch: true,
    filtersLabel: 'Filters',
    searchLabel: 'Search',
    dir: 'ltr',
    onFilterChange: fn(),
    onSearchQueryChange: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

const customers = (canvas: ReturnType<typeof within>): string[] =>
  within(canvas.getByTestId('rows'))
    .queryAllByRole('listitem')
    .map((li) => li.textContent ?? '');

/**
 * Controls: `searchCommitDelay` (0 / 300 / 800 ms, or "solo Invio" = only Enter commits), `showSearch`,
 * the two accessible names and `dir`. `onFilterChange` and `onSearchQueryChange` show up in Actions.
 * The play function moves from "Tutte" to "Da approvare" with the arrow key, types "rossi" and presses
 * Enter (one `onSearchQueryChange('rossi')`, only the matching pending invoices left), then Escape
 * clears the search and the whole filter comes back.
 */
export const Playground: Story = {
  render: ({ searchCommitDelay, ...rest }) => (
    <div style={PAGE}>
      <Demo searchCommitDelay={searchCommitDelay as number | null} {...rest} />
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    // Written for the default configuration: with another label or without the search box (picked in
    // Controls or by a test) the scenario has nothing to type into.
    if (!args.showSearch || args.filtersLabel !== 'Filters' || args.searchLabel !== 'Search' || args.dir !== 'ltr') return;
    const canvas = within(canvasElement);
    canvas.getByRole('radio', { name: 'Tutte' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', { name: 'Da approvare' })).toHaveAttribute('aria-checked', 'true');
    await expect(args.onFilterChange).toHaveBeenCalledTimes(1);
    await expect(args.onFilterChange).toHaveBeenCalledWith('pending');
    await expect(customers(canvas)).toHaveLength(4);

    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await userEvent.click(search);
    await userEvent.type(search, 'rossi');
    await userEvent.keyboard('{Enter}');
    await expect(args.onSearchQueryChange).toHaveBeenCalledTimes(1);
    await expect(args.onSearchQueryChange).toHaveBeenCalledWith('rossi');
    await expect(customers(canvas)).toEqual(['Rossi Costruzioni', 'Rossini Logistica']);

    await userEvent.keyboard('{Escape}');
    await expect(search).toHaveValue('');
    await expect(search).toHaveFocus();
    await waitFor(() => expect(customers(canvas)).toHaveLength(4));
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith('');
  },
};

/** Second pill active. */
export const ActiveFilter: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo defaultFilter="approved" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Approvate' })).toHaveAttribute('aria-checked', 'true');
    await expect(customers(canvas)).toHaveLength(4);
  },
};

/** A search with text: the clear button is there. */
export const SearchWithText: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo defaultSearchQuery="rossi" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('searchbox')).toHaveValue('rossi');
    await expect(canvas.getByRole('button', { name: 'Clear search' })).toBeVisible();
    await expect(customers(canvas)).toHaveLength(3);
  },
};

/** Labels longer than the bar: the pills stay inside it and the text wraps (nothing is cut). */
export const LongLabels: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <div style={{ width: 'min(100%, 420px)' }}>
        <Demo filters={LONG_FILTERS} withRows={false} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole('radio', { name: /Da approvare entro/ });
    const bar = canvas.getByRole('search');
    await expect(pill.getBoundingClientRect().right).toBeLessThanOrEqual(bar.getBoundingClientRect().right + 1);
    const label = pill.firstElementChild as HTMLElement;
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
    // wrapped: taller than a one-line pill
    await expect(pill.getBoundingClientRect().height).toBeGreaterThan(canvas.getByRole('radio', { name: 'Approvate' }).getBoundingClientRect().height * 1.5);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
  },
};

/** No filters: only the search box (no empty radiogroup). */
export const SearchOnly: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo filters={[]} withRows={false} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('radiogroup')).toBeNull();
    await expect(canvas.getByRole('searchbox')).toBeVisible();
  },
};

/** `dir="rtl"`: Right and Left swap in the pill group; the clear button sits at the start side. */
export const Rtl: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Demo dir="rtl" defaultSearchQuery="rossi" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('radio', { name: 'Tutte' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('radio', { name: 'Da approvare' })).toHaveFocus();
  },
};

/** Fixture of the e2e suite: the search box inside a form that must not be submitted by Enter. */
export const InsideForm: Story = {
  parameters: NO_CONTROLS,
  render: () => {
    function FormDemo() {
      const [submits, setSubmits] = useState(0);
      return (
        <form
          style={PAGE}
          onSubmit={(event) => {
            event.preventDefault();
            setSubmits((n) => n + 1);
          }}
        >
          <Demo searchCommitDelay={null} />
          <output data-testid="submits">{submits}</output>
        </form>
      );
    }
    return <FormDemo />;
  },
};

/** Fixture of the e2e suite: a button outside the bar changes the controlled `searchQuery` while the user types. */
export const ExternalSearchQuery: Story = {
  parameters: NO_CONTROLS,
  render: () => {
    function ControlledDemo() {
      const [query, setQuery] = useState('');
      const table = useListReport<Invoice>({
        rows: INVOICES,
        columns: COLUMNS,
        getRowId: (r) => r.id,
        filters: FILTERS,
        searchQuery: query,
        onSearchQueryChange: setQuery,
        searchCommitDelay: null,
      });
      return (
        <div style={PAGE}>
          <ListReportFilterBar table={table} />
          <Button onClick={() => setQuery('verdi')}>Imposta “verdi”</Button>
          <output data-testid="committed">{table.searchQuery}</output>
        </div>
      );
    }
    return <ControlledDemo />;
  },
};

/** Fixture of the e2e suite: the bar in a Dialog; Escape on a non-empty search must not close it. */
export const InsideDialog: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={PAGE}>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Apri filtri</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filtra le fatture</DialogTitle>
            <DialogDescription>Cerca tra le fatture.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Demo />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  ),
};

/** Fixture of the e2e suite: the search box at the bottom of a long page, to be covered by the keyboard. */
export const KeyboardSafe: Story = {
  parameters: NO_CONTROLS,
  render: () => (
    <div style={{ ...PAGE, paddingBottom: 'var(--rop-keyboard-inset, 0px)' }} data-testid="kb-page">
      <div style={{ height: '120dvh' }}>Contenuto lungo prima della barra.</div>
      <Demo withRows={false} />
      <div style={{ height: '100dvh' }} />
    </div>
  ),
};
