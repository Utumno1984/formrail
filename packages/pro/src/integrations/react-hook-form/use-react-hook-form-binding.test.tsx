// `useReactHookFormBinding` (ticket #507) with a real React Hook Form: the contract of `RebaseFormBinding`, the
// identity of the snapshots, the Change Summary against the saved baseline, the hydration after the mount.
import { useEffect, type ReactElement } from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type RebaseFormBinding } from '../../engine';
import { CONTRACT_CHECKS, deferred, type ContractForm, type ContractInvoice, type UseContractForm } from '../../../test/binding-contract';
import { EMPTY, SAVED, setupInvoiceForm, type Invoice } from '../../../test/rhf-harness';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

/** The contract harness on a React Hook Form form, with `toBinding` turning the form into the binding under test. */
function contractForm(toBinding: (form: UseFormReturn<ContractInvoice>) => RebaseFormBinding<ContractInvoice>): UseContractForm {
  return function useContractForm(initial: ContractInvoice): ContractForm {
    const form = useForm<ContractInvoice>({ defaultValues: initial });
    const binding = toBinding(form);
    return {
      binding,
      editName: (name) => form.setValue('name', name, { shouldDirty: true, shouldTouch: true }),
      editCity: (city) => form.setValue('supplier.city', city, { shouldDirty: true, shouldTouch: true }),
      // What React Hook Form's own validation does on a change (`mode: 'onChange'`, or `reValidateMode` after a submit).
      showValidationError: () => form.setError('name', { type: 'validate', message: 'Invalid name' }),
      startSave: (respond) => {
        const gate = deferred();
        // The documented pattern: `binding.reset(stored)` inside the handler, before it resolves.
        const done = form
          .handleSubmit(async (sent) => {
            await gate.promise;
            if (respond) binding.reset(respond(sent));
          })()
          .catch(() => undefined);
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
  return useReactHookFormBinding(form);
});

describe('useReactHookFormBinding: the RebaseFormBinding contract (shared suite)', () => {
  it.each(CONTRACT_CHECKS.map((check) => [check.name, check] as const))('%s', async (_name, check) => {
    await check.run(useAdapter);
  });
});

// Two bindings written the naive way, each breaking one rule: the shared suite must fail on them.
const useCloneBaseline = contractForm(function useCloneBaselineBinding(form) {
  // React Hook Form's own copy of the defaults as the baseline: never the object passed to `reset`.
  return { ...useReactHookFormBinding(form), baseline: form.control._defaultValues as ContractInvoice };
});
const useGetValues = contractForm(function useGetValuesBinding(form) {
  // `getValues()` read at each render, no snapshot: a shallow copy whose nested objects React Hook Form mutates.
  return { ...useReactHookFormBinding(form), values: form.getValues() };
});

describe('the shared contract suite is not blind', () => {
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

  it('a binding that exposes the clone of React Hook Form as baseline fails the reset rules', async () => {
    expect(await failing(useCloneBaseline)).toEqual([
      'reset(b) makes baseline and values the object b itself, from the next render',
      'reset() makes values the current baseline object',
      'setValues(patch) right after reset(b) in the same batch applies on top of it, with no render of the reset alone',
      // The engine tells its own rebase by the identity of the baseline: with a copy, the conflict closes at once.
      'acceptTheirs during a save keeps the save in flight, the accepted value and an edit made after it',
    ]);
  });

  it('a binding that reads getValues() without a snapshot fails the snapshot rules', async () => {
    expect(await failing(useGetValues)).toEqual(
      expect.arrayContaining([
        'snapshots are never mutated in place (edits, reset, setValues)',
        'values is a new object when the content changes, the same object across renders that change nothing',
      ]),
    );
  });
});

describe('useReactHookFormBinding: identity of the snapshots', () => {
  it('renders that change no value keep both references: parent state, focus/blur (touchedFields), trigger()', async () => {
    const harness = setupInvoiceForm();
    const first = harness.last();
    harness.rerender();
    harness.blur('Amount');
    expect(harness.current().form.formState.touchedFields).toEqual({ amount: true });
    await act(async () => {
      await harness.current().form.trigger();
    });
    expect(harness.commits.length).toBeGreaterThanOrEqual(3);
    for (const commit of harness.commits) {
      expect(Object.is(commit.values, first.values)).toBe(true);
      expect(Object.is(commit.baseline, first.baseline)).toBe(true);
    }
    expect(first.values).toBe(first.baseline);
    harness.unmount();
  });

  it('binding.reset(x): the baseline is x itself, and a later edit never mutates x (deep-frozen, no TypeError)', () => {
    const harness = setupInvoiceForm();
    const x = Object.freeze({ supplier: 'Rossi Ltd', amount: '250', notes: 'frozen' });
    act(() => harness.current().binding.reset(x));
    expect(harness.current().binding.baseline).toBe(x);
    expect(harness.current().binding.values).toBe(x);
    expect(() => harness.type('Notes', 'edited')).not.toThrow();
    expect(x).toEqual({ supplier: 'Rossi Ltd', amount: '250', notes: 'frozen' });
    expect(harness.current().binding.baseline).toBe(x);
    expect(harness.current().binding.values).toEqual({ ...x, notes: 'edited' });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it('a nested field and an array item field: a new values object, the previous snapshot intact, the summary on the right path', () => {
    type Order = { supplier: { name: string; city: string }; lines: { sku: string; qty: string }[] };
    const saved: Order = { supplier: { name: 'Acme', city: 'Turin' }, lines: [{ sku: 'A', qty: '1' }, { sku: 'B', qty: '2' }] };
    const deepFrozen = <T,>(value: T): T => {
      if (value && typeof value === 'object') {
        for (const child of Object.values(value)) deepFrozen(child);
        Object.freeze(value);
      }
      return value;
    };
    deepFrozen(saved);
    const seen: { values: Order; entries: string[] }[] = [];
    let form!: UseFormReturn<Order>;
    function OrderForm() {
      form = useForm<Order>({ defaultValues: saved });
      const binding = useReactHookFormBinding(form);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: { lines: 'sku' } });
      seen.push({ values: binding.values, entries: entries.map((entry) => entry.path) });
      return (
        <form>
          <input aria-label="Supplier name" {...form.register('supplier.name')} />
          <input aria-label="Quantity 2" {...form.register('lines.1.qty')} />
        </form>
      );
    }
    const { getByLabelText, unmount } = renderForm(<OrderForm />);
    const before = seen.at(-1)!.values;
    fireInput(getByLabelText('Supplier name'), 'Acme Ltd');
    const afterName = seen.at(-1)!;
    expect(afterName.values).not.toBe(before);
    expect(afterName.values.supplier.name).toBe('Acme Ltd');
    expect(before.supplier.name).toBe('Acme');
    // The untouched array keeps its identity (structural sharing): only the path of the change is new.
    expect(afterName.values.lines).toBe(before.lines);
    expect(afterName.entries).toEqual(['supplier.name']);
    fireInput(getByLabelText('Quantity 2'), '5');
    const afterQty = seen.at(-1)!;
    expect(afterQty.values).not.toBe(afterName.values);
    expect(afterName.values.lines[1]!.qty).toBe('2');
    expect(afterQty.values.lines[1]!.qty).toBe('5');
    expect(afterQty.entries).toEqual(['supplier.name', 'lines.1.qty']);
    expect(form.getValues('lines.1.qty')).toBe('5');
    unmount();
  });
});

describe('useReactHookFormBinding: Change Summary against the saved baseline', () => {
  it('two edited fields give exactly two entries; one brought back to the saved value drops its entry', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'Checked');
    expect(harness.current().entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([
      ['amount', '100', '120'],
      ['notes', '', 'Checked'],
    ]);
    harness.type('Notes', '');
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['amount']);
    // Brought back by hand: another object than the baseline (not a discard).
    harness.type('Amount', '100');
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().binding.values).not.toBe(harness.current().binding.baseline);
    harness.unmount();
  });
});

