// `useTanStackFormBinding` (ticket #508), saving: `form.handleSubmit()` mapped on `isSaving` / `saveError`, a rebase
// queued during the submit and merged against what `onSubmit` saved (`binding.reset(saved)`), the conflicts after a
// submit that resolves, rejects or is blocked by validation, the explicit options.
import { act } from '@testing-library/react';
import { deferred } from '../../../test/binding-contract';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/tanstack-harness';

const STORED: Invoice = { ...SAVED, amount: '120' };

/** A form whose `onSubmit` waits for `gate`, then (when it resolves) makes `stored(value)` the baseline. */
function savingForm(options: { stored?: (sent: Invoice) => Invoice; validate?: (name: keyof Invoice, value: string) => string | undefined } = {}) {
  let gate = deferred();
  const harness = setupInvoiceForm({
    validate: options.validate,
    onSubmit: async (value, binding) => {
      await gate.promise;
      binding.reset((options.stored ?? ((sent) => structuredClone(sent)))(value));
    },
  });
  let done: Promise<void> = Promise.resolve();
  return {
    harness,
    submit: async () => {
      await act(async () => {
        done = harness.current().form.handleSubmit().catch(() => undefined);
      });
    },
    settle: async (error: unknown) => {
      await act(async () => {
        if (error === null) gate.resolve();
        else gate.reject(error);
        await done;
      });
      gate = deferred();
    },
  };
}

describe('a server update during form.handleSubmit()', () => {
  it('is queued (isPending) while isSubmitting, then merged against what onSubmit saved with binding.reset(saved)', async () => {
    const { harness, submit, settle } = savingForm();
    harness.type('Amount', '120');
    await submit();
    expect(harness.current().form.state.isSubmitting).toBe(true);
    expect(harness.current().binding.isSaving).toBe(true);
    // The record after the save, changed again by someone else.
    const server: Invoice = { ...STORED, supplier: 'Lumen Parts Group' };
    act(() => harness.current().rebase.rebase(server));
    expect(harness.current().rebase.isPending).toBe(true);
    // Nothing applied yet; the user keeps typing.
    expect(harness.input('Supplier').value).toBe('Lumen Parts');
    harness.type('Notes', 'typed during the save');
    await settle(null);
    const { binding, rebase, entries, form } = harness.current();
    expect(binding.isSaving).toBe(false);
    expect(binding.saveError).toBeNull();
    expect(rebase.isPending).toBe(false);
    // Against the saved record (amount 120, sent before the notes): the server's supplier applied, the amount saved,
    // the notes typed during the save still the user's edit; no conflict.
    expect(binding.baseline).toBe(server);
    expect(binding.values).toEqual({ ...server, notes: 'typed during the save' });
    expect(form.state.values).toEqual(binding.values);
    expect(rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    expect(rebase.conflicts).toEqual([]);
    expect(entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it('an onSubmit that resolves closes the open conflicts', async () => {
    const { harness, submit, settle } = savingForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    expect(harness.current().rebase.conflicts).toHaveLength(1);
    await submit();
    await settle(null);
    expect(harness.current().binding.saveError).toBeNull();
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it('an onSubmit that rejects leaves them open, saveError not null', async () => {
    const { harness, submit, settle } = savingForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    await submit();
    await settle(new Error('503 from the server'));
    const { binding, rebase } = harness.current();
    expect(binding.isSaving).toBe(false);
    expect(binding.saveError).not.toBeNull();
    expect(rebase.conflicts.map((conflict) => [conflict.path, conflict.mine, conflict.theirs])).toEqual([['amount', '120', '150']]);
    expect(binding.baseline).toEqual({ ...SAVED, amount: '150' });
    harness.unmount();
  });

  it('a rebase queued during an onSubmit that rejects is applied when it settles, against the unchanged baseline', async () => {
    const { harness, submit, settle } = savingForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    await submit();
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '160', notes: 'from the server' }));
    expect(harness.current().rebase.isPending).toBe(true);
    await settle(new Error('503 from the server'));
    const { binding, rebase } = harness.current();
    expect(rebase.isPending).toBe(false);
    // A new rebase recomputes the conflicts against its incoming: amount still differs on both sides.
    expect(rebase.conflicts.map((conflict) => [conflict.path, conflict.mine, conflict.theirs])).toEqual([['amount', '120', '160']]);
    expect(binding.values).toEqual({ ...SAVED, amount: '120', notes: 'from the server' });
    harness.unmount();
  });

  it('a submit blocked by validation leaves the conflicts open and applies the queued rebase; saveError not null', async () => {
    const { harness, submit } = savingForm({ validate: (name, value) => (name === 'notes' && value === 'bad' ? 'Notes is bad' : undefined) });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    // An error that only the submit sees: the field validates on submit after the change validator passed.
    harness.type('Notes', 'bad');
    expect(harness.current().form.state.canSubmit).toBe(false);
    // The first attempt with an invalid touched form is refused before `isSubmitting` (TanStack Form's canSubmit):
    // nothing is in flight, saveError is not null, the conflict stays.
    await submit();
    expect(harness.current().binding.isSaving).toBe(false);
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    // The next attempt runs the validation in flight (`isSubmitting`): a rebase queued meanwhile is applied when the
    // validation ends the submit.
    let queuedWhileSubmitting = false;
    await act(async () => {
      const done = harness.current().form.handleSubmit();
      queuedWhileSubmitting = harness.current().form.state.isSubmitting;
      await done;
    });
    expect(queuedWhileSubmitting).toBe(true);
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    harness.unmount();
  });

  it('a rebase queued while the validation of a submit is in flight is applied when the validation blocks it', async () => {
    const { harness } = savingForm({ validate: (name, value) => (name === 'notes' && value === 'bad' ? 'Notes is bad' : undefined) });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    harness.type('Notes', 'bad');
    // A first refused attempt, so the second one runs (`submissionAttempts > 1`).
    await act(() => harness.current().form.handleSubmit());
    let done!: Promise<void>;
    act(() => {
      done = harness.current().form.handleSubmit();
    });
    expect(harness.current().binding.isSaving).toBe(true);
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '160', supplier: 'Lumen Parts Group' }));
    expect(harness.current().rebase.isPending).toBe(true);
    await act(() => done);
    const { binding, rebase } = harness.current();
    expect(binding.isSaving).toBe(false);
    expect(binding.saveError).not.toBeNull();
    expect(rebase.isPending).toBe(false);
    expect(binding.values).toEqual({ supplier: 'Lumen Parts Group', amount: '120', notes: 'bad' });
    expect(rebase.conflicts.map((conflict) => [conflict.path, conflict.mine, conflict.theirs])).toEqual([['amount', '120', '160']]);
    harness.unmount();
  });
});

