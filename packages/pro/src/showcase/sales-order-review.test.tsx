// #522: the review of a sales order save (Change Summary with the engine's labels and reorders), as pure functions
// and as the rendered list. Fast: no shell, no list of 200 orders.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_REFERENCE_POOL, formatDate, getProduct, makeProducts, type DemoCurrency } from '../../../core/src/internal/demo-data';
import { SALES_ORDERS, sameValues, type SalesOrderValues } from '../../../core/src/showcase/modules/sales-orders/sales-orders-module';
import type { OrderLineValues } from '../../../core/src/showcase/modules/sales-orders/order-lines';
import { makeShowcaseSalesOrders } from '../../../core/src/showcase/sales-order-store';
import { computeChangeSummaryResult } from '../change-summary/compute-change-summary';
import type { ChangeEntry } from '../change-summary/types';
import {
  ORDER_ALSO_NOTE,
  ORDER_ONLY_DESCRIPTION,
  SALES_ORDER_ARRAY_ID_KEYS,
  SALES_ORDER_LABELS,
  salesOrderEngine,
  salesOrderLineLabel,
  salesOrderReview,
  salesOrderSaveReview,
  salesOrderValueText,
} from './sales-order-review';

afterEach(cleanup);

const ORDERS = makeShowcaseSalesOrders();
const valuesOf = (id: string): SalesOrderValues => {
  const order = ORDERS.find((o) => o.id === id);
  if (!order) throw new Error(`no order ${id}`);
  return SALES_ORDERS.form.toValues(order);
};

// so-1: EUR, invoiced, 3 lines, notes and delivery instructions. so-13: USD, 4 lines. so-42: JPY, 2 lines.
const EUR = valuesOf('so-1');
const USD = valuesOf('so-13');
const JPY = valuesOf('so-42');

const nameOf = (line: OrderLineValues): string => getProduct(line.productId)!.name;
const withLine = (v: SalesOrderValues, index: number, patch: Partial<OrderLineValues>): SalesOrderValues => ({
  ...v,
  lines: v.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
});
const review = (values: SalesOrderValues, baseline: SalesOrderValues) => salesOrderReview({ values, baseline });
const summary = (values: SalesOrderValues, baseline: SalesOrderValues) =>
  review(values, baseline).entries.map((e) => ({ path: e.path, label: e.label, kind: e.kind }));
const text = (value: unknown, entry: Partial<ChangeEntry> & { path: string }, currency: DemoCurrency = 'EUR') =>
  salesOrderValueText(value, { labelPath: [], label: '', kind: 'changed', before: undefined, after: undefined, beforeMissing: false, afterMissing: false, ...entry }, currency);

describe('salesOrderReview: the fields of the order', () => {
  // One row per editable field of the page: changed, it is ONE entry named like its Field; put back, none.
  it.each([
    ['status', 'Status', 'confirmed'],
    ['customerReference', 'Customer reference', 'PO-7781'],
    ['orderDate', 'Order date', '2026-05-20'],
    ['requestedDeliveryDate', 'Requested delivery', '2026-07-01'],
    ['deliveryNotes', 'Delivery instructions', 'Dock 3'],
    ['notes', 'Notes', 'Checked by sales.'],
  ] as const)('%s: one entry "%s" when changed, none when put back', (key, label, value) => {
    const changed = { ...EUR, [key]: value };
    expect(summary(changed, EUR)).toEqual([{ path: key, label, kind: 'changed' }]);
    expect(summary({ ...changed, [key]: EUR[key] }, EUR)).toEqual([]);
    expect(review({ ...changed, [key]: EUR[key] }, EUR).reorders).toEqual([]);
  });

  it.each([
    ['productId', 'Product', 'prd-1'],
    ['quantity', 'Quantity', '7'],
    ['unitPrice', 'Unit price', '12.34'],
    ['discount', 'Discount (%)', '35'],
  ] as const)('line field %s: one entry on that row, named by its position and product, then "%s"', (field, label, value) => {
    const changed = withLine(EUR, 1, { [field]: value });
    const row = `Line 2 (${nameOf(changed.lines[1]!)})`;
    expect(summary(changed, EUR)).toEqual([{ path: `lines.1.${field}`, label: `Lines > ${row} > ${label}`, kind: 'changed' }]);
    expect(summary(withLine(changed, 1, { [field]: EUR.lines[1]![field] }), EUR)).toEqual([]);
  });

  it('the labels are the Fields of the page (one per editable field, plus the line fields)', () => {
    expect(SALES_ORDER_LABELS).toMatchObject({
      status: 'Status',
      customerReference: 'Customer reference',
      orderDate: 'Order date',
      requestedDeliveryDate: 'Requested delivery',
      deliveryNotes: 'Delivery instructions',
      notes: 'Notes',
      lines: 'Lines',
      'lines.productId': 'Product',
      'lines.quantity': 'Quantity',
      'lines.unitPrice': 'Unit price',
      'lines.discount': 'Discount (%)',
    });
    expect(SALES_ORDER_ARRAY_ID_KEYS).toEqual({ lines: 'id' });
  });
});

