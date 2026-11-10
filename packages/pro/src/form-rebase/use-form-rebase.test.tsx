import { StrictMode, useEffect, type ReactNode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { useObjectPageForm, type UseObjectPageFormReturn } from '@react-object-page/core';
import { useFormRebase } from './use-form-rebase';
import type { UseFormRebaseOptions, UseFormRebaseReturn } from './types';

type Line = { id: number; qty: number };
type Invoice = { number: string; notes: string; amount: number; supplier: { name: string; vat: string }; lines: Line[]; extra?: string };

const BASE: Invoice = {
  number: 'A-1',
  notes: '',
  amount: 10,
  supplier: { name: 'ACME', vat: 'IT1' },
  lines: [
    { id: 1, qty: 1 },
    { id: 2, qty: 1 },
    { id: 3, qty: 1 },
  ],
};

interface Snapshot {
  values: Invoice;
  baseline: Invoice;
  isDirty: boolean;
  isSaving: boolean;
  isPending: boolean;
  conflicts: string[];
}

interface Handle {
  form: UseObjectPageFormReturn<Invoice>;
  rebase: UseFormRebaseReturn<Invoice>;
  renders: Snapshot[];
}

function setup(options: UseFormRebaseOptions<Invoice> = { arrayIdKeys: { lines: 'id' } }, baseline: Invoice = BASE, validate?: (v: Invoice) => Record<string, string | undefined>) {
  const renders: Snapshot[] = [];
  const view = renderHook(() => {
    const form = useObjectPageForm<Invoice>({ baseline, validate });
    const rebase = useFormRebase(form, options);
    renders.push({
      values: form.values,
      baseline: form.baseline,
      isDirty: form.isDirty,
      isSaving: form.isSaving,
      isPending: rebase.isPending,
      conflicts: rebase.conflicts.map((c) => c.path),
    });
    return { form, rebase };
  });
  const h = (): Handle => ({ ...view.result.current, renders });
  return { h, renders, view };
}

/** A save whose handler settles when the test decides. */
function controlledSave(form: UseObjectPageFormReturn<Invoice>) {
  let resolve!: (v: Invoice | void) => void;
  let reject!: (e: unknown) => void;
  let sent: Invoice | undefined;
  let done!: Promise<boolean>;
  act(() => {
    done = form.save(
      (values) =>
        new Promise<Invoice | void>((res, rej) => {
          sent = values;
          resolve = res;
          reject = rej;
        }),
    );
  });
  return {
    sent: () => sent,
    resolve: async (v?: Invoice) => {
      await act(async () => {
        resolve(v);
        await done;
      });
    },
    reject: async (e: unknown) => {
      await act(async () => {
        reject(e);
        await done;
      });
    },
  };
}

describe('useFormRebase: applying a rebase', () => {
  it('clean form: baseline and values become incoming, the form stays clean, applied lists the server changes', () => {
    const { h } = setup();
    const incoming: Invoice = { ...BASE, amount: 20, supplier: { ...BASE.supplier, vat: 'IT2' } };
    act(() => h().rebase.rebase(incoming));
    expect(h().form.baseline).toBe(incoming);
    expect(h().form.values).toBe(incoming);
    expect(h().form.isDirty).toBe(false);
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['amount', 'supplier.vat']);
    expect(h().rebase.isPending).toBe(false);
  });

  it('dirty form: untouched fields updated, touched kept, conflicts exposed; no intermediate clean render', () => {
    const { h, renders } = setup();
    act(() => {
      h().form.setValue('number', 'A-2');
      h().form.setValue('notes', 'mine');
    });
    const from = renders.length;
    const incoming: Invoice = { ...BASE, number: 'A-3', amount: 30 };
    act(() => h().rebase.rebase(incoming));
    expect(h().form.baseline).toBe(incoming);
    expect(h().form.values).toEqual({ ...BASE, number: 'A-2', notes: 'mine', amount: 30 });
    expect(h().form.isDirty).toBe(true);
    expect(h().rebase.conflicts).toEqual([
      { path: 'number', label: 'Number', base: 'A-1', mine: 'A-2', theirs: 'A-3', baseMissing: false, mineMissing: false, theirsMissing: false },
    ]);
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['amount']);
    const after = renders.slice(from);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((r) => r.isDirty)).toBe(true);
    expect(after.some((r) => r.values === incoming)).toBe(false);
    // Baseline and values switch in the same render.
    for (const r of after) expect(r.baseline === incoming).toBe(r.values.amount === 30);
  });

  it('dirty form whose edits the server also made: clean after the rebase, no conflict', () => {
    const { h } = setup();
    act(() => h().form.setValue('notes', 'same'));
    act(() => h().rebase.rebase({ ...BASE, notes: 'same' }));
    expect(h().form.isDirty).toBe(false);
    expect(h().rebase.conflicts).toEqual([]);
  });

  it('isDirty is true only when user edits are left against incoming', () => {
    const { h } = setup();
    act(() => h().form.setValue('amount', 99));
    act(() => h().rebase.rebase({ ...BASE, notes: 'server' }));
    expect(h().form.isDirty).toBe(true);
    expect(h().form.values).toEqual({ ...BASE, amount: 99, notes: 'server' });
  });

  it('rebase with the current baseline, or twice with the same object, is a no-op (idempotent)', () => {
    const { h, renders } = setup();
    act(() => h().form.setValue('number', 'A-2'));
    const incoming: Invoice = { ...BASE, number: 'A-3' };
    act(() => h().rebase.rebase(incoming));
    const values = h().form.values;
    const count = renders.length;
    act(() => h().rebase.rebase(incoming));
    act(() => h().rebase.rebase(h().form.baseline));
    expect(renders.length).toBe(count);
    expect(h().form.values).toBe(values);
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['number']);
  });

  it('a new rebase recomputes conflicts from scratch against the new incoming', () => {
    const { h } = setup();
    act(() => h().form.setValue('number', 'A-2'));
    act(() => h().rebase.rebase({ ...BASE, number: 'A-3' }));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['number']);
    act(() => h().rebase.rebase({ ...BASE, number: 'A-3', amount: 50 }));
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['amount']);
    expect(h().form.values.number).toBe('A-2');
  });

  it('clears validation errors (reset): validation runs again at the next save', async () => {
    const { h } = setup(undefined, BASE, (v) => ({ notes: v.notes === 'bad' ? 'Invalid' : undefined }));
    act(() => h().form.setValue('notes', 'bad'));
    await act(async () => {
      await h().form.save(() => undefined);
    });
    expect(h().form.fieldErrors).toEqual({ notes: 'Invalid' });
    act(() => h().rebase.rebase({ ...BASE, amount: 2 }));
    expect(h().form.fieldErrors).toEqual({});
    expect(h().form.values.notes).toBe('bad');
  });

  it('options are passed to the merge (labels, isEqual)', () => {
    const isEqual = (a: unknown, b: unknown, path: string) =>
      path === 'number' && typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : undefined;
    const { h } = setup({ arrayIdKeys: { lines: 'id' }, labels: { notes: 'Remarks' }, isEqual });
    act(() => {
      h().form.setValue('number', 'a-1');
      h().form.setValue('notes', 'x');
    });
    act(() => h().rebase.rebase({ ...BASE, number: 'B-1', notes: 'y' }));
    expect(h().form.values.number).toBe('B-1');
    expect(h().rebase.conflicts.map((c) => c.label)).toEqual(['Remarks']);
  });

  it('functions keep their identity across renders', () => {
    const { h } = setup();
    const first = h().rebase;
    act(() => h().form.setValue('notes', 'x'));
    const second = h().rebase;
    expect(second.rebase).toBe(first.rebase);
    expect(second.acceptTheirs).toBe(first.acceptTheirs);
    expect(second.keepMine).toBe(first.keepMine);
    expect(second.acceptAllTheirs).toBe(first.acceptAllTheirs);
  });
});

