// `useReactHookFormBinding` (ticket #507, QA round 1, point 1): the user keeps typing while a save is in flight, with
// the documented pattern (`binding.reset(saved)` inside the `handleSubmit` handler). The semantics are those of
// core's `save`: the fields edited meanwhile keep the typed value and stay dirty against the new baseline, the
// others take what the server stored (its normalization included) and are clean.
import { useEffect, useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type ChangeEntry, type RebaseFormBinding, type UseFormRebaseReturn } from '../../engine';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/rhf-harness';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

const paths = (entries: ChangeEntry[]) => entries.map((entry) => `${entry.kind}:${entry.path}`);

type Harness = ReturnType<typeof setupInvoiceForm>;

/** Starts a `handleSubmit` save whose handler waits for `settle`, then calls `binding.reset(respond(sent))`. */
async function startSave(harness: Harness, respond: (sent: Invoice) => Invoice = (sent) => ({ ...sent })) {
  let release!: (error: unknown) => void;
  const gate = new Promise<void>((resolve, reject) => {
    release = (error) => (error === null ? resolve() : reject(error));
  });
  let done!: Promise<void>;
  await act(async () => {
    done = harness
      .current()
      .form.handleSubmit(async (sent) => {
        await gate;
        harness.current().binding.reset(respond(sent));
      })()
      .catch(() => undefined);
  });
  expect(harness.current().binding.isSaving).toBe(true);
  return {
    settle: async (error: unknown = null) => {
      await act(async () => {
        release(error);
        await done;
      });
    },
  };
}

