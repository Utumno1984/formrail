import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListReportTable, type ListReportTableStatus } from './ListReportTable';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Invoice {
  id: string;
  number: string;
  customer: string | null;
  amount: number | null;
  open: boolean;
}

const ROWS: Invoice[] = [
  { id: 'a', number: 'INV-1', customer: 'Rossi', amount: 10, open: true },
  { id: 'b', number: 'INV-2', customer: 'Bianchi', amount: 2, open: false },
  { id: 'c', number: 'INV-3', customer: null, amount: null, open: true },
];

const COLUMNS: ListReportColumn<Invoice>[] = [
  { id: 'number', header: 'Number', width: 90, accessor: (r) => r.number },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customer },
  { id: 'amount', header: 'Amount', accessor: (r) => r.amount, align: 'end', width: '20%' },
];

const FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
  { id: 'none', label: 'None', predicate: () => false },
];

interface HostProps {
  selectable?: boolean;
  rows?: Invoice[];
  columns?: ListReportColumn<Invoice>[];
  filter?: string;
  selectedIds?: ReadonlySet<string>;
  defaultSelectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  status?: ListReportTableStatus;
  extra?: Record<string, unknown>;
}

function Host({ selectable, rows = ROWS, columns = COLUMNS, filter, status, extra, ...selection }: HostProps) {
  const table = useListReport<Invoice>({ rows, columns, getRowId: (r) => r.id, filters: FILTERS, filter, selectable, ...selection });
  return <ListReportTable table={table} aria-label="Invoices" status={status} {...extra} />;
}

const headerBox = () => screen.getByRole('checkbox', { name: 'Select all results' });
const rowBox = (label: string) => screen.getByRole('checkbox', { name: `Select ${label}` });