describe('useFormRebase: resolving conflicts', () => {
  function withConflicts() {
    const s = setup();
    act(() => {
      s.h().form.setValue('number', 'A-2');
      s.h().form.setValue('supplier', { ...BASE.supplier, name: 'Mine Ltd' });
    });
    act(() => s.h().rebase.rebase({ ...BASE, number: 'A-3', supplier: { ...BASE.supplier, name: 'Theirs Ltd' } }));
    expect(s.h().rebase.conflicts.map((c) => c.path)).toEqual(['number', 'supplier.name']);
    return s;
  }

  it('acceptTheirs: the field takes the server value and the conflict closes', () => {
    const { h } = withConflicts();
    act(() => h().rebase.acceptTheirs('supplier.name'));
    expect(h().form.values.supplier).toEqual({ name: 'Theirs Ltd', vat: 'IT1' });
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['number']);
    act(() => h().rebase.acceptTheirs('number'));
    expect(h().form.values.number).toBe('A-3');
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().form.isDirty).toBe(false);
  });

  it('keepMine: closes the conflict without changing values', () => {
    const { h } = withConflicts();
    const values = h().form.values;
    act(() => h().rebase.keepMine('number'));
    expect(h().form.values).toBe(values);
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['supplier.name']);
    expect(h().form.isDirty).toBe(true);
  });

  it('acceptAllTheirs: closes every conflict in one update', () => {
    const { h, renders } = withConflicts();
    const count = renders.length;
    act(() => h().rebase.acceptAllTheirs());
    expect(renders.length - count).toBeLessThanOrEqual(2);
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().form.values).toEqual(h().form.baseline);
    expect(h().form.isDirty).toBe(false);
  });

  it('a conflict brought back to the server value by hand closes by itself and does not reopen', () => {
    const { h } = withConflicts();
    act(() => h().form.setValue('number', 'A-3'));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['supplier.name']);
    act(() => h().form.setValue('number', 'A-4'));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['supplier.name']);
  });

  it('unknown paths are ignored', () => {
    const { h } = withConflicts();
    const values = h().form.values;
    act(() => {
      h().rebase.acceptTheirs('nope');
      h().rebase.keepMine('nope');
    });
    expect(h().form.values).toBe(values);
    expect(h().rebase.conflicts).toHaveLength(2);
  });

  it('reset() (Discard) after a rebase: back to the new baseline, conflicts and applied cleared', () => {
    const { h } = withConflicts();
    act(() => h().rebase.rebase({ ...h().form.baseline, amount: 77 }));
    act(() => h().form.setValue('notes', 'x'));
    act(() => h().form.reset());
    expect(h().form.values).toBe(h().form.baseline);
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().rebase.applied).toEqual([]);
  });

  it('reset(newBaseline) by the consumer clears conflicts and applied', () => {
    const { h } = withConflicts();
    act(() => h().form.reset({ ...BASE }));
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().rebase.applied).toEqual([]);
  });

  it('reset(newBaseline) by the consumer after a rebase on a clean form clears applied', () => {
    const { h } = setup();
    act(() => h().rebase.rebase({ ...BASE, amount: 20 }));
    expect(h().form.isDirty).toBe(false);
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['amount']);
    act(() => h().form.reset({ ...BASE, amount: 50, notes: 'reloaded' }));
    expect(h().rebase.applied).toEqual([]);
    expect(h().rebase.conflicts).toEqual([]);
  });

  it('a conflict on a top-level key removed by the server: acceptTheirs removes the key', () => {
    const { h } = setup(undefined, { ...BASE, extra: 'base' });
    act(() => h().form.setValue('extra', 'mine'));
    const incoming: Invoice = { ...BASE };
    act(() => h().rebase.rebase(incoming));
    expect(h().rebase.conflicts).toEqual([
      { path: 'extra', label: 'Extra', base: 'base', mine: 'mine', theirs: undefined, baseMissing: false, mineMissing: false, theirsMissing: true },
    ]);
    act(() => h().rebase.acceptTheirs('extra'));
    expect(Object.hasOwn(h().form.values, 'extra')).toBe(false);
    expect(h().form.baseline).toBe(incoming);
    expect(h().form.isDirty).toBe(false);
    expect(h().rebase.conflicts).toEqual([]);
  });
});

