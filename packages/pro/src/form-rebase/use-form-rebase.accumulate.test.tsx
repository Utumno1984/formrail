// `useFormRebase` with several server updates in a row (ticket #584, decision of 2026-11-17: the conflicts accumulate
// until they are resolved). The cases of the shared suite (test/rebase-accumulate-contract.ts) run on every form; these
// are the ones of the merge itself, on core's form: id-keyed rows, order, removed rows, nested fields, labels.
import { act, renderHook } from '@testing-library/react';
import { useObjectPageForm } from '@formrail/core';
import { useFormRebase } from './use-form-rebase';
import type { OpenRebaseConflict, UseFormRebaseOptions } from './types';

type Line = { id: number; qty: number };
type Invoice = { number: string; notes: string; amount: number; supplier: { name: string; vat: string }; lines: Line[] };

const lines = (...pairs: [number, number][]): Line[] => pairs.map(([id, qty]) => ({ id, qty }));

const BASE: Invoice = {
  number: 'A-1',
  notes: '',
  amount: 10,
  supplier: { name: 'Lumen Parts', vat: 'IT1' },
  lines: lines([1, 1], [2, 1], [3, 1]),
};

/** A version of the record on the server: `BASE` with `patch` (a new object each time). */
const server = (patch: Partial<Invoice> = {}): Invoice => ({ ...BASE, ...patch });

function setup(options: UseFormRebaseOptions<Invoice> = { arrayIdKeys: { lines: 'id' } }) {
  const view = renderHook(() => {
    const form = useObjectPageForm<Invoice>({ baseline: BASE });
    return { form, rebase: useFormRebase(form, options) };
  });
  const h = () => view.result.current;
  return {
    h,
    edit: <K extends keyof Invoice>(key: K, value: Invoice[K]) => act(() => h().form.setValue(key, value)),
    rebase: (incoming: Invoice) => act(() => h().rebase.rebase(incoming)),
    /** `[path, base, mine, theirs]` of the open conflicts, in order. */
    open: () => h().rebase.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs]),
  };
}

describe('useFormRebase: the example of the TSDoc (#584)', () => {
  it('Number edited; update 1 changes Number, update 2 changes Amount: the Number conflict stays, applied is Amount', () => {
    const { h, edit, rebase, open } = setup();
    edit('number', 'A-2');
    rebase(server({ number: 'A-3' }));
    rebase(server({ number: 'A-3', amount: 50 }));
    expect(open()).toEqual([['number', 'A-1', 'A-2', 'A-3']]);
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['amount']);
    // Update 3 changes Number again: still one conflict, against the latest value.
    rebase(server({ number: 'A-4', amount: 50 }));
    expect(open()).toEqual([['number', 'A-3', 'A-2', 'A-4']]);
    expect(h().rebase.applied).toEqual([]);
    // Update 4 brings Number to the user's value: closed.
    rebase(server({ number: 'A-2', amount: 50 }));
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().form.isDirty).toBe(false);
  });
});

describe('useFormRebase: conflicts across updates, nested fields', () => {
  it('a conflict in an object stays when the next update changes another key of that object', () => {
    const { h, edit, rebase, open } = setup();
    edit('supplier', { name: 'Mine Ltd', vat: 'IT1' });
    rebase(server({ supplier: { name: 'Theirs Ltd', vat: 'IT1' } }));
    rebase(server({ supplier: { name: 'Theirs Ltd', vat: 'IT9' } }));
    expect(open()).toEqual([['supplier.name', 'Lumen Parts', 'Mine Ltd', 'Theirs Ltd']]);
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['supplier.vat']);
    expect(h().form.values.supplier).toEqual({ name: 'Mine Ltd', vat: 'IT9' });
  });

  it('a conflict nested in a field that the next update turns into a conflict on the whole field is covered by it', () => {
    const { h, edit, rebase } = setup();
    edit('supplier', { name: 'Mine Ltd', vat: 'IT1' });
    rebase(server({ supplier: { name: 'Theirs Ltd', vat: 'IT1' } }));
    const gone = null as unknown as Invoice['supplier'];
    rebase(server({ supplier: gone }));
    expect(h().rebase.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs])).toEqual([
      ['supplier', { name: 'Theirs Ltd', vat: 'IT1' }, { name: 'Mine Ltd', vat: 'IT1' }, null],
    ]);
  });

  it('the conflicts are listed in the order of the form, whatever the order in which the updates arrive', () => {
    const paths: string[][] = [];
    for (const first of [server({ number: 'A-3' }), server({ lines: lines([1, 7], [2, 1], [3, 1]) })]) {
      const { h, edit, rebase } = setup();
      edit('number', 'A-2');
      edit('lines', lines([1, 5], [2, 1], [3, 1]));
      rebase(first);
      rebase(server({ number: 'A-3', lines: lines([1, 7], [2, 1], [3, 1]) }));
      paths.push(h().rebase.conflicts.map((c) => c.path));
    }
    expect(paths).toEqual([
      ['number', 'lines.0.qty'],
      ['number', 'lines.0.qty'],
    ]);
  });

  it('isEqual decides "changed" for the earlier conflicts too: an equal value of the server keeps the conflict, theirs the latest', () => {
    const isEqual = (a: unknown, b: unknown, path: string) =>
      path === 'number' && typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : undefined;
    const { edit, rebase, open } = setup({ arrayIdKeys: { lines: 'id' }, isEqual });
    edit('number', 'A-2');
    rebase(server({ number: 'A-3' }));
    rebase(server({ number: 'a-3', amount: 50 }));
    expect(open()).toEqual([['number', 'A-1', 'A-2', 'a-3']]);
    // The server comes to the user's value but for the case: closed.
    rebase(server({ number: 'a-2', amount: 50 }));
    expect(open()).toEqual([]);
  });
});

