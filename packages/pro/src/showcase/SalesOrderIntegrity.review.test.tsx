// #522: "Review changes" on a sales order, on the record page of the shell with the Pro add-ons: what the dialog
// lists, against which saved order, and what Save, "Save changes" and "Keep editing" do.
import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getProduct } from '../../../core/src/internal/demo-data';
import { SALES_ORDERS_CRUD } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import { RecordPage } from '../../../core/src/showcase/RecordPageShell';
import { createSalesOrderStore } from '../../../core/src/showcase/sales-order-store';
import { salesOrderRebaseAddons, type SalesOrderRebaseOptions } from './sales-order-rebase';
import { ORDER_ONLY_DESCRIPTION, salesOrderSaveReview } from './sales-order-review';
import {
  LINES_ORDER,
  ORDER,
  changesIn,
  footer,
  gate,
  opened,
  pick,
  renderCreation,
  renderOrder,
  reviewDialog,
  saveButton,
  stored,
  textbox,
  typeInto,
  visibleBar,
  setupIntegrityTests,
} from './sales-order-integrity.test-kit';

setupIntegrityTests();

const productOf = (id: string, line: number) => getProduct(stored(createSalesOrderStore(), id).lines[line]!.productId)!.name;

describe('Record editing integrity, sales orders: the review (#522)', () => {
  it('Status and Notes + Save: "Review changes" lists exactly those two, by label and readable value; nothing saved yet; "Keep editing" keeps everything', async () => {
    const { store, onSaved } = renderOrder();
    await opened();
    const before = JSON.stringify(store.snapshot());
    await pick(screen.getByRole('combobox', { name: 'Status' }), 'Confirmed');
    await userEvent.type(textbox('Notes'), ' Checked.');
    const save = await saveButton();
    await userEvent.click(save);

    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    expect(changesIn(dialog)).toEqual([
      'Status, changed, from Invoiced to Confirmed',
      `Notes, changed, from ${stored(store).notes} to ${stored(store).notes} Checked.`,
    ]);
    expect(within(dialog).queryByText(/\b(invoiced|confirmed)\b/)).toBeNull();
    // The focus opens on "Keep editing": confirming is a deliberate gesture.
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    expect(JSON.stringify(store.snapshot())).toBe(before);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(textbox('Notes').value.endsWith(' Checked.')).toBe(true);
    expect(footer()).not.toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
  }, 30_000);

  it('the diff is against the order SAVED on the server, not the one opened: save, edit again, the review lists only the second edit', async () => {
    const { store, onSaved } = renderOrder();
    await opened();
    await userEvent.type(textbox('Notes'), ' First.');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(stored(store).notes.endsWith(' First.')).toBe(true);

    await typeInto(textbox('Customer reference'), 'PO-7781');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(changesIn(dialog)).toEqual([expect.stringMatching(/^Customer reference, changed, from .* to PO-7781$/)]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect(stored(store)).toMatchObject({ customerReference: 'PO-7781' });
    expect(stored(store).notes.endsWith(' First.')).toBe(true);
  }, 30_000);

  it('line 2 quantity changed and line 1 removed (USD): two entries named by product, the removed line with its amounts in dollars', async () => {
    const { store } = renderOrder(LINES_ORDER);
    await opened(/SO-2026-161000013/);
    await typeInto(textbox('Line 2 quantity'), '60');
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
    await userEvent.click(await saveButton());

    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('2 changes will be saved.');
    expect(changesIn(dialog)).toEqual([
      `Lines > Line 1 (${productOf(LINES_ORDER, 1)}) > Quantity, changed, from 50 to 60`,
      `Lines > Line 1 (${productOf(LINES_ORDER, 0)}), removed, ${productOf(LINES_ORDER, 0)}, 50 × $61.30`,
    ]);
    expect(dialog).not.toHaveTextContent(/Item \d/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect(stored(store, LINES_ORDER).lines.map((l) => l.quantity)).toEqual([60, 20, 1]);
  }, 30_000);

  it('only the order of the lines: the review opens with its own text and no list; "Save changes" saves the new order', async () => {
    const { store } = renderOrder(LINES_ORDER);
    await opened(/SO-2026-161000013/);
    const ids = stored(store, LINES_ORDER).lines.map((l) => l.id);
    await userEvent.click(screen.getByRole('button', { name: 'Move line 3 up' }));
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription(ORDER_ONLY_DESCRIPTION);
    expect(within(dialog).queryByRole('list')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toBeNull());
    expect(stored(store, LINES_ORDER).lines.map((l) => l.id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  }, 30_000);

  it('edited and restored by hand: clean, no footer, so nothing to review', async () => {
    renderOrder();
    await opened();
    const reference = textbox('Customer reference');
    const saved = reference.value;
    await userEvent.type(reference, 'x');
    await visibleBar();
    await typeInto(reference, saved);
    await waitFor(() => expect(footer()).toBeNull());
  }, 30_000);

  it('an invalid form: Save opens no review; the errors as without it', async () => {
    const { store } = renderOrder();
    await opened();
    const before = JSON.stringify(store.snapshot());
    await typeInto(textbox('Line 1 quantity'), '0');
    await userEvent.click(await saveButton());
    await waitFor(() => expect(within(footer()!).getByText('1 invalid field')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.stringify(store.snapshot())).toBe(before);
  }, 30_000);

  it('a failing save: the error in the footer, the form still edited, a new Save reviews the same change', async () => {
    const store = createSalesOrderStore(undefined, { saveOutcome: 'error' });
    renderOrder(ORDER, { store });
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-1');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toHaveTextContent('Could not save the sales order: network error'));
    expect(textbox('Customer reference').value).toBe('PO-1');
    await userEvent.click(await saveButton());
    expect(changesIn(await reviewDialog())).toEqual([expect.stringMatching(/^Customer reference, changed, from .* to PO-1$/)]);
  }, 30_000);

  it('Save while a save is in flight: no second review, no second save', async () => {
    const held = gate();
    const store = createSalesOrderStore(undefined, { saveDelayMs: held.promise });
    const { onSaved } = renderOrder(ORDER, { store });
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-2');
    const save = await saveButton();
    await userEvent.click(save);
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(save);
    expect(screen.queryByRole('dialog')).toBeNull();
    held.release();
    await waitFor(() => expect(footer()).toBeNull());
    expect(onSaved).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('a new order is created without a review (nothing saved to compare with)', async () => {
    const store = renderCreation();
    await screen.findByRole('heading', { level: 1, name: 'New sales order' });
    await pick(screen.getByRole('combobox', { name: /Customer/ }), 'Hoevenstrand Coatings BV (EUR)');
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await userEvent.click(await screen.findByRole('combobox', { name: /Line 1 product/ }));
    await userEvent.click((await screen.findAllByRole('option'))[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(store.snapshot()).toHaveLength(201));
    expect(screen.queryByRole('dialog')).toBeNull();
    // No server-update action on a creation page: the add-ons are for an existing order.
    expect(screen.queryByRole('button', { name: 'Simulate server update' })).toBeNull();
  }, 30_000);
});

// #526: the cases of the unit tests of the invoice showcase (InvoicesChangeSummary.test.tsx) that the tests above did
// not assert as strongly, on the sales orders.
describe('Record editing integrity, sales orders: the review in the shell (#526, from the invoices)', () => {
  /** The record page of so-1 under StrictMode (effects run twice), with or without the two add-ons. */
  function renderStrict({ addons = true } = {}) {
    const store = createSalesOrderStore();
    const options = { current: { serverChange: 'status-and-delivery', serverUpdateDelayMs: 0, simulateServerUpdate: true } satisfies SalesOrderRebaseOptions };
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <RecordPage
          module={SALES_ORDERS_CRUD}
          store={store}
          recordId={ORDER}
          onBack={vi.fn()}
          onSaved={onSaved}
          reviewSave={addons ? salesOrderSaveReview : undefined}
          useAddons={addons ? salesOrderRebaseAddons(options) : undefined}
        />
      </StrictMode>,
    );
    return { store, onSaved };
  }

  it('in StrictMode: Status, Customer reference and Notes + Save: 3 entries in the order of the page, the store NOT called; confirm: ONE save with the edited values, the new baseline is what the store returned', async () => {
    const { store, onSaved } = renderStrict();
    await opened();
    const save = vi.spyOn(store, 'save');
    await pick(screen.getByRole('combobox', { name: 'Status' }), 'Confirmed');
    await typeInto(textbox('Customer reference'), 'PO-7781');
    await userEvent.type(textbox('Notes'), ' Checked.');
    await userEvent.click(await saveButton());

    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    expect(changesIn(dialog).map((text) => text.split(',')[0])).toEqual(['Status', 'Customer reference', 'Notes']);
    expect(changesIn(dialog)[0]).toBe('Status, changed, from Invoiced to Confirmed');
    expect(save).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep editing' })));

    // Confirm: the shell's own save, once, with the edited values.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toMatchObject({ id: ORDER, status: 'confirmed', customerReference: 'PO-7781' });
    await waitFor(() => expect(footer()).toBeNull());
    expect(onSaved).toHaveBeenCalledTimes(1);
    // The new baseline is what the store returned.
    expect(stored(store)).toMatchObject({ status: 'confirmed', customerReference: 'PO-7781' });
    expect(stored(store).notes.endsWith(' Checked.')).toBe(true);
  }, 30_000);

  it('an invalid form (a line quantity of 0) never opens the review: the error count, and the focus on the invalid field, as without it', async () => {
    const { store } = renderOrder();
    await opened();
    const save = vi.spyOn(store, 'save');
    const quantity = textbox('Line 1 quantity');
    await typeInto(quantity, '0');
    await userEvent.click(await saveButton());
    await waitFor(() => expect(within(footer()!).getByText('1 invalid field')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(quantity));
    expect(save).not.toHaveBeenCalled();
  }, 30_000);

  it('without the add-ons (the Free shell) Save saves at once, once, with no dialog', async () => {
    const { store } = renderStrict({ addons: false });
    await opened();
    const save = vi.spyOn(store, 'save');
    await userEvent.type(textbox('Notes'), '!');
    await userEvent.click(await saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(footer()).toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
  }, 30_000);
});
