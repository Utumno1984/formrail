import { describe, expect, it } from 'vitest';
import { addDays, localToday } from '../../../calendar/date-math';
import { createSalesOrderStore } from '../../sales-order-store';
import { SALES_ORDERS, SALES_ORDERS_CRUD, defaultValues, sameValues, toDraft, validateOrder, type SalesOrderValues } from './sales-orders-module';
import type { OrderLineValues } from './order-lines';

// #521: the creation of a sales order: the values a new order starts with, what is sent to the "server", the rules
// that stop a Create, and the dirty comparison of the creation page (a new page is born clean).
const TODAY = '2026-11-09';
const line = (over: Partial<OrderLineValues> = {}): OrderLineValues => ({
  id: 'new-1',
  productId: 'prd-1',
  quantity: '2',
  unitPrice: '10.50',
  discount: '0',
  ...over,
});
/** A valid new order: customer, one line. */
const valid = (over: Partial<SalesOrderValues> = {}): SalesOrderValues => ({
  ...defaultValues(TODAY),
  customerId: 'cus-1',
  customerName: 'Hoevenstrand Coatings BV',
  currency: 'EUR',
  lines: [line()],
  ...over,
});

describe('the module that creates and deletes (#521)', () => {
  it('SALES_ORDERS_CRUD adds creation, deletion and bulk deletion; SALES_ORDERS (the #520 stories) stays read-and-edit', () => {
    expect(SALES_ORDERS_CRUD.create).toBeDefined();
    expect(SALES_ORDERS_CRUD.delete).toBe(true);
    expect(SALES_ORDERS_CRUD.deleteMany).toBe(true);
    expect(SALES_ORDERS.create).toBeUndefined();
    expect(SALES_ORDERS.delete).toBeUndefined();
    expect(SALES_ORDERS.deleteMany).toBeUndefined();
    expect(SALES_ORDERS_CRUD.name).toBe(SALES_ORDERS.name);
  });
});

describe('defaultValues (the creation page starts here)', () => {
  it('no customer, euro until one is chosen, a draft, dated `today`, delivery requested in 14 days, no line', () => {
    expect(defaultValues(TODAY)).toEqual({
      customerId: '',
      customerName: '',
      currency: 'EUR',
      status: 'draft',
      customerReference: '',
      orderDate: '2026-11-09',
      requestedDeliveryDate: '2026-11-23',
      deliveryNotes: '',
      notes: '',
      lines: [],
    });
  });

  it('the delivery date crosses a month and a year end', () => {
    expect(defaultValues('2026-12-25').requestedDeliveryDate).toBe('2027-01-08');
  });

  it.each([undefined, '', '2026-02-30', '2026-13-01', '09/11/2026', ' 2026-11-09'])(
    'a `today` that is not a real calendar date (%j) falls back to the local date',
    (today) => {
      const values = defaultValues(today);
      expect(values.orderDate).toBe(localToday());
      expect(values.requestedDeliveryDate).toBe(addDays(localToday(), 14));
    },
  );

  it('a new page is born clean: the defaults are equal to themselves ("" against "")', () => {
    expect(sameValues(defaultValues(TODAY), defaultValues(TODAY))).toBe(true);
  });

  it('every call returns its own lines (the baseline is never shared with the draft the form edits)', () => {
    expect(defaultValues(TODAY).lines).not.toBe(defaultValues(TODAY).lines);
  });
});

describe('sameValues: every editable field of the creation page is compared (modify -> dirty, put back -> clean)', () => {
  const base = defaultValues(TODAY);
  const changes: [string, Partial<SalesOrderValues>][] = [
    ['customer', { customerId: 'cus-2' }],
    ['status', { status: 'confirmed' }],
    ['customer reference', { customerReference: 'PO-1' }],
    ['order date', { orderDate: '2026-11-10' }],
    ['requested delivery', { requestedDeliveryDate: '2026-11-24' }],
    ['delivery instructions', { deliveryNotes: 'Dock 3' }],
    ['notes', { notes: 'Fragile' }],
    ['lines', { lines: [line()] }],
  ];
  it.each(changes)('%s: a change is a difference, the old value back is the same', (_name, change) => {
    const changed = { ...base, ...change };
    expect(sameValues(changed, base)).toBe(false);
    expect(sameValues(base, changed)).toBe(false);
    const back = { ...changed, ...Object.fromEntries(Object.keys(change).map((k) => [k, base[k as keyof SalesOrderValues]])) } as SalesOrderValues;
    expect(sameValues(back, base)).toBe(true);
  });

  it('a space typed in an optional text is a change, however it looks', () => {
    expect(sameValues({ ...base, notes: ' ' }, base)).toBe(false);
  });

  it('an order of another customer is another order even with the same everything else', () => {
    const a = valid();
    expect(sameValues(a, { ...a, customerId: 'cus-3' })).toBe(false);
  });
});