describe('salesOrderReview: dirty if and only if an entry or a reorder (the editor\'s own equality)', () => {
  // Pairs (saved text, typed text) of each line number, in EUR and in JPY: `sameValues` (the dirty-tracking of the
  // page) and the review must agree on every one of them, in both directions.
  const cases: [string, keyof OrderLineValues, string, string, SalesOrderValues][] = [
    ['quantity: leading zero is the same number', 'quantity', '5', '05', EUR],
    ['quantity: spaces around are the same number', 'quantity', '5', ' 5 ', EUR],
    ['quantity: 5.0 is not a whole number, a change', 'quantity', '5', '5.0', EUR],
    ['quantity: empty is a change', 'quantity', '5', '', EUR],
    ['quantity: letters are a change', 'quantity', '5', 'abc', EUR],
    ['discount: 0 and 00', 'discount', '0', '00', EUR],
    ['discount: 0 and 0.0', 'discount', '0', '0.0', EUR],
    ['unit price: 12.5 is 12.50', 'unitPrice', '12.50', '12.5', EUR],
    ['unit price: 12.500 has too many decimals', 'unitPrice', '12.50', '12.500', EUR],
    ['unit price: 12.51 is another amount', 'unitPrice', '12.50', '12.51', EUR],
    ['unit price JPY: 1250 and 01250', 'unitPrice', '1250', '01250', JPY],
    ['unit price JPY: 1250.0 is not an amount in yen', 'unitPrice', '1250', '1250.0', JPY],
    ['unit price: two empty texts', 'unitPrice', '', '', EUR],
    ['unit price: invalid against empty', 'unitPrice', '', 'abc', EUR],
  ];
  it.each(cases)('%s', (_, field, saved, typed, base) => {
    const baseline = withLine(base, 0, { [field]: saved });
    const values = withLine(base, 0, { [field]: typed });
    for (const [a, b] of [
      [values, baseline],
      [baseline, values],
    ] as const) {
      const { entries, reorders } = review(a, b);
      expect(entries.length + reorders.length > 0).toBe(!sameValues(a, b));
    }
  });

  it('the comparison is the currency of the SAVED order (a price typed for JPY is read as yen)', () => {
    // 1250 and 1250.00 are the same euros but not the same yen.
    const euros = withLine(EUR, 0, { unitPrice: '1250' });
    expect(review(withLine(euros, 0, { unitPrice: '1250.00' }), euros).entries).toEqual([]);
    const yen = withLine(JPY, 0, { unitPrice: '1250' });
    expect(review(withLine(yen, 0, { unitPrice: '1250.00' }), yen).entries.map((e) => e.path)).toEqual(['lines.0.unitPrice']);
  });

  it('a field outside the lines is compared as text: "05" against "5" in Customer reference is a change', () => {
    const baseline = { ...EUR, customerReference: '5' };
    expect(summary({ ...baseline, customerReference: '05' }, baseline)).toEqual([{ path: 'customerReference', label: 'Customer reference', kind: 'changed' }]);
  });
});

