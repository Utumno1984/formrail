// The behaviours of TanStack Form the adapter is built on (ticket #508, "da verificare" in the study of #489),
// pinned against the installed version: a release that changes one of them fails here, not silently in the
// consumers' forms. Each test names the lines of `@tanstack/form-core` / `@tanstack/react-form` 1.33.5 it pins.
// 1. `update()` with new defaults (useForm.js: `formApi.update(opts)` in a layout effect at EVERY render;
//    FormApi.js:93 `this.options = options`, unconditional; :94 the values follow only on a form not touched).
// 2. A write with no intermediate render and no runtime import: `form.baseStore.setState` (one store update), against
//    `reset(merged, { keepDefaultValues: true })` and `setFieldValue(..., { dontUpdateMeta })`, the two alternatives
//    the ticket asked to try first.
// 3. The echo: which calls run the fields' `listeners.onChange` and `onChange` validators.
// Plus the internal shape the adapter reads: the FormApi instance behind `form.Subscribe` (see `liveFormApi`).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useTanStackFormBinding, type TanStackFormOf } from './use-tanstack-form-binding';

type Invoice = { supplier: string; amount: string; notes: string };
const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };
const DATA: Invoice = { supplier: 'Halden Tools', amount: '100', notes: '' };

// Run from packages/pro (as public-api.test.tsx): jsdom's `import.meta.url` is not a file URL.
const PACKAGE = process.cwd();
const SOURCE = readFileSync(resolve(PACKAGE, 'src/integrations/tanstack-form/use-tanstack-form-binding.ts'), 'utf8');

/**
 * A TanStack Form form whose component renders again at every store change (as with the binding, or `useStore` in
 * the component), with a recorder of the committed values and spies on the listeners and validators.
 */
function setup(defaults: () => Invoice) {
  const commits: Invoice[] = [];
  const calls: string[] = [];
  let api!: TanStackFormOf<Invoice>;
  let bump!: () => void;
  function Host() {
    const [, setTick] = useState(0);
    bump = () => setTick((tick) => tick + 1);
    const form = useForm({ defaultValues: defaults() });
    api = form;
    const values = useSyncExternalStore(
      (listener) => form.store.subscribe(listener).unsubscribe,
      () => form.store.state.values,
    );
    useLayoutEffect(() => {
      commits.push(values);
    });
    return (
      <form>
        {(['supplier', 'amount', 'notes'] as const).map((name) => (
          <form.Field
            key={name}
            name={name}
            listeners={{ onChange: () => calls.push(`listener:${name}`) }}
            validators={{ onChange: () => (calls.push(`validator:${name}`), undefined) }}
          >
            {(field) => (
              <label>
                {name}
                <input value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
              </label>
            )}
          </form.Field>
        ))}
      </form>
    );
  }
  const view = render(<Host />);
  return { commits, calls, form: () => api, bump: () => act(() => bump()), unmount: () => view.unmount() };
}

describe('TanStack Form 1.33.5: the installed version', () => {
  it('is the tested minimum of the peer range', () => {
    const require = createRequire(resolve(PACKAGE, 'package.json'));
    const installed = (require('@tanstack/react-form/package.json') as { version: string }).version;
    const pkg = JSON.parse(readFileSync(resolve(PACKAGE, 'package.json'), 'utf8')) as { peerDependencies: Record<string, string> };
    expect(pkg.peerDependencies['@tanstack/react-form']).toBe(`^${installed}`);
  });
});

