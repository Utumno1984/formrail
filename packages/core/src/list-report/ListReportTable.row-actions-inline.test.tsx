import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ListReport } from './ListReport';
import { ListReportTable } from './ListReportTable';
import type { ListReportColumn, ListReportRowAction, ListReportRowActionContext, ListReportRowActions } from './types';
import { useListReport } from './use-list-report';

// jsdom lacks what Radix measures and scrolls with. The ResizeObserver records its callbacks: the
// change of form under an open menu is driven from the tests (jsdom has no layout, so no container query).
const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver = class {
    private entry: { callback: ResizeObserverCallback; targets: Element[] };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.targets.push(target);
    }
    unobserve() {}
    disconnect() {
      this.entry.targets = [];
    }
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  observers.length = 0;
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

const trash = <svg data-testid="trash" />;
const pencil = <svg data-testid="pencil" />;

type Spy = ListReportRowAction['onSelect'];

/** Duplicate (no icon), Delete (icon, danger, disabled when approved). */
function actionsFor(spies: { duplicate?: Spy; remove?: Spy } = {}): ListReportRowActions<Invoice> {
  return (row) => [
    { id: 'duplicate', label: 'Duplicate', onSelect: spies.duplicate ?? (() => {}) },
    { id: 'delete', label: 'Delete', icon: trash, tone: 'danger', disabled: row.approved, onSelect: spies.remove ?? (() => {}) },
  ];
}

interface HostProps {
  rows?: Invoice[];
  rowActions?: ListReportRowActions<Invoice>;
  rowActionsInline?: number;
  labels?: Parameters<typeof ListReportTable>[0]['labels'];
  status?: 'ready' | 'loading';
}

function Host({ rows = ROWS, rowActions = actionsFor(), rowActionsInline, labels, status }: HostProps) {
  const table = useListReport<Invoice>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
  return (
    <ListReportTable table={table} aria-label="Invoices" rowActions={rowActions} rowActionsInline={rowActionsInline} labels={labels} status={status} />
  );
}

const rowOf = (number: string) => screen.getByRole('cell', { name: number }).closest('tr') as HTMLTableRowElement;
const cellOf = (number: string) => rowOf(number).lastElementChild as HTMLTableCellElement;
const form = (number: string, which: 'wide' | 'narrow') =>
  cellOf(number).querySelector(`[data-rop-row-actions-form="${which}"]`) as HTMLElement;
const inlineButton = (number: string, label = 'Delete') => within(form(number, 'wide')).getByRole('button', { name: `${label} ${number}` });
const wideTrigger = (number: string) => within(form(number, 'wide')).queryByRole('button', { name: `Actions for ${number}` });
const narrowTrigger = (number: string) => within(form(number, 'narrow')).getByRole('button', { name: `Actions for ${number}` });

