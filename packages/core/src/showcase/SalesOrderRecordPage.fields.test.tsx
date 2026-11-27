import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_REFERENCE_POOL, makeProducts } from '../internal/demo-data';
import { SALES_ORDERS, sameValues } from './modules/sales-orders/sales-orders-module';
import { RecordPage } from './RecordPageShell';
import { createSalesOrderStore, type SalesOrderStore, type StoredSalesOrder } from './sales-order-store';

// #520 (round 2 of the code review): the dirty-tracking of EVERY editable field, the number texts that are not valid, the
// boundaries of the validation and the read-only state of a saved cancelled order. Same demo orders as
// SalesOrderRecordPage.test.tsx: so-15 EUR confirmed with 2 lines, so-42 JPY confirmed.
const CONFIRMED = 'so-15';
const JPY = 'so-42';

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
});
afterEach(cleanup);

function setup(recordId = CONFIRMED, store: SalesOrderStore = createSalesOrderStore()) {
  const onBack = vi.fn();
  const onSaved = vi.fn();
  render(<RecordPage module={SALES_ORDERS} store={store} recordId={recordId} onBack={onBack} onSaved={onSaved} />);
  return { store, onBack, onSaved };
}

// jsdom loads no CSS: a hidden footer is still in the tree, but `inert`.
const footer = () => {
  const el = screen.queryByRole('region', { name: 'Save actions', hidden: true });
  return el && !el.hasAttribute('inert') ? el : null;
};
const visibleBar = () =>
  waitFor(() => {
    const el = footer();
    expect(el).not.toBeNull();
    return el!;
  });
const gone = () => waitFor(() => expect(footer()).toBeNull());
const quantity = (n: number) => screen.findByRole('textbox', { name: `Line ${n} quantity` });
const orderTotal = () => document.querySelector('[data-order-total]')!;
const stored = (store: SalesOrderStore, id: string): StoredSalesOrder => store.snapshot().find((o) => o.id === id)!;
const save = async () => userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));

