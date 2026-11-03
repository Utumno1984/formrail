import type { MockInstance } from 'vitest';
import { computeChangeSummary, resetChangeSummaryWarnings } from './compute-change-summary';
import type { ChangeEntry, ChangeSummaryOptions } from './types';

type Loose = Record<string, unknown>;

const diff = (baseline: unknown, values: unknown, rest: Omit<ChangeSummaryOptions<Loose>, 'values' | 'baseline'> = {}) =>
  computeChangeSummary<Loose>({ baseline: baseline as Loose, values: values as Loose, ...rest });

/** Compact view: path, kind, before, after. */
const brief = (entries: ChangeEntry[]) => entries.map(({ path, kind, before, after }) => ({ path, kind, before, after }));
const paths = (entries: ChangeEntry[]) => entries.map((e) => `${e.kind} ${e.path}`);

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  resetChangeSummaryWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe('"no value" rule: full matrix', () => {
  const MISSING = Symbol('missing key');
  const cells = { undefined, null: null, missing: MISSING, empty: '', x: 'x', y: 'y' } as const;
  type Cell = keyof typeof cells;
  const wrap = (cell: Cell): Loose => (cells[cell] === MISSING ? {} : { f: cells[cell] });
  const v = (cell: Cell): unknown => (cells[cell] === MISSING ? undefined : cells[cell]);

  // [baseline, values, expected kind or null for "no entry"] — written out in full on purpose.
  const table: [Cell, Cell, 'added' | 'removed' | 'changed' | null][] = [
    ['undefined', 'undefined', null],
    ['undefined', 'null', null],
    ['undefined', 'missing', null],
    ['undefined', 'empty', null],
    ['undefined', 'x', 'added'],
    ['undefined', 'y', 'added'],
    ['null', 'undefined', null],
    ['null', 'null', null],
    ['null', 'missing', null],
    ['null', 'empty', null],
    ['null', 'x', 'added'],
    ['null', 'y', 'added'],
    ['missing', 'undefined', null],
    ['missing', 'null', null],
    ['missing', 'missing', null],
    ['missing', 'empty', null],
    ['missing', 'x', 'added'],
    ['missing', 'y', 'added'],
    ['empty', 'undefined', null],
    ['empty', 'null', null],
    ['empty', 'missing', null],
    ['empty', 'empty', null],
    ['empty', 'x', 'changed'],
    ['empty', 'y', 'changed'],
    ['x', 'undefined', 'removed'],
    ['x', 'null', 'removed'],
    ['x', 'missing', 'removed'],
    ['x', 'empty', 'changed'],
    ['x', 'x', null],
    ['x', 'y', 'changed'],
    ['y', 'undefined', 'removed'],
    ['y', 'null', 'removed'],
    ['y', 'missing', 'removed'],
    ['y', 'empty', 'changed'],
    ['y', 'x', 'changed'],
    ['y', 'y', null],
  ];

  it('covers all 36 combinations', () => {
    expect(table).toHaveLength(36);
    expect(new Set(table.map(([a, b]) => `${a}|${b}`)).size).toBe(36);
  });

  it.each(table)('%s → %s: %s', (before, after, kind) => {
    const entries = diff(wrap(before), wrap(after));
    if (kind === null) {
      expect(entries).toEqual([]);
      return;
    }
    expect(brief(entries)).toEqual([
      {
        path: 'f',
        kind,
        before: kind === 'added' ? undefined : v(before),
        after: kind === 'removed' ? undefined : v(after),
      },
    ]);
  });
});

