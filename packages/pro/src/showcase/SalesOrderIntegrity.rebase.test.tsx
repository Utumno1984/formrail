// #522: "Simulate server update" on a sales order (Form Rebase): what the server changes lands in the fields the user
// did not touch, a field both changed is a conflict with "Keep mine" / "Use server value", and nothing the server
// does is ever taken for a gesture of the user (no dirty form, no entry in the review).
import { act } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatDate, getProduct } from '../../../core/src/internal/demo-data';
import { createSalesOrderStore, type StoredSalesOrder } from '../../../core/src/showcase/sales-order-store';
import { CONFLICT_HELP, DELETED_REVIEW_DESCRIPTION, DELETED_SAVE_REASON, NOTICE_TITLE, REMOVED_HELP, serverChangeOf, serverLineIds } from './sales-order-rebase';
import {
  LINES_ORDER,
  ORDER,
  changesIn,
  conflictItems,
  dateField,
  footer,
  gate,
  notice,
  opened,
  renderOrder,
  reviewDialog,
  saveButton,
  serverUpdate,
  statusText,
  stored,
  textbox,
  typeInto,
  setupIntegrityTests,
} from './sales-order-integrity.test-kit';

setupIntegrityTests();

const SEED = createSalesOrderStore();
const seed = (id = ORDER): StoredSalesOrder => stored(SEED, id);
const productOf = (id: string, line: number) => getProduct(seed(id).lines[line]!.productId)!.name;
const statusAndDelivery = serverChangeOf('status-and-delivery');

describe('Record editing integrity, sales orders: no echo of a server update (#522)', () => {
  // One row per change the server makes, on an editor the user has not touched: the fields take the server's values
  // and the form stays clean (no save bar), because a server change is not a gesture of the user.
  it.each([
    ['status and delivery', 'status-and-delivery'],
    ['line 1 quantity', 'line-1-quantity'],
    ['line 1 removed', 'remove-line-1'],
    ['a line added', 'add-line'],
  ] as const)('clean editor, the server changes %s: the fields follow, the form stays clean', async (_, kind) => {
    const { store } = renderOrder(ORDER, { serverChange: kind });
    await opened();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate server update' }));
    const after = await waitFor(() => {
      const s = stored(store);
      expect(JSON.stringify(s)).not.toBe(JSON.stringify(seed()));
      return s;
    });
    await waitFor(() => expect(screen.getAllByRole('textbox', { name: /^Line \d+ quantity$/ })).toHaveLength(after.lines.length));
    expect(after.lines.map((_, i) => textbox(`Line ${i + 1} quantity`).value)).toEqual(after.lines.map((l) => String(l.quantity)));
    expect(dateField('Requested delivery').value).toBe(after.requestedDeliveryDate);
    expect(footer()).toBeNull();
    expect(notice()).toHaveTextContent(NOTICE_TITLE);
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
  }, 30_000);

  it('after the update, an edit of the Notes: the review lists the Notes only, nothing of what the server changed', async () => {
    const { store } = renderOrder();
    await opened();
    await serverUpdate(store, statusAndDelivery);
    expect(notice()).toHaveTextContent(`${NOTICE_TITLE}2 fields were updated.`);
    await userEvent.type(textbox('Notes'), '!');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(changesIn(dialog)).toEqual([expect.stringMatching(/^Notes, changed, /)]);
  }, 30_000);

  it('the server announces the order as it already is: nothing changes, the form stays clean', async () => {
    const { store } = renderOrder();
    await opened();
    await serverUpdate(store, (o) => o);
    expect(footer()).toBeNull();
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
  }, 30_000);
});