describe('explicit isSaving / saveError', () => {
  it('prevail over the mapping from TanStack Form', async () => {
    const harness = setupInvoiceForm({ binding: { isSaving: true } });
    expect(harness.current().binding.isSaving).toBe(true);
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Lumen Parts Group' }));
    expect(harness.current().rebase.isPending).toBe(true);
    // The save of the app fails: its error, not TanStack Form's (no submit at all).
    const failure = new Error('409 conflict');
    harness.rerender({ binding: { isSaving: false, saveError: failure } });
    expect(harness.current().binding.saveError).toBe(failure);
    expect(harness.current().rebase.isPending).toBe(false);
    expect(harness.current().binding.values).toEqual({ ...SAVED, supplier: 'Lumen Parts Group', amount: '120' });
    harness.unmount();
  });

  it('isSaving: false and saveError: null while a handleSubmit is in flight: no queue, the rebase applies at once', async () => {
    const gate = deferred();
    const harness = setupInvoiceForm({ binding: { isSaving: false, saveError: null }, onSubmit: () => gate.promise });
    harness.type('Amount', '120');
    let done!: Promise<void>;
    await act(async () => {
      done = harness.current().form.handleSubmit();
    });
    expect(harness.current().form.state.isSubmitting).toBe(true);
    expect(harness.current().binding.isSaving).toBe(false);
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Lumen Parts Group' }));
    expect(harness.current().rebase.isPending).toBe(false);
    expect(harness.current().binding.values.supplier).toBe('Lumen Parts Group');
    await act(async () => {
      gate.reject(new Error('down'));
      await done.catch(() => undefined);
    });
    expect(harness.current().binding.saveError).toBeNull();
    harness.unmount();
  });
});
