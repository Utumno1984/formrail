import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUrlAdapter } from '../internal/memory-url-adapter';
import { ListReport, type ListReportProps } from './ListReport';
import type { ListReportColumn, ListReportFilter, ListReportSelection } from './types';
import { useListReport } from './use-list-report';
import { useListReportUrlState, type ListReportUrlAdapter } from './use-list-report-url-state';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

interface Row {
  id: string;
  number: string;
  open: boolean;
}

const ROWS: Row[] = [
  { id: 'a', number: 'INV-1', open: true },
  { id: 'b', number: 'INV-2', open: false },
  { id: 'c', number: 'INV-3', open: true },
  { id: 'd', number: 'INV-4', open: false },
];
const COLUMNS: ListReportColumn<Row>[] = [{ id: 'number', header: 'Number', accessor: (r) => r.number }];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
  { id: 'none', label: 'None', predicate: () => false },
];

type HostProps = Partial<Omit<ListReportProps<Row>, 'table'>> & {
  selectable?: boolean;
  rows?: Row[];
  defaultSelectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
};

function Host({ selectable, rows = ROWS, defaultSelectedIds, onSelectedIdsChange, ...props }: HostProps) {
  const table = useListReport<Row>({
    rows,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    filters: FILTERS,
    searchCommitDelay: null,
    selectable,
    defaultSelectedIds,
    onSelectedIdsChange,
  });
  return <ListReport table={table} title="Invoices" {...props} />;
}

const bar = () => screen.getByRole('group', { name: 'Selection Invoices' });
const headerBox = () => screen.getByRole('checkbox', { name: 'Select all results' });
const rowBox = (n: number) => screen.getByRole('checkbox', { name: `Select INV-${n}` });
const pill = (name: string) => screen.getByRole('radio', { name });
// Found by its text: while hidden it has no accessible name.
const clearSelection = () => screen.getByText('Clear selection').closest('button') as HTMLButtonElement;

describe('<ListReport> without selectable', () => {
  // Written by the code before #229: the floorplan must not change without `selectable`.
  it('renders the same DOM as before the selection existed', () => {
    const { container } = render(<Host actions={<button type="button">New</button>} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('has no selection bar and ignores bulkActions', () => {
    const bulkActions = vi.fn(() => <button type="button">Approve</button>);
    const { container } = render(<Host bulkActions={bulkActions} />);
    expect(screen.queryByRole('group', { name: /Selection/ })).toBeNull();
    expect(container.querySelector('[data-rop-selection-bar]')).toBeNull();
    expect(bulkActions).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toMatch(/bulkactions/i);
  });
});

describe('<ListReport> selection bar', () => {
  it('sits between the filter bar and the table, named after the title, pointing at the table', () => {
    const { container } = render(<Host selectable />);
    const group = bar();
    const filters = screen.getByRole('radiogroup');
    const scroller = screen.getByRole('table').parentElement as HTMLElement;
    expect(filters.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.compareDocumentPosition(scroller) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.getAttribute('aria-controls')).toBe(scroller.id);
    expect(group).not.toHaveAttribute('aria-live');
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1); // only the table's
  });

  it('says "No items selected", "n selected" and "n selected (m hidden by filters)"', async () => {
    const user = userEvent.setup();
    render(<Host selectable />);
    expect(bar()).toHaveTextContent('No items selected');
    expect(clearSelection()).not.toBeVisible();
    await user.click(rowBox(1));
    await user.click(rowBox(2));
    await user.click(rowBox(3));
    expect(bar()).toHaveTextContent('3 selected');
    expect(clearSelection()).toBeVisible();
    await user.click(pill('Open'));
    expect(bar()).toHaveTextContent('2 selected (1 hidden by filters)');
    await user.click(pill('None'));
    expect(bar()).toHaveTextContent('0 selected (3 hidden by filters)');
    expect(clearSelection()).toBeVisible(); // a selection hidden by the filters can be cleared too
  });

  it('texts come from labels', async () => {
    const user = userEvent.setup();
    render(
      <Host
        selectable
        labels={{ selectionCount: (n, m) => `${n}/${m} chosen`, clearSelection: 'Deselect', selectionBar: 'Picked' }}
      />,
    );
    await user.click(rowBox(1));
    expect(screen.getByRole('group', { name: 'Picked Invoices' })).toHaveTextContent('1/0 chosen');
    expect(screen.getByRole('button', { name: 'Deselect' })).toBeVisible();
  });

  it('bulkActions receives the selection and is rendered at 0 selected too', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const seen: ListReportSelection<Row>[] = [];
    render(
      <Host
        selectable
        bulkActions={(selection) => {
          seen.push(selection);
          return (
            <button type="button" disabled={selection.selectedResultCount === 0} onClick={() => onApprove(selection.getSelectedRows().map((r) => r.id))}>
              Approve
            </button>
          );
        }}
      />,
    );
    const approve = within(bar()).getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(seen.at(-1)?.enabled).toBe(true);
    await user.click(rowBox(1));
    await user.click(rowBox(2));
    await user.click(pill('Open'));
    expect(approve).toBeEnabled();
    await user.click(approve);
    // Only the selected rows the user can see.
    expect(onApprove).toHaveBeenCalledWith(['a']);
  });

  it('"Clear selection" empties the selection and moves the focus to the "select all results" checkbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host selectable defaultSelectedIds={new Set(['a', 'b'])} onSelectedIdsChange={onChange} />);
    await user.click(clearSelection());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(bar()).toHaveTextContent('No items selected');
    expect(rowBox(1)).not.toBeChecked();
    expect(headerBox()).toHaveFocus();
    expect(clearSelection()).not.toBeVisible();
  });

  it('with no results (disabled header checkbox) the focus goes to the table container, never the body', async () => {
    const user = userEvent.setup();
    render(<Host selectable defaultSelectedIds={new Set(['a'])} />);
    await user.click(pill('None'));
    await user.click(clearSelection());
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('table').parentElement);
  });

  it('"Clear selection" is distinct from "Clear filters" of the no-results state', async () => {
    const user = userEvent.setup();
    render(<Host selectable defaultSelectedIds={new Set(['a'])} />);
    await user.click(pill('None'));
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });
});

