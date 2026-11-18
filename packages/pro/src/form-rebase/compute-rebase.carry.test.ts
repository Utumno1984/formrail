// `rebaseCarrying` (rebase-carry.ts) with the conflicts of an earlier rebase (`carried`, ticket #584): what
// `useFormRebase` passes it when a second server update lands. The hook passes only the conflicts still open; the merge
// does not rely on it.
import { computeRebase, rebaseInternal, type ConflictRecord } from './compute-rebase';
import { rebaseCarrying } from './rebase-carry';
import type { RebaseOptions } from './types';

type Line = { id: number; qty: number };
type Invoice = { number: string; amount: number; supplier: { name: string; vat: string }; lines: Line[] };

const lines = (...pairs: [number, number][]): Line[] => pairs.map(([id, qty]) => ({ id, qty }));
const BASE: Invoice = { number: 'A-1', amount: 10, supplier: { name: 'Lumen Parts', vat: 'IT1' }, lines: lines([1, 1], [2, 2], [3, 3]) };
const OPTIONS: Pick<RebaseOptions<Invoice>, 'arrayIdKeys'> = { arrayIdKeys: { lines: 'id' } };

/** Two rebases in a row: `values` against `first`, then `then` (the user's values meanwhile) against `second`. */
function twice(values: Invoice, first: Invoice, then: Invoice, second: Invoice, carried?: (records: ConflictRecord[]) => ConflictRecord[]) {
  const one = rebaseInternal({ baseline: BASE, values, incoming: first, ...OPTIONS });
  const two = rebaseCarrying({ baseline: first, values: then, incoming: second, ...OPTIONS }, carried ? carried(one.records) : one.records);
  return { one, two, conflicts: two.result.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs]) };
}