describe('useReactHookFormBinding: typing while a handleSubmit save is in flight', () => {
  it('an edit typed during the save stays, in the DOM too, and stays dirty against the stored record', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const save = await startSave(harness);
    harness.type('Notes', 'typed during save');
    const from = harness.commits.length;
    await save.settle();

    const { binding, entries, form } = harness.current();
    expect(binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(binding.values).toEqual({ ...SAVED, amount: '120', notes: 'typed during save' });
    expect(paths(entries)).toEqual(['changed:notes']);
    expect(harness.input('Notes').value).toBe('typed during save');
    expect(form.formState.dirtyFields).toEqual({ notes: true });
    expect(form.formState.isDirty).toBe(true);
    expect(binding.isSaving).toBe(false);
    // No committed render ever showed the typed value lost (in the snapshot or in the DOM).
    for (const commit of harness.commits.slice(from)) {
      expect(commit.values.notes).toBe('typed during save');
      expect(commit.dom.notes).toBe('typed during save');
    }
    harness.unmount();
  });

  it('the untouched fields take what the server stored (normalized) and are clean; the edited one keeps the typed value', async () => {
    const harness = setupInvoiceForm();
    harness.type('Supplier', '  acme corp ');
    harness.type('Amount', '120');
    const save = await startSave(harness, (sent) => ({ ...sent, supplier: sent.supplier.trim().toUpperCase(), amount: '120.00' }));
    harness.type('Amount', '125');
    await save.settle();

    const { binding, entries, form } = harness.current();
    expect(binding.baseline).toEqual({ supplier: 'ACME CORP', amount: '120.00', notes: '' });
    expect(binding.values).toEqual({ supplier: 'ACME CORP', amount: '125', notes: '' });
    expect(paths(entries)).toEqual(['changed:amount']);
    expect(harness.input('Supplier').value).toBe('ACME CORP');
    expect(harness.input('Amount').value).toBe('125');
    expect(form.formState.dirtyFields).toEqual({ amount: true });
    harness.unmount();
  });

  it('nothing typed during the save: values and baseline are the stored record itself, normalized, and the form is clean', async () => {
    const harness = setupInvoiceForm();
    harness.type('Supplier', 'acme ltd');
    let stored!: Invoice;
    const save = await startSave(harness, (sent) => (stored = { ...sent, supplier: 'Acme Ltd' }));
    await save.settle();

    const { binding, entries, form } = harness.current();
    expect(binding.baseline).toBe(stored);
    expect(binding.values).toBe(stored);
    expect(entries).toEqual([]);
    expect(harness.input('Supplier').value).toBe('Acme Ltd');
    expect(form.formState.isDirty).toBe(false);
    harness.unmount();
  });

  it('a field typed during the save and back to the sent value counts as untouched: it takes the stored value', async () => {
    const harness = setupInvoiceForm();
    harness.type('Supplier', 'acme ltd');
    const save = await startSave(harness, (sent) => ({ ...sent, supplier: 'Acme Ltd' }));
    harness.type('Supplier', 'acme ltd!');
    harness.type('Supplier', 'acme ltd');
    await save.settle();
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.input('Supplier').value).toBe('Acme Ltd');
    harness.unmount();
  });

  it('a validation error on a field edited during the save stays; the save keeps no stale sent values for the next one', async () => {
    const harness = setupInvoiceForm({ rules: { notes: { maxLength: { value: 5, message: 'Too long' } } }, useFormProps: { defaultValues: SAVED, mode: 'onChange' } });
    harness.type('Amount', '120');
    const first = await startSave(harness);
    harness.type('Notes', 'far too long');
    await act(async () => {
      await harness.current().form.trigger('notes');
    });
    expect(harness.current().form.getFieldState('notes').error?.message).toBe('Too long');
    await first.settle();
    expect(harness.current().form.getFieldState('notes').error?.message).toBe('Too long');
    expect(harness.input('Notes').value).toBe('far too long');

    // The next save starts from the current values: typing during it is measured against them.
    harness.type('Notes', 'ok');
    const second = await startSave(harness);
    harness.type('Supplier', 'Acme Ltd');
    await second.settle();
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120', notes: 'ok' });
    expect(paths(harness.current().entries)).toEqual(['changed:supplier']);
    harness.unmount();
  });

  it('a save that fails leaves the edits; the next save measures the edits from its own start', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const failing = await startSave(harness);
    harness.type('Notes', 'during the failed save');
    await failing.settle(new Error('offline'));
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().binding.values).toEqual({ ...SAVED, amount: '120', notes: 'during the failed save' });

    // The second save sends both edits: nothing typed during it, so the form is clean afterwards.
    const second = await startSave(harness);
    await second.settle();
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120', notes: 'during the failed save' });
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it('a discard during the save wins: the stored record arrives as a plain hydration (the form shows it, clean)', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const save = await startSave(harness);
    harness.type('Notes', 'typed then discarded');
    act(() => harness.current().form.reset());
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    await save.settle();
    const { binding, entries } = harness.current();
    expect(binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(binding.values).toBe(binding.baseline);
    expect(entries).toEqual([]);
    expect(harness.input('Amount').value).toBe('120');
    harness.unmount();
  });

  it('a server update queued during the save is merged after it, with the edit typed during the save', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const save = await startSave(harness);
    harness.type('Notes', 'typed during save');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '120', supplier: 'Acme Corp Ltd' }));
    expect(harness.current().rebase.isPending).toBe(true);
    await save.settle();

    const { binding, entries, rebase } = harness.current();
    expect(binding.baseline).toEqual({ ...SAVED, amount: '120', supplier: 'Acme Corp Ltd' });
    expect(binding.values).toEqual({ supplier: 'Acme Corp Ltd', amount: '120', notes: 'typed during save' });
    expect(paths(entries)).toEqual(['changed:notes']);
    expect(rebase.conflicts).toEqual([]);
    expect(harness.input('Supplier').value).toBe('Acme Corp Ltd');
    expect(harness.input('Notes').value).toBe('typed during save');
    harness.unmount();
  });

  it('StrictMode: the same result (the save start is observed once per commit)', async () => {
    const harness = setupInvoiceForm({ strict: true });
    harness.type('Amount', '120');
    const save = await startSave(harness);
    harness.type('Notes', 'typed during save');
    await save.settle();
    expect(harness.current().binding.values).toEqual({ ...SAVED, amount: '120', notes: 'typed during save' });
    expect(paths(harness.current().entries)).toEqual(['changed:notes']);
    harness.unmount();
  });
});

