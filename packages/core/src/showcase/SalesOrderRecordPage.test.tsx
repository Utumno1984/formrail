import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SALES_ORDERS, sameValues } from './modules/sales-orders/sales-orders-module';
import { RecordPage } from './RecordPageShell';
import { createSalesOrderStore, type SalesOrderStore, type StoredSalesOrder } from './sales-order-store';

// #520: the record page of a sales order, in the record-editing shell. The ids are demo orders of the seed
// (`makeShowcaseSalesOrders`): so-15 EUR confirmed with 2 lines, so-42 JPY confirmed, so-28 cancelled with 1 line,
// so-12 shipped with a discontinued product on a line, so-27 confirmed with 18 lines.
const CONFIRMED = 'so-15';
const JPY = 'so-42';
const CANCELLED = 'so-28';
const DISCONTINUED = 'so-12';
const LONG = 'so-27';

// jsdom lacks what Radix Select measures and scrolls with.
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
  // jsdom has no scrollIntoView (a failed Save moves the focus to the first invalid field).
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function setup(config: Parameters<typeof createSalesOrderStore>[1] = {}, recordId = CONFIRMED) {
  const store = createSalesOrderStore(undefined, config);
  const onBack = vi.fn();
  const onSaved = vi.fn();
  const ui = (id: string, s: SalesOrderStore = store) => (
    <RecordPage module={SALES_ORDERS} store={s} recordId={id} onBack={onBack} onSaved={onSaved} />
  );
  const view = render(ui(recordId));
  return { store, onBack, onSaved, view, ui };
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
const quantity = (n: number) => screen.findByRole('textbox', { name: `Line ${n} quantity` });
const orderTotal = () => document.querySelector('[data-order-total]')!;
const stored = (store: SalesOrderStore, id: string): StoredSalesOrder => store.snapshot().find((o) => o.id === id)!;

describe('the Sales orders module: values (#520)', () => {
  it('every order of the seed reads into values and back to the same order, and is its own baseline', () => {
    for (const order of createSalesOrderStore().snapshot()) {
      const values = SALES_ORDERS.form.toValues(order);
      expect(sameValues(values, SALES_ORDERS.form.toValues(order))).toBe(true);
      expect(SALES_ORDERS.form.toRecord(order, values)).toEqual(order);
      expect(SALES_ORDERS.form.validate(values)).toEqual({});
    }
  });
});

describe('SalesOrderRecordPage (#520)', () => {
  it('mounts no editable field while the order is in flight, then mounts the editor hydrated and clean', async () => {
    const { store } = setup({ loadDelayMs: 50 });
    expect(screen.getByRole('status')).toHaveTextContent('Loading sales order');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    const first = await quantity(1);
    expect(first).toHaveValue(String(stored(store, CONFIRMED).lines[0]!.quantity));
    expect(footer()).toBeNull();
    // The values arrived with the editor: no gesture was made, so nothing is dirty and nothing was reported.
    expect(screen.queryByText(/modified/i)).toBeNull();
  });

  it('the header shows the number, the customer, the status and the saved total', async () => {
    const { store } = setup();
    const order = stored(store, CONFIRMED);
    const header = (await screen.findByRole('heading', { level: 1 })).parentElement!.parentElement!;
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent(order.number);
    expect(header).toHaveTextContent(order.customerName);
    expect(header).toHaveTextContent('Confirmed');
    expect(header).toHaveTextContent(/€[\d,]+\.\d{2}/);
  });

  it('has the sections General, Lines, Delivery and Notes in the Anchor Bar', async () => {
    setup();
    await quantity(1);
    const bar = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(bar).getAllByRole('link').map((l) => l.textContent)).toEqual(['General', 'Lines', 'Delivery', 'Notes']);
  });

  it('a load error offers Retry, which can succeed', async () => {
    setup({ loadOutcome: 'error-once' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the sales order');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await quantity(1)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dirty is computed against the baseline: a changed quantity shows the bar and the new total, the old value hides it', async () => {
    setup();
    const field = await quantity(1);
    const original = (field as HTMLInputElement).value;
    const totalBefore = orderTotal().textContent;
    await userEvent.type(field, '0');
    expect(await visibleBar()).toBeInTheDocument();
    expect(orderTotal().textContent).not.toBe(totalBefore);
    await userEvent.type(field, '{Backspace}');
    expect(field).toHaveValue(original);
    await waitFor(() => expect(footer()).toBeNull());
    expect(orderTotal().textContent).toBe(totalBefore);
  });

  it('the total of the order is the sum of the line totals, in the order currency', async () => {
    setup();
    await quantity(1);
    const lines = [...document.querySelectorAll('[data-line-total]')].map((el) => el.textContent!);
    const cents = (text: string) => Math.round(Number(text.replace(/[^\d.]/g, '')) * 100);
    expect(lines.length).toBe(2);
    expect(cents(orderTotal().textContent!)).toBe(lines.reduce((sum, t) => sum + cents(t), 0));
  });

  it('Save stores the order with the total derived from its lines and clears the bar', async () => {
    const { store, onSaved } = setup();
    const field = await quantity(1);
    await userEvent.clear(field);
    await userEvent.type(field, '7');
    await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(footer()).toBeNull());
    const saved = stored(store, CONFIRMED);
    expect(saved.lines[0]!.quantity).toBe(7);
    expect(saved.totalMinor).toBe(
      saved.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceMinor - Math.floor((2 * l.quantity * l.unitPriceMinor * l.discountPercent + 100) / 200), 0),
    );
    expect(onSaved.mock.calls[0]![0]).toEqual(saved);
  });

  describe('lines', () => {
    it('adds a line: the focus goes to its product, it takes the list price of the product, the order total follows', async () => {
      setup();
      await quantity(1);
      const before = orderTotal().textContent;
      await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
      const product = screen.getByRole('combobox', { name: 'Line 3 product' });
      expect(product).toHaveFocus();
      expect(await visibleBar()).toBeInTheDocument();
      // Not valid yet (no product, no price): no total for the line and none for the order.
      expect(orderTotal()).toHaveTextContent('—');
      await userEvent.click(product);
      await userEvent.click((await screen.findAllByRole('option'))[0]!);
      const price = screen.getByRole('textbox', { name: /^Line 3 unit price/ }) as HTMLInputElement;
      expect(price.value).toMatch(/^\d+\.\d{2}$/);
      expect(orderTotal().textContent).not.toBe('—');
      expect(orderTotal().textContent).not.toBe(before);
    }, 20_000);

    it('removes a line: the focus goes to the Remove of the line that took its place, then to "Add line"', async () => {
      setup();
      await quantity(1);
      await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
      expect(screen.getByRole('button', { name: 'Remove line 1' })).toHaveFocus();
      await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
      expect(screen.getByRole('button', { name: 'Add line' })).toHaveFocus();
      expect(screen.getByText('No lines')).toBeInTheDocument();
      expect(orderTotal()).toHaveTextContent('€0.00');
    });

    it('moves a line down and keeps the focus on the same control, which is now one line lower', async () => {
      setup();
      await quantity(1);
      const firstProduct = screen.getByRole('combobox', { name: 'Line 1 product' }).textContent;
      await userEvent.click(screen.getByRole('button', { name: 'Move line 1 down' }));
      expect(screen.getByRole('combobox', { name: 'Line 2 product' })).toHaveTextContent(firstProduct!);
      expect(screen.getByRole('button', { name: 'Move line 2 down' })).toHaveFocus();
      expect(await visibleBar()).toBeInTheDocument();
    });

    it('a line whose product is discontinued keeps it visible although it is not among the options', async () => {
      const { store } = setup({}, DISCONTINUED);
      await quantity(1);
      const discontinued = screen.getAllByRole('combobox').filter((c) => /discontinued/.test(c.textContent ?? ''));
      expect(discontinued.length).toBeGreaterThan(0);
      expect(stored(store, DISCONTINUED).lines.length).toBeGreaterThanOrEqual(discontinued.length);
      await userEvent.click(discontinued[0]!);
      const options = await screen.findAllByRole('option');
      expect(options.some((o) => /discontinued/.test(o.textContent ?? ''))).toBe(false);
      await userEvent.keyboard('{Escape}');
    }, 20_000);

    it('an order of 18 lines renders them all, each with its own fields', async () => {
      setup({}, LONG);
      await quantity(18);
      expect(screen.getAllByRole('button', { name: /^Remove line / })).toHaveLength(18);
    }, 30_000);
  });

  describe('validation', () => {
    const save = async () => userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));

    it('a quantity of 0 is refused: the message is linked to the field and the summary counts it, nothing is saved', async () => {
      const { store, onSaved } = setup();
      const before = JSON.stringify(stored(store, CONFIRMED));
      const field = await quantity(1);
      await userEvent.clear(field);
      await userEvent.type(field, '0');
      await save();
      const message = await screen.findByText(/^Quantity must be a whole number from 1 to 99,999/);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field.getAttribute('aria-describedby')).toContain(message.id);
      expect(footer()).toHaveTextContent('1 invalid field');
      expect(field).toHaveFocus();
      expect(onSaved).not.toHaveBeenCalled();
      expect(JSON.stringify(stored(store, CONFIRMED))).toBe(before);
    });

    it('an order with no line is refused: the message is linked to "Add line", which takes the focus', async () => {
      const { onSaved } = setup();
      await quantity(1);
      await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
      await save();
      const message = await screen.findByText('Add at least one line.');
      const add = screen.getByRole('button', { name: 'Add line' });
      expect(add.getAttribute('aria-describedby')).toBe(message.id);
      await waitFor(() => expect(add).toHaveFocus());
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('a delivery date before the order date is refused', async () => {
      const { onSaved } = setup();
      await quantity(1);
      const delivery = screen.getByLabelText(/^Requested delivery/);
      const orderDate = (screen.getByLabelText(/Order date/) as HTMLInputElement).value;
      const earlier = `${String(Number(orderDate.slice(0, 4)) - 1)}${orderDate.slice(4)}`;
      await userEvent.clear(delivery);
      await userEvent.type(delivery, earlier);
      await save();
      const message = await screen.findByText('Requested delivery cannot be before the order date.');
      expect(delivery.getAttribute('aria-describedby')).toContain(message.id);
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('a line without a product is refused with its own message', async () => {
      setup();
      await quantity(1);
      await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
      await save();
      const message = await screen.findByText('Choose a product.');
      expect(screen.getByRole('combobox', { name: 'Line 3 product' }).getAttribute('aria-describedby')).toContain(message.id);
    }, 20_000);
  });

  describe('currencies without decimals', () => {
    it('a JPY order shows whole yen in the unit price and in every total, and refuses decimals', async () => {
      setup({}, JPY);
      const price = (await screen.findByRole('textbox', { name: /^Line 1 unit price \(JPY\)/ })) as HTMLInputElement;
      expect(price.value).toMatch(/^\d+$/);
      expect(document.querySelector('[data-line-total]')!.textContent).toMatch(/^¥[\d,]+$/);
      expect(orderTotal().textContent).toMatch(/^¥[\d,]+$/);
      await userEvent.type(price, '.5');
      await userEvent.click(within(await visibleBar()).getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(/no decimals/)).toBeInTheDocument();
    });
  });

  describe('a cancelled order is read-only', () => {
    it('every field is locked and explained, no button changes the lines, no Save bar can appear', async () => {
      setup({}, CANCELLED);
      const field = await quantity(1);
      expect(field).toHaveAttribute('readonly');
      const describedBy = field.getAttribute('aria-describedby') ?? '';
      expect(describedBy).not.toBe('');
      expect(document.getElementById(describedBy.split(' ')[0]!)).toHaveTextContent('A cancelled order cannot be edited.');
      expect(screen.getByLabelText(/Order date/)).toHaveAttribute('readonly');
      expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('readonly');
      expect(screen.queryByRole('button', { name: 'Add line' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Remove line/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Move line/ })).toBeNull();
      // The keyboard changes nothing either.
      const value = (field as HTMLInputElement).value;
      await userEvent.type(field, '9');
      expect(field).toHaveValue(value);
      expect(footer()).toBeNull();
      // The Selects too: focusable, explained, and the keyboard opens nothing.
      for (const name of ['Status', 'Line 1 product']) {
        const select = screen.getByRole('combobox', { name });
        expect(select.getAttribute('aria-describedby') ?? '').not.toBe('');
        select.focus();
        await userEvent.keyboard('{Enter}{ArrowDown}');
        expect(screen.queryByRole('option')).toBeNull();
      }
    });
  });
});