describe('1. update(): useForm re-applies its options at every render', () => {
  it('form.reset(data) with a defaultValues that does not follow: undone at the next render of the component', () => {
    const form = setup(() => EMPTY);
    act(() => form.form().reset(DATA));
    // The render that the store change caused committed the data, then `useForm`'s layout effect called
    // `update({ defaultValues: EMPTY })`: other defaults than the form's (`DATA`), no field touched (the reset
    // cleared the meta) -> the values are the defaults of `useForm` again.
    expect(form.commits).toContainEqual(DATA);
    expect(form.form().state.values).toEqual(EMPTY);
    form.unmount();
  });

  it('form.reset(data) with a defaultValues that follows the data: it stays', () => {
    let record = EMPTY;
    const form = setup(() => record);
    act(() => {
      record = DATA;
      form.form().reset(DATA);
    });
    form.bump();
    expect(form.form().state.values).toEqual(DATA);
    form.unmount();
  });

  it('form.reset(data, { keepDefaultValues: true }) stays, but TanStack Form compares with the old defaults', () => {
    const form = setup(() => EMPTY);
    act(() => form.form().reset(DATA, { keepDefaultValues: true }));
    form.bump();
    expect(form.form().state.values).toEqual(DATA);
    expect(form.form().state.fieldMeta.supplier?.isDefaultValue).toBe(false);
    form.unmount();
  });

  it('a new defaultValues: the values follow on a form not touched, not on a touched one (FormApi.js:94)', () => {
    let record = DATA;
    const form = setup(() => record);
    record = { ...DATA, supplier: 'Corvo Freight' };
    form.bump();
    expect(form.form().state.values.supplier).toBe('Corvo Freight');
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '120' } });
    record = { ...DATA, supplier: 'Mirra Logistics' };
    form.bump();
    expect(form.form().state.values).toEqual({ ...DATA, supplier: 'Corvo Freight', amount: '120' });
    form.unmount();
  });

  it('an inline defaultValues (a new object with the same content at every render) changes nothing', () => {
    const form = setup(() => ({ ...DATA }));
    const values = form.form().state.values;
    form.bump();
    form.bump();
    expect(form.form().state.values).toBe(values);
    form.unmount();
  });

  it("the object useForm returns is a copy of the FormApi: its options are those of the first render, the instance's follow", () => {
    let record = DATA;
    const form = setup(() => record);
    const frozen = form.form().options;
    record = { ...DATA, supplier: 'Corvo Freight' };
    form.bump();
    expect(form.form().options).toBe(frozen);
    expect(form.form().options.defaultValues).toEqual(DATA);
    const instance = (form.form().Subscribe as unknown as (props: { children: null }) => { props: { form: TanStackFormOf<Invoice> } })({ children: null }).props.form;
    expect(instance).not.toBe(form.form());
    expect(instance.store).toBe(form.form().store);
    expect(instance.options.defaultValues).toEqual({ ...DATA, supplier: 'Corvo Freight' });
    form.unmount();
  });

  it('isDirty is persistent: true after a field is brought back to its default, while isDefaultValue is true again', () => {
    const form = setup(() => DATA);
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '100' } });
    expect(form.form().state.isDirty).toBe(true);
    expect(form.form().state.fieldMeta.amount).toMatchObject({ isDirty: true, isDefaultValue: true });
    form.unmount();
  });
});

describe('2. writing values with no intermediate render, with the methods of the form only', () => {
  /** A form with the user's edit on `amount` (touched, blurred, dirty). */
  function edited() {
    const form = setup(() => DATA);
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '120' } });
    fireEvent.blur(screen.getByLabelText('amount'));
    form.calls.length = 0;
    return form;
  }
  const merged: Invoice = { ...DATA, supplier: 'Halden Tools Group', amount: '120' };

  it('form.baseStore.setState: one committed render with the merged values, meta untouched, no listener, no validator', () => {
    const form = edited();
    const from = form.commits.length;
    act(() => form.form().baseStore.setState((prev) => ({ ...prev, values: merged })));
    expect(form.commits.slice(from)).toEqual([merged]);
    expect(form.form().state.fieldMeta.amount).toMatchObject({ isTouched: true, isBlurred: true, isDirty: true });
    expect(form.form().state.fieldMeta.supplier).toMatchObject({ isTouched: false, isDirty: false });
    expect(form.calls).toEqual([]);
    form.unmount();
  });

  it('form.baseStore.setState removes a top-level key (setFieldValue cannot: it writes undefined)', () => {
    const form = edited();
    const without: Partial<Invoice> = { ...merged };
    delete without.notes;
    act(() => form.form().baseStore.setState((prev) => ({ ...prev, values: without as Invoice })));
    expect(Object.hasOwn(form.form().state.values, 'notes')).toBe(false);
    act(() => form.form().setFieldValue('supplier', undefined as never, { dontUpdateMeta: true }));
    expect(Object.hasOwn(form.form().state.values, 'supplier')).toBe(true);
    form.unmount();
  });

  it('alternative 1, reset(merged, { keepDefaultValues: true }): no intermediate render, but the meta of EVERY field is reset', () => {
    const form = edited();
    const from = form.commits.length;
    act(() => form.form().reset(merged, { keepDefaultValues: true }));
    expect(form.commits.slice(from)).toEqual([merged]);
    // The user's field is no longer touched nor dirty (FormApi.js:128-129, `resetFieldMeta`).
    expect(form.form().state.fieldMeta.amount).toMatchObject({ isTouched: false, isBlurred: false, isDirty: false });
    // And "after setting the defaults to incoming" is not possible either: `reset(incoming)` sets them, the next
    // render of `useForm` puts its own back (test above), and on a form not touched the values too.
    form.unmount();
  });

  it('alternative 2, setFieldValue with dontUpdateMeta (+ dontRunListeners, dontValidate): meta kept, but one store update per field', () => {
    const form = edited();
    const updates: unknown[] = [];
    const subscription = form.form().store.subscribe(() => updates.push(form.form().store.state.values));
    const from = form.commits.length;
    act(() => {
      const options = { dontUpdateMeta: true, dontRunListeners: true, dontValidate: true };
      form.form().setFieldValue('supplier', 'Halden Tools Group', options);
      form.form().setFieldValue('notes', 'from the server', options);
    });
    subscription.unsubscribe();
    // React batches the two updates into one render, but each one notifies the store's subscribers on its own: a
    // subscriber sees the state with only the first field written.
    expect(form.commits.slice(from)).toHaveLength(1);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates[0]).toEqual({ ...DATA, supplier: 'Halden Tools Group', amount: '120' });
    expect(form.form().state.fieldMeta.amount).toMatchObject({ isTouched: true, isDirty: true });
    expect(form.calls).toEqual([]);
    // Without `dontUpdateMeta` the field written is touched and dirty, as for a user edit.
    act(() => form.form().setFieldValue('notes', 'again', { dontRunListeners: true, dontValidate: true }));
    expect(form.form().state.fieldMeta.notes).toMatchObject({ isTouched: true, isDirty: true });
    form.unmount();
  });
});

