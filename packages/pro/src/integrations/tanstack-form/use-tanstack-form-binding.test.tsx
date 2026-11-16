// `useTanStackFormBinding` (ticket #508) with a real TanStack Form: the contract of `RebaseFormBinding` (the shared
// suite of #507, unchanged), the identity of the snapshots, the Change Summary against the saved baseline.
import { useRef } from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase, type RebaseFormBinding } from '../../engine';
import { CONTRACT_CHECKS, deferred, type ContractForm, type ContractInvoice, type UseContractForm } from '../../../test/binding-contract';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/tanstack-harness';
import { useTanStackFormBinding, type TanStackFormOf } from './use-tanstack-form-binding';

/** The contract harness on a TanStack Form form, with `toBinding` turning the form into the binding under test. */
function contractForm(toBinding: (form: TanStackFormOf<ContractInvoice>) => RebaseFormBinding<ContractInvoice>): UseContractForm {
  return function useContractForm(initial: ContractInvoice): ContractForm {
    // The save in flight: `onSubmit` waits for its gate, then makes what the server stored the baseline.
    const save = useRef<{ gate: Promise<void>; respond?: (sent: ContractInvoice) => ContractInvoice } | null>(null);
    const bindingRef = useRef<RebaseFormBinding<ContractInvoice> | null>(null);
    const form = useForm({
      defaultValues: initial,
      onSubmit: async ({ value }) => {
        const current = save.current!;
        await current.gate;
        // The documented pattern: `binding.reset(stored)` inside `onSubmit`, before it resolves.
        if (current.respond) bindingRef.current!.reset(current.respond(value));
      },
    });
    const binding = toBinding(form);
    bindingRef.current = binding;
    return {
      binding,
      // `field.handleChange` is `form.setFieldValue` with the default options: touched, dirty, listeners, validation.
      editName: (name) => form.setFieldValue('name', name),
      editCity: (city) => form.setFieldValue('supplier.city', city),
      // What TanStack Form's own validation does on a change: an error in the field's `errorMap`.
      showValidationError: () => form.setFieldMeta('name', (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onChange: 'Invalid name' } })),
      discard: () => form.reset(),
      startSave: (respond) => {
        const gate = deferred();
        save.current = { gate: gate.promise, respond };
        const done = form.handleSubmit().catch(() => undefined);
        return {
          settle: async (error) => {
            if (error === null) gate.resolve();
            else gate.reject(error);
            await done;
          },
        };
      },
    };
  };
}

const useAdapter = contractForm(function useAdapterBinding(form) {
  return useTanStackFormBinding(form);
});

describe('useTanStackFormBinding: the RebaseFormBinding contract (shared suite)', () => {
  it.each(CONTRACT_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useAdapter);
  });
});

// Two bindings written the naive way, each breaking one rule: the shared suite must fail on them.
const useStateValues = contractForm(function useStateValuesBinding(form) {
  // TanStack Form's own objects, no snapshot: `form.state.values` and the defaults of the first render.
  const binding = useTanStackFormBinding(form);
  return { ...binding, values: form.state.values, baseline: form.options.defaultValues as ContractInvoice };
});
const useResetByLibrary = contractForm(function useResetByLibraryBinding(form) {
  // `reset(b)` through TanStack Form's own `reset`: the next render of `useForm` puts its `defaultValues` back.
  const binding = useTanStackFormBinding(form);
  return { ...binding, reset: (next?: ContractInvoice) => form.reset(next) };
});

describe('the shared contract suite is not blind on TanStack Form', () => {
  const failing = async (use: UseContractForm) => {
    const failed: string[] = [];
    for (const check of CONTRACT_CHECKS) {
      try {
        await check.run(use);
      } catch {
        failed.push(check.name);
      }
    }
    return failed;
  };

  it("a binding that exposes TanStack Form's objects fails the identity rules", async () => {
    expect(await failing(useStateValues)).toEqual(
      expect.arrayContaining([
        'reset(b) makes baseline and values the object b itself, from the next render',
        'reset() makes values the current baseline object',
        'a save with no edit meanwhile: values and baseline become what the server stored (normalized), the form is clean',
      ]),
    );
  });

  it("a binding whose reset is TanStack Form's own fails the reset rules", async () => {
    expect(await failing(useResetByLibrary)).toEqual(expect.arrayContaining(['reset(b) makes baseline and values the object b itself, from the next render']));
  });
});

