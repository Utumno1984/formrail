import { createRef, useState, type ComponentProps, type Ref } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReportTable } from './ListReportTable';
import { DEFAULT_LABELS } from './ListReportTableStates';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Invoice {
  id: string;
  customer: string;
  open: boolean;
}

const ROWS: Invoice[] = [
  { id: 'a', customer: 'Rossi', open: true },
  { id: 'b', customer: 'Bianchi', open: true },
  { id: 'c', customer: 'Verdi', open: false },
];

const COLUMNS: ListReportColumn<Invoice>[] = [
  { id: 'id', header: 'N.', accessor: (r) => r.id, width: 80 },
  { id: 'customer', header: 'Cliente', accessor: (r) => r.customer },
];

const FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'none', label: 'Nessuna', predicate: () => false },
];

type TableProps = Partial<Omit<ComponentProps<typeof ListReportTable<Invoice>>, 'table'>>;

function Host({
  rows = ROWS,
  filter,
  tableRef,
  ...props
}: TableProps & { rows?: Invoice[]; filter?: string; tableRef?: Ref<HTMLDivElement> }) {
  const table = useListReport<Invoice>({ rows, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, filter });
  return <ListReportTable table={table} aria-label="Fatture" ref={tableRef} {...props} />;
}

const container = (): HTMLElement => screen.getByRole('table', { name: 'Fatture' }).parentElement as HTMLElement;
// A sibling of the container, not inside the `aria-busy` element.
const liveRegion = (): HTMLElement => container().nextElementSibling as HTMLElement;
const bodyRows = (): HTMLElement[] => Array.from(container().querySelectorAll('tbody > tr'));

describe('ListReportTable loading', () => {
  it('shows loadingRowCount skeleton rows (default 5) in the same columns, aria-hidden, with aria-busy on the container', () => {
    render(<Host rows={[]} status="loading" />);
    expect(container()).toHaveAttribute('aria-busy', 'true');
    const rows = bodyRows();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row).toHaveAttribute('aria-hidden', 'true');
      expect(row.children).toHaveLength(COLUMNS.length);
    }
    // the header is still there, with its columns
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['N.', 'Cliente']);
  });

  it('honours loadingRowCount', () => {
    render(<Host rows={[]} status="loading" loadingRowCount={2} />);
    expect(bodyRows()).toHaveLength(2);
  });

  it('skeleton cells have the class of the data cells (same row height)', () => {
    const { rerender } = render(<Host rows={[]} status="loading" loadingRowCount={1} />);
    const skeletonCell = bodyRows()[0]!.children[0]!.className;
    rerender(<Host rows={[ROWS[0]!]} loadingRowCount={1} />);
    expect(bodyRows()[0]!.children[0]!.className).toBe(skeletonCell);
  });

  it('loadingRowCount={0}: no skeleton, one row of height declared, no crash', () => {
    render(<Host rows={[]} status="loading" loadingRowCount={0} />);
    const rows = bodyRows();
    expect(rows.filter((r) => r.hasAttribute('data-rop-skeleton'))).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.children[0] as HTMLElement).style.height).toContain('* 1 - 2px');
  });

  it('ignores negative, fractional and NaN counts', () => {
    const { rerender } = render(<Host rows={[]} status="loading" loadingRowCount={-3} />);
    expect(bodyRows().filter((r) => r.hasAttribute('data-rop-skeleton'))).toHaveLength(0);
    rerender(<Host rows={[]} status="loading" loadingRowCount={2.9} />);
    expect(bodyRows()).toHaveLength(2);
    rerender(<Host rows={[]} status="loading" loadingRowCount={Number.NaN} />);
    expect(bodyRows().filter((r) => r.hasAttribute('data-rop-skeleton'))).toHaveLength(0);
  });

  it('reloading with rows keeps the rows (no skeleton), aria-busy, sortable headers still work', async () => {
    render(<Host status="loading" />);
    expect(container()).toHaveAttribute('aria-busy', 'true');
    expect(bodyRows().filter((r) => r.hasAttribute('data-rop-skeleton'))).toHaveLength(0);
    expect(screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)).toHaveLength(ROWS.length);
    await userEvent.click(screen.getByRole('button', { name: 'Cliente' }));
    expect(screen.getByRole('columnheader', { name: 'Cliente' })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('has no aria-busy when ready or in error', () => {
    const { rerender } = render(<Host />);
    expect(container()).not.toHaveAttribute('aria-busy');
    rerender(<Host status="error" />);
    expect(container()).not.toHaveAttribute('aria-busy');
  });

  it('fills a body shorter than loadingRowCount with a hidden filler of the missing rows', () => {
    render(<Host />);
    const filler = bodyRows().find((r) => r.hasAttribute('data-rop-filler'))!;
    expect(filler).toHaveAttribute('aria-hidden', 'true');
    expect((filler.children[0] as HTMLElement).style.height).toContain('* 2 - 2px');
  });

  it('has no filler when the rows reach loadingRowCount', () => {
    render(<Host loadingRowCount={3} />);
    expect(bodyRows().some((r) => r.hasAttribute('data-rop-filler'))).toBe(false);
  });
});