describe('<ListReport> two selectable instances on the same page', () => {
  function Pair() {
    return (
      <>
        <Host selectable title="Invoices" />
        <Host selectable title="Credit notes" />
      </>
    );
  }

  const barOf = (title: string) => screen.getByRole('group', { name: `Selection ${title}` });
  const regionOf = (title: string) => screen.getByRole('table', { name: title });
  const headerOf = (title: string) => within(regionOf(title)).getByRole('checkbox', { name: 'Select all results' });
  const rowOf = (title: string, n: number) => within(regionOf(title)).getByRole('checkbox', { name: `Select INV-${n}` });
  const clearOf = (title: string) => within(barOf(title)).getByText('Clear selection').closest('button') as HTMLButtonElement;

  it('exposes distinct group names, each pointing at its own table', () => {
    render(<Pair />);
    const first = barOf('Invoices');
    const second = barOf('Credit notes');
    expect(first).not.toBe(second);
    expect(first.getAttribute('aria-controls')).toBe(regionOf('Invoices').parentElement?.id);
    expect(second.getAttribute('aria-controls')).toBe(regionOf('Credit notes').parentElement?.id);
    expect(first.getAttribute('aria-controls')).not.toBe(second.getAttribute('aria-controls'));
  });

  it('keeps the selection state of each instance independent', async () => {
    const user = userEvent.setup();
    render(<Pair />);
    await user.click(rowOf('Invoices', 1));
    await user.click(rowOf('Invoices', 2));
    expect(barOf('Invoices')).toHaveTextContent('2 selected');
    expect(barOf('Credit notes')).toHaveTextContent('No items selected');
    expect(rowOf('Credit notes', 1)).not.toBeChecked();

    await user.click(headerOf('Credit notes'));
    expect(barOf('Credit notes')).toHaveTextContent('4 selected');
    await user.click(clearOf('Credit notes'));
    expect(barOf('Credit notes')).toHaveTextContent('No items selected');
    expect(barOf('Invoices')).toHaveTextContent('2 selected');
    expect(rowOf('Invoices', 1)).toBeChecked();
  });

  it('"Clear selection" moves the focus to the header checkbox of its own instance only', async () => {
    const user = userEvent.setup();
    render(<Pair />);
    await user.click(rowOf('Invoices', 1));
    await user.click(rowOf('Credit notes', 1));
    await user.click(clearOf('Invoices'));
    expect(headerOf('Invoices')).toHaveFocus();
    expect(headerOf('Credit notes')).not.toHaveFocus();

    await user.click(clearOf('Credit notes'));
    expect(headerOf('Credit notes')).toHaveFocus();
    expect(headerOf('Invoices')).not.toHaveFocus();
  });
});

describe('<ListReport> selection and URL state', () => {
  function UrlHost({ adapter }: { adapter: ListReportUrlAdapter }) {
    const url = useListReportUrlState({ filters: FILTERS, sortableColumnIds: ['number'], adapter });
    const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id, filters: FILTERS, searchCommitDelay: null, selectable: true, ...url });
    return <ListReport title="Invoices" table={table} />;
  }

  it('selecting writes nothing to the URL', async () => {
    const user = userEvent.setup();
    const write = vi.fn();
    const adapter = createMemoryUrlAdapter({ initial: '?filter=open', onWrite: write });
    render(<UrlHost adapter={adapter} />);
    await user.click(rowBox(1));
    await user.click(headerBox());
    await user.click(headerBox());
    await user.click(rowBox(3));
    await user.click(clearSelection());
    expect(write).not.toHaveBeenCalled();
    expect(adapter.read().toString()).toBe('filter=open');
  });
});