describe('useFormRebase: id-keyed arrays', () => {
  const lines = (...pairs: [number, number][]) => pairs.map(([id, qty]) => ({ id, qty }));

  it('field conflict inside an item resolved by id after a user reorder', () => {
    const { h } = setup();
    act(() => h().form.setValue('lines', lines([1, 5], [2, 1], [3, 1])));
    act(() => h().rebase.rebase({ ...BASE, lines: lines([1, 6], [2, 1], [3, 1]) }));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['lines.0.qty']);
    act(() => h().form.setValue('lines', lines([3, 1], [2, 1], [1, 5])));
    act(() => h().rebase.acceptTheirs('lines.0.qty'));
    expect(h().form.values.lines).toEqual(lines([3, 1], [2, 1], [1, 6]));
    expect(h().rebase.conflicts).toEqual([]);
  });

  it('item removed by the server and modified by the user: acceptTheirs removes it', () => {
    const { h } = setup();
    act(() => h().form.setValue('lines', lines([1, 1], [2, 9], [3, 1])));
    act(() => h().rebase.rebase({ ...BASE, lines: lines([1, 1], [3, 1]) }));
    expect(h().form.values.lines).toEqual(lines([1, 1], [2, 9], [3, 1]));
    expect(h().rebase.conflicts.map((c) => [c.path, c.theirsMissing])).toEqual([['lines.1', true]]);
    act(() => h().rebase.acceptTheirs('lines.1'));
    expect(h().form.values.lines).toEqual(lines([1, 1], [3, 1]));
    expect(h().form.isDirty).toBe(false);
  });

  it('item removed by the user and modified by the server: acceptTheirs puts it back after its predecessor', () => {
    const { h } = setup();
    act(() => h().form.setValue('lines', lines([1, 1], [3, 1])));
    act(() => h().rebase.rebase({ ...BASE, lines: lines([1, 1], [2, 8], [3, 1]) }));
    expect(h().form.values.lines).toEqual(lines([1, 1], [3, 1]));
    expect(h().rebase.conflicts.map((c) => [c.path, c.mineMissing])).toEqual([['lines.1', true]]);
    act(() => h().rebase.acceptTheirs('lines.1'));
    expect(h().form.values.lines).toEqual(lines([1, 1], [2, 8], [3, 1]));
    expect(h().form.isDirty).toBe(false);
  });

  it('order conflict: acceptTheirs applies the server order and keeps the field values', () => {
    const { h } = setup();
    act(() => h().form.setValue('lines', lines([2, 4], [1, 1], [3, 1])));
    act(() => h().rebase.rebase({ ...BASE, lines: lines([1, 1], [3, 1], [2, 1]) }));
    expect(h().rebase.conflicts.map((c) => [c.path, c.mine, c.theirs])).toEqual([['lines', [2, 1, 3], [1, 3, 2]]]);
    act(() => h().rebase.acceptTheirs('lines'));
    expect(h().form.values.lines).toEqual(lines([1, 1], [3, 1], [2, 4]));
    expect(h().rebase.conflicts).toEqual([]);
  });

  it('order conflict closes by itself when the user reorders to the server order', () => {
    const { h } = setup();
    act(() => h().form.setValue('lines', lines([2, 1], [1, 1], [3, 1])));
    act(() => h().rebase.rebase({ ...BASE, lines: lines([1, 1], [3, 1], [2, 1]) }));
    expect(h().rebase.conflicts).toHaveLength(1);
    act(() => h().form.setValue('lines', lines([1, 1], [3, 1], [2, 1])));
    expect(h().rebase.conflicts).toEqual([]);
  });

  it('acceptAllTheirs composes several conflicts in the same top-level field', () => {
    const { h } = setup();
    act(() => h().form.setValue('lines', lines([1, 5], [2, 5], [3, 1])));
    act(() => h().rebase.rebase({ ...BASE, lines: lines([1, 6], [2, 6], [3, 1]) }));
    expect(h().rebase.conflicts).toHaveLength(2);
    act(() => h().rebase.acceptAllTheirs());
    expect(h().form.values.lines).toEqual(lines([1, 6], [2, 6], [3, 1]));
    expect(h().form.isDirty).toBe(false);
  });
});

