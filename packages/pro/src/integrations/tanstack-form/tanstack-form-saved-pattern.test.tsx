// The pattern the README recommends (ticket #508, decision of 16/11 on #508): the `defaultValues` of `useForm` kept on
// the record the server has, a `saved` state that follows the binding's baseline after a save and after a rebase. With
// it TanStack Form agrees with the summary: `isDefaultValue` is true on the saved and rebased fields, `form.reset()`
// goes back to that record. Checked on the components the docs show: the copy-paste Example and the Playground demo.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { deferred } from '../../../test/binding-contract';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/tanstack-harness';
import type { TanStackFormOf } from '../../tanstack-form';
import { InvoiceWithTanStackForm } from './TanStackForm.example';
import { TanStackFormDemo } from './tanstack-form-demo';

/** The form of the last render of `useForm`, as the component under test sees it. */
const captured = vi.hoisted(() => ({ form: null as unknown }));

vi.mock('@tanstack/react-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-form')>();
  const useForm = ((options: unknown) => {
    const form = (actual.useForm as (options: unknown) => unknown)(options);
    captured.form = form;
    return form;
  }) as unknown as typeof actual.useForm;
  return { ...actual, useForm };
});
// The Example imports the package subpaths, as a reader pastes it: the sources here.
vi.mock('@formrail/pro/engine', () => import('../../engine'));
vi.mock('@formrail/pro/tanstack-form', () => import('../../tanstack-form'));

const form = () => captured.form as TanStackFormOf<Invoice>;
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const status = () => screen.getByRole('status').textContent ?? '';
const isDefault = (name: keyof Invoice) => form().state.fieldMeta[name]?.isDefaultValue;

interface Case {
  name: string;
  element: () => ReactElement;
  serverButton: string;
  /** The edit saved first. */
  edit: string;
  /** The record after the save of `edit` then the server update (nothing typed meanwhile). */
  rebased: Invoice;
  /** The record the server has after the save of `edit` and an update pressed during it. */
  queued: Invoice;
}

const CASES: Case[] = [
  {
    name: 'Example (TanStackForm.example.tsx)',
    element: () => <InvoiceWithTanStackForm />,
    serverButton: 'Receive the server version',
    edit: '1300',
    rebased: { supplier: 'Lumen Parts Group', amount: '1350', notes: '' },
    queued: { supplier: 'Lumen Parts Group', amount: '1350', notes: '' },
  },
  {
    name: 'Playground demo (tanstack-form-demo.tsx)',
    element: () => <TanStackFormDemo saveDelay={50} hydrationDelay={0} onSave={vi.fn()} onServerUpdate={vi.fn()} />,
    serverButton: 'Simulate server update',
    edit: '120',
    rebased: { supplier: 'Lumen Parts (updated)', amount: '170', notes: '' },
    queued: { supplier: 'Lumen Parts (updated)', amount: '170', notes: '' },
  },
  {
    name: 'Playground demo, hydrated after the mount',
    element: () => <TanStackFormDemo saveDelay={50} hydrationDelay={30} onSave={vi.fn()} onServerUpdate={vi.fn()} />,
    serverButton: 'Simulate server update',
    edit: '120',
    rebased: { supplier: 'Lumen Parts (updated)', amount: '170', notes: '' },
    queued: { supplier: 'Lumen Parts (updated)', amount: '170', notes: '' },
  },
];

const waitSaved = () => waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument(), { timeout: 3000 });

