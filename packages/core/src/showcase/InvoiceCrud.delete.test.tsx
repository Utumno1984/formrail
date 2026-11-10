import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceCrud, type InvoiceCrudProps } from './InvoiceCrud';
import type { InvoiceStore } from './invoice-store';

// #365: Delete from the list (optimistic, rollback) and from the record page (pessimistic).

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
  window.history.replaceState(null, '', '/?filter=open');
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

/** The row numbers on screen, in order. */
const shownNumbers = (): string[] =>
  screen.queryAllByRole('button', { name: /^Actions for / }).map((b) => b.getAttribute('aria-label')!.slice('Actions for '.length));

async function confirmDelete(number: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${number}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', { name: `Delete invoice ${number}?` });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

async function listReady(): Promise<string[]> {
  await waitFor(() => expect(shownNumbers().length).toBeGreaterThan(5));
  return shownNumbers();
}

describe('InvoiceCrud: Delete from the list', () => {
  it('Cancel never calls store.delete; the dialog names the action and starts on Cancel', async () => {
    render(
      <StrictMode>
        <InvoiceCrud {...base()} />
      </StrictMode>,
    );
    const [first] = await listReady();
    const spy = vi.spyOn(store(), 'delete');
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${first}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete invoice ${first}?` });
    expect(within(dialog).getByRole('button', { name: 'Delete invoice' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    expect(shownNumbers()[0]).toBe(first);
  }, 20_000);

  it('the row goes at once, the store follows; success toast and onDeleted once', async () => {
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    render(<InvoiceCrud {...base({ saveDelayMs: promise, onDeleted })} />);
    const before = await listReady();
    const target = before[1]!;
    await confirmDelete(target);
    // Hidden before the server answered.
    expect(shownNumbers()).toEqual(before.filter((n) => n !== target));
    expect(store().snapshot().some((r) => r.number === target)).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(store().snapshot().some((r) => r.number === target)).toBe(false));
    expect(await screen.findByText(`Invoice ${target} deleted`)).toBeTruthy();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(expect.objectContaining({ number: target }));
    expect(shownNumbers()).toEqual(before.filter((n) => n !== target));
  }, 20_000);

  it('two quick deletes, the first in flight: both hidden; only the failing one comes back, at its index', async () => {
    const first = gate();
    const second = gate();
    render(<InvoiceCrud {...base()} />);
    const before = await listReady();
    const [a, b] = [before[1]!, before[3]!];
    store().configure({ deleteOutcome: 'error', saveDelayMs: first.promise });
    await confirmDelete(a);
    store().configure({ deleteOutcome: 'success', saveDelayMs: second.promise });
    await confirmDelete(b);
    expect(shownNumbers()).toEqual(before.filter((n) => n !== a && n !== b));

    await act(async () => first.release());
    expect(await screen.findByText(`Could not delete ${a}`)).toBeTruthy();
    await waitFor(() => expect(shownNumbers()).toEqual(before.filter((n) => n !== b)));
    expect(shownNumbers().indexOf(a)).toBe(1);

    await act(async () => second.release());
    await waitFor(() => expect(store().snapshot().some((r) => r.number === b)).toBe(false));
    expect(store().snapshot().some((r) => r.number === a)).toBe(true);
    expect(shownNumbers()).toEqual(before.filter((n) => n !== b));
  }, 20_000);

  it('search changed with a delete in flight: the row stays hidden; on rollback it comes back only if it matches', async () => {
    const one = gate();
    render(<InvoiceCrud {...base({ deleteOutcome: 'error' })} />);
    const before = await listReady();
    const [a, b] = [before[0]!, before[2]!];
    store().configure({ saveDelayMs: one.promise });
    await confirmDelete(a);
    const two = gate();
    store().configure({ saveDelayMs: two.promise });
    await confirmDelete(b);

    const search = screen.getByRole('searchbox', { name: 'Search' });
    await userEvent.type(search, a);
    await waitFor(() => expect(shownNumbers()).toEqual([]));
    // `a` matches the search: back on rollback. `b` does not: stays out.
    await act(async () => one.release());
    await waitFor(() => expect(shownNumbers()).toEqual([a]));
    await act(async () => two.release());
    expect(await screen.findByText(`Could not delete ${b}`)).toBeTruthy();
    expect(shownNumbers()).toEqual([a]);
    await userEvent.clear(search);
    await waitFor(() => expect(shownNumbers()).toEqual(before));
  }, 20_000);

  it('a record already gone from the server (InvoiceNotFoundError) counts as deleted: no rollback, success toast', async () => {
    render(<InvoiceCrud {...base()} />);
    const before = await listReady();
    const target = before[0]!;
    const id = store().snapshot().find((r) => r.number === target)!.id;
    await store().delete(id); // deleted "elsewhere": the list on screen still shows it
    expect(shownNumbers()).toContain(target);
    await confirmDelete(target);
    expect(await screen.findByText(`Invoice ${target} deleted`)).toBeTruthy();
    expect(screen.queryByText(`Could not delete ${target}`)).toBeNull();
    expect(shownNumbers()).not.toContain(target);
  }, 20_000);

  it('reads wait for a delete in flight: the record opened meanwhile (Forward) is "not found", never a stale editor', async () => {
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise })} />);
    const [target] = await listReady();
    const id = store().snapshot().find((r) => r.number === target)!.id;
    await confirmDelete(target!);
    // The record's URL comes back (e.g. browser Forward) while the delete is still in flight.
    act(() => {
      window.history.pushState(null, '', `/?filter=open&record=${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findAllByText('Loading invoice…')).not.toHaveLength(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull(); // no editor of the record being deleted
    await act(async () => release());
    expect(await screen.findByText('Invoice not found')).toBeTruthy();
  }, 20_000);

  it('unmounting with a delete in flight: no error or warning, the store still completes', async () => {
    const { promise, release } = gate();
    const errors = vi.spyOn(console, 'error');
    const { unmount } = render(<InvoiceCrud {...base({ saveDelayMs: promise })} />);
    const [target] = await listReady();
    await confirmDelete(target!);
    const local = store();
    unmount();
    await act(async () => release());
    await waitFor(() => expect(local.snapshot().some((r) => r.number === target)).toBe(false));
    expect(errors).not.toHaveBeenCalled();
  }, 20_000);
});

describe('InvoiceCrud: Delete from the record page', () => {
  const RECORD = '/?filter=open&record=inv-12';

  it('dirty record: the dialog warns; confirmed, it waits for the server, then the list without the record and no "Unsaved changes"', async () => {
    window.history.replaceState(null, '', RECORD);
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    render(
      <StrictMode>
        <InvoiceCrud {...base({ saveDelayMs: promise, onDeleted })} />
      </StrictMode>,
    );
    const title = await screen.findByRole('heading', { level: 1, name: /FT-2026-0012/ });
    expect(title).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' edited');
    const spy = vi.spyOn(store(), 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete invoice FT-2026-0012?' });
    expect(dialog.textContent).toContain('Unsaved changes will be lost too.');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete invoice' });
    await userEvent.click(confirmButton);
    await userEvent.click(confirmButton); // ignored while pending
    expect(confirmButton.getAttribute('aria-disabled')).toBe('true');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('record=inv-12');

    await act(async () => release());
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.location.search).toBe('?filter=open');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().snapshot().some((r) => r.id === 'inv-12')).toBe(false);
    expect(await screen.findByText('Invoice FT-2026-0012 deleted')).toBeTruthy();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'FT-2026-0012' })).toBeNull();
  }, 20_000);

  it('server error: the dialog stays open and interactive, error toast, the record is still there; Cancel closes', async () => {
    window.history.replaceState(null, '', RECORD);
    render(<InvoiceCrud {...base({ deleteOutcome: 'error' })} />);
    await screen.findByRole('heading', { level: 1, name: /FT-2026-0012/ });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete invoice FT-2026-0012?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));
    expect(await screen.findByText('Could not delete FT-2026-0012')).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete invoice' }).getAttribute('aria-disabled')).toBeNull());
    expect(store().snapshot().some((r) => r.id === 'inv-12')).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(window.location.search).toContain('record=inv-12');
  }, 20_000);

  it('"Delete" is aria-disabled while a Save is in flight, and a click does nothing', async () => {
    window.history.replaceState(null, '', RECORD);
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise })} />);
    await screen.findByRole('heading', { level: 1, name: /FT-2026-0012/ });
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' edited');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const remove = screen.getByRole('button', { name: 'Delete' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    const spy = vi.spyOn(store(), 'delete');
    await userEvent.click(remove);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('aria-disabled')).toBeNull());
  }, 20_000);

  /** Opens the first record of the list with its link: a PUSHED entry, so leaving is `history.back()` (asynchronous). */
  async function openFirstFromList(): Promise<string> {
    const [number] = await listReady();
    await userEvent.click(screen.getByRole('link', { name: number }));
    await screen.findByRole('heading', { level: 1, name: number });
    return number!;
  }

  it('code-review #372 bug 1: between the confirmed delete and the navigation, the footer is gone and Save cannot reach the store', async () => {
    const save = vi.fn();
    // Holds the navigation that follows the delete: the editor stays mounted in the window the bug lives in.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    try {
      render(<InvoiceCrud {...base()} />);
      const number = await openFirstFromList();
      await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' edited');
      vi.spyOn(store(), 'save').mockImplementation(save);
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog', { name: `Delete invoice ${number}?` });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));
      await waitFor(() => expect(back).toHaveBeenCalledTimes(1)); // the delete landed, the navigation started
      expect(screen.getByRole('heading', { level: 1, name: number })).toBeTruthy(); // ...and has not happened yet
      const saveButton = screen.queryByRole('button', { name: 'Save' });
      if (saveButton) await userEvent.click(saveButton);
      expect(save).not.toHaveBeenCalled();
      const discard = screen.queryByRole('button', { name: 'Discard' });
      if (discard) await userEvent.click(discard);
      expect(screen.queryByText(/not found/i)).toBeNull();
      // Hidden, the footer keeps its space (it never moves the page) but is `inert` and out of the a11y tree.
      expect(screen.getByRole('region', { name: 'Save actions' }).hasAttribute('inert')).toBe(true);
    } finally {
      back.mockRestore();
      // `leaveRoute` waits for the `popstate` of its `history.back()` before allowing another one.
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, 20_000);

  it('code-review #372 bug 2: browser Back while the delete of a CLEAN record is pending is guarded ("Delete in progress")', async () => {
    const { promise, release } = gate();
    render(<InvoiceCrud {...base({ saveDelayMs: promise })} />);
    const number = await openFirstFromList();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete invoice ${number}?` });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));
    expect(within(dialog).getByRole('button', { name: 'Delete invoice' }).getAttribute('aria-disabled')).toBe('true');
    // Browser Back.
    act(() => window.history.back());
    const guardDialog = await screen.findByRole('dialog', { name: 'Delete in progress' });
    expect(guardDialog.textContent).toMatch(/will complete/);
    expect(screen.getByRole('heading', { level: 1, name: number, hidden: true })).toBeTruthy();
    // The delete lands: the guard is disarmed and the page goes to the list.
    // The page did not go: the confirmation is still pending on top of it.
    expect(within(dialog).getByRole('button', { name: 'Delete invoice', hidden: true }).getAttribute('aria-disabled')).toBe('true');
    expect(store().snapshot().some((r) => r.number === number)).toBe(true);
    // The rest (the delete landing disarms the guard and goes to the list) runs on jsdom's `popstate` fallback
    // of the guard, whose undo traversal jsdom does not replay faithfully: it is covered in Chromium by
    // e2e/showcase-crud-delete.spec.ts ("bug 2"). Here: the delete completes.
    await act(async () => release());
    await waitFor(() => expect(store().snapshot().some((r) => r.number === number)).toBe(false));
    window.dispatchEvent(new PopStateEvent('popstate')); // lets `leaveRoute` navigate again in the next tests
  }, 20_000);

  it('the Update-only record page (no onDelete) has no "Delete"', async () => {
    const { InvoiceListToRecord } = await import('./InvoiceListToRecord');
    window.history.replaceState(null, '', RECORD);
    render(<InvoiceListToRecord history="replace" listLoadDelayMs={0} recordLoadDelayMs={0} saveDelayMs={0} onNavigate={vi.fn()} />);
    await screen.findByRole('heading', { level: 1, name: /FT-2026-0012/ });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await screen.findByRole('table');
    expect(screen.queryAllByRole('button', { name: /^Actions for / })).toHaveLength(0);
  }, 20_000);
});
