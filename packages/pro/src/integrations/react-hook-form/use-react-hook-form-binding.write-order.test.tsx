// `useReactHookFormBinding` (ticket #507, QA round 4, point 2): the binding writes to React Hook Form at the end of the
// synchronous run, so a write of the app made after `binding.reset` / `binding.setValues` in the same run must never be
// undone by it. The last write in call order wins, in `getValues()`, in the binding and in the DOM.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, type ChangeEntry, type RebaseFormBinding } from '../../engine';
import { SAVED, setupInvoiceForm } from '../../../test/rhf-harness';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

const paths = (entries: ChangeEntry[]) => entries.map((entry) => entry.path);

describe('useReactHookFormBinding: a write of the app after a write of the binding, in the same run', () => {
  it('binding.reset(x) then form.setValue on another field: both stay (getValues, binding, DOM), the app value dirty against x', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const next = { ...SAVED, supplier: 'Server' };
    act(() => {
      harness.current().binding.reset(next);
      harness.current().form.setValue('notes', 'app wrote this', { shouldDirty: true });
    });
    const { binding, entries, form } = harness.current();
    const expected = { ...SAVED, supplier: 'Server', notes: 'app wrote this' };
    expect(form.getValues()).toEqual(expected);
    expect(binding.values).toEqual(expected);
    expect(binding.baseline).toBe(next);
    expect(harness.input('Notes').value).toBe('app wrote this');
    expect(harness.input('Supplier').value).toBe('Server');
    expect(harness.input('Amount').value).toBe('100');
    expect(paths(entries)).toEqual(['notes']);
    expect(form.formState.dirtyFields).toEqual({ notes: true });
    // No committed render shows the app's value lost once it was written.
    const written = harness.commits.findIndex((commit) => commit.dom.notes === 'app wrote this');
    expect(written).toBeGreaterThanOrEqual(0);
    expect(harness.commits.slice(written).every((commit) => commit.dom.notes === 'app wrote this')).toBe(true);
    harness.unmount();
  });

  it('binding.setValues(patch) then form.setValue on another field: both stay', () => {
    const harness = setupInvoiceForm();
    act(() => {
      harness.current().binding.setValues({ supplier: 'X' });
      harness.current().form.setValue('amount', '555');
    });
    const { binding, form } = harness.current();
    expect(form.getValues()).toEqual({ ...SAVED, supplier: 'X', amount: '555' });
    expect(binding.values).toEqual(form.getValues());
    expect(harness.input('Supplier').value).toBe('X');
    expect(harness.input('Amount').value).toBe('555');
    harness.unmount();
  });

  it('binding.setValues then form.setValue on the same field: the app wrote last, its value wins', () => {
    const harness = setupInvoiceForm();
    act(() => {
      harness.current().binding.setValues({ supplier: 'From the binding' });
      harness.current().form.setValue('supplier', 'From the app');
    });
    expect(harness.current().form.getValues().supplier).toBe('From the app');
    expect(harness.current().binding.values.supplier).toBe('From the app');
    expect(harness.input('Supplier').value).toBe('From the app');
    harness.unmount();
  });

  it('form.setValue then binding.setValues on the same field: the binding wrote last, its value wins', () => {
    const harness = setupInvoiceForm();
    act(() => {
      harness.current().form.setValue('supplier', 'From the app');
      harness.current().binding.setValues({ supplier: 'From the binding' });
    });
    expect(harness.current().form.getValues().supplier).toBe('From the binding');
    expect(harness.current().binding.values.supplier).toBe('From the binding');
    expect(harness.input('Supplier').value).toBe('From the binding');
    harness.unmount();
  });

  it('binding.reset, form.setValue, then binding.setValues on the field the app wrote: the last one (the binding) wins', () => {
    const harness = setupInvoiceForm();
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.setValue('notes', 'app');
      harness.current().binding.setValues({ notes: 'binding' });
    });
    const expected = { ...SAVED, supplier: 'Server', notes: 'binding' };
    expect(harness.current().form.getValues()).toEqual(expected);
    expect(harness.current().binding.values).toEqual(expected);
    expect(harness.input('Notes').value).toBe('binding');
    harness.unmount();
  });

  it('app, binding, app on the same field then another one: each write is measured from the one before (the binding keeps the field)', () => {
    const harness = setupInvoiceForm();
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.setValue('notes', 'app');
      harness.current().binding.setValues({ notes: 'binding' });
      harness.current().form.setValue('amount', '7');
    });
    const expected = { supplier: 'Server', amount: '7', notes: 'binding' };
    expect(harness.current().form.getValues()).toEqual(expected);
    expect(harness.current().binding.values).toEqual(expected);
    expect(harness.input('Notes').value).toBe('binding');
    expect(harness.input('Amount').value).toBe('7');
    harness.unmount();
  });

  it('inside the handleSubmit handler: binding.reset(saved) then form.setValue of a field the server does not own', async () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    await act(async () => {
      await harness.current().form.handleSubmit(async (sent) => {
        await Promise.resolve();
        harness.current().binding.reset({ ...sent });
        harness.current().form.setValue('notes', 'Saved at 10:00');
      })();
    });
    const { binding, entries, form } = harness.current();
    expect(form.getValues()).toEqual({ ...SAVED, amount: '120', notes: 'Saved at 10:00' });
    expect(binding.values).toEqual(form.getValues());
    expect(binding.baseline).toEqual({ ...SAVED, amount: '120' });
    expect(harness.input('Notes').value).toBe('Saved at 10:00');
    expect(paths(entries)).toEqual(['notes']);
    expect(binding.isSaving).toBe(false);
    expect(binding.saveError).toBeNull();
    harness.unmount();
  });

  it('binding.reset(x) then form.reset(data): the app reset wins whole (values, baseline, clean)', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const data = { supplier: 'Reloaded', amount: '1', notes: 'r' };
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.reset(data);
    });
    const { binding, entries, form } = harness.current();
    expect(form.getValues()).toEqual(data);
    expect(binding.values).toEqual(data);
    expect(binding.baseline).toEqual(data);
    expect(binding.values).toBe(binding.baseline);
    expect(harness.input('Supplier').value).toBe('Reloaded');
    expect(entries).toEqual([]);
    expect(form.formState.isDirty).toBe(false);
    harness.unmount();
  });

  it('binding.reset(x) then form.reset(data) where data keeps a value the form held: data wins there too', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    // `amount` of data is what React Hook Form held before both writes; the binding's write set it to 100.
    const data = { supplier: 'Reloaded', amount: '120', notes: '' };
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.reset(data);
    });
    expect(harness.current().form.getValues()).toEqual(data);
    expect(harness.current().binding.values).toEqual(data);
    expect(harness.current().binding.baseline).toEqual(data);
    expect(harness.input('Amount').value).toBe('120');
    expect(harness.current().form.formState.isDirty).toBe(false);
    harness.unmount();
  });

  it('binding.reset(saved) then form.reset(saved), the same record: consistent and clean', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    const saved = { ...SAVED, amount: '120' };
    act(() => {
      harness.current().binding.reset(saved);
      harness.current().form.reset(saved);
    });
    expect(harness.current().form.getValues()).toEqual(saved);
    expect(harness.current().binding.values).toEqual(saved);
    expect(harness.current().binding.baseline).toEqual(saved);
    expect(harness.current().form.formState.isDirty).toBe(false);
    harness.unmount();
  });

  it('binding.reset(x) then form.resetDefaultValues(d) (no value event): the defaults of the app win, the baseline follows them', () => {
    const harness = setupInvoiceForm();
    const defaults = { ...SAVED, supplier: 'Defaults of the app' };
    act(() => {
      harness.current().binding.reset({ ...SAVED, supplier: 'Server' });
      harness.current().form.resetDefaultValues(defaults);
    });
    const { binding, entries, form } = harness.current();
    expect(form.control._defaultValues).toEqual(defaults);
    expect(binding.baseline).toEqual(defaults);
    expect(form.getValues()).toEqual({ ...SAVED, supplier: 'Server' });
    expect(binding.values).toEqual(form.getValues());
    expect(paths(entries)).toEqual(['supplier']);
    harness.unmount();
  });
});

