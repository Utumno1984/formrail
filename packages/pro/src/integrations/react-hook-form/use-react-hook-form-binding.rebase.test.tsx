// `useReactHookFormBinding` + `useFormRebase` (ticket #507) with a real React Hook Form: the rebase is applied with
// no false dirty and no echo, the conflicts resolve, the validation errors and the save follow the documented rules.
import { act } from '@testing-library/react';
import { Controller } from 'react-hook-form';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/rhf-harness';
import { deferred } from '../../../test/binding-contract';

describe('rebase without false dirty and without echo', () => {
  it('A edited, the server changes B: B takes the server value, A stays; dirty only on A; touched and submitCount kept', async () => {
    const harness = setupInvoiceForm();
    // One submit first, so `submitCount` is not 0.
    await act(() => harness.current().form.handleSubmit(() => undefined)());
    harness.type('Notes', 'Checked by me');
    harness.blur('Notes');
    expect(harness.current().form.formState.submitCount).toBe(1);
    expect(harness.current().form.formState.touchedFields).toEqual({ notes: true });
    const incoming: Invoice = { ...SAVED, supplier: 'Acme Corp Ltd' };
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase(incoming));
    const { form, binding, entries, rebase } = harness.current();
    expect(binding.baseline).toBe(incoming);
    expect(binding.values).toEqual({ supplier: 'Acme Corp Ltd', amount: '100', notes: 'Checked by me' });
    expect(form.getValues()).toEqual(binding.values);
    expect(harness.input('Supplier').value).toBe('Acme Corp Ltd');
    expect(harness.input('Notes').value).toBe('Checked by me');
    expect(form.formState.dirtyFields).toEqual({ notes: true });
    expect(form.formState.isDirty).toBe(true);
    expect(entries.map((entry) => entry.path)).toEqual(['notes']);
    expect(rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    expect(form.formState.touchedFields).toEqual({ notes: true });
    expect(form.formState.submitCount).toBe(1);
    const after = harness.commits.slice(from);
    expect(after.length).toBeGreaterThan(0);
    for (const commit of after) {
      expect(commit.values).not.toBe(incoming);
      expect(commit.values).not.toEqual(incoming);
      expect(commit.dom.notes).toBe('Checked by me');
      expect(commit.isDirty).toBe(true);
    }
    harness.unmount();
  });

  it('the server changes A too, to another value: a conflict, the input keeps the user value; keepMine closes it, dirty only on A', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150', supplier: 'Acme Corp Ltd' }));
    expect(harness.current().rebase.conflicts.map((conflict) => [conflict.path, conflict.mine, conflict.theirs])).toEqual([['amount', '120', '150']]);
    expect(harness.input('Amount').value).toBe('120');
    expect(harness.commits.slice(from).every((commit) => commit.dom.amount === '120')).toBe(true);
    act(() => harness.current().rebase.keepMine('amount'));
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().form.formState.dirtyFields).toEqual({ amount: true });
    expect(harness.current().entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([['amount', '150', '120']]);
    harness.unmount();
  });

  it('acceptTheirs: the server value, A no longer in dirtyFields and no entry', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'mine');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    act(() => harness.current().rebase.acceptTheirs('amount'));
    expect(harness.input('Amount').value).toBe('150');
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().form.formState.dirtyFields).toEqual({ notes: true });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    expect(harness.current().form.getValues()).toEqual({ ...SAVED, amount: '150', notes: 'mine' });
    harness.unmount();
  });

  it('a clean form takes the incoming values: still clean, no entry, no dirty render in between', () => {
    const harness = setupInvoiceForm();
    const incoming: Invoice = { supplier: 'Acme Corp Ltd', amount: '130', notes: 'from the server' };
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase(incoming));
    expect(harness.current().form.formState.isDirty).toBe(false);
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().binding.values).toEqual(incoming);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.input('Notes').value).toBe('from the server');
    expect(harness.commits.slice(from).every((commit) => !commit.isDirty && commit.entries.length === 0)).toBe(true);
    harness.unmount();
  });

  it('incoming equal to the current baseline (the same object): nothing happens', () => {
    const harness = setupInvoiceForm();
    harness.type('Notes', 'mine');
    const { baseline, values } = harness.current().binding;
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase(baseline));
    expect(harness.commits.length).toBe(from);
    expect(harness.current().binding.values).toBe(values);
    expect(harness.current().binding.baseline).toBe(baseline);
    harness.unmount();
  });

  it("a consumer's watch / subscribe callbacks and a Controller's onChange see no change event (hydration and rebase)", () => {
    const controllerChange = vi.fn();
    const harness = setupInvoiceForm({
      extra: (form) => (
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <textarea
              aria-label="Notes (controlled)"
              value={field.value}
              onBlur={field.onBlur}
              onChange={(event) => {
                controllerChange(event.target.value);
                field.onChange(event);
              }}
            />
          )}
        />
      ),
    });
    const types: unknown[] = [];
    const watched = harness.current().form.watch((_values, info) => types.push(info.type));
    const stop = harness.current().form.subscribe({ formState: { values: true }, callback: (state) => types.push(state.type) });
    act(() => harness.current().form.reset({ ...SAVED, notes: 'hydrated' }));
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Server', notes: 'hydrated' }));
    harness.type('Amount', '1');
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Server 2', notes: 'from the server' }));
    expect(harness.current().form.getValues()).toEqual({ supplier: 'Server 2', amount: '1', notes: 'from the server' });
    // The user's keystroke is the only change event.
    expect(types.filter((type) => type === 'change')).toEqual(['change', 'change']);
    expect(controllerChange).not.toHaveBeenCalled();
    watched.unsubscribe();
    stop();
    harness.unmount();
  });
});

