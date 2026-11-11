import { describe, expect, it } from 'vitest';
import { lineTotal, nextLineId, sameLines, toLineValues, toStoredLine, validateLines, type LineValues } from './invoice-lines';

const line = (id: string, patch: Partial<LineValues> = {}): LineValues => ({
  id,
  description: `Item ${id}`,
  quantity: '2',
  unitPrice: '150.00',
  ...patch,
});

describe('sameLines', () => {
  it('is true for the same ids, order and values', () => {
    expect(sameLines([line('a'), line('b')], [line('a'), line('b')])).toBe(true);
    expect(sameLines([], [])).toBe(true);
  });

  it('compares quantity and unit price numerically ("150" is "150.00")', () => {
    expect(sameLines([line('a', { unitPrice: '150' })], [line('a', { unitPrice: '150.00' })])).toBe(true);
    expect(sameLines([line('a', { quantity: '02' })], [line('a', { quantity: '2' })])).toBe(true);
    expect(sameLines([line('a', { unitPrice: '150.01' })], [line('a', { unitPrice: '150' })])).toBe(false);
  });

  it('an empty text is only equal to another empty text', () => {
    expect(sameLines([line('a', { quantity: '' })], [line('a', { quantity: '' })])).toBe(true);
    expect(sameLines([line('a', { quantity: '' })], [line('a', { quantity: '0' })])).toBe(false);
    expect(sameLines([line('a', { unitPrice: '  ' })], [line('a', { unitPrice: '0' })])).toBe(false);
  });

  it('a different order is a difference, restoring it is not', () => {
    const a = line('a');
    const b = line('b');
    expect(sameLines([b, a], [a, b])).toBe(false);
    expect(sameLines([a, b], [a, b])).toBe(true);
  });

  it('a different count, id or description is a difference', () => {
    expect(sameLines([line('a')], [line('a'), line('b')])).toBe(false);
    expect(sameLines([line('a')], [line('b')])).toBe(false);
    expect(sameLines([line('a', { description: 'x' })], [line('a', { description: 'y' })])).toBe(false);
  });
});

describe('validateLines', () => {
  it('is empty for valid lines and for no lines', () => {
    expect(validateLines([])).toEqual({});
    expect(validateLines([line('a'), line('b', { quantity: '10', unitPrice: '0.5' })])).toEqual({});
  });

  it('keys the errors by dotted path with the index of the line', () => {
    const errors = validateLines([line('a'), line('b'), line('c', { description: '  ', quantity: '0', unitPrice: 'abc' })]);
    expect(Object.keys(errors).sort()).toEqual([
      'lineItems.2.description',
      'lineItems.2.quantity',
      'lineItems.2.unitPrice',
    ]);
  });

  it('requires a whole quantity greater than 0 and a decimal price greater than 0', () => {
    for (const quantity of ['', '0', '1.5', '-1', 'x', '1e2']) {
      expect(validateLines([line('a', { quantity })]), `quantity "${quantity}"`).toHaveProperty('lineItems.0.quantity');
    }
    for (const unitPrice of ['', '0', '0.00', '-1', 'x', '1,5']) {
      expect(validateLines([line('a', { unitPrice })]), `unit price "${unitPrice}"`).toHaveProperty('lineItems.0.unitPrice');
    }
    expect(validateLines([line('a', { quantity: '7', unitPrice: '0.01' })])).toEqual({});
  });
});

describe('validateLines: finite values', () => {
  it('rejects a unit price or a quantity whose digits coerce to Infinity', () => {
    const huge = '9'.repeat(400);
    const errors = validateLines([line('a', { quantity: huge, unitPrice: huge })]);
    expect(errors['lineItems.0.quantity']).toBeDefined();
    expect(errors['lineItems.0.unitPrice']).toBeDefined();
  });
});

