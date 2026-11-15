// The pure snapshot helpers of the React Hook Form adapter (ticket #507).
import { fieldErrorPaths, isPlainRecord, keepEditsSince, sameContent, samePathValue, snapshotOf, valueAtPath } from './snapshot';

describe('snapshotOf', () => {
  it('copies plain objects, arrays and dates: nothing of the source is in the result', () => {
    const date = new Date('2026-01-02T00:00:00Z');
    const source = { a: { b: [1, { c: 2 }] }, d: date };
    const snap = snapshotOf(source);
    expect(snap).toEqual(source);
    expect(snap).not.toBe(source);
    expect(snap.a).not.toBe(source.a);
    expect(snap.a.b).not.toBe(source.a.b);
    expect(snap.a.b[1]).not.toBe(source.a.b[1]);
    expect(snap.d).not.toBe(date);
    expect(snap.d.getTime()).toBe(date.getTime());
    // A later mutation of the source does not reach the snapshot.
    (source.a.b[1] as { c: number }).c = 99;
    expect((snap.a.b[1] as { c: number }).c).toBe(2);
  });

  it('returns the previous snapshot itself when the content is the same', () => {
    const previous = snapshotOf({ a: { b: [1, 2] }, d: new Date(5) });
    expect(snapshotOf({ a: { b: [1, 2] }, d: new Date(5) }, previous)).toBe(previous);
  });

  it('a change gives new objects only on its path: the other subtrees keep their identity', () => {
    const previous = snapshotOf({ left: { x: 1 }, right: { y: [1, 2] } });
    const next = snapshotOf({ left: { x: 2 }, right: { y: [1, 2] } }, previous);
    expect(next).not.toBe(previous);
    expect(next.left).not.toBe(previous.left);
    expect(next.right).toBe(previous.right);
    expect(previous.left.x).toBe(1);
  });

  it.each([
    ['a missing key against undefined', { a: 1 }, { a: 1, b: undefined }],
    ['an added key', { a: 1 }, { a: 1, b: 2 }],
    ['a renamed key', { a: 1, b: 2 }, { a: 1, c: 2 }],
    ['a longer array', { a: [1] }, { a: [1, 2] }],
    ['a shorter array', { a: [1, 2] }, { a: [1] }],
    ['an object with fewer keys', { a: 1, b: 2 }, { a: 1 }],
    ['0 against -0', { a: 0 }, { a: -0 }],
    ['a string against a number', { a: '10' }, { a: 10 }],
    ['another date', { a: new Date(1) }, { a: new Date(2) }],
    ['an object against null', { a: {} }, { a: null }],
    ['an array against an object with the same keys', { a: ['x'] }, { a: { 0: 'x' } }],
    ['a null-prototype object against a plain one', { a: Object.assign(Object.create(null) as object, { k: 1 }) }, { a: { k: 1 } }],
  ])('%s is a change', (_label, before, after) => {
    const previous = snapshotOf<object>(before);
    expect(snapshotOf<object>(after, previous)).not.toBe(previous);
    expect(sameContent(after, previous)).toBe(false);
  });

  it('NaN equals NaN; a class instance, a Map and a function are leaves kept by reference', () => {
    class Money {
      constructor(readonly cents: number) {}
    }
    const money = new Money(5);
    const map = new Map([['k', 1]]);
    const fn = () => 1;
    const snap = snapshotOf({ n: NaN, money, map, fn });
    expect(snap.money).toBe(money);
    expect(snap.map).toBe(map);
    expect(snap.fn).toBe(fn);
    expect(snapshotOf({ n: NaN, money, map, fn }, snap)).toBe(snap);
    expect(snapshotOf({ n: NaN, money: new Money(5), map, fn }, snap)).not.toBe(snap);
  });

  it('keeps a null prototype, and copies a `__proto__` key as data', () => {
    const source = Object.create(null) as Record<string, unknown>;
    source.a = 1;
    const snap = snapshotOf(source);
    expect(Object.getPrototypeOf(snap)).toBeNull();
    const withProto = JSON.parse('{"__proto__": {"polluted": true}, "b": 1}') as Record<string, unknown>;
    const copied = snapshotOf(withProto);
    expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
    expect(Object.hasOwn(copied, '__proto__')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('a frozen source is read, never written', () => {
    const frozen = Object.freeze({ a: Object.freeze([Object.freeze({ b: 1 })]) });
    expect(() => snapshotOf(frozen)).not.toThrow();
    expect(snapshotOf(frozen, snapshotOf(frozen))).toEqual(frozen);
  });
});

describe('sameContent / valueAtPath / samePathValue', () => {
  it('compares content, not identity', () => {
    expect(sameContent({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameContent({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(sameContent(undefined, undefined)).toBe(true);
    expect(sameContent(undefined, null)).toBe(false);
    // Leaves at the top: `Object.is`.
    expect(sameContent(NaN, NaN)).toBe(true);
    expect(sameContent(0, -0)).toBe(false);
    expect(sameContent('1', 1)).toBe(false);
  });

  it('reads a dot path through objects and arrays, a missing step is not undefined', () => {
    const root = { a: { b: [{ c: 1 }, { c: undefined }] } };
    expect(valueAtPath(root, 'a.b.0.c')).toEqual({ found: true, value: 1 });
    expect(valueAtPath(root, 'a.b.1.c')).toEqual({ found: true, value: undefined });
    expect(valueAtPath(root, 'a.b.2.c')).toEqual({ found: false, value: undefined });
    expect(valueAtPath(root, 'a.x')).toEqual({ found: false, value: undefined });
    expect(valueAtPath(root, 'a.b.-1')).toEqual({ found: false, value: undefined });
    expect(valueAtPath(root, 'a.b.0.c.d')).toEqual({ found: false, value: undefined });
  });

  it('samePathValue: missing on both sides is the same, missing against undefined is not', () => {
    expect(samePathValue({ a: 1 }, { a: 1, b: 2 }, 'a')).toBe(true);
    expect(samePathValue({}, {}, 'x')).toBe(true);
    expect(samePathValue({}, { x: undefined }, 'x')).toBe(false);
    expect(samePathValue({ x: [1] }, { x: [1] }, 'x')).toBe(true);
  });
});

describe('fieldErrorPaths', () => {
  it('lists the field errors with the path of their value; form-level errors are left out; a ref is never walked', () => {
    const ref = { focus: () => undefined, self: {} as unknown };
    (ref as { self: unknown }).self = ref;
    const errors = {
      root: { server: { type: 'server', message: 'Down' } },
      supplier: { name: { type: 'required', message: 'Required', ref } },
      lines: Object.assign([undefined, { qty: { type: 'min', ref } }], { root: { type: 'minLength' } }),
      address: { type: 'validate', message: 'Invalid', ref, city: { type: 'required' } },
    };
    expect(fieldErrorPaths(errors)).toEqual([
      { errorPath: 'supplier.name', valuePath: 'supplier.name' },
      { errorPath: 'lines.1.qty', valuePath: 'lines.1.qty' },
      { errorPath: 'lines.root', valuePath: 'lines' },
      { errorPath: 'address', valuePath: 'address' },
      { errorPath: 'address.city', valuePath: 'address.city' },
    ]);
  });

  it('isPlainRecord: only plain or null-prototype objects', () => {
    expect(isPlainRecord({})).toBe(true);
    expect(isPlainRecord(Object.create(null))).toBe(true);
    expect(isPlainRecord([])).toBe(false);
    expect(isPlainRecord(new Date())).toBe(false);
    expect(isPlainRecord(null)).toBe(false);
  });
});

describe('keepEditsSince (a save that settles while the user kept typing)', () => {
  const sent = { supplier: 'rossi', amount: '1300', notes: '', lines: [{ qty: 1 }, { qty: 2 }] };

  it('nothing edited since the save started: the returned object itself, normalization included', () => {
    const returned = { supplier: 'Rossi', amount: '1300.00', notes: '', lines: [{ qty: 1 }, { qty: 2 }] };
    expect(keepEditsSince(sent, { ...sent }, returned)).toBe(returned);
    expect(keepEditsSince(sent, sent, returned)).toBe(returned);
  });

  it('a field edited meanwhile keeps the typed value; the untouched ones take the server value', () => {
    const current = { ...sent, notes: 'typed during save' };
    const returned = { supplier: 'Rossi', amount: '1300.00', notes: '', lines: sent.lines };
    const merged = keepEditsSince(sent, current, returned);
    expect(merged).toEqual({ supplier: 'Rossi', amount: '1300.00', notes: 'typed during save', lines: sent.lines });
    expect(merged).not.toBe(returned);
    // Nothing mutated.
    expect(returned.notes).toBe('');
    expect(current.supplier).toBe('rossi');
  });

  it('a field the server normalized and the user edited meanwhile keeps the typed value', () => {
    const current = { ...sent, supplier: 'rossi spa' };
    const returned = { ...sent, supplier: 'Rossi' };
    expect(keepEditsSince(sent, current, returned)).toEqual({ ...sent, supplier: 'rossi spa' });
  });

  it('a field edited and typed back to the sent value counts as untouched (content, not gestures)', () => {
    const returned = { ...sent, supplier: 'Rossi' };
    expect(keepEditsSince(sent, { ...sent, supplier: 'rossi' }, returned)).toBe(returned);
  });

  it('without an id key an edited array is kept whole, also with the same length (rows are never paired by position)', () => {
    const current = { ...sent, lines: [{ qty: 1 }, { qty: 5 }] };
    const returned = { ...sent, lines: [{ qty: 10 }, { qty: 2 }] };
    expect(keepEditsSince(sent, current, returned).lines).toEqual([{ qty: 1 }, { qty: 5 }]);
    // Not edited: the server's array (its reorder included).
    expect(keepEditsSince(sent, { ...sent }, { ...sent, lines: [{ qty: 2 }, { qty: 1 }] }).lines).toEqual([{ qty: 2 }, { qty: 1 }]);
  });

  describe('with arrayIdKeys: rows matched by id', () => {
    type Row = { id: string; desc: string; qty: number };
    type Order = { number: string; lines: Row[] };
    const ids = { lines: 'id' };
    const A: Row = { id: 'A', desc: 'cable', qty: 1 };
    const B: Row = { id: 'B', desc: 'switch', qty: 2 };
    const C: Row = { id: 'C', desc: 'router', qty: 3 };
    const order: Order = { number: 'PO-1', lines: [A, B, C] };

    it('the server reorders the rows (same length) while the user edits one: the edit stays on its row, in the server order', () => {
      const current = { ...order, lines: [A, { ...B, qty: 20 }, C] };
      const returned = { ...order, lines: [{ ...C, desc: 'Router' }, A, B] };
      expect(keepEditsSince(order, current, returned, ids).lines).toEqual([{ ...C, desc: 'Router' }, A, { ...B, qty: 20 }]);
      // Without the id key the edited array is kept whole: no edit lands on another row either.
      expect(keepEditsSince(order, current, returned).lines).toEqual(current.lines);
    });

    it('inside a matched row only the edited field is kept; the others take the server value', () => {
      const current = { ...order, lines: [A, { ...B, qty: 20 }, C] };
      const returned = { ...order, lines: [A, { ...B, desc: 'Switch' }, C] };
      expect(keepEditsSince(order, current, returned, ids).lines).toEqual([A, { ...B, desc: 'Switch', qty: 20 }, C]);
    });

    it('the user reordered the rows: the user order; rows added by the user stay, removed stay removed', () => {
      const D: Row = { id: 'D', desc: 'mine', qty: 4 };
      // The user moved C first, removed A and added D; the server normalized B and added E.
      const E: Row = { id: 'E', desc: 'theirs', qty: 5 };
      const current = { ...order, lines: [C, B, D] };
      const returned = { ...order, lines: [A, { ...B, desc: 'Switch' }, C, E] };
      expect(keepEditsSince(order, current, returned, ids).lines).toEqual([C, { ...B, desc: 'Switch' }, D, E]);
    });

    it('a row the server dropped goes, unless the user edited it during the save', () => {
      const returned = { ...order, lines: [A, B] };
      expect(keepEditsSince(order, { ...order, lines: [A, { ...B, qty: 9 }, C] }, returned, ids).lines).toEqual([A, { ...B, qty: 9 }]);
      expect(keepEditsSince(order, { ...order, lines: [A, B, { ...C, qty: 9 }] }, returned, ids).lines).toEqual([A, B, { ...C, qty: 9 }]);
    });

    it('a row without id, or two rows with the same id, in any of the three: the edited array is kept whole', () => {
      const current = { ...order, lines: [A, { ...B, qty: 20 }, C] };
      const reordered = { ...order, lines: [C, A, B] };
      const noId = { ...order, lines: [C, A, { ...B, id: undefined as unknown as string }] };
      expect(keepEditsSince(order, current, noId, ids).lines).toEqual(current.lines);
      const duplicate = { ...order, lines: [C, A, { ...B, id: 'A' }] };
      expect(keepEditsSince(order, current, duplicate, ids).lines).toEqual(current.lines);
      expect(keepEditsSince(order, current, reordered, ids).lines).toEqual([C, A, { ...B, qty: 20 }]);
    });

    it('a new row without id sent, removed by the user during the save, the server assigns ids: the user array whole', () => {
      // Only the sent rows lack an id (the guard on the sent side): the rows cannot be paired with the sent ones.
      const fresh = { desc: 'new', qty: 9 } as unknown as Row;
      const sentOrder = { ...order, lines: [A, B, fresh] };
      const current = { ...order, lines: [A, { ...B, qty: 20 }] };
      const returned = { ...order, lines: [A, B, { id: 'N', desc: 'new', qty: 9 }] };
      expect(() => keepEditsSince(sentOrder, current, returned, ids)).not.toThrow();
      expect(keepEditsSince(sentOrder, current, returned, ids).lines).toEqual(current.lines);
    });

    it('nested arrays use their own path (lines.taxes)', () => {
      type Taxed = { lines: { id: string; taxes: { code: string; rate: number }[] }[] };
      const s: Taxed = { lines: [{ id: 'A', taxes: [{ code: 'V', rate: 22 }, { code: 'X', rate: 0 }] }] };
      const current: Taxed = { lines: [{ id: 'A', taxes: [{ code: 'V', rate: 10 }, { code: 'X', rate: 0 }] }] };
      const returned: Taxed = { lines: [{ id: 'A', taxes: [{ code: 'X', rate: 1 }, { code: 'V', rate: 22 }] }] };
      expect(keepEditsSince(s, current, returned, { lines: 'id', 'lines.taxes': 'code' }).lines[0]!.taxes).toEqual([
        { code: 'X', rate: 1 },
        { code: 'V', rate: 10 },
      ]);
    });
  });

  it('an array resized meanwhile (by the user or by the server) keeps the user array whole', () => {
    const current = { ...sent, lines: [{ qty: 1 }, { qty: 2 }, { qty: 3 }] };
    const returned = { ...sent, lines: [{ qty: 10 }, { qty: 2 }] };
    expect(keepEditsSince(sent, current, returned).lines).toEqual([{ qty: 1 }, { qty: 2 }, { qty: 3 }]);
    const shorter = { ...sent, lines: [{ qty: 1 }] };
    expect(keepEditsSince(sent, { ...sent, lines: [{ qty: 1 }, { qty: 7 }] }, shorter).lines).toEqual([{ qty: 1 }, { qty: 7 }]);
  });

  it('keys: removed by the user stays removed, added by the user stays, not returned is dropped unless edited', () => {
    type Bag = Record<string, number>;
    const base: Bag = { a: 1, b: 2, c: 3 };
    // `b` removed by the user (a field unregistered), `d` added by the user, `a` edited.
    expect(keepEditsSince<Bag>(base, { a: 9, c: 3, d: 4 }, { a: 1, b: 20, c: 30, e: 5 })).toEqual({ a: 9, c: 30, e: 5, d: 4 });
    // `c` not returned by the server: dropped when untouched, kept when edited.
    expect(keepEditsSince<Bag>(base, { a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(keepEditsSince<Bag>(base, { a: 1, b: 2, c: 8 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2, c: 8 });
  });

  it('nested objects: only the edited leaf is kept; dates and NaN compared by content', () => {
    const s = { supplier: { name: 'r', city: 'turin' }, at: new Date(5), n: Number.NaN };
    const current = { supplier: { name: 'r', city: 'milan' }, at: new Date(5), n: Number.NaN };
    const returned = { supplier: { name: 'R', city: 'Turin' }, at: new Date(6), n: 1 };
    expect(keepEditsSince(s, current, returned)).toEqual({ supplier: { name: 'R', city: 'milan' }, at: new Date(6), n: 1 });
  });
});