describe('useReactHookFormBinding: writes of the binding during a handleSubmit save (QA #507 round 2, point 1)', () => {
  it("acceptTheirs during the save (the tester's case B): the save stays in flight to its real end, the accepted value and the edit typed after it stay", async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '999');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '200' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    const save = await startSave(harness);
    act(() => harness.current().rebase.acceptTheirs('amount'));
    // Still saving, for the binding and for React Hook Form.
    expect(harness.current().binding.isSaving).toBe(true);
    expect(harness.current().form.formState.isSubmitting).toBe(true);
    expect(harness.input('Amount').value).toBe('200');
    harness.type('Notes', 'typed during save');
    expect(harness.current().binding.isSaving).toBe(true);
    await save.settle();

    const { binding, entries, form } = harness.current();
    expect(binding.isSaving).toBe(false);
    // The end of the submit is React Hook Form's own: submitted, successful, counted.
    expect(form.formState.isSubmitting).toBe(false);
    expect(form.formState.isSubmitted).toBe(true);
    expect(form.formState.isSubmitSuccessful).toBe(true);
    expect(form.formState.submitCount).toBe(1);
    expect(binding.saveError).toBeNull();
    expect(binding.baseline).toEqual({ ...SAVED, amount: '999' });
    expect(binding.values).toEqual({ ...SAVED, amount: '200', notes: 'typed during save' });
    expect(paths(entries)).toEqual(['changed:amount', 'changed:notes']);
    expect(form.formState.dirtyFields).toEqual({ amount: true, notes: true });
    expect(harness.input('Amount').value).toBe('200');
    expect(harness.input('Notes').value).toBe('typed during save');
    harness.unmount();
  });

  it('binding.setValues during the save: written in place (the field being typed in keeps its value in every commit), dirtyFields recomputed', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const save = await startSave(harness);
    harness.type('Notes', 'typing');
    const from = harness.commits.length;
    act(() => harness.current().binding.setValues({ supplier: 'Acme Corp Ltd' }));
    expect(harness.current().binding.isSaving).toBe(true);
    expect(harness.input('Supplier').value).toBe('Acme Corp Ltd');
    expect(harness.current().form.formState.dirtyFields).toEqual({ supplier: true, amount: true, notes: true });
    for (const commit of harness.commits.slice(from)) expect(commit.dom.notes).toBe('typing');
    await save.settle();
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(paths(harness.current().entries)).toEqual(['changed:supplier', 'changed:notes']);
    expect(harness.current().form.formState.dirtyFields).toEqual({ supplier: true, notes: true });
    harness.unmount();
  });

  it('reset(saved) during the save: isSaving stays true until the handler really ends, then the queued update merges', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    let release!: () => void;
    const after = new Promise<void>((resolve) => (release = resolve));
    let done!: Promise<void>;
    await act(async () => {
      done = harness.current().form.handleSubmit(async (sent) => {
        harness.current().binding.reset({ ...sent });
        // Work of the handler after the reset (an audit call, a toast).
        await after;
      })();
    });
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(harness.current().binding.isSaving).toBe(true);
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '120', supplier: 'Acme Corp Ltd' }));
    expect(harness.current().rebase.isPending).toBe(true);
    await act(async () => {
      release();
      await done;
    });
    expect(harness.current().binding.isSaving).toBe(false);
    expect(harness.current().form.formState.submitCount).toBe(1);
    expect(harness.current().binding.values).toEqual({ ...SAVED, amount: '120', supplier: 'Acme Corp Ltd' });
    expect(harness.current().rebase.isPending).toBe(false);
    harness.unmount();
  });

  it('a handler that fails after a write of the binding: the save still ends, as failed', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    const save = await startSave(harness);
    act(() => harness.current().rebase.keepMine('amount'));
    act(() => harness.current().binding.setValues({ notes: 'by code' }));
    expect(harness.current().binding.isSaving).toBe(true);
    await save.settle(new Error('offline'));
    expect(harness.current().binding.isSaving).toBe(false);
    expect(harness.current().form.formState.isSubmitSuccessful).toBe(false);
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().binding.values).toEqual({ ...SAVED, amount: '120', notes: 'by code' });
    harness.unmount();
  });

  it('documented edge: a stored record without a key the form has (no input) is written with a reset, which ends the submit', async () => {
    // `reference` has no input: only a reset can remove it from React Hook Form's values.
    const withReference = { ...SAVED, reference: 'R-1' } as Invoice;
    const harness = setupInvoiceForm({ useFormProps: { defaultValues: withReference } });
    harness.type('Amount', '120');
    const save = await startSave(harness, (sent) => {
      const rest: Record<string, unknown> = { ...sent };
      delete rest.reference;
      return rest as Invoice;
    });
    // A field edited during the save: React Hook Form must end with it too (second reset), not with `saved`.
    harness.type('Notes', 'typed during save');
    await save.settle();
    const { binding, form } = harness.current();
    expect(Object.hasOwn(binding.values, 'reference')).toBe(false);
    expect(Object.hasOwn(form.getValues(), 'reference')).toBe(false);
    expect(binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(binding.values).toEqual({ ...SAVED, amount: '120', notes: 'typed during save' });
    expect(form.getValues()).toEqual(binding.values);
    expect(harness.input('Notes').value).toBe('typed during save');
    expect(paths(harness.current().entries)).toEqual(['changed:notes']);
    expect(binding.isSaving).toBe(false);
    harness.unmount();
  });
});

