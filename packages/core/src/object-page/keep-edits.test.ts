// The field-by-field rule of a save that settles while the user kept typing (ticket #545). The matrix of
// `keepEditsSince` of the React Hook Form adapter (packages/pro/.../snapshot.test.ts, #507) replicated on the
// core helper, plus the cases specific to the core (deepEqual, identity, no mutation).
import { describe, expect, it } from 'vitest';
import { keepEditsSince } from './keep-edits';

/** Freezes `value` and every plain object / array below it: any write throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

describe('keepEditsSince (core): a save that settles while the user kept typing', () => {
  const sent = { supplier: 'rossi', amount: '1300', notes: '', lines: [{ qty: 1 }, { qty: 2 }] };

  it('nothing edited since the save started: the returned object itself, normalization included', () => {
    const returned = { supplier: 'Rossi', amount: '1300.00', notes: '', lines: [{ qty: 1 }, { qty: 2 }] };
    expect(keepEditsSince(sent, sent, returned)).toBe(returned);
    // Another object with the same content (a field typed and brought back) is not an edit either.
    expect(keepEditsSince(sent, { ...sent, lines: [{ qty: 1 }, { qty: 2 }] }, returned)).toBe(returned);
  });

  it('the ticket example: the untouched normalized field takes the server value, the edited one stays', () => {
    const s = { name: ' acme ', amount: 10 };
    const returned = { name: 'Acme', amount: 10 };
    const merged = keepEditsSince(s, { ...s, amount: 99 }, returned);
    expect(merged).toEqual({ name: 'Acme', amount: 99 });
    expect(merged).not.toBe(returned);
  });

  it('a field the server normalized and the user edited meanwhile keeps the typed value', () => {
    const s = { name: ' acme ', amount: 10 };
    expect(keepEditsSince(s, { ...s, name: 'acme co' }, { name: 'Acme', amount: 10 })).toEqual({ name: 'acme co', amount: 10 });
  });

  it('a field edited and typed back to the sent value counts as untouched (content, not gestures)', () => {
    const returned = { ...sent, supplier: 'Rossi' };
    expect(keepEditsSince(sent, { ...sent, supplier: 'rossi' }, returned)).toBe(returned);
  });

  it('an edit that matches what the server returned: the returned object itself (clean)', () => {
    const returned = { ...sent, supplier: 'Rossi' };
    expect(keepEditsSince(sent, { ...sent, supplier: 'Rossi' }, returned)).toBe(returned);
  });

  it('nothing taken from the server differs from the current values: the current object itself', () => {
    const current = { ...sent, notes: 'typed' };
    expect(keepEditsSince(sent, current, { ...sent, lines: [{ qty: 1 }, { qty: 2 }] })).toBe(current);
    // A handler that returns nothing: the baseline is what was sent, the values stay the current object.
    expect(keepEditsSince(sent, current, sent)).toBe(current);
  });

  it('nested objects: descends by content, only the edited leaf is kept (an object replaced by setValue)', () => {
    const s = { supplier: { name: 'rossi', city: 'turin' }, amount: 1 };
    const current = { ...s, supplier: { ...s.supplier, city: 'milan' } };
    const returned = { supplier: { name: 'Rossi', city: 'Turin' }, amount: 1 };
    expect(keepEditsSince(s, current, returned).supplier).toEqual({ name: 'Rossi', city: 'milan' });
    // A replaced object with the same content is not an edit.
    expect(keepEditsSince(s, { ...s, supplier: { ...s.supplier } }, returned)).toBe(returned);
  });

  it('dates by getTime(), NaN equals NaN', () => {
    const s = { supplier: { name: 'r', city: 'turin' }, at: new Date(5), n: Number.NaN };
    const current = { supplier: { name: 'r', city: 'milan' }, at: new Date(5), n: Number.NaN };
    const returned = { supplier: { name: 'R', city: 'Turin' }, at: new Date(6), n: 1 };
    expect(keepEditsSince(s, current, returned)).toEqual({ supplier: { name: 'R', city: 'milan' }, at: new Date(6), n: 1 });
    // An edited date is the user's.
    const typed = new Date(9);
    expect(keepEditsSince(s, { ...s, at: typed }, returned).at).toBe(typed);
  });

  describe('arrays (no id key in the core: never paired by position)', () => {
    type Row = { desc: string; price: number };
    type Order = { lines: Row[] };
    const order: Order = { lines: [{ desc: 'cable', price: 1.234 }, { desc: 'switch', price: 2 }] };

    it('an array edited meanwhile is kept whole, also with the same length in the three trees', () => {
      // The user edits the description of row 2, the server normalizes the price of row 1.
      const current: Order = { lines: [order.lines[0]!, { desc: 'Switch 24p', price: 2 }] };
      const returned: Order = { lines: [{ desc: 'cable', price: 1.23 }, { desc: 'switch', price: 2 }] };
      const merged = keepEditsSince(order, current, returned);
      expect(merged.lines).toBe(current.lines);
      expect(merged.lines).toEqual([{ desc: 'cable', price: 1.234 }, { desc: 'Switch 24p', price: 2 }]);
    });

    it('an array not edited takes the server array, its reorder included', () => {
      const returned: Order = { lines: [order.lines[1]!, order.lines[0]!] };
      expect(keepEditsSince(order, { lines: [...order.lines] }, returned)).toBe(returned);
      const withNotes = { ...order, notes: '' };
      const merged = keepEditsSince(withNotes, { ...withNotes, notes: 'typed' }, { ...withNotes, lines: returned.lines });
      expect(merged.lines).toBe(returned.lines);
      expect(merged.notes).toBe('typed');
    });

    it('the server reorders the rows (same length) while the user edits one: the user array whole, no edit moved', () => {
      const current: Order = { lines: [order.lines[0]!, { desc: 'switch', price: 20 }] };
      const returned: Order = { lines: [order.lines[1]!, { desc: 'Cable', price: 1.23 }] };
      expect(keepEditsSince(order, current, returned).lines).toBe(current.lines);
    });

    it('an array resized meanwhile (by the user or by the server) keeps the user array whole', () => {
      const longer = { ...sent, lines: [{ qty: 1 }, { qty: 2 }, { qty: 3 }] };
      expect(keepEditsSince(sent, longer, { ...sent, lines: [{ qty: 10 }, { qty: 2 }] }).lines).toBe(longer.lines);
      const edited = { ...sent, lines: [{ qty: 1 }, { qty: 7 }] };
      expect(keepEditsSince(sent, edited, { ...sent, lines: [{ qty: 1 }] }).lines).toBe(edited.lines);
    });
  });

  it('keys: removed by the user stays removed, added by the user stays, not returned is dropped unless edited', () => {
    type Bag = Record<string, number>;
    const base: Bag = { a: 1, b: 2, c: 3 };
    // `b` removed by the user, `d` added by the user, `a` edited.
    expect(keepEditsSince<Bag>(base, { a: 9, c: 3, d: 4 }, { a: 1, b: 20, c: 30, e: 5 })).toEqual({ a: 9, c: 30, e: 5, d: 4 });
    // `c` not returned by the server: dropped when untouched, kept when edited.
    expect(keepEditsSince<Bag>(base, { a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(keepEditsSince<Bag>(base, { a: 1, b: 2, c: 8 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2, c: 8 });
    // A key added by the user that the server also returns: the user's value.
    expect(keepEditsSince<Bag>(base, { ...base, d: 4 }, { ...base, d: 40 })).toEqual({ ...base, d: 4 });
    // A key the server added: comes in.
    expect(keepEditsSince<Bag>(base, { ...base, a: 9 }, { ...base, e: 5 })).toEqual({ ...base, a: 9, e: 5 });
    // With another field edited (the merge descends): an untouched key not returned is still dropped.
    const dropped = keepEditsSince<Bag>(base, { a: 9, b: 2, c: 3 }, { a: 1, b: 2 });
    expect(dropped).toEqual({ a: 9, b: 2 });
    expect(Object.hasOwn(dropped, 'c')).toBe(false);
  });

  it('a key added by the user with the value undefined stays undefined, also when the server returns a value', () => {
    type Bag = Record<string, number | undefined>;
    const merged = keepEditsSince<Bag>({ a: 1 }, { a: 1, d: undefined }, { a: 1, d: 5 });
    expect(Object.hasOwn(merged, 'd')).toBe(true);
    expect(merged.d).toBeUndefined();
  });

  it("absent values are distinct: '', null, undefined and a missing key (Level 1)", () => {
    type Note = { note?: string | null; other: string };
    const s: Note = { note: null, other: 'x' };
    // Typed then cleared: '' is not null, so the field was edited and keeps ''.
    expect(keepEditsSince<Note>(s, { ...s, other: 'x', note: '' }, { note: null, other: 'X' })).toEqual({ note: '', other: 'X' });
    expect(keepEditsSince<Note>(s, { ...s, note: undefined }, { note: null, other: 'X' })).toEqual({ note: undefined, other: 'X' });
    // A key set to undefined is not a missing key.
    const missing: Note = { other: 'x' };
    const merged = keepEditsSince<Note>(missing, { other: 'x', note: undefined }, { other: 'X' });
    expect(Object.hasOwn(merged, 'note')).toBe(true);
    expect(merged.other).toBe('X');
  });

  it('a Map, a Set and a class instance are leaves kept by reference (never descended into)', () => {
    class Money {
      constructor(readonly cents: number) {}
    }
    const tags = new Set(['a']);
    const meta = new Map([['k', 1]]);
    const price = new Money(100);
    const s = { tags, meta, price, name: 'r' };
    const returned = { tags: new Set(['a']), meta: new Map([['k', 1]]), price: new Money(100), name: 'R' };
    // Not edited (same references): the server's objects.
    const untouched = keepEditsSince(s, { ...s, name: 'r' }, returned);
    expect(untouched).toBe(returned);
    // Replaced by other objects with the same content: an edit, kept whole by reference.
    const current = { tags: new Set(['a']), meta, price: new Money(100), name: 'r' };
    const merged = keepEditsSince(s, current, returned);
    expect(merged.tags).toBe(current.tags);
    expect(merged.price).toBe(current.price);
    expect(merged.meta).toBe(returned.meta);
    expect(merged.name).toBe('R');
  });

  it('a returned value that is not a plain object (a class instance) at the root: the user values whole', () => {
    class Record_ {
      constructor(readonly name: string, readonly amount: number) {}
    }
    const s = { name: 'r', amount: 1 };
    const current = { name: 'r', amount: 2 };
    const returned = new Record_('R', 1) as unknown as typeof s;
    expect(keepEditsSince(s, current, returned)).toBe(current);
    expect(keepEditsSince(s, { ...s }, returned)).toBe(returned);
  });

  it('a null prototype is kept, and a `__proto__` key is merged as data', () => {
    const make = (entries: Record<string, unknown>) => Object.assign(Object.create(null) as Record<string, unknown>, entries);
    const s = make({ a: 'x', b: 'y' });
    const current = make({ a: 'x', b: 'typed' });
    const returned = make({ a: 'X', b: 'y' });
    const merged = keepEditsSince(s, current, returned);
    expect(Object.getPrototypeOf(merged)).toBeNull();
    expect({ ...merged }).toEqual({ a: 'X', b: 'typed' });

    const withProto = JSON.parse('{"__proto__": {"x": 1}, "n": "a"}') as Record<string, unknown>;
    const edited = JSON.parse('{"__proto__": {"x": 2}, "n": "a"}') as Record<string, unknown>;
    const stored = JSON.parse('{"__proto__": {"x": 1}, "n": "A"}') as Record<string, unknown>;
    const out = keepEditsSince(withProto, edited, stored);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual({ x: 2 });
    expect(out.n).toBe('A');
  });

  it('0 and -0 are the same content (deepEqual), unlike the adapter (Object.is): documented difference', () => {
    const s = { n: 0, name: 'r' };
    const returned = { n: 0, name: 'R' };
    expect(keepEditsSince(s, { n: -0, name: 'r' }, returned)).toBe(returned);
  });

  it('never mutates its arguments (deep-frozen) and never copies deeply: subtrees keep their identity', () => {
    const s = deepFreeze({ supplier: { name: 'rossi', city: 'turin' }, lines: [{ qty: 1 }], extra: { a: 1 }, note: '' });
    const current = deepFreeze({ supplier: { name: 'rossi', city: 'milan' }, lines: [{ qty: 2 }], extra: { a: 1 }, note: '' });
    const returned = deepFreeze({ supplier: { name: 'Rossi', city: 'Turin' }, lines: [{ qty: 1 }], extra: { a: 1 }, note: 'N' });
    const merged = keepEditsSince(s, current, returned);
    expect(merged).toEqual({ supplier: { name: 'Rossi', city: 'milan' }, lines: [{ qty: 2 }], extra: { a: 1 }, note: 'N' });
    expect(merged.lines).toBe(current.lines);
    expect(merged.extra).toBe(returned.extra);
    expect(s).toEqual({ supplier: { name: 'rossi', city: 'turin' }, lines: [{ qty: 1 }], extra: { a: 1 }, note: '' });
  });
});