describe('dirty-tracking of every editable field (#520)', () => {
  const field = (label: RegExp | string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement;
  const date = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
  /** Types one more character, then removes it: the saved text is back. */
  const typeAndUndo = async (el: HTMLElement) => {
    const saved = (el as HTMLInputElement).value;
    await userEvent.type(el, '1');
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.type(el, '{Backspace}');
    expect(el).toHaveValue(saved);
    await gone();
  };
  const changeDate = async (el: HTMLInputElement, to: string) => {
    const saved = el.value;
    await userEvent.clear(el);
    await userEvent.type(el, to);
    expect(await visibleBar()).toBeInTheDocument();
    await userEvent.clear(el);
    await userEvent.type(el, saved);
    await gone();
  };
  const pickOption = async (combobox: HTMLElement, name: string) => {
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option', { name }));
  };
  const otherDay = (iso: string) => iso.replace(/-\d\d$/, (d) => (d === '-15' ? '-16' : '-15'));

  it('Status', async () => {
    setup();
    await quantity(1);
    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(status).toHaveTextContent('Confirmed');
    await pickOption(status, 'Shipped');
    expect(await visibleBar()).toBeInTheDocument();
    await pickOption(status, 'Confirmed');
    await gone();
  }, 20_000);

  it('Customer reference', async () => {
    setup();
    await quantity(1);
    await typeAndUndo(field('Customer reference'));
  });

  it('Order date', async () => {
    setup();
    await quantity(1);
    const el = date(/Order date/);
    await changeDate(el, otherDay(el.value));
  });

  it('Requested delivery', async () => {
    setup();
    await quantity(1);
    const el = date(/^Requested delivery/);
    await changeDate(el, otherDay(el.value));
  });

  it('Delivery instructions', async () => {
    setup();
    await quantity(1);
    await typeAndUndo(field('Delivery instructions'));
  });

  it('Notes', async () => {
    setup();
    await quantity(1);
    await typeAndUndo(field('Notes'));
  });

  it('the product of a line', async () => {
    // The saved product of line 1 must be one the Select offers again (a discontinued one, or one outside the 50
    // first active products, is shown but cannot be picked back), so the seed of this test gives it one that is.
    const first = makeProducts(DEMO_REFERENCE_POOL.products).find((p) => p.status === 'active')!;
    const seed = createSalesOrderStore()
      .snapshot()
      .map((o) => (o.id === CONFIRMED ? { ...o, lines: o.lines.map((l, i) => (i === 0 ? { ...l, productId: first.id } : l)) } : o));
    setup(CONFIRMED, createSalesOrderStore(seed));
    await quantity(1);
    const saved = `${first.name} (${first.sku})`;
    const product = screen.getByRole('combobox', { name: 'Line 1 product' });
    expect(product).toHaveTextContent(first.name);
    await userEvent.click(product);
    const other = (await screen.findAllByRole('option')).find((o) => o.textContent !== saved)!;
    await userEvent.click(other);
    expect(await visibleBar()).toBeInTheDocument();
    await pickOption(screen.getByRole('combobox', { name: 'Line 1 product' }), saved);
    await gone();
  }, 30_000);

  it('Line 1 quantity', async () => {
    setup();
    await typeAndUndo(await quantity(1));
  });

  it('Line 1 unit price', async () => {
    setup();
    await quantity(1);
    await typeAndUndo(screen.getByRole('textbox', { name: /^Line 1 unit price/ }));
  });

  it('Line 1 discount', async () => {
    setup();
    await quantity(1);
    await typeAndUndo(screen.getByRole('textbox', { name: 'Line 1 discount (%)' }));
  });
});

describe('sameValues, key by key (#520)', () => {
  const base = SALES_ORDERS.form.toValues(stored(createSalesOrderStore(), CONFIRMED));
  const withPatch = (patch: Partial<typeof base>) => ({ ...base, ...patch });

  it('is true for a copy', () => {
    expect(sameValues(base, { ...base, lines: base.lines.map((l) => ({ ...l })) })).toBe(true);
  });

  it('is false when any single editable key differs', () => {
    expect(sameValues(base, withPatch({ status: 'shipped' }))).toBe(false);
    expect(sameValues(base, withPatch({ customerReference: `${base.customerReference}x` }))).toBe(false);
    expect(sameValues(base, withPatch({ orderDate: '2020-01-01' }))).toBe(false);
    expect(sameValues(base, withPatch({ requestedDeliveryDate: '2099-12-31' }))).toBe(false);
    expect(sameValues(base, withPatch({ deliveryNotes: `${base.deliveryNotes}x` }))).toBe(false);
    expect(sameValues(base, withPatch({ notes: `${base.notes}x` }))).toBe(false);
    expect(sameValues(base, withPatch({ lines: base.lines.slice(1) }))).toBe(false);
    for (const key of ['productId', 'quantity', 'unitPrice', 'discount'] as const) {
      const lines = base.lines.map((l, i) => (i === 0 ? { ...l, [key]: key === 'productId' ? 'prd-0001' : `${l[key]}1` } : l));
      expect(sameValues(base, withPatch({ lines })), key).toBe(false);
    }
  });

  it('the identity fields are carried, not edited: they do not count', () => {
    expect(sameValues(base, withPatch({ customerName: 'Somebody else' }))).toBe(true);
  });
});

describe('a number text that is not valid is always a change (#520)', () => {
  const retype = async (name: RegExp | string, text: string) => {
    const el = screen.getByRole('textbox', { name });
    await userEvent.clear(el);
    await userEvent.type(el, text);
    return el;
  };

  it('quantity 5 -> 5.0: the bar shows, the totals are unavailable, Save explains why', async () => {
    const { onSaved } = setup();
    await quantity(1);
    await retype('Line 1 quantity', '5.0');
    expect(await visibleBar()).toBeInTheDocument();
    expect(orderTotal()).toHaveTextContent('—');
    await save();
    expect(await screen.findByText(/^Quantity must be a whole number from 1 to 99,999/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('the saved quantity with a leading zero is the same valid number: not a change', async () => {
    setup();
    const el = (await quantity(1)) as HTMLInputElement;
    const saved = el.value;
    await userEvent.clear(el);
    await userEvent.type(el, `0${saved}`);
    await gone();
    expect(orderTotal().textContent).not.toBe('—');
  });

  it('the saved unit price with a third decimal (88.25 -> 88.250 in EUR): the bar shows, an error on Save', async () => {
    setup();
    await quantity(1);
    await userEvent.type(screen.getByRole('textbox', { name: /^Line 1 unit price/ }), '0');
    expect(await visibleBar()).toBeInTheDocument();
    expect(orderTotal()).toHaveTextContent('—');
    await save();
    expect(await screen.findByText(/at most 2 decimals/)).toBeInTheDocument();
  });

  it('JPY 1250 -> 1250.0: the bar shows, an error on Save', async () => {
    setup(JPY);
    await quantity(1);
    await userEvent.type(screen.getByRole('textbox', { name: /^Line 1 unit price \(JPY\)/ }), '.0');
    expect(await visibleBar()).toBeInTheDocument();
    expect(orderTotal()).toHaveTextContent('—');
    await save();
    expect(await screen.findByText(/no decimals/)).toBeInTheDocument();
  });

  it('a discount 0 -> 0.0 is a change with its error', async () => {
    setup();
    await quantity(1);
    await retype('Line 1 discount (%)', '0.0');
    expect(await visibleBar()).toBeInTheDocument();
    await save();
    expect(await screen.findByText(/^Discount must be a whole percent/)).toBeInTheDocument();
  });
});

describe('validation boundaries (#520)', () => {
  const setDate = async (label: RegExp, value: string) => {
    const el = screen.getByLabelText(label);
    await userEvent.clear(el);
    await userEvent.type(el, value);
  };

  it('a delivery on the same day as the order is accepted', async () => {
    const { onSaved } = setup();
    await quantity(1);
    await setDate(/Order date/, '2026-03-10');
    await setDate(/^Requested delivery/, '2026-03-10');
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Requested delivery cannot be before the order date.')).toBeNull();
  });

  it('a delivery one day before the order date is refused', async () => {
    const { onSaved } = setup();
    await quantity(1);
    await setDate(/Order date/, '2026-03-10');
    await setDate(/^Requested delivery/, '2026-03-09');
    await save();
    expect(await screen.findByText('Requested delivery cannot be before the order date.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('an empty order date is refused: required, linked to the field, nothing saved', async () => {
    const { onSaved, store } = setup();
    await quantity(1);
    const before = JSON.stringify(stored(store, CONFIRMED));
    const el = screen.getByLabelText(/Order date/);
    await userEvent.clear(el);
    await save();
    const message = await screen.findByText('Order date is required.');
    expect(el.getAttribute('aria-describedby')).toContain(message.id);
    expect(onSaved).not.toHaveBeenCalled();
    expect(JSON.stringify(stored(store, CONFIRMED))).toBe(before);
  });

  it('a unit price of 1,000,000.00 is refused (no total), 999,999.99 is accepted and stored', async () => {
    const { store, onSaved } = setup();
    const price = (await screen.findByRole('textbox', { name: /^Line 1 unit price/ })) as HTMLInputElement;
    await userEvent.clear(price);
    await userEvent.type(price, '1000000.00');
    expect(orderTotal()).toHaveTextContent('—');
    await save();
    expect(await screen.findByText('Unit price is too large.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    await userEvent.clear(price);
    await userEvent.type(price, '999999.99');
    expect(orderTotal().textContent).not.toBe('—');
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(stored(store, CONFIRMED).lines[0]!.unitPriceMinor).toBe(99_999_999);
  });
});

describe('the read-only state follows the SAVED status (#520)', () => {
  it('changing the status of an order to Cancelled does not lock the page: only the saved status does', async () => {
    const { store, onSaved } = setup();
    const field = await quantity(1);
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cancelled' }));
    expect(await visibleBar()).toBeInTheDocument();
    // Still editable: nothing is read-only and the lines keep their buttons.
    expect(field).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Add line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeInTheDocument();
    await userEvent.type(field, '1');
    expect(field).toHaveFocus();
    // It saves; from then on the SAVED status is cancelled and the page is locked.
    await save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(stored(store, CONFIRMED).status).toBe('cancelled');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Line 1 quantity' })).toHaveAttribute('readonly'));
  }, 30_000);
});