describe('validation errors during a rebase', () => {
  it('the errors of the fields the rebase does not change stay; the field that takes the server value loses its error', async () => {
    // Rules on two fields: the user's `amount` (cleared) and the saved, empty `supplier`.
    const harness = setupInvoiceForm({
      useFormProps: { defaultValues: { ...SAVED, supplier: '' } },
      rules: { amount: { required: 'Amount is required' }, supplier: { required: 'Supplier is required' } },
    });
    harness.type('Amount', '');
    harness.type('Notes', 'mine');
    await act(() => harness.current().form.handleSubmit(() => undefined)());
    expect(Object.keys(harness.current().form.formState.errors).sort()).toEqual(['amount', 'supplier']);
    act(() => harness.current().rebase.rebase({ supplier: 'Acme Corp', amount: '100', notes: '' }));
    const { errors } = harness.current().form.formState;
    // `amount` and `notes` keep the user's value: the error of `amount` stays. `supplier` took the server value.
    expect(Object.keys(errors)).toEqual(['amount']);
    expect(errors.amount?.message).toBe('Amount is required');
    expect(harness.current().form.getValues()).toEqual({ supplier: 'Acme Corp', amount: '', notes: 'mine' });
    harness.unmount();
  });

  it('acceptTheirs on a field with an error removes the error; keepMine keeps it', async () => {
    const harness = setupInvoiceForm({
      rules: { amount: { validate: (value) => value !== '0' || 'Not zero' }, notes: { validate: (value) => value !== 'x' || 'Not x' } },
    });
    harness.type('Amount', '0');
    harness.type('Notes', 'x');
    await act(() => harness.current().form.trigger());
    expect(Object.keys(harness.current().form.formState.errors).sort()).toEqual(['amount', 'notes']);
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150', notes: 'theirs' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount', 'notes']);
    act(() => harness.current().rebase.acceptTheirs('amount'));
    act(() => harness.current().rebase.keepMine('notes'));
    expect(Object.keys(harness.current().form.formState.errors)).toEqual(['notes']);
    harness.unmount();
  });
});

