import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import { ListReportTable, type ListReportTableStatus } from './ListReportTable';
import type { ListReportColumn, ListReportFilter, ListReportRowAction, ListReportRowActionContext, ListReportRowActions } from './types';
import { useListReport } from './use-list-report';

// jsdom lacks what Radix measures and scrolls with.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Invoice {
  id: string;
  number: string;
  customer: string;
  approved: boolean;
}

const ROWS: Invoice[] = [
  { id: 'a', number: 'FT-2026-0001', customer: 'Rossi', approved: false },
  { id: 'b', number: 'FT-2026-0002', customer: 'Bianchi', approved: true },
  { id: 'c', number: 'FT-2026-0003', customer: 'Verdi', approved: false },
];

const COLUMNS: ListReportColumn<Invoice>[] = [
  { id: 'number', header: 'Number', width: 120, accessor: (r) => r.number },
  { id: 'customer', header: 'Customer', accessor: (r) => r.customer },
];

const FILTERS: ListReportFilter<Invoice>[] = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'None', predicate: () => false },
];

interface HostProps {
  rows?: Invoice[];
  rowActions?: ListReportRowActions<Invoice>;
  selectable?: boolean;
  getRowLabel?: (row: Invoice) => string;
  status?: ListReportTableStatus;
  filter?: string;
  labels?: Parameters<typeof ListReportTable>[0]['labels'];
}

function Host({ rows = ROWS, rowActions, selectable, getRowLabel, status, filter, labels }: HostProps) {
  const table = useListReport<Invoice>({ rows, columns: COLUMNS, getRowId: (r) => r.id, selectable, getRowLabel, filters: FILTERS, filter });
  return <ListReportTable table={table} aria-label="Invoices" rowActions={rowActions} status={status} labels={labels} />;
}

const trigger = (label: string) => screen.getByRole('button', { name: `Actions for ${label}`, hidden: true });
const rowOf = (label: string) => screen.getByRole('cell', { name: label }).closest('tr') as HTMLTableRowElement;

function actionsFor(spies: { duplicate?: ListReportRowAction['onSelect']; remove?: ListReportRowAction['onSelect'] } = {}) {
  return (row: Invoice): readonly ListReportRowAction[] => [
    { id: 'duplicate', label: 'Duplicate', onSelect: spies.duplicate ?? (() => {}) },
    { id: 'delete', label: 'Delete', tone: 'danger', disabled: row.approved, onSelect: spies.remove ?? (() => {}) },
  ];
}

