import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupCrudTests, renderCrud, store, shownNumbers, listReady, gate } from './modules/sales-orders/crud-test-kit';

// #521: deleting several sales orders at once (the count in the confirmation, rows hidden by the filters, an error that brings the rows back).
setupCrudTests();

describe('deleting several sales orders (#521)', () => {
  const tick = async (numbers: string[]) => {
    for (const n of numbers) await userEvent.click(screen.getByRole('checkbox', { name: `Select ${n}` }));
  };

  it('"Delete selected" is aria-disabled with nothing selected: a click opens nothing', async () => {
    renderCrud();
    await listReady();
    const button = screen.getByRole('button', { name: 'Delete selected' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 20_000);

  it('the confirmation counts the selected orders, and only those; confirmed: the rows go, one deleteMany with those ids, a toast with the count', async () => {
    const { promise, release } = gate();
    const onDeleted = vi.fn();
    renderCrud({ saveDelayMs: promise, onDeleted });
    const before = await listReady();
    const chosen = [before[1]!, before[3]!, before[4]!];
    await tick(chosen);
    expect(screen.getByText('3 selected')).toBeTruthy();
    const spy = vi.spyOn(store(), 'deleteMany');
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 3 sales orders?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete 3 sales orders' });
    act(() => {
      confirmButton.click();
      confirmButton.click();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shownNumbers()).toEqual(before.filter((n) => !chosen.includes(n)));
    expect(store().snapshot()).toHaveLength(200);
    await act(async () => release());
    await waitFor(() => expect(store().snapshot()).toHaveLength(197));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toHaveLength(3);
    expect(await screen.findByText('3 sales orders deleted')).toBeTruthy();
    expect(onDeleted).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select all results' })).toHaveFocus());
  }, 40_000);

  it('one selected: the singular ("Delete 1 sales order?")', async () => {
    renderCrud();
    const [, second] = await listReady();
    await tick([second!]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(await screen.findByRole('dialog', { name: 'Delete 1 sales order?' })).toBeTruthy();
  }, 20_000);

  it('rows hidden by the filters: the confirmation counts only the visible selected ones and says what it leaves alone', async () => {
    renderCrud();
    const before = await listReady();
    await tick([before[0]!, before[1]!, before[2]!]);
    // A search that keeps only the first order: the other two stay selected but hidden.
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), `${before[0]}{Enter}`);
    await waitFor(() => expect(shownNumbers()).toEqual([before[0]]));
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 1 sales order?' });
    expect(dialog.textContent).toContain('2 selected sales orders hidden by the filters will not be deleted.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 sales order' }));
    await waitFor(() => expect(store().snapshot()).toHaveLength(199));
    expect(store().snapshot().some((o) => o.number === before[1])).toBe(true);
  }, 40_000);

  it('deleteOutcome error: the rows come back selected, an error toast with the count, nothing deleted', async () => {
    renderCrud({ deleteOutcome: 'error' });
    const before = await listReady();
    const chosen = [before[1]!, before[2]!];
    await tick(chosen);
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 sales orders?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 sales orders' }));
    expect(await screen.findByText('Could not delete 2 sales orders')).toBeTruthy();
    await waitFor(() => expect(shownNumbers()).toEqual(before));
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(store().snapshot()).toHaveLength(200);
  }, 30_000);
});