describe('useReactHookFormBinding: baseline and values, finer rules (mutation testing of #507)', () => {
  it('no save yet: saveError is null', () => {
    const harness = setupInvoiceForm();
    expect(harness.current().binding.saveError).toBeNull();
    expect(harness.current().binding.isSaving).toBe(false);
    harness.unmount();
  });

  it('resetDefaultValues(current values): a new baseline with the content of the values, and values is that baseline', () => {
    const harness = setupInvoiceForm();
    harness.type('Notes', 'kept');
    const before = harness.current().binding.baseline;
    act(() => harness.current().form.resetDefaultValues(harness.current().form.getValues()));
    expect(harness.current().binding.baseline).not.toBe(before);
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, notes: 'kept' });
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it("the defaults object of React Hook Form changed in place (as its internals do for some late fields) is not a new baseline", () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    const { baseline } = harness.current().binding;
    // `useController` with `shouldUnregister` writes into `control._defaultValues` with `set(...)`, same object.
    act(() => {
      (harness.current().form.control._defaultValues as Record<string, unknown>).notes = 'written in place';
      harness.rerender();
    });
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    harness.unmount();
  });

  it('setValues with the values it already has keeps the values object; a patch the caller mutates later does not reach the snapshot', () => {
    const { result } = renderHook(() => useReactHookFormBinding(useForm<{ name: string; tags: string[] }>({ defaultValues: { name: 'a', tags: ['x'] } })));
    act(() => result.current.setValues({ name: 'b' }));
    const values = result.current.values;
    act(() => result.current.setValues({ name: 'b', tags: ['x'] }));
    expect(result.current.values).toBe(values);
    const tags = ['y'];
    act(() => result.current.setValues({ tags }));
    tags.push('mutated by the caller');
    expect(result.current.values.tags).toEqual(['y']);
  });

  it('a value set by a child in a passive effect at mount (before the binding subscribes) is in the snapshot', () => {
    function Child({ form }: { form: UseFormReturn<Invoice> }) {
      useEffect(() => form.setValue('notes', 'from a child effect'), [form]);
      return null;
    }
    const errors = vi.spyOn(console, 'error');
    const harness = setupInvoiceForm({ extra: (form) => <Child form={form} /> });
    expect(harness.current().form.getValues('notes')).toBe('from a child effect');
    expect(harness.current().binding.values.notes).toBe('from a child effect');
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    harness.unmount();
  });

  it('a rebase never writes the server value into the input the user edited, not even for a moment (caret kept)', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'mine');
    const input = harness.input('Amount');
    const written: string[] = [];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => setter.get!.call(input) as string,
      set: (value: string) => {
        written.push(value);
        setter.set!.call(input, value);
      },
    });
    input.focus();
    input.setSelectionRange(1, 1);
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Server', amount: '150', notes: '' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(written.filter((value) => value !== '120')).toEqual([]);
    expect(input.value).toBe('120');
    expect(input.selectionStart).toBe(1);
    expect(harness.input('Supplier').value).toBe('Server');
    harness.unmount();
  });
});

