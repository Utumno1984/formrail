// `useTanStackFormBinding` (ticket #508), arrays with `arrayIdKeys` and missing keys: TanStack Form's array
// operations (`pushValue`, `removeValue`, `moveValue`, `swapValues`) against the Change Summary, a conflict on a row
// removed on one side, a server row rendered by a `form.Field` in `mode="array"`, a key missing vs `undefined`.
import { act, render, screen } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase, type ChangeEntry, type UseChangeSummaryReturn, type UseFormRebaseReturn } from '../../engine';
import type { RebaseFormBinding } from '../../form-rebase/types';
import { useTanStackFormBinding, type TanStackFormOf } from './use-tanstack-form-binding';

type Line = { id: string; sku: string; qty: string };
type Order = { reference: string; lines: Line[]; note?: string };

const ORDER: Order = {
  reference: 'PO-41',
  lines: [
    { id: 'l1', sku: 'Bolt', qty: '10' },
    { id: 'l2', sku: 'Nut', qty: '20' },
    { id: 'l3', sku: 'Washer', qty: '30' },
  ],
};
const ARRAY_ID_KEYS = { lines: 'id' };

interface Probe {
  form: TanStackFormOf<Order>;
  binding: RebaseFormBinding<Order>;
  summary: UseChangeSummaryReturn;
  rebase: UseFormRebaseReturn<Order>;
}

function setupOrder(defaults: Order = ORDER) {
  let probe!: Probe;
  function OrderForm() {
    const form = useForm({ defaultValues: defaults });
    const binding = useTanStackFormBinding(form, { arrayIdKeys: ARRAY_ID_KEYS });
    const summary = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: ARRAY_ID_KEYS });
    const rebase = useFormRebase(binding, { arrayIdKeys: ARRAY_ID_KEYS });
    probe = { form, binding, summary, rebase };
    return (
      <form.Field name="lines" mode="array">
        {(field) => (
          <ul>
            {field.state.value.map((line, index) => (
              <li key={line.id}>
                <form.Field name={`lines[${index}].qty`}>
                  {(qty) => <input aria-label={`Quantity of ${line.sku}`} value={qty.state.value} onChange={(event) => qty.handleChange(event.target.value)} />}
                </form.Field>
              </li>
            ))}
          </ul>
        )}
      </form.Field>
    );
  }
  const view = render(<OrderForm />);
  return { current: () => probe, unmount: () => view.unmount() };
}

const kinds = (entries: ChangeEntry[]) => entries.map((entry) => [entry.path, entry.kind]);