describe('validateLines: upper bound at the toFixed exponential threshold (#418)', () => {
  const errorsFor = (patch: Partial<LineValues>) => validateLines([line('a', patch)]);

  it('rejects a quantity or a unit price of 1e21 and above', () => {
    for (const text of ['1' + '0'.repeat(21), '9'.repeat(22), '1' + '0'.repeat(21) + '.00']) {
      expect(errorsFor({ unitPrice: text })['lineItems.0.unitPrice'], text).toBeDefined();
    }
    for (const text of ['1' + '0'.repeat(21), '9'.repeat(22)]) {
      expect(errorsFor({ quantity: text })['lineItems.0.quantity'], text).toBeDefined();
    }
  });

  it('still accepts the largest values below the bound', () => {
    // 999999999999999868928 is the largest double below 1e21 (1e21 - 131072); the digit string `9`×21 rounds up to 1e21.
    expect(errorsFor({ quantity: '999999999999999868928' })['lineItems.0.quantity']).toBeUndefined();
    expect(errorsFor({ unitPrice: '999999999999999868928.00' })['lineItems.0.unitPrice']).toBeUndefined();
    expect(errorsFor({ quantity: '9'.repeat(21) })['lineItems.0.quantity']).toBeDefined();
    expect(errorsFor({ quantity: '1' + '0'.repeat(20) })).toEqual({});
  });

  it('never reloads a valid saved line as exponential text', () => {
    const saved = toStoredLine(line('a', { quantity: '1' + '0'.repeat(20), unitPrice: '99999999999999900000.5' }));
    const reloaded = toLineValues(saved);
    expect(reloaded.quantity).not.toMatch(/e/i);
    expect(reloaded.unitPrice).not.toMatch(/e/i);
    expect(validateLines([reloaded])).toEqual({});
  });

  it('lineTotal is null when two valid factors multiply past the bound, never exponential', () => {
    expect(lineTotal(line('a', { quantity: '1' + '0'.repeat(11), unitPrice: '1' + '0'.repeat(10) }))).toBeNull();
    expect(lineTotal(line('a', { quantity: '1' + '0'.repeat(10), unitPrice: '1' + '0'.repeat(9) }))).toBe(
      '1' + '0'.repeat(19) + '.00',
    );
  });
});

describe('sameLines: invalid numeric forms', () => {
  it('counts "2e0" and "0x2" as a change from "2", "2.0" is still the same', () => {
    const base = [line('a', { quantity: '2', unitPrice: '150' })];
    expect(sameLines(base, [line('a', { quantity: '2e0', unitPrice: '150' })])).toBe(false);
    expect(sameLines(base, [line('a', { quantity: '2', unitPrice: '1.5e2' })])).toBe(false);
    expect(sameLines(base, [line('a', { quantity: '0x2', unitPrice: '150' })])).toBe(false);
    expect(sameLines(base, [line('a', { quantity: '2', unitPrice: '150.00' })])).toBe(true);
  });
});

describe('lineTotal', () => {
  it('multiplies quantity by unit price with 2 decimals', () => {
    expect(lineTotal(line('a', { quantity: '2', unitPrice: '150' }))).toBe('300.00');
    expect(lineTotal(line('a', { quantity: '3', unitPrice: '42.9' }))).toBe('128.70');
  });

  it('is null while either text is not a number', () => {
    expect(lineTotal(line('a', { quantity: '' }))).toBeNull();
    expect(lineTotal(line('a', { unitPrice: 'abc' }))).toBeNull();
  });

  it('is null for every quantity or price validateLines rejects (zero, non-finite)', () => {
    expect(lineTotal(line('a', { quantity: '0', unitPrice: '150' }))).toBeNull();
    expect(lineTotal(line('a', { quantity: '2', unitPrice: '0' }))).toBeNull();
    const huge = '9'.repeat(400);
    expect(lineTotal(line('a', { quantity: '2', unitPrice: huge }))).toBeNull();
    expect(lineTotal(line('a', { quantity: huge, unitPrice: '2' }))).toBeNull();
    // Both finite, the product is not
    expect(lineTotal(line('a', { quantity: '9'.repeat(200), unitPrice: '9'.repeat(200) }))).toBeNull();
  });

  it('is null for a decimal quantity, the same text validateLines rejects', () => {
    const decimal = line('a', { quantity: '2.5', unitPrice: '150' });
    expect(lineTotal(decimal)).toBeNull();
    expect(validateLines([decimal])['lineItems.0.quantity']).toBeDefined();
  });
});

describe('nextLineId', () => {
  it('counts up and never returns the same id twice', () => {
    const a = nextLineId(new Set(), 0);
    const b = nextLineId(new Set([a.id]), a.counter);
    expect([a.id, b.id]).toEqual(['new-1', 'new-2']);
  });

  it('skips ids already taken (saved lines reloaded with a fresh counter)', () => {
    expect(nextLineId(new Set(['new-1', 'new-2']), 0).id).toBe('new-3');
  });

  it('does not reuse the id of a removed line (add, remove, add)', () => {
    const first = nextLineId(new Set(), 0);
    const second = nextLineId(new Set(), first.counter);
    expect(second.id).not.toBe(first.id);
  });
});