describe('"no value" rule: structures', () => {
  const absents = [undefined, null];

  it('[] against Absent gives no entry, both ways', () => {
    for (const absent of absents) {
      expect(diff({ list: [] }, { list: absent })).toEqual([]);
      expect(diff({ list: absent }, { list: [] })).toEqual([]);
      expect(diff({ list: [] }, {})).toEqual([]);
      expect(diff({}, { list: [] })).toEqual([]);
    }
  });

  it('a recursively Empty object against Absent gives no entry, both ways', () => {
    const empty = { a: '', b: { c: null }, d: [] };
    for (const absent of absents) {
      expect(diff({ o: empty }, { o: absent })).toEqual([]);
      expect(diff({ o: absent }, { o: empty })).toEqual([]);
    }
    expect(diff({ o: empty }, {})).toEqual([]);
    expect(diff({ o: {} }, { o: { a: undefined, b: { c: '' } } })).toEqual([]);
  });

  it('a non-empty object against Absent is one entry on the node, not on its leaves', () => {
    expect(brief(diff({ o: { a: 'x' } }, { o: null }))).toEqual([
      { path: 'o', kind: 'removed', before: { a: 'x' }, after: undefined },
    ]);
    expect(brief(diff({}, { o: { a: 'x', b: { c: 1 } } }))).toEqual([
      { path: 'o', kind: 'added', before: undefined, after: { a: 'x', b: { c: 1 } } },
    ]);
  });

  it('a non-empty array without id key against Absent is one entry on the node', () => {
    expect(brief(diff({ l: [1, 2] }, {}))).toEqual([{ path: 'l', kind: 'removed', before: [1, 2], after: undefined }]);
    expect(brief(diff({ l: null }, { l: [1] }))).toEqual([{ path: 'l', kind: 'added', before: undefined, after: [1] }]);
  });

  it("'' / [] / {} against a non-empty value compare structurally", () => {
    expect(brief(diff({ s: '' }, { s: 'abc' }))).toEqual([{ path: 's', kind: 'changed', before: '', after: 'abc' }]);
    expect(brief(diff({ l: [] }, { l: ['x'] }))).toEqual([{ path: 'l', kind: 'changed', before: [], after: ['x'] }]);
    expect(brief(diff({ o: {} }, { o: { a: 'x' } }))).toEqual([
      { path: 'o.a', kind: 'added', before: undefined, after: 'x' },
    ]);
  });

  it('mixed Empty kinds are equal to each other', () => {
    expect(diff({ v: '' }, { v: [] })).toEqual([]);
    expect(diff({ v: [] }, { v: {} })).toEqual([]);
    expect(diff({ v: '' }, { v: { a: null } })).toEqual([]);
    expect(diff({}, { v: { a: [], b: { c: '' } } })).toEqual([]);
  });

  it('applies the rule at the root too: two Empty roots give no entry', () => {
    expect(diff({ a: null }, { a: '', b: [] })).toEqual([]);
  });

  it('does not normalize anything else', () => {
    expect(brief(diff({ s: '' }, { s: ' ' }))).toEqual([{ path: 's', kind: 'changed', before: '', after: ' ' }]);
    expect(brief(diff({ s: 5 }, { s: '5' }))).toEqual([{ path: 's', kind: 'changed', before: 5, after: '5' }]);
    expect(brief(diff({ s: 0 }, { s: '' }))).toEqual([{ path: 's', kind: 'changed', before: 0, after: '' }]);
  });

  it('0, false and NaN are not Empty', () => {
    for (const value of [0, false, NaN]) {
      expect(brief(diff({}, { v: value }))).toEqual([{ path: 'v', kind: 'added', before: undefined, after: value }]);
      expect(brief(diff({ v: value }, { v: null }))).toEqual([{ path: 'v', kind: 'removed', before: value, after: undefined }]);
    }
  });

  it('normalizes the absent side of added/removed to undefined, even when it was null', () => {
    const [added] = diff({ v: null }, { v: 'x' });
    expect(added).toMatchObject({ kind: 'added', after: 'x' });
    expect(added?.before).toBeUndefined();
    expect(Object.hasOwn(added as object, 'before')).toBe(true);
    const [removed] = diff({ v: 'x' }, { v: null });
    expect(removed).toMatchObject({ kind: 'removed', before: 'x' });
    expect(removed?.after).toBeUndefined();
  });
});

