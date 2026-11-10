import { describe, expect, it } from 'vitest';
import { lineTotal, nextLineId, sameLines, validateLines, type LineValues } from './invoice-lines';

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

describe('lineTotal', () => {
  it('multiplies quantity by unit price with 2 decimals', () => {
    expect(lineTotal(line('a', { quantity: '2', unitPrice: '150' }))).toBe('300.00');
    expect(lineTotal(line('a', { quantity: '3', unitPrice: '42.9' }))).toBe('128.70');
  });

  it('is null while either text is not a number', () => {
    expect(lineTotal(line('a', { quantity: '' }))).toBeNull();
    expect(lineTotal(line('a', { unitPrice: 'abc' }))).toBeNull();
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