describe('useTanStackFormBinding: identity of the snapshots', () => {
  it('inline defaultValues (a new object at every render): renders that change no value keep both references', async () => {
    const harness = setupInvoiceForm({ defaults: () => ({ ...SAVED }) });
    const first = harness.last();
    harness.bump();
    harness.rerender({ defaults: () => ({ ...SAVED }) });
    harness.blur('Amount');
    expect(harness.current().form.state.fieldMeta.amount?.isBlurred).toBe(true);
    await act(async () => {
      await harness.current().form.validateAllFields('change');
    });
    // The meta of a field changes no snapshot: the form's component does not even render again; a render of its own
    // after the blur and the validation reads the same objects.
    harness.bump();
    expect(harness.commits.length).toBe(4);
    for (const commit of harness.commits) {
      expect(Object.is(commit.values, first.values)).toBe(true);
      expect(Object.is(commit.baseline, first.baseline)).toBe(true);
    }
    expect(first.values).toBe(first.baseline);
    harness.unmount();
  });

  it('inline defaultValues: an open conflict stays open across renders that change nothing (no rehydration)', () => {
    const harness = setupInvoiceForm({ defaults: () => ({ ...SAVED }) });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    const { baseline } = harness.current().binding;
    harness.bump();
    harness.rerender({ defaults: () => ({ ...SAVED }) });
    harness.blur('Notes');
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    harness.unmount();
  });

  it('binding.reset(x): the baseline is x itself, and a later edit never mutates x (deep-frozen, no TypeError)', () => {
    const harness = setupInvoiceForm();
    const x = Object.freeze({ supplier: 'Halden Tools', amount: '250', notes: 'frozen' });
    act(() => harness.current().binding.reset(x));
    expect(harness.current().binding.baseline).toBe(x);
    expect(harness.current().binding.values).toBe(x);
    expect(() => harness.type('Notes', 'edited')).not.toThrow();
    expect(x).toEqual({ supplier: 'Halden Tools', amount: '250', notes: 'frozen' });
    expect(harness.current().binding.baseline).toBe(x);
    expect(harness.current().binding.values).toEqual({ ...x, notes: 'edited' });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it('a nested field and an array item field: a new values object, the previous snapshot intact, the summary on the right path', () => {
    type Order = { supplier: { name: string; city: string }; lines: { sku: string; qty: string }[] };
    const deepFrozen = <T,>(value: T): T => {
      if (value && typeof value === 'object') {
        for (const child of Object.values(value)) deepFrozen(child);
        Object.freeze(value);
      }
      return value;
    };
    const saved: Order = deepFrozen({ supplier: { name: 'Lumen Parts', city: 'Turin' }, lines: [{ sku: 'A', qty: '1' }, { sku: 'B', qty: '2' }] });
    const seen: { values: Order; entries: string[] }[] = [];
    let form!: TanStackFormOf<Order>;
    function OrderForm() {
      form = useForm({ defaultValues: saved });
      const binding = useTanStackFormBinding(form);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: { lines: 'sku' } });
      seen.push({ values: binding.values, entries: entries.map((entry) => entry.path) });
      return (
        <form>
          <form.Field name="supplier.name">
            {(field) => <input aria-label="Supplier name" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}
          </form.Field>
          <form.Field name="lines[1].qty">
            {(field) => <input aria-label="Quantity 2" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}
          </form.Field>
        </form>
      );
    }
    const { getByLabelText, unmount } = render(<OrderForm />);
    const before = seen.at(-1)!.values;
    fireEvent.change(getByLabelText('Supplier name'), { target: { value: 'Lumen Parts Ltd' } });
    const afterName = seen.at(-1)!;
    expect(afterName.values).not.toBe(before);
    expect(afterName.values.supplier.name).toBe('Lumen Parts Ltd');
    expect(before.supplier.name).toBe('Lumen Parts');
    // The untouched array keeps its identity (structural sharing): only the path of the change is new.
    expect(afterName.values.lines).toBe(before.lines);
    expect(afterName.entries).toEqual(['supplier.name']);
    fireEvent.change(getByLabelText('Quantity 2'), { target: { value: '5' } });
    const afterQty = seen.at(-1)!;
    expect(afterQty.values).not.toBe(afterName.values);
    expect(afterName.values.lines[1]!.qty).toBe('2');
    expect(afterQty.values.lines[1]!.qty).toBe('5');
    expect(afterQty.entries).toEqual(['supplier.name', 'lines.1.qty']);
    expect(form.state.values.lines[1]!.qty).toBe('5');
    unmount();
  });

  it('an object passed to form.reset(data) and mutated by the app afterwards: the baseline does not change under the summary', () => {
    const data: Invoice = { supplier: 'Halden Tools', amount: '900', notes: '' };
    // `defaultValues` that follows the loaded record, as TanStack Form needs for `form.reset(data)` to stay.
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    act(() => {
      record = data;
      harness.current().form.reset(data);
    });
    const { baseline } = harness.current().binding;
    expect(baseline).toEqual(data);
    // TanStack Form keeps `data` itself as its values: the binding keeps copies.
    expect(baseline).not.toBe(data);
    data.amount = '1';
    harness.type('Notes', 'checked');
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(baseline.amount).toBe('900');
    harness.unmount();
  });
});

