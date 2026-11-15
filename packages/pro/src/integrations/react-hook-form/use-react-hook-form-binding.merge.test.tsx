// `useReactHookFormBinding` (ticket #507, critic round 5): the merge of the binding's deferred write with the writes of
// the app made in the same synchronous run (`adoptWrites`), on the shape of an array and on keys that come and go, and
// the cases of the round that no other test pinned (each one fails if the line it guards is changed).
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, type ChangeEntry, type RebaseFormBinding } from '../../engine';
import { SAVED, setupInvoiceForm } from '../../../test/rhf-harness';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

type Line = { id: number; qty: string; note: string };
type Address = { city: string; zip?: string };
type Order = { supplier: string; lines: Line[]; address?: Address; extra?: string };

const L1: Line = { id: 1, qty: '1', note: 'a' };
const L2: Line = { id: 2, qty: '2', note: 'b' };
const L3: Line = { id: 3, qty: '3', note: 'c' };
const ORDER: Order = { supplier: 'Acme', lines: [L1, L2] };
const ID_KEYS = { lines: 'id' };

interface Probe {
  form: UseFormReturn<Order>;
  binding: RebaseFormBinding<Order>;
  entries: ChangeEntry[];
  append: (line: Line) => void;
  remove: (index: number) => void;
  setSaving: (saving: boolean) => void;
}

/** `ownSave`: `isSaving` comes from the option (`setSaving`), as for a save that does not go through `handleSubmit`. */
function setupOrder(options: { idKeys?: boolean; defaults?: Order; ownSave?: boolean } = {}) {
  let probe!: Probe;
  const arrayIdKeys = options.idKeys === false ? undefined : ID_KEYS;
  function OrderForm() {
    const form = useForm<Order>({ defaultValues: options.defaults ?? ORDER });
    const [saving, setSaving] = useState(false);
    const binding = useReactHookFormBinding(form, { arrayIdKeys, ...(options.ownSave ? { isSaving: saving, saveError: null } : {}) });
    const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys });
    const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' });
    probe = { form, binding, entries, append, remove, setSaving };
    return (
      <form>
        <label>
          Supplier
          <input {...form.register('supplier')} />
        </label>
        {fields.map((field, index) => (
          <div key={field.key}>
            <label>
              {`Qty ${index + 1}`}
              <input {...form.register(`lines.${index}.qty`)} />
            </label>
            <label>
              {`Note ${index + 1}`}
              <input {...form.register(`lines.${index}.note`)} />
            </label>
          </div>
        ))}
      </form>
    );
  }
  const view = render(<OrderForm />);
  return {
    current: () => probe,
    input: (label: string) => screen.getByLabelText(label) as HTMLInputElement,
    /** The value of every Qty input in the DOM, in order. */
    domQtys: () => screen.queryAllByLabelText(/^Qty \d+$/).map((input) => (input as HTMLInputElement).value),
    unmount: () => view.unmount(),
  };
}

type Setup = ReturnType<typeof setupOrder>;
const paths = (entries: ChangeEntry[]) => entries.map((entry) => entry.path).sort();

/** React Hook Form, the binding and the DOM all hold `expected`. */
function expectEverywhere(order: Setup, expected: Order) {
  expect(order.current().form.getValues()).toEqual(expected);
  expect(order.current().binding.values).toEqual(expected);
  expect(order.domQtys()).toEqual(expected.lines.map((line) => line.qty));
}

