import { createRef, type Ref } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SUPPLIERS, makeDemoInvoices, type DemoInvoice } from '../internal/demo-invoices';
import { ListReport, type ListReportProps } from './ListReport';
import { rootClass } from './list-report-styles';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COLUMNS: ListReportColumn<DemoInvoice>[] = [
  { id: 'number', header: 'Numero', accessor: (r) => r.number },
  { id: 'supplier', header: 'Fornitore', accessor: (r) => r.supplier },
  { id: 'amount', header: 'Importo', accessor: (r) => r.amount, firstSortDirection: 'desc' },
];

const FILTERS: ListReportFilter<DemoInvoice>[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'pending', label: 'Da approvare', predicate: (r) => r.status === 'pending' },
];

const ROWS = makeDemoInvoices(40);

type HostProps = Partial<Omit<ListReportProps<DemoInvoice>, 'table'>> & {
  rows?: DemoInvoice[];
  withFilters?: boolean;
  defaultFilter?: string;
  searchCommitDelay?: number | null;
  reportRef?: Ref<HTMLDivElement>;
  filters?: ListReportFilter<DemoInvoice>[];
  onFilterChange?: (filter: string) => void;
};

function Host({
  rows = ROWS,
  withFilters = true,
  filters = FILTERS,
  onFilterChange,
  defaultFilter,
  searchCommitDelay = null,
  title = 'Fatture',
  reportRef,
  ...props
}: HostProps) {
  const table = useListReport<DemoInvoice>({
    rows,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: withFilters ? filters : undefined,
    onFilterChange,
    defaultFilter,
    searchCommitDelay,
  });
  return <ListReport ref={reportRef} table={table} title={title} {...props} />;
}

const heading = () => screen.getByRole('heading', { name: /Fatture/ });

describe('dataset demo', () => {
  it('is deterministic, with unique ids, and gives every scenario of the showcase some rows', () => {
    const a = makeDemoInvoices();
    expect(a).toHaveLength(200);
    expect(makeDemoInvoices()).toEqual(a);
    expect(new Set(a.map((r) => r.id)).size).toBe(200);
    expect(new Set(a.map((r) => r.status))).toEqual(new Set(['pending', 'approved', 'rejected']));
    expect(new Set(a.map((r) => r.supplier)).size).toBe(DEMO_SUPPLIERS.length);
    // the scenario of the play function: pending invoices of one supplier
    expect(a.filter((r) => r.status === 'pending' && r.supplier.includes('Ferrari')).length).toBeGreaterThan(2);
  });
});

describe('<ListReport> header', () => {
  it('shows the title with the count (n) and the actions slot', () => {
    render(<Host actions={<button type="button">Nuova</button>} />);
    expect(heading()).toHaveTextContent('Fatture (40)');
    expect(screen.getByRole('button', { name: 'Nuova' })).toBeVisible();
    expect(screen.getByRole('search')).toBeVisible();
    expect(screen.getByRole('table', { name: 'Fatture' })).toBeVisible();
  });

  it('shows (n di m) as soon as filter or search hide some rows, and (n) again when they do not', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const pending = ROWS.filter((r) => r.status === 'pending').length;
    await user.click(screen.getByRole('radio', { name: 'Da approvare' }));
    expect(heading()).toHaveTextContent(`Fatture (${pending} of 40)`);
    await user.click(screen.getByRole('radio', { name: 'Tutte' }));
    expect(heading()).toHaveTextContent('Fatture (40)');
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'Ferrari{Enter}');
    const matching = ROWS.filter((r) => r.supplier.includes('Ferrari')).length;
    expect(heading()).toHaveTextContent(`Fatture (${matching} of 40)`);
  });

  it('uses the English count "(n of m)" by default, "(0 of 40)" when nothing matches, and no "of" when n equals m', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(heading()).toHaveAccessibleName('Fatture (40)');
    expect(heading().textContent).not.toMatch(/\bof\b/);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz{Enter}');
    expect(heading()).toHaveAccessibleName('Fatture (0 of 40)');
    // the table keeps the title alone as its name, without the count
    expect(screen.getByRole('table', { name: 'Fatture' })).toBeInTheDocument();
  });

  it('shows "(0)" with an empty dataset (totalCount 0), never "(0 of 0)"', () => {
    render(<Host rows={[]} status="ready" />);
    expect(heading()).toHaveAccessibleName('Fatture (0)');
  });

  it('formats the count with labels.count', () => {
    render(<Host labels={{ count: (n, m) => `[${n}/${m}]` }} />);
    expect(heading()).toHaveTextContent('Fatture [40/40]');
  });

  it('takes the heading level from titleLevel (default 2)', () => {
    const { rerender } = render(<Host />);
    expect(screen.getByRole('heading', { level: 2 })).toBeVisible();
    rerender(<Host titleLevel={1} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });

  it('hides the count (but keeps its box) while loading without rows and on error', () => {
    const { rerender } = render(<Host rows={[]} status="loading" />);
    const count = () => within(heading()).getByText('(0)');
    expect(count()).toHaveClass('invisible');
    rerender(<Host rows={[]} status="ready" />);
    expect(count()).not.toHaveClass('invisible');
    rerender(<Host status="error" />);
    expect(within(heading()).getByText('(40)')).toHaveClass('invisible');
    rerender(<Host status="loading" />);
    expect(within(heading()).getByText('(40)')).not.toHaveClass('invisible');
  });
});