describe('Record editing integrity, sales orders: merging into an edited order (#522)', () => {
  it('Notes typed, the server changes Status and delivery: both arrive, the Notes stay mine, no conflict', async () => {
    const { store } = renderOrder();
    await opened();
    await userEvent.type(textbox('Notes'), ' Checked.');
    await serverUpdate(store, statusAndDelivery);
    expect(statusText()).toContain('Shipped');
    expect(dateField('Requested delivery').value).toBe(statusAndDelivery(seed()).requestedDeliveryDate);
    expect(textbox('Notes').value).toBe(`${seed().notes} Checked.`);
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(footer()).not.toBeNull();
  }, 30_000);

  it('Requested delivery changed by both: mine stays, a conflict with both dates, the Field explained; "Keep mine" closes it, the form stays edited', async () => {
    const { store } = renderOrder();
    await opened();
    const delivery = dateField('Requested delivery');
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-07-01');
    await serverUpdate(store, statusAndDelivery);
    const server = statusAndDelivery(seed()).requestedDeliveryDate;
    expect(delivery.value).toBe('2026-07-01');
    expect(conflictItems().map((li) => li.textContent)).toEqual([expect.stringMatching(new RegExp(`^Requested delivery Yours: Jul 1, 2026 Server: ${formatDate(server)}`))]);
    expect(delivery).toHaveAccessibleDescription(CONFLICT_HELP);
    expect(delivery).toHaveAccessibleName(/^Requested delivery/);
    // The status the user did not touch came from the server: not a conflict.
    expect(statusText()).toContain('Shipped');
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine for Requested delivery' }));
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(delivery.value).toBe('2026-07-01');
    expect(delivery).not.toHaveAccessibleDescription(CONFLICT_HELP);
    expect(footer()).not.toBeNull();
  }, 30_000);

  it('"Use server value" on the only edit: the field takes it and the form is clean again', async () => {
    const { store } = renderOrder();
    await opened();
    const delivery = dateField('Requested delivery');
    await userEvent.clear(delivery);
    await userEvent.type(delivery, '2026-07-01');
    await serverUpdate(store, statusAndDelivery);
    await userEvent.click(screen.getByRole('button', { name: 'Use server value for Requested delivery' }));
    expect(delivery.value).toBe(statusAndDelivery(seed()).requestedDeliveryDate);
    await waitFor(() => expect(footer()).toBeNull());
  }, 30_000);

  it('line 1 quantity changed by both: a conflict named by the line\'s product', async () => {
    const { store } = renderOrder();
    await opened();
    await typeInto(textbox('Line 1 quantity'), '9');
    await serverUpdate(store, serverChangeOf('line-1-quantity'));
    expect(conflictItems().map((li) => li.textContent)).toEqual([
      `Lines > Line 1 (${productOf(ORDER, 0)}) > Quantity Yours: 9 Server: ${seed().lines[0]!.quantity + 1} Use server value Keep mine`,
    ]);
    expect(textbox('Line 1 quantity')).toHaveAccessibleDescription(CONFLICT_HELP);
  }, 30_000);

  it('a quantity retyped as the same number ("01" for 1) is not an edit: the server\'s quantity arrives, no conflict, the form stays clean', async () => {
    const { store } = renderOrder();
    await opened();
    const quantity = textbox('Line 1 quantity');
    await typeInto(quantity, `0${seed().lines[0]!.quantity}`);
    expect(footer()).toBeNull();
    await serverUpdate(store, serverChangeOf('line-1-quantity'));
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    expect(quantity.value).toBe(String(seed().lines[0]!.quantity + 1));
    expect(footer()).toBeNull();
  }, 30_000);

  it('the server removes the line I edited: the line stays with my value, one conflict on the row, its fields marked', async () => {
    const { store } = renderOrder();
    await opened();
    await typeInto(textbox('Line 1 quantity'), '7');
    await serverUpdate(store, serverChangeOf('remove-line-1'));
    expect(conflictItems()[0]).toHaveTextContent(new RegExp(`^Lines > Line 1 \\(${productOf(ORDER, 0).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\) Yours: .*7 × €196\\.20, 5% discount Server: Removed`));
    expect(textbox('Line 1 quantity')).toHaveAccessibleDescription(REMOVED_HELP);
    // "Use server value": the line goes, the next one takes its place.
    await userEvent.click(screen.getByRole('button', { name: `Use server value for Lines > Line 1 (${productOf(ORDER, 0)})` }));
    expect(screen.getAllByRole('textbox', { name: /^Line \d+ quantity$/ })).toHaveLength(2);
    expect(textbox('Line 1 quantity').value).toBe(String(seed().lines[1]!.quantity));
    await waitFor(() => expect(footer()).toBeNull());
  }, 30_000);

  it('a line added by me and one added by the server: two lines, two ids, both saved', async () => {
    const { store } = renderOrder();
    await opened();
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await userEvent.click(await screen.findByRole('combobox', { name: /Line 4 product/ }));
    await userEvent.click((await screen.findAllByRole('option'))[1]!);
    await typeInto(textbox('Line 4 quantity'), '2');
    await serverUpdate(store, serverChangeOf('add-line', serverLineIds(store)));
    expect(screen.getAllByRole('textbox', { name: /^Line \d+ quantity$/ })).toHaveLength(5);
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    // Only my line is a change: the server's is in the saved order already.
    expect(changesIn(dialog)).toEqual([expect.stringMatching(/^Lines > Line \d \(.*\), added, .*, 2 × /)]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(footer()).toBeNull());
    const ids = stored(store).lines.map((l) => l.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual(expect.arrayContaining(['new-1', 'srv-line-1']));
  }, 30_000);

  it('Save with an open conflict: the review names the server change it overwrites', async () => {
    const { store } = renderOrder();
    await opened();
    await typeInto(textbox('Line 1 quantity'), '9');
    await serverUpdate(store, serverChangeOf('line-1-quantity'));
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(within(within(dialog).getByRole('list', { name: 'Server changes you overwrite' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `Lines > Line 1 (${productOf(ORDER, 0)}) > Quantity`,
    ]);
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
  }, 30_000);

  it('an update landing under the open review: the review follows the new saved order', async () => {
    const { store } = renderOrder();
    await opened();
    await userEvent.type(textbox('Notes'), '!');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    await serverUpdate(store, (o) => ({ ...o, notes: `${o.notes}!` }));
    await waitFor(() => expect(dialog).toHaveAccessibleDescription('Nothing left to save.'));
    expect(within(dialog).queryByRole('list', { name: 'Changes to save' })).toBeNull();
  }, 30_000);
});

describe('Record editing integrity, sales orders: a save in flight, a deleted order (#522)', () => {
  it('an update during a save: "Applying…", then applied on top of what was saved; nothing of mine is lost', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = createSalesOrderStore(undefined, { saveDelayMs: held });
    renderOrder(ORDER, { store });
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-9');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await serverUpdate(store, statusAndDelivery);
    expect(notice()).toHaveTextContent('Applying server update after saving…');
    await act(async () => {
      release();
      await held;
    });
    await waitFor(() => expect(statusText()).toContain('Shipped'));
    expect(textbox('Customer reference').value).toBe('PO-9');
    expect(stored(store)).toMatchObject({ customerReference: 'PO-9', status: 'shipped', requestedDeliveryDate: statusAndDelivery(seed()).requestedDeliveryDate });
    await waitFor(() => expect(footer()).toBeNull());
  }, 30_000);

  it('a line the server adds during a save: the id announced is the id saved (the replay does not issue another)', async () => {
    const held = gate();
    const store = createSalesOrderStore(undefined, { saveDelayMs: held.promise });
    const onServerChange = vi.fn();
    renderOrder(ORDER, { store, serverChange: 'add-line', onServerChange });
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-9');
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simulate server update' }));
    await waitFor(() => expect(onServerChange).toHaveBeenCalledTimes(1));
    const announced = onServerChange.mock.calls[0]![0].record.lines.at(-1).id;
    expect(announced).toBe('srv-line-1');
    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() => expect(footer()).toBeNull());
    expect(stored(store).lines.map((l) => l.id)).toContain(announced);
    expect(stored(store).lines.map((l) => l.id)).not.toContain('srv-line-2');
  }, 30_000);

  it('the order deleted on the server with the review open: the description says it can no longer be saved, not "1 change will be saved."', async () => {
    const { store } = renderOrder();
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-lost');
    await userEvent.click(await saveButton());
    const dialog = await reviewDialog();
    expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    await act(async () => {
      await store.removeFromServer(ORDER);
    });
    await waitFor(() => expect(dialog).toHaveAccessibleDescription(DELETED_REVIEW_DESCRIPTION));
    expect(dialog).not.toHaveAccessibleDescription(/will be saved/);
  }, 30_000);

  it('the order deleted on the server: an explicit error, my edits still in the form, the form still dirty; Save says it is gone', async () => {
    const { store } = renderOrder(ORDER, { serverChange: 'delete-order' });
    await opened();
    await typeInto(textbox('Customer reference'), 'PO-lost');
    await userEvent.click(screen.getByRole('button', { name: 'Simulate server update' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes('This sales order was deleted on the server'))).toBe(true));
    expect(textbox('Customer reference').value).toBe('PO-lost');
    expect(footer()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Simulate server update' })).toHaveAttribute('aria-disabled', 'true');
    expect(store.snapshot().some((o) => o.id === ORDER)).toBe(false);
    await userEvent.click(await saveButton());
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Save changes' }));
    // #583, decision of Daniele (option A): "Save changes" is there but unavailable, described by the reason; no save.
    const confirmButton = within(await reviewDialog()).getByRole('button', { name: 'Save changes' });
    expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    expect(confirmButton).toHaveAccessibleDescription(DELETED_SAVE_REASON);
    expect(footer()).not.toHaveTextContent('not found');
    // The review stays open (nothing was confirmed): back to the form, which the modal dialog hides meanwhile.
    await userEvent.click(within(await reviewDialog()).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review changes' })).toBeNull());
    expect(textbox('Customer reference').value).toBe('PO-lost');
  }, 30_000);

  it('another order changing on the server does not touch the open one', async () => {
    const { store } = renderOrder();
    await opened();
    const before = dateField('Requested delivery').value;
    await serverUpdate(store, statusAndDelivery, LINES_ORDER);
    expect(dateField('Requested delivery').value).toBe(before);
    expect(notice()).toBeNull();
  }, 30_000);
});

// #526: the cases of the unit tests of the invoice showcase (invoice-rebase.test.tsx) that the tests above did not
// assert, on the sales orders.
describe('Record editing integrity, sales orders: a conflict follows its line, the Free shell (#526, from the invoices)', () => {
  it('a conflict on a line follows the line (by id) when lines move or a line above it is removed', async () => {
    const { store } = renderOrder();
    await opened();
    const first = productOf(ORDER, 0);
    const quantity = (n: number) => textbox(`Line ${n} quantity`);
    await typeInto(quantity(1), '8');
    await serverUpdate(store, (o) => ({ ...o, lines: o.lines.map((l, i) => (i === 0 ? { ...l, quantity: 5 } : l)) }));
    const item = () => within(screen.getByRole('list', { name: 'Conflicts' })).getByRole('listitem');
    const label = (n: number) => `Lines > Line ${n} (${first}) > Quantity`;
    const starting = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    expect(item()).toHaveTextContent(starting(`${label(1)} Yours: 8 Server: 5`));
    // Line 1 moves down: the conflict, its explanation and its choices follow it.
    await userEvent.click(screen.getByRole('button', { name: 'Move line 1 down' }));
    expect(item()).toHaveTextContent(starting(`${label(2)} Yours: 8 Server: 5`));
    expect(quantity(2)).toHaveAccessibleDescription(CONFLICT_HELP);
    expect(quantity(1)).not.toHaveAccessibleDescription(CONFLICT_HELP);
    expect(screen.getByRole('button', { name: `Use server value for ${label(2)}` })).toBeTruthy();
    // The line above it removed: the same row again, now first.
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
    expect(item()).toHaveTextContent(starting(label(1)));
    expect(quantity(1)).toHaveAccessibleDescription(CONFLICT_HELP);
    await userEvent.click(screen.getByRole('button', { name: `Use server value for ${label(1)}` }));
    expect(quantity(1).value).toBe('5');
    expect(screen.queryByRole('list', { name: 'Conflicts' })).toBeNull();
  }, 30_000);

  it('the Free shell (no useAddons) has no "Simulate server update" and ignores server changes', async () => {
    const { store } = renderOrder(ORDER, { rebase: false });
    await opened();
    expect(screen.queryByRole('button', { name: 'Simulate server update' })).toBeNull();
    const before = dateField('Requested delivery').value;
    await serverUpdate(store, statusAndDelivery);
    // The server did change the order: the page ignored it.
    expect(stored(store).requestedDeliveryDate).not.toBe(before);
    expect(dateField('Requested delivery').value).toBe(before);
    expect(notice()).toBeNull();
    expect(footer()).toBeNull();
  }, 30_000);
});