describe('useReactHookFormBinding: the binding changes the shape of an array, the app writes fields of its rows in the same run', () => {
  it("the critic's case: the binding adds a row, the app writes a field of row 1: three rows, the app's value on row 1", () => {
    const order = setupOrder();
    act(() => {
      order.current().binding.setValues({ lines: [L1, L2, L3] });
      order.current().form.setValue('lines.0.qty', 'app');
    });
    expectEverywhere(order, { supplier: 'Acme', lines: [{ ...L1, qty: 'app' }, L2, L3] });
    expect(paths(order.current().entries)).toEqual(['lines.0.qty', 'lines.2']);
    order.unmount();
  });

  it('the same without arrayIdKeys: the rows are matched by index', () => {
    const order = setupOrder({ idKeys: false });
    act(() => {
      order.current().binding.setValues({ lines: [L1, L2, L3] });
      order.current().form.setValue('lines.0.qty', 'app');
    });
    expectEverywhere(order, { supplier: 'Acme', lines: [{ ...L1, qty: 'app' }, L2, L3] });
    order.unmount();
  });

  it("the binding adds a row and edits another, the app writes a field of a third one and of the edited one: each write stays on its row", () => {
    const order = setupOrder({ defaults: { ...ORDER, lines: [L1, L2, { ...L3, qty: '30' }] } });
    act(() => {
      order.current().binding.setValues({ lines: [L1, { ...L2, note: 'server' }, { ...L3, qty: '30' }, { id: 4, qty: '4', note: 'd' }] });
      order.current().form.setValue('lines.2.qty', 'app 3');
      order.current().form.setValue('lines.1.qty', 'app 2');
    });
    expectEverywhere(order, {
      supplier: 'Acme',
      lines: [L1, { ...L2, qty: 'app 2', note: 'server' }, { ...L3, qty: 'app 3' }, { id: 4, qty: '4', note: 'd' }],
    });
    order.unmount();
  });

  it("the binding reorders the rows (arrayIdKeys), the app writes a field of the first row: the binding's order, the write on the row with that id", () => {
    const order = setupOrder();
    act(() => {
      order.current().binding.setValues({ lines: [L2, L1] });
      order.current().form.setValue('lines.0.qty', 'app');
    });
    expectEverywhere(order, { supplier: 'Acme', lines: [L2, { ...L1, qty: 'app' }] });
    expect(order.input('Qty 2').value).toBe('app');
    expect(order.input('Note 2').value).toBe('a');
    order.unmount();
  });

  it('the binding removes the first row (arrayIdKeys), the app writes both rows: the write on the kept row stays, the one on the removed row goes with it', () => {
    const order = setupOrder();
    act(() => {
      order.current().binding.setValues({ lines: [L2] });
      order.current().form.setValue('lines.0.qty', 'on the removed row');
      order.current().form.setValue('lines.1.qty', 'on the kept row');
    });
    expectEverywhere(order, { supplier: 'Acme', lines: [{ ...L2, qty: 'on the kept row' }] });
    order.unmount();
  });

  it("both change the shape (the binding adds a row, then the app removes one): the app's array, the binding's write elsewhere stays", () => {
    const order = setupOrder();
    act(() => {
      order.current().binding.setValues({ supplier: 'Server', lines: [L1, L2, L3] });
      order.current().remove(0);
    });
    expectEverywhere(order, { supplier: 'Server', lines: [L2] });
    order.unmount();
  });
});