describe('ListReportTable rowActions — structure', () => {
  it('adds one trailing column: <col>, a named <th>, one cell per row', () => {
    const { container } = render(<Host rowActions={actionsFor()} />);
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('colgroup > col')).toHaveLength(COLUMNS.length + 1);
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(COLUMNS.length + 1);
    expect(headers.at(-1)).toHaveAccessibleName('Actions');
    const dataRows = container.querySelectorAll('tbody tr:not([data-rop-filler])');
    expect(dataRows).toHaveLength(ROWS.length);
    for (const tr of dataRows) expect(tr.children).toHaveLength(COLUMNS.length + 1);
    // The filler under the rows spans the column too.
    expect((container.querySelector('tbody tr[data-rop-filler] td') as HTMLTableCellElement).colSpan).toBe(COLUMNS.length + 1);
  });

  it('names the header column through labels.rowActionsColumn and the trigger through labels.rowActions', () => {
    render(<Host rowActions={actionsFor()} labels={{ rowActionsColumn: 'Azioni', rowActions: (l) => `Azioni per ${l}` }} />);
    expect(screen.getAllByRole('columnheader').at(-1)).toHaveAccessibleName('Azioni');
    expect(screen.getByRole('button', { name: 'Azioni per FT-2026-0001' })).toBeInTheDocument();
  });

  it('every row with actions has a trigger named from the resolved row label, without selectable', () => {
    render(<Host rowActions={actionsFor()} />);
    for (const row of ROWS) expect(trigger(row.number)).toBeInTheDocument();
    expect(new Set(screen.getAllByRole('button', { name: /^Actions for / }).map((b) => b.getAttribute('aria-label'))).size).toBe(ROWS.length);
  });

  it('uses a custom getRowLabel', () => {
    render(<Host rowActions={actionsFor()} getRowLabel={(r) => `invoice ${r.customer}`} />);
    expect(trigger('invoice Rossi')).toBeInTheDocument();
  });

  it('works next to the selection column (leading checkbox, trailing actions)', () => {
    render(<Host selectable rowActions={actionsFor()} />);
    const cells = rowOf('FT-2026-0001').children;
    expect(cells).toHaveLength(COLUMNS.length + 2);
    expect(within(cells[0] as HTMLElement).getByRole('checkbox')).toBeInTheDocument();
    expect(within(cells[cells.length - 1] as HTMLElement).getByRole('button', { name: 'Actions for FT-2026-0001' })).toBeInTheDocument();
  });

  it('a row whose actions are [] has an empty cell; with every row empty the column stays', () => {
    const { container, rerender } = render(<Host rowActions={(r) => (r.id === 'b' ? [] : actionsFor()(r))} />);
    const cell = rowOf('FT-2026-0002').lastElementChild as HTMLElement;
    expect(cell.tagName).toBe('TD');
    expect(cell).toBeEmptyDOMElement();
    expect(cell.className).toBe((rowOf('FT-2026-0001').lastElementChild as HTMLElement).className);
    rerender(<Host rowActions={() => []} />);
    expect(screen.queryAllByRole('button', { name: /^Actions for / })).toHaveLength(0);
    expect(container.querySelectorAll('colgroup > col')).toHaveLength(COLUMNS.length + 1);
    expect(screen.getAllByRole('columnheader')).toHaveLength(COLUMNS.length + 1);
  });

  it.each([
    ['loading (skeleton)', { rows: [], status: 'loading' as const }, '[data-rop-skeleton]'],
    ['empty', { rows: [] }, '[data-rop-state]'],
    ['no results', { filter: 'none' }, '[data-rop-state]'],
    ['error', { status: 'error' as const }, '[data-rop-state]'],
  ])('%s: the body spans the actions column too', (_name, props, selector) => {
    const { container } = render(<Host rowActions={actionsFor()} {...props} />);
    const row = container.querySelector(`tbody tr${selector}`) as HTMLTableRowElement;
    const span = [...row.cells].reduce((sum, cell) => sum + cell.colSpan, 0);
    expect(span).toBe(COLUMNS.length + 1);
    expect(screen.queryAllByRole('button', { name: /^Actions for / })).toHaveLength(0);
  });

  it('counts the column in the minimum width of the table', () => {
    const { rerender } = render(<Host />);
    const before = screen.getByRole('table').style.minWidth;
    rerender(<Host rowActions={actionsFor()} />);
    expect(before).toBe('240px');
    expect(screen.getByRole('table').style.minWidth).toBe('calc(240px + var(--rop-list-report-row-height))');
  });

  it('leaks no non-DOM prop (rowActions, labels) as an attribute', () => {
    const { container } = render(<Host selectable rowActions={actionsFor()} />);
    expect(container.innerHTML).not.toMatch(/rowactions|returnfocusref|onselect/i);
  });
});