describe('useTanStackFormBinding: Change Summary against the saved baseline', () => {
  it("two edited fields give exactly two entries; one brought back drops its entry while TanStack Form's isDirty stays true", () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'Checked');
    expect(harness.current().entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([
      ['amount', '100', '120'],
      ['notes', '', 'Checked'],
    ]);
    harness.type('Notes', '');
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['amount']);
    // TanStack Form's "persistent" dirty: once changed, the field stays dirty (its isDefaultValue is true again).
    expect(harness.current().form.state.fieldMeta.notes?.isDirty).toBe(true);
    expect(harness.current().form.state.fieldMeta.notes?.isDefaultValue).toBe(true);
    harness.type('Amount', '100');
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().form.state.isDirty).toBe(true);
    // Brought back by hand: another object than the baseline (not a discard).
    expect(harness.current().binding.values).not.toBe(harness.current().binding.baseline);
    harness.unmount();
  });
});

describe('useTanStackFormBinding: the form object', () => {
  it('another form (another useForm) gets its own snapshots', () => {
    const other = { supplier: 'Other', amount: '1', notes: '' };
    const { result, rerender } = renderHook(
      ({ which }) => {
        const a = useForm({ defaultValues: SAVED });
        const b = useForm({ defaultValues: other });
        return useTanStackFormBinding(which === 'a' ? a : b);
      },
      { initialProps: { which: 'a' } },
    );
    expect(result.current.baseline).toEqual(SAVED);
    rerender({ which: 'b' });
    expect(result.current.baseline).toEqual(other);
    expect(result.current.values).toEqual(other);
  });

  it('unmount removes the subscription of the binding from the form store', () => {
    let form!: TanStackFormOf<Invoice>;
    function Bound({ bound }: { bound: TanStackFormOf<Invoice> }) {
      useFormRebase(useTanStackFormBinding(bound));
      return null;
    }
    function Host({ withBinding }: { withBinding: boolean }) {
      form = useForm({ defaultValues: SAVED });
      return withBinding ? <Bound bound={form} /> : null;
    }
    const view = render(<Host withBinding={false} />);
    // Every subscription made to the form store from now on (the binding's), until it is unsubscribed.
    const open = new Set<object>();
    const subscribe = form.store.subscribe.bind(form.store);
    vi.spyOn(form.store, 'subscribe').mockImplementation((listener: Parameters<typeof subscribe>[0]) => {
      const subscription = subscribe(listener);
      const token = {};
      open.add(token);
      return { unsubscribe: () => (open.delete(token), subscription.unsubscribe()) };
    });
    view.rerender(<Host withBinding />);
    expect(open.size).toBeGreaterThan(0);
    view.rerender(<Host withBinding={false} />);
    expect(open.size).toBe(0);
    view.unmount();
  });

  it('no save yet: saveError is null and isSaving false', () => {
    const { result } = renderHook(() => useTanStackFormBinding(useForm({ defaultValues: SAVED })));
    expect(result.current.saveError).toBeNull();
    expect(result.current.isSaving).toBe(false);
  });

  it('setValues with the values it already has keeps the values object; a patch the caller mutates later does not reach the snapshot', () => {
    const { result } = renderHook(() => useTanStackFormBinding(useForm({ defaultValues: { name: 'a', tags: ['x'] } })));
    act(() => result.current.setValues({ name: 'b' }));
    const values = result.current.values;
    act(() => result.current.setValues({ name: 'b', tags: ['x'] }));
    expect(result.current.values).toBe(values);
    const tags = ['y'];
    act(() => result.current.setValues({ tags }));
    tags.push('mutated by the caller');
    expect(result.current.values.tags).toEqual(['y']);
  });
});
