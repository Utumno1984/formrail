import { describe, expect, it } from 'vitest';
import {
  lineTotal,
  minorToText,
  nextLineId,
  orderTotal,
  sameLines,
  textToMinor,
  toLineValues,
  toStoredLine,
  validateLines,
  type OrderLineValues,
} from './order-lines';

const line = (patch: Partial<OrderLineValues> = {}): OrderLineValues => ({
  id: 'l1',
  productId: 'prd-1',
  quantity: '2',
  unitPrice: '10.00',
  discount: '0',
  ...patch,
});

describe('money as text (#520)', () => {
  it('writes minor units in the major unit with exactly the currency decimals', () => {
    expect(minorToText(1250, 'EUR')).toBe('12.50');
    expect(minorToText(5, 'USD')).toBe('0.05');
    expect(minorToText(0, 'GBP')).toBe('0.00');
    expect(minorToText(1250, 'JPY')).toBe('1250');
  });

  it('reads a typed amount exactly, with no float product (1.15 is 115, 0.07 is 7)', () => {
    expect(textToMinor('1.15', 'EUR')).toBe(115);
    expect(textToMinor('0.07', 'EUR')).toBe(7);
    expect(textToMinor('12', 'EUR')).toBe(1200);
    expect(textToMinor('12.5', 'EUR')).toBe(1250);
    expect(textToMinor(' 3.10 ', 'GBP')).toBe(310);
  });

  it('refuses what the currency cannot hold: a third decimal, a sign, an exponent, text', () => {
    for (const text of ['1.005', '-1', '1e3', '', '.5', '5.', 'abc', '1,50']) {
      expect(textToMinor(text, 'EUR'), text).toBeNull();
    }
  });

  it('JPY has no decimals: whole yen only', () => {
    expect(textToMinor('1200', 'JPY')).toBe(1200);
    expect(textToMinor('1200.5', 'JPY')).toBeNull();
    expect(textToMinor('1200.0', 'JPY')).toBeNull();
  });

  it('is the inverse of minorToText', () => {
    for (const [minor, currency] of [[1, 'EUR'], [99, 'USD'], [100, 'GBP'], [123456789, 'EUR'], [7, 'JPY']] as const) {
      expect(textToMinor(minorToText(minor, currency), currency)).toBe(minor);
    }
  });
});

describe('line totals (#520)', () => {
  it('quantity x unit price minus the discount, half-up to the minor unit', () => {
    expect(lineTotal(line({ quantity: '3', unitPrice: '10.00', discount: '0' }), 'EUR')).toBe(3000);
    expect(lineTotal(line({ quantity: '3', unitPrice: '10.00', discount: '10' }), 'EUR')).toBe(2700);
    // 3 x 0.05 = 15 minor units, 10% is 1.5: the half rounds towards the larger discount (2), leaving 13.
    expect(lineTotal(line({ quantity: '3', unitPrice: '0.05', discount: '10' }), 'EUR')).toBe(13);
  });

  it('JPY: whole yen in, whole yen out, no decimals anywhere', () => {
    expect(lineTotal(line({ quantity: '4', unitPrice: '1250', discount: '5' }), 'JPY')).toBe(4750);
  });

  it('is null while a number is invalid, never a wrong total', () => {
    expect(lineTotal(line({ quantity: '' }), 'EUR')).toBeNull();
    expect(lineTotal(line({ quantity: '0' }), 'EUR')).toBeNull();
    expect(lineTotal(line({ unitPrice: '1.999' }), 'EUR')).toBeNull();
    expect(lineTotal(line({ discount: '101' }), 'EUR')).toBeNull();
  });

  it('has no total for a unit price above the maximum, which validation refuses', () => {
    expect(lineTotal(line({ quantity: '1', unitPrice: '999999.99' }), 'EUR')).toBe(99_999_999);
    expect(lineTotal(line({ quantity: '1', unitPrice: '1000000.00' }), 'EUR')).toBeNull();
    expect(lineTotal(line({ quantity: '1', unitPrice: '100000000' }), 'JPY')).toBeNull();
  });

  it('the order total is the sum of the line totals; one unfinished line makes it null; no lines total 0', () => {
    expect(orderTotal([line({ id: 'a' }), line({ id: 'b', quantity: '1', unitPrice: '5.50' })], 'EUR')).toBe(2550);
    expect(orderTotal([line({ id: 'a' }), line({ id: 'b', quantity: '' })], 'EUR')).toBeNull();
    expect(orderTotal([], 'EUR')).toBe(0);
  });
});

