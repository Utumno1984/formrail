// `useTanStackFormBinding` (ticket #508, code review round 1 on PR #557): one rule of the binding per test, each written to
// fail when the line that keeps the rule is mutated (the mutation is named in the test). The rules: the open conflicts
// of the recommended `saved` pattern stay open, a save in flight keeps what is typed meanwhile (only a discard or a
// rehydration drops it), the errors a run removed are given back in that run only, a missing key is not `undefined`,
// TanStack Form's field meta is recomputed once per change of its defaults, a write that changes nothing writes nothing.
import { act, renderHook } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useFormRebase } from '../../engine';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/tanstack-harness';
import { useTanStackFormBinding } from './use-tanstack-form-binding';

const STORED: Invoice = { ...SAVED, amount: '120' };

/** Counts the notifications of TanStack Form's BASE store (every `setState`, also one with an unchanged derived state). */
function countBaseStore(form: { baseStore: { subscribe: (listener: () => void) => { unsubscribe: () => void } } }) {
  let count = 0;
  const subscription = form.baseStore.subscribe(() => {
    count += 1;
  });
  return { count: () => count, stop: () => subscription.unsubscribe() };
}

describe('the recommended saved pattern after a rebase with an open conflict (M2, sync: the baseline replaced only by other content)', () => {
  it('defaultValues set to binding.baseline: the conflict stays open, the baseline keeps its identity, applied stays', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150', supplier: 'Lumen Parts Group' }));
    const { baseline } = harness.current().binding;
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    // `useEffect(() => setSaved(binding.baseline), [binding.baseline])`: the same object as the binding's baseline.
    record = baseline;
    harness.bump();
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(harness.current().rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    // And a copy of it (an app that builds the record again): the same.
    record = structuredClone(baseline);
    harness.bump();
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    harness.unmount();
  });
});

describe('a rehydration to the content of the values: values is the baseline object (M4 sync: `baseline !== prev.baseline`)', () => {
  it('a touched form whose new defaultValues have the content the user typed: values === baseline, no row', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    harness.type('Amount', '120');
    expect(harness.current().binding.values).not.toBe(harness.current().binding.baseline);
    record = STORED;
    harness.bump();
    expect(harness.current().binding.baseline).toEqual(STORED);
    // The contract: `values === baseline` after a reset, or when the baseline was replaced by the values' content.
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });
});