type Line = { id: number; qty: string; note: string };
type Order = { supplier: string; lines: Line[] };
const ORDER: Order = { supplier: 'Acme', lines: [{ id: 1, qty: '1', note: 'a' }, { id: 2, qty: '2', note: 'b' }] };
const ID_KEYS = { lines: 'id' };

function setupRows() {
  let probe!: {
    form: UseFormReturn<Order>;
    binding: RebaseFormBinding<Order>;
    entries: ChangeEntry[];
    append: (line: Line) => void;
    remove: (index: number) => void;
  };
  function OrderForm() {
    const form = useForm<Order>({ defaultValues: ORDER });
    const binding = useReactHookFormBinding(form, { arrayIdKeys: ID_KEYS });
    const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: ID_KEYS });
    const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' });
    probe = { form, binding, entries, append, remove };
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
  return { current: () => probe, input: (label: string) => screen.getByLabelText(label) as HTMLInputElement, unmount: () => view.unmount() };
}

describe('useReactHookFormBinding: a write of the app in a useFieldArray row after a write of the binding, in the same run', () => {
  it('the binding writes a field of a row, the app another field of the same row: both stay, no row remounts, the focus stays', () => {
    const rows = setupRows();
    const qty = rows.input('Qty 2');
    const note = rows.input('Note 2');
    qty.focus();
    fireEvent.input(qty, { target: { value: '22' } });
    act(() => {
      const { binding, form } = rows.current();
      binding.setValues({ supplier: 'Server', lines: [ORDER.lines[0]!, { id: 2, qty: '22', note: 'from the binding' }] });
      form.setValue('lines.1.qty', '23');
    });
    expect(rows.input('Qty 2')).toBe(qty);
    expect(rows.input('Note 2')).toBe(note);
    expect(document.activeElement).toBe(qty);
    const expected = { supplier: 'Server', lines: [ORDER.lines[0], { id: 2, qty: '23', note: 'from the binding' }] };
    expect(rows.current().form.getValues()).toEqual(expected);
    expect(rows.current().binding.values).toEqual(expected);
    expect(qty.value).toBe('23');
    expect(note.value).toBe('from the binding');
    expect(rows.input('Supplier').value).toBe('Server');
    rows.unmount();
  });

  it('the binding and the app write the same field of a row: the app wrote last, its value wins', () => {
    const rows = setupRows();
    act(() => {
      const { binding, form } = rows.current();
      binding.setValues({ lines: [{ id: 1, qty: '10', note: 'a' }, ORDER.lines[1]!] });
      form.setValue('lines.0.qty', '11');
    });
    expect(rows.current().form.getValues().lines[0]).toEqual({ id: 1, qty: '11', note: 'a' });
    expect(rows.current().binding.values.lines[0]).toEqual({ id: 1, qty: '11', note: 'a' });
    expect(rows.input('Qty 1').value).toBe('11');
    rows.unmount();
  });

  it('binding.setValues then useFieldArray append (no value event): the appended row stays, and the binding write', () => {
    const rows = setupRows();
    act(() => {
      rows.current().binding.setValues({ supplier: 'Server' });
      rows.current().append({ id: 3, qty: '3', note: 'c' });
    });
    const expected = { supplier: 'Server', lines: [...ORDER.lines, { id: 3, qty: '3', note: 'c' }] };
    expect(rows.current().form.getValues()).toEqual(expected);
    expect(rows.current().binding.values).toEqual(expected);
    expect(rows.input('Qty 3').value).toBe('3');
    expect(rows.input('Supplier').value).toBe('Server');
    expect(paths(rows.current().entries)).toEqual(['supplier', 'lines.2']);
    rows.unmount();
  });

  it('binding.setValues then useFieldArray remove: the row stays removed, and the binding write', () => {
    const rows = setupRows();
    act(() => {
      rows.current().binding.setValues({ supplier: 'Server' });
      rows.current().remove(0);
    });
    const expected = { supplier: 'Server', lines: [ORDER.lines[1]] };
    expect(rows.current().form.getValues()).toEqual(expected);
    expect(rows.current().binding.values).toEqual(expected);
    expect(screen.queryByLabelText('Qty 2')).toBeNull();
    expect(rows.input('Qty 1').value).toBe('2');
    rows.unmount();
  });

  it('documented: the binding writes a row, the app appends a row to the same array in the same run: the array of the app', () => {
    const rows = setupRows();
    act(() => {
      rows.current().binding.setValues({ supplier: 'Server', lines: [{ id: 1, qty: '10', note: 'a' }, ORDER.lines[1]!] });
      rows.current().append({ id: 3, qty: '3', note: 'c' });
    });
    const expected = { supplier: 'Server', lines: [...ORDER.lines, { id: 3, qty: '3', note: 'c' }] };
    expect(rows.current().form.getValues()).toEqual(expected);
    expect(rows.current().binding.values).toEqual(expected);
    rows.unmount();
  });
});
