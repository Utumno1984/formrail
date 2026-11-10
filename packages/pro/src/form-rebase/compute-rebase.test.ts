import type { MockInstance } from 'vitest';
import { computeChangeSummary, resetChangeSummaryWarnings } from '../change-summary/compute-change-summary';
import { computeRebase } from './compute-rebase';
import type { RebaseConflict, RebaseOptions, RebaseResult } from './types';

type Obj = Record<string, unknown>;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Obj)[key]);
  }
  return value;
}

/** Inputs frozen: any mutation by the engine throws. */
function rebase<V extends object>(options: RebaseOptions<V>): RebaseResult<V> {
  deepFreeze(options.baseline);
  deepFreeze(options.values);
  deepFreeze(options.incoming);
  return computeRebase(options);
}

const conflict = (path: string, label: string, base: unknown, mine: unknown, theirs: unknown, missing: Partial<Record<'baseMissing' | 'mineMissing' | 'theirsMissing', boolean>> = {}): RebaseConflict => ({
  path,
  label,
  base,
  mine,
  theirs,
  baseMissing: missing.baseMissing ?? false,
  mineMissing: missing.mineMissing ?? false,
  theirsMissing: missing.theirsMissing ?? false,
});

let warn: MockInstance;
beforeEach(() => {
  resetChangeSummaryWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

describe('computeRebase: rule per leaf', () => {
  // user: touched = values differ from baseline; server: incoming vs baseline (and vs values).
  it.each([
    { user: 'not touched', server: 'unchanged', base: 'a', mine: 'a', theirs: 'a', result: 'a', applied: false, conflict: false },
    { user: 'not touched', server: 'changed to the user value', base: 'a', mine: 'a', theirs: 'a', result: 'a', applied: false, conflict: false },
    { user: 'not touched', server: 'changed to a different value', base: 'a', mine: 'a', theirs: 't', result: 't', applied: true, conflict: false },
    { user: 'touched', server: 'unchanged', base: 'a', mine: 'm', theirs: 'a', result: 'm', applied: false, conflict: false },
    { user: 'touched', server: 'changed to the user value', base: 'a', mine: 'm', theirs: 'm', result: 'm', applied: false, conflict: false },
    { user: 'touched', server: 'changed to a different value', base: 'a', mine: 'm', theirs: 't', result: 'm', applied: false, conflict: true },
  ])('$user × server $server → $result', ({ base, mine, theirs, result, applied, conflict: hasConflict }) => {
    const out = rebase({ baseline: { name: base, other: 1 }, values: { name: mine, other: 1 }, incoming: { name: theirs, other: 1 } });
    expect(out.values).toEqual({ name: result, other: 1 });
    expect(out.applied).toEqual(
      applied
        ? [{ path: 'name', labelPath: ['Name'], label: 'Name', kind: 'changed', before: base, after: theirs, beforeMissing: false, afterMissing: false }]
        : [],
    );
    expect(out.conflicts).toEqual(hasConflict ? [conflict('name', 'Name', base, mine, theirs)] : []);
  });

  it('a field edited and brought back to the baseline value is not touched: it takes the server value', () => {
    const baseline = { name: 'a' };
    const values = { name: 'a' }; // another object, same content: what setValue('a') after 'ab' leaves
    const out = rebase({ baseline, values, incoming: { name: 't' } });
    expect(out.values).toEqual({ name: 't' });
    expect(out.conflicts).toEqual([]);
  });

  it('baseline is always the incoming reference', () => {
    const incoming = { name: 't' };
    expect(rebase({ baseline: { name: 'a' }, values: { name: 'm' }, incoming }).baseline).toBe(incoming);
  });

  it('no type coercion, NaN equals NaN, 0 equals -0, Dates by time', () => {
    const d = (t: number) => new Date(t);
    const out = rebase({
      baseline: { n: 5, nan: Number.NaN, z: 0, at: d(1) },
      values: { n: '5', nan: Number.NaN, z: -0, at: d(1) },
      incoming: { n: 6, nan: 1, z: 0, at: d(2) },
    });
    // z: -0 against 0 is not touched, so it takes the server 0.
    expect(out.values).toEqual({ n: '5', nan: 1, z: 0, at: d(2) });
    expect(Object.is(out.values.z, 0)).toBe(true);
    expect(out.conflicts.map((c) => c.path)).toEqual(['n']);
    expect(out.applied.map((e) => e.path)).toEqual(['nan', 'at']);
  });
});

const MISSING: unique symbol = Symbol('missing key');
type Side = string | null | undefined | typeof MISSING;

describe('computeRebase: absent values (four distinct states)', () => {
  const sides: Side[] = [undefined, null, '', MISSING, 'x', 'y'];
  const name = (s: Side) => (s === MISSING ? 'missing' : JSON.stringify(s) ?? 'undefined');
  const record = (s: Side): Obj => (s === MISSING ? { keep: 1 } : { keep: 1, f: s });
  const same = (a: Side, b: Side) => a === b;
  const isAbsent = (s: Side) => s === undefined || s === null || s === MISSING;

  type Case = { base: Side; mine: Side; theirs: Side; title: string };
  const cases: Case[] = [];
  for (const base of sides) {
    for (const mine of sides) {
      for (const theirs of sides) cases.push({ base, mine, theirs, title: `${name(base)} / ${name(mine)} / ${name(theirs)}` });
    }
  }

  it.each<Case>(cases)(
    'base / mine / theirs = $title',
    ({ base, mine, theirs }: { base: Side; mine: Side; theirs: Side }) => {
      const out = rebase({ baseline: record(base), values: record(mine), incoming: record(theirs) });
      const touched = !same(base, mine);
      const serverChanged = !same(base, theirs);
      const result = !touched ? theirs : mine;
      expect(out.values).toEqual(record(result));
      expect(Object.hasOwn(out.values, 'f')).toBe(result !== MISSING);
      if (!touched && serverChanged) {
        const kind = isAbsent(base) === isAbsent(theirs) ? 'changed' : isAbsent(base) ? 'added' : 'removed';
        expect(out.applied).toEqual([
          {
            path: 'f',
            labelPath: ['F'],
            label: 'F',
            kind,
            before: kind === 'added' || base === MISSING ? undefined : base,
            after: kind === 'removed' || theirs === MISSING ? undefined : theirs,
            beforeMissing: base === MISSING,
            afterMissing: theirs === MISSING,
          },
        ]);
      } else expect(out.applied).toEqual([]);
      const expectConflict = touched && serverChanged && !same(mine, theirs);
      const ex = (s: Side) => (s === MISSING ? undefined : s);
      expect(out.conflicts).toEqual(
        expectConflict
          ? [conflict('f', 'F', ex(base), ex(mine), ex(theirs), { baseMissing: base === MISSING, mineMissing: mine === MISSING, theirsMissing: theirs === MISSING })]
          : [],
      );
    },
  );

  it('the server empties a field the user did not touch: applied', () => {
    const out = rebase({ baseline: { note: 'hello' }, values: { note: 'hello' }, incoming: { note: '' } });
    expect(out.values).toEqual({ note: '' });
    expect(out.applied).toHaveLength(1);
    expect(out.applied[0]).toMatchObject({ path: 'note', kind: 'changed', before: 'hello', after: '' });
  });

  it('the server removes the key of a field the user did not touch: the key is gone', () => {
    const out = rebase({ baseline: { a: 1, note: 'hello' }, values: { a: 2, note: 'hello' }, incoming: { a: 1 } });
    expect(out.values).toEqual({ a: 2 });
    expect(Object.hasOwn(out.values, 'note')).toBe(false);
    expect(out.applied[0]).toMatchObject({ path: 'note', kind: 'removed', afterMissing: true });
  });

  it('the user empties a field the server changed: conflict, the user value stays', () => {
    const out = rebase({ baseline: { note: 'hello' }, values: { note: null }, incoming: { note: 'bye' } });
    expect(out.values).toEqual({ note: null });
    expect(out.conflicts).toEqual([conflict('note', 'Note', 'hello', null, 'bye')]);
  });

  it('a key present with undefined is not a missing key (mineMissing / theirsMissing)', () => {
    const out = rebase({ baseline: { f: 'a' } as Obj, values: { f: undefined } as Obj, incoming: {} as Obj });
    expect(out.conflicts).toEqual([conflict('f', 'F', 'a', undefined, undefined, { theirsMissing: true })]);
    expect(Object.hasOwn(out.values, 'f')).toBe(true);
  });

  it('a key added by the server that the baseline did not have is applied', () => {
    const out = rebase({ baseline: { a: 1 } as Obj, values: { a: 2 } as Obj, incoming: { a: 1, extra: 'new' } as Obj });
    expect(out.values).toEqual({ a: 2, extra: 'new' });
    expect(out.applied).toEqual([
      { path: 'extra', labelPath: ['Extra'], label: 'Extra', kind: 'added', before: undefined, after: 'new', beforeMissing: true, afterMissing: false },
    ]);
  });

  it('a key added by both with different values is a conflict with baseMissing', () => {
    const out = rebase({ baseline: {} as Obj, values: { extra: 'm' } as Obj, incoming: { extra: 't' } as Obj });
    expect(out.conflicts).toEqual([conflict('extra', 'Extra', undefined, 'm', 't', { baseMissing: true })]);
  });
});

describe('computeRebase: nested objects', () => {
  const baseline = { number: 'A-1', supplier: { name: 'ACME', vatNumber: 'IT1', address: { city: 'Rome', zip: '00100' } } };

  it('server changes supplier.vatNumber, user changes supplier.name: no conflict, both present', () => {
    const out = rebase({
      baseline,
      values: { ...baseline, supplier: { ...baseline.supplier, name: 'ACME Ltd' } },
      incoming: { ...baseline, supplier: { ...baseline.supplier, vatNumber: 'IT2' } },
    });
    expect(out.values).toEqual({ number: 'A-1', supplier: { name: 'ACME Ltd', vatNumber: 'IT2', address: baseline.supplier.address } });
    expect(out.conflicts).toEqual([]);
    expect(out.applied.map((e) => e.path)).toEqual(['supplier.vatNumber']);
    expect(out.applied[0]?.label).toBe('Supplier > Vat Number');
  });

  it('conflict on one nested leaf, applied on a sibling, with label overrides', () => {
    const out = rebase({
      baseline,
      values: { ...baseline, supplier: { ...baseline.supplier, address: { city: 'Milan', zip: '00100' } } },
      incoming: { ...baseline, supplier: { ...baseline.supplier, address: { city: 'Turin', zip: '10100' } } },
      labels: { 'supplier.address.city': 'Town' },
    });
    expect(out.values.supplier.address).toEqual({ city: 'Milan', zip: '10100' });
    expect(out.conflicts).toEqual([conflict('supplier.address.city', 'Supplier > Address > Town', 'Rome', 'Milan', 'Turin')]);
    expect(out.applied.map((e) => e.path)).toEqual(['supplier.address.zip']);
  });

  it('untouched subtrees keep the reference of the side they come from', () => {
    const values = { ...baseline, number: 'A-2' };
    const incoming = { ...baseline, supplier: { ...baseline.supplier, vatNumber: 'IT2' } };
    const out = rebase({ baseline, values, incoming });
    expect(out.values.supplier).toBe(incoming.supplier);
  });

  it('a type change on both sides is one conflict on the node (no descent)', () => {
    const out = rebase({
      baseline: { s: { a: 1 } } as Obj,
      values: { s: 'text' } as Obj,
      incoming: { s: { a: 2 } } as Obj,
    });
    expect(out.conflicts).toEqual([conflict('s', 'S', { a: 1 }, 'text', { a: 2 })]);
    expect(out.values).toEqual({ s: 'text' });
  });

  it('an object set to null by the user and changed by the server: conflict on the object', () => {
    const out = rebase({ baseline, values: { ...baseline, supplier: null } as Obj, incoming: { ...baseline, supplier: { ...baseline.supplier, name: 'X' } } as Obj });
    expect(out.conflicts.map((c) => c.path)).toEqual(['supplier']);
    expect(out.values.supplier).toBeNull();
  });

  it('an object added by both sides is merged key by key against an absent baseline', () => {
    const out = rebase({
      baseline: {} as Obj,
      values: { meta: { a: 1, b: 'm' } } as Obj,
      incoming: { meta: { b: 't', c: 3 } } as Obj,
    });
    expect(out.values).toEqual({ meta: { a: 1, b: 'm', c: 3 } });
    expect(out.conflicts).toEqual([conflict('meta.b', 'Meta > B', undefined, 'm', 't', { baseMissing: true })]);
    // `c` is absent from the baseline and from values: not touched, so the server value is applied.
    expect(out.applied.map((e) => [e.path, e.kind])).toEqual([['meta.c', 'added']]);
  });

  it('keys of values first, then the keys only in incoming; __proto__ is an ordinary key', () => {
    const base = JSON.parse('{"a":1,"b":1}') as Obj;
    const mine = JSON.parse('{"b":2,"a":1,"__proto__":"m"}') as Obj;
    const theirs = JSON.parse('{"a":3,"b":1,"z":1}') as Obj;
    const out = rebase({ baseline: base, values: mine, incoming: theirs });
    expect(Object.keys(out.values)).toEqual(['b', 'a', '__proto__', 'z']);
    expect(Object.getPrototypeOf(out.values)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(out.values, '__proto__')?.value).toBe('m');
  });

  it('a null-prototype object stays null-prototype', () => {
    const make = (a: number, b: number) => Object.assign(Object.create(null) as Obj, { a, b });
    const out = rebase({ baseline: { o: make(1, 1) } as Obj, values: { o: make(2, 1) } as Obj, incoming: { o: make(1, 2) } as Obj });
    expect(Object.getPrototypeOf(out.values.o)).toBeNull();
    expect({ ...(out.values.o as Obj) }).toEqual({ a: 2, b: 2 });
  });
});

describe('computeRebase: arrays without id key (block)', () => {
  const baseline = { tags: ['a', 'b'], other: 1 };

  it('changed by the user only → user array; by the server only → server array (applied as one entry)', () => {
    expect(rebase({ baseline, values: { ...baseline, tags: ['a', 'b', 'c'] }, incoming: { ...baseline, other: 2 } }).values).toEqual({ tags: ['a', 'b', 'c'], other: 2 });
    const out = rebase({ baseline, values: { ...baseline, other: 2 }, incoming: { ...baseline, tags: ['b', 'a'] } });
    expect(out.values).toEqual({ tags: ['b', 'a'], other: 2 });
    expect(out.applied).toEqual([
      { path: 'tags', labelPath: ['Tags'], label: 'Tags', kind: 'changed', before: ['a', 'b'], after: ['b', 'a'], beforeMissing: false, afterMissing: false },
    ]);
  });

  it('changed by both to the same array → no conflict', () => {
    const out = rebase({ baseline, values: { ...baseline, tags: ['x'] }, incoming: { ...baseline, tags: ['x'] } });
    expect(out.conflicts).toEqual([]);
    expect(out.values.tags).toEqual(['x']);
  });

  it('changed by both differently → one conflict on the array, the user array stays (even a mere reorder)', () => {
    const out = rebase({ baseline, values: { ...baseline, tags: ['b', 'a'] }, incoming: { ...baseline, tags: ['a', 'b', 'c'] } });
    expect(out.values.tags).toEqual(['b', 'a']);
    expect(out.conflicts).toEqual([conflict('tags', 'Tags', ['a', 'b'], ['b', 'a'], ['a', 'b', 'c'])]);
  });

  it('arrays of objects without id key are blocks too (no descent into items)', () => {
    const b = { rows: [{ q: 1, p: 1 }] };
    const out = rebase({ baseline: b, values: { rows: [{ q: 2, p: 1 }] }, incoming: { rows: [{ q: 1, p: 2 }] } });
    expect(out.conflicts.map((c) => c.path)).toEqual(['rows']);
    expect(out.values.rows).toEqual([{ q: 2, p: 1 }]);
  });
});

describe('computeRebase: arrays with an id key', () => {
  type Line = { id: number; desc: string; qty: number };
  const line = (id: number, qty = 1, desc = `L${id}`): Line => ({ id, desc, qty });
  const ids = (lines: readonly Line[]) => lines.map((l) => l.id);
  const arrayIdKeys = { lines: 'id' };
  const run = (base: Line[], mine: Line[], theirs: Line[]) =>
    rebase({ baseline: { lines: base }, values: { lines: mine }, incoming: { lines: theirs }, arrayIdKeys });
  const base = [line(1), line(2), line(3)];

  it('item added by the server → added (after its predecessor), applied added', () => {
    const out = run(base, [line(1), line(2, 5), line(3)], [line(1), line(4), line(2), line(3)]);
    expect(ids(out.values.lines)).toEqual([1, 4, 2, 3]);
    expect(out.values.lines[2]).toEqual(line(2, 5));
    expect(out.applied).toEqual([
      { path: 'lines.1', labelPath: ['Lines', 'Item 2'], label: 'Lines > Item 2', kind: 'added', before: undefined, after: line(4), beforeMissing: true, afterMissing: false },
    ]);
    expect(out.conflicts).toEqual([]);
  });

  it('item added by the user → kept where the user put it', () => {
    const out = run(base, [line(1), line(9), line(2), line(3)], [line(1), line(2), line(3, 7)]);
    expect(out.values.lines).toEqual([line(1), line(9), line(2), line(3, 7)]);
    expect(out.applied.map((e) => e.path)).toEqual(['lines.3.qty']);
  });

  it('item removed by the server and not touched by the user → removed (applied on its baseline index)', () => {
    const out = run(base, [line(1, 9), line(2), line(3)], [line(1), line(3)]);
    expect(out.values.lines).toEqual([line(1, 9), line(3)]);
    expect(out.applied).toEqual([
      { path: 'lines.1', labelPath: ['Lines', 'Item 2'], label: 'Lines > Item 2', kind: 'removed', before: line(2), after: undefined, beforeMissing: false, afterMissing: true },
    ]);
  });

  it('item removed by the server and modified by the user → conflict on the item, the user item stays', () => {
    const out = run(base, [line(1), line(2, 5), line(3)], [line(1), line(3)]);
    expect(out.values.lines).toEqual([line(1), line(2, 5), line(3)]);
    expect(out.conflicts).toEqual([conflict('lines.1', 'Lines > Item 2', line(2), line(2, 5), undefined, { theirsMissing: true })]);
    expect(out.applied).toEqual([]);
  });

  it('item removed by the user, not changed by the server → removed, nothing applied', () => {
    const out = run(base, [line(1), line(3)], [line(1), line(2), line(3, 4)]);
    expect(out.values.lines).toEqual([line(1), line(3, 4)]);
    expect(out.conflicts).toEqual([]);
    expect(out.applied.map((e) => e.path)).toEqual(['lines.1.qty']);
  });

  it('item removed by the user and modified by the server → stays removed, conflict on its incoming index', () => {
    const out = run(base, [line(1), line(3)], [line(1), line(3), line(2, 8)]);
    expect(out.values.lines).toEqual([line(1), line(3)]);
    expect(out.conflicts).toEqual([conflict('lines.2', 'Lines > Item 3', line(2), undefined, line(2, 8), { mineMissing: true })]);
  });

  it('item removed by both → removed, no entry, no conflict', () => {
    const out = run(base, [line(1, 2), line(3)], [line(1), line(3, 2)]);
    expect(out.values.lines).toEqual([line(1, 2), line(3, 2)]);
    expect(out.conflicts).toEqual([]);
    expect(out.applied.map((e) => e.path)).toEqual(['lines.1.qty']);
  });

  it('fields of the same item changed by both: rule per path on the fields', () => {
    const out = run(base, [line(1), line(2, 5), line(3)], [line(1), line(2, 1, 'Server'), line(3)]);
    expect(out.values.lines[1]).toEqual({ id: 2, desc: 'Server', qty: 5 });
    expect(out.applied.map((e) => e.path)).toEqual(['lines.1.desc']);
    const clash = run(base, [line(1), line(2, 5), line(3)], [line(1), line(2, 6), line(3)]);
    expect(clash.conflicts).toEqual([conflict('lines.1.qty', 'Lines > Item 2 > Qty', 1, 5, 6)]);
  });

  it('reorder by the user only → the user order wins, server field changes applied', () => {
    const out = run(base, [line(3), line(1), line(2)], [line(1), line(2, 4), line(3)]);
    expect(ids(out.values.lines)).toEqual([3, 1, 2]);
    expect(out.values.lines[2]).toEqual(line(2, 4));
    expect(out.applied.map((e) => e.path)).toEqual(['lines.2.qty']);
    expect(out.conflicts).toEqual([]);
  });

  it('reorder by the server only → the server order, user field changes kept', () => {
    const out = run(base, [line(1), line(2, 9), line(3)], [line(3), line(2), line(1)]);
    expect(out.values.lines).toEqual([line(3), line(2, 9), line(1)]);
    expect(out.conflicts).toEqual([]);
    expect(out.applied).toEqual([]);
  });

  it('reorder by the server only, user changes nothing else → the incoming array itself', () => {
    const incoming = { lines: [line(3), line(2), line(1)] };
    const values = { lines: base, note: 'x' };
    const out = rebase({ baseline: { lines: base, note: '' }, values, incoming: { ...incoming, note: '' }, arrayIdKeys });
    expect(out.values.lines).toBe(incoming.lines);
  });

  it('reorder by both, differently → the user order and one order conflict on the array (id lists)', () => {
    const out = run(base, [line(2), line(1), line(3)], [line(1), line(3), line(2)]);
    expect(ids(out.values.lines)).toEqual([2, 1, 3]);
    expect(out.conflicts).toEqual([conflict('lines', 'Lines', [1, 2, 3], [2, 1, 3], [1, 3, 2])]);
  });

  it('reorder by both to the same order → no conflict', () => {
    const out = run(base, [line(3), line(2), line(1, 5)], [line(3), line(2, 6), line(1)]);
    expect(out.values.lines).toEqual([line(3), line(2, 6), line(1, 5)]);
    expect(out.conflicts).toEqual([]);
  });

  it('reorder by both, same relative order of the shared items → no conflict', () => {
    // The user moved 3 first and removed 2; the server moved 3 first: shared items (1, 3) agree.
    const out = run(base, [line(3), line(1)], [line(3), line(1), line(2)]);
    expect(ids(out.values.lines)).toEqual([3, 1]);
    expect(out.conflicts).toEqual([]);
  });

  it('user removes an item, server reorders: the removal is not a user reorder (server order, no conflict)', () => {
    const out = rebase({
      baseline: { lines: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      values: { lines: [{ id: 1 }, { id: 3 }] },
      incoming: { lines: [{ id: 3 }, { id: 2 }, { id: 1 }] },
      arrayIdKeys,
    });
    expect(out.values.lines.map((l) => l.id)).toEqual([3, 1]);
    expect(out.conflicts).toEqual([]);
  });

  it('server removes an item, user reorders: the removal is not a server reorder (user order, no conflict)', () => {
    const out = rebase({
      baseline: { lines: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      values: { lines: [{ id: 3 }, { id: 2 }, { id: 1 }] },
      incoming: { lines: [{ id: 1 }, { id: 3 }] },
      arrayIdKeys,
    });
    expect(out.values.lines.map((l) => l.id)).toEqual([3, 1]);
    expect(out.conflicts).toEqual([]);
    expect(out.applied.map((e) => [e.path, e.kind])).toEqual([['lines.1', 'removed']]);
  });

  it('applied on an id-keyed array with an item without id is one block entry', () => {
    const baseline = { lines: [{ id: 1, a: 1 }, { a: 2 }] };
    const out = rebase({ baseline, values: baseline, incoming: { lines: [{ id: 1, a: 9 }, { a: 2 }] }, arrayIdKeys });
    expect(out.applied.map((e) => [e.path, e.kind])).toEqual([['lines', 'changed']]);
  });

  it('a cycle through an id-keyed array: conflict on the cyclic node, no key lost', () => {
    type L = { id: number; v: number; lines: L[] };
    const mk = (v: number) => {
      const arr: L[] = [];
      arr.push({ id: 1, v, lines: arr });
      return arr;
    };
    const values = { lines: mk(1) };
    const out = computeRebase({
      baseline: { lines: mk(0) },
      values,
      incoming: { lines: mk(2) },
      arrayIdKeys: { lines: 'id', 'lines.lines': 'id' },
    });
    const item = out.values.lines[0] as L;
    expect(Object.hasOwn(item, 'lines')).toBe(true);
    expect(item.lines).toBe(values.lines);
    expect(item.v).toBe(1);
    expect(out.conflicts.map((c) => c.path)).toEqual(['lines.0.v', 'lines.0.lines']);
  });

  it('warns when one of the three sides under an id key is not an array', () => {
    const out = rebase({
      baseline: { lines: [line(1)] } as Obj,
      values: { lines: 'x' } as Obj,
      incoming: { lines: [line(1, 2)] } as Obj,
      arrayIdKeys,
    });
    expect(out.conflicts.map((c) => c.path)).toEqual(['lines']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/computeRebase: .*is not an array; the id key is ignored/);
  });

  it('removals and additions are not reorders', () => {
    const out = run(base, [line(1), line(3)], [line(0), line(1), line(2), line(3)]);
    expect(ids(out.values.lines)).toEqual([1, 3, 0]);
    expect(out.conflicts).toEqual([]);
  });

  it('new server item: after its predecessor when present, at the end when the predecessor is gone or it is first', () => {
    // 0 is first (no predecessor) → end; 5 after 2; 6 after 5 (placed just before); 7's predecessor 3
    // was removed by the user → end. Items sent to the end keep the order of the server list.
    const out = run(base, [line(1), line(2)], [line(0), line(1), line(2), line(5), line(6), line(3), line(7)]);
    expect(ids(out.values.lines)).toEqual([1, 2, 5, 6, 0, 7]);
  });

  it('new server item with a user reorder: after its predecessor in the user order', () => {
    const out = run(base, [line(3), line(2), line(1)], [line(1), line(2), line(4), line(3)]);
    expect(ids(out.values.lines)).toEqual([3, 2, 4, 1]);
  });

  it('server order wins: user-only items go after their predecessor in the user list', () => {
    const out = run(base, [line(1), line(8), line(2), line(3)], [line(3), line(2), line(1)]);
    expect(ids(out.values.lines)).toEqual([3, 2, 1, 8]);
    const out2 = run(base, [line(1), line(2), line(8), line(3)], [line(3), line(2), line(1)]);
    expect(ids(out2.values.lines)).toEqual([3, 2, 8, 1]);
  });

  it('same id added by both sides: one item, rule per path on its fields (baseMissing)', () => {
    const out = run(base, [...base, line(4, 2, 'Mine')], [...base, line(4, 2, 'Theirs')]);
    expect(out.values.lines).toEqual([...base, line(4, 2, 'Mine')]);
    expect(out.conflicts).toEqual([conflict('lines.3.desc', 'Lines > Item 4 > Desc', undefined, 'Mine', 'Theirs', { baseMissing: true })]);
    const same = run(base, [...base, line(4)], [...base, line(4)]);
    expect(same.conflicts).toEqual([]);
    expect(same.values.lines).toHaveLength(4);
  });

  it('arrays nested in items use their own id key (path without indexes)', () => {
    type Item = { id: number; taxes: { code: string; rate: number }[] };
    const b: { lines: Item[] } = { lines: [{ id: 1, taxes: [{ code: 'A', rate: 1 }, { code: 'B', rate: 2 }] }] };
    const out = rebase({
      baseline: b,
      values: { lines: [{ id: 1, taxes: [{ code: 'A', rate: 5 }, { code: 'B', rate: 2 }] }] },
      incoming: { lines: [{ id: 1, taxes: [{ code: 'B', rate: 3 }, { code: 'A', rate: 1 }] }] },
      arrayIdKeys: { lines: 'id', 'lines.taxes': 'code' },
    });
    expect(out.values.lines[0]?.taxes).toEqual([{ code: 'B', rate: 3 }, { code: 'A', rate: 5 }]);
    expect(out.applied.map((e) => e.path)).toEqual(['lines.0.taxes.0.rate']);
  });

  it('id-keyed array absent in the baseline and added by both: merged by id', () => {
    const out = rebase({ baseline: {} as { lines?: Line[] }, values: { lines: [line(1)] }, incoming: { lines: [line(2)] }, arrayIdKeys });
    expect(ids(out.values.lines ?? [])).toEqual([1, 2]);
    expect(out.conflicts).toEqual([]);
  });

  it('an item without id degrades the array to a block (warning once)', () => {
    const noId = { desc: 'x', qty: 1 } as unknown as Line;
    const out = run([...base, noId], [line(1, 5), line(2), line(3), noId], [line(1), line(2, 6), line(3), noId]);
    expect(out.conflicts.map((c) => c.path)).toEqual(['lines']);
    expect(out.values.lines).toEqual([line(1, 5), line(2), line(3), noId]);
    run([...base, noId], [line(1, 5), line(2), line(3), noId], [line(1), line(2, 6), line(3), noId]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('computeRebase');
  });

  it('duplicate ids degrade the array to a block (warning)', () => {
    const out = run(base, [line(1, 5), line(1), line(3)], [line(1), line(2, 6), line(3)]);
    expect(out.conflicts.map((c) => c.path)).toEqual(['lines']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ids compared with Object.is: 1 and "1" are different items', () => {
    const out = rebase({
      baseline: { lines: [{ id: 1, qty: 1 }] },
      values: { lines: [{ id: 1, qty: 1 }] },
      incoming: { lines: [{ id: '1', qty: 1 }] } as unknown as { lines: { id: number; qty: number }[] },
      arrayIdKeys,
    });
    expect(out.applied.map((e) => e.kind)).toEqual(['added', 'removed']);
  });
});

describe('computeRebase: isEqual', () => {
  it('a custom equality makes a cosmetic edit untouched (takes theirs)', () => {
    const isEqual = (a: unknown, b: unknown, path: string) =>
      path === 'code' && typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : undefined;
    const out = rebase({ baseline: { code: 'abc' }, values: { code: 'ABC' }, incoming: { code: 'xyz' }, isEqual });
    expect(out.values).toEqual({ code: 'xyz' });
    expect(out.conflicts).toEqual([]);
  });

  it('a verdict on a node makes it atomic: one conflict, no descent', () => {
    const isEqual = (_a: unknown, _b: unknown, path: string) => (path === 'supplier' ? false : undefined);
    const b = { supplier: { name: 'a', vat: '1' } };
    const out = rebase({ baseline: b, values: { supplier: { name: 'b', vat: '1' } }, incoming: { supplier: { name: 'a', vat: '2' } }, isEqual });
    expect(out.conflicts.map((c) => c.path)).toEqual(['supplier']);
    expect(out.values.supplier).toEqual({ name: 'b', vat: '1' });
  });

  it('receives the concrete path with indexes', () => {
    const seen = new Set<string>();
    const isEqual = (_a: unknown, _b: unknown, path: string) => {
      seen.add(path);
      return undefined;
    };
    rebase({ baseline: { l: [{ id: 1, q: 1 }] }, values: { l: [{ id: 1, q: 2 }] }, incoming: { l: [{ id: 1, q: 3 }] }, arrayIdKeys: { l: 'id' }, isEqual });
    expect(seen).toEqual(new Set(['l', 'l.0', 'l.0.id', 'l.0.q']));
  });
});

describe('computeRebase: purity and determinism', () => {
  it('does not mutate inputs (deeply frozen) and returns equal results on equal inputs', () => {
    const make = () => ({
      baseline: { a: 1, s: { x: 1 }, l: [{ id: 1, q: 1 }, { id: 2, q: 1 }] },
      values: { a: 2, s: { x: 1 }, l: [{ id: 2, q: 5 }, { id: 1, q: 1 }] },
      incoming: { a: 3, s: { x: 2 }, l: [{ id: 1, q: 1 }, { id: 3, q: 1 }] },
      arrayIdKeys: { l: 'id' },
    });
    const first = rebase(make());
    const second = rebase(make());
    expect(first).toEqual(second);
    expect(first.conflicts.map((c) => c.path)).toEqual(['a', 'l.0']);
  });

  it('cyclic structures terminate', () => {
    const cyclic = (v: number) => {
      const o: Obj = { v };
      o.self = o;
      return o;
    };
    const values = cyclic(2);
    const out = rebase({ baseline: cyclic(1), values, incoming: cyclic(3) });
    // The pair (values, incoming) met again under `self` is not merged twice: one conflict there.
    expect(out.conflicts.map((c) => c.path)).toEqual(['v', 'self']);
    expect(out.values.v).toBe(2);
    expect(out.values.self).toBe(values);
  });

  it('change-summary consistency: applied equals the change summary baseline → incoming when values are clean', () => {
    const baseline = { a: 1, l: [{ id: 1, q: 1 }], s: { t: 'x' } };
    const incoming = { a: 2, l: [{ id: 1, q: 3 }, { id: 2, q: 1 }], s: { t: 'y' } };
    const out = rebase({ baseline, values: baseline, incoming, arrayIdKeys: { l: 'id' } });
    expect(out.applied).toEqual(computeChangeSummary({ baseline, values: incoming, arrayIdKeys: { l: 'id' } }));
  });
});

describe('computeRebase: invariants (seeded random records)', () => {
  // Small deterministic PRNG (mulberry32).
  function prng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  type Rec = { name: unknown; note?: unknown; supplier: { name: unknown; vat?: unknown }; tags: string[]; lines: { id: number; qty: number; desc: unknown }[] };
  const leafPool = ['a', 'b', '', null, undefined, 0, 1];
  const pick = <T,>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)] as T;

  function randomRecord(r: () => number): Rec {
    const rec: Rec = {
      name: pick(r, leafPool),
      supplier: { name: pick(r, leafPool) },
      tags: r() < 0.5 ? ['x'] : ['x', 'y'],
      lines: [1, 2, 3].filter(() => r() < 0.8).map((id) => ({ id, qty: Math.floor(r() * 3), desc: pick(r, leafPool) })),
    };
    if (r() < 0.5) rec.note = pick(r, leafPool);
    if (r() < 0.5) rec.supplier.vat = pick(r, leafPool);
    return rec;
  }

  function mutate(r: () => number, rec: Rec): Rec {
    const next: Rec = structuredClone(rec);
    if (r() < 0.4) next.name = pick(r, leafPool);
    if (r() < 0.3) {
      if (r() < 0.5) delete next.note;
      else next.note = pick(r, leafPool);
    }
    if (r() < 0.4) next.supplier.name = pick(r, leafPool);
    if (r() < 0.3) next.tags = r() < 0.5 ? ['y'] : ['x', 'y', 'z'];
    for (const l of next.lines) if (r() < 0.3) l.qty += 1;
    if (r() < 0.3) next.lines.reverse();
    if (r() < 0.2) next.lines.pop();
    if (r() < 0.2) next.lines.push({ id: 4 + Math.floor(r() * 3), qty: 0, desc: 'new' });
    const seen = new Set<number>();
    next.lines = next.lines.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
    return next;
  }

  const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
  const arrayIdKeys = { lines: 'id' };
  const differs = (a: object, b: object) => {
    const entries = computeChangeSummary({ baseline: a, values: b, arrayIdKeys });
    const order = (x: object) => ((x as Rec).lines ?? []).map((l) => l.id).filter((id) => ((b as Rec).lines ?? []).some((l) => l.id === id) && ((a as Rec).lines ?? []).some((l) => l.id === id));
    return entries.length > 0 || JSON.stringify(order(a)) !== JSON.stringify(order(b));
  };

  it('clean form: the result is incoming itself, no conflict', () => {
    for (const seed of SEEDS) {
      const r = prng(seed);
      const baseline = randomRecord(r);
      const incoming = mutate(r, baseline);
      const out = computeRebase({ baseline, values: structuredClone(baseline), incoming, arrayIdKeys });
      expect(out.values, `seed ${seed}`).toBe(incoming);
      expect(out.conflicts, `seed ${seed}`).toEqual([]);
    }
  });

  it('incoming equal to the baseline: values unchanged (same reference), nothing applied, no conflict', () => {
    for (const seed of SEEDS) {
      const r = prng(seed);
      const baseline = randomRecord(r);
      const values = mutate(r, baseline);
      const out = computeRebase({ baseline, values, incoming: structuredClone(baseline), arrayIdKeys });
      // When values are also clean, both invariants hold and the result is incoming itself.
      expect(out.values, `seed ${seed}`).toBe(differs(baseline, values) ? values : out.baseline);
      expect(out.values, `seed ${seed}`).toEqual(values);
      expect(out.applied, `seed ${seed}`).toEqual([]);
      expect(out.conflicts, `seed ${seed}`).toEqual([]);
    }
  });

  it('no lost edit: without conflicts, rebasing the result again on incoming is a no-op and user edits survive', () => {
    for (const seed of SEEDS) {
      const r = prng(seed);
      const baseline = randomRecord(r);
      const values = mutate(r, baseline);
      const incoming = mutate(r, baseline);
      const out = computeRebase({ baseline, values, incoming, arrayIdKeys });
      // Idempotence against the new baseline.
      const again = computeRebase({ baseline: incoming, values: out.values, incoming, arrayIdKeys });
      expect(again.values, `seed ${seed}`).toBe(differs(incoming, out.values) ? out.values : incoming);
      expect(again.values, `seed ${seed}`).toEqual(out.values);
      expect(again.applied, `seed ${seed}`).toEqual([]);
      expect(again.conflicts, `seed ${seed}`).toEqual([]);
      // Every top-level field the user touched keeps the user value; every untouched one takes the server value.
      for (const key of ['name', 'note', 'tags'] as const) {
        const touched = differs({ [key]: (baseline as Obj)[key] }, { [key]: (values as Obj)[key] }) || Object.hasOwn(baseline, key) !== Object.hasOwn(values, key);
        const expected = touched ? values : incoming;
        expect(Object.hasOwn(out.values, key), `seed ${seed} ${key}`).toBe(Object.hasOwn(expected, key));
        expect((out.values as Obj)[key], `seed ${seed} ${key}`).toEqual((expected as Obj)[key]);
      }
      // Server converged to the user: no conflict, values kept.
      const converged = computeRebase({ baseline, values, incoming: structuredClone(values), arrayIdKeys });
      expect(converged.conflicts, `seed ${seed}`).toEqual([]);
      expect(converged.values, `seed ${seed}`).toBe(differs(baseline, values) ? values : converged.baseline);
    }
  });
});