describe('salesOrderReview: the lines, matched by id', () => {
  it('line 2 quantity changed, line 1 removed: the same row (by id), one entry for its quantity; the removed row with the values it had', () => {
    const [first, second] = USD.lines as [OrderLineValues, OrderLineValues];
    const values = { ...withLine(USD, 1, { quantity: '60' }), lines: withLine(USD, 1, { quantity: '60' }).lines.slice(1) };
    const { entries, reorders } = review(values, USD);
    expect(reorders).toEqual([]);
    expect(entries.map((e) => [e.path, e.label, e.kind])).toEqual([
      ['lines.0.quantity', `Lines > Line 1 (${nameOf(second)}) > Quantity`, 'changed'],
      ['lines.0', `Lines > Line 1 (${nameOf(first)})`, 'removed'],
    ]);
    expect(entries[1]!.before).toBe(first);
  });

  it('a line added: "added" with its values, named by its position and product', () => {
    const added: OrderLineValues = { id: 'new-1', productId: USD.lines[0]!.productId, quantity: '2', unitPrice: '12.00', discount: '0' };
    const { entries } = review({ ...USD, lines: [...USD.lines, added] }, USD);
    expect(entries.map((e) => [e.path, e.label, e.kind])).toEqual([['lines.4', `Lines > Line 5 (${nameOf(added)})`, 'added']]);
    expect(entries[0]!.after).toBe(added);
  });

  it('only the order: no entry, the reorder of `lines` from the engine; a reorder AND a change: both', () => {
    const swapped = { ...USD, lines: [USD.lines[1]!, USD.lines[0]!, ...USD.lines.slice(2)] };
    expect(review(swapped, USD)).toEqual({ entries: [], reorders: [{ path: 'lines', labelPath: ['Lines'], label: 'Lines' }] });
    const both = { ...swapped, notes: 'x' };
    expect(review(both, USD).entries.map((e) => e.path)).toEqual(['notes']);
    expect(review(both, USD).reorders.map((r) => r.path)).toEqual(['lines']);
  });

  it('a line removed and added back with the same content is another id: removed + added, never "unchanged"', () => {
    const [first, ...rest] = USD.lines as [OrderLineValues, ...OrderLineValues[]];
    const { entries } = review({ ...USD, lines: [...rest, { ...first, id: 'new-1' }] }, USD);
    expect(entries.map((e) => [e.path, e.kind])).toEqual([
      ['lines.3', 'added'],
      ['lines.0', 'removed'],
    ]);
  });
});

describe('salesOrderLineLabel (itemLabel of the engine)', () => {
  const ctx = (index: number) => ({ path: `lines.${index}`, index, side: 'values' as const, isLastSegment: false, defaultLabel: `Item ${index + 1}` });
  it('a line: its position and its product (a discontinued product is still named)', () => {
    expect(salesOrderLineLabel('lines', USD.lines[2], ctx(2))).toBe(`Line 3 (${nameOf(USD.lines[2]!)})`);
  });
  it('no product, or an unknown one: the position only', () => {
    expect(salesOrderLineLabel('lines', { productId: '' }, ctx(0))).toBe('Line 1');
    expect(salesOrderLineLabel('lines', { productId: 'prd-does-not-exist' }, ctx(1))).toBe('Line 2');
    expect(salesOrderLineLabel('lines', { productId: 7 }, ctx(1))).toBe('Line 2');
  });
  it('anything else keeps the engine label', () => {
    expect(salesOrderLineLabel('other', USD.lines[0], ctx(0))).toBeUndefined();
    expect(salesOrderLineLabel('lines', null, ctx(0))).toBeUndefined();
    expect(salesOrderLineLabel('lines', 'line', ctx(0))).toBeUndefined();
  });
});