describe('useReactHookFormBinding: saveError of a save that succeeded while a validation error appeared (critic round 1, point 1)', () => {
  const required = { notes: { required: 'Notes are required' } };

  it('default mode, second save: the user empties a required field during it, the server stores: saveError null, the error stays on the field', async () => {
    const harness = setupInvoiceForm({ rules: required, useFormProps: { defaultValues: { ...SAVED, notes: 'n' } } });
    harness.type('Amount', '120');
    const first = await startSave(harness);
    await first.settle();
    expect(harness.current().binding.saveError).toBeNull();
    harness.type('Amount', '130');
    const second = await startSave(harness);
    // After a submit React Hook Form re-validates on change (`reValidateMode: 'onChange'`).
    await act(async () => {
      harness.type('Notes', '');
    });
    expect(harness.current().form.getFieldState('notes').error?.message).toBe('Notes are required');
    await second.settle();
    const { binding, form } = harness.current();
    expect(form.formState.isSubmitSuccessful).toBe(false);
    expect(binding.saveError).toBeNull();
    expect(binding.baseline).toEqual({ ...SAVED, amount: '130', notes: 'n' });
    expect(form.getFieldState('notes').error?.message).toBe('Notes are required');
    harness.unmount();
  });

  it("mode 'onChange', first save: the same", async () => {
    const harness = setupInvoiceForm({ rules: required, useFormProps: { defaultValues: { ...SAVED, notes: 'n' }, mode: 'onChange' } });
    harness.type('Amount', '130');
    const save = await startSave(harness);
    await act(async () => {
      harness.type('Notes', '');
    });
    await save.settle();
    expect(harness.current().binding.saveError).toBeNull();
    expect(harness.current().form.getFieldState('notes').error?.message).toBe('Notes are required');
    harness.unmount();
  });

  it('the next submit blocked by that error, or a handler that fails, is still reported', async () => {
    const harness = setupInvoiceForm({ rules: required, useFormProps: { defaultValues: { ...SAVED, notes: 'n' }, mode: 'onChange' } });
    harness.type('Amount', '130');
    const save = await startSave(harness);
    await act(async () => {
      harness.type('Notes', '');
    });
    await save.settle();
    expect(harness.current().binding.saveError).toBeNull();
    // Blocked by validation: the handler never runs, nothing saved.
    await act(async () => {
      await harness.current().form.handleSubmit(() => undefined)();
    });
    expect(harness.current().binding.saveError).toEqual(expect.objectContaining({ notes: expect.objectContaining({ message: 'Notes are required' }) }));
    // Fixed, then a handler that fails before `reset(saved)`.
    await act(async () => {
      harness.type('Notes', 'ok');
    });
    const failing = await startSave(harness);
    await failing.settle(new Error('offline'));
    expect(harness.current().binding.saveError).not.toBeNull();
    harness.unmount();
  });
});