describe('ListReportTable without selectable', () => {
  // The DOM of every state, serialized. The snapshot was written by the code before #229 and must not
  // change: no extra <col>, no extra cell, no attribute on the rows.
  it.each<[string, HostProps]>([
    ['data', {}],
    ['loading', { rows: [], status: 'loading' }],
    ['empty', { rows: [] }],
    ['noResults', { filter: 'none' }],
    ['error', { status: 'error' }],
  ])('renders the same DOM as before the selection existed (%s)', (_, props) => {
    const { container } = render(<Host {...props} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('has no checkbox and no data-selected', () => {
    const { container } = render(<Host />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(container.querySelectorAll('col')).toHaveLength(3);
    expect(container.querySelector('[data-selected]')).toBeNull();
  });
});

describe('ListReportTable with selectable', () => {
  it('adds a leading fixed-width column, not taken from columns, counted in the min-width', () => {
    const { container } = render(<Host selectable />);
    const cols = container.querySelectorAll('col');
    expect(cols).toHaveLength(4);
    expect(cols[0]?.getAttribute('style')).toContain('width: var(--rop-list-report-row-height)');
    const table = screen.getByRole('table');
    expect(table.style.minWidth).toContain('var(--rop-list-report-row-height)');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    expect(headers[0]).toContainElement(headerBox());
    expect(headers[0]?.className).toContain('sticky');
    expect(within(table).getAllByRole('row')[1]?.querySelectorAll('td')).toHaveLength(4);
  });

  it('with every column sized, the table is as wide as its columns plus the selection column', () => {
    const sized: ListReportColumn<Invoice>[] = [
      { id: 'number', header: 'Number', width: 100, accessor: (r) => r.number },
      { id: 'amount', header: 'Amount', width: 80, accessor: (r) => r.amount },
    ];
    render(<Host selectable columns={sized} />);
    const table = screen.getByRole('table');
    expect(table.style.width).toBe('calc(180px + var(--rop-list-report-row-height))');
    expect(table.style.minWidth).toBe(table.style.width);
  });

  it('names every row checkbox distinctly and the header one "Select all results"', () => {
    render(<Host selectable />);
    const names = screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));
    expect(names).toEqual(['Select all results', 'Select INV-1', 'Select INV-2', 'Select INV-3']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('labels can be overridden', () => {
    render(<Host selectable extra={{ labels: { selectAllResults: 'All', selectRow: (l: string) => `Pick ${l}` } }} />);
    expect(screen.getByRole('checkbox', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Pick INV-2' })).toBeInTheDocument();
  });

  it('the header checkbox is tri-state over the results (DOM indeterminate) and toggles them', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host selectable onSelectedIdsChange={onChange} />);
    expect(headerBox()).not.toBeChecked();
    await user.click(rowBox('INV-1'));
    expect(rowBox('INV-1')).toBeChecked();
    expect((headerBox() as HTMLInputElement).indeterminate).toBe(true);
    expect(headerBox()).toBePartiallyChecked();
    await user.click(headerBox());
    expect(headerBox()).toBeChecked();
    expect((headerBox() as HTMLInputElement).indeterminate).toBe(false);
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    await user.click(headerBox());
    expect(screen.getAllByRole('checkbox').some((box) => (box as HTMLInputElement).checked)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('Space on a focused row checkbox toggles it; a click elsewhere in the row does nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host selectable onSelectedIdsChange={onChange} />);
    rowBox('INV-2').focus();
    await user.keyboard(' ');
    expect(rowBox('INV-2')).toBeChecked();
    await user.click(screen.getByText('Rossi'));
    expect(rowBox('INV-1')).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks a selected row with data-selected and never aria-selected', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host selectable />);
    await user.click(rowBox('INV-2'));
    const row = rowBox('INV-2').closest('tr');
    expect(row).toHaveAttribute('data-selected', '');
    expect(container.querySelectorAll('[data-selected]')).toHaveLength(1);
    expect(container.querySelector('[aria-selected]')).toBeNull();
  });

  it('follows a controlled selectedIds from outside', () => {
    const { rerender } = render(<Host selectable selectedIds={new Set(['b'])} />);
    expect(rowBox('INV-2')).toBeChecked();
    rerender(<Host selectable selectedIds={new Set(['a', 'b', 'c'])} />);
    expect(headerBox()).toBeChecked();
    rerender(<Host selectable selectedIds={new Set()} />);
    expect(headerBox()).not.toBeChecked();
    expect(rowBox('INV-2')).not.toBeChecked();
  });

  it('header state counts the current results only; disabled with no results', () => {
    const { rerender } = render(<Host selectable filter="open" selectedIds={new Set(['a', 'b'])} />);
    expect((headerBox() as HTMLInputElement).indeterminate).toBe(true);
    rerender(<Host selectable filter="open" selectedIds={new Set(['a', 'b', 'c'])} />);
    expect(headerBox()).toBeChecked();
    rerender(<Host selectable filter="none" selectedIds={new Set(['a'])} />);
    expect(headerBox()).toBeDisabled();
    expect(headerBox()).not.toBeChecked();
  });

  it('the states span one more column; the skeleton cell has no checkbox', () => {
    const { rerender, container } = render(<Host selectable rows={[]} status="loading" />);
    const skeleton = container.querySelector('tr[data-rop-skeleton]');
    expect(skeleton?.querySelectorAll('td')).toHaveLength(4);
    expect(skeleton?.querySelector('input')).toBeNull();
    expect(screen.getAllByRole('checkbox', { hidden: true })).toHaveLength(1); // only the header one
    rerender(<Host selectable rows={[]} />);
    expect(container.querySelector('tr[data-rop-state] td')).toHaveAttribute('colspan', '4');
    rerender(<Host selectable filter="none" />);
    expect(container.querySelector('tr[data-rop-state] td')).toHaveAttribute('colspan', '4');
    rerender(<Host selectable status="error" />);
    expect(container.querySelector('tr[data-rop-state] td')).toHaveAttribute('colspan', '4');
    rerender(<Host selectable rows={ROWS.slice(0, 1)} />);
    expect(container.querySelector('tr[data-rop-filler] td')).toHaveAttribute('colspan', '4');
  });

  it('selection announces nothing in the live region of the table', async () => {
    const user = userEvent.setup();
    const { container } = render(<Host selectable />);
    const live = container.querySelector('[aria-live]');
    await user.click(rowBox('INV-1'));
    await user.click(headerBox());
    expect(live?.textContent).toBe('');
  });

  it('leaks no non-DOM prop', () => {
    const { container } = render(<Host selectable />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/selectable|selectedids|bulkactions|getrowlabel/i);
  });
});