describe('salesOrderValueText: values as the user knows them, in the currency of the order', () => {
  it('a status by its label, a date as a date, a product by its name', () => {
    expect(text('confirmed', { path: 'status' })).toBe('Confirmed');
    expect(text('2026-03-05', { path: 'requestedDeliveryDate' })).toBe('Mar 5, 2026');
    expect(text('2026-03-05', { path: 'orderDate' })).toBe('Mar 5, 2026');
    expect(text('2026-02-30', { path: 'orderDate' })).toBe('2026-02-30');
    expect(text(USD.lines[0]!.productId, { path: 'lines.0.productId' })).toBe(nameOf(USD.lines[0]!));
    expect(text('prd-does-not-exist', { path: 'lines.0.productId' })).toBe('prd-does-not-exist');
    // A field that is not a status does not read as one.
    expect(text('confirmed', { path: 'notes' })).toBe('confirmed');
    expect(text('2026-03-05', { path: 'notes' })).toBe('2026-03-05');
  });

  it.each([
    ['EUR', '1234.5', '€1,234.50'],
    ['USD', '61.30', '$61.30'],
    ['GBP', '7.5', '£7.50'],
    ['JPY', '3080', '¥3,080'],
  ] as const)('a unit price in %s: %s reads %s', (currency, typed, shown) => {
    expect(text(typed, { path: 'lines.1.unitPrice' }, currency)).toBe(shown);
  });

  it('a quantity grouped, a discount in percent; a text the rule refuses as typed', () => {
    expect(text('1200', { path: 'lines.0.quantity' })).toBe('1,200');
    expect(text('20', { path: 'lines.0.discount' })).toBe('20%');
    expect(text('5.0', { path: 'lines.0.quantity' })).toBe('5.0');
    expect(text('12.345', { path: 'lines.0.unitPrice' })).toBe('12.345');
    expect(text('1250.5', { path: 'lines.0.unitPrice' }, 'JPY')).toBe('1250.5');
  });

  it('a number typed with spaces around it reads as the number (the form accepts it)', () => {
    expect(text(' 60', { path: 'lines.0.quantity' })).toBe('60');
    expect(text(' 1200 ', { path: 'lines.0.quantity' })).toBe('1,200');
    expect(text(' 15 ', { path: 'lines.0.discount' })).toBe('15%');
    expect(text(' 61.30 ', { path: 'lines.0.unitPrice' }, 'USD')).toBe('$61.30');
  });

  it('a quantity beyond the safe integers stays as typed, never rounded and grouped', () => {
    expect(text('12345678901234567890', { path: 'lines.0.quantity' })).toBe('12345678901234567890');
    expect(text('12345678901234567890', { path: 'lines.0.discount' })).toBe('12345678901234567890');
  });

  it("in a whole line an empty or non-integer discount is never read as 0 (spec §1.13.1): '' is Empty, '0.0' as typed, '0' none", () => {
    const [first] = USD.lines as [OrderLineValues];
    const line = { ...first, productId: '', quantity: '5', unitPrice: '1.00' };
    expect(text({ ...line, discount: '' }, { path: 'lines.0' }, 'USD')).toBe('No product, 5 × $1.00, Empty discount');
    expect(text({ ...line, discount: '0.0' }, { path: 'lines.0' }, 'USD')).toBe('No product, 5 × $1.00, 0.0 discount');
    expect(text({ ...line, discount: ' 0 ' }, { path: 'lines.0' }, 'USD')).toBe('No product, 5 × $1.00');
    expect(text({ ...line, discount: '0' }, { path: 'lines.0' }, 'USD')).toBe('No product, 5 × $1.00');
  });

  it('a whole line: product, quantity × price in the currency, and the discount when there is one', () => {
    const [first, second] = USD.lines as [OrderLineValues, OrderLineValues];
    expect(text(first, { path: 'lines.0' }, 'USD')).toBe(`${nameOf(first)}, 50 × $61.30`);
    expect(text(second, { path: 'lines.1' }, 'USD')).toBe(`${nameOf(second)}, 50 × $20.65, 5% discount`);
    expect(text({ ...first, productId: '', quantity: '5.0', unitPrice: '' }, { path: 'lines.0' }, 'USD')).toBe('No product, 5.0 × Empty');
    // Not a line of the form: the default rendering.
    expect(text({ id: 'x' }, { path: 'lines.0' })).not.toContain('×');
  });

  it("no value in its three forms reads three different ways (spec §1.13.1): '' Empty, null Null, a missing key Missing", () => {
    expect(text('', { path: 'notes', before: 'x', after: '' })).toBe('Empty');
    expect(text(null, { path: 'notes', before: 'x', after: null })).toBe('Null');
    expect(text(undefined, { path: 'notes', before: 'x', after: undefined, afterMissing: true })).toBe('Missing');
    expect(text(undefined, { path: 'notes', before: undefined, after: 'x', beforeMissing: true })).toBe('Missing');
    expect(text(undefined, { path: 'notes', before: 'x', after: undefined, afterMissing: false })).toBe('Undefined');
  });
});