describe('useReactHookFormBinding: a useFieldArray operation of the app before a write of the binding, in the same run', () => {
  it("append, then binding.setValues on another field: the appended row stays (the critic's note)", () => {
    const order = setupOrder();
    act(() => {
      order.current().append(L3);
      order.current().binding.setValues({ supplier: 'Server' });
    });
    expectEverywhere(order, { supplier: 'Server', lines: [L1, L2, L3] });
    expect(paths(order.current().entries)).toEqual(['lines.2', 'supplier']);
    order.unmount();
  });

  it('remove, then binding.setValues on another field: the row stays removed', () => {
    const order = setupOrder();
    act(() => {
      order.current().remove(0);
      order.current().binding.setValues({ supplier: 'Server' });
    });
    expectEverywhere(order, { supplier: 'Server', lines: [L2] });
    order.unmount();
  });

  it('append, then binding.reset(record): the reset came last, the record wins whole', () => {
    const order = setupOrder();
    const record = { ...ORDER, supplier: 'Server' };
    act(() => {
      order.current().append(L3);
      order.current().binding.reset(record);
    });
    expectEverywhere(order, record);
    expect(order.current().binding.baseline).toBe(record);
    expect(order.current().entries).toEqual([]);
    order.unmount();
  });

  it('append, then binding.setValues of the array: the binding wrote the array last, its rows win', () => {
    const order = setupOrder();
    act(() => {
      order.current().append(L3);
      order.current().binding.setValues({ lines: [{ ...L1, qty: 'server' }] });
    });
    expectEverywhere(order, { supplier: 'Acme', lines: [{ ...L1, qty: 'server' }] });
    order.unmount();
  });

  it('between two writes of the binding: setValues, append, setValues of the array: the last write (the binding) wins', () => {
    const order = setupOrder();
    act(() => {
      order.current().binding.setValues({ supplier: 'Server' });
      order.current().append(L3);
      order.current().binding.setValues({ lines: [L2, L3] });
    });
    expectEverywhere(order, { supplier: 'Server', lines: [L2, L3] });
    order.unmount();
  });

  it('during a save of your own, append then binding.reset(saved): the row appended during the save is an edit, it stays (dirty)', () => {
    const order = setupOrder({ ownSave: true });
    act(() => order.current().setSaving(true));
    const saved = { ...ORDER, supplier: 'ACME' };
    act(() => {
      order.current().append(L3);
      order.current().binding.reset(saved);
    });
    act(() => order.current().setSaving(false));
    expectEverywhere(order, { supplier: 'ACME', lines: [L1, L2, L3] });
    expect(order.current().binding.baseline).toBe(saved);
    expect(paths(order.current().entries)).toEqual(['lines.2']);
    order.unmount();
  });

  it('remove, then binding.setValues on another field: the error of the row that moved up stays on it', () => {
    const order = setupOrder();
    act(() => order.current().form.setError('lines.1.qty', { type: 'manual', message: 'Qty of row 2' }));
    act(() => {
      order.current().remove(0);
      order.current().binding.setValues({ supplier: 'Server' });
    });
    expectEverywhere(order, { supplier: 'Server', lines: [L2] });
    expect(order.current().form.getFieldState('lines.0.qty').error?.message).toBe('Qty of row 2');
    order.unmount();
  });

  it('between two writes of the binding: setValues, append, setValues of another field: the appended row stays', () => {
    const order = setupOrder();
    act(() => {
      order.current().binding.setValues({ supplier: 'Server' });
      order.current().append(L3);
      order.current().binding.setValues({ extra: 'x' });
    });
    expectEverywhere(order, { supplier: 'Server', lines: [L1, L2, L3], extra: 'x' });
    order.unmount();
  });
});

describe('useReactHookFormBinding: keys that come and go while a write of the binding waits (critic round 5, M17 M18 M26)', () => {
  it('binding.reset(a record without a key) then form.setValue on another field: the key is gone, not left undefined', () => {
    const order = setupOrder({ defaults: { ...ORDER, extra: 'e' } });
    act(() => {
      order.current().binding.reset(ORDER);
      order.current().form.setValue('supplier', 'app');
    });
    const { binding, form } = order.current();
    expect(Object.hasOwn(form.getValues(), 'extra')).toBe(false);
    expect(Object.hasOwn(binding.values, 'extra')).toBe(false);
    expect(form.getValues()).toEqual({ ...ORDER, supplier: 'app' });
    expect(paths(order.current().entries)).toEqual(['supplier']);
    order.unmount();
  });

  it('binding.setValues then form.unregister of a key: the key stays removed, the write of the binding stays', () => {
    const order = setupOrder({ defaults: { ...ORDER, extra: 'e' } });
    act(() => {
      order.current().binding.setValues({ supplier: 'Server' });
      order.current().form.unregister('extra');
    });
    const { binding, form } = order.current();
    expect(Object.hasOwn(form.getValues(), 'extra')).toBe(false);
    expect(Object.hasOwn(binding.values, 'extra')).toBe(false);
    expect(form.getValues().supplier).toBe('Server');
    expect(binding.values.supplier).toBe('Server');
    order.unmount();
  });

  it('binding.reset(a record whose nested object lacks a key): the nested key is gone from React Hook Form too', () => {
    const order = setupOrder({ defaults: { ...ORDER, address: { city: 'Turin', zip: '10100' } } });
    const record: Order = { ...ORDER, address: { city: 'Milan' } };
    act(() => order.current().binding.reset(record));
    const { binding, entries, form } = order.current();
    expect(form.getValues().address).toEqual({ city: 'Milan' });
    expect(Object.hasOwn(form.getValues().address!, 'zip')).toBe(false);
    expect(binding.values).toEqual(record);
    expect(binding.baseline).toBe(record);
    expect(entries).toEqual([]);
    order.unmount();
  });
});

