// `useTanStackFormBinding` (ticket #508), the baseline that arrives after the mount: `form.reset(data)` and a new
// `defaultValues` passed to `useForm` (TanStack Form's `update()`), on a form not touched and on a touched one.
import { act } from '@testing-library/react';
import { EMPTY, SAVED, setupInvoiceForm, type Commit, type Invoice } from '../../../test/tanstack-harness';

const DATA: Invoice = { supplier: 'Halden Tools', amount: '1200', notes: 'Net 30' };

const clean = (commit: Commit) => commit.entries.length === 0;
const untouchedMeta = (commit: Commit) => Object.values(commit.meta).every((meta) => !meta.isTouched && !meta.isBlurred && !meta.isDirty);

/** A form mounted empty whose `useForm` takes `record` (null while it loads), with spies on listeners and validators. */
function mountedEmpty() {
  const state: { record: Invoice | null } = { record: null };
  const changes: string[] = [];
  const validated: string[] = [];
  const harness = setupInvoiceForm({
    defaults: () => state.record ?? EMPTY,
    onFieldChange: (name) => changes.push(name),
    validate: (name) => (validated.push(name), undefined),
  });
  return { harness, state, changes, validated };
}

describe('hydration after the mount, with form.reset(data)', () => {
  it("defaultValues that follow the loaded record: no entry in any render, no field meta, no listener, no validator", () => {
    const { harness, state, changes, validated } = mountedEmpty();
    const from = harness.commits.length;
    act(() => {
      state.record = DATA;
      harness.current().form.reset(DATA);
    });
    const { binding, entries, form } = harness.current();
    expect(binding.baseline).toEqual(DATA);
    expect(binding.values).toBe(binding.baseline);
    expect(entries).toEqual([]);
    expect(form.state.values).toEqual(DATA);
    expect(harness.input('Supplier').value).toBe('Halden Tools');
    expect(harness.commits.slice(from).length).toBeGreaterThan(0);
    expect(harness.commits.every(clean)).toBe(true);
    expect(harness.commits.every(untouchedMeta)).toBe(true);
    expect(changes).toEqual([]);
    expect(validated).toEqual([]);
    // A later render changes nothing (the defaultValues have the content TanStack Form holds).
    harness.bump();
    expect(harness.current().form.state.values).toEqual(DATA);
    harness.unmount();
  });

  it('is a rehydration for useFormRebase: open conflicts and applied cleared', () => {
    const { harness, state } = mountedEmpty();
    act(() => {
      state.record = DATA;
      harness.current().form.reset(DATA);
    });
    harness.type('Amount', '1300');
    act(() => harness.current().rebase.rebase({ ...DATA, supplier: 'Halden Tools Ltd', amount: '1500' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(harness.current().rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    const reload: Invoice = { supplier: 'Corvo Freight', amount: '900', notes: '' };
    const from = harness.commits.length;
    act(() => {
      state.record = reload;
      harness.current().form.reset(reload);
    });
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().rebase.applied).toEqual([]);
    expect(harness.current().binding.values).toEqual(reload);
    expect(harness.current().binding.baseline).toEqual(reload);
    expect(harness.current().form.state.values).toEqual(reload);
    // TanStack Form's reset clears the meta of every field: nothing touched or dirty.
    expect(untouchedMeta(harness.last())).toBe(true);
    const reloaded = harness.commits.slice(from).filter((commit) => commit.baseline.supplier === 'Corvo Freight');
    expect(reloaded.length).toBeGreaterThan(0);
    expect(reloaded.every((commit) => clean(commit) && commit.values === commit.baseline)).toBe(true);
    harness.unmount();
  });

  it("defaultValues left on the empty record: TanStack Form puts them back at the next render of useForm (documented); never an entry", () => {
    const harness = setupInvoiceForm({ defaults: () => EMPTY });
    const from = harness.commits.length;
    act(() => harness.current().form.reset(DATA));
    // `useForm` calls `formApi.update(opts)` at every render: the defaults differ from the form's, no field is
    // touched (the reset cleared the meta), so TanStack Form resets the values to `opts.defaultValues`.
    expect(harness.current().form.state.values).toEqual(EMPTY);
    expect(harness.current().binding.baseline).toEqual(EMPTY);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    // The render in between showed the data as the baseline, with no entry either.
    expect(harness.commits.slice(from).some((commit) => commit.baseline.supplier === 'Halden Tools')).toBe(true);
    expect(harness.commits.every(clean)).toBe(true);
    harness.unmount();
  });
});

describe("hydration with a new defaultValues passed to useForm (TanStack Form's update())", () => {
  it('a form not touched: TanStack Form takes the new values; no entry, no meta, no listener, no validator', () => {
    const { harness, state, changes, validated } = mountedEmpty();
    const from = harness.commits.length;
    state.record = DATA;
    harness.bump();
    expect(harness.current().form.state.values).toEqual(DATA);
    expect(harness.current().binding.baseline).toEqual(DATA);
    expect(harness.current().binding.values).toBe(harness.current().binding.baseline);
    expect(harness.input('Notes').value).toBe('Net 30');
    expect(harness.commits.slice(from).length).toBeGreaterThan(0);
    expect(harness.commits.every(clean)).toBe(true);
    expect(harness.commits.every(untouchedMeta)).toBe(true);
    expect(changes).toEqual([]);
    expect(validated).toEqual([]);
    harness.unmount();
  });

  it('a form not touched, with open conflicts: a rehydration (conflicts and applied cleared)', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    // A conflict on a value set by code (not touched for TanStack Form).
    act(() => harness.current().binding.setValues({ amount: '120' }));
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150', supplier: 'Lumen Parts Group' }));
    expect(harness.current().rebase.conflicts).toHaveLength(1);
    expect(harness.current().form.state.isTouched).toBe(false);
    record = DATA;
    harness.bump();
    expect(harness.current().form.state.values).toEqual(DATA);
    expect(harness.current().rebase.conflicts).toEqual([]);
    expect(harness.current().rebase.applied).toEqual([]);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it("a TOUCHED form: TanStack Form keeps the values; the baseline is the new defaultValues (TanStack Form compares with them); conflicts cleared", () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150', notes: 'from the server' }));
    expect(harness.current().rebase.conflicts).toHaveLength(1);
    const next: Invoice = { ...SAVED, supplier: 'Lumen Parts Group' };
    const from = harness.commits.length;
    record = next;
    harness.bump();
    const { form, binding, entries, rebase } = harness.current();
    // TanStack Form (FormApi.js:94): a touched form keeps its values, against the new defaults.
    expect(form.state.values).toEqual({ ...SAVED, amount: '120', notes: 'from the server' });
    expect(binding.baseline).toEqual(next);
    expect(binding.values).toEqual(form.state.values);
    expect(entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([
      ['supplier', 'Lumen Parts Group', 'Lumen Parts'],
      ['amount', '100', '120'],
      ['notes', '', 'from the server'],
    ]);
    expect(rebase.conflicts).toEqual([]);
    expect(rebase.applied).toEqual([]);
    // The render of the new defaultValues was computed before TanStack Form took them (in `useForm`'s layout effect):
    // it still shows the old baseline; every later render shows the new one.
    const later = harness.commits.slice(from);
    expect(later.at(-1)!.baseline).toEqual(next);
    expect(later.slice(1).every((commit) => commit.baseline === binding.baseline)).toBe(true);
    // TanStack Form's own view agrees on the field the user did not touch: the old value is not its default.
    harness.type('Notes', 'from the server ');
    expect(harness.current().form.state.fieldMeta.supplier?.isDefaultValue).toBe(false);
    harness.unmount();
  });

  it('a new defaultValues with the content of the current baseline (an app that follows binding.reset(saved)): no change', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    const { baseline } = harness.current().binding;
    record = { ...SAVED, amount: '150' };
    harness.bump();
    expect(harness.current().binding.baseline).toBe(baseline);
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    harness.unmount();
  });
});
