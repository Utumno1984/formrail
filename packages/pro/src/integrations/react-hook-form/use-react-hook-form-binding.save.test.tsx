// `useReactHookFormBinding` (ticket #507, QA round 1, point 1): the user keeps typing while a save is in flight, with
// the documented pattern (`binding.reset(saved)` inside the `handleSubmit` handler). The semantics are those of
// core's `save`: the fields edited meanwhile keep the typed value and stay dirty against the new baseline, the
// others take what the server stored (its normalization included) and are clean.
import { useState } from 'react';
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
