// `useReactHookFormBinding` (ticket #507, critic round 1, point 2) with the rows of a real `useFieldArray`: a rebase or
// an `acceptTheirs` must never remount the rows. React Hook Form regenerates the ids of every row (new React keys,
// new input nodes, the focus lost) each time the array itself is written (`reset`, or a write of `lines`): the binding
// writes only the changed leaves.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFieldArray, useForm, type RegisterOptions, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type ChangeEntry, type RebaseFormBinding, type UseFormRebaseReturn } from '../../engine';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

type Line = { id: number; qty: string };
type Order = { supplier: string; lines: Line[] };
const SAVED: Order = { supplier: 'Acme', lines: [{ id: 1, qty: '1' }, { id: 2, qty: '2' }] };
const ID_KEYS = { lines: 'id' };

interface Probe {
  form: UseFormReturn<Order>;
  binding: RebaseFormBinding<Order>;
  rebase: UseFormRebaseReturn<Order>;
  entries: ChangeEntry[];
}

function setupRows(rules?: RegisterOptions<Order, `lines.${number}.qty`>) {
  let probe!: Probe;
  function OrderForm() {
    const form = useForm<Order>({ defaultValues: SAVED, mode: 'onChange' });
    const binding = useReactHookFormBinding(form, { arrayIdKeys: ID_KEYS });
    const rebase = useFormRebase(binding, { arrayIdKeys: ID_KEYS });
    const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: ID_KEYS });
    const { fields } = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' });
    probe = { form, binding, rebase, entries };
    return (
      <form>
        <label>
          Supplier
          <input {...form.register('supplier')} />
        </label>
        {fields.map((field, index) => (
          <label key={field.key}>
            {`Qty ${index + 1}`}
            <input {...form.register(`lines.${index}.qty`, rules)} />
          </label>
        ))}
      </form>
    );
  }
  const view = render(<OrderForm />);
  const types: unknown[] = [];
  const watched = probe.form.watch((_values, info) => types.push(info.type));
  return {
    current: () => probe,
    input: (label: string) => screen.getByLabelText(label) as HTMLInputElement,
    types,
    unmount: () => {
      watched.unsubscribe();
      view.unmount();
    },
  };
}

const paths = (entries: ChangeEntry[]) => entries.map((entry) => entry.path);

