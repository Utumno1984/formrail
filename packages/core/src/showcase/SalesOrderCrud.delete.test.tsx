import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupCrudTests, renderCrud, store, shownNumbers, listReady, gate, type Props } from './modules/sales-orders/crud-test-kit';

// #521: deleting a sales order from its row and from its page (named confirmation, one call per confirmation, an error that keeps the order and can be retried).
setupCrudTests();

describe('deleting a sales order from the list (#521)', () => {
  async function askDelete(number: string) {
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${number}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    return screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
  }

  it('the confirmation names the order and the action and starts on Cancel; Cancel deletes nothing', async () => {
    renderCrud();
    const [, second] = await listReady();
    const spy = vi.spyOn(store(), 'delete');
    const dialog = await askDelete(second!);
    expect(within(dialog).getByRole('button', { name: 'Delete sales order' })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy).not.toHaveBeenCalled();
    expect(shownNumbers()[1]).toBe(second);
  }, 20_000);

  it('confirmed: the row goes before the server answers, then the store follows, a toast, onDeleted once; the focus is on the next row', async () => {
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    renderCrud({ saveDelayMs: promise, onDeleted });
    const before = await listReady();
    const [, target, next] = before;
    const dialog = await askDelete(target!);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shownNumbers()).toEqual(before.filter((n) => n !== target));
    expect(store().snapshot().some((o) => o.number === target)).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: `Actions for ${next}` })).toHaveFocus());
    await act(async () => release());
    await waitFor(() => expect(store().snapshot().some((o) => o.number === target)).toBe(false));
    expect(await screen.findByText(`Sales order ${target} deleted`)).toBeTruthy();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(expect.objectContaining({ number: target }));
  }, 30_000);

  it('a double click on the confirm button (two clicks in one act) makes ONE call to the server', async () => {
    const { promise, release } = gate();
    renderCrud({ saveDelayMs: promise });
    const [, target] = await listReady();
    const spy = vi.spyOn(store(), 'delete');
    const dialog = await askDelete(target!);
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete sales order' });
    act(() => {
      confirmButton.click();
      confirmButton.click();
    });
    await act(async () => release());
    await waitFor(() => expect(store().snapshot().some((o) => o.number === target)).toBe(false));
    expect(spy).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('deleteOutcome error: the row comes back at its place, an error toast, the order is still stored; Delete works again once the server does', async () => {
    renderCrud({ deleteOutcome: 'error' });
    const before = await listReady();
    const target = before[1]!;
    const dialog = await askDelete(target);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    expect(await screen.findByText(`Could not delete ${target}`)).toBeTruthy();
    await waitFor(() => expect(shownNumbers()).toEqual(before));
    expect(store().snapshot().some((o) => o.number === target)).toBe(true);
    // Retry: the server answers now.
    store().configure({ deleteOutcome: 'success' });
    const again = await askDelete(target);
    await userEvent.click(within(again).getByRole('button', { name: 'Delete sales order' }));
    await waitFor(() => expect(store().snapshot().some((o) => o.number === target)).toBe(false));
    expect(await screen.findByText(`Sales order ${target} deleted`)).toBeTruthy();
  }, 40_000);

  it('the last order of a filtered list: "No results for the current filters", with the way out', async () => {
    renderCrud();
    await listReady();
    const search = screen.getByRole('searchbox', { name: 'Search' });
    const [first] = shownNumbers();
    await userEvent.type(search, `${first}{Enter}`);
    await waitFor(() => expect(shownNumbers()).toEqual([first]));
    const dialog = await askDelete(first!);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    await waitFor(() => expect(within(screen.getByRole('table')).getByText('No results for the current filters')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
    expect(store().snapshot().some((o) => o.number === first)).toBe(false);
  }, 30_000);
});

describe('deleting a sales order from its page (#521)', () => {
  const RECORD = '/?module=sales-orders&record=so-15';
  const openPage = async (props: Props = {}) => {
    window.history.replaceState(null, '', RECORD);
    renderCrud(props);
    const title = await screen.findByRole('heading', { level: 1, name: /SO-/ });
    return title.textContent!.match(/SO-[\d-]+/)![0];
  };

  it('"Delete" names the order; with unsaved changes the dialog says so; a double click makes ONE call; then the list without it and a toast', async () => {
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    const number = await openPage({ saveDelayMs: promise, onDeleted });
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' edited');
    const spy = vi.spyOn(store(), 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
    expect(dialog.textContent).toContain('Unsaved changes will be lost too.');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete sales order' });
    act(() => {
      confirmButton.click();
      confirmButton.click();
    });
    expect(confirmButton.getAttribute('aria-disabled')).toBe('true');
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().snapshot().some((o) => o.id === 'so-15')).toBe(false);
    expect(await screen.findByText(`Sales order ${number} deleted`)).toBeTruthy();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: number })).toBeNull();
  }, 30_000);

  it('server error: the dialog stays open and usable, an error toast, the order is still stored; confirming again deletes it', async () => {
    const number = await openPage({ deleteOutcome: 'error' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    expect(await screen.findByText(`Could not delete ${number}`)).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete sales order' }).getAttribute('aria-disabled')).toBeNull());
    expect(store().snapshot().some((o) => o.id === 'so-15')).toBe(true);
    // Retry.
    store().configure({ deleteOutcome: 'success' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete sales order' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(store().snapshot().some((o) => o.id === 'so-15')).toBe(false);
  }, 30_000);
});
