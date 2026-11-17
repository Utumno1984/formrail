import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getProduct } from '../internal/demo-data';
import { minorToText } from './modules/sales-orders/order-lines';
import { setupCrudTests, EUR_CUSTOMER, EUR_CUSTOMER_2, USD_CUSTOMER, renderCrud, store, listReady, gate, openCreation, pick, chooseCustomer, addLine, typeInto, createButton, fillValid } from './modules/sales-orders/crud-test-kit';

// #521: the creation page of a sales order (born clean, dirty-tracked field by field, validated, one Create per gesture, a failure that can be retried).
setupCrudTests();

describe('the creation page of a sales order (#521)', () => {
  it('"New sales order": the title is focused, the number and the currency are locked, no customer, no line, no badge', async () => {
    const title = await openCreation();
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('textbox', { name: /Order number/ })).toHaveValue('Assigned on save');
    expect(screen.getByRole('combobox', { name: /Customer/ })).toHaveTextContent('Choose a customer');
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('Set by the customer');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Draft');
    expect(screen.getByLabelText(/Order date/)).toHaveValue('2026-11-09');
    expect(screen.getByLabelText(/^Requested delivery/)).toHaveValue('2026-11-23');
    expect(screen.getByText('No lines')).toBeTruthy();
    expect(screen.getByText('Order total:').textContent).toBe('Order total: 0.00');
  }, 20_000);

  it('an existing order still has its customer locked (a name, no Select) on the same module', async () => {
    window.history.replaceState(null, '', '/?module=sales-orders&record=so-15');
    renderCrud();
    await screen.findByRole('heading', { level: 1, name: /SO-/ });
    expect(screen.queryByRole('combobox', { name: /Customer/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Customer' })).toHaveAttribute('readonly');
  }, 20_000);

  it('born clean: "Back to list" leaves at once, with no "Unsaved changes"', async () => {
    await openCreation();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await listReady();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().snapshot()).toHaveLength(200);
  }, 20_000);

  // For every editable field: change it -> leaving asks; "Keep editing" keeps the page; put the value back -> leaving
  // asks nothing. (The comparison itself, field by field, is `sameValues` in sales-orders-module.test.ts.)
  const edits: [string, () => Promise<() => Promise<void>>][] = [
    [
      'customer reference',
      async () => {
        const el = screen.getByRole('textbox', { name: 'Customer reference' });
        await userEvent.type(el, 'P');
        return () => userEvent.type(el, '{Backspace}');
      },
    ],
    [
      'delivery instructions',
      async () => {
        const el = screen.getByRole('textbox', { name: 'Delivery instructions' });
        await userEvent.type(el, 'P');
        return () => userEvent.type(el, '{Backspace}');
      },
    ],
    [
      'notes',
      async () => {
        const el = screen.getByRole('textbox', { name: 'Notes' });
        await userEvent.type(el, 'P');
        return () => userEvent.type(el, '{Backspace}');
      },
    ],
    [
      'order date',
      async () => {
        const el = screen.getByLabelText(/Order date/) as HTMLInputElement;
        await typeInto(el, '2026-11-10');
        return () => typeInto(el, '2026-11-09');
      },
    ],
    [
      'requested delivery',
      async () => {
        const el = screen.getByLabelText(/^Requested delivery/) as HTMLInputElement;
        await typeInto(el, '2026-11-24');
        return () => typeInto(el, '2026-11-23');
      },
    ],
    [
      'status',
      async () => {
        const el = screen.getByRole('combobox', { name: 'Status' });
        await pick(el, 'Confirmed');
        return () => pick(el, 'Draft');
      },
    ],
    [
      'lines',
      async () => {
        await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
        return async () => {
          await userEvent.click(screen.getByRole('button', { name: /^Remove/ }));
        };
      },
    ],
  ];
  it.each(edits)('%s: changed, leaving asks and "Keep editing" stays; put back, leaving asks nothing', async (_name, edit) => {
    await openCreation();
    const undo = await edit();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1, name: 'New sales order' })).toBeTruthy();
    await undo();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await listReady();
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 30_000);

  it('the customer: choosing one is a change (there is no way back to "no customer")', async () => {
    await openCreation();
    await chooseCustomer(USD_CUSTOMER);
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('USD');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
  }, 20_000);

  it('Create on the empty form: the customer and the lines are reported, nothing reaches the server, the customer takes the focus', async () => {
    await openCreation();
    const create = vi.spyOn(store(), 'create');
    await userEvent.click(createButton());
    expect(await screen.findByText('2 invalid fields')).toBeTruthy();
    expect(screen.getByText('Customer is required.')).toBeTruthy();
    expect(screen.getByText('Add at least one line.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(store().snapshot()).toHaveLength(200);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Customer/ })).toHaveFocus());
  }, 20_000);

  it('an unfinished line is reported, never dropped: no price, and the Create waits for it', async () => {
    await openCreation();
    await chooseCustomer();
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    const create = vi.spyOn(store(), 'create');
    await userEvent.click(createButton());
    expect(await screen.findByText('Choose a product.')).toBeTruthy();
    expect(screen.getByText(/Unit price must be an amount greater than 0/)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  }, 20_000);

  it('delivery: the day before the order date is refused; the same day is accepted', async () => {
    await openCreation();
    await fillValid();
    const delivery = screen.getByLabelText(/^Requested delivery/) as HTMLInputElement;
    await typeInto(delivery, '2026-11-08');
    const create = vi.spyOn(store(), 'create');
    await userEvent.click(createButton());
    expect(await screen.findByText('Requested delivery cannot be before the order date.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    await typeInto(delivery, '2026-11-09');
    await userEvent.click(createButton());
    await listReady();
    expect(create).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('a valid Create: the server assigns the number and the total; back on the list (no dialog), toast, one order more, onCreated once', async () => {
    const onCreated = vi.fn();
    await openCreation({ onCreated });
    await fillValid();
    await userEvent.click(createButton());
    await listReady();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.search).not.toContain('create');
    expect(store().snapshot()).toHaveLength(201);
    const made = store().snapshot().at(-1)!;
    expect(made).toMatchObject({ number: 'SO-NEW-0201', customerName: 'Hoevenstrand Coatings BV', currency: 'EUR', status: 'draft', totalMinor: 3150 });
    expect(made.lines).toHaveLength(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: made.id }));
    // The new order is at the end of the unsorted list, out of view: the toast says so, and names the order.
    expect(await screen.findByText(/Sales order SO-NEW-0201 created/)).toBeTruthy();
  }, 30_000);

  it('a double click on Create (two clicks in one act) creates ONE order', async () => {
    const gateOne = gate();
    await openCreation({ saveDelayMs: gateOne.promise });
    await fillValid();
    const create = vi.spyOn(store(), 'create');
    const button = createButton();
    act(() => {
      button.click();
      button.click();
    });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => gateOne.release());
    await listReady();
    expect(store().snapshot()).toHaveLength(201);
  }, 30_000);

  it('saveOutcome error: the page stays with its values, the message is in the footer, nothing is created; Create works again once the server does', async () => {
    await openCreation({ saveOutcome: 'error' });
    await fillValid();
    await userEvent.click(createButton());
    expect(await screen.findByText(/Could not save the sales order/i)).toBeTruthy();
    expect(store().snapshot()).toHaveLength(200);
    expect(screen.getByRole('textbox', { name: /Line 1 quantity/ })).toHaveValue('3');
    expect(screen.getByRole('combobox', { name: /Customer/ })).toHaveTextContent('Hoevenstrand');
    store().configure({ saveOutcome: 'success' });
    await userEvent.click(createButton());
    await listReady();
    expect(store().snapshot()).toHaveLength(201);
  }, 30_000);

  it('a customer of another currency re-prices the lines from the products list prices, in the new currency', async () => {
    await openCreation();
    await chooseCustomer(EUR_CUSTOMER);
    await addLine();
    const price = () => screen.getByRole('textbox', { name: /Line 1 unit price/ });
    expect(price()).toHaveValue(minorToText(getProduct('prd-1')!.listPriceMinor.EUR, 'EUR'));
    await typeInto(price(), '1.00');
    // Same currency, ANOTHER customer (choosing the same one again may never reach the handler): the typed price stays.
    await chooseCustomer(EUR_CUSTOMER_2);
    expect(screen.getByRole('combobox', { name: /Customer/ })).toHaveTextContent('Alcorvena Dairy S.A.');
    expect(price()).toHaveValue('1.00');
    await chooseCustomer(USD_CUSTOMER);
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('USD');
    expect(screen.getByRole('textbox', { name: /Line 1 unit price \(USD\)/ })).toHaveValue(
      minorToText(getProduct('prd-1')!.listPriceMinor.USD, 'USD'),
    );
  }, 40_000);

  it('a USD customer, Status Confirmed and delivery instructions: the order is stored exactly so, and the page leaves without "Unsaved changes"', async () => {
    await openCreation();
    await chooseCustomer(USD_CUSTOMER);
    await addLine();
    await typeInto(screen.getByRole('textbox', { name: /Line 1 quantity/ }), '2');
    await typeInto(screen.getByRole('textbox', { name: /Line 1 unit price \(USD\)/ }), '10.50');
    await pick(screen.getByRole('combobox', { name: 'Status' }), 'Confirmed');
    await typeInto(screen.getByRole('textbox', { name: /Delivery instructions/ }), 'Dock 3');
    await userEvent.click(createButton());
    await listReady();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().snapshot()).toHaveLength(201);
    const made = store().snapshot().at(-1)!;
    expect(made).toMatchObject({
      customerName: 'Quillenbrook Components Corp.',
      currency: 'USD',
      status: 'confirmed',
      deliveryNotes: 'Dock 3',
      totalMinor: 2100,
    });
    expect(made.lines[0]).toMatchObject({ quantity: 2, unitPriceMinor: 1050 });
  }, 40_000);

  it('before the customer is chosen no price or total names a currency (Currency says it is set by the customer); after, they do', async () => {
    await openCreation();
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('Set by the customer');
    const total = () => document.querySelector('[data-order-total]')!.textContent;
    expect(total()).toBe('0.00');
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    expect(screen.getByRole('textbox', { name: 'Line 1 unit price' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /unit price \(/ })).toBeNull();
    await chooseCustomer(EUR_CUSTOMER);
    expect(screen.getByRole('textbox', { name: 'Line 1 unit price (EUR)' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Remove/ }));
    expect(total()).toBe('€0.00');
  }, 30_000);

  it('another currency on an empty form: "Add at least one line." stays (no line changed, nothing to re-report)', async () => {
    await openCreation();
    await chooseCustomer(EUR_CUSTOMER);
    await userEvent.click(createButton());
    expect(await screen.findByText('Add at least one line.')).toBeTruthy();
    await chooseCustomer(USD_CUSTOMER);
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('USD');
    expect(screen.getByText('Add at least one line.')).toBeTruthy();
  }, 30_000);

  it('another currency on a line with no product: "Choose a product." stays (the line has no price to re-price)', async () => {
    await openCreation();
    await chooseCustomer(EUR_CUSTOMER);
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await userEvent.click(createButton());
    expect(await screen.findByText('Choose a product.')).toBeTruthy();
    await chooseCustomer(USD_CUSTOMER);
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('USD');
    expect(screen.getByText('Choose a product.')).toBeTruthy();
  }, 30_000);

  it('another currency that really re-prices a line: the error of that line goes (the price is no longer the one it reported)', async () => {
    await openCreation();
    await chooseCustomer(EUR_CUSTOMER);
    await addLine();
    await typeInto(screen.getByRole('textbox', { name: /Line 1 unit price/ }), '0');
    await userEvent.click(createButton());
    expect(await screen.findByText(/Unit price must be greater than 0/)).toBeTruthy();
    await chooseCustomer(USD_CUSTOMER);
    expect(screen.getByRole('textbox', { name: /Line 1 unit price \(USD\)/ })).toHaveValue(
      minorToText(getProduct('prd-1')!.listPriceMinor.USD, 'USD'),
    );
    expect(screen.queryByText(/Unit price must be greater than 0/)).toBeNull();
    await userEvent.click(createButton());
    await listReady();
    expect(store().snapshot().at(-1)!.currency).toBe('USD');
  }, 40_000);
});