describe('ListReportTable rowActions — menu', () => {
  it('click on the trigger, then on an item: onSelect once with the row trigger as returnFocusRef; the focus returns to it', async () => {
    const user = userEvent.setup();
    const duplicate = vi.fn<(ctx: ListReportRowActionContext) => void>();
    render(<Host rowActions={actionsFor({ duplicate })} />);
    await user.click(trigger('FT-2026-0003'));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(duplicate.mock.calls[0]![0].returnFocusRef.current).toBe(trigger('FT-2026-0003'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger('FT-2026-0003')).toHaveFocus());
  });

  it('a fast double click on an item calls onSelect once', async () => {
    const user = userEvent.setup();
    const duplicate = vi.fn();
    render(<Host rowActions={actionsFor({ duplicate })} />);
    await user.click(trigger('FT-2026-0001'));
    await user.dblClick(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it('a disabled action: aria-disabled, never selectable by pointer or keyboard', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(<Host rowActions={actionsFor({ remove })} />);
    trigger('FT-2026-0002').focus();
    await user.keyboard('{Enter}');
    const item = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    // The arrows skip it (the menu wraps back to the only enabled item).
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus();
    await user.click(item);
    item.focus();
    await user.keyboard('{Enter}');
    expect(remove).not.toHaveBeenCalled();
  });

  it('tone and icon come from the descriptor', async () => {
    const user = userEvent.setup();
    const rowActions = (): readonly ListReportRowAction[] => [
      { id: 'dup', label: 'Duplicate', icon: <svg data-testid="dup-icon" />, onSelect: () => {} },
      { id: 'del', label: 'Delete', tone: 'danger', onSelect: () => {} },
    ];
    render(<Host rowActions={rowActions} />);
    await user.click(trigger('FT-2026-0001'));
    const dup = await screen.findByRole('menuitem', { name: 'Duplicate' });
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(del).toHaveAttribute('data-tone', 'danger');
    expect(dup).not.toHaveAttribute('data-tone');
    expect(within(dup).getByTestId('dup-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(dup.firstElementChild).toBe(within(dup).getByTestId('dup-icon').parentElement);
  });

  it('Escape closes the menu and returns the focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Host rowActions={actionsFor()} />);
    trigger('FT-2026-0001').focus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitem', { name: 'Duplicate' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger('FT-2026-0001')).toHaveFocus());
  });

  it('a duplicate action id is reported with console.error, without crashing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Host
        rowActions={() => [
          { id: 'x', label: 'One', onSelect: () => {} },
          { id: 'x', label: 'Two', onSelect: () => {} },
        ]}
      />,
    );
    expect(trigger('FT-2026-0001')).toBeInTheDocument();
    expect(error.mock.calls.some((args) => String(args[0]).includes('duplicate action id "x"'))).toBe(true);
  });

  it('the row removed while its menu is open: the menu closes, the focus goes to the table container', async () => {
    const user = userEvent.setup();
    let setRows: (rows: Invoice[]) => void = () => {};
    function Removable() {
      const [rows, set] = useState(ROWS);
      setRows = set;
      return <Host rows={rows} rowActions={actionsFor()} />;
    }
    const { container } = render(<Removable />);
    await user.click(trigger('FT-2026-0002'));
    await screen.findByRole('menu');
    act(() => setRows(ROWS.filter((r) => r.id !== 'b')));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    const scroller = container.querySelector('table')!.parentElement!;
    await waitFor(() => expect(scroller).toHaveFocus());
  });
});

describe('ListReportTable rowActions — memoization', () => {
  it('a stable rowActions is not called again on a parent render; a new one updates every row', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    let rerender: () => void = () => {};
    let lockAll: (lock: boolean) => void = () => {};
    function Memo() {
      const [, setTick] = useState(0);
      const [locked, setLocked] = useState(false);
      rerender = () => setTick((t) => t + 1);
      lockAll = setLocked;
      const rowActions = useCallback(
        (row: Invoice): readonly ListReportRowAction[] => {
          calls.push(row.id);
          return [{ id: 'dup', label: 'Duplicate', disabled: locked, onSelect: () => {} }];
        },
        [locked],
      );
      return <Host rowActions={rowActions} />;
    }
    render(<Memo />);
    calls.length = 0;
    act(() => rerender());
    expect(calls).toEqual([]);
    act(() => lockAll(true));
    expect([...calls].sort()).toEqual(['a', 'b', 'c']);
    await user.click(trigger('FT-2026-0003'));
    expect(await screen.findByRole('menuitem', { name: 'Duplicate' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('ListReport rowActions', () => {
  function Report({ rowActions }: { rowActions?: ListReportRowActions<Invoice> }) {
    const table = useListReport<Invoice>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
    return <ListReport title="Invoices" table={table} rowActions={rowActions} />;
  }

  it('passes rowActions to its table and never to the DOM', async () => {
    const user = userEvent.setup();
    const duplicate = vi.fn();
    const { container } = render(<Report rowActions={actionsFor({ duplicate })} />);
    expect(screen.getAllByRole('columnheader').at(-1)).toHaveAccessibleName('Actions');
    await user.click(trigger('FT-2026-0001'));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect((container.firstElementChild as HTMLElement).getAttributeNames()).toEqual(['class']);
    expect(container.innerHTML).not.toMatch(/rowactions/i);
  });
});
