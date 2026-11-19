// #583, decision of Daniele (option A): a sales order deleted on the server, BEFORE the review opens or WHILE it is
// open, gives the same review: "Save changes" is there, `aria-disabled` (still focusable, never `disabled`), described
// by its reason through a real `aria-describedby`, and a click, Enter or Space on it saves nothing. Never a "not found"
// from a save sent to an order that no longer exists.
import { act } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SalesOrderStore } from '../../../core/src/showcase/sales-order-store';
import { DELETED_REVIEW_DESCRIPTION, DELETED_SAVE_REASON, DELETED_TITLE } from './sales-order-rebase';
import { LINES_ORDER, ORDER, footer, opened, renderOrder, reviewDialog, saveButton, setupIntegrityTests, textbox, typeInto } from './sales-order-integrity.test-kit';

setupIntegrityTests();

const confirmIn = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Save changes' });

/** The element `aria-describedby` of `el` points at: one id, a real node of the document. */
function describedBy(el: HTMLElement): HTMLElement {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  expect(ids).toHaveLength(1);
  const target = document.getElementById(ids[0]!);
  expect(target).not.toBeNull();
  return target!;
}

/** "Save changes" unavailable for the deletion: present, `aria-disabled`, focusable, described by the reason. */
function expectUnavailable(dialog: HTMLElement): HTMLElement {
  const confirm = confirmIn(dialog);
  expect(confirm).toHaveAttribute('aria-disabled', 'true');
  expect(confirm).not.toBeDisabled();
  expect(confirm).not.toHaveAttribute('disabled');
  expect(confirm).toHaveAccessibleDescription(DELETED_SAVE_REASON);
  const reason = describedBy(confirm);
  expect(reason).toHaveTextContent(DELETED_SAVE_REASON);
  // Shown in the dialog (a screen reader user and a sighted one get the same reason), not in its description.
  expect(dialog).toContainElement(reason);
  expect(dialog).toHaveAccessibleDescription(DELETED_REVIEW_DESCRIPTION);
  return confirm;
}

/**
 * Click, Enter and Space on the unavailable "Save changes" (focused): nothing is saved, the dialog stays open with the
 * focus on the button, no "not found" anywhere.
 */
async function expectInert(store: SalesOrderStore, save: ReturnType<typeof vi.spyOn>, dialog: HTMLElement) {
  const confirm = confirmIn(dialog);
  expect(confirm).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await userEvent.keyboard(' ');
  await userEvent.click(confirm);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Review changes' })).toBe(dialog);
  expect(confirmIn(dialog)).toHaveFocus();
  expect(footer()).not.toBeNull();
  expect(footer()).not.toHaveTextContent('not found');
  expect(store.snapshot().some((o) => o.id === ORDER)).toBe(false);
}

/** Keep editing closes the review; the edits are still in the form. */
async function backToTheForm(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review changes' })).toBeNull());
  expect(textbox('Customer reference').value).toBe('PO-lost');
}

describe('Record editing integrity, sales orders: "Save changes" on a deleted order (#583, option A)', () => {
  it('deleted BEFORE the review opens: "Save changes" present, aria-disabled, described by the reason; Tab reaches it, Enter/Space/click save nothing', async () => {
    const { store } = renderOrder(ORDER, { serverChange: 'delete-order' });
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-lost');
    await userEvent.click(screen.getByRole('button', { name: 'Simulate server update' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes(DELETED_TITLE))).toBe(true));
    const save = vi.spyOn(store, 'save');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expectUnavailable(dialog);
    // The review opens on "Keep editing" (initialFocus), Tab reaches "Save changes": it is not taken out of the order.
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await userEvent.tab();
    await expectInert(store, save, dialog);
    await backToTheForm(dialog);
  }, 30_000);

  it('deleted WHILE the review is open: the focused "Save changes" turns aria-disabled under the user, the focus stays on it, nothing is saved', async () => {
    const { store } = renderOrder();
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-lost');
    const save = vi.spyOn(store, 'save');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    // Available while the order exists: no aria-disabled, no description of the button.
    const confirm = confirmIn(dialog);
    expect(confirm).not.toHaveAttribute('aria-disabled');
    expect(confirm).not.toHaveAttribute('aria-describedby');
    expect(within(dialog).queryByText(DELETED_SAVE_REASON)).toBeNull();
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await act(async () => {
      await store.removeFromServer(ORDER);
    });
    await waitFor(() => expect(confirmIn(dialog)).toHaveAttribute('aria-disabled', 'true'));
    // The same node: the button is not remounted, so the focus never fell to the body.
    expect(confirmIn(dialog)).toBe(confirm);
    expectUnavailable(dialog);
    await expectInert(store, save, dialog);
    await backToTheForm(dialog);
  }, 30_000);

  it('another order deleted while the review is open: "Save changes" stays available and saves', async () => {
    const { store } = renderOrder();
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-kept');
    const save = vi.spyOn(store, 'save');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    await act(async () => {
      await store.removeFromServer(LINES_ORDER);
    });
    const confirm = confirmIn(dialog);
    expect(confirm).not.toHaveAttribute('aria-disabled');
    expect(confirm).not.toHaveAttribute('aria-describedby');
    await userEvent.click(confirm);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(footer()).toBeNull());
    expect(store.snapshot().find((o) => o.id === ORDER)?.customerReference).toBe('PO-kept');
  }, 30_000);
});