describe('3. the echo: listeners.onChange and onChange validators', () => {
  it("a user edit (field.handleChange) runs the field's listener and validator", () => {
    const form = setup(() => DATA);
    fireEvent.change(screen.getByLabelText('amount'), { target: { value: '120' } });
    expect(form.calls).toEqual(['listener:amount', 'validator:amount']);
    form.unmount();
  });

  it('form.reset(data), a new defaultValues (update), baseStore.setState: no listener, no validator', () => {
    let record = DATA;
    const form = setup(() => record);
    act(() => {
      record = { ...DATA, notes: 'reset' };
      form.form().reset(record);
    });
    record = { ...DATA, notes: 'update' };
    form.bump();
    expect(form.form().state.values.notes).toBe('update');
    act(() => form.form().baseStore.setState((prev) => ({ ...prev, values: { ...DATA, notes: 'store' } })));
    expect(form.calls).toEqual([]);
    form.unmount();
  });

  it('setFieldValue with the default options runs both (it is what handleChange calls)', () => {
    const form = setup(() => DATA);
    act(() => form.form().setFieldValue('notes', 'x'));
    expect(form.calls).toEqual(['listener:notes', 'validator:notes']);
    form.unmount();
  });
});

describe('what the adapter reads of TanStack Form', () => {
  it('the adapter calls no TanStack Form function but through the form object, and names these members of it', () => {
    // The code only: the comments name more of TanStack Form's API (`form.reset`, `form.Field`, ...) to explain it.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const members = [...new Set([...code.matchAll(/\bform\.([A-Za-z]+)/g)].map((match) => match[1]))].sort();
    expect(members).toEqual(['Subscribe', 'baseStore', 'setFieldMeta', 'store']);
  });

  it('form.Subscribe renders the FormApi instance (same store) as its form prop: the adapter warns when it does not', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      let form!: TanStackFormOf<Invoice>;
      function Probe({ broken }: { broken: boolean }) {
        form = useForm({ defaultValues: DATA });
        const target = broken ? ({ ...form, Subscribe: () => null } as unknown as TanStackFormOf<Invoice>) : form;
        useTanStackFormBinding(target);
        return null;
      }
      const view = render(<Probe broken={false} />);
      expect(warn).not.toHaveBeenCalled();
      view.unmount();
      render(<Probe broken />);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toMatch(/useTanStackFormBinding: `form.Subscribe`/);
    } finally {
      warn.mockRestore();
    }
  });
});
