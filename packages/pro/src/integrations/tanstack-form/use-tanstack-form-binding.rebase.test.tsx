// `useTanStackFormBinding` + `useFormRebase` (ticket #508) with a real TanStack Form: the rebase is applied with no
// false dirty and no echo (no field meta written, no `listeners.onChange`, no validator), in one write of the form's
// base store; the conflicts resolve with `keepMine` / `acceptTheirs`.
import { act } from '@testing-library/react';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/tanstack-harness';

const SERVER: Invoice = { ...SAVED, supplier: 'Lumen Parts Group' };

describe('rebase without false dirty and without echo', () => {
  it("A edited, the server changes B: B takes the server value, A stays; the summary on A only; B's meta untouched, A's kept", () => {
    const harness = setupInvoiceForm();
    harness.type('Notes', 'Checked by me');
    harness.blur('Notes');
    const notesMeta = harness.current().form.state.fieldMeta.notes;
    expect(notesMeta).toMatchObject({ isTouched: true, isBlurred: true, isDirty: true });
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase(SERVER));
    const { form, binding, entries, rebase } = harness.current();
    expect(binding.baseline).toBe(SERVER);
    expect(binding.values).toEqual({ ...SERVER, notes: 'Checked by me' });
    expect(form.state.values).toEqual(binding.values);
    expect(harness.input('Supplier').value).toBe('Lumen Parts Group');
    expect(harness.input('Notes').value).toBe('Checked by me');
    expect(entries.map((entry) => entry.path)).toEqual(['notes']);
    expect(rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    // B: written by the binding, not by the user.
    expect(form.state.fieldMeta.supplier).toMatchObject({ isTouched: false, isBlurred: false, isDirty: false });
    // A: the same meta object as before the rebase.
    expect(form.state.fieldMeta.notes).toMatchObject({ isTouched: true, isBlurred: true, isDirty: true });
    const after = harness.commits.slice(from);
    expect(after.length).toBeGreaterThan(0);
    for (const commit of after) {
      expect(commit.values).not.toBe(SERVER);
      expect(commit.values).not.toEqual(SERVER);
      expect(commit.dom.notes).toBe('Checked by me');
      expect(commit.entries).not.toEqual([]);
    }
    harness.unmount();
  });

  it("isDefaultValue of B: true when the app keeps useForm's defaultValues on the record it rebases on", () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    harness.type('Notes', 'Checked by me');
    act(() => {
      record = SERVER;
      harness.current().rebase.rebase(SERVER);
    });
    const { form, binding, rebase } = harness.current();
    // The new defaultValues have the content of the rebase's baseline: no rehydration, the rebase's state stays.
    expect(binding.baseline).toBe(SERVER);
    expect(rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    expect(form.state.fieldMeta.supplier).toMatchObject({ isDefaultValue: true, isTouched: false, isDirty: false });
    expect(form.state.fieldMeta.notes).toMatchObject({ isDefaultValue: false, isTouched: true, isDirty: true });
    // TanStack Form's own reset now goes back to the record the form was rebased on: a real discard.
    act(() => form.reset());
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it("isDefaultValue of B with useForm's defaultValues left on the old record: false, TanStack Form compares with them (documented)", () => {
    const harness = setupInvoiceForm();
    harness.type('Notes', 'Checked by me');
    act(() => harness.current().rebase.rebase(SERVER));
    // A later store change recomputes TanStack Form's field meta against its defaults: still the old record.
    harness.type('Notes', 'Checked again');
    const { form, entries } = harness.current();
    expect(form.state.fieldMeta.supplier?.isDefaultValue).toBe(false);
    // The binding's summary is against the rebase's baseline, whatever TanStack Form compares with.
    expect(entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it('the server changes A too, to another value: a conflict, the input keeps the user value; keepMine closes it, A the only entry', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase({ ...SERVER, amount: '150' }));
    expect(harness.current().rebase.conflicts.map((conflict) => [conflict.path, conflict.mine, conflict.theirs])).toEqual([['amount', '120', '150']]);
    expect(harness.input('Amount').value).toBe('120');
    expect(harness.commits.slice(from).every((commit) => commit.dom.amount === '120')).toBe(true);
    act(() => harness.current().rebase.keepMine('amount'));
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([['amount', '150', '120']]);
    expect(harness.current().form.state.fieldMeta.amount).toMatchObject({ isTouched: true, isDirty: true });
    harness.unmount();
  });

  it('acceptTheirs: the server value in the input and in the form, A no longer an entry', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'mine');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    act(() => harness.current().rebase.acceptTheirs('amount'));
    expect(harness.input('Amount').value).toBe('150');
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    expect(harness.current().form.state.values).toEqual({ ...SAVED, amount: '150', notes: 'mine' });
    harness.unmount();
  });

  it('a form with no edit takes the incoming values: no entry in any render, the values structurally incoming', () => {
    const harness = setupInvoiceForm();
    const incoming: Invoice = { supplier: 'Lumen Parts Group', amount: '130', notes: 'from the server' };
    const from = harness.commits.length;
    act(() => harness.current().rebase.rebase(incoming));
    expect(harness.current().entries).toEqual([]);
    expect(harness.current().binding.values).toEqual(incoming);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.current().form.state.values).toEqual(incoming);
    expect(harness.input('Notes').value).toBe('from the server');
    expect(harness.commits.slice(from).length).toBeGreaterThan(0);
    expect(harness.commits.every((commit) => commit.entries.length === 0)).toBe(true);
    // No field is touched: `useForm`'s next render (its `defaultValues` unchanged) leaves the values alone.
    harness.bump();
    expect(harness.current().form.state.values).toEqual(incoming);
    expect(harness.current().form.state.isTouched).toBe(false);
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

  it('a top-level key removed by the server: gone from binding.values and from form.state.values', () => {
    type Loose = Invoice & { reference?: string };
    const saved: Loose = { ...SAVED, reference: 'R-7' };
    const harness = setupInvoiceForm({ defaults: () => saved });
    harness.type('Notes', 'mine');
    const incoming: Loose = { ...saved };
    delete incoming.reference;
    act(() => harness.current().rebase.rebase(incoming));
    expect(Object.hasOwn(harness.current().binding.values, 'reference')).toBe(false);
    expect(Object.hasOwn(harness.current().form.state.values, 'reference')).toBe(false);
    expect(harness.current().binding.values).toEqual({ ...SAVED, notes: 'mine' });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it('StrictMode: the same snapshots across the double render, the rebase applied once', () => {
    const harness = setupInvoiceForm({ strict: true });
    const first = harness.current().binding;
    harness.bump();
    expect(harness.current().binding.values).toBe(first.values);
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SERVER, amount: '150' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(harness.current().rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    expect(harness.current().binding.values).toEqual({ ...SERVER, amount: '120' });
    harness.unmount();
  });
});

describe('no echo: listeners and validators', () => {
  it("the fields' listeners.onChange are not called by a rebase, keepMine or acceptTheirs; they are by the user's edit", () => {
    const changes: [string, string][] = [];
    const harness = setupInvoiceForm({ onFieldChange: (name, value) => changes.push([name, value]) });
    harness.type('Amount', '120');
    expect(changes).toEqual([['amount', '120']]);
    changes.length = 0;
    act(() => harness.current().rebase.rebase({ ...SERVER, amount: '150', notes: 'from the server' }));
    act(() => harness.current().rebase.acceptTheirs('amount'));
    expect(harness.current().binding.values).toEqual({ ...SERVER, amount: '150', notes: 'from the server' });
    expect(changes).toEqual([]);
    harness.unmount();
  });

  it("the onChange validators do not run on the server's values; an error on a field the rebase changed is removed, on a field it kept it stays", () => {
    const validated: [string, string][] = [];
    const harness = setupInvoiceForm({
      validate: (name, value) => {
        validated.push([name, value]);
        return value === 'bad' ? `${name} is bad` : undefined;
      },
    });
    harness.type('Amount', 'bad');
    harness.type('Notes', 'bad');
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual(['amount is bad']);
    expect(harness.current().form.state.fieldMeta.notes?.errors).toEqual(['notes is bad']);
    validated.length = 0;
    // The server changes Notes too, to the user's value: Notes keeps its value (no change), Amount is the user's
    // (a conflict, kept), Supplier is the server's.
    act(() => harness.current().rebase.rebase({ ...SERVER, amount: '150', notes: 'bad' }));
    expect(validated).toEqual([]);
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual(['amount is bad']);
    expect(harness.current().form.state.fieldMeta.notes?.errors).toEqual(['notes is bad']);
    // acceptTheirs gives Amount another value: its error was about the old one.
    act(() => harness.current().rebase.acceptTheirs('amount'));
    expect(validated).toEqual([]);
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual([]);
    expect(harness.current().form.state.fieldMeta.notes?.errors).toEqual(['notes is bad']);
    // The next change validates again.
    harness.type('Amount', 'bad');
    expect(harness.current().form.state.fieldMeta.amount?.errors).toEqual(['amount is bad']);
    harness.unmount();
  });
});