describe('validateLines (#520)', () => {
  it('a valid line has no error', () => {
    expect(validateLines([line()], 'EUR')).toEqual({});
  });

  it('quantity must be a whole number from 1 up', () => {
    for (const quantity of ['0', '', '-2', '1.5', 'x', '100000']) {
      expect(validateLines([line({ quantity })], 'EUR')['lines.0.quantity'], quantity).toMatch(/^Quantity must be a whole number from 1 to 99,999/);
    }
    expect(validateLines([line({ quantity: '99999' })], 'EUR')).toEqual({});
  });

  it('the product is required', () => {
    expect(validateLines([line({ productId: '' })], 'EUR')).toEqual({ 'lines.0.productId': 'Choose a product.' });
  });

  it('unit price: greater than 0, at most the currency decimals, not absurdly large', () => {
    expect(validateLines([line({ unitPrice: '0' })], 'EUR')['lines.0.unitPrice']).toBe('Unit price must be greater than 0.');
    expect(validateLines([line({ unitPrice: '0.00' })], 'EUR')['lines.0.unitPrice']).toBe('Unit price must be greater than 0.');
    expect(validateLines([line({ unitPrice: '1.234' })], 'EUR')['lines.0.unitPrice']).toMatch(/at most 2 decimals/);
    expect(validateLines([line({ unitPrice: '1.5' })], 'JPY')['lines.0.unitPrice']).toMatch(/no decimals/);
    expect(validateLines([line({ unitPrice: '1000000.00' })], 'EUR')['lines.0.unitPrice']).toBe('Unit price is too large.');
  });

  it('unit price: the largest accepted is 999,999.99 (99,999,999 minor units), one more is too large', () => {
    expect(validateLines([line({ unitPrice: '999999.99' })], 'EUR')).toEqual({});
    expect(validateLines([line({ unitPrice: '999999.98' })], 'EUR')).toEqual({});
    expect(validateLines([line({ unitPrice: '99999999' })], 'JPY')).toEqual({});
    expect(validateLines([line({ unitPrice: '100000000' })], 'JPY')['lines.0.unitPrice']).toBe('Unit price is too large.');
  });

  it('discount: a whole percent from 0 to 100', () => {
    expect(validateLines([line({ discount: '100' })], 'EUR')).toEqual({});
    for (const discount of ['', '-1', '101', '2.5']) {
      expect(validateLines([line({ discount })], 'EUR')['lines.0.discount'], discount).toMatch(/whole percent from 0 to 100/);
    }
  });

  it('keys each error by the index of its line', () => {
    const errors = validateLines([line({ id: 'a' }), line({ id: 'b', quantity: '0' }), line({ id: 'c', discount: '' })], 'EUR');
    expect(Object.keys(errors).sort()).toEqual(['lines.1.quantity', 'lines.2.discount']);
  });
});