describe('save through handleSubmit', () => {
  it('a rebase during the submit is queued, then merged against the baseline the handler set with binding.reset(saved)', async () => {
    const harness = setupInvoiceForm();
    harness.type('Notes', 'mine');
    const gate = deferred();
    const stored: Invoice = { ...SAVED, notes: 'mine', amount: '100.00' };
    let submit!: Promise<void>;
    act(() => {
      submit = harness.current().form.handleSubmit(async () => {
        await gate.promise;
        harness.current().binding.reset(stored);
      })();
    });
    await act(async () => undefined);
    expect(harness.current().binding.isSaving).toBe(true);
    const incoming: Invoice = { ...stored, supplier: 'Acme Corp Ltd' };
    act(() => harness.current().rebase.rebase(incoming));
    expect(harness.current().rebase.isPending).toBe(true);
    expect(harness.input('Supplier').value).toBe('Acme Corp');
    await act(async () => {
      gate.resolve();
      await submit;
    });
    expect(harness.current().binding.isSaving).toBe(false);
    expect(harness.current().rebase.isPending).toBe(false);
    // Merged against `stored`: the user's notes were saved, so nothing is left dirty.
    expect(harness.current().binding.baseline).toBe(incoming);
    expect(harness.current().binding.values).toEqual(incoming);
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().form.formState.isDirty).toBe(false);
    harness.unmount();
  });

  /** A conflict on `amount`, then a submit whose handler resolves or rejects. */
  async function conflictThenSubmit(outcome: 'resolve' | 'reject') {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    const gate = deferred();
    let submit!: Promise<void>;
    act(() => {
      submit = harness.current().form.handleSubmit(() => gate.promise)().catch(() => undefined);
    });
    await act(async () => undefined);
    expect(harness.current().binding.isSaving).toBe(true);
    await act(async () => {
      if (outcome === 'reject') gate.reject(new Error('offline'));
      else gate.resolve();
      await submit;
    });
    expect(harness.current().binding.isSaving).toBe(false);
    return harness;
  }

  it('a handler that resolves closes the conflicts', async () => {
    const harness = await conflictThenSubmit('resolve');
    expect(harness.current().binding.saveError).toBeNull();
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.input('Amount').value).toBe('120');
    harness.unmount();
  });

  it('a handler that rejects leaves the conflicts open', async () => {
    const harness = await conflictThenSubmit('reject');
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(harness.input('Amount').value).toBe('120');
    harness.unmount();
  });

  it('a submit blocked by validation leaves the conflicts open and applies a rebase queued meanwhile', async () => {
    // An asynchronous rule, so the submit stays in flight long enough for a server update to come.
    const harness = setupInvoiceForm({ rules: { notes: { validate: async (value) => (await Promise.resolve(value !== '')) || 'Notes are required' } } });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    expect(harness.current().rebase.conflicts.map((conflict) => [conflict.path, conflict.theirs])).toEqual([['amount', '150']]);
    let submit!: Promise<void>;
    act(() => {
      submit = harness.current().form.handleSubmit(() => undefined)();
    });
    expect(harness.current().binding.isSaving).toBe(true);
    // The server changes `amount` again and `supplier`: queued until the submit ends.
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '160', supplier: 'Queued Ltd' }));
    expect(harness.current().rebase.isPending).toBe(true);
    await act(() => submit);
    expect(harness.current().form.formState.errors.notes?.message).toBe('Notes are required');
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().rebase.isPending).toBe(false);
    expect(harness.current().form.getValues('supplier')).toBe('Queued Ltd');
    // Still in conflict, now with the queued version.
    expect(harness.current().rebase.conflicts.map((conflict) => [conflict.path, conflict.theirs])).toEqual([['amount', '160']]);
    expect(harness.input('Amount').value).toBe('120');
    expect(harness.current().form.formState.errors.notes?.message).toBe('Notes are required');
    harness.unmount();
  });

  it('a submit blocked by validation, with no server update meanwhile, leaves the conflicts open', async () => {
    const harness = setupInvoiceForm({ rules: { notes: { required: 'Notes are required' } } });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    await act(() => harness.current().form.handleSubmit(() => undefined)());
    expect(harness.current().form.formState.submitCount).toBe(1);
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    harness.unmount();
  });
});

describe('isSaving / saveError from the options (a save of your own)', () => {
  it('they replace the mapping of handleSubmit: a rebase is queued while isSaving, and saveError null closes the conflicts', () => {
    const harness = setupInvoiceForm({ binding: { isSaving: false, saveError: null } });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    expect(harness.current().rebase.conflicts).toHaveLength(1);
    act(() => harness.rerender({ binding: { isSaving: true, saveError: null } }));
    expect(harness.current().binding.isSaving).toBe(true);
    expect(harness.current().form.formState.isSubmitting).toBe(false);
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '160', notes: 'queued' }));
    expect(harness.current().rebase.isPending).toBe(true);
    // A failure of the external save: conflicts stay open, the queued rebase lands.
    act(() => harness.rerender({ binding: { isSaving: false, saveError: new Error('409') } }));
    expect(harness.current().rebase.isPending).toBe(false);
    expect(harness.current().form.getValues('notes')).toBe('queued');
    expect(harness.current().rebase.conflicts).toHaveLength(1);
    // A success: conflicts closed.
    act(() => harness.rerender({ binding: { isSaving: true, saveError: null } }));
    act(() => harness.rerender({ binding: { isSaving: false, saveError: null } }));
    expect(harness.current().rebase.conflicts).toEqual([]);
    harness.unmount();
  });

  it('a failed handleSubmit does not leak into saveError when the option says null', async () => {
    const harness = setupInvoiceForm({ binding: { saveError: null } });
    await act(() => harness.current().form.handleSubmit(() => Promise.reject(new Error('x')))().catch(() => undefined));
    expect(harness.current().form.formState.isSubmitSuccessful).toBe(false);
    expect(harness.current().binding.saveError).toBeNull();
    harness.unmount();
  });
});