describe('rebaseCarrying: the merge with carried conflicts (#584)', () => {
  it('no carried conflict: the same result as computeRebase (nothing remembered)', () => {
    const values = { ...BASE, number: 'A-2' };
    const { two } = twice(values, { ...BASE, number: 'A-3' }, values, { ...BASE, number: 'A-3', amount: 5 }, () => []);
    expect(two.result.conflicts).toEqual([]);
    expect(two.result.applied.map((e) => e.path)).toEqual(['amount']);
  });

  it('a carried conflict where the values now hold the server value is not emitted again (no ghost)', () => {
    // The user then takes the server name by hand and changes the VAT: Save would overwrite nothing on the name.
    const values = { ...BASE, supplier: { name: 'Mine', vat: 'IT1' } };
    const first = { ...BASE, supplier: { name: 'Theirs', vat: 'IT1' } };
    const { one, conflicts } = twice(values, first, { ...BASE, supplier: { name: 'Theirs', vat: 'IT2' } }, { ...first, amount: 5 });
    expect(one.result.conflicts.map((c) => c.path)).toEqual(['supplier.name']);
    expect(conflicts).toEqual([]);
  });

  it('a carried order conflict where the values now hold the server order is not emitted again (no ghost)', () => {
    const first = { ...BASE, lines: lines([1, 1], [3, 3], [2, 2]) };
    const { one, conflicts } = twice(
      { ...BASE, lines: lines([2, 2], [1, 1], [3, 3]) },
      first,
      // The user takes the server order and edits a quantity; the server changes another row, not the order.
      { ...BASE, lines: lines([1, 9], [3, 3], [2, 2]) },
      { ...BASE, lines: lines([1, 1], [3, 3], [2, 7]) },
    );
    expect(one.result.conflicts.map((c) => c.path)).toEqual(['lines']);
    expect(conflicts).toEqual([]);
  });

  it('carried conflicts on two keys of one object stay each with its own base', () => {
    const values = { ...BASE, supplier: { name: 'Mine', vat: 'IT-mine' } };
    const first = { ...BASE, supplier: { name: 'Theirs', vat: 'IT-theirs' } };
    expect(twice(values, first, values, { ...first, amount: 5 }).conflicts).toEqual([
      ['supplier.name', 'Lumen Parts', 'Mine', 'Theirs'],
      ['supplier.vat', 'IT1', 'IT-mine', 'IT-theirs'],
    ]);
  });

  it('carried conflicts on two rows stay each on its own row (matched by id), with its own base', () => {
    const values = { ...BASE, lines: lines([1, 10], [2, 2], [3, 30]) };
    const first = { ...BASE, lines: lines([1, 11], [2, 2], [3, 31]) };
    expect(twice(values, first, values, { ...first, amount: 5 }).conflicts).toEqual([
      ['lines.0.qty', 1, 10, 11],
      ['lines.2.qty', 3, 30, 31],
    ]);
  });

  it('a carried conflict in a row the user moved: the index in the result (the user order), not in incoming', () => {
    const values = { ...BASE, lines: lines([3, 30], [1, 1], [2, 2]) };
    const first = { ...BASE, lines: lines([1, 1], [2, 2], [3, 31]) };
    const { one, two, conflicts } = twice(values, first, values, { ...first, amount: 5 });
    expect(one.result.conflicts.map((c) => c.path)).toEqual(['lines.0.qty']);
    expect(conflicts).toEqual([['lines.0.qty', 3, 30, 31]]);
    expect(two.result.values.lines).toBe(values.lines);
  });

  it('a carried conflict on a key the user removed (the key only on the server side) stays', () => {
    const values = { ...BASE, supplier: { name: 'Lumen Parts' } as Invoice['supplier'] };
    const first = { ...BASE, supplier: { name: 'Lumen Parts', vat: 'IT2' } };
    const { two } = twice(values, first, values, { ...first, amount: 5 });
    expect(two.result.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs, c.mineMissing])).toEqual([['supplier.vat', 'IT1', undefined, 'IT2', true]]);
  });

  it('a carried conflict on a key the baseline did not have keeps baseMissing (a missing key, not undefined, §1.13.1)', () => {
    type WithExtra = Invoice & { extra?: string };
    const values: WithExtra = { ...BASE, extra: 'mine' };
    const first: WithExtra = { ...BASE, extra: 'theirs' };
    const { one, two } = twice(values, first, values, { ...first, amount: 5 });
    const shape = (c: { path: string; base: unknown; baseMissing: boolean }) => [c.path, c.base, c.baseMissing];
    expect(one.result.conflicts.map(shape)).toEqual([['extra', undefined, true]]);
    expect(two.result.conflicts.map(shape)).toEqual([['extra', undefined, true]]);
  });

  it('a carried conflict on a node covers carried conflicts under it (one per path, even from a list that has both)', () => {
    const values = { ...BASE, supplier: { name: 'Mine', vat: 'IT1' } };
    const first = { ...BASE, supplier: { name: 'Theirs', vat: 'IT1' } };
    const nested = rebaseInternal({ baseline: BASE, values, incoming: first, ...OPTIONS }).records;
    const whole = rebaseInternal({ baseline: BASE, values, incoming: { ...BASE, supplier: null as unknown as Invoice['supplier'] }, ...OPTIONS }).records;
    expect([...nested, ...whole].map((r) => r.conflict.path)).toEqual(['supplier.name', 'supplier']);
    // The server keeps `supplier`: only the conflict on the whole node comes back.
    const two = rebaseCarrying({ baseline: first, values, incoming: { ...first, amount: 5 }, ...OPTIONS }, [...whole, ...nested]);
    expect(two.result.conflicts.map((c) => c.path)).toEqual(['supplier']);
  });

  it('a carried conflict on a row the user removed, the lines not changed by the server: named on the baseline side too', () => {
    const values = { ...BASE, lines: lines([1, 1], [3, 3]) };
    const first = { ...BASE, lines: lines([1, 1], [2, 8], [3, 3]) };
    const seen: unknown[] = [];
    const one = rebaseInternal({ baseline: BASE, values, incoming: first, ...OPTIONS });
    const itemLabel: RebaseOptions<Invoice>['itemLabel'] = (_path, item, context) => {
      seen.push([(item as Line).id, context.side, context.index]);
      return undefined;
    };
    const two = rebaseCarrying({ baseline: first, values, incoming: { ...first, amount: 5 }, ...OPTIONS, itemLabel }, one.records);
    expect(two.result.conflicts.map((c) => [c.path, c.mineMissing])).toEqual([['lines.1', true]]);
    expect(seen).toEqual([[2, 'baseline', 1]]);
  });

  it('a carried conflict on a row the user removed: named on the baseline side, at its index in incoming', () => {
    const values = { ...BASE, lines: lines([1, 1], [3, 3]) };
    const first = { ...BASE, lines: lines([1, 1], [2, 8], [3, 3]) };
    const seen: unknown[] = [];
    const one = rebaseInternal({ baseline: BASE, values, incoming: first, ...OPTIONS });
    const two = rebaseCarrying(
      {
        baseline: first,
        values,
        incoming: { ...first, lines: lines([0, 0], [1, 1], [2, 8], [3, 3]) },
        ...OPTIONS,
        itemLabel: (_path, item, context) => {
          seen.push([(item as Line).id, context.side, context.index]);
          return undefined;
        },
      },
      one.records,
    );
    expect(two.result.conflicts.map((c) => [c.path, c.label, c.mineMissing])).toEqual([['lines.2', 'Lines > Item 3', true]]);
    expect(seen).toContainEqual([2, 'baseline', 2]);
  });
});