describe('useFormRebase: during a save', () => {
  it('queued while saving (isPending), only the latest applied, against the baseline the save returned', async () => {
    const { h } = setup();
    act(() => h().form.setValue('notes', 'mine'));
    const save = controlledSave(h().form);
    expect(h().form.isSaving).toBe(true);
    const first: Invoice = { ...BASE, amount: 11 };
    const second: Invoice = { ...BASE, notes: 'mine', amount: 12, number: 'S-2' };
    act(() => h().rebase.rebase(first));
    expect(h().rebase.isPending).toBe(true);
    expect(h().form.baseline).toBe(BASE);
    act(() => h().rebase.rebase(second));
    expect(h().rebase.isPending).toBe(true);
    // The user keeps typing while saving.
    act(() => h().form.setValue('notes', 'mine 2'));
    const stored: Invoice = { ...BASE, notes: 'mine', amount: 10 };
    await save.resolve(stored);
    expect(h().rebase.isPending).toBe(false);
    expect(h().form.baseline).toBe(second);
    // Merge of (stored → second) into values: amount and number from the server, notes still the user's.
    expect(h().form.values).toEqual({ ...BASE, amount: 12, number: 'S-2', notes: 'mine 2' });
    expect(h().rebase.applied.map((e) => e.path)).toEqual(['number', 'amount']);
    expect(h().rebase.conflicts).toEqual([]);
    expect(save.sent()?.notes).toBe('mine');
  });

  it('an incoming that does not contain the saved value is merged against the saved baseline (conflict on an edited field)', async () => {
    const { h } = setup();
    act(() => h().form.setValue('notes', 'mine'));
    const save = controlledSave(h().form);
    act(() => h().rebase.rebase({ ...BASE, amount: 12 }));
    act(() => h().form.setValue('notes', 'mine 2'));
    await save.resolve({ ...BASE, notes: 'mine' });
    expect(h().form.values.notes).toBe('mine 2');
    expect(h().rebase.conflicts.map((c) => [c.path, c.base, c.mine, c.theirs])).toEqual([['notes', 'mine', 'mine 2', '']]);
  });

  it('a failed save: the queued rebase is applied after the failure, against the unchanged baseline', async () => {
    const { h } = setup();
    act(() => h().form.setValue('number', 'A-2'));
    const save = controlledSave(h().form);
    act(() => h().rebase.rebase({ ...BASE, number: 'A-3', amount: 3 }));
    expect(h().rebase.isPending).toBe(true);
    await save.reject(new Error('offline'));
    expect(h().rebase.isPending).toBe(false);
    expect(h().form.values).toEqual({ ...BASE, number: 'A-2', amount: 3 });
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['number']);
  });

  it('a successful save with open conflicts saves the user values and clears conflicts and applied', async () => {
    const { h } = setup();
    act(() => h().form.setValue('number', 'A-2'));
    act(() => h().rebase.rebase({ ...BASE, number: 'A-3', amount: 3 }));
    expect(h().rebase.conflicts).toHaveLength(1);
    expect(h().rebase.applied).toHaveLength(1);
    const save = controlledSave(h().form);
    expect(h().rebase.conflicts).toHaveLength(1);
    await save.resolve();
    expect(save.sent()?.number).toBe('A-2');
    expect(h().form.baseline.number).toBe('A-2');
    expect(h().form.isDirty).toBe(false);
    expect(h().rebase.conflicts).toEqual([]);
    expect(h().rebase.applied).toEqual([]);
  });

  it('a failed save keeps the open conflicts', async () => {
    const { h } = setup();
    act(() => h().form.setValue('number', 'A-2'));
    act(() => h().rebase.rebase({ ...BASE, number: 'A-3' }));
    const save = controlledSave(h().form);
    await save.reject(new Error('offline'));
    expect(h().rebase.conflicts.map((c) => c.path)).toEqual(['number']);
  });

  it('acceptTheirs on a top-level key removed by the server is ignored while saving', async () => {
    const { h } = setup(undefined, { ...BASE, extra: 'base' });
    act(() => h().form.setValue('extra', 'mine'));
    act(() => h().rebase.rebase({ ...BASE }));
    const save = controlledSave(h().form);
    act(() => h().rebase.acceptTheirs('extra'));
    expect(h().form.values.extra).toBe('mine');
    expect(h().rebase.conflicts).toHaveLength(1);
    await save.reject(new Error('offline'));
    act(() => h().rebase.acceptTheirs('extra'));
    expect(Object.hasOwn(h().form.values, 'extra')).toBe(false);
  });
});