describe('ListReportTable empty and no results', () => {
  it('empty: a single cell spanning all columns with the message and no fake rows', () => {
    render(<Host rows={[]} />);
    const rows = bodyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.children).toHaveLength(1);
    expect(rows[0]!.children[0]).toHaveAttribute('colspan', String(COLUMNS.length));
    expect(within(rows[0]!).getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('empty is not "no results": no clear-filters button even when onClearFilters is given', () => {
    render(<Host rows={[]} onClearFilters={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('no results: rows exist but none passes the filter -> its own message, not the empty one', () => {
    render(<Host filter="none" />);
    expect(screen.getByText('No results for the current filters')).toBeInTheDocument();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it('no results: no button without onClearFilters, a button that calls it with it', async () => {
    const onClearFilters = vi.fn();
    const { rerender } = render(<Host filter="none" />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    rerender(<Host filter="none" onClearFilters={onClearFilters} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(container()).toHaveFocus();
  });

  it('keeps the header and the column widths in the empty state', () => {
    render(<Host rows={[]} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(COLUMNS.length);
    expect(container().querySelectorAll('col')).toHaveLength(COLUMNS.length);
    expect(container().querySelector('col')).toHaveStyle({ width: '80px' });
  });
});

describe('ListReportTable error', () => {
  it('shows an error strip with the default message', () => {
    render(<Host status="error" />);
    const strip = within(container()).getByText('Unable to load data', { exact: false });
    expect(strip).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('replaces the rows that are present (declared behaviour)', () => {
    render(<Host status="error" errorMessage="Server non raggiungibile" />);
    expect(screen.queryByText('Rossi')).not.toBeInTheDocument();
    expect(screen.getByText('Server non raggiungibile')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(COLUMNS.length);
  });

  it('the Retry button calls onRetry once and moves the focus to the container', async () => {
    const onRetry = vi.fn();
    render(<Host status="error" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(container()).toHaveFocus();
  });

  it('the focus survives a retry that goes straight back to loading', async () => {
    function Flow() {
      const [status, setStatus] = useStatus();
      return <Host rows={[]} status={status} onRetry={() => setStatus('loading')} />;
    }
    render(<Flow />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(container()).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('the error strip does not announce on its own (the live region of the table does)', () => {
    render(<Host status="error" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

function useStatus() {
  return useState<'ready' | 'loading' | 'error'>('error');
}

describe('ListReportTable live region', () => {
  it('is mounted from the start, polite and empty (also with no announcement at the first mount in ready)', () => {
    render(<Host />);
    const region = liveRegion();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.textContent).toBe('');
    expect(container().contains(region)).toBe(false);
    expect(region.closest('table')).toBeNull();
  });

  it('is empty at first mount whatever the initial state', () => {
    for (const props of [{ status: 'loading' as const }, { status: 'error' as const }, { rows: [] }, { filter: 'none' }]) {
      render(<Host {...props} />);
      expect(liveRegion().textContent).toBe('');
      cleanup();
    }
  });

  it('announces loading, then the count when the data is back', () => {
    const { rerender } = render(<Host />);
    const region = liveRegion();
    rerender(<Host status="loading" />);
    expect(liveRegion()).toBe(region);
    expect(region.textContent).toBe(DEFAULT_LABELS.loading);
    rerender(<Host status="ready" />);
    expect(region.textContent).toBe('3 results');
  });

  it('announces the error (its message when it is text, else the default)', () => {
    const { rerender } = render(<Host />);
    rerender(<Host status="error" errorMessage="Server non raggiungibile" />);
    expect(liveRegion().textContent).toBe('Server non raggiungibile');
    rerender(<Host status="ready" />);
    rerender(<Host status="error" errorMessage={<span />} />);
    expect(liveRegion().textContent).toBe('Unable to load data');
  });

  it('announces empty and no results', () => {
    const { rerender } = render(<Host />);
    rerender(<Host rows={[]} />);
    expect(liveRegion().textContent).toBe('No data');
    rerender(<Host />);
    rerender(<Host filter="none" />);
    expect(liveRegion().textContent).toBe('No results for the current filters');
  });

  it('uses the singular for one result', () => {
    const { rerender } = render(<Host rows={[ROWS[0]!]} status="loading" />);
    rerender(<Host rows={[ROWS[0]!]} />);
    expect(liveRegion().textContent).toBe('1 result');
  });

  it('does not re-announce while the state does not change (a rerender, a new row)', () => {
    const { rerender } = render(<Host />);
    rerender(<Host status="loading" />);
    const text = liveRegion().textContent;
    rerender(<Host status="loading" className="x" />);
    expect(liveRegion().textContent).toBe(text);
  });

  it('flicker loading -> ready -> loading: the region holds the last change only', () => {
    const { rerender } = render(<Host />);
    rerender(<Host status="loading" />);
    rerender(<Host />);
    rerender(<Host status="loading" />);
    expect(liveRegion().textContent).toBe(DEFAULT_LABELS.loading);
    expect(liveRegion().children).toHaveLength(0);
  });

  it('announces a change of result count that stays inside ready, with the same text as the return from loading', () => {
    const { rerender } = render(<Host />);
    const region = liveRegion();
    expect(region.textContent).toBe('');
    rerender(<Host rows={ROWS.slice(0, 2)} />);
    expect(liveRegion()).toBe(region);
    expect(region.textContent).toBe('2 results');
    rerender(<Host rows={ROWS.slice(0, 1)} />);
    expect(region.textContent).toBe('1 result');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('announces the count after a committed search brings it down inside ready', async () => {
    const user = userEvent.setup();
    function Searchable() {
      const table = useListReport<Invoice>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS });
      return (
        <>
          <button
            onClick={() => {
              table.setSearchDraft('ross');
              table.commitSearch();
            }}
          >
            cerca
          </button>
          <ListReportTable table={table} aria-label="Fatture" />
        </>
      );
    }
    render(<Searchable />);
    await user.click(screen.getByRole('button', { name: 'cerca' }));
    expect(liveRegion().textContent).toBe('1 result');
  });

  it('a change that is both a return from loading and a new count announces once', () => {
    const { rerender } = render(<Host />);
    rerender(<Host status="loading" />);
    expect(liveRegion().textContent).toBe(DEFAULT_LABELS.loading);
    rerender(<Host rows={ROWS.slice(0, 2)} status="ready" />);
    expect(liveRegion().textContent).toBe('2 results');
    expect(liveRegion().children).toHaveLength(0);
  });

  it('a cascade of count changes in one batch announces the last value only', async () => {
    const user = userEvent.setup();
    function Burst() {
      const [rows, setRows] = useState(ROWS);
      return (
        <>
          <button
            onClick={() => {
              setRows(ROWS.slice(0, 2));
              setRows(ROWS.slice(0, 1));
              setRows(ROWS.slice(0, 2));
            }}
          >
            burst
          </button>
          <Host rows={rows} />
        </>
      );
    }
    render(<Burst />);
    const region = document.querySelector('[aria-live]') as HTMLElement;
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    await user.click(screen.getByRole('button', { name: 'burst' }));
    await Promise.resolve();
    expect(region.textContent).toBe('2 results');
    expect(seen).not.toContain('1 result');
    observer.disconnect();
  });

  it('does not announce again when the count does not change (new rows array, same size)', () => {
    const { rerender } = render(<Host />);
    rerender(<Host rows={ROWS.slice(0, 2)} />);
    const before = liveRegion().firstChild;
    rerender(<Host rows={[ROWS[1]!, ROWS[2]!]} />);
    expect(liveRegion().textContent).toBe('2 results');
    expect(liveRegion().firstChild).toBe(before);
  });

  it('uses the overridden labels, resultCount included', () => {
    const labels = { loading: 'Loading…', resultCount: (n: number) => `${n} found` };
    const { rerender } = render(<Host labels={labels} />);
    rerender(<Host labels={labels} status="loading" />);
    expect(liveRegion().textContent).toBe('Loading…');
    rerender(<Host labels={labels} />);
    expect(liveRegion().textContent).toBe('3 found');
  });
});

describe('ListReportTable labels', () => {
  it('overrides every visible text', async () => {
    const labels = { empty: 'Empty', noResults: 'Nothing matches', error: 'Failed', retry: 'Try again', clearFilters: 'Reset' };
    const { rerender } = render(<Host rows={[]} labels={labels} />);
    // inside the table: the live region (outside it) repeats the same text
    const inTable = () => within(screen.getByRole('table', { name: 'Fatture' }));
    expect(inTable().getByText('Empty')).toBeInTheDocument();
    rerender(<Host filter="none" labels={labels} onClearFilters={() => undefined} />);
    expect(inTable().getByText('Nothing matches')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    rerender(<Host status="error" labels={labels} onRetry={() => undefined} />);
    expect(inTable().getByText('Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('ListReportTable states: DOM props', () => {
  it('does not leak status, labels, onRetry, onClearFilters, loadingRowCount, errorMessage to the container', () => {
    render(
      <Host
        status="error"
        labels={{ retry: 'x' }}
        onRetry={() => undefined}
        onClearFilters={() => undefined}
        loadingRowCount={3}
        errorMessage="boom"
        data-testid="c"
      />,
    );
    const attributes = Array.from(screen.getByTestId('c').attributes).map((a) => a.name.toLowerCase());
    for (const name of ['status', 'labels', 'onretry', 'onclearfilters', 'loadingrowcount', 'errormessage']) {
      expect(attributes).not.toContain(name);
    }
  });

  it('still forwards the ref to the container', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Host tableRef={ref} status="loading" />);
    expect(ref.current).toBe(container());
  });
});