describe('the review rendered (ChangeSummary with the order\'s renderValue)', () => {
  /** The text of each item as read by assistive technology (the arrow is `aria-hidden`). */
  const items = () =>
    within(screen.getByRole('list', { name: 'Changes to save' }))
      .getAllByRole('listitem')
      .map((item) => {
        const copy = item.cloneNode(true) as Element;
        for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
        return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
      });

  it('USD: line 2 quantity, line 1 removed, a line added, the status and the notes', () => {
    const [first, second] = USD.lines as [OrderLineValues, OrderLineValues];
    const added: OrderLineValues = { id: 'new-1', productId: first.productId, quantity: '2', unitPrice: '12', discount: '10' };
    const lines = withLine(USD, 1, { quantity: '60' }).lines.slice(1);
    const values = { ...USD, status: 'shipped' as const, notes: 'Call first.', lines: [...lines, added] };
    const result = salesOrderSaveReview({ values, baseline: USD })!;
    render(<>{result.children}</>);
    expect(result.description).toBe('5 changes will be saved.');
    expect(items()).toEqual([
      'Status, changed, from Invoiced to Shipped',
      'Notes, changed, from Empty to Call first.',
      `Lines > Line 1 (${nameOf(second)}) > Quantity, changed, from 50 to 60`,
      `Lines > Line 4 (${nameOf(added)}), added, ${nameOf(added)}, 2 × $12.00, 10% discount`,
      `Lines > Line 1 (${nameOf(first)}), removed, ${nameOf(first)}, 50 × $61.30`,
    ]);
  });

  // Spec §1.13.1: `''`, `null` and a missing key are three values; the server may hold any of them in the notes.
  const NULL = null as unknown as string;
  const withoutNotes = (v: SalesOrderValues): SalesOrderValues => {
    const copy: Partial<SalesOrderValues> = { ...v };
    delete copy.notes;
    return copy as SalesOrderValues;
  };
  const shown = (pairs: [SalesOrderValues, SalesOrderValues][]): string[] => {
    render(
      <>
        {pairs.map(([values, baseline], i) => (
          <div key={i}>{salesOrderSaveReview({ values, baseline })!.children}</div>
        ))}
      </>,
    );
    return screen.getAllByRole('list', { name: 'Changes to save' }).map((list) => {
      const copy = list.cloneNode(true) as Element;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
  };

  it("the notes cleared to '', to null, or without the key: three different texts, one entry each", () => {
    const note = EUR.notes;
    expect(
      shown([
        [{ ...EUR, notes: '' }, EUR],
        [{ ...EUR, notes: NULL }, EUR],
        [withoutNotes(EUR), EUR],
      ]),
    ).toEqual([`Notes, changed, from ${note} to Empty`, `Notes, changed, from ${note} to Null`, `Notes, changed, from ${note} to Missing`]);
  });

  it("the notes typed where the saved order had '', null, or no key: three different texts", () => {
    const typed = { ...EUR, notes: 'Call first.' };
    expect(
      shown([
        [typed, { ...EUR, notes: '' }],
        [typed, { ...EUR, notes: NULL }],
        [typed, withoutNotes(EUR)],
      ]),
    ).toEqual(['Notes, changed, from Empty to Call first.', 'Notes, changed, from Null to Call first.', 'Notes, changed, from Missing to Call first.']);
  });

  it("between two of the three: never \"no change\", and each side named", () => {
    expect(
      shown([
        [{ ...EUR, notes: NULL }, { ...EUR, notes: '' }],
        [withoutNotes(EUR), { ...EUR, notes: NULL }],
        [{ ...EUR, notes: '' }, withoutNotes(EUR)],
      ]),
    ).toEqual(['Notes, changed, from Empty to Null', 'Notes, changed, from Null to Missing', 'Notes, changed, from Missing to Empty']);
  });

  it('a line added or removed keeps its kind (only a field of the order reads as a change)', () => {
    const [first, ...rest] = EUR.lines as [OrderLineValues, ...OrderLineValues[]];
    const { entries } = review({ ...EUR, lines: rest }, EUR);
    expect(entries.map((e) => [e.path, e.kind, e.before, e.after])).toEqual([['lines.0', 'removed', first, undefined]]);
  });
});

describe('salesOrderSaveReview', () => {
  it('nothing to review: null (the editor saves directly)', () => {
    expect(salesOrderSaveReview({ values: EUR, baseline: EUR })).toBeNull();
    expect(salesOrderSaveReview({ values: withLine(EUR, 0, { quantity: ` ${EUR.lines[0]!.quantity}` }), baseline: EUR })).toBeNull();
  });

  it('a review the user must see: named, "Keep editing" focused first, "Save changes" the primary action', () => {
    const result = salesOrderSaveReview({ values: { ...EUR, notes: 'x' }, baseline: EUR })!;
    expect(result).toMatchObject({ title: 'Review changes', description: '1 change will be saved.', confirmLabel: 'Save changes', cancelLabel: 'Keep editing', tone: 'default', initialFocus: 'cancel' });
  });

  it('only the order: its own text and no list; a reorder and a change: the list and the note', () => {
    const swapped = { ...USD, lines: [USD.lines[1]!, USD.lines[0]!, ...USD.lines.slice(2)] };
    const only = salesOrderSaveReview({ values: swapped, baseline: USD })!;
    expect(only.description).toBe(ORDER_ONLY_DESCRIPTION);
    expect(only.children).toBeUndefined();
    const both = salesOrderSaveReview({ values: { ...swapped, notes: 'x' }, baseline: USD })!;
    expect(both.description).toBe('1 change will be saved.');
    render(<>{both.children}</>);
    expect(screen.getByText(ORDER_ALSO_NOTE)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('a change only: no note about the order', () => {
    render(<>{salesOrderSaveReview({ values: { ...USD, notes: 'x' }, baseline: USD })!.children}</>);
    expect(screen.queryByText(ORDER_ALSO_NOTE)).toBeNull();
  });
});

describe('salesOrderEngine', () => {
  it('one object per currency, the same for the same currency (useFormRebase compares by identity)', () => {
    expect(salesOrderEngine('EUR')).toBe(salesOrderEngine('EUR'));
    expect(salesOrderEngine('EUR')).not.toBe(salesOrderEngine('JPY'));
  });

  it('the same equality as the review gives the same entries through the engine directly', () => {
    const values = withLine(EUR, 0, { quantity: `0${EUR.lines[0]!.quantity}`, discount: `0${EUR.lines[0]!.discount}` });
    const direct = computeChangeSummaryResult({ values, baseline: EUR, arrayIdKeys: SALES_ORDER_ARRAY_ID_KEYS, isEqual: salesOrderEngine('EUR').isEqual });
    expect(direct.entries).toEqual([]);
    expect(computeChangeSummaryResult({ values, baseline: EUR, arrayIdKeys: SALES_ORDER_ARRAY_ID_KEYS }).entries).toHaveLength(2);
  });

  it('renderValue: the text in the default wrapper, muted for a value that is not there', () => {
    const entry = { path: 'notes', labelPath: ['Notes'], label: 'Notes', kind: 'changed' as const, before: 'a', after: '', beforeMissing: false, afterMissing: false };
    const { container } = render(
      <>
        {salesOrderEngine('EUR').renderValue('', entry)}
        {salesOrderEngine('EUR').renderValue('a', entry)}
      </>,
    );
    const [empty, value] = container.querySelectorAll('span');
    expect(empty).toHaveClass('rop-pro-change-summary__value', 'rop-pro-change-summary__value--muted');
    expect(empty).toHaveTextContent('Empty');
    expect(value).toHaveClass('rop-pro-change-summary__value');
    expect(value).not.toHaveClass('rop-pro-change-summary__value--muted');
  });
});

// #526: the cases of the unit tests of the invoice showcase (invoice-review.test.tsx, invoice-review-engine.test.ts)
// that the tests above did not assert, on the sales orders.
describe('salesOrderReview: the cases of the invoice review (#526)', () => {
  /** The text of each item as read by assistive technology (the arrow is `aria-hidden`). */
  const rendered = (values: SalesOrderValues, baseline: SalesOrderValues): HTMLElement[] => {
    cleanup();
    const result = salesOrderSaveReview({ values, baseline });
    if (!result) throw new Error('no review');
    render(<>{result.children}</>);
    return within(screen.getByRole('list', { name: 'Changes to save' })).getAllByRole('listitem');
  };
  const read = (el: Element): string => {
    const copy = el.cloneNode(true) as Element;
    for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
  const texts = (values: SalesOrderValues, baseline: SalesOrderValues = EUR): string[] => rendered(values, baseline).map(read);

  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo'])(
    'dates: a localized date, never the ISO string, the same calendar day with TZ=%s',
    (tz) => {
      process.env.TZ = tz;
      const baseline = { ...EUR, requestedDeliveryDate: '2026-03-05' };
      const [item] = rendered({ ...baseline, requestedDeliveryDate: '2026-04-05' }, baseline);
      expect(read(item!)).toBe('Requested delivery, changed, from Mar 5, 2026 to Apr 5, 2026');
      expect(item).not.toHaveTextContent('2026-03-05');
      expect(text('2026-01-01', { path: 'orderDate' })).toBe('Jan 1, 2026');
      expect(text('2026-12-31', { path: 'requestedDeliveryDate' })).toBe('Dec 31, 2026');
    },
  );

  it('a date emptied reads "Empty", muted, never blank', () => {
    const [item] = rendered({ ...EUR, requestedDeliveryDate: '' }, EUR);
    expect(read(item!)).toBe(`Requested delivery, changed, from ${formatDate(EUR.requestedDeliveryDate)} to Empty`);
    expect(within(item!).getByText('Empty')).toHaveClass('rop-pro-change-summary__value--muted');
  });

  it('a quantity changed: ONE "changed" entry for that field of that line, its sides as typed, rendered as a number', () => {
    const values = withLine(EUR, 1, { quantity: '3' });
    const { entries } = review(values, EUR);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'changed', path: 'lines.1.quantity', before: EUR.lines[1]!.quantity, after: '3' });
    expect(texts(values)).toEqual([`Lines > Line 2 (${nameOf(EUR.lines[1]!)}) > Quantity, changed, from 50 to 3`]);
  });

  it('quantities are rendered as numbers: 1000 -> "1,000", 007 -> "7", for a changed field and for a whole line', () => {
    const third = nameOf(EUR.lines[2]!);
    expect(texts(withLine(EUR, 2, { quantity: '1000' }))).toEqual([`Lines > Line 3 (${third}) > Quantity, changed, from 10 to 1,000`]);
    expect(texts(withLine(EUR, 2, { quantity: '007' }))).toEqual([`Lines > Line 3 (${third}) > Quantity, changed, from 10 to 7`]);
    const bulk: OrderLineValues = { id: 'new-1', productId: EUR.lines[0]!.productId, quantity: '1000', unitPrice: '1.00', discount: '0' };
    expect(texts({ ...EUR, lines: [...EUR.lines, bulk] })).toEqual([`Lines > Line 4 (${nameOf(bulk)}), added, ${nameOf(bulk)}, 1,000 × €1.00`]);
  });

  it('a new line moved to the top is not a reorder of the existing lines: no note, "1 change will be saved."', () => {
    const added: OrderLineValues = { id: 'new-1', productId: USD.lines[0]!.productId, quantity: '1', unitPrice: '99.00', discount: '0' };
    const values = { ...EUR, lines: [added, ...EUR.lines] };
    expect(review(values, EUR).reorders).toEqual([]);
    const result = salesOrderSaveReview({ values, baseline: EUR })!;
    expect(result.description).toBe('1 change will be saved.');
    render(<>{result.children}</>);
    expect(screen.queryByText(ORDER_ALSO_NOTE)).toBeNull();
  });

  // The invoice review bracketed the parentheses of a line's free-text description ("Repair (urgent)" -> "[urgent]")
  // so that a label never nests them. An order line is named by its product, from the catalogue: no product name has
  // parentheses, so the label of a line has exactly one pair, around the product.
  it('a line label never nests parentheses: no product of the catalogue has any', () => {
    const products = makeProducts(DEMO_REFERENCE_POOL.products);
    expect(products.length).toBeGreaterThan(0);
    expect(products.filter((p) => /[()]/.test(p.name)).map((p) => p.name)).toEqual([]);
    for (const [index, line] of ORDERS.flatMap((o) => o.lines).entries()) {
      const label = salesOrderLineLabel('lines', line, { path: `lines.${index}`, index, side: 'values', isLastSegment: false, defaultLabel: '' })!;
      expect(label.match(/[()]/g)).toEqual(['(', ')']);
    }
  });

  /** The id comparison the invoice review made before #424 (`lineOrderChanged`), restated as the oracle. */
  function idOrderChanged(values: SalesOrderValues, baseline: SalesOrderValues): boolean {
    const before = baseline.lines.map((l) => l.id);
    const after = values.lines.map((l) => l.id);
    const common = new Set(before.filter((id) => after.includes(id)));
    const a = before.filter((id) => common.has(id));
    const b = after.filter((id) => common.has(id));
    return a.some((id, i) => id !== b[i]);
  }

  // The coherence rule of #379, on the three lines of so-1: whatever the combination, a dirty form always gets a review,
  // with one entry per added, removed and changed line, unless it is the one declared exception (a mere reorder).
  const combos = Array.from({ length: 32 }, (_, n) => ({
    add: (n & 1) !== 0,
    remove: (n & 2) !== 0,
    change: (n & 4) !== 0,
    reorder: (n & 8) !== 0,
    addAtTop: (n & 16) !== 0,
  }));
  it.each(combos)('coherence: %o', ({ add, remove, change, reorder, addAtTop }) => {
    const [l1, l2, l3] = EUR.lines as [OrderLineValues, OrderLineValues, OrderLineValues];
    let lines = [l1, l2, l3];
    if (change) lines = lines.map((l) => (l.id === l3.id ? { ...l, quantity: '9' } : l));
    if (reorder) {
      const [a, b] = [lines.findIndex((l) => l.id === l2.id), lines.findIndex((l) => l.id === l3.id)];
      [lines[a], lines[b]] = [lines[b]!, lines[a]!];
    }
    if (remove) lines = lines.filter((l) => l.id !== l1.id);
    const added: OrderLineValues = { id: 'new-1', productId: USD.lines[0]!.productId, quantity: '1', unitPrice: '60.00', discount: '0' };
    if (add) lines = addAtTop ? [added, ...lines] : [...lines, added];
    const values = { ...EUR, lines };
    const { entries, reorders } = review(values, EUR);
    const result = salesOrderSaveReview({ values, baseline: EUR });
    const dirty = !sameValues(values, EUR);
    expect(dirty).toBe(add || remove || change || reorder);
    expect(result !== null).toBe(dirty);
    expect(entries).toHaveLength(Number(add) + Number(remove) + Number(change));
    if (dirty && entries.length === 0) {
      // The one declared exception.
      expect(reorder).toBe(true);
      expect(result?.description).toBe(ORDER_ONLY_DESCRIPTION);
    }
    expect(reorders.length > 0).toBe(reorder);
    expect(reorders.length > 0).toBe(idOrderChanged(values, EUR));
    expect(reorders.map((r) => r.label)).toEqual(reorder ? ['Lines'] : []);
  });
});