describe('ListReportTable rowActionsInline — default and invalid values', () => {
  it('absent or 0: the DOM of the menu-only cell, unchanged (no forms, no container, no width variable)', () => {
    const { container, rerender } = render(<Host />);
    const before = container.innerHTML;
    rerender(<Host rowActionsInline={0} />);
    expect(container.innerHTML).toBe(before);
    expect(container.querySelector('[data-rop-row-actions-form]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/@container|row-actions-width|row-actions-inline/);
    expect((container.querySelector('colgroup > col:last-child') as HTMLElement).style.width).toBe('var(--rop-list-report-row-height)');
  });

  it('without rowActions it does nothing (no container, no column)', () => {
    function NoActions() {
      const table = useListReport<Invoice>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
      return <ListReportTable table={table} aria-label="Invoices" rowActionsInline={2} />;
    }
    const { container } = render(<NoActions />);
    expect(container.querySelectorAll('colgroup > col')).toHaveLength(COLUMNS.length);
    expect(container.innerHTML).not.toMatch(/@container|row-actions/);
  });

  it.each([
    [-1, 0],
    [1.7, 1],
    [Number.NaN, 0],
  ])('%s: reported in development, used as %s', (value, used) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<Host rowActionsInline={value} />);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('rowActionsInline must be a whole number'));
    expect(container.querySelectorAll('[data-rop-row-actions-form="wide"]').length).toBe(used > 0 ? ROWS.length : 0);
    if (used > 0) expect(screen.getByRole('table').style.getPropertyValue('--rop-list-report-row-actions-inline')).toBe(String(used));
  });

  it('menu only: a press on a trigger takes the focus, so the menu gives it back to that trigger, not to the control focused before', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const first = screen.getByRole('button', { name: 'Actions for FT-2026-0001' });
    const third = screen.getByRole('button', { name: 'Actions for FT-2026-0003' });
    first.focus();
    await user.click(third);
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(third).toHaveFocus());
  });

  it.each([0, 1, 3])('a valid value (%s) reports nothing', (value) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Host rowActionsInline={value} />);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('ListReportTable rowActionsInline — two forms from the same descriptors', () => {
  it('wide form: the first action with an icon inline, the rest in a menu; narrow form: every action in the menu', async () => {
    const user = userEvent.setup();
    render(<Host rowActionsInline={1} />);
    for (const row of ROWS) {
      const wide = form(row.number, 'wide');
      const narrow = form(row.number, 'narrow');
      // Wide: Delete inline (before the trigger's slot), Duplicate (no icon) in the menu.
      const buttons = within(wide).getAllByRole('button');
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([`Delete ${row.number}`, `Actions for ${row.number}`]);
      expect(within(narrow).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([`Actions for ${row.number}`]);
    }
    await user.click(wideTrigger('FT-2026-0001')!);
    const wideMenu = await screen.findByRole('menu');
    expect(within(wideMenu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Duplicate']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await user.click(narrowTrigger('FT-2026-0001'));
    const narrowMenu = await screen.findByRole('menu');
    expect(within(narrowMenu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Duplicate', 'Delete']);
  });

  it('the inline button: ghost icon-sm, danger tone, the icon decorative, named by labels.rowAction', () => {
    render(<Host rowActionsInline={1} labels={{ rowAction: (action, row) => `${action} invoice ${row}` }} />);
    const button = within(form('FT-2026-0001', 'wide')).getByRole('button', { name: 'Delete invoice FT-2026-0001' });
    expect(button.className).toContain('size-8');
    expect(button.className).toContain('text-rop-error');
    const icon = within(button).getByTestId('trash');
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true');
    // No tooltip at mount.
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('a default-tone action inline has no danger colour', () => {
    const rowActions: ListReportRowActions<Invoice> = () => [{ id: 'edit', label: 'Edit', icon: pencil, onSelect: () => {} }];
    render(<Host rowActions={rowActions} rowActionsInline={1} />);
    expect(inlineButton('FT-2026-0001', 'Edit').className).not.toContain('text-rop-error');
  });

  it('inline click and menu item: onSelect once each, for the same row, with the control used as returnFocusRef', async () => {
    const user = userEvent.setup();
    const remove = vi.fn<(ctx: ListReportRowActionContext) => void>();
    render(<Host rowActions={actionsFor({ remove })} rowActionsInline={1} />);
    await user.click(inlineButton('FT-2026-0003'));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]![0].returnFocusRef.current).toBe(inlineButton('FT-2026-0003'));

    await user.click(narrowTrigger('FT-2026-0003'));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[1]![0].returnFocusRef.current).toBe(narrowTrigger('FT-2026-0003'));
    // The inline button had the focus before the press on the trigger: it is the trigger that gets it back.
    await waitFor(() => expect(narrowTrigger('FT-2026-0003')).toHaveFocus());
  });

  it('Enter and Space on the inline button call onSelect once each', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(<Host rowActions={actionsFor({ remove })} rowActionsInline={1} />);
    inlineButton('FT-2026-0001').focus();
    await user.keyboard('{Enter}');
    expect(remove).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('the wide menu passes its own trigger as returnFocusRef', async () => {
    const user = userEvent.setup();
    const duplicate = vi.fn<(ctx: ListReportRowActionContext) => void>();
    render(<Host rowActions={actionsFor({ duplicate })} rowActionsInline={1} />);
    await user.click(wideTrigger('FT-2026-0001')!);
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(duplicate.mock.calls[0]![0].returnFocusRef.current).toBe(wideTrigger('FT-2026-0001'));
  });

  it('disabled: the inline button is aria-disabled (still focusable), click/Enter/Space do nothing; the menu item is disabled', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(<Host rowActions={actionsFor({ remove })} rowActionsInline={1} />);
    const button = inlineButton('FT-2026-0002');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await user.click(button);
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(remove).not.toHaveBeenCalled();

    await user.click(narrowTrigger('FT-2026-0002'));
    const item = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('data-disabled');
    await user.click(item);
    item.focus();
    await user.keyboard('{Enter}');
    expect(remove).not.toHaveBeenCalled();
  });

  it('a new rowActions (disabled, label, onSelect) is reflected in both forms at the next render', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const make =
      (label: string, disabled: boolean, onSelect: Spy): ListReportRowActions<Invoice> =>
      () => [{ id: 'delete', label, icon: trash, disabled, onSelect }];
    const { rerender } = render(<Host rowActions={make('Delete', true, first)} rowActionsInline={1} />);
    expect(inlineButton('FT-2026-0001')).toHaveAttribute('aria-disabled', 'true');

    rerender(<Host rowActions={make('Remove', false, second)} rowActionsInline={1} />);
    const button = inlineButton('FT-2026-0001', 'Remove');
    expect(button).not.toHaveAttribute('aria-disabled');
    await user.click(button);
    expect(second).toHaveBeenCalledTimes(1);
    await user.click(narrowTrigger('FT-2026-0001'));
    const item = await screen.findByRole('menuitem', { name: 'Remove' });
    expect(item).not.toHaveAttribute('aria-disabled');
    await user.click(item);
    expect(second).toHaveBeenCalledTimes(2);
    expect(first).not.toHaveBeenCalled();
  });

  it('an inline action enabled while it has the focus stays focused (same node) and becomes activatable', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    const make =
      (disabled: boolean): ListReportRowActions<Invoice> =>
      () => [{ id: 'delete', label: 'Delete', icon: trash, disabled, onSelect: remove }];
    const { rerender } = render(<Host rowActions={make(true)} rowActionsInline={1} />);
    const button = inlineButton('FT-2026-0001');
    button.focus();
    rerender(<Host rowActions={make(false)} rowActionsInline={1} />);
    expect(inlineButton('FT-2026-0001')).toBe(button);
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('actions without an icon stay in the menu even with room for them', () => {
    const rowActions: ListReportRowActions<Invoice> = () => [
      { id: 'a', label: 'Approve', onSelect: () => {} },
      { id: 'b', label: 'Reject', onSelect: () => {} },
    ];
    render(<Host rowActions={rowActions} rowActionsInline={2} />);
    expect(within(form('FT-2026-0001', 'wide')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Actions for FT-2026-0001',
    ]);
  });

  it('every action inline: no trigger in the wide form (its slot stays), the narrow form keeps its trigger', () => {
    const rowActions: ListReportRowActions<Invoice> = () => [
      { id: 'edit', label: 'Edit', icon: pencil, onSelect: () => {} },
      { id: 'delete', label: 'Delete', icon: trash, onSelect: () => {} },
    ];
    render(<Host rowActions={rowActions} rowActionsInline={2} />);
    const wide = form('FT-2026-0001', 'wide');
    expect(within(wide).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Edit FT-2026-0001', 'Delete FT-2026-0001']);
    expect(wideTrigger('FT-2026-0001')).toBeNull();
    // The last child is the trigger's slot, empty.
    expect(wide.lastElementChild).toBeEmptyDOMElement();
    expect(narrowTrigger('FT-2026-0001')).toBeInTheDocument();
  });

  it('more slots than actions with an icon: the extra ones stay empty, no error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Host rowActionsInline={3} />);
    expect(within(form('FT-2026-0001', 'wide')).getAllByRole('button')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('the inline actions are the first n with an icon, in their order; the others keep theirs in the menu', async () => {
    const user = userEvent.setup();
    const rowActions: ListReportRowActions<Invoice> = () => [
      { id: 'dup', label: 'Duplicate', onSelect: () => {} },
      { id: 'edit', label: 'Edit', icon: pencil, onSelect: () => {} },
      { id: 'archive', label: 'Archive', onSelect: () => {} },
      { id: 'delete', label: 'Delete', icon: trash, onSelect: () => {} },
    ];
    render(<Host rowActions={rowActions} rowActionsInline={1} />);
    expect(within(form('FT-2026-0001', 'wide')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Edit FT-2026-0001',
      'Actions for FT-2026-0001',
    ]);
    await user.click(wideTrigger('FT-2026-0001')!);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Duplicate', 'Archive', 'Delete']);
  });

  it('a row with no actions: both forms empty, the cell keeps its place', () => {
    render(<Host rowActions={(r) => (r.id === 'b' ? [] : actionsFor()(r))} rowActionsInline={1} />);
    expect(within(cellOf('FT-2026-0002')).queryAllByRole('button')).toHaveLength(0);
    expect(form('FT-2026-0002', 'wide')).toBeInTheDocument();
    expect(form('FT-2026-0002', 'narrow')).toBeEmptyDOMElement();
  });
});

describe('ListReportTable rowActionsInline — width of the column', () => {
  it('the <col> and the minimum width read the width variable; the table sets the count, the container is a size container', () => {
    const { container } = render(<Host rowActionsInline={2} />);
    const table = screen.getByRole('table');
    expect((container.querySelector('colgroup > col:last-child') as HTMLElement).style.width).toBe('var(--rop-list-report-row-actions-width)');
    expect(table.style.minWidth).toBe('calc(240px + var(--rop-list-report-row-actions-width))');
    expect(table.style.getPropertyValue('--rop-list-report-row-actions-inline')).toBe('2');
    expect(table.className).toContain('[--rop-list-report-row-actions-width:var(--rop-list-report-row-height)]');
    expect(table.className).toContain('@min-[40rem]:[--rop-list-report-row-actions-width:');
    expect(table.parentElement!.className.split(' ')).toContain('@container');
  });

  // The same `rowActions` function across renders: only the prop under test can re-render the rows.
  const stable = actionsFor();

  it('a change of rowActionsInline re-renders the memoized rows', () => {
    const { rerender } = render(<Host rowActions={stable} rowActionsInline={1} />);
    expect(within(form('FT-2026-0001', 'wide')).getAllByRole('button')).toHaveLength(2);
    rerender(<Host rowActions={stable} rowActionsInline={0} />);
    expect(cellOf('FT-2026-0001').querySelector('[data-rop-row-actions-form]')).toBeNull();
    rerender(<Host rowActions={stable} rowActionsInline={1} />);
    expect(form('FT-2026-0001', 'wide')).toBeInTheDocument();
  });

  it('a change of labels.rowAction re-renders the memoized rows', () => {
    const { rerender } = render(<Host rowActions={stable} rowActionsInline={1} labels={{ rowAction: (a, r) => `${a} ${r}` }} />);
    rerender(<Host rowActions={stable} rowActionsInline={1} labels={{ rowAction: (a, r) => `${a} invoice ${r}` }} />);
    expect(within(form('FT-2026-0001', 'wide')).getByRole('button', { name: 'Delete invoice FT-2026-0001' })).toBeInTheDocument();
  });

  it('loading without rows: the skeleton keeps the column (no fake controls)', () => {
    const { container } = render(<Host rows={[]} status="loading" rowActionsInline={1} />);
    const skeleton = container.querySelector('tbody tr[data-rop-skeleton]') as HTMLTableRowElement;
    expect(skeleton.cells).toHaveLength(COLUMNS.length + 1);
    expect(within(container.querySelector('tbody') as HTMLElement).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('ListReportTable rowActionsInline — the form changes under an open menu', () => {
  // jsdom has no layout: "displayed" is what `checkVisibility` says, stubbed per element.
  function setDisplayed(displayed: (el: Element) => boolean) {
    vi.spyOn(Element.prototype, 'checkVisibility').mockImplementation(function (this: Element) {
      return displayed(this);
    });
  }
  const observerOf = (el: Element) => observers.find((o) => o.targets.includes(el));
  const fire = (el: Element) => act(() => observerOf(el)!.callback([], {} as ResizeObserver));

  it('narrow → wide: the menu closes without running anything, the focus goes to the first inline button of the row', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    const duplicate = vi.fn();
    Element.prototype.checkVisibility ??= () => true;
    render(<Host rowActions={actionsFor({ remove, duplicate })} rowActionsInline={1} />);
    const narrow = narrowTrigger('FT-2026-0001');
    // No observer while every menu is closed.
    expect(observerOf(narrow)).toBeUndefined();
    await user.click(narrow);
    await screen.findByRole('menu');
    expect(observerOf(narrow)).toBeDefined();
    // The container becomes wide: the narrow form is hidden.
    setDisplayed((el) => !el.closest('[data-rop-row-actions-form="narrow"]'));
    fire(narrow);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(inlineButton('FT-2026-0001')).toHaveFocus();
    // Still there a frame later (the menu's own return of the focus left it alone).
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    expect(inlineButton('FT-2026-0001')).toHaveFocus();
    expect(remove).not.toHaveBeenCalled();
    expect(duplicate).not.toHaveBeenCalled();
    // Closed: no observer left.
    expect(observerOf(narrow)).toBeUndefined();
  });

  it('wide → narrow: the focus goes to the narrow trigger of the row', async () => {
    const user = userEvent.setup();
    Element.prototype.checkVisibility ??= () => true;
    render(<Host rowActionsInline={1} />);
    const wide = wideTrigger('FT-2026-0003')!;
    await user.click(wide);
    await screen.findByRole('menu');
    setDisplayed((el) => !el.closest('[data-rop-row-actions-form="wide"]'));
    fire(wide);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(narrowTrigger('FT-2026-0003')).toHaveFocus();
  });

  it('a resize that keeps the form changes nothing', async () => {
    const user = userEvent.setup();
    Element.prototype.checkVisibility ??= () => true;
    render(<Host rowActionsInline={1} />);
    const narrow = narrowTrigger('FT-2026-0001');
    await user.click(narrow);
    await screen.findByRole('menu');
    setDisplayed(() => true);
    fire(narrow);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('returnFocusRef follows the visible form when the used control is hidden by then', async () => {
    const user = userEvent.setup();
    Element.prototype.checkVisibility ??= () => true;
    const remove = vi.fn<(ctx: ListReportRowActionContext) => void>();
    render(<Host rowActions={actionsFor({ remove })} rowActionsInline={1} />);
    await user.click(inlineButton('FT-2026-0001'));
    const ref = remove.mock.calls[0]![0].returnFocusRef;
    expect(ref.current).toBe(inlineButton('FT-2026-0001'));
    setDisplayed((el) => !el.closest('[data-rop-row-actions-form="wide"]'));
    expect(ref.current).toBe(narrowTrigger('FT-2026-0001'));
  });

  it('the row deleted by its inline action: returnFocusRef is the table container', async () => {
    const user = userEvent.setup();
    let ctx: ListReportRowActionContext | undefined;
    function Deleting() {
      const [rows, setRows] = useStateRows();
      const table = useListReport<Invoice>({ rows, columns: COLUMNS, getRowId: (r) => r.id });
      return (
        <ListReportTable
          table={table}
          aria-label="Invoices"
          rowActionsInline={1}
          rowActions={(row) => [
            {
              id: 'delete',
              label: 'Delete',
              icon: trash,
              onSelect: (c) => {
                ctx = c;
                setRows((current) => current.filter((r) => r.id !== row.id));
              },
            },
          ]}
        />
      );
    }
    render(<Deleting />);
    await user.click(inlineButton('FT-2026-0002'));
    expect(screen.queryByRole('cell', { name: 'FT-2026-0002' })).toBeNull();
    expect(ctx!.returnFocusRef.current).toBe(screen.getByRole('table').parentElement);
    // The focus, lost with the button, goes to the container.
    await waitFor(() => expect(screen.getByRole('table').parentElement).toHaveFocus());
  });
});

function useStateRows(): [Invoice[], Dispatch<SetStateAction<Invoice[]>>] {
  return useState<Invoice[]>(ROWS);
}

describe('ListReportTable rowActionsInline — SSR and floorplan', () => {
  it('renderToString renders both forms; hydration reports nothing', async () => {
    const html = renderToString(<Host rowActionsInline={1} />);
    expect(html).toContain('data-rop-row-actions-form="wide"');
    expect(html).toContain('data-rop-row-actions-form="narrow"');
    expect(html).toContain('aria-label="Delete FT-2026-0001"');
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(el, <Host rowActionsInline={1} />, { onRecoverableError: (e) => console.error(e) });
    });
    expect(error).not.toHaveBeenCalled();
    act(() => root!.unmount());
    el.remove();
  });

  it('ListReport passes rowActionsInline to its table', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    function Report() {
      const table = useListReport<Invoice>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
      return <ListReport title="Invoices" table={table} rowActions={actionsFor({ remove })} rowActionsInline={1} />;
    }
    render(<Report />);
    await user.click(inlineButton('FT-2026-0001'));
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
