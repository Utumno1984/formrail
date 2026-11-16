import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProduct } from '../internal/demo-data';
import { minorToText } from './modules/sales-orders/order-lines';
import { SALES_ORDERS_CRUD, type SalesOrderValues } from './modules/sales-orders/sales-orders-module';
import { RecordCrud, type RecordCrudProps } from './RecordCrud';
import type { SalesOrderDraft, SalesOrderStore, StoredSalesOrder } from './sales-order-store';

// #521: the sales orders are created and deleted in the shell: the creation page (born clean, dirty-tracked field by
// field, validated, one Create per gesture, a failure that can be retried), the deletion from the row and from the
// page (named confirmation, one call per confirmation, an error that keeps the order and can be retried) and the bulk
// deletion with its count. Same demo orders as the other sales order tests.
const EUR_CUSTOMER = 'Hoevenstrand Coatings BV (EUR)';
const USD_CUSTOMER = 'Quillenbrook Components Corp. (USD)';

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Props = Partial<RecordCrudProps<StoredSalesOrder, SalesOrderValues, SalesOrderDraft>>;
const renderCrud = (props: Props = {}) =>
  render(
    <StrictMode>
      <RecordCrud
        module={SALES_ORDERS_CRUD}
        history="replace"
        listLoadDelayMs={0}
        recordLoadDelayMs={0}
        saveDelayMs={0}
        today="2026-11-09"
        onNavigate={vi.fn()}
        {...props}
      />
    </StrictMode>,
  );

const store = (): SalesOrderStore => {
  const s = (window as unknown as { __ropShowcaseStore?: SalesOrderStore }).__ropShowcaseStore;
  if (!s) throw new Error('no store');
  return s;
};
const shownNumbers = (): string[] =>
  screen.queryAllByRole('button', { name: /^Actions for / }).map((b) => b.getAttribute('aria-label')!.slice('Actions for '.length));
const listReady = async (): Promise<string[]> => {
  await waitFor(() => expect(shownNumbers().length).toBeGreaterThan(5));
  return shownNumbers();
};
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

async function openCreation(props: Props = {}) {
  renderCrud(props);
  await listReady();
  await userEvent.click(screen.getByRole('button', { name: 'New sales order' }));
  return screen.findByRole('heading', { level: 1, name: 'New sales order' });
}
const pick = async (combobox: HTMLElement, name: string) => {
  await userEvent.click(combobox);
  await userEvent.click(await screen.findByRole('option', { name }));
};
const chooseCustomer = (name = EUR_CUSTOMER) => pick(screen.getByRole('combobox', { name: /Customer/ }), name);
const addLine = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
  await userEvent.click(await screen.findByRole('combobox', { name: /Line 1 product/ }));
  await userEvent.click((await screen.findAllByRole('option'))[0]!);
};
const typeInto = async (el: HTMLElement, text: string) => {
  await userEvent.clear(el);
  await userEvent.type(el, text);
};
const createButton = () => screen.getByRole('button', { name: 'Create' });

/** A valid new order: the EUR customer and one line. */
async function fillValid() {
  await chooseCustomer();
  await addLine();
  await typeInto(screen.getByRole('textbox', { name: /Line 1 quantity/ }), '3');
  await typeInto(screen.getByRole('textbox', { name: /Line 1 unit price/ }), '10.50');
}

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
    expect(screen.getByText('Order total:').textContent).toBe('Order total: €0.00');
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
    // Same currency (another euro customer is not offered first, so the same one again): the typed price stays.
    await chooseCustomer(EUR_CUSTOMER);
    expect(price()).toHaveValue('1.00');
    await chooseCustomer(USD_CUSTOMER);
    expect(screen.getByRole('textbox', { name: /Currency/ })).toHaveValue('USD');
    expect(screen.getByRole('textbox', { name: /Line 1 unit price \(USD\)/ })).toHaveValue(
      minorToText(getProduct('prd-1')!.listPriceMinor.USD, 'USD'),
    );
  }, 40_000);
});

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