describe('scalars, objects, special types', () => {
  it('NaN equals NaN and 0 equals -0', () => {
    expect(diff({ n: NaN }, { n: NaN })).toEqual([]);
    expect(diff({ n: 0 }, { n: -0 })).toEqual([]);
    expect(diff({ n: -0 }, { n: 0 })).toEqual([]);
  });

  it('NaN → number, Infinity changes are reported', () => {
    expect(brief(diff({ n: NaN }, { n: 1 }))).toEqual([{ path: 'n', kind: 'changed', before: NaN, after: 1 }]);
    expect(brief(diff({ n: 1 }, { n: Infinity }))).toEqual([{ path: 'n', kind: 'changed', before: 1, after: Infinity }]);
    expect(brief(diff({ n: Infinity }, { n: -Infinity }))).toHaveLength(1);
    expect(diff({ n: Infinity }, { n: Infinity })).toEqual([]);
  });

  it('compares dates by getTime()', () => {
    expect(diff({ d: new Date(5) }, { d: new Date(5) })).toEqual([]);
    expect(diff({ d: new Date('nope') }, { d: new Date('nope either') })).toEqual([]);
    const invalid = new Date('nope');
    const valid = new Date(0);
    expect(brief(diff({ d: invalid }, { d: valid }))).toEqual([{ path: 'd', kind: 'changed', before: invalid, after: valid }]);
    expect(diff({ d: new Date(1) }, { d: new Date(2) })).toHaveLength(1);
  });

  it('descends nested plain objects to the leaves with the full path', () => {
    const entries = diff(
      { supplier: { name: 'Acme', address: { city: 'Rome', zip: '00100' } } },
      { supplier: { name: 'Acme', address: { city: 'Milan', zip: '00100' } } },
    );
    expect(brief(entries)).toEqual([{ path: 'supplier.address.city', kind: 'changed', before: 'Rome', after: 'Milan' }]);
    expect(entries[0]?.labelPath).toEqual(['Supplier', 'Address', 'City']);
    expect(entries[0]?.label).toBe('Supplier > Address > City');
  });

  it('a structural type change between two non-Empty values is one entry on the node', () => {
    const cases: [unknown, unknown][] = [
      [{ a: 1 }, 'text'],
      ['text', { a: 1 }],
      [[1], { 0: 1 }],
      [{ 0: 1 }, [1]],
      [new Date(0), '1970-01-01'],
      ['1970-01-01', new Date(0)],
      [{ a: 1 }, new Date(0)],
      [[1], 'x'],
    ];
    for (const [before, after] of cases) {
      expect(brief(diff({ v: before }, { v: after }))).toEqual([{ path: 'v', kind: 'changed', before, after }]);
    }
  });

  it('treats Map, Set, class instances and functions as leaves compared by reference, never Empty', () => {
    class Money {
      constructor(readonly cents: number) {}
    }
    const map = new Map([['a', 1]]);
    const fn = () => 1;
    expect(diff({ m: map, f: fn }, { m: map, f: fn })).toEqual([]);
    expect(diff({ m: new Map([['a', 1]]) }, { m: new Map([['a', 1]]) })).toHaveLength(1);
    expect(diff({ s: new Set() }, { s: new Set() })).toHaveLength(1);
    expect(diff({ c: new Money(1) }, { c: new Money(1) })).toHaveLength(1);
    expect(diff({ f: () => 1 }, { f: () => 1 })).toHaveLength(1);
    // Never Empty: an empty Map / Set / instance against Absent is a real change.
    expect(paths(diff({}, { m: new Map(), s: new Set(), c: new Money(0) }))).toEqual(['added m', 'added s', 'added c']);
  });

  it('treats null-prototype objects as plain objects', () => {
    const a = Object.assign(Object.create(null) as Loose, { x: 1 });
    const b = Object.assign(Object.create(null) as Loose, { x: 2 });
    expect(paths(diff({ o: a }, { o: b }))).toEqual(['changed o.x']);
  });

  it('ignores Symbol keys and non-enumerable properties', () => {
    const sym = Symbol('s');
    const a: Loose = { x: 1, [sym]: 1 };
    const b: Loose = { x: 1, [sym]: 2 };
    Object.defineProperty(b, 'hidden', { value: 'nope', enumerable: false });
    expect(diff(a, b)).toEqual([]);
  });

  it('treats constructor / __proto__ / toString own keys as ordinary keys', () => {
    const before = JSON.parse('{"__proto__": 1, "constructor": "a"}') as Loose;
    const after = JSON.parse('{"__proto__": 2, "toString": "t"}') as Loose;
    expect(brief(diff(before, after))).toEqual([
      { path: '__proto__', kind: 'changed', before: 1, after: 2 },
      { path: 'toString', kind: 'added', before: undefined, after: 't' },
      { path: 'constructor', kind: 'removed', before: 'a', after: undefined },
    ]);
    // Inherited names are not keys.
    expect(diff({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('handles keys containing a dot, very long strings, whitespace-only strings and non-ASCII keys', () => {
    const dotted = diff({ 'a.b': 1 }, { 'a.b': 2 });
    expect(dotted[0]).toMatchObject({ path: 'a.b', labelPath: ['A.b'], kind: 'changed' });
    const long = 'x'.repeat(100_000);
    expect(diff({ s: long }, { s: `${long}` })).toEqual([]);
    expect(diff({ s: long }, { s: `${long}y` })).toHaveLength(1);
    expect(paths(diff({ s: '   ' }, { s: '\t' }))).toEqual(['changed s']);
    expect(diff({ città: 'Roma' }, { città: 'Milano' })[0]).toMatchObject({ path: 'città', label: 'Città' });
  });
});

describe('circular structures', () => {
  it('terminates and reports the real differences of two cyclic graphs', () => {
    const a: Loose = { x: 1 };
    a.self = a;
    const b: Loose = { x: 2 };
    b.self = b;
    expect(paths(diff({ o: a }, { o: b }))).toEqual(['changed o.x']);
  });

  it('terminates on cycles of different period', () => {
    const a1: Loose = { v: 1 };
    const a2: Loose = { v: 1, next: a1 };
    a1.next = a2;
    const b: Loose = { v: 1 };
    b.next = b;
    expect(() => diff({ o: a1 }, { o: b })).not.toThrow();
    expect(diff({ o: a1 }, { o: b })).toEqual([]);
  });

  it('an Empty circular object against Absent terminates with no entry', () => {
    const o: Loose = {};
    o.self = o;
    expect(diff({ o }, {})).toEqual([]);
    expect(diff({}, { o })).toEqual([]);
    expect(diff({ o }, { o: null })).toEqual([]);
  });

  it('a non-Empty circular object against Absent is one entry', () => {
    const o: Loose = { a: 'x' };
    o.self = o;
    expect(paths(diff({ o }, {}))).toEqual(['removed o']);
  });

  it('terminates on circular arrays, with and without id key', () => {
    const a: unknown[] = [];
    a.push({ id: 1, list: a });
    const b: unknown[] = [];
    b.push({ id: 1, list: b });
    expect(diff({ l: a }, { l: b })).toEqual([]);
    expect(diff({ l: a }, { l: b }, { arrayIdKeys: { l: 'id' } })).toEqual([]);
  });

  it('does not treat a shared (non-cyclic) reference compared twice as equal by mistake', () => {
    const shared = { v: 1 };
    const changed = { v: 2 };
    expect(paths(diff({ a: shared, b: shared }, { a: changed, b: changed }))).toEqual(['changed a.v', 'changed b.v']);
  });
});

describe('arrays with arrayIdKeys', () => {
  const ids = { lineItems: 'id' };
  const item = (id: unknown, price = 10, qty = 1) => ({ id, price, qty });

  it('removed id: path on the baseline index; new id: path on the values index', () => {
    const entries = diff(
      { lineItems: [item(1), item(2), item(3)] },
      { lineItems: [item(1), item(3), item(4)] },
      { arrayIdKeys: ids },
    );
    expect(brief(entries)).toEqual([
      { path: 'lineItems.2', kind: 'added', before: undefined, after: item(4) },
      { path: 'lineItems.1', kind: 'removed', before: item(2), after: undefined },
    ]);
    expect(entries[0]?.labelPath).toEqual(['Line Items', 'Item 3']);
    expect(entries[1]?.labelPath).toEqual(['Line Items', 'Item 2']);
  });

  it('a matched item yields one entry per changed field, on the values index', () => {
    const entries = diff(
      { lineItems: [item(1), item(2, 10, 1)] },
      { lineItems: [item(2, 12, 3), item(1)] },
      { arrayIdKeys: ids },
    );
    expect(brief(entries)).toEqual([
      { path: 'lineItems.0.price', kind: 'changed', before: 10, after: 12 },
      { path: 'lineItems.0.qty', kind: 'changed', before: 1, after: 3 },
    ]);
    expect(entries[0]?.label).toBe('Line Items > Item 1 > Price');
  });

  it('a reorder without changes gives no entry', () => {
    expect(
      diff({ lineItems: [item(1), item(2), item(3)] }, { lineItems: [item(3), item(1), item(2)] }, { arrayIdKeys: ids }),
    ).toEqual([]);
  });

  it('a reorder plus one change gives only that entry', () => {
    expect(
      paths(diff({ lineItems: [item(1), item(2), item(3)] }, { lineItems: [item(3), item(1, 99), item(2)] }, { arrayIdKeys: ids })),
    ).toEqual(['changed lineItems.1.price']);
  });

  it('items without id are always added / removed, never matched to each other', () => {
    const entries = diff(
      { lineItems: [item(1), item(null), { price: 5 }] },
      { lineItems: [item(1), item(undefined), { price: 5 }] },
      { arrayIdKeys: ids },
    );
    expect(paths(entries)).toEqual(['added lineItems.1', 'added lineItems.2', 'removed lineItems.1', 'removed lineItems.2']);
  });

  it('non-object items are always added / removed', () => {
    expect(paths(diff({ lineItems: ['a', 1] }, { lineItems: ['a', 1] }, { arrayIdKeys: ids }))).toEqual([
      'added lineItems.0',
      'added lineItems.1',
      'removed lineItems.0',
      'removed lineItems.1',
    ]);
  });

  it('an item with id that becomes null is removed, and the null is added', () => {
    expect(brief(diff({ lineItems: [item(1)] }, { lineItems: [null] }, { arrayIdKeys: ids }))).toEqual([
      { path: 'lineItems.0', kind: 'added', before: undefined, after: null },
      { path: 'lineItems.0', kind: 'removed', before: item(1), after: undefined },
    ]);
  });

  it('compares ids with Object.is (1 and "1" differ, NaN matches NaN, 0 and -0 differ)', () => {
    expect(paths(diff({ lineItems: [item(1)] }, { lineItems: [item('1')] }, { arrayIdKeys: ids }))).toEqual([
      'added lineItems.0',
      'removed lineItems.0',
    ]);
    expect(diff({ lineItems: [item(NaN)] }, { lineItems: [item(NaN)] }, { arrayIdKeys: ids })).toEqual([]);
    expect(paths(diff({ lineItems: [item(0)] }, { lineItems: [item(-0)] }, { arrayIdKeys: ids }))).toEqual([
      'added lineItems.0',
      'removed lineItems.0',
    ]);
  });

  it('an array with id key that becomes [] or Absent gives one removed per item', () => {
    for (const after of [[], undefined, null]) {
      expect(paths(diff({ lineItems: [item(1), item(2)] }, { lineItems: after }, { arrayIdKeys: ids }))).toEqual([
        'removed lineItems.0',
        'removed lineItems.1',
      ]);
    }
    expect(paths(diff({ lineItems: [item(1), item(2)] }, {}, { arrayIdKeys: ids }))).toEqual([
      'removed lineItems.0',
      'removed lineItems.1',
    ]);
  });

  it('from Absent or [] to N items gives one added per item (symmetric)', () => {
    for (const before of [[], undefined, null]) {
      const entries = diff({ lineItems: before }, { lineItems: [item(1), item(2)] }, { arrayIdKeys: ids });
      expect(brief(entries)).toEqual([
        { path: 'lineItems.0', kind: 'added', before: undefined, after: item(1) },
        { path: 'lineItems.1', kind: 'added', before: undefined, after: item(2) },
      ]);
    }
  });

  it('[] against Absent with an id key gives no entry', () => {
    expect(diff({ lineItems: [] }, { lineItems: null }, { arrayIdKeys: ids })).toEqual([]);
  });

  it('diffs a nested array inside matched items with its own id key', () => {
    const entries = diff(
      {
        lineItems: [
          { id: 'a', taxes: [{ code: 'V', rate: 22 }] },
          { id: 'b', taxes: [{ code: 'V', rate: 22 }, { code: 'X', rate: 1 }] },
        ],
      },
      {
        lineItems: [
          { id: 'a', taxes: [{ code: 'V', rate: 22 }] },
          { id: 'b', taxes: [{ code: 'V', rate: 10 }, { code: 'X', rate: 1 }] },
        ],
      },
      { arrayIdKeys: { lineItems: 'id', 'lineItems.taxes': 'code' } },
    );
    expect(entries.map(({ path, label, kind }) => ({ path, label, kind }))).toEqual([
      { path: 'lineItems.1.taxes.0.rate', label: 'Line Items > Item 2 > Taxes > Item 1 > Rate', kind: 'changed' },
    ]);
  });

  it('duplicate ids degrade that array to the block diff, with one development warning per path', () => {
    const before = { lineItems: [item(1), item(1)] };
    const after = { lineItems: [item(1, 5), item(1)] };
    expect(brief(diff(before, after, { arrayIdKeys: ids }))).toEqual([
      { path: 'lineItems', kind: 'changed', before: before.lineItems, after: after.lineItems },
    ]);
    diff({ lineItems: [item(2)] }, { lineItems: [item(2), item(2)] }, { arrayIdKeys: ids });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/duplicate 'id'.*lineItems/);
  });

  it('does not apply the array id key to the items themselves (no "not an array" warning on them)', () => {
    diff({ lineItems: [item(1), item(1)] }, { lineItems: [item(1, 5), item(1)] }, { arrayIdKeys: ids });
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => /not an array/.test(m))).toEqual([]);
  });

  it('duplicate ids with an Absent side give one atomic added / removed (block rules)', () => {
    expect(paths(diff({}, { lineItems: [item(1), item(1)] }, { arrayIdKeys: ids }))).toEqual(['added lineItems']);
  });

  it('warns about duplicates once per path, also for the same path inside different items', () => {
    const dup = [{ code: 'A' }, { code: 'A' }];
    diff(
      { lineItems: [{ id: 1, taxes: dup }, { id: 2, taxes: dup }] },
      { lineItems: [{ id: 1, taxes: [...dup, { code: 'B' }] }, { id: 2, taxes: [] }] },
      { arrayIdKeys: { lineItems: 'id', 'lineItems.taxes': 'code' } },
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ignores an id key on a non-array value, with a development warning', () => {
    expect(paths(diff({ lineItems: 'a' }, { lineItems: 'b' }, { arrayIdKeys: ids }))).toEqual(['changed lineItems']);
    expect(paths(diff({ lineItems: { id: 1 } }, { lineItems: [item(1)] }, { arrayIdKeys: ids }))).toEqual([
      'changed lineItems',
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/not an array/);
  });

  it('is silent with NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    diff({ lineItems: [item(1), item(1)] }, { lineItems: [item(1)] }, { arrayIdKeys: ids });
    diff({ lineItems: 'a' }, { lineItems: 'b' }, { arrayIdKeys: ids });
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for an id key whose path is Absent on both sides', () => {
    expect(diff({}, { other: 1 }, { arrayIdKeys: ids })).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays linear on 1000 items: isEqual calls ≤ constant × nodes', () => {
    const N = 1000;
    const make = (i: number, price: number) => ({ id: `row-${i}`, price, qty: 1, note: { text: 'n' } });
    const before = { lineItems: Array.from({ length: N }, (_, i) => make(i, 1)) };
    // Reversed order (worst case for a positional or nested search) and one real change.
    const after = { lineItems: Array.from({ length: N }, (_, i) => make(N - 1 - i, i === 0 ? 2 : 1)) };
    const isEqual = vi.fn(() => undefined);
    const entries = diff(before, after, { arrayIdKeys: ids, isEqual });
    expect(paths(entries)).toEqual(['changed lineItems.0.price']);
    // Nodes: the array, N items, 5 nodes under each item (id, price, qty, note, note.text).
    const nodes = 1 + N * 6;
    expect(isEqual.mock.calls.length).toBeLessThanOrEqual(nodes);
    expect(isEqual.mock.calls.length).toBeGreaterThan(N);
  });
});

describe('arrays without id key (block diff)', () => {
  it('deeply equal arrays give no entry', () => {
    expect(diff({ l: [{ a: 1, b: [1, 2] }] }, { l: [{ a: 1, b: [1, 2] }] })).toEqual([]);
  });

  it('positional pairs follow the same rules (Empty against Empty is equal)', () => {
    expect(diff({ l: [{ a: null }, ''] }, { l: [{ a: '' }, null] })).toEqual([]);
  });

  it('different arrays give one changed entry on the array with the whole arrays', () => {
    const before = { l: [{ a: 1 }, { a: 2 }] };
    const after = { l: [{ a: 1 }, { a: 3 }] };
    expect(brief(diff(before, after))).toEqual([{ path: 'l', kind: 'changed', before: before.l, after: after.l }]);
  });

  it('a mere reorder is one block entry: this is why an id key should be declared', () => {
    const before = { lineItems: [{ id: 1 }, { id: 2 }] };
    const after = { lineItems: [{ id: 2 }, { id: 1 }] };
    expect(paths(diff(before, after))).toEqual(['changed lineItems']);
    expect(diff(before, after, { arrayIdKeys: { lineItems: 'id' } })).toEqual([]);
  });

  it('a length change is one block entry', () => {
    expect(paths(diff({ l: [1] }, { l: [1, 2] }))).toEqual(['changed l']);
  });
});

describe('labels', () => {
  it('renders array indexes as 1-based "Item N" (values index; baseline index for removed)', () => {
    const entries = diff(
      { lineItems: [{ id: 1, price: 1 }, { id: 2 }, { id: 3, price: 1 }] },
      { lineItems: [{ id: 1, price: 1 }, { id: 3, price: 2 }] },
      { arrayIdKeys: { lineItems: 'id' } },
    );
    expect(entries.map((e) => [e.path, e.labelPath])).toEqual([
      ['lineItems.1.price', ['Line Items', 'Item 2', 'Price']],
      ['lineItems.1', ['Line Items', 'Item 2']],
    ]);
    const third = diff({ lineItems: [{ id: 1 }, { id: 2 }, { id: 3, price: 1 }] }, {
      lineItems: [{ id: 1 }, { id: 2 }, { id: 3, price: 2 }],
    }, { arrayIdKeys: { lineItems: 'id' } });
    expect(third[0]?.labelPath).toEqual(['Line Items', 'Item 3', 'Price']);
  });

  it('a numeric key of a plain object is not an index', () => {
    const [entry] = diff({ years: { 2024: 1 } }, { years: { 2024: 2 } });
    expect(entry).toMatchObject({ path: 'years.2024', labelPath: ['Years', '2024'] });
  });

  it('overrides replace one segment; ancestors stay inferred or overridden on their own', () => {
    const [entry] = diff({ supplier: { vatNumber: 'A' } }, { supplier: { vatNumber: 'B' } }, {
      labels: { 'supplier.vatNumber': 'VAT number' },
    });
    expect(entry?.label).toBe('Supplier > VAT number');
    const [both] = diff({ supplier: { vatNumber: 'A' } }, { supplier: { vatNumber: 'B' } }, {
      labels: { supplier: 'Vendor', 'supplier.vatNumber': 'VAT number' },
    });
    expect(both?.labelPath).toEqual(['Vendor', 'VAT number']);
  });

  it('an override keyed without indexes applies to every array item', () => {
    const entries = diff(
      { lineItems: [{ id: 1, price: 1 }, { id: 2, price: 1 }] },
      { lineItems: [{ id: 1, price: 2 }, { id: 2, price: 3 }] },
      { arrayIdKeys: { lineItems: 'id' }, labels: { 'lineItems.price': 'Unit price' } },
    );
    expect(entries.map((e) => e.label)).toEqual(['Line Items > Item 1 > Unit price', 'Line Items > Item 2 > Unit price']);
  });

  it('ignores override keys that match no path, including indexed ones', () => {
    const [entry] = diff({ a: 1 }, { a: 2 }, { labels: { nope: 'X', 'a.b': 'Y', 'lineItems.0.price': 'Z' } });
    expect(entry?.label).toBe('A');
  });

  it('does not read inherited override names', () => {
    const [entry] = diff({ constructor: 1 }, { constructor: 2 }, { labels: {} });
    expect(entry?.label).toBe('Constructor');
  });
});

describe('isEqual', () => {
  const cents = (a: unknown, b: unknown, path: string) =>
    path === 'amount' && typeof a === 'number' && typeof b === 'number' ? Math.round(a * 100) === Math.round(b * 100) : undefined;

  it('rounding to cents on amount: 10 and 10.001 are equal', () => {
    expect(diff({ amount: 10, other: 1 }, { amount: 10.001, other: 1 }, { isEqual: cents })).toEqual([]);
    expect(paths(diff({ amount: 10 }, { amount: 10.01 }, { isEqual: cents }))).toEqual(['changed amount']);
  });

  it('Sets compared by content', () => {
    const sets = (a: unknown, b: unknown) =>
      a instanceof Set && b instanceof Set ? a.size === b.size && [...a].every((x) => b.has(x)) : undefined;
    expect(diff({ tags: new Set([1, 2]) }, { tags: new Set([2, 1]) }, { isEqual: sets })).toEqual([]);
    expect(paths(diff({ tags: new Set([1]) }, { tags: new Set([2]) }, { isEqual: sets }))).toEqual(['changed tags']);
  });

  it('false on an object gives one atomic entry, without descending', () => {
    const isEqual = (_a: unknown, _b: unknown, path: string) => (path === 'supplier' ? false : undefined);
    const before = { supplier: { a: 1, b: 2 } };
    const after = { supplier: { a: 3, b: 4 } };
    expect(brief(diff(before, after, { isEqual }))).toEqual([
      { path: 'supplier', kind: 'changed', before: before.supplier, after: after.supplier },
    ]);
    // Even when the default rules would see no change at all.
    expect(paths(diff({ supplier: { a: 1 } }, { supplier: { a: 1 } }, { isEqual }))).toEqual(['changed supplier']);
  });

  it("an isEqual that tells '' from null produces an entry (kind from the Absent side)", () => {
    const strict = (a: unknown, b: unknown) => (a === null && b === '') || (a === '' && b === null) ? false : undefined;
    expect(brief(diff({ name: 'n', note: null }, { name: 'n', note: '' }, { isEqual: strict }))).toEqual([
      { path: 'note', kind: 'added', before: undefined, after: '' },
    ]);
    expect(paths(diff({ name: 'n', note: '' }, { name: 'n', note: null }, { isEqual: strict }))).toEqual(['removed note']);
  });

  it('is consulted inside a subtree where both sides are Empty (same verdict as with a non-empty sibling)', () => {
    const strict = (a: unknown, b: unknown) => (a === null && b === '') || (a === '' && b === null) ? false : undefined;
    const expected = [{ path: 'note', kind: 'added', before: undefined, after: '' }];
    expect(brief(diff({ note: null }, { note: '' }, { isEqual: strict }))).toEqual(expected);
    expect(brief(diff({ name: 'n', note: null }, { name: 'n', note: '' }, { isEqual: strict }))).toEqual(expected);
    expect(brief(diff({ supplier: { name: null } }, { supplier: { name: '' } }, { isEqual: strict }))).toEqual([
      { path: 'supplier.name', kind: 'added', before: undefined, after: '' },
    ]);
    expect(brief(diff({ supplier: { name: null, x: 1 } }, { supplier: { name: '', x: 1 } }, { isEqual: strict }))).toEqual([
      { path: 'supplier.name', kind: 'added', before: undefined, after: '' },
    ]);
  });

  it('is consulted on the children of an Empty object against an Absent side', () => {
    const isEqual = vi.fn((_a: unknown, _b: unknown, path: string) => (path === 'a.b' ? false : undefined));
    expect(brief(diff({ a: { b: null } }, { a: { b: '' } }, { isEqual }))).toEqual([
      { path: 'a.b', kind: 'added', before: undefined, after: '' },
    ]);
    expect(brief(diff({}, { a: { b: '' } }, { isEqual }))).toEqual([{ path: 'a.b', kind: 'added', before: undefined, after: '' }]);
    expect(brief(diff({ a: { b: '' } }, { a: null }, { isEqual }))).toEqual([{ path: 'a.b', kind: 'removed', before: '', after: undefined }]);
  });

  it('inside an Empty subtree the default stays "no entry" and the visit asks every descendant once', () => {
    const isEqual = vi.fn<NonNullable<ChangeSummaryOptions<Loose>['isEqual']>>(() => undefined);
    expect(diff({ a: { b: null, c: { d: '' } } }, { a: { b: '', e: [] } }, { isEqual })).toEqual([]);
    expect(isEqual.mock.calls.map((c) => c[2])).toEqual(['a', 'a.b', 'a.e', 'a.c', 'a.c.d']);
  });

  it('does not loop on an Empty circular object inside an Empty subtree', () => {
    const o: Loose = {};
    o.self = o;
    const p: Loose = { n: null };
    p.self = p;
    const isEqual = vi.fn((): boolean | undefined => undefined);
    expect(diff({ o }, { o: null }, { isEqual })).toEqual([]);
    expect(diff({ o }, { o: p }, { isEqual })).toEqual([]);
    // The cycle is cut at the pair already on the stack: 'o.self.n' is never visited.
    expect(diff({ o: p }, {}, { isEqual: (_a, _b, path) => (path === 'o.self.n' ? false : undefined) })).toEqual([]);
    // null against a missing key: both Absent → 'changed'.
    expect(paths(diff({ o: p }, {}, { isEqual: (_a, _b, path) => (path === 'o.n' ? false : undefined) }))).toEqual(['changed o.n']);
  });

  it('false with both sides Absent is a changed entry', () => {
    const always = () => false;
    expect(brief(diff({ a: 1, v: null }, { a: 1 }, { isEqual: (_a, _b, p) => (p === 'v' ? always() : undefined) }))).toEqual([
      { path: 'v', kind: 'changed', before: null, after: undefined },
    ]);
  });

  it('true suppresses a whole subtree', () => {
    const isEqual = (_a: unknown, _b: unknown, path: string) => (path === 'meta' ? true : undefined);
    expect(diff({ meta: { a: 1 }, x: 1 }, { meta: { a: 2, b: 3 }, x: 1 }, { isEqual })).toEqual([]);
  });

  it('receives baseline, values and the concrete path; never the root nor unpaired items', () => {
    const isEqual = vi.fn((): boolean | undefined => undefined);
    const before = { lineItems: [{ id: 1, price: 1 }, { id: 2 }], n: 1 };
    const after = { lineItems: [{ id: 3 }, { id: 1, price: 2 }], n: 1 };
    diff(before, after, { arrayIdKeys: { lineItems: 'id' }, isEqual });
    expect(isEqual.mock.calls).toEqual([
      [before.lineItems, after.lineItems, 'lineItems'],
      [before.lineItems[0], after.lineItems[1], 'lineItems.1'],
      [1, 1, 'lineItems.1.id'],
      [1, 2, 'lineItems.1.price'],
      [1, 1, 'n'],
    ]);
  });

  it('is consulted on block arrays and their positional pairs', () => {
    const isEqual = vi.fn((_a: unknown, _b: unknown, path: string) => (path === 'l.0' ? true : undefined));
    expect(diff({ l: [{ a: 1 }] }, { l: [{ a: 2 }] }, { isEqual })).toEqual([]);
    expect(isEqual.mock.calls.map((c) => c[2])).toEqual(['l', 'l.0']);
  });

  it('values === baseline returns an empty list without visiting', () => {
    const isEqual = vi.fn(() => false);
    const same = { a: 1, b: { c: 2 } };
    expect(diff(same, same, { isEqual })).toEqual([]);
    expect(isEqual).not.toHaveBeenCalled();
  });
});

describe('order', () => {
  it('is depth-first: values keys, then baseline-only keys; id items in values order, then removed', () => {
    const before = {
      z: 1,
      gone: 'x',
      lineItems: [{ id: 'r', v: 1 }, { id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }],
      nested: { old: 1, keep: 1 },
      alsoGone: 'y',
    };
    const after = {
      nested: { keep: 2, fresh: 1 },
      lineItems: [{ id: 'b', v: 2 }, { id: 'new' }, { id: 'a', v: 3 }],
      z: 2,
    };
    expect(diff(before, after, { arrayIdKeys: { lineItems: 'id' } }).map((e) => `${e.kind} ${e.path}`))
      .toMatchInlineSnapshot(`
        [
          "changed nested.keep",
          "added nested.fresh",
          "removed nested.old",
          "changed lineItems.0.v",
          "added lineItems.1",
          "changed lineItems.2.v",
          "removed lineItems.0",
          "removed lineItems.3",
          "changed z",
          "removed gone",
          "removed alsoGone",
        ]
      `);
  });
});