describe('a save in flight keeps what is typed meanwhile; only a discard or a rehydration drops it', () => {
  it('binding.reset() (Discard) during a save discards, and the save that ends after it is a plain hydration (M10 reset: `next !== undefined`; M23: `sent = null` in reset)', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.rerender({ binding: { isSaving: true } });
    harness.type('Notes', 'typed during the save');
    act(() => harness.current().binding.reset());
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.current().binding.values).toEqual(SAVED);
    expect(harness.input('Notes').value).toBe('');
    // Typed after the discard, while the save is still in flight: the discard won, the save's end is a hydration.
    harness.type('Supplier', 'typed after the discard');
    act(() => harness.current().binding.reset(STORED));
    expect(harness.current().binding.values).toBe(STORED);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it('a store event during the save that changes no value (a blur) keeps the values sent (M3 sync: `state.values !== this.source`; M20: `wholeForm && values === baseline`)', () => {
    const harness = setupInvoiceForm();
    // Nothing edited yet: TanStack Form's values are still its defaults object, the binding's values its baseline.
    expect(harness.current().form.state.values).toBe(harness.current().form.options.defaultValues);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    harness.rerender({ binding: { isSaving: true } });
    harness.blur('Amount');
    harness.type('Notes', 'typed during the save');
    act(() => harness.current().binding.reset(STORED));
    expect(harness.current().binding.baseline).toBe(STORED);
    expect(harness.current().binding.values).toEqual({ ...STORED, notes: 'typed during the save' });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it('defaultValues set to the object the binding wrote, during a save, keeps the values sent (M21 write: `this.source = values`)', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    const x: Invoice = { ...SAVED, supplier: 'Lumen Parts Group' };
    act(() => harness.current().binding.reset(x));
    expect(harness.current().form.state.values).toBe(x);
    harness.rerender({ defaults: () => record, binding: { isSaving: true } });
    // The saved pattern, a render late: `defaultValues` is now the very object TanStack Form holds as its values.
    record = x;
    harness.bump();
    harness.type('Notes', 'typed during the save');
    act(() => harness.current().binding.reset(STORED));
    expect(harness.current().binding.values).toEqual({ ...STORED, notes: 'typed during the save' });
    harness.unmount();
  });

  it('a save that fails with a rebase queued: the rebase applied at its end is not taken for the end of the save (M17: observeSaving in useInsertionEffect)', () => {
    const harness = setupInvoiceForm({ binding: { isSaving: false, saveError: null } });
    harness.type('Supplier', 'Mine');
    harness.rerender({ binding: { isSaving: true, saveError: null } });
    // Typed back to the saved value during the save: no edit against the baseline any more.
    harness.type('Supplier', SAVED.supplier);
    const incoming: Invoice = { ...SAVED, supplier: 'Lumen Parts Group' };
    act(() => harness.current().rebase.rebase(incoming));
    expect(harness.current().rebase.isPending).toBe(true);
    // The save fails: in the same commit the engine applies the queued rebase with `binding.reset(incoming)` (the form
    // has no edit against the baseline, so the merge is `incoming` itself). The values sent by the save must be
    // forgotten before that layout effect, or the reset keeps "Supplier, edited since the save started".
    harness.rerender({ binding: { isSaving: false, saveError: new Error('503') } });
    expect(harness.current().rebase.isPending).toBe(false);
    expect(harness.current().binding.baseline).toBe(incoming);
    expect(harness.current().binding.values).toBe(incoming);
    expect(harness.input('Supplier').value).toBe('Lumen Parts Group');
    harness.unmount();
  });
});

describe('the errors a run removed', () => {
  const validate = (name: keyof Invoice, value: string) => (value === 'bad' ? `${name} is bad` : undefined);

  it('are given back in the same synchronous run only: a later write of the old value gives no error back (M7 beginRun: the run closes at the next microtask)', async () => {
    const harness = setupInvoiceForm({ validate });
    harness.type('Amount', 'bad');
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual(['amount is bad']);
    act(() => harness.current().binding.setValues({ amount: '150' }));
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual([]);
    // The run is over (a microtask later): the old value written again by code is a new write, validated at the next
    // change, blur or submit, not the error of another run given back.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => harness.current().binding.setValues({ amount: 'bad' }));
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual([]);
    harness.unmount();
  });

  it('are cleared in errorMap and errorSourceMap (M27 clearStaleErrors: `errorSourceMap: {}`)', () => {
    const harness = setupInvoiceForm({ validate });
    harness.type('Amount', 'bad');
    expect(harness.current().form.state.fieldMeta.amount?.errorSourceMap).toEqual({ onChange: 'field' });
    act(() => harness.current().binding.setValues({ amount: '150' }));
    const meta = harness.current().form.state.fieldMeta.amount;
    // `toEqual`, not `toMatchObject` (an empty object matches any object there).
    expect(meta?.errorMap).toEqual({});
    expect(meta?.errorSourceMap).toEqual({});
    expect(meta?.errors).toEqual([]);
    harness.unmount();
  });

  it('a key that goes missing is a change, not `undefined` again: its error is removed (M14 valueAt: `hasOwnProperty`, §1.13.1)', () => {
    type Loose = { name: string; reference?: string };
    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: { name: 'Lumen Parts', reference: undefined } as Loose });
      return { form, binding: useTanStackFormBinding(form) };
    });
    act(() => result.current.form.setFieldMeta('reference', (meta) => ({ ...meta, errorMap: { onSubmit: 'Reference required' } })));
    expect(result.current.form.state.fieldMeta.reference?.errors).toEqual(['Reference required']);
    // The server's record has no `reference` key at all: `undefined` -> missing is a change of the field's value.
    act(() => result.current.binding.reset({ name: 'Lumen Parts' }));
    expect(Object.hasOwn(result.current.form.state.values, 'reference')).toBe(false);
    expect(result.current.form.state.fieldMeta.reference?.errors).toEqual([]);
  });
});

describe("TanStack Form's field meta, recomputed once per change of its defaults", () => {
  it('a touched form, new defaultValues: one write of the base store, none at the next commits (M18 resync: `staleMeta = false`)', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => ({ ...record }) });
    harness.type('Amount', '120');
    const writes = countBaseStore(harness.current().form);
    record = STORED;
    harness.bump();
    expect(writes.count()).toBe(1);
    expect(harness.current().form.state.fieldMeta.amount?.isDefaultValue).toBe(true);
    harness.bump();
    harness.bump();
    harness.blur('Notes');
    // The blur writes the meta (TanStack Form's own two updates), the binding writes nothing more.
    const afterBlur = writes.count();
    harness.bump();
    harness.bump();
    expect(writes.count()).toBe(afterBlur);
    writes.stop();
    harness.unmount();
  });
});

describe('a write of the binding that changes nothing writes nothing', () => {
  it('setValues with the values the form has: no write of the base store, the values keep their identity (M24 setValues: `values !== this.state.values`)', () => {
    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: { name: 'Lumen Parts', lines: [{ sku: 'Bolt' }] } });
      return { form, binding: useTanStackFormBinding(form), rebase: useFormRebase(useTanStackFormBinding(form)) };
    });
    act(() => result.current.form.setFieldValue('name', 'Lumen Parts Ltd'));
    const formValues = result.current.form.state.values;
    const writes = countBaseStore(result.current.form);
    act(() => result.current.binding.setValues({ name: 'Lumen Parts Ltd', lines: [{ sku: 'Bolt' }] }));
    expect(writes.count()).toBe(0);
    expect(result.current.form.state.values).toBe(formValues);
    writes.stop();
  });
});