describe('arrays with arrayIdKeys', () => {
  it('pushValue gives an added entry, removeValue a removed one', () => {
    const order = setupOrder();
    act(() => order.current().form.pushFieldValue('lines', { id: 'l4', sku: 'Rivet', qty: '5' }));
    expect(kinds(order.current().summary.entries)).toEqual([['lines.3', 'added']]);
    expect(screen.getByLabelText('Quantity of Rivet')).toBeInTheDocument();
    act(() => void order.current().form.removeFieldValue('lines', 0));
    // In the order of the values: the added row at its index, then the removed one (at its baseline index).
    expect(kinds(order.current().summary.entries)).toEqual([
      ['lines.2', 'added'],
      ['lines.0', 'removed'],
    ]);
    order.unmount();
  });

  it('moveValue and swapValues give no entry (a reorder only)', () => {
    const order = setupOrder();
    act(() => order.current().form.moveFieldValues('lines', 0, 2));
    expect(order.current().summary.entries).toEqual([]);
    expect(order.current().summary.reorders.map((reorder) => reorder.path)).toEqual(['lines']);
    act(() => order.current().form.swapFieldValues('lines', 0, 1));
    expect(order.current().summary.entries).toEqual([]);
    expect(order.current().binding.values.lines.map((line) => line.id)).toEqual(['l3', 'l2', 'l1']);
    order.unmount();
  });

  it('a row the user removed and the server edited: a conflict (mineMissing); keepMine keeps it removed', () => {
    const order = setupOrder();
    act(() => void order.current().form.removeFieldValue('lines', 1));
    const incoming: Order = { ...ORDER, lines: ORDER.lines.map((line) => (line.id === 'l2' ? { ...line, qty: '25' } : line)) };
    act(() => order.current().rebase.rebase(incoming));
    const [conflict] = order.current().rebase.conflicts;
    expect(conflict).toMatchObject({ path: 'lines.1', mineMissing: true, theirsMissing: false });
    act(() => order.current().rebase.keepMine('lines.1'));
    expect(order.current().binding.values.lines.map((line) => line.id)).toEqual(['l1', 'l3']);
    expect(kinds(order.current().summary.entries)).toEqual([['lines.1', 'removed']]);
    order.unmount();
  });

  it('a row the server removed and the user edited: a conflict (theirsMissing); acceptTheirs removes it from the form', () => {
    const order = setupOrder();
    act(() => order.current().form.setFieldValue('lines[0].qty', '11'));
    const incoming: Order = { ...ORDER, lines: ORDER.lines.filter((line) => line.id !== 'l1') };
    act(() => order.current().rebase.rebase(incoming));
    const [conflict] = order.current().rebase.conflicts;
    expect(conflict).toMatchObject({ mineMissing: false, theirsMissing: true });
    act(() => order.current().rebase.acceptTheirs(conflict!.path));
    expect(order.current().form.state.values.lines.map((line) => line.id)).toEqual(['l2', 'l3']);
    expect(order.current().summary.entries).toEqual([]);
    expect(screen.queryByLabelText('Quantity of Bolt')).toBeNull();
    order.unmount();
  });

  it('a row added by the server is rendered by the form.Field in mode="array" (its array version is bumped)', () => {
    const order = setupOrder();
    act(() => order.current().form.setFieldValue('lines[0].qty', '11'));
    const version = order.current().form.state.fieldMeta.lines?._arrayVersion ?? 0;
    act(() => order.current().rebase.rebase({ ...ORDER, lines: [...ORDER.lines, { id: 'l9', sku: 'Spring', qty: '1' }] }));
    expect(order.current().form.state.fieldMeta.lines?._arrayVersion).toBeGreaterThan(version);
    expect(screen.getByLabelText('Quantity of Spring')).toHaveValue('1');
    expect(screen.getByLabelText('Quantity of Bolt')).toHaveValue('11');
    expect(kinds(order.current().summary.entries)).toEqual([['lines.0.qty', 'changed']]);
    order.unmount();
  });
});

describe('missing keys', () => {
  it('a key never in the defaults is missing from values (not undefined); written later it is added', () => {
    const order = setupOrder();
    expect(Object.hasOwn(order.current().binding.values, 'note')).toBe(false);
    act(() => order.current().form.setFieldValue('note', 'urgent'));
    expect(kinds(order.current().summary.entries)).toEqual([['note', 'added']]);
    order.unmount();
  });

  it('a key with undefined is not a missing key: deleted by the form (deleteField), it is a change (Level 1)', () => {
    const order = setupOrder({ ...ORDER, note: undefined });
    expect(Object.hasOwn(order.current().binding.baseline, 'note')).toBe(true);
    expect(order.current().summary.entries).toEqual([]);
    act(() => order.current().form.deleteField('note'));
    expect(Object.hasOwn(order.current().binding.values, 'note')).toBe(false);
    expect(kinds(order.current().summary.entries)).toEqual([['note', 'changed']]);
    order.unmount();
  });

  it('a field unmounted keeps its value in TanStack Form: no entry', () => {
    function Toggle({ show }: { show: boolean }) {
      const form = useForm({ defaultValues: { reference: 'PO-41', note: 'urgent' } });
      const binding = useTanStackFormBinding(form);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
      return (
        <>
          {show && <form.Field name="note">{(field) => <input aria-label="Note" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}</form.Field>}
          <output>{entries.length}|{JSON.stringify(binding.values)}</output>
        </>
      );
    }
    const view = render(<Toggle show />);
    view.rerender(<Toggle show={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('0|{"reference":"PO-41","note":"urgent"}');
    view.unmount();
  });
});