describe('useReactHookFormBinding: rows without arrayIdKeys (critic round 5, M24)', () => {
  it('the binding writes a field of row 1 while the user types in row 2: the rows keep their nodes and the focus stays', () => {
    const order = setupOrder({ idKeys: false });
    const qty2 = order.input('Qty 2');
    const qty1 = order.input('Qty 1');
    qty2.focus();
    fireEvent.input(qty2, { target: { value: '22' } });
    act(() => {
      order.current().binding.setValues({ supplier: 'Server', lines: [{ ...L1, qty: 'server' }, { ...L2, qty: '22' }] });
    });
    expect(order.input('Qty 1')).toBe(qty1);
    expect(order.input('Qty 2')).toBe(qty2);
    expect(document.activeElement).toBe(qty2);
    expect(qty1.value).toBe('server');
    expect(qty2.value).toBe('22');
    order.unmount();
  });
});

describe('useReactHookFormBinding: several writes of the binding and of the app in one run (critic round 5, M29 M09)', () => {
  it('two binding.reset in the same run: React Hook Form ends with the defaults of the second (dirtyFields against it)', () => {
    const harness = setupInvoiceForm();
    const first = { ...SAVED, supplier: 'First' };
    const second = { ...SAVED, supplier: 'Second' };
    act(() => {
      harness.current().binding.reset(first);
      harness.current().binding.reset(second);
    });
    const { binding, entries, form } = harness.current();
    expect(form.control._defaultValues).toEqual(second);
    expect(form.getValues()).toEqual(second);
    expect(form.formState.isDirty).toBe(false);
    expect(form.formState.dirtyFields).toEqual({});
    expect(binding.baseline).toBe(second);
    expect(binding.values).toBe(second);
    expect(entries).toEqual([]);
    expect(harness.input('Supplier').value).toBe('Second');
    harness.unmount();
  });

  it('binding.reset(x), form.resetDefaultValues(d) (no value event), binding.setValues(p): the values are x with p, the baseline d', () => {
    const harness = setupInvoiceForm();
    const defaults = { ...SAVED, supplier: 'Defaults of the app' };
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.resetDefaultValues(defaults);
      harness.current().binding.setValues({ amount: '2' });
    });
    const expected = { ...SAVED, supplier: 'Server', amount: '2' };
    const { binding, form } = harness.current();
    expect(form.getValues()).toEqual(expected);
    expect(binding.values).toEqual(expected);
    expect(binding.baseline).toEqual(defaults);
    expect(form.control._defaultValues).toEqual(defaults);
    expect(harness.input('Supplier').value).toBe('Server');
    expect(harness.input('Amount').value).toBe('2');
    harness.unmount();
  });

  it('binding.reset, form.reset(data), binding.setValues, form.setValue: the last two writes both stay, measured from data', () => {
    const harness = setupInvoiceForm();
    const data = { supplier: 'Reloaded', amount: '1', notes: '' };
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.reset(data);
      harness.current().binding.setValues({ amount: '2' });
      harness.current().form.setValue('notes', 'app');
    });
    const expected = { supplier: 'Reloaded', amount: '2', notes: 'app' };
    const { binding, form } = harness.current();
    expect(form.getValues()).toEqual(expected);
    expect(binding.values).toEqual(expected);
    expect(binding.baseline).toEqual(data);
    expect(harness.input('Amount').value).toBe('2');
    expect(harness.input('Notes').value).toBe('app');
    harness.unmount();
  });
});
