import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCrud, type InvoiceCrudProps } from './InvoiceCrud';
import type { InvoiceStore } from './invoice-store';

// #366: bulk delete of the selected rows from the list (optimistic, atomic rollback).

beforeEach(() => {
  // jsdom lacks what Radix measures and scrolls with.
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/?filter=all');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const base = (over: Partial<InvoiceCrudProps> = {}): InvoiceCrudProps => ({
  history: 'replace',
  listLoadDelayMs: 0,
  recordLoadDelayMs: 0,
  saveDelayMs: 0,
  today: '2026-11-09',
  onNavigate: vi.fn(),
  ...over,
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const store = (): InvoiceStore => {
  const s = window.__ropShowcaseStore;
  if (!s) throw new Error('no store');
  return s;
};

const shownNumbers = (): string[] =>
  screen.queryAllByRole('button', { name: /^Actions for / }).map((b) => b.getAttribute('aria-label')!.slice('Actions for '.length));

async function listReady(): Promise<string[]> {
  await waitFor(() => expect(shownNumbers().length).toBeGreaterThan(5));
  return shownNumbers();
}

const idOf = (number: string): string => store().snapshot().find((r) => r.number === number)!.id;
const counter = (): string => document.querySelector('[data-rop-selection-count]')?.textContent ?? '';
const deleteSelected = (): HTMLElement => screen.getByRole('button', { name: 'Delete selected' });
const checkbox = (number: string): HTMLElement => screen.getByRole('checkbox', { name: `Select ${number}` });

async function select(...numbers: string[]): Promise<void> {
  for (const n of numbers) await userEvent.click(checkbox(n));
}

async function askBulk(title: string): Promise<HTMLElement> {
  await userEvent.click(deleteSelected());
  return screen.findByRole('dialog', { name: title });
}

async function confirmBulk(title: string, label: string): Promise<void> {
  const dialog = await askBulk(title);
  await userEvent.click(within(dialog).getByRole('button', { name: label }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('InvoiceCrud: bulk delete', () => {
  it('0 selected: "Delete selected" is aria-disabled (not disabled), click and Enter open nothing', async () => {
    render(
      <StrictMode>
        <InvoiceCrud {...base()} />
      </StrictMode>,
    );
    await listReady();
    const button = deleteSelected();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    const spy = vi.spyOn(store(), 'deleteMany');
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    // A dialog would open asynchronously (the confirmation is a promise + a state update): give it the time to
    // appear before asserting that it did not.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/Delete 0 invoices/)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  }, 20_000);

  it('rollback respects what the user deselected meanwhile: "Clear selection" during the flight, then an error -> only the rows that come back are selected again (a hidden one stays deselected)', async () => {
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise, deleteOutcome: 'error' })} />);
    await listReady();
    const snapshot = store().snapshot();
    const open = snapshot.find((r) => r.status === 'pending')!.number;
    const hiddenOne = snapshot.find((r) => r.status !== 'pending')!.number;
    await select(open, hiddenOne);
    await userEvent.click(screen.getByRole('radio', { name: 'Open' }));
    await waitFor(() => expect(counter()).toBe('1 selected (1 hidden by filters)'));
    await confirmBulk('Delete 1 invoice?', 'Delete 1 invoice');
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(counter()).toBe('No items selected'));
    await act(async () => release());
    expect(await screen.findByText('Could not delete 1 invoice')).toBeTruthy();
    // The row that came back is selected again; the hidden one, deselected by the user, is not.
    await waitFor(() => expect(counter()).toBe('1 selected'));
    expect((checkbox(open) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(shownNumbers()).toContain(hiddenOne));
    expect((checkbox(hiddenOne) as HTMLInputElement).checked).toBe(false);
    expect(counter()).toBe('1 selected');
  }, 30_000);

  it('two bulk deletes in flight, the first succeeds and the second fails: only the second group is selected again', async () => {
    const first = gate();
    const second = gate();
    render(<InvoiceCrud {...base()} />);
    const before = await listReady();
    const [a, b, c, d] = [before[0]!, before[1]!, before[2]!, before[3]!];
    store().configure({ saveDelayMs: first.promise, deleteOutcome: 'success' });
    await select(a, b);
    await confirmBulk('Delete 2 invoices?', 'Delete 2 invoices');
    store().configure({ saveDelayMs: second.promise, deleteOutcome: 'error' });
    await select(c, d);
    await confirmBulk('Delete 2 invoices?', 'Delete 2 invoices');
    expect(shownNumbers()).toEqual(before.filter((n) => ![a, b, c, d].includes(n)));
    await act(async () => first.release());
    expect(await screen.findByText('2 invoices deleted')).toBeTruthy();
    await act(async () => second.release());
    expect(await screen.findByText('Could not delete 2 invoices')).toBeTruthy();
    await waitFor(() => expect(shownNumbers()).toEqual(before.filter((n) => ![a, b].includes(n))));
    expect(counter()).toBe('2 selected');
    expect((checkbox(c) as HTMLInputElement).checked).toBe(true);
    expect((checkbox(d) as HTMLInputElement).checked).toBe(true);
    // Nothing of the first group is selected again: they stay out and the count is only the second group's.
    expect(store().snapshot().some((r) => r.number === a || r.number === b)).toBe(false);
  }, 30_000);

  it('3 selected: the dialog is "Delete 3 invoices?" with the matching action, focus on Cancel; Cancel changes nothing', async () => {
    render(<InvoiceCrud {...base()} />);
    const [a, b, c] = await listReady();
    await select(a!, b!, c!);
    expect(counter()).toBe('3 selected');
    expect(deleteSelected().getAttribute('aria-disabled')).toBeNull();
    const spy = vi.spyOn(store(), 'deleteMany');
    const dialog = await askBulk('Delete 3 invoices?');
    expect(within(dialog).getByRole('button', { name: 'Delete 3 invoices' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    expect(counter()).toBe('3 selected');
    await waitFor(() => expect(document.activeElement).toBe(deleteSelected()));
  }, 20_000);

  it('1 selected: singular forms', async () => {
    render(<InvoiceCrud {...base()} />);
    const [a] = await listReady();
    await select(a!);
    const dialog = await askBulk('Delete 1 invoice?');
    expect(within(dialog).getByRole('button', { name: 'Delete 1 invoice' })).toBeTruthy();
    expect(within(dialog).getByText('The invoice is deleted permanently.')).toBeTruthy();
  }, 20_000);

  it('confirmed: the rows go BEFORE the server answers, ONE deleteMany with exactly those ids, toast, selection emptied, focus on "select all results"', async () => {
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    render(<InvoiceCrud {...base({ saveDelayMs: promise, onDeleted })} />);
    const before = await listReady();
    const [a, b, c] = [before[1]!, before[3]!, before[4]!];
    await select(a, b, c);
    const spy = vi.spyOn(store(), 'deleteMany');
    await confirmBulk('Delete 3 invoices?', 'Delete 3 invoices');
    expect(shownNumbers()).toEqual(before.filter((n) => ![a, b, c].includes(n)));
    expect(counter()).toBe('No items selected');
    expect(screen.getByRole('heading', { level: 2, name: /\(197\)/ })).toBeTruthy();
    expect(store().snapshot()).toHaveLength(200); // the server has not answered yet
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([idOf(a), idOf(b), idOf(c)]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all results' })));

    await act(async () => release());
    expect(await screen.findByText('3 invoices deleted')).toBeTruthy();
    expect(store().snapshot()).toHaveLength(197);
    expect(onDeleted).toHaveBeenCalledTimes(3);
    expect(counter()).toBe('No items selected');
    expect(shownNumbers()).toEqual(before.filter((n) => ![a, b, c].includes(n)));
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Select all results' }));
  }, 20_000);

  it('a double click on the confirm button makes one call', async () => {
    const { promise } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise })} />);
    const [a, b] = await listReady();
    await select(a!, b!);
    const spy = vi.spyOn(store(), 'deleteMany');
    const dialog = await askBulk('Delete 2 invoices?');
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Delete 2 invoices' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('deleting every row of the results: focus on the table container (the checkbox is disabled), "No results" state', async () => {
    window.history.replaceState(null, '', '/?filter=all&q=FT-2026-0015');
    render(<InvoiceCrud {...base()} />);
    await waitFor(() => expect(shownNumbers()).toEqual(['FT-2026-0015']));
    await select('FT-2026-0015');
    await confirmBulk('Delete 1 invoice?', 'Delete 1 invoice');
    expect(await screen.findByText('1 invoice deleted')).toBeTruthy();
    expect(shownNumbers()).toEqual([]);
    const container = document.querySelector('[data-rop-selection-bar]')!.getAttribute('aria-controls')!;
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(container)));
    expect(document.activeElement).not.toBe(document.body);
  }, 20_000);

  it('deleteOutcome error: every row comes back at its index, the selection is as before, error toast, store unchanged', async () => {
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise, deleteOutcome: 'error' })} />);
    const before = await listReady();
    const picked = [before[0]!, before[2]!, before[5]!];
    await select(...picked);
    const storeBefore = JSON.stringify(store().snapshot());
    await confirmBulk('Delete 3 invoices?', 'Delete 3 invoices');
    expect(shownNumbers()).toEqual(before.filter((n) => !picked.includes(n)));
    await act(async () => release());
    expect(await screen.findByText('Could not delete 3 invoices')).toBeTruthy();
    expect(shownNumbers()).toEqual(before);
    expect(counter()).toBe('3 selected');
    for (const n of picked) expect((checkbox(n) as HTMLInputElement).checked).toBe(true);
    expect(JSON.stringify(store().snapshot())).toBe(storeBefore);
    // The user can try again.
    expect(deleteSelected().getAttribute('aria-disabled')).toBeNull();
  }, 20_000);

  it('selected rows hidden by the filters: the dialog says so; they stay in the store and selected', async () => {
    render(<InvoiceCrud {...base()} />);
    await listReady();
    const snapshot = store().snapshot();
    const pending = snapshot.filter((r) => r.status === 'pending').slice(0, 1).map((r) => r.number);
    const others = snapshot.filter((r) => r.status !== 'pending').slice(0, 2).map((r) => r.number);
    // They may be beyond the first rows on screen: search narrows nothing, so select through the checkboxes present.
    const present = new Set(shownNumbers());
    const chosen = [...pending, ...others];
    expect(chosen.every((n) => present.has(n))).toBe(true);
    await select(...chosen);
    expect(counter()).toBe('3 selected');
    await userEvent.click(screen.getByRole('radio', { name: 'Open' }));
    await waitFor(() => expect(counter()).toBe('1 selected (2 hidden by filters)'));
    const pendingId = idOf(pending[0]!);
    const dialog = await askBulk('Delete 1 invoice?');
    expect(within(dialog).getByText(/2 selected invoices hidden by the filters will not be deleted\./)).toBeTruthy();
    const spy = vi.spyOn(store(), 'deleteMany');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 invoice' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).toHaveBeenCalledWith([pendingId]);
    expect(await screen.findByText('1 invoice deleted')).toBeTruthy();
    await waitFor(() => expect(counter()).toBe('0 selected (2 hidden by filters)'));
    expect(store().snapshot().filter((r) => others.includes(r.number))).toHaveLength(2);
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(counter()).toBe('2 selected'));
    for (const n of others) expect((checkbox(n) as HTMLInputElement).checked).toBe(true);
  }, 30_000);

  it('a single delete in flight and a bulk delete: independent; the row in flight is not in the bulk; rollbacks restore only their own rows', async () => {
    const single = gate();
    const bulk = gate();
    render(<InvoiceCrud {...base()} />);
    const before = await listReady();
    const [a, b, c] = [before[1]!, before[2]!, before[3]!];
    // The single delete of `a` (it will succeed) is held in flight.
    store().configure({ saveDelayMs: single.promise });
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${a}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete invoice' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shownNumbers()).not.toContain(a);

    store().configure({ saveDelayMs: bulk.promise, deleteOutcome: 'error' });
    await select(b, c);
    const spy = vi.spyOn(store(), 'deleteMany');
    await confirmBulk('Delete 2 invoices?', 'Delete 2 invoices');
    expect(spy).toHaveBeenCalledWith([idOf(b), idOf(c)]);
    expect(shownNumbers()).toEqual(before.filter((n) => ![a, b, c].includes(n)));

    await act(async () => bulk.release());
    expect(await screen.findByText('Could not delete 2 invoices')).toBeTruthy();
    // b and c are back, a is still out (its own delete has not settled).
    expect(shownNumbers()).toEqual(before.filter((n) => n !== a));
    await act(async () => single.release());
    await waitFor(() => expect(store().snapshot().some((r) => r.number === a)).toBe(false));
    expect(shownNumbers()).toEqual(before.filter((n) => n !== a));
    expect(store().snapshot().some((r) => r.number === b)).toBe(true);
  }, 30_000);

  it('rollback after the user selected other rows meanwhile: the selection before the confirmation plus the new one', async () => {
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise, deleteOutcome: 'error' })} />);
    const before = await listReady();
    const [a, b, other] = [before[0]!, before[1]!, before[6]!];
    await select(a, b);
    await confirmBulk('Delete 2 invoices?', 'Delete 2 invoices');
    await select(other);
    expect(counter()).toBe('1 selected');
    await act(async () => release());
    expect(await screen.findByText('Could not delete 2 invoices')).toBeTruthy();
    await waitFor(() => expect(counter()).toBe('3 selected'));
    for (const n of [a, b, other]) expect((checkbox(n) as HTMLInputElement).checked).toBe(true);
  }, 30_000);

  it('success after the user selected other rows meanwhile: only the deleted ids leave the selection', async () => {
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise })} />);
    const before = await listReady();
    const [a, b, other] = [before[0]!, before[1]!, before[6]!];
    await select(a, b);
    await confirmBulk('Delete 2 invoices?', 'Delete 2 invoices');
    await select(other);
    await act(async () => release());
    expect(await screen.findByText('2 invoices deleted')).toBeTruthy();
    expect(counter()).toBe('1 selected');
    expect((checkbox(other) as HTMLInputElement).checked).toBe(true);
  }, 30_000);

  it('a selected id whose record is gone is ignored by the counters and left out of deleteMany', async () => {
    render(<InvoiceCrud {...base()} />);
    const before = await listReady();
    const [a, b] = [before[0]!, before[1]!];
    await select(a, b);
    const bId = idOf(b);
    // `a` disappears from the data (deleted elsewhere, e.g. on its record page) while it is still selected.
    await act(async () => {
      await store().delete(idOf(a));
    });
    const spy = vi.spyOn(store(), 'deleteMany');
    // Reload the list: a remount reads the data again (a record opened and closed does the same).
    act(() => {
      window.history.pushState(null, '', `/?filter=all&record=${bId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await screen.findByRole('heading', { level: 1 });
    act(() => {
      window.history.pushState(null, '', '/?filter=all');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await listReady();
    expect(shownNumbers()).not.toContain(a);
    expect(counter()).toBe('1 selected');
    await confirmBulk('Delete 1 invoice?', 'Delete 1 invoice');
    expect(spy).toHaveBeenCalledWith([bId]);
  }, 30_000);

  it('history push: the bulk delete writes nothing to the URL', async () => {
    window.history.replaceState(null, '', '/?filter=all');
    render(<InvoiceCrud {...base({ history: 'push' })} />);
    const [a] = await listReady();
    await select(a!);
    const url = window.location.href;
    const entries = window.history.length;
    await confirmBulk('Delete 1 invoice?', 'Delete 1 invoice');
    expect(await screen.findByText('1 invoice deleted')).toBeTruthy();
    expect(window.location.href).toBe(url);
    expect(window.history.length).toBe(entries);
  }, 20_000);
});
