// `useTanStackFormBinding` (ticket #508), the baseline that arrives after the mount: `form.reset(data)` and a new
// `defaultValues` passed to `useForm` (TanStack Form's `update()`), on a form not touched and on a touched one.
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, type RebaseFormBinding } from '../../engine';
import { EMPTY, SAVED, setupInvoiceForm, type Commit, type Invoice } from '../../../test/tanstack-harness';
import { useTanStackFormBinding, type TanStackFormOf } from './use-tanstack-form-binding';

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

// On a touched form TanStack Form's `update()` takes new defaults without recomputing its field meta (pinned in
// tanstack-form-internals.test.tsx): the binding has it recompute them at once, with one base-store update that keeps
// the values. This is what makes the recommended pattern (`defaultValues` kept on the binding's baseline, set after a
// save or a rebase) give `isDefaultValue` true on the saved and rebased fields.
describe("TanStack Form's field meta after a new defaultValues on a touched form", () => {
  const SERVER: Invoice = { ...SAVED, supplier: 'Lumen Parts Group' };

  it('defaultValues moved to the rebased record after the rebase: isDefaultValue at once, meta, values and summary untouched, no echo', () => {
    let record = SAVED;
    const changes: string[] = [];
    const validated: string[] = [];
    const harness = setupInvoiceForm({ defaults: () => record, onFieldChange: (name) => changes.push(name), validate: (name) => (validated.push(name), undefined) });
    harness.type('Notes', 'Checked by me');
    act(() => harness.current().rebase.rebase(SERVER));
    expect(harness.current().form.state.fieldMeta.supplier?.isDefaultValue).toBe(false);
    const { values, baseline } = harness.current().binding;
    const formValues = harness.current().form.state.values;
    const notesMeta = harness.current().form.state.fieldMeta.notes;
    // The app's state follows the binding's baseline, one render later (an effect).
    record = SERVER;
    harness.bump();
    const { form, binding, entries, rebase } = harness.current();
    expect(form.state.fieldMeta.supplier).toMatchObject({ isDefaultValue: true, isTouched: false, isDirty: false });
    expect(form.state.fieldMeta.amount?.isDefaultValue).toBe(true);
    expect(form.state.fieldMeta.notes).toMatchObject({ isDefaultValue: false, isTouched: notesMeta?.isTouched, isDirty: notesMeta?.isDirty });
    expect(form.state.values).toBe(formValues);
    expect(binding.values).toBe(values);
    expect(binding.baseline).toBe(baseline);
    expect(entries.map((entry) => entry.path)).toEqual(['notes']);
    expect(rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    expect(changes).toEqual(['notes']);
    expect(validated).toEqual(['notes']);
    // TanStack Form's own discard goes back to the rebased record.
    act(() => form.reset());
    expect(harness.current().form.state.values).toEqual(SERVER);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });

  it('a rehydration of a touched form (other content): isDefaultValue against the new defaults at once', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    harness.type('Amount', '120');
    record = { ...SAVED, supplier: 'Lumen Parts Group', amount: '120' };
    harness.bump();
    const { fieldMeta } = harness.current().form.state;
    expect([fieldMeta.supplier?.isDefaultValue, fieldMeta.amount?.isDefaultValue, fieldMeta.notes?.isDefaultValue]).toEqual([false, true, true]);
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['supplier']);
    harness.unmount();
  });

  it('an inline defaultValues of the same content on a touched form: no store update at any render (no loop)', () => {
    const harness = setupInvoiceForm({ defaults: () => ({ ...SAVED }) });
    harness.type('Amount', '120');
    let updates = 0;
    const subscription = harness.current().form.store.subscribe(() => {
      updates += 1;
    });
    const commits = harness.commits.length;
    harness.bump();
    harness.bump();
    harness.bump();
    expect(updates).toBe(0);
    expect(harness.commits.length).toBe(commits + 3);
    subscription.unsubscribe();
    harness.unmount();
  });

  it('a new defaultValues of other content on a touched form: one store update, then none at the next renders', () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => ({ ...record }) });
    harness.type('Amount', '120');
    let updates = 0;
    const subscription = harness.current().form.store.subscribe(() => {
      updates += 1;
    });
    record = { ...SAVED, amount: '120' };
    harness.bump();
    expect(updates).toBe(1);
    harness.bump();
    harness.bump();
    expect(updates).toBe(1);
    expect(harness.current().form.state.fieldMeta.amount?.isDefaultValue).toBe(true);
    subscription.unsubscribe();
    harness.unmount();
  });

  it("a new defaultValues on a form not touched: one store notification, update()'s (the binding's re-derive computes the same meta)", () => {
    let record = SAVED;
    const harness = setupInvoiceForm({ defaults: () => record });
    let updates = 0;
    const subscription = harness.current().form.store.subscribe(() => {
      updates += 1;
    });
    record = { ...SAVED, amount: '120' };
    harness.bump();
    // The one of `update()` (FormApi.js:97, one `baseStore.setState` in a batch).
    expect(updates).toBe(1);
    expect(harness.current().form.state.values).toEqual(record);
    expect(harness.current().form.state.fieldMeta.amount?.isDefaultValue).toBe(true);
    subscription.unsubscribe();
    harness.unmount();
  });
});