describe.each(CASES)('$name: defaultValues kept on the saved record', ({ element, serverButton, edit, rebased, queued }) => {
  afterEach(() => {
    captured.form = null;
  });

  it('after a save and a rebase, isDefaultValue is true on every field and form.reset() goes back to the rebased record', async () => {
    const view = render(element());
    await waitFor(() => expect(status()).toContain('All saved'));
    type('Amount', edit);
    expect(isDefault('amount')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument());
    await waitSaved();
    await waitFor(() => expect(status()).toBe('All saved'));
    // The saved field: TanStack Form compares it with the record it was saved as.
    await waitFor(() => expect(isDefault('amount')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: serverButton }));
    expect(input('Supplier').value).toBe(rebased.supplier);
    expect(form().state.values).toEqual(rebased);
    await waitFor(() => expect(['supplier', 'amount', 'notes'].map((name) => isDefault(name as keyof Invoice))).toEqual([true, true, true]));
    // The server's field is written by the binding, not by the user: not dirty (touched by the submit, as TanStack Form
    // marks every field on `handleSubmit`).
    expect(form().state.fieldMeta.supplier).toMatchObject({ isDirty: false });

    // TanStack Form's own discard is a real one: back to the rebased record, not to the record of the first render.
    type('Notes', 'Mine');
    expect(status()).toBe('Unsaved changes');
    act(() => form().reset());
    expect(form().state.values).toEqual(rebased);
    expect(input('Notes').value).toBe('');
    expect(input('Supplier').value).toBe(rebased.supplier);
    expect(status()).toBe('All saved');
    expect(screen.getByText('No changes')).toBeInTheDocument();
    view.unmount();
  });

  it('a server update queued during the save: merged when it ends, the typed edit kept, then form.reset() to the rebased record', async () => {
    const view = render(element());
    await waitFor(() => expect(status()).toContain('All saved'));
    type('Amount', edit);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument());
    type('Notes', 'typed during the save');
    fireEvent.click(screen.getByRole('button', { name: serverButton }));
    expect(status()).toMatch(/queued/);
    await waitSaved();
    await waitFor(() => expect(status()).not.toMatch(/queued/));
    // Merged against what was saved: the server's values on the fields not edited since, the notes typed meanwhile kept.
    expect(form().state.values).toEqual({ ...queued, notes: 'typed during the save' });
    expect(status()).toBe('Unsaved changes');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toContainEqual(expect.stringContaining('Notes'));
    await waitFor(() => expect([isDefault('supplier'), isDefault('amount'), isDefault('notes')]).toEqual([true, true, false]));
    act(() => form().reset());
    expect(form().state.values).toEqual(queued);
    expect(status()).toBe('All saved');
    view.unmount();
  });

  it('a server version received during a save is built on what is being saved: the saved field is not taken back', async () => {
    const view = render(element());
    await waitFor(() => expect(status()).toContain('All saved'));
    type('Notes', 'Saved note');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: serverButton }));
    await waitSaved();
    await waitFor(() => expect(status()).toBe('All saved'));
    // The other user's version carries the note being saved: the merge does not put the pre-save note back.
    expect(form().state.values.notes).toBe('Saved note');
    expect(form().state.values.supplier).toBe(queued.supplier);
    expect(screen.getByText('No changes')).toBeInTheDocument();
    view.unmount();
  });
});

// Why the pattern follows the baseline instead of setting `saved` to `incoming` where `rebase(incoming)` is called: a
// rebase called during a save is queued, so `incoming` is not the baseline yet. As `defaultValues` of a touched form it
// is a rehydration (the baseline becomes `incoming`, the summary is computed against it), and a rehydration during the
// save wins: the save's `reset(saved)` no longer keeps what the user typed since the save started.
describe('the pitfall the pattern avoids: defaultValues set to incoming where a queued rebase is called', () => {
  it('drops the edit typed during the save', async () => {
    let record = SAVED;
    const gate = deferred();
    const harness = setupInvoiceForm({
      defaults: () => record,
      onSubmit: async (value, binding) => {
        await gate.promise;
        binding.reset(structuredClone(value));
      },
    });
    harness.type('Amount', '120');
    let done!: Promise<void>;
    await act(async () => {
      done = harness.current().form.handleSubmit();
    });
    harness.type('Notes', 'typed during the save');
    const incoming: Invoice = { ...SAVED, amount: '120', supplier: 'Lumen Parts Group' };
    act(() => {
      record = incoming;
      harness.current().rebase.rebase(incoming);
    });
    expect(harness.current().rebase.isPending).toBe(true);
    await act(async () => {
      gate.resolve();
      await done;
    });
    // The notes typed during the save are gone: the save's result was taken as a plain hydration.
    expect(harness.current().binding.values.notes).toBe('');
    expect(harness.input('Notes').value).toBe('');
    harness.unmount();
  });
});
