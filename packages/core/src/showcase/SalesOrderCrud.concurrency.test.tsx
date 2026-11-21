import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SALES_ORDER_STATUS_LABEL } from '../internal/demo-data';
import { SALES_ORDERS } from './modules/sales-orders/sales-orders-module';
import {
  setupCrudTests,
  renderCrud,
  store,
  shownNumbers,
  listReady,
  gate,
  openCreation,
  fillValid,
  createButton,
  type Props,
} from './modules/sales-orders/crud-test-kit';
import { RecordCrud } from './RecordCrud';

// #527: the cases of the CRUD unit tests of the Free showcase that #527 removed (see the table in the pull request) that
// no unit test of the sales orders covered: deletes and bulk deletes that overlap, an order already gone, a list read
// while a delete is in flight, the footer between a confirmed delete and the navigation.
setupCrudTests();

const idOf = (number: string): string => store().snapshot().find((o) => o.number === number)!.id;
const counter = (): string => document.querySelector('[data-rop-selection-count]')?.textContent ?? '';
const checkbox = (number: string): HTMLInputElement => screen.getByRole('checkbox', { name: `Select ${number}` }) as HTMLInputElement;
const select = async (...numbers: string[]) => {
  for (const n of numbers) await userEvent.click(checkbox(n));
};
const askBulk = async (title: string) => {
  await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
  return screen.findByRole('dialog', { name: title });
};
const confirmBulk = async (title: string, label: string) => {
  const dialog = await askBulk(title);
  await userEvent.click(within(dialog).getByRole('button', { name: label }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
const confirmDelete = async (number: string) => {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${number}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
const has = (number: string): boolean => store().snapshot().some((o) => o.number === number);

describe('deleting sales orders from the list while other deletes are in flight (#527)', () => {
  it('two quick deletes, the first in flight: both hidden; only the failing one comes back, at its index', async () => {
    const first = gate();
    const second = gate();
    renderCrud();
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
    await waitFor(() => expect(has(b)).toBe(false));
    expect(has(a)).toBe(true);
    expect(shownNumbers()).toEqual(before.filter((n) => n !== b));
  }, 30_000);

  it('search changed with a delete in flight: the row stays hidden; on rollback it comes back only if it matches', async () => {
    const one = gate();
    renderCrud({ deleteOutcome: 'error' });
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
  }, 30_000);

  it('an order already gone from the server (not found) counts as deleted: no rollback, success toast', async () => {
    renderCrud();
    const before = await listReady();
    const target = before[0]!;
    await store().delete(idOf(target)); // deleted "elsewhere": the list on screen still shows it
    expect(shownNumbers()).toContain(target);
    await confirmDelete(target);
    expect(await screen.findByText(`Sales order ${target} deleted`)).toBeTruthy();
    expect(screen.queryByText(`Could not delete ${target}`)).toBeNull();
    expect(shownNumbers()).not.toContain(target);
  }, 30_000);

  it('reads wait for a delete in flight: the order opened meanwhile (Forward) is "not found", never a stale editor', async () => {
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise });
    const [target] = await listReady();
    const id = idOf(target!);
    await confirmDelete(target!);
    // The order's URL comes back (e.g. browser Forward) while the delete is still in flight.
    act(() => {
      window.history.pushState(null, '', `/?module=sales-orders&record=${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect((await screen.findAllByText('Loading sales order…')).length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull(); // no editor of the order being deleted
    await act(async () => release());
    expect(await screen.findByText('Sales order not found')).toBeTruthy();
  }, 30_000);

  it('unmounting with a delete in flight: no error or warning, the store still completes', async () => {
    const { promise, release } = gate();
    const errors = vi.spyOn(console, 'error');
    const { unmount } = renderCrud({ saveDelayMs: promise });
    const [target] = await listReady();
    await confirmDelete(target!);
    const local = store();
    unmount();
    await act(async () => release());
    await waitFor(() => expect(local.snapshot().some((o) => o.number === target)).toBe(false));
    expect(errors).not.toHaveBeenCalled();
  }, 30_000);
});

describe('deleting a sales order from its page: the window between the confirmation and the navigation (#527)', () => {
  const RECORD = '/?module=sales-orders&record=so-15';
  const openFirstFromList = async (): Promise<string> => {
    const [number] = await listReady();
    await userEvent.click(screen.getByRole('link', { name: number }));
    await screen.findByRole('heading', { level: 1, name: new RegExp(number!) });
    return number!;
  };

  it('"Delete" is aria-disabled while a Save is in flight, and a click does nothing', async () => {
    window.history.replaceState(null, '', RECORD);
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise });
    await screen.findByRole('heading', { level: 1, name: /SO-/ });
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
  }, 30_000);

  it('code-review #372 bug 1: between the confirmed delete and the navigation, the footer is gone and Save cannot reach the store', async () => {
    const save = vi.fn();
    // Holds the navigation that follows the delete: the editor stays mounted in the window the bug lives in.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    try {
      renderCrud();
      const number = await openFirstFromList();
      await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' edited');
      vi.spyOn(store(), 'save').mockImplementation(save);
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
      await waitFor(() => expect(back).toHaveBeenCalledTimes(1)); // the delete landed, the navigation started
      expect(screen.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeTruthy(); // ...and has not happened yet
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
  }, 30_000);

  it('code-review #372 bug 2: browser Back while the delete of a CLEAN order is pending is guarded ("Delete in progress")', async () => {
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise });
    const number = await openFirstFromList();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    expect(within(dialog).getByRole('button', { name: 'Delete sales order' }).getAttribute('aria-disabled')).toBe('true');
    // Browser Back.
    act(() => window.history.back());
    const guardDialog = await screen.findByRole('dialog', { name: 'Delete in progress' });
    expect(guardDialog.textContent).toMatch(/will complete/);
    expect(screen.getByRole('heading', { level: 1, name: new RegExp(number), hidden: true })).toBeTruthy();
    // The page did not go: the confirmation is still pending on top of it.
    expect(within(dialog).getByRole('button', { name: 'Delete sales order', hidden: true }).getAttribute('aria-disabled')).toBe('true');
    expect(has(number)).toBe(true);
    // The rest (the delete landing disarms the guard and goes to the list) runs on jsdom's `popstate` fallback of the
    // guard, whose undo traversal jsdom does not replay faithfully: it is covered in Chromium by
    // e2e/showcase-orders-crud-delete.spec.ts ("bug 2"). Here: the delete completes.
    await act(async () => release());
    await waitFor(() => expect(has(number)).toBe(false));
    window.dispatchEvent(new PopStateEvent('popstate')); // lets `leaveRoute` navigate again in the next tests
  }, 30_000);

  it('the read-and-edit module (no `delete`) has no "Delete" on the page and no row menu on the list', async () => {
    window.history.replaceState(null, '', RECORD);
    render(
      <StrictMode>
        <RecordCrud
          module={SALES_ORDERS}
          history="replace"
          listLoadDelayMs={0}
          recordLoadDelayMs={0}
          saveDelayMs={0}
          today="2026-11-09"
          onNavigate={vi.fn()}
        />
      </StrictMode>,
    );
    await screen.findByRole('heading', { level: 1, name: /SO-/ });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await screen.findByRole('table');
    expect(screen.queryAllByRole('button', { name: /^Actions for / })).toHaveLength(0);
  }, 30_000);
});

describe('deleting several sales orders while other deletes are in flight (#527)', () => {
  const props: Props = {};

  it('"Delete selected" with nothing selected: not natively disabled, click and Enter open nothing and never reach the store', async () => {
    renderCrud(props);
    await listReady();
    const button = screen.getByRole('button', { name: 'Delete selected' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    const spy = vi.spyOn(store(), 'deleteMany');
    // A dialog would open asynchronously: give it the time to appear before asserting that it did not.
    const assertNothingOpened = async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    };
    await userEvent.click(button);
    await assertNothingOpened();
    button.focus();
    await userEvent.keyboard('{Enter}');
    await assertNothingOpened();
    expect(document.activeElement).toBe(button);
  }, 30_000);

  it('rollback respects what the user deselected meanwhile: "Clear selection" during the flight, then an error: only the rows that come back are selected again', async () => {
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise, deleteOutcome: 'error' });
    await listReady();
    const snapshot = store().snapshot();
    const shown = snapshot[0]!;
    const hiddenOne = snapshot.find((o) => o.status !== shown.status)!;
    await select(shown.number, hiddenOne.number);
    await userEvent.click(screen.getByRole('radio', { name: SALES_ORDER_STATUS_LABEL[shown.status] }));
    await waitFor(() => expect(counter()).toBe('1 selected (1 hidden by filters)'));
    await confirmBulk('Delete 1 sales order?', 'Delete 1 sales order');
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(counter()).toBe('No items selected'));
    await act(async () => release());
    expect(await screen.findByText('Could not delete 1 sales order')).toBeTruthy();
    // The row that came back is selected again; the hidden one, deselected by the user, is not.
    await waitFor(() => expect(counter()).toBe('1 selected'));
    expect(checkbox(shown.number).checked).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(shownNumbers()).toContain(hiddenOne.number));
    expect(checkbox(hiddenOne.number).checked).toBe(false);
    expect(counter()).toBe('1 selected');
  }, 40_000);

  it('two bulk deletes in flight, the first succeeds and the second fails: only the second group is selected again', async () => {
    const first = gate();
    const second = gate();
    renderCrud();
    const before = await listReady();
    const [a, b, c, d] = [before[0]!, before[1]!, before[2]!, before[3]!];
    store().configure({ saveDelayMs: first.promise, deleteOutcome: 'success' });
    await select(a, b);
    await confirmBulk('Delete 2 sales orders?', 'Delete 2 sales orders');
    store().configure({ saveDelayMs: second.promise, deleteOutcome: 'error' });
    await select(c, d);
    await confirmBulk('Delete 2 sales orders?', 'Delete 2 sales orders');
    expect(shownNumbers()).toEqual(before.filter((n) => ![a, b, c, d].includes(n)));
    await act(async () => first.release());
    expect(await screen.findByText('2 sales orders deleted')).toBeTruthy();
    await act(async () => second.release());
    expect(await screen.findByText('Could not delete 2 sales orders')).toBeTruthy();
    await waitFor(() => expect(shownNumbers()).toEqual(before.filter((n) => ![a, b].includes(n))));
    expect(counter()).toBe('2 selected');
    expect(checkbox(c).checked).toBe(true);
    expect(checkbox(d).checked).toBe(true);
    // Nothing of the first group is selected again: they stay out and the count is only the second group's.
    expect(has(a) || has(b)).toBe(false);
  }, 40_000);

  it('a single delete in flight and a bulk delete: independent; the row in flight is not in the bulk; rollbacks restore only their own rows', async () => {
    const single = gate();
    const bulk = gate();
    renderCrud();
    const before = await listReady();
    const [a, b, c] = [before[1]!, before[2]!, before[3]!];
    // The single delete of `a` (it will succeed) is held in flight.
    store().configure({ saveDelayMs: single.promise });
    await confirmDelete(a);
    expect(shownNumbers()).not.toContain(a);

    store().configure({ saveDelayMs: bulk.promise, deleteOutcome: 'error' });
    await select(b, c);
    const spy = vi.spyOn(store(), 'deleteMany');
    await confirmBulk('Delete 2 sales orders?', 'Delete 2 sales orders');
    expect(spy).toHaveBeenCalledWith([idOf(b), idOf(c)]);
    expect(shownNumbers()).toEqual(before.filter((n) => ![a, b, c].includes(n)));

    await act(async () => bulk.release());
    expect(await screen.findByText('Could not delete 2 sales orders')).toBeTruthy();
    // b and c are back, a is still out (its own delete has not settled).
    expect(shownNumbers()).toEqual(before.filter((n) => n !== a));
    await act(async () => single.release());
    await waitFor(() => expect(has(a)).toBe(false));
    expect(shownNumbers()).toEqual(before.filter((n) => n !== a));
    expect(has(b)).toBe(true);
  }, 40_000);

  it('rollback after the user selected other rows meanwhile: the selection before the confirmation plus the new one', async () => {
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise, deleteOutcome: 'error' });
    const before = await listReady();
    const [a, b, other] = [before[0]!, before[1]!, before[6]!];
    await select(a, b);
    await confirmBulk('Delete 2 sales orders?', 'Delete 2 sales orders');
    await select(other);
    expect(counter()).toBe('1 selected');
    await act(async () => release());
    expect(await screen.findByText('Could not delete 2 sales orders')).toBeTruthy();
    await waitFor(() => expect(counter()).toBe('3 selected'));
    for (const n of [a, b, other]) expect(checkbox(n).checked).toBe(true);
  }, 40_000);

  it('success after the user selected other rows meanwhile: only the deleted ids leave the selection', async () => {
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise });
    const before = await listReady();
    const [a, b, other] = [before[0]!, before[1]!, before[6]!];
    await select(a, b);
    await confirmBulk('Delete 2 sales orders?', 'Delete 2 sales orders');
    await select(other);
    await act(async () => release());
    expect(await screen.findByText('2 sales orders deleted')).toBeTruthy();
    expect(counter()).toBe('1 selected');
    expect(checkbox(other).checked).toBe(true);
  }, 40_000);

  it('a selected id whose order is gone is ignored by the counters and left out of deleteMany', async () => {
    renderCrud();
    const before = await listReady();
    const [a, b] = [before[0]!, before[1]!];
    await select(a, b);
    const bId = idOf(b);
    // `a` disappears from the data (deleted elsewhere, e.g. on its page) while it is still selected.
    await act(async () => {
      await store().delete(idOf(a));
    });
    const spy = vi.spyOn(store(), 'deleteMany');
    // Reload the list: a remount reads the data again (an order opened and closed does the same).
    act(() => {
      window.history.pushState(null, '', `/?module=sales-orders&record=${bId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await screen.findByRole('heading', { level: 1 });
    act(() => {
      window.history.pushState(null, '', '/?module=sales-orders');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await listReady();
    expect(shownNumbers()).not.toContain(a);
    expect(counter()).toBe('1 selected');
    await confirmBulk('Delete 1 sales order?', 'Delete 1 sales order');
    expect(spy).toHaveBeenCalledWith([bId]);
  }, 40_000);

  it('history push: the bulk delete writes nothing to the URL and adds no history entry', async () => {
    renderCrud({ history: 'push' });
    const [a] = await listReady();
    await select(a!);
    const url = window.location.href;
    const entries = window.history.length;
    await confirmBulk('Delete 1 sales order?', 'Delete 1 sales order');
    expect(await screen.findByText('1 sales order deleted')).toBeTruthy();
    expect(window.location.href).toBe(url);
    expect(window.history.length).toBe(entries);
  }, 30_000);
});

describe('the creation page: a Create that overlaps a navigation (#527)', () => {
  it('a Create hidden by the filters says so and focuses the title', async () => {
    window.history.replaceState(null, '', '/?module=sales-orders&sales-orders.filter=shipped');
    renderCrud();
    await userEvent.click(await screen.findByRole('button', { name: 'New sales order' }));
    await fillValid();
    await userEvent.click(createButton());
    expect(await screen.findByText('Not shown with the current filters.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'SO-NEW-0201' })).toBeNull();
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H2'));
  }, 40_000);

  it('with edits, Cancel asks; "Keep editing" keeps them, "Discard changes" leaves without creating', async () => {
    await openCreation();
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveProperty('value', 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(store().snapshot()).toHaveLength(200);
  }, 40_000);

  it('leaving with a Create in flight ("Leave anyway"): the list shows the new order, onCreated once', async () => {
    const { promise, release } = gate();
    const onCreated = vi.fn();
    await openCreation({ saveDelayMs: promise, onCreated });
    await fillValid();
    await userEvent.click(createButton());
    expect(createButton().getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/A save is still in progress/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Leave anyway' }));
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(onCreated).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('link', { name: 'SO-NEW-0201' }, { timeout: 5000 })).toBeTruthy();
  }, 40_000);

  it('typing during the save: the guard asks about the newer edits and a second Create never makes a second order', async () => {
    const { promise, release } = gate();
    const onCreated = vi.fn();
    await openCreation({ saveDelayMs: promise, onCreated });
    await fillValid();
    await userEvent.click(createButton());
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'after the click');
    await act(async () => release());
    // The order exists, the form is dirty again with edits that were not part of it: the guard asks.
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(window.location.search).toContain('create=1');
    await userEvent.click(createButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(store().snapshot()).toHaveLength(201);
    // "Discard changes" finally leaves (the order stays created).
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(store().snapshot()).toHaveLength(201);
  }, 40_000);

  it('a URL with BOTH record and create (record wins): "Back to list" clears both and shows the list', async () => {
    window.history.replaceState(null, '', '/?module=sales-orders&record=so-15&create=1');
    renderCrud();
    await screen.findByRole('heading', { level: 1, name: /SO-/ });
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'New sales order' })).toBeNull();
    expect(window.location.search).toBe('?module=sales-orders');
  }, 40_000);

  it('leaving for another page before the list after a Create has loaded: the confirmation is shown anyway', async () => {
    await openCreation({ listLoadDelayMs: 800 });
    await fillValid();
    await userEvent.click(createButton());
    await waitFor(() => expect(window.location.search).not.toContain('create='));
    expect(screen.queryByText('Sales order SO-NEW-0201 created')).toBeNull(); // the list is still loading
    // ...and the user starts another navigation right away: the list that was to announce is unmounted.
    await userEvent.click(await screen.findByRole('button', { name: 'New sales order' }));
    expect(await screen.findByText('Sales order SO-NEW-0201 created')).toBeTruthy();
    expect(window.location.search).toContain('create=1');
    expect(store().snapshot()).toHaveLength(201);
  }, 40_000);

  it('deep link ?create=1: Cancel replaces the entry with the list (no history entry added or lost)', async () => {
    window.history.replaceState(null, '', '/?module=sales-orders&create=1');
    const entries = window.history.length;
    renderCrud();
    await screen.findByRole('heading', { level: 1, name: 'New sales order' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.location.search).toBe('?module=sales-orders');
    expect(window.history.length).toBe(entries);
  }, 40_000);
});

describe('a save that outlives the page it started on (#527)', () => {
  const edit = async (): Promise<string> => {
    const link = (await screen.findAllByRole('link'))[0]!;
    const number = link.textContent!;
    await userEvent.click(link);
    const quantity = await screen.findByRole('textbox', { name: 'Line 1 quantity' });
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '88');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    return number;
  };
  const stored = (number: string) => store().snapshot().find((o) => o.number === number)!;

  it('save in flight + Back + Leave anyway: leaves at once, the store gets the saved value, no React warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSaved = vi.fn();
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise, onSaved });
    const number = await edit();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave anyway' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    expect(onSaved).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(stored(number).lines[0]!.quantity).toBe(88);
    // The list reloading after the return is async and outside `act`: a harness notice, not a React warning about the
    // save resolving after the page is gone.
    expect(errors.mock.calls.filter(([message]) => !String(message).includes('not wrapped in act'))).toEqual([]);
    errors.mockRestore();
  }, 40_000);

  it('leaving during a save and re-opening the order: it shows the saved value, a second save keeps it', async () => {
    const { promise, release } = gate();
    let number = '';
    try {
      renderCrud({ saveDelayMs: promise });
      number = await edit();
      await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Leave anyway' }));
      await waitFor(() => expect(window.location.search).not.toContain('record='));
      // The list read waits for the save in flight: with the gate closed it cannot settle, however many task turns pass.
      for (let turn = 0; turn < 5; turn += 1) {
        await act(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        });
      }
      expect(screen.queryByRole('link', { name: number })).toBeNull();
    } finally {
      release();
    }
    await userEvent.click(await screen.findByRole('link', { name: number }, { timeout: 5000 }));
    const reopened = await screen.findByRole('textbox', { name: 'Line 1 quantity' }, { timeout: 5000 });
    expect(reopened).toHaveProperty('value', '88');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored(number).notes).toContain(' x'), { timeout: 5000 });
    expect(stored(number).lines[0]!.quantity).toBe(88);
  }, 40_000);
});