describe('useReactHookFormBinding: a save of your own (the isSaving option)', () => {
  interface Probe {
    form: UseFormReturn<Invoice>;
    binding: RebaseFormBinding<Invoice>;
    entries: ChangeEntry[];
    rebase: UseFormRebaseReturn<Invoice>;
    setSaving: (saving: boolean) => void;
  }

  function setup() {
    let probe!: Probe;
    function Editor() {
      const [saving, setSaving] = useState(false);
      const form = useForm<Invoice>({ defaultValues: SAVED });
      const binding = useReactHookFormBinding(form, { isSaving: saving, saveError: null });
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
      probe = { form, binding, entries, rebase: useFormRebase(binding), setSaving };
      return (
        <form>
          <label>
            Amount
            <input {...form.register('amount')} />
          </label>
          <label>
            Notes
            <input {...form.register('notes')} />
          </label>
        </form>
      );
    }
    const view = render(<Editor />);
    return { current: () => probe, unmount: () => view.unmount() };
  }

  it('reset(saved) while isSaving is true keeps the edits typed since it turned true', () => {
    const editor = setup();
    fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '120' } });
    act(() => editor.current().setSaving(true));
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'typed during save' } });
    act(() => editor.current().binding.reset({ ...SAVED, amount: '120.00' }));
    act(() => editor.current().setSaving(false));
    expect(editor.current().binding.baseline).toEqual({ ...SAVED, amount: '120.00' });
    expect(editor.current().binding.values).toEqual({ ...SAVED, amount: '120.00', notes: 'typed during save' });
    expect(paths(editor.current().entries)).toEqual(['changed:notes']);
    editor.unmount();
  });

  it.each([
    ['a discard (form.reset())', (probe: { form: UseFormReturn<Invoice> }) => probe.form.reset()],
    ['a discard of the binding (binding.reset())', (probe: { binding: RebaseFormBinding<Invoice> }) => probe.binding.reset()],
    ['a rehydration (form.reset(data))', (probe: { form: UseFormReturn<Invoice> }) => probe.form.reset({ ...SAVED, notes: 'reloaded' })],
  ] as const)('%s during the save wins: the stored record then arrives as a plain hydration', (_name, interrupt) => {
    const editor = setup();
    fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '120' } });
    act(() => editor.current().setSaving(true));
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'typed during save' } });
    act(() => interrupt(editor.current()));
    // The interruption itself: the typed value is gone, the form is at its (new) baseline.
    expect(editor.current().binding.values).toBe(editor.current().binding.baseline);
    expect(editor.current().entries).toEqual([]);
    const stored = { ...SAVED, amount: '120' };
    act(() => editor.current().binding.reset(stored));
    act(() => editor.current().setSaving(false));
    expect(editor.current().binding.values).toBe(stored);
    expect(editor.current().entries).toEqual([]);
    expect((screen.getByLabelText('Notes') as HTMLInputElement).value).toBe('');
    editor.unmount();
  });

  it('reset(x) once isSaving is back to false is a hydration (documented: reset before the save settles)', () => {
    const editor = setup();
    act(() => editor.current().setSaving(true));
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'typed during save' } });
    act(() => editor.current().setSaving(false));
    const next = { ...SAVED, amount: '130' };
    act(() => editor.current().binding.reset(next));
    expect(editor.current().binding.values).toBe(next);
    expect(editor.current().entries).toEqual([]);
    editor.unmount();
  });

  it('with the rebase engine in a child component, a queued update applied when the save ends is a rebase, not a save result', () => {
    let probe!: { binding: RebaseFormBinding<Invoice>; setSaving: (saving: boolean) => void; rebase?: UseFormRebaseReturn<Invoice> };
    function Rebaser({ binding }: { binding: RebaseFormBinding<Invoice> }) {
      probe.rebase = useFormRebase(binding);
      return null;
    }
    function Editor() {
      const [saving, setSaving] = useState(false);
      const form = useForm<Invoice>({ defaultValues: SAVED });
      const binding = useReactHookFormBinding(form, { isSaving: saving, saveError: null });
      probe = { ...probe, binding, setSaving };
      return (
        <form>
          <label>
            Notes
            <input {...form.register('notes')} />
          </label>
          <Rebaser binding={binding} />
        </form>
      );
    }
    const view = render(<Editor />);
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'draft' } });
    act(() => probe.setSaving(true));
    act(() => probe.rebase!.rebase({ ...SAVED, notes: 'from the server' }));
    expect(probe.rebase!.isPending).toBe(true);
    // Typed back to the saved value during the save: no edit for the engine, an edit since the save started.
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: '' } });
    // The save fails (no reset by the app): the engine, in a child, applies the queued update in its layout effect,
    // which runs before the parent's. If the binding still held the values of the save start, its `reset(incoming)`
    // would take it for the save's result and keep the `''` typed since then over the server value.
    act(() => probe.setSaving(false));
    expect(probe.binding.baseline).toEqual({ ...SAVED, notes: 'from the server' });
    expect(probe.binding.values).toBe(probe.binding.baseline);
    expect((screen.getByLabelText('Notes') as HTMLInputElement).value).toBe('from the server');
    expect(probe.rebase!.conflicts).toEqual([]);
    view.unmount();
  });
});

