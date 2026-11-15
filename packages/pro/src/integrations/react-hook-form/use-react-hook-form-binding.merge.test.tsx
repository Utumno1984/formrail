// `useReactHookFormBinding` (ticket #507, critic round 5): the merge of the binding's deferred write with the writes of
// the app made in the same synchronous run (`adoptWrites`), on the shape of an array and on keys that come and go, and
// the cases of the round that no other test pinned (each one fails if the line it guards is changed).
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, type ChangeEntry, type RebaseFormBinding } from '../../engine';
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