describe('useFormRebase: call sites', () => {
  it('called in an effect when the data arrives: applied once, no update loop', () => {
    let renders = 0;
    function Editor({ data }: { data: Invoice }) {
      renders += 1;
      const form = useObjectPageForm<Invoice>({ baseline: BASE });
      const { rebase } = useFormRebase(form);
      useEffect(() => rebase(data), [data, rebase]);
      return <output>{form.values.amount}</output>;
    }
    const data: Invoice = { ...BASE, amount: 42 };
    const view = render(<Editor data={BASE} />);
    view.rerender(<Editor data={data} />);
    expect(view.container.textContent).toBe('42');
    expect(renders).toBeLessThan(10);
  });

  it('called during render on every render: applied once, no update loop', () => {
    let renders = 0;
    let latest: UseObjectPageFormReturn<Invoice> | undefined;
    function Editor({ data }: { data: Invoice }) {
      renders += 1;
      const form = useObjectPageForm<Invoice>({ baseline: BASE });
      latest = form;
      useFormRebase(form).rebase(data);
      return <output>{form.values.amount}</output>;
    }
    const data: Invoice = { ...BASE, amount: 42 };
    const view = render(<Editor data={data} />);
    expect(view.container.textContent).toBe('42');
    expect(latest?.baseline).toBe(data);
    expect(renders).toBeLessThan(10);
  });

  it('works under StrictMode', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(
      () => {
        const form = useObjectPageForm<Invoice>({ baseline: BASE });
        return { form, rebase: useFormRebase(form) };
      },
      { wrapper },
    );
    act(() => result.current.form.setValue('number', 'A-2'));
    act(() => result.current.rebase.rebase({ ...BASE, number: 'A-3', amount: 5 }));
    expect(result.current.form.values).toEqual({ ...BASE, number: 'A-2', amount: 5 });
    expect(result.current.rebase.conflicts.map((c) => c.path)).toEqual(['number']);
  });

  it('a form in a parent, the hook in a child: no warning about updating another component while rendering', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Child({ form, data }: { form: UseObjectPageFormReturn<Invoice>; data: Invoice }) {
      useFormRebase(form).rebase(data);
      return null;
    }
    function Parent({ data }: { data: Invoice }) {
      const form = useObjectPageForm<Invoice>({ baseline: BASE });
      return (
        <>
          <output>{form.values.amount}</output>
          <Child form={form} data={data} />
        </>
      );
    }
    const view = render(<Parent data={{ ...BASE, amount: 8 }} />);
    expect(view.container.textContent).toBe('8');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