describe('useReactHookFormBinding: saveError after a reset of React Hook Form that sets submitCount back to 0 (QA #507 round 4, point 1)', () => {
  const required = { notes: { required: 'Notes are required' } };
  const notesRequired = () => setupInvoiceForm({ rules: required, useFormProps: { defaultValues: { ...SAVED, notes: 'n' } } });
  const notesError = () => expect.objectContaining({ notes: expect.objectContaining({ message: 'Notes are required' }) });

  /** A first save that succeeds (ended by `reset(saved)`), then a reset of React Hook Form (submitCount back to 0). */
  async function savedThenReset(harness: Harness, reset: (form: UseFormReturn<Invoice>) => void) {
    harness.type('Amount', '120');
    const first = await startSave(harness);
    await first.settle();
    expect(harness.current().binding.saveError).toBeNull();
    expect(harness.current().form.formState.submitCount).toBe(1);
    act(() => reset(harness.current().form));
    expect(harness.current().form.formState.submitCount).toBe(0);
  }

  /** A submit that validation blocks: the handler never runs. */
  async function blockedSubmit(harness: Harness) {
    let ran = false;
    await act(async () => {
      await harness.current().form.handleSubmit(() => {
        ran = true;
      })();
    });
    expect(ran).toBe(false);
  }

  it('a discard (form.reset()), then a submit blocked by validation: saveError is the errors', async () => {
    const harness = notesRequired();
    await savedThenReset(harness, (form) => form.reset());
    await act(async () => {
      harness.type('Notes', '');
    });
    await blockedSubmit(harness);
    expect(harness.current().form.formState.submitCount).toBe(1);
    expect(harness.current().binding.saveError).toEqual(notesError());
    harness.unmount();
  });

  it('a rehydration (form.reset(data)), then a submit blocked by validation: saveError is the errors', async () => {
    const harness = notesRequired();
    await savedThenReset(harness, (form) => form.reset({ ...SAVED, notes: '' }));
    await blockedSubmit(harness);
    expect(harness.current().binding.saveError).toEqual(notesError());
    harness.unmount();
  });

  it('a discard, then a handler that fails (no reset(saved)): saveError is not null, the edit stays', async () => {
    const harness = notesRequired();
    await savedThenReset(harness, (form) => form.reset());
    harness.type('Amount', '140');
    const failing = await startSaveWithoutReset(harness);
    await failing.settle(new Error('500 from server'));
    expect(harness.current().form.formState.isSubmitSuccessful).toBe(false);
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().binding.values).toEqual({ ...SAVED, amount: '140', notes: 'n' });
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120', notes: 'n' });
    harness.unmount();
  });

  it("React Hook Form's documented pattern (reset in an effect on isSubmitSuccessful), then a save that fails: saveError is not null", async () => {
    function ResetOnSuccess({ form }: { form: UseFormReturn<Invoice> }) {
      const { isSubmitSuccessful } = form.formState;
      useEffect(() => {
        if (isSubmitSuccessful) form.reset(form.getValues());
      }, [isSubmitSuccessful, form]);
      return null;
    }
    const harness = setupInvoiceForm({ extra: (form) => <ResetOnSuccess form={form} /> });
    harness.type('Amount', '120');
    const first = await startSave(harness);
    await first.settle();
    expect(harness.current().form.formState.submitCount).toBe(0);
    expect(harness.current().binding.saveError).toBeNull();
    harness.type('Amount', '130');
    const failing = await startSaveWithoutReset(harness);
    await failing.settle(new Error('500 from server'));
    expect(harness.current().form.formState.submitCount).toBe(1);
    expect(harness.current().binding.saveError).not.toBeNull();
    expect(harness.current().binding.values.amount).toBe('130');
    harness.unmount();
  });

  it('the values prop changes after the save (React Hook Form resets, submitCount 0), then a submit blocked by validation: saveError is the errors', async () => {
    const harness = setupInvoiceForm({ rules: required, useFormProps: { values: { ...SAVED, notes: 'n' } } });
    harness.type('Amount', '120');
    const first = await startSave(harness);
    await first.settle();
    expect(harness.current().binding.saveError).toBeNull();
    act(() => harness.rerender({ rules: required, useFormProps: { values: { ...SAVED, notes: '' } } }));
    expect(harness.current().form.formState.submitCount).toBe(0);
    await blockedSubmit(harness);
    expect(harness.current().binding.saveError).toEqual(notesError());
    harness.unmount();
  });

  it('a rehydration and a submit that fails in the same task, no render between them: saveError is not null', async () => {
    const harness = notesRequired();
    harness.type('Amount', '120');
    const first = await startSave(harness);
    await first.settle();
    expect(harness.current().binding.saveError).toBeNull();
    await act(async () => {
      const { form } = harness.current();
      form.reset({ ...SAVED, amount: '130' });
      await form
        .handleSubmit(() => {
          throw new Error('500 from server');
        })()
        .catch(() => undefined);
    });
    expect(harness.current().form.formState.submitCount).toBe(1);
    expect(harness.current().form.formState.isSubmitSuccessful).toBe(false);
    expect(harness.current().binding.saveError).not.toBeNull();
    harness.unmount();
  });

  it("after the reset, a save ended by reset(saved) while a validation error appears is still a success (the critic's case)", async () => {
    // `mode: 'onChange'`: after the reset (`isSubmitted` false) the field is validated as the user types.
    const harness = setupInvoiceForm({ rules: required, useFormProps: { defaultValues: { ...SAVED, notes: 'n' }, mode: 'onChange' } });
    await savedThenReset(harness, (form) => form.reset());
    harness.type('Amount', '150');
    const second = await startSave(harness);
    await act(async () => {
      harness.type('Notes', '');
    });
    await second.settle();
    expect(harness.current().form.formState.isSubmitSuccessful).toBe(false);
    expect(harness.current().binding.saveError).toBeNull();
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '150', notes: 'n' });
    harness.unmount();
  });
});

