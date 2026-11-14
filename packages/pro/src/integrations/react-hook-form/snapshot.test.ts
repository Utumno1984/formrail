// The pure snapshot helpers of the React Hook Form adapter (ticket #507).
import { fieldErrorPaths, isPlainRecord, sameContent, samePathValue, snapshotOf, valueAtPath } from './snapshot';

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
    ['an array of another length', { a: [1] }, { a: [1, 2] }],
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