describe("useReactHookFormBinding: React Hook Form's own form.reset() (Discard)", () => {
  it('is a discard: values become the baseline object, the summary is empty, the rebase state is cleared', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'mine');
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Server', amount: '150' }));
    expect(harness.current().rebase.conflicts).toHaveLength(1);
    const { baseline } = harness.current().binding;
    act(() => harness.current().form.reset());
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(harness.current().binding.values).toBe(baseline);
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().rebase.applied).toEqual([]);
    expect(harness.input('Amount').value).toBe('150');
    harness.unmount();
  });
});

describe('useReactHookFormBinding: hydration after the mount', () => {
  const DATA: Invoice = { supplier: 'Rossi Construction', amount: '1200', notes: 'Net 30' };

  /** A form mounted empty, with a consumer's `watch` and `subscribe` callbacks recording the event types. */
  function mountedEmpty(useFormProps = { defaultValues: EMPTY }) {
    const harness = setupInvoiceForm({ useFormProps });
    const types: unknown[] = [];
    const watched = harness.current().form.watch((_values, info) => types.push(info.type));
    const unsubscribe = harness.current().form.subscribe({ formState: { values: true }, callback: (state) => types.push(state.type) });
    return { harness, types, stop: () => (watched.unsubscribe(), unsubscribe()) };
  }

  it('form.reset(data): not dirty, no entry in any committed render, no change event', () => {
    const { harness, types, stop } = mountedEmpty();
    const from = harness.commits.length;
    act(() => harness.current().form.reset(DATA));
    expect(harness.current().form.formState.isDirty).toBe(false);
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().binding.baseline).toEqual(DATA);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.commits.slice(from).length).toBeGreaterThan(0);
    expect(harness.commits.every((commit) => commit.entries.length === 0 && !commit.isDirty)).toBe(true);
    expect(harness.input('Supplier').value).toBe('Rossi Construction');
    expect(types.length).toBeGreaterThan(0);
    expect(types).not.toContain('change');
    stop();
    harness.unmount();
  });

  it('the `values` prop that arrives after the mount: the same', () => {
    const { harness, types, stop } = mountedEmpty();
    const from = harness.commits.length;
    act(() => harness.rerender({ useFormProps: { defaultValues: EMPTY, values: DATA } }));
    expect(harness.current().form.formState.isDirty).toBe(false);
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().binding.baseline).toEqual(DATA);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.commits.slice(from).length).toBeGreaterThan(0);
    expect(harness.commits.every((commit) => commit.entries.length === 0 && !commit.isDirty)).toBe(true);
    expect(harness.input('Amount').value).toBe('1200');
    expect(types).not.toContain('change');
    stop();
    harness.unmount();
  });

  it.each([
    ['form.reset(data)', (harness: ReturnType<typeof setupInvoiceForm>, data: Invoice) => harness.current().form.reset(data)],
    ['the values prop', (harness: ReturnType<typeof setupInvoiceForm>, data: Invoice) => harness.rerender({ useFormProps: { defaultValues: EMPTY, values: data } })],
  ])('%s is a rehydration for useFormRebase: open conflicts and applied cleared, the rebase not applied again', (_label, hydrate) => {
    const { harness, stop } = mountedEmpty();
    act(() => hydrate(harness, DATA));
    harness.type('Amount', '1300');
    act(() => harness.current().rebase.rebase({ ...DATA, supplier: 'Rossi Ltd', amount: '1500' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(harness.current().rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    const reload: Invoice = { supplier: 'Bianchi', amount: '900', notes: '' };
    const from = harness.commits.length;
    act(() => hydrate(harness, reload));
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().rebase.applied).toEqual([]);
    expect(harness.current().binding.values).toEqual(reload);
    expect(harness.current().binding.baseline).toEqual(reload);
    expect(harness.current().form.getValues()).toEqual(reload);
    // The commits before the reload show the user's edit against the old baseline; none shows the new baseline
    // with an entry.
    const reloaded = harness.commits.slice(from).filter((commit) => commit.baseline.supplier === 'Bianchi');
    expect(reloaded.length).toBeGreaterThan(0);
    expect(reloaded.every((commit) => commit.entries.length === 0 && commit.values === commit.baseline)).toBe(true);
    stop();
    harness.unmount();
  });

  it('the values prop changes while the user has edits: entries against the defaults React Hook Form holds then', () => {
    // React Hook Form's default: the new `values` replace the edits (defaults and values are the new data).
    const replaced = setupInvoiceForm({ useFormProps: { values: SAVED } });
    replaced.type('Notes', 'mine');
    expect(replaced.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    const next: Invoice = { ...SAVED, amount: '130' };
    act(() => replaced.rerender({ useFormProps: { values: next } }));
    expect(replaced.current().binding.baseline).toEqual(next);
    expect(replaced.current().binding.values).toEqual(next);
    expect(replaced.current().entries).toEqual([]);
    replaced.unmount();

    // With `resetOptions: { keepDirtyValues: true }` the edits stay, against the new defaults.
    const kept = setupInvoiceForm({ useFormProps: { values: SAVED, resetOptions: { keepDirtyValues: true } } });
    kept.type('Notes', 'mine');
    act(() => kept.rerender({ useFormProps: { values: next, resetOptions: { keepDirtyValues: true } } }));
    expect(kept.current().binding.baseline).toEqual(next);
    expect(kept.current().binding.values).toEqual({ ...next, notes: 'mine' });
    expect(kept.current().entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([['notes', '', 'mine']]);
    kept.unmount();
  });

  it('async defaultValues (QA #507, point 2): while loading the form is hydrating, never edited; then the defaults arrive as a rehydration', async () => {
    let resolve!: (data: Invoice) => void;
    const loading = new Promise<Invoice>((done) => (resolve = done));
    const harness = setupInvoiceForm({ useFormProps: { defaultValues: () => loading } });
    const types: unknown[] = [];
    const watched = harness.current().form.watch((_values, info) => types.push(info.type));
    // Committed renders while loading: React Hook Form has no defaults yet (`{}`), the inputs wrote their `''`.
    expect(harness.current().form.formState.isLoading).toBe(true);
    expect(harness.current().form.getValues()).toEqual(EMPTY);
    const whileLoading = harness.commits.length;
    expect(whileLoading).toBeGreaterThan(0);
    for (const commit of harness.commits) {
      expect(commit.entries).toEqual([]);
      expect(commit.values).toBe(commit.baseline);
      expect(commit.isDirty).toBe(false);
    }
    // A rerender while loading (a parent's state): still nothing.
    harness.rerender({ useFormProps: { defaultValues: () => loading } });
    expect(harness.last().entries).toEqual([]);

    await act(async () => {
      resolve(DATA);
      await loading;
    });
    expect(harness.current().form.formState.isLoading).toBe(false);
    const { binding, entries, form } = harness.current();
    expect(binding.baseline).toEqual(DATA);
    expect(binding.values).toBe(binding.baseline);
    expect(entries).toEqual([]);
    expect(form.formState.isDirty).toBe(false);
    expect(harness.input('Supplier').value).toBe('Rossi Construction');
    for (const commit of harness.commits) expect(commit.entries).toEqual([]);
    expect(harness.commits.slice(whileLoading).some((commit) => commit.baseline.supplier === 'Rossi Construction')).toBe(true);
    expect(types).not.toContain('change');

    // After the load the form behaves as usual: an edit is an entry, a rebase keeps it.
    harness.type('Amount', '1300');
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['amount']);
    act(() => harness.current().rebase.rebase({ ...DATA, supplier: 'Rossi Ltd' }));
    expect(harness.current().binding.values).toEqual({ ...DATA, supplier: 'Rossi Ltd', amount: '1300' });
    expect(harness.current().rebase.conflicts).toEqual([]);
    watched.unsubscribe();
    harness.unmount();
  });
});

describe('useReactHookFormBinding: the form object', () => {
  it('one store per control: the object of useFormContext() changes identity with the form state, the snapshots do not', () => {
    const { result, rerender } = renderHook(() => {
      const form = useForm<Invoice>({ defaultValues: SAVED });
      // A copy of the form object at every render, as `useFormContext()` gives when the form state changes.
      const binding = useReactHookFormBinding({ ...form });
      return { form, binding };
    });
    const first = result.current.binding;
    rerender();
    expect(result.current.binding.values).toBe(first.values);
    expect(result.current.binding.baseline).toBe(first.baseline);
    expect(result.current.binding.reset).toBe(first.reset);
    act(() => result.current.form.setValue('notes', 'x'));
    expect(result.current.binding.values).toEqual({ ...SAVED, notes: 'x' });
  });

  it('another form (another control) gets its own snapshots', () => {
    const other = { supplier: 'Other', amount: '1', notes: '' };
    const { result, rerender } = renderHook(({ which }) => {
      const a = useForm<Invoice>({ defaultValues: SAVED });
      const b = useForm<Invoice>({ defaultValues: other });
      return useReactHookFormBinding(which === 'a' ? a : b);
    }, { initialProps: { which: 'a' } });
    expect(result.current.baseline).toEqual(SAVED);
    rerender({ which: 'b' });
    expect(result.current.baseline).toEqual(other);
    expect(result.current.values).toEqual(other);
  });

  it('unmount removes the subscription of the binding from the form', () => {
    let control!: UseFormReturn<Invoice>['control'];
    const { unmount } = renderHook(() => {
      const form = useForm<Invoice>({ defaultValues: SAVED });
      control = form.control;
      const binding = useReactHookFormBinding(form);
      useFormRebase(binding);
      return binding;
    });
    const subject = control._subjects.state as unknown as { observers: unknown[] };
    const mounted = subject.observers.length;
    unmount();
    // The binding's `watch` subscription and useForm's own are gone.
    expect(subject.observers.length).toBeLessThan(mounted);
    expect(subject.observers.length).toBe(1);
  });
});

function renderForm(element: ReactElement) {
  return render(element);
}

function fireInput(element: HTMLElement, value: string) {
  fireEvent.input(element, { target: { value } });
}