/** A `handleSubmit` save whose handler waits for `settle` and never calls `binding.reset` (a request that fails). */
async function startSaveWithoutReset(harness: Harness) {
  let release!: (error: unknown) => void;
  const gate = new Promise<void>((resolve, reject) => {
    release = (error) => (error === null ? resolve() : reject(error));
  });
  let done!: Promise<void>;
  await act(async () => {
    done = harness
      .current()
      .form.handleSubmit(async () => {
        await gate;
      })()
      .catch(() => undefined);
  });
  expect(harness.current().binding.isSaving).toBe(true);
  return {
    settle: async (error: unknown = null) => {
      await act(async () => {
        release(error);
        await done;
      });
    },
  };
}

describe('useReactHookFormBinding: a discard of the binding during a handleSubmit save (critic round 5, M05)', () => {
  it('binding.reset() (no record) while the submit is in flight, then the handler fails: the save is reported as failed', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let done!: Promise<void>;
    // The submit starts in its own act: the render with `isSubmitting` is committed before the handler goes on.
    await act(async () => {
      done = harness
        .current()
        .form.handleSubmit(async () => {
          await gate;
          // A discard, not a save result: it must not mark the submit as saved.
          harness.current().binding.reset();
          throw new Error('500 from server');
        })()
        .catch(() => undefined);
    });
    expect(harness.current().binding.isSaving).toBe(true);
    await act(async () => {
      release();
      await done;
    });
    const { binding, form } = harness.current();
    expect(form.formState.isSubmitted).toBe(true);
    expect(form.formState.isSubmitSuccessful).toBe(false);
    expect(binding.isSaving).toBe(false);
    expect(binding.saveError).not.toBeNull();
    // The discard itself took effect: the form is back at its baseline.
    expect(binding.values).toEqual(SAVED);
    expect(harness.input('Amount').value).toBe('100');
    harness.unmount();
  });
});