describe('useFormRebase: conflicts across updates, id-keyed rows', () => {
  it('a conflict in a row: path and label of the last update when the server removes a row above it; resolved there', () => {
    const { h, edit, rebase } = setup();
    edit('lines', lines([1, 1], [2, 1], [3, 5]));
    rebase(server({ lines: lines([1, 1], [2, 1], [3, 6]) }));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['lines.2.qty']);
    rebase(server({ lines: lines([2, 1], [3, 6]) }));
    const conflict = h().rebase.conflicts[0] as OpenRebaseConflict;
    expect([conflict.path, conflict.currentPath, conflict.label, conflict.base, conflict.mine, conflict.theirs]).toEqual([
      'lines.1.qty',
      'lines.1.qty',
      'Lines > Item 2 > Qty',
      1,
      5,
      6,
    ]);
    expect(h().rebase.applied.map((e) => [e.path, e.kind])).toEqual([['lines.0', 'removed']]);
    act(() => h().rebase.acceptTheirs('lines.1.qty'));
    expect(h().form.values.lines).toEqual(lines([2, 1], [3, 6]));
    expect(h().form.isDirty).toBe(false);
  });

  it('a second update on the same row field: one conflict, deduplicated by row id, base the value it replaced', () => {
    const { h, edit, rebase, open } = setup();
    edit('lines', lines([1, 1], [2, 1], [3, 5]));
    rebase(server({ lines: lines([1, 1], [2, 1], [3, 6]) }));
    rebase(server({ lines: lines([2, 1], [3, 7]) }));
    expect(open()).toEqual([['lines.1.qty', 6, 5, 7]]);
    // The same content again: no duplicate.
    rebase(server({ lines: lines([2, 1], [3, 7]) }));
    expect(open()).toEqual([['lines.1.qty', 6, 5, 7]]);
    expect(h().rebase.applied).toEqual([]);
  });

  it('an order conflict stays when the next update changes a row but not the order; acceptTheirs applies the latest order', () => {
    const { h, edit, rebase } = setup();
    edit('lines', lines([2, 1], [1, 1], [3, 1]));
    rebase(server({ lines: lines([1, 1], [3, 1], [2, 1]) }));
    const order = () => h().rebase.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs]);
    expect(order()).toEqual([['lines', [1, 2, 3], [2, 1, 3], [1, 3, 2]]]);
    rebase(server({ lines: lines([1, 1], [3, 9], [2, 1]) }));
    expect(order()).toEqual([['lines', [1, 2, 3], [2, 1, 3], [1, 3, 2]]]);
    expect(h().form.values.lines).toEqual(lines([2, 1], [1, 1], [3, 9]));
    // An update elsewhere: the lines untouched by the server, the order conflict still there.
    rebase(server({ lines: lines([1, 1], [3, 9], [2, 1]), amount: 50 }));
    expect(order()).toEqual([['lines', [1, 2, 3], [2, 1, 3], [1, 3, 2]]]);
    act(() => h().rebase.acceptTheirs('lines'));
    expect(h().form.values.lines).toEqual(lines([1, 1], [3, 9], [2, 1]));
    expect(h().form.isDirty).toBe(false);
  });

  it("an order conflict closes when the next update takes the user's order", () => {
    const { h, edit, rebase } = setup();
    edit('lines', lines([2, 1], [1, 1], [3, 1]));
    rebase(server({ lines: lines([1, 1], [3, 1], [2, 1]) }));
    rebase(server({ lines: lines([2, 1], [1, 1], [3, 4]) }));
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().form.values.lines).toEqual(lines([2, 1], [1, 1], [3, 4]));
  });

  it('a row the user removed and the server changed: the conflict stays across updates, at the index of the last one', () => {
    const itemLabel = (_path: string, item: unknown, context: { index: number }) => `Line ${(item as Line).id} at ${context.index}`;
    const { h, edit, rebase, open } = setup({ arrayIdKeys: { lines: 'id' }, itemLabel });
    edit('lines', lines([1, 1], [3, 1]));
    rebase(server({ lines: lines([1, 1], [2, 8], [3, 1]) }));
    expect(open()).toEqual([['lines.1', { id: 2, qty: 1 }, undefined, { id: 2, qty: 8 }]]);
    // An update elsewhere: the lines are not changed by it.
    rebase(server({ lines: lines([1, 1], [2, 8], [3, 1]), amount: 50 }));
    expect(open()).toEqual([['lines.1', { id: 2, qty: 1 }, undefined, { id: 2, qty: 8 }]]);
    // An update that adds a row on top and changes another row: the conflict follows the row in the last update.
    rebase(server({ lines: lines([0, 1], [1, 1], [2, 8], [3, 4]), amount: 50 }));
    const conflict = h().rebase.conflicts[0] as OpenRebaseConflict;
    expect([conflict.path, conflict.mineMissing, conflict.label, conflict.base, conflict.theirs]).toEqual([
      'lines.2',
      true,
      'Lines > Line 2 at 2',
      { id: 2, qty: 1 },
      { id: 2, qty: 8 },
    ]);
    expect(h().rebase.conflicts).toHaveLength(1);
    act(() => h().rebase.acceptTheirs('lines.2'));
    expect(h().form.values.lines).toEqual(lines([1, 1], [2, 8], [3, 4], [0, 1]));
  });

  it('a row the server removed and the user changed: the conflict stays when the next update changes another row', () => {
    const { h, edit, rebase, open } = setup();
    edit('lines', lines([1, 1], [2, 9], [3, 1]));
    rebase(server({ lines: lines([1, 1], [3, 1]) }));
    expect(open()).toEqual([['lines.1', { id: 2, qty: 1 }, { id: 2, qty: 9 }, undefined]]);
    rebase(server({ lines: lines([1, 1], [3, 4]) }));
    expect(open()).toEqual([['lines.1', { id: 2, qty: 1 }, { id: 2, qty: 9 }, undefined]]);
    expect(h().rebase.conflicts[0]!.theirsMissing).toBe(true);
    expect(h().form.values.lines).toEqual(lines([1, 1], [2, 9], [3, 4]));
    act(() => h().rebase.acceptTheirs('lines.1'));
    expect(h().form.values.lines).toEqual(lines([1, 1], [3, 4]));
    expect(h().form.isDirty).toBe(false);
  });

  it('a row the server removed and puts back: closed when it equals the user row, a conflict on the field that differs otherwise', () => {
    const same = setup();
    same.edit('lines', lines([1, 1], [2, 9], [3, 1]));
    same.rebase(server({ lines: lines([1, 1], [3, 1]) }));
    same.rebase(server({ lines: lines([1, 1], [2, 9], [3, 1]) }));
    expect(same.h().rebase.conflicts).toEqual([]);

    const other = setup();
    other.edit('lines', lines([1, 1], [2, 9], [3, 1]));
    other.rebase(server({ lines: lines([1, 1], [3, 1]) }));
    other.rebase(server({ lines: lines([1, 1], [2, 4], [3, 1]) }));
    expect(other.h().rebase.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs, c.baseMissing])).toEqual([['lines.1.qty', undefined, 9, 4, true]]);
  });

  it('a conflict in a row the next update removes: covered by the conflict on the row', () => {
    const { h, edit, rebase } = setup();
    edit('lines', lines([1, 5], [2, 1], [3, 1]));
    rebase(server({ lines: lines([1, 6], [2, 1], [3, 1]) }));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['lines.0.qty']);
    rebase(server({ lines: lines([2, 1], [3, 1]) }));
    expect(h().rebase.conflicts.map((c) => [c.path, c.theirsMissing])).toEqual([['lines.0', true]]);
  });
});