describe('rebaseCarrying: carried conflicts under a node the user removed (#588)', () => {
  const shape = (conflicts: readonly { path: string; mine: unknown; theirs: unknown; baseMissing: boolean; mineMissing: boolean; theirsMissing: boolean }[]) =>
    conflicts.map((c) => [c.path, c.mine, c.theirs, c.baseMissing, c.mineMissing, c.theirsMissing]);

  it('a conflict on a field of a row the user then removes: on the row, the shape of a fresh merge, base the row of baseline', () => {
    const first = { ...BASE, lines: lines([1, 1], [2, 6], [3, 3]) };
    const removed = { ...BASE, lines: lines([1, 1], [3, 3]) };
    const second = { ...first, amount: 5 };
    const { one, two } = twice({ ...BASE, lines: lines([1, 1], [2, 5], [3, 3]) }, first, removed, second);
    expect(one.result.conflicts.map((c) => c.path)).toEqual(['lines.1.qty']);
    const fresh = computeRebase({ baseline: BASE, values: removed, incoming: second, ...OPTIONS });
    expect(shape(two.result.conflicts)).toEqual(shape(fresh.conflicts));
    expect(two.result.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs, c.mineMissing])).toEqual([
      ['lines.1', { id: 2, qty: 6 }, undefined, { id: 2, qty: 6 }, true],
    ]);
    expect(two.records[0]!.theirs).toEqual({ id: 2, qty: 6 });
  });

  it('the mirror case, a conflict on a field of a row the server then removes: on the row, the shape of a fresh merge', () => {
    const values = { ...BASE, lines: lines([1, 1], [2, 5], [3, 3]) };
    const first = { ...BASE, lines: lines([1, 1], [2, 6], [3, 3]) };
    const second = { ...BASE, lines: lines([1, 1], [3, 3]), amount: 5 };
    const { two } = twice(values, first, values, second);
    const fresh = computeRebase({ baseline: BASE, values, incoming: second, ...OPTIONS });
    expect(shape(two.result.conflicts)).toEqual(shape(fresh.conflicts));
    expect(two.result.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs, c.theirsMissing])).toEqual([
      ['lines.1', { id: 2, qty: 6 }, { id: 2, qty: 5 }, undefined, true],
    ]);
  });

  it('a conflict nested in an object the user replaced with a non-object value: on the object', () => {
    const first = { ...BASE, supplier: { name: 'Theirs', vat: 'IT1' } };
    const cleared = { ...BASE, supplier: null as unknown as Invoice['supplier'] };
    const listed = { ...BASE, supplier: [] as unknown as Invoice['supplier'] };
    for (const then of [cleared, listed]) {
      const { two } = twice({ ...BASE, supplier: { name: 'Mine', vat: 'IT1' } }, first, then, { ...first, amount: 5 });
      expect(two.result.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs, c.mineMissing])).toEqual([
        ['supplier', { name: 'Theirs', vat: 'IT1' }, then.supplier, { name: 'Theirs', vat: 'IT1' }, false],
      ]);
    }
  });

  it('a conflict on a field of a nested item the user then removes (the lines not changed by the server): on the item', () => {
    type Group = { id: number; name: string; parts: Line[] };
    type Order = { amount: number; groups: Group[] };
    const NESTED = { arrayIdKeys: { groups: 'id', 'groups.parts': 'id' } };
    const base: Order = { amount: 1, groups: [{ id: 1, name: 'G1', parts: lines([1, 1], [2, 2]) }] };
    const first: Order = { amount: 1, groups: [{ id: 1, name: 'G1', parts: lines([1, 1], [2, 6]) }] };
    const one = rebaseInternal({ baseline: base, values: { amount: 1, groups: [{ id: 1, name: 'G1', parts: lines([1, 1], [2, 5]) }] }, incoming: first, ...NESTED });
    expect(one.result.conflicts.map((c) => c.path)).toEqual(['groups.0.parts.1.qty']);
    // The user removes the part and renames the group; the server changes the amount only.
    const then: Order = { amount: 1, groups: [{ id: 1, name: 'G1 renamed', parts: lines([1, 1]) }] };
    const two = rebaseCarrying({ baseline: first, values: then, incoming: { ...first, amount: 2 }, ...NESTED }, one.records);
    expect(two.result.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs, c.mineMissing])).toEqual([
      ['groups.0.parts.1', { id: 2, qty: 6 }, undefined, { id: 2, qty: 6 }, true],
    ]);
  });
});

