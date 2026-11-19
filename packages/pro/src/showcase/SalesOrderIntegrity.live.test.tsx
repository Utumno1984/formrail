// #583: the live region of the open "Review changes" dialog. The dialog's description is read when it opens; when it
// changes under the open dialog (a server update, the order deleted) a polite `status` in the dialog's body says the
// new text, once, and never the page's own alert.
import { act } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DELETED_REVIEW_DESCRIPTION, DELETED_TEXT, DELETED_TITLE, reviewDescriptionText, serverChangeOf } from './sales-order-rebase';
import { NOTHING_LEFT_DESCRIPTION, ORDER_ONLY_DESCRIPTION, reviewDescription } from './sales-order-review';
import { ORDER, opened, renderOrder, reviewDialog, saveButton, serverUpdate, setupIntegrityTests, stored, textbox } from './sales-order-integrity.test-kit';
import { createSalesOrderStore } from '../../../core/src/showcase/sales-order-store';
import { SALES_ORDERS } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';

setupIntegrityTests();

/** The review open on one change of the Notes; the dialog and its live region. */
async function openReview() {
  const setup = renderOrder();
  await opened();
  await userEvent.type(textbox('Notes'), '!');
  await userEvent.click(await saveButton());
  const dialog = await reviewDialog();
  const regions = within(dialog).getAllByRole('status');
  expect(regions).toHaveLength(1);
  const region = regions[0]!;
  // Every write into the region, from now on: a screen reader reads the region again at each of them.
  const writes: string[] = [];
  const observer = new MutationObserver(() => writes.push(region.textContent ?? ''));
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return { ...setup, dialog, region, writes, stop: () => observer.disconnect() };
}

describe('Record editing integrity, sales orders: the review says a new description out loud (#583)', () => {
  it('opened: a polite status in the dialog\'s body, EMPTY (the dialog has just read its description)', async () => {
    const { dialog, region, stop } = await openReview();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(region).toHaveTextContent('');
    expect(region).not.toHaveAttribute('aria-live', 'assertive');
    expect(region.getAttribute('role')).toBe('status');
    // In the dialog, not in its description (which stays the text alone).
    expect(dialog).toContainElement(region);
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)).not.toContainElement(region);
    stop();
  });

  it('an update lands under it and the description changes: the region says the new text, once', async () => {
    const { store, dialog, region, writes, stop } = await openReview();
    await serverUpdate(store, (o) => ({ ...o, notes: `${o.notes}!` }));
    await waitFor(() => expect(dialog).toHaveAccessibleDescription(NOTHING_LEFT_DESCRIPTION));
    await waitFor(() => expect(region).toHaveTextContent(NOTHING_LEFT_DESCRIPTION));
    expect(writes).toEqual([NOTHING_LEFT_DESCRIPTION]);
    // The same server version announced again: the same description, the region is not written again.
    await serverUpdate(store, (o) => o);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(region).toHaveTextContent(NOTHING_LEFT_DESCRIPTION);
    expect(writes).toEqual([NOTHING_LEFT_DESCRIPTION]);
    stop();
  });

  it('an update that changes the body but not the description: nothing is said', async () => {
    const { store, dialog, region, writes, stop } = await openReview();
    await serverUpdate(store, serverChangeOf('status-and-delivery'));
    await waitFor(() => expect(stored(store).status).toBe('shipped'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(region).toHaveTextContent('');
    expect(writes).toEqual([]);
    stop();
  });

  it('the order deleted under the open review: the region says the review\'s new text, never the page\'s alert', async () => {
    const { store, dialog, region, writes, stop } = await openReview();
    await act(async () => {
      await store.removeFromServer(ORDER);
    });
    await waitFor(() => expect(region).toHaveTextContent(DELETED_REVIEW_DESCRIPTION));
    expect(dialog).toHaveAccessibleDescription(DELETED_REVIEW_DESCRIPTION);
    expect(writes).toEqual([DELETED_REVIEW_DESCRIPTION]);
    // Exactly the review's text: not the page alert's title nor its text.
    expect(region.textContent).toBe(DELETED_REVIEW_DESCRIPTION);
    expect(region.textContent).not.toBe(DELETED_TITLE);
    expect(region.textContent).not.toContain(DELETED_TEXT);
    // One live region in the dialog, a `status` (polite): the page's alert is outside it.
    expect(within(dialog).getAllByRole('status')).toEqual([region]);
    expect(within(dialog).queryByRole('alert')).toBeNull();
    stop();
  });

  it('Keep editing, then the review opened again: a new region, empty again (its text was said in the first one)', async () => {
    const { store } = renderOrder();
    await opened();
    await userEvent.type(textbox('Notes'), '!');
    await userEvent.type(textbox('Customer reference'), '-9');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription(reviewDescription(2));
    // Another user writes the same customer reference: one change left.
    await serverUpdate(store, (o) => ({ ...o, customerReference: `${o.customerReference}-9` }));
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(reviewDescription(1)));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review changes' })).toBeNull());
    await userEvent.click(await saveButton());
    const again = await reviewDialog();
    expect(again).toHaveAccessibleDescription(reviewDescription(1));
    expect(within(again).getByRole('status')).toHaveTextContent('');
  });
});

describe('reviewDescriptionText: the one text of the description and of its live region (#583)', () => {
  const order = createSalesOrderStore().snapshot().find((o) => o.id === ORDER)!;
  const baseline = SALES_ORDERS.form.toValues(order);

  it('deleted wins; else the number of changes; else a reorder; else nothing left', () => {
    const edited = { ...baseline, notes: 'Changed', customerReference: 'PO-1' };
    expect(reviewDescriptionText({ context: { values: edited, baseline }, deleted: true })).toBe(DELETED_REVIEW_DESCRIPTION);
    expect(reviewDescriptionText({ context: { values: edited, baseline }, deleted: false })).toBe(reviewDescription(2));
    const reordered = { ...baseline, lines: [...baseline.lines].reverse() };
    expect(reviewDescriptionText({ context: { values: reordered, baseline }, deleted: false })).toBe(ORDER_ONLY_DESCRIPTION);
    expect(reviewDescriptionText({ context: { values: baseline, baseline }, deleted: false })).toBe(NOTHING_LEFT_DESCRIPTION);
  });
});