// The binding in a child of the component that calls `useForm` (`withForm` of `createFormHook`, a form passed as a
// prop): the child's layout effect runs before the parent's `formApi.update(opts)`, so a new `defaultValues` on a
// touched form (no store event) reaches the binding at its passive effect, one render later.
describe('the binding in a child of the component that calls useForm', () => {
  type Bound = { baseline: Invoice; entries: string[] };

  function setupChild() {
    let setRecord!: (record: Invoice) => void;
    let form!: TanStackFormOf<Invoice>;
    const seen: Bound[] = [];
    function Child({ bound }: { bound: TanStackFormOf<Invoice> }) {
      const binding = useTanStackFormBinding(bound);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
      seen.push({ baseline: binding.baseline, entries: entries.map((entry) => entry.path) });
      return null;
    }
    function Parent() {
      const [record, set] = useState(SAVED);
      setRecord = set;
      form = useForm({ defaultValues: record });
      return (
        <>
          <form.Field name="amount">
            {(field) => <input aria-label="Amount" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}
          </form.Field>
          <Child bound={form} />
        </>
      );
    }
    const view = render(<Parent />);
    return { seen, form: () => form, setRecord: (record: Invoice) => act(() => setRecord(record)), unmount: () => view.unmount() };
  }

  it('a touched form, new defaultValues: the baseline and TanStack Form follow them after the commit (passive resync)', () => {
    const child = setupChild();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '120' } });
    expect(child.seen.at(-1)!.entries).toEqual(['amount']);
    child.setRecord({ ...SAVED, amount: '120' });
    expect(child.seen.at(-1)!.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(child.seen.at(-1)!.entries).toEqual([]);
    expect(child.form().state.fieldMeta.amount?.isDefaultValue).toBe(true);
    child.unmount();
  });

  it('child: reset(saved) then defaultValues follow the baseline (same content): isDefaultValue recomputed', () => {
    let setRecord!: (r: Invoice) => void;
    let form!: TanStackFormOf<Invoice>;
    let binding!: RebaseFormBinding<Invoice>;
    const seen: string[][] = [];
    function Child({ bound }: { bound: TanStackFormOf<Invoice> }) {
      binding = useTanStackFormBinding(bound);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
      seen.push(entries.map((e) => e.path));
      return null;
    }
    function Parent() {
      const [record, set] = useState(SAVED);
      setRecord = set;
      form = useForm({ defaultValues: record });
      return (
        <>
          <form.Field name="amount">
            {(field) => <input aria-label="Amount" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}
          </form.Field>
          <Child bound={form} />
        </>
      );
    }
    render(<Parent />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '120' } });
    const saved = { ...SAVED, amount: '120' };
    act(() => binding.reset(saved));
    act(() => setRecord({ ...saved }));
    expect(binding.baseline).toBe(saved);
    expect(seen.at(-1)).toEqual([]);
    expect(form.state.fieldMeta.amount?.isDefaultValue).toBe(true);
  });
});