describe('useFieldArray rows across a rebase and acceptTheirs, outside a save', () => {
  it('a rebase on another field while the user types in a row: the same input node, the focus stays, the value too', () => {
    const rows = setupRows();
    const row = rows.input('Qty 2');
    row.focus();
    fireEvent.input(row, { target: { value: '22' } });
    const fromEvent = rows.types.length;
    act(() => rows.current().rebase.rebase({ ...SAVED, supplier: 'Server' }));
    expect(rows.input('Qty 2')).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(row.value).toBe('22');
    expect(rows.input('Supplier').value).toBe('Server');
    const { binding, entries, form } = rows.current();
    expect(binding.baseline).toEqual({ ...SAVED, supplier: 'Server' });
    expect(binding.values).toEqual({ supplier: 'Server', lines: [{ id: 1, qty: '1' }, { id: 2, qty: '22' }] });
    expect(form.getValues()).toEqual(binding.values);
    expect(paths(entries)).toEqual(['lines.1.qty']);
    // Dirty: the typed row only (supplier, now the baseline, is not; the other row is untouched).
    expect(form.formState.dirtyFields.lines?.[1]?.qty).toBe(true);
    expect(form.formState.dirtyFields.lines?.[0]?.qty).toBeFalsy();
    expect(form.formState.dirtyFields.supplier).toBeFalsy();
    expect(form.formState.isDirty).toBe(true);
    // The rebase sends value events (the consumer's `watch` sees them), none of type `change`.
    expect(rows.types.length).toBeGreaterThan(fromEvent);
    expect(rows.types.slice(fromEvent)).not.toContain('change');
    rows.unmount();
  });

  it('acceptTheirs on another field while the focus is in a row: the same node, the focus stays', () => {
    const rows = setupRows();
    fireEvent.input(rows.input('Supplier'), { target: { value: 'mine' } });
    act(() => rows.current().rebase.rebase({ ...SAVED, supplier: 'Server' }));
    expect(rows.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['supplier']);
    const row = rows.input('Qty 1');
    row.focus();
    fireEvent.input(row, { target: { value: '11' } });
    act(() => rows.current().rebase.acceptTheirs('supplier'));
    expect(rows.input('Qty 1')).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(row.value).toBe('11');
    expect(rows.input('Supplier').value).toBe('Server');
    expect(paths(rows.current().entries)).toEqual(['lines.0.qty']);
    expect(rows.current().form.formState.dirtyFields.lines?.[0]?.qty).toBe(true);
    expect(rows.current().form.formState.dirtyFields.lines?.[1]?.qty).toBeFalsy();
    expect(rows.current().form.formState.dirtyFields.supplier).toBeFalsy();
    rows.unmount();
  });

  it('a rebase that changes another row: that row takes the server value, the row being typed in keeps node, focus and caret', () => {
    const rows = setupRows();
    const first = rows.input('Qty 1');
    const row = rows.input('Qty 2');
    row.focus();
    fireEvent.input(row, { target: { value: '2345' } });
    row.setSelectionRange(2, 2);
    act(() => rows.current().rebase.rebase({ ...SAVED, lines: [{ id: 1, qty: '10' }, { id: 2, qty: '2' }] }));
    expect(rows.input('Qty 1')).toBe(first);
    expect(first.value).toBe('10');
    expect(rows.input('Qty 2')).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(row.value).toBe('2345');
    // The value of the field being typed in was never rewritten: the caret did not move.
    expect(row.selectionStart).toBe(2);
    expect(rows.current().binding.values.lines).toEqual([{ id: 1, qty: '10' }, { id: 2, qty: '2345' }]);
    rows.unmount();
  });

  it('a reorder by the server (arrayIdKeys): the rows are rewritten whole, so the focus never stays on a node that now shows another row', () => {
    const rows = setupRows();
    const row = rows.input('Qty 2');
    row.focus();
    fireEvent.input(row, { target: { value: '22' } });
    act(() => rows.current().rebase.rebase({ ...SAVED, lines: [{ id: 2, qty: '2' }, { id: 1, qty: '1' }] }));
    expect(rows.current().binding.values.lines).toEqual([{ id: 2, qty: '22' }, { id: 1, qty: '1' }]);
    expect(rows.input('Qty 1').value).toBe('22');
    expect(rows.input('Qty 2').value).toBe('1');
    // Written position by position, the focused node (second row) would now show row 1 and take the next keystrokes.
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement) expect(focused.value).toBe('22');
    expect(rows.input('Qty 2')).not.toBe(row);
    rows.unmount();
  });

  it('a validation error on a row stays across a rebase of another field', async () => {
    const rows = setupRows({ pattern: { value: /^\d+$/, message: 'Digits only' } });
    const row = rows.input('Qty 2');
    await act(async () => {
      fireEvent.input(row, { target: { value: 'x' } });
    });
    expect(rows.current().form.getFieldState('lines.1.qty').error?.message).toBe('Digits only');
    act(() => rows.current().rebase.rebase({ ...SAVED, supplier: 'Server' }));
    expect(rows.current().form.getFieldState('lines.1.qty').error?.message).toBe('Digits only');
    expect(rows.input('Qty 2')).toBe(row);
    rows.unmount();
  });

  it('touched fields and the submit count are kept', async () => {
    const rows = setupRows();
    fireEvent.focus(rows.input('Qty 1'));
    fireEvent.blur(rows.input('Qty 1'));
    fireEvent.input(rows.input('Qty 2'), { target: { value: '5' } });
    await act(async () => {
      await rows.current().form.handleSubmit(() => undefined)();
    });
    act(() => rows.current().rebase.rebase({ ...SAVED, supplier: 'Server' }));
    expect(rows.current().form.formState.touchedFields).toEqual({ lines: [{ qty: true }] });
    expect(rows.current().form.formState.submitCount).toBe(1);
    rows.unmount();
  });
});