describe('rebaseCarrying: nested id-keyed arrays', () => {
  type Group = { id: number; name: string; parts: Line[] };
  type Order = { amount: number; groups: Group[] };
  const NESTED = { arrayIdKeys: { groups: 'id', 'groups.parts': 'id' } };
  const group = (id: number, name: string, ...ids: number[]): Group => ({ id, name, parts: lines(...ids.map((part): [number, number] => [part, 1])) });
  const order = (conflicts: readonly { path: string; base: unknown; mine: unknown; theirs: unknown }[]) =>
    conflicts.map((c) => [c.path, c.base, c.mine, c.theirs]);

  it('a carried order conflict of a nested array stays on it: the parent the user reordered gets no order conflict of its own', () => {
    const base: Order = { amount: 1, groups: [group(1, 'G1', 1, 2, 3), group(2, 'G2', 1, 2, 3)] };
    // The user reorders the groups and the parts of G2; the server reorders the parts of G2 another way.
    const values: Order = { amount: 1, groups: [group(2, 'G2', 3, 1, 2), group(1, 'G1', 1, 2, 3)] };
    const first: Order = { amount: 1, groups: [group(1, 'G1', 1, 2, 3), group(2, 'G2', 1, 3, 2)] };
    const one = rebaseInternal({ baseline: base, values, incoming: first, ...NESTED });
    expect(order(one.result.conflicts)).toEqual([['groups.0.parts', [1, 2, 3], [3, 1, 2], [1, 3, 2]]]);
    // The server renames G2 (it changes the groups, not their order): only the carried conflict on the parts.
    const second: Order = { amount: 1, groups: [group(1, 'G1', 1, 2, 3), group(2, 'G2 renamed', 1, 3, 2)] };
    const two = rebaseCarrying({ baseline: first, values, incoming: second, ...NESTED }, one.records);
    expect(order(two.result.conflicts)).toEqual([['groups.0.parts', [1, 2, 3], [3, 1, 2], [1, 3, 2]]]);
    expect(two.result.values.groups.map((g) => g.name)).toEqual(['G2 renamed', 'G1']);
  });
});