describe('values <-> stored lines (#520)', () => {
  it('a stored line becomes values and back with the same numbers', () => {
    const stored = { id: 'so-1-line-1', productId: 'prd-9', quantity: 7, unitPriceMinor: 123456, discountPercent: 15 };
    const values = toLineValues(stored, 'EUR');
    expect(values).toEqual({ id: 'so-1-line-1', productId: 'prd-9', quantity: '7', unitPrice: '1234.56', discount: '15' });
    expect(toStoredLine(values, 'EUR')).toEqual(stored);
    expect(toLineValues({ ...stored, unitPriceMinor: 9900 }, 'JPY').unitPrice).toBe('9900');
  });

  it('sameLines compares numbers as numbers, ids and product as text, and the order', () => {
    expect(sameLines([line()], [line({ unitPrice: '10' })], 'EUR')).toBe(true);
    expect(sameLines([line()], [line({ quantity: '2e0' })], 'EUR')).toBe(false); // not the plain form: counts as a change
    expect(sameLines([line()], [line({ productId: 'prd-2' })], 'EUR')).toBe(false);
    expect(sameLines([line({ id: 'a' }), line({ id: 'b' })], [line({ id: 'b' }), line({ id: 'a' })], 'EUR')).toBe(false);
    expect(sameLines([line()], [], 'EUR')).toBe(false);
  });
});

describe('sameLines, field by field (#520)', () => {
  const same = (patch: Partial<OrderLineValues>, currency: 'EUR' | 'JPY' = 'EUR') => sameLines([line()], [line(patch)], currency);

  it('every field of a line counts: id, product, quantity, unit price, discount', () => {
    expect(same({})).toBe(true);
    expect(same({ id: 'l2' })).toBe(false);
    expect(same({ productId: 'prd-2' })).toBe(false);
    expect(same({ quantity: '3' })).toBe(false);
    expect(same({ unitPrice: '10.01' })).toBe(false);
    expect(same({ discount: '5' })).toBe(false);
  });

  it('a change in the second line is found', () => {
    expect(sameLines([line({ id: 'a' }), line({ id: 'b' })], [line({ id: 'a' }), line({ id: 'b', discount: '1' })], 'EUR')).toBe(false);
  });

  it('a text that is not valid for the rule of the field is a change, even when it is numerically the same', () => {
    expect(same({ quantity: '2.0' })).toBe(false); // a quantity is whole
    expect(same({ discount: '0.0' })).toBe(false); // a discount is whole
    expect(same({ unitPrice: '10.000' })).toBe(false); // EUR has 2 decimals
    expect(same({ unitPrice: '10.0000' })).toBe(false);
    expect(sameLines([line({ unitPrice: '1250' })], [line({ unitPrice: '1250.0' })], 'JPY')).toBe(false); // JPY has none
    expect(same({ quantity: '2e0' })).toBe(false);
    expect(same({ unitPrice: '1e1' })).toBe(false);
  });

  it('a text that is valid for the rule is the same number: leading zeros, fewer decimals, spaces around', () => {
    expect(same({ quantity: '02' })).toBe(true);
    expect(same({ discount: '00' })).toBe(true);
    expect(same({ unitPrice: '10.0' })).toBe(true);
    expect(same({ unitPrice: '10' })).toBe(true);
    expect(same({ unitPrice: ' 10.00 ' })).toBe(true);
    expect(sameLines([line({ unitPrice: '1250' })], [line({ unitPrice: '01250' })], 'JPY')).toBe(true);
  });

  it('two different valid texts are different numbers', () => {
    expect(same({ unitPrice: '10.10' })).toBe(false);
    expect(same({ quantity: '12' })).toBe(false);
  });

  it('digit strings too long to be exact are compared as text, never as the same number', () => {
    const a = '9'.repeat(400);
    expect(sameLines([line({ quantity: a })], [line({ quantity: `${a}9` })], 'EUR')).toBe(false);
    expect(sameLines([line({ quantity: a })], [line({ quantity: a })], 'EUR')).toBe(true);
  });
});

describe('nextLineId', () => {
  it('never repeats a saved id nor one it made before', () => {
    const taken = new Set(['new-1', 'new-2']);
    const first = nextLineId(taken, 0);
    expect(first).toEqual({ id: 'new-3', counter: 3 });
    expect(nextLineId(taken, first.counter)).toEqual({ id: 'new-4', counter: 4 });
  });
});
