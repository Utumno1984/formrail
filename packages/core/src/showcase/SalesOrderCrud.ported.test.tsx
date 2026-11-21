import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupCrudTests, renderCrud, store, listReady, gate, openCreation, fillValid, createButton } from './modules/sales-orders/crud-test-kit';

// #527: cases of the CRUD unit tests of the removed showcase (see the table in the pull request) whose sales-order
// twin left out a step: a third Create while the save runs, the list parameters kept by the URL around a creation
// and a deletion from the page, the confirmation of a clean order, the navigations reported by a round trip.
setupCrudTests();

const LIST = '?module=sales-orders&sales-orders.filter=confirmed';
const listTitle = () => screen.getByRole('heading', { level: 2, name: /Sales orders/ });

describe('creating a sales order: what the URL and the server see (#527)', () => {
  it('two clicks on "Create" in one act, then a third while the save is still running: one call to store.create', async () => {
    const { promise, release } = gate();
    await openCreation({ saveDelayMs: promise });
    await fillValid();
    const create = vi.spyOn(store(), 'create');
    const button = createButton();
    act(() => {
      button.click();
      button.click();
    });
    // The first save has not concluded: a third click is still the same Create.
    await userEvent.click(createButton());
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await listReady();
    expect(create).toHaveBeenCalledTimes(1);
    expect(store().snapshot()).toHaveLength(201);
  }, 30_000);

  it('deep link ?create=1 with a list filter: Cancel replaces the entry with the filtered list (no history entry added or lost)', async () => {
    window.history.replaceState(null, '', `/${LIST}&create=1`);
    const entries = window.history.length;
    renderCrud();
    await screen.findByRole('heading', { level: 1, name: 'New sales order' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.location.search).toBe(LIST);
    expect(window.history.length).toBe(entries);
    expect(screen.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
  }, 30_000);

  it('a URL with BOTH record and create and a list filter: "Back to list" clears both and keeps the filter', async () => {
    window.history.replaceState(null, '', `/${LIST}&record=so-15&create=1`);
    renderCrud();
    await screen.findByRole('heading', { level: 1, name: /SO-/ });
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'New sales order' })).toBeNull();
    expect(window.location.search).toBe(LIST);
  }, 30_000);
});

describe('deleting a sales order from its page: the dialog, the wait and the way back (#527)', () => {
  const openPage = async () => {
    window.history.replaceState(null, '', `/${LIST}&record=so-15`);
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    renderCrud({ saveDelayMs: promise, onDeleted });
    const title = await screen.findByRole('heading', { level: 1, name: /SO-/ });
    return { number: title.textContent!.match(/SO-[\d-]+/)![0], release, onDeleted };
  };

  it('dirty order: the dialog warns; confirmed, the URL stays on the order while the server works, then the filtered list without it', async () => {
    const { number, release, onDeleted } = await openPage();
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), ' edited');
    const spy = vi.spyOn(store(), 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
    expect(dialog.textContent).toContain('Unsaved changes will be lost too.');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete sales order' });
    await userEvent.click(confirmButton);
    await userEvent.click(confirmButton); // ignored while pending
    expect(confirmButton.getAttribute('aria-disabled')).toBe('true');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('record=so-15');

    await act(async () => release());
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.location.search).toBe(LIST);
    expect(screen.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().snapshot().some((o) => o.id === 'so-15')).toBe(false);
    expect(await screen.findByText(`Sales order ${number} deleted`)).toBeTruthy();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('clean order: the dialog has no "Unsaved changes"; pending, a second confirm and Escape are ignored; then the list, a toast, the focus on its title', async () => {
    const { number, release } = await openPage();
    expect(screen.getByRole('button', { name: 'Back to list' })).toBeTruthy();
    const spy = vi.spyOn(store(), 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete sales order ${number}?` });
    expect(dialog.textContent).toContain('The sales order is deleted permanently.');
    expect(dialog.textContent).not.toContain('Unsaved changes');
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete sales order' });
    await userEvent.click(confirmButton);
    expect(confirmButton.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(confirmButton);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: `Delete sales order ${number}?` })).toBe(dialog);
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => release());
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('record')).toBeNull();
    expect(screen.queryByRole('link', { name: number })).toBeNull();
    expect(store().snapshot().some((o) => o.id === 'so-15')).toBe(false);
    expect(await screen.findByText(`Sales order ${number} deleted`)).toBeTruthy();
    await waitFor(() => expect(listTitle()).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  }, 30_000);
});

describe('list -> order -> list: the navigations reported (#527)', () => {
  it('one history entry, one report per navigation, a double click on "Back to list" is ONE navigation back, the focus on the opened link', async () => {
    window.history.replaceState(null, '', `/${LIST}`);
    const onNavigate = vi.fn();
    // Entries pushed, counted at the source: `history.length` also counts the forward entries an earlier test left.
    const push = vi.spyOn(window.history, 'pushState');
    renderCrud({ onNavigate });
    await listReady();
    const link = screen.getAllByRole('link', { name: /^SO-/ })[0]!;
    const number = link.textContent!;
    const id = link.getAttribute('data-record-id')!;
    expect(link.getAttribute('href')).toContain('sales-orders.filter=confirmed');
    expect(link.getAttribute('href')).toContain(`record=${id}`);

    await userEvent.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(number) })).toBeTruthy();
    expect(window.location.search).toContain(`record=${id}`);
    expect(push).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);

    await userEvent.dblClick(await screen.findByRole('button', { name: 'Back to list' }));
    await waitFor(() => expect(window.location.search).not.toContain('record='));
    expect(window.location.search).toContain('sales-orders.filter=confirmed');
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenLastCalledWith({ to: 'list' });
    await waitFor(() => expect(screen.getByRole('link', { name: number })).toBe(document.activeElement));
  }, 30_000);
});