describe('validateOrder: what stops a Create', () => {
  it('a valid order has no error', () => {
    expect(validateOrder(valid())).toEqual({});
  });

  it('the defaults are not valid: the customer and the lines are what is missing (2 invalid fields)', () => {
    expect(Object.keys(validateOrder(defaultValues(TODAY))).sort()).toEqual(['customerId', 'lines']);
  });

  it('customer: required, and the message says so; any chosen id passes', () => {
    expect(validateOrder(valid({ customerId: '' })).customerId).toBe('Customer is required.');
    expect(validateOrder(valid({ customerId: 'cus-9' })).customerId).toBeUndefined();
  });

  it('lines: none is an error on the order; one is enough', () => {
    expect(validateOrder(valid({ lines: [] })).lines).toBe('Add at least one line.');
    expect(validateOrder(valid({ lines: [line()] })).lines).toBeUndefined();
  });

  it('an empty line is reported (never dropped): no product, no price', () => {
    const errors = validateOrder(valid({ lines: [line({ productId: '', unitPrice: '' })] }));
    expect(errors['lines.0.productId']).toBe('Choose a product.');
    expect(errors['lines.0.unitPrice']).toMatch(/Unit price must be/);
  });

  it('delivery: the same day as the order is valid, the day before is not', () => {
    expect(validateOrder(valid({ orderDate: '2026-11-09', requestedDeliveryDate: '2026-11-09' })).requestedDeliveryDate).toBeUndefined();
    expect(validateOrder(valid({ orderDate: '2026-11-09', requestedDeliveryDate: '2026-11-08' })).requestedDeliveryDate).toBe(
      'Requested delivery cannot be before the order date.',
    );
  });

  it('dates: a missing or impossible date is an error on its own field', () => {
    expect(validateOrder(valid({ orderDate: '' })).orderDate).toBe('Order date is required.');
    expect(validateOrder(valid({ requestedDeliveryDate: '2026-02-30' })).requestedDeliveryDate).toBe('Requested delivery date is required.');
  });
});

describe('toDraft: what the client sends', () => {
  it('the customer with its currency, the values and the lines in minor units; no identity, no number, no total', () => {
    const draft = toDraft(valid({ customerReference: 'PO-7', notes: 'n', lines: [line({ quantity: '3', unitPrice: '10.50', discount: '10' })] }));
    expect(draft).toEqual({
      customerId: 'cus-1',
      customerName: 'Hoevenstrand Coatings BV',
      currency: 'EUR',
      status: 'draft',
      customerReference: 'PO-7',
      orderDate: '2026-11-09',
      requestedDeliveryDate: '2026-11-23',
      deliveryNotes: '',
      notes: 'n',
      lines: [{ id: 'new-1', productId: 'prd-1', quantity: 3, unitPriceMinor: 1050, discountPercent: 10 }],
    });
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('number');
    expect(draft).not.toHaveProperty('totalMinor');
  });

  it('yen have no decimals: 1200 is 1200 minor units', () => {
    const draft = toDraft(valid({ currency: 'JPY', lines: [line({ unitPrice: '1200' })] }));
    expect(draft.lines[0]!.unitPriceMinor).toBe(1200);
  });
});

describe('the "server" creates (sales-order-store)', () => {
  it('assigns the id and the number, derives the total from the lines; the order is in the store', async () => {
    const store = createSalesOrderStore(undefined, { saveDelayMs: 0 });
    const made = await store.create(toDraft(valid({ lines: [line({ quantity: '3', unitPrice: '10.50', discount: '10' })] })));
    expect(made.id).toBe('so-new-201');
    expect(made.number).toBe('SO-NEW-0201');
    // 3 x 10.50 = 31.50, minus 10 % = 28.35
    expect(made.totalMinor).toBe(2835);
    expect(store.snapshot()).toHaveLength(201);
    expect(store.snapshot().at(-1)).toEqual(made);
  });

  it('the number is never reused, also after the order was deleted', async () => {
    const store = createSalesOrderStore(undefined, { saveDelayMs: 0 });
    const first = await store.create(toDraft(valid()));
    await store.delete(first.id);
    const second = await store.create(toDraft(valid()));
    expect(second.number).toBe('SO-NEW-0202');
    expect(second.id).not.toBe(first.id);
  });

  it('a failing Create stores nothing and consumes no number', async () => {
    const store = createSalesOrderStore(undefined, { saveDelayMs: 0, saveOutcome: 'error' });
    await expect(store.create(toDraft(valid()))).rejects.toThrow();
    expect(store.snapshot()).toHaveLength(200);
    store.configure({ saveOutcome: 'success' });
    expect((await store.create(toDraft(valid()))).number).toBe('SO-NEW-0201');
  });
});