describe('<ListReport> accessible name', () => {
  it('names the table with the title through aria-labelledby, without repeating the text', () => {
    render(<Host />);
    const table = screen.getByRole('table', { name: 'Fatture' });
    const labelledby = table.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    expect(table).not.toHaveAttribute('aria-label');
    const target = document.getElementById(labelledby!)!;
    expect(heading()).toContainElement(target);
    expect(target).toHaveTextContent(/^Fatture$/);
    // the count is not part of the name
    expect(screen.queryByRole('table', { name: /\(40\)/ })).toBeNull();
  });

  it('a title with an icon (a node) names the table with its text only', () => {
    render(
      <Host
        title={
          <>
            <svg aria-hidden="true" data-testid="icon" />
            Fatture
          </>
        }
      />,
    );
    expect(screen.getByRole('table', { name: 'Fatture' })).toBeVisible();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('two reports on one page have distinct ids and each table is named by its own title', () => {
    render(
      <>
        <Host title="Fatture" />
        <Host title="Note di credito" />
      </>,
    );
    const names = screen.getAllByRole('table').map((t) => t.getAttribute('aria-labelledby'));
    expect(new Set(names).size).toBe(2);
    expect(screen.getByRole('table', { name: 'Fatture' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Note di credito' })).toBeVisible();
  });
});

describe('<ListReport> announcements', () => {
  it('has exactly one live region in its subtree (the one of the table), and the count is not in it', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);
    const live = () => container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]');
    expect(live()).toHaveLength(1);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz{Enter}');
    expect(live()).toHaveLength(1);
    // the table announces its change of state; the count in the heading is not a second announcement
    const region = live()[0] as HTMLElement;
    expect(region).toHaveTextContent('No results for the current filters');
    expect(region.textContent).not.toContain('di 40');
    expect(heading()).not.toContainElement(region);
  });
});

describe('<ListReport> clear filters', () => {
  it('"Clear filters" clears filter and search with no wiring, and the focus goes to the search box', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('radio', { name: 'Da approvare' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz{Enter}');
    expect(within(screen.getByRole('table')).getByText('No results for the current filters')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(heading()).toHaveTextContent('Fatture (40)');
    expect(screen.getByRole('radio', { name: 'Tutte' })).toBeChecked();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('without a search box the focus goes to the first pill', async () => {
    const user = userEvent.setup();
    render(<Host showSearch={false} defaultFilter="pending" rows={ROWS.filter((r) => r.status !== 'pending')} />);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('radio', { name: 'Tutte' })).toHaveFocus();
    // the default pill was what left no result: the button is not dead, the rows are back
    expect(screen.getByRole('radio', { name: 'Tutte' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    expect(heading()).toHaveTextContent(`Fatture (${ROWS.filter((r) => r.status !== 'pending').length})`);
  });

  it('goes back to the default pill (one filter change) when it has results, not to the unfiltered one', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    const rows = ROWS.filter((r) => r.status !== 'rejected');
    const filters: ListReportFilter<DemoInvoice>[] = [
      ...FILTERS,
      { id: 'rejected', label: 'Respinte', predicate: (r) => r.status === 'rejected' },
    ];
    render(<Host rows={rows} filters={filters} defaultFilter="pending" onFilterChange={onFilterChange} />);
    await user.click(screen.getByRole('radio', { name: 'Respinte' }));
    onFilterChange.mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('radio', { name: 'Da approvare' })).toBeChecked();
    expect(onFilterChange.mock.calls).toEqual([['pending']]);
  });

  it('with a search and an empty default pill: the first click clears the search, then the unfiltered pill', async () => {
    const user = userEvent.setup();
    render(<Host showSearch defaultFilter="pending" rows={ROWS.filter((r) => r.status !== 'pending')} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'Ferrari{Enter}');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    expect(screen.getByRole('radio', { name: 'Tutte' })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('the focus goes to the search box of the bar, not to an input in the actions slot', async () => {
    const user = userEvent.setup();
    render(<Host actions={<input type="search" aria-label="Altro" />} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz{Enter}');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus();
  });

  it('a custom onClearFilters replaces the default', async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(<Host onClearFilters={onClearFilters} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzz{Enter}');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    // not cleared: only the consumer's callback ran
    expect(within(screen.getByRole('table')).getByText('No results for the current filters')).toBeVisible();
  });
});

describe('<ListReport> state props', () => {
  it('passes status, errorMessage and onRetry to the table unchanged', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Host status="error" errorMessage="Server non raggiungibile" onRetry={onRetry} />);
    expect(screen.getByText('Server non raggiungibile')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('passes status="loading" and loadingRowCount (skeleton rows, aria-busy)', () => {
    const { container } = render(<Host rows={[]} status="loading" loadingRowCount={7} />);
    expect(container.querySelectorAll('[data-rop-skeleton]')).toHaveLength(7);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('passes labels to the table (and the count label does not get in the way)', () => {
    render(<Host rows={[]} labels={{ empty: 'Niente da vedere', count: () => '(x)' }} />);
    expect(screen.getByText('Niente da vedere')).toBeVisible();
  });

  it('keeps the filter and the typed search through loading -> ready', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Host />);
    await user.click(screen.getByRole('radio', { name: 'Da approvare' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'Fer');
    rerender(<Host rows={[]} status="loading" />);
    rerender(<Host />);
    expect(screen.getByRole('radio', { name: 'Da approvare' })).toBeChecked();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Fer');
  });
});

describe('<ListReport> filter bar', () => {
  it('passes filtersLabel and searchLabel to the bar', () => {
    render(<Host filtersLabel="Stato" searchLabel="Cerca fornitore" />);
    expect(screen.getByRole('radiogroup', { name: 'Stato' })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Cerca fornitore' })).toBeVisible();
  });

  it('without filters and without a search box there is no bar at all (no empty space)', () => {
    render(<Host withFilters={false} showSearch={false} />);
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.getByRole('table', { name: 'Fatture' })).toBeVisible();
  });

  it('search only: the bar has the search box and no radiogroup', () => {
    render(<Host withFilters={false} />);
    expect(screen.getByRole('searchbox')).toBeVisible();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('<ListReport> root', () => {
  it('is a flex column that fills its parent, with a zero minimum height', () => {
    const { container } = render(<Host />);
    const root = container.firstElementChild as HTMLElement;
    for (const cls of ['flex', 'flex-col', 'h-full', 'min-h-0']) expect(root).toHaveClass(cls);
    expect(rootClass).toContain('min-h-0');
    // the table container takes what is left of the column
    expect(screen.getByRole('table').parentElement).toHaveClass('flex-1', 'min-h-0');
  });

  it('className wins over the defaults, the ref is the root and HTML props land on it', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<Host reportRef={ref} className="h-96 gap-8" data-testid="report" id="r1" />);
    const root = container.firstElementChild as HTMLElement;
    expect(ref.current).toBe(root);
    expect(root).toHaveAttribute('data-testid', 'report');
    expect(root).toHaveAttribute('id', 'r1');
    expect(root).toHaveClass('h-96', 'gap-8');
    expect(root).not.toHaveClass('h-full', 'gap-3');
  });

  it('does not leak its own props onto the DOM', () => {
    const { container } = render(
      <Host
        titleLevel={3}
        actions={<span />}
        status="ready"
        errorMessage="x"
        onRetry={() => {}}
        onClearFilters={() => {}}
        loadingRowCount={3}
        labels={{ count: () => '(c)' }}
        filtersLabel="F"
        searchLabel="S"
        showSearch
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    for (const name of [
      'table',
      'title',
      'titlelevel',
      'actions',
      'status',
      'errormessage',
      'onretry',
      'onclearfilters',
      'loadingrowcount',
      'labels',
      'filterslabel',
      'searchlabel',
      'showsearch',
    ]) {
      expect(root.hasAttribute(name), name).toBe(false);
    }
    expect(root.getAttributeNames()).toEqual(['class']);
  });
});
