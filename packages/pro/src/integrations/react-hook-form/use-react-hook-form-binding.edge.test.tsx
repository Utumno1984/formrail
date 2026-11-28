// Edge cases of `useReactHookFormBinding` (ticket #507) with a real React Hook Form: field arrays, `shouldUnregister`,
// a key removed by the server, number vs string, StrictMode, a field registered after the mount with a conflict open.
import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useController, useFieldArray, useForm, type Control, type UseFieldArrayReturn, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type ChangeEntry, type RebaseFormBinding, type UseFormRebaseReturn } from '../../engine';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/rhf-harness';
import { useReactHookFormBinding } from './use-react-hook-form-binding';

type Line = { id: string; description: string; qty: number };
type Order = { number: string; lineItems: Line[] };

const ORDER: Order = {
  number: 'PO-1',
  lineItems: [
    { id: 'L1', description: 'Cable', qty: 1 },
    { id: 'L2', description: 'Switch', qty: 2 },
    { id: 'L3', description: 'Router', qty: 3 },
  ],
};

interface OrderProbe {
  form: UseFormReturn<Order>;
  lines: UseFieldArrayReturn<Order, 'lineItems'>;
  binding: RebaseFormBinding<Order>;
  entries: ChangeEntry[];
  rebase: UseFormRebaseReturn<Order>;
}

function setupOrder(strict = false) {
  let probe!: OrderProbe;
  const renders: OrderProbe[] = [];
  function OrderForm() {
    const form = useForm<Order>({ defaultValues: ORDER });
    const lines = useFieldArray({ control: form.control, name: 'lineItems' });
    const binding = useReactHookFormBinding(form);
    const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: { lineItems: 'id' } });
    const rebase = useFormRebase(binding, { arrayIdKeys: { lineItems: 'id' } });
    probe = { form, lines, binding, entries, rebase };
    renders.push(probe);
    return (
      <form>
        {lines.fields.map((field, index) => (
          <input key={field.id} aria-label={`Description ${index + 1}`} {...form.register(`lineItems.${index}.description`)} />
        ))}
      </form>
    );
  }
  const view = render(strict ? <StrictMode><OrderForm /></StrictMode> : <OrderForm />);
  return { current: () => probe, renders, unmount: view.unmount };
}

const summary = (entries: ChangeEntry[]) => entries.map((entry) => [entry.kind, entry.path]);

describe('useFieldArray with arrayIdKeys: { lineItems: "id" }', () => {
  it('the ids generated for `fields` never reach the values or the summary', () => {
    const order = setupOrder();
    const generated = order.current().lines.fields.map((field) => field.id);
    expect(generated).toHaveLength(3);
    expect(generated.some((id) => ['L1', 'L2', 'L3'].includes(id))).toBe(false);
    expect(order.current().binding.values).toEqual(ORDER);
    expect(order.current().entries).toEqual([]);
    order.unmount();
  });

  it('append gives `added`, remove gives `removed`, move and swap give no entry', () => {
    const order = setupOrder();
    act(() => order.current().lines.move(0, 2));
    act(() => order.current().lines.swap(0, 1));
    expect(order.current().binding.values.lineItems.map((line) => line.id)).toEqual(['L3', 'L2', 'L1']);
    expect(order.current().entries).toEqual([]);
    act(() => order.current().lines.append({ id: 'L4', description: 'Rack', qty: 1 }));
    expect(summary(order.current().entries)).toEqual([['added', 'lineItems.3']]);
    act(() => order.current().lines.remove(1));
    expect(summary(order.current().entries)).toEqual([
      ['added', 'lineItems.2'],
      ['removed', 'lineItems.1'],
    ]);
    order.unmount();
  });

  it('typing in an item field gives an entry on that item, matched by id after a reorder', () => {
    const order = setupOrder();
    act(() => order.current().lines.move(2, 0));
    fireEvent.input(screen.getByLabelText('Description 1'), { target: { value: 'Router X' } });
    expect(summary(order.current().entries)).toEqual([['changed', 'lineItems.0.description']]);
    expect(order.current().entries[0]!.before).toBe('Router');
    order.unmount();
  });

  it('a conflict on an item the user removed (mineMissing): acceptTheirs puts it back; keepMine leaves it removed', () => {
    for (const choice of ['acceptTheirs', 'keepMine'] as const) {
      const order = setupOrder();
      act(() => order.current().lines.remove(1));
      act(() =>
        order.current().rebase.rebase({ ...ORDER, lineItems: ORDER.lineItems.map((line) => (line.id === 'L2' ? { ...line, qty: 20 } : line)) }),
      );
      const [conflict] = order.current().rebase.conflicts;
      expect(conflict).toMatchObject({ mineMissing: true, theirsMissing: false });
      act(() => order.current().rebase[choice](conflict!.path));
      expect(order.current().rebase.conflicts).toEqual([]);
      const ids = order.current().binding.values.lineItems.map((line) => line.id);
      expect(ids).toEqual(choice === 'acceptTheirs' ? ['L1', 'L2', 'L3'] : ['L1', 'L3']);
      expect(order.current().form.getValues('lineItems').map((line) => line.id)).toEqual(ids);
      if (choice === 'acceptTheirs') expect(order.current().entries).toEqual([]);
      order.unmount();
    }
  });

  it('a conflict on an item the server removed (theirsMissing): acceptTheirs removes it; keepMine keeps it', () => {
    for (const choice of ['acceptTheirs', 'keepMine'] as const) {
      const order = setupOrder();
      fireEvent.input(screen.getByLabelText('Description 2'), { target: { value: 'Switch 48p' } });
      act(() => order.current().rebase.rebase({ ...ORDER, lineItems: ORDER.lineItems.filter((line) => line.id !== 'L2') }));
      const [conflict] = order.current().rebase.conflicts;
      expect(conflict).toMatchObject({ mineMissing: false, theirsMissing: true });
      act(() => order.current().rebase[choice](conflict!.path));
      expect(order.current().rebase.conflicts).toEqual([]);
      const ids = order.current().binding.values.lineItems.map((line) => line.id);
      expect(ids).toEqual(choice === 'acceptTheirs' ? ['L1', 'L3'] : ['L1', 'L2', 'L3']);
      expect(order.current().form.getValues('lineItems').map((line) => line.id)).toEqual(ids);
      expect(order.current().lines.fields).toHaveLength(ids.length);
      order.unmount();
    }
  });
});

describe('keys and value types', () => {
  it('shouldUnregister: an unmounted field is a missing key in values (not undefined), listed as removed', () => {
    let form!: UseFormReturn<Invoice>;
    let binding!: RebaseFormBinding<Invoice>;
    let setShowNotes!: (show: boolean) => void;
    let entries: ChangeEntry[] = [];
    function UnregisterForm() {
      const [showNotes, setShow] = useState(true);
      setShowNotes = setShow;
      form = useForm<Invoice>({ defaultValues: SAVED, shouldUnregister: true });
      binding = useReactHookFormBinding(form);
      entries = useChangeSummary({ values: binding.values, baseline: binding.baseline }).entries;
      return (
        <form>
          <input aria-label="Amount" {...form.register('amount')} />
          <input aria-label="Supplier" {...form.register('supplier')} />
          {showNotes && <input aria-label="Notes" {...form.register('notes')} />}
        </form>
      );
    }
    const view = render(<UnregisterForm />);
    expect(entries).toEqual([]);
    act(() => setShowNotes(false));
    expect(Object.hasOwn(binding.values, 'notes')).toBe(false);
    expect(Object.hasOwn(form.getValues(), 'notes')).toBe(false);
    expect(entries.map((entry) => [entry.kind, entry.path, entry.afterMissing])).toEqual([['removed', 'notes', true]]);
    view.unmount();
  });

  it('a top-level key the server removes is absent from binding.values and from getValues() after the rebase', () => {
    type Extra = Invoice & { legacyCode?: string };
    let probe!: { form: UseFormReturn<Extra>; binding: RebaseFormBinding<Extra>; rebase: UseFormRebaseReturn<Extra> };
    function ExtraForm() {
      const form = useForm<Extra>({ defaultValues: { ...SAVED, legacyCode: 'X1' } });
      const binding = useReactHookFormBinding(form);
      probe = { form, binding, rebase: useFormRebase(binding) };
      return <input aria-label="Notes" {...form.register('notes')} />;
    }
    const view = render(<ExtraForm />);
    fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'mine' } });
    act(() => probe.rebase.rebase({ ...SAVED }));
    expect(Object.hasOwn(probe.binding.values, 'legacyCode')).toBe(false);
    expect(Object.hasOwn(probe.form.getValues(), 'legacyCode')).toBe(false);
    expect(probe.binding.values).toEqual({ ...SAVED, notes: 'mine' });
    view.unmount();
  });

  it('a field hydrated as a number and typed back as a string: an entry (the types differ), no crash', () => {
    type Priced = { price: number };
    let entries: ChangeEntry[] = [];
    let form!: UseFormReturn<Priced>;
    function PricedForm() {
      form = useForm<Priced>({ defaultValues: { price: 10 } });
      const binding = useReactHookFormBinding(form);
      entries = useChangeSummary({ values: binding.values, baseline: binding.baseline }).entries;
      return <input aria-label="Price" {...form.register('price')} />;
    }
    const view = render(<PricedForm />);
    expect(entries).toEqual([]);
    expect((screen.getByLabelText('Price') as HTMLInputElement).value).toBe('10');
    fireEvent.input(screen.getByLabelText('Price'), { target: { value: '11' } });
    fireEvent.input(screen.getByLabelText('Price'), { target: { value: '10' } });
    expect(form.getValues('price')).toBe('10');
    expect(entries.map((entry) => [entry.path, entry.before, entry.after])).toEqual([['price', 10, '10']]);
    view.unmount();
  });
});

describe('StrictMode', () => {
  it('stable identity across the double render, no double rebase', () => {
    const harness = setupInvoiceForm({ strict: true });
    const first = harness.last();
    harness.rerender({ strict: true });
    expect(harness.last().values).toBe(first.values);
    expect(harness.last().baseline).toBe(first.baseline);
    harness.type('Amount', '120');
    const { form } = harness.current();
    const reset = vi.spyOn(form, 'reset');
    const setValue = vi.spyOn(form, 'setValue');
    const resetDefaultValues = vi.spyOn(form, 'resetDefaultValues');
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Acme Corp Ltd' }));
    // One rebase, written once (code review round 1, point 2: no `reset`): the changed field, then the new defaults.
    expect(reset).not.toHaveBeenCalled();
    expect(setValue.mock.calls).toEqual([['supplier', 'Acme Corp Ltd']]);
    expect(resetDefaultValues).toHaveBeenCalledTimes(1);
    expect(resetDefaultValues.mock.calls[0]![0]).toEqual({ ...SAVED, supplier: 'Acme Corp Ltd' });
    expect(harness.current().binding.values).toEqual({ ...SAVED, supplier: 'Acme Corp Ltd', amount: '120' });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['amount']);
    vi.restoreAllMocks();
    harness.unmount();
  });

  it('field array in StrictMode: values without the generated ids, one entry per change', () => {
    const order = setupOrder(true);
    expect(order.current().binding.values).toEqual(ORDER);
    act(() => order.current().lines.append({ id: 'L4', description: 'Rack', qty: 1 }));
    expect(summary(order.current().entries)).toEqual([['added', 'lineItems.3']]);
    order.unmount();
  });
});

describe('a field registered after the mount while a conflict is open (#505 red team, rule of the adapter)', () => {
  type Late = Invoice & { reference?: string };

  function setupLate(lateDefault: boolean) {
    let probe!: { form: UseFormReturn<Late>; binding: RebaseFormBinding<Late>; entries: ChangeEntry[]; rebase: UseFormRebaseReturn<Late> };
    let showLate!: () => void;
    function LateForm() {
      const [late, setLate] = useState(false);
      showLate = () => setLate(true);
      const form = useForm<Late>({ defaultValues: lateDefault ? { ...SAVED, reference: '' } : SAVED });
      const binding = useReactHookFormBinding(form);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
      probe = { form, binding, entries, rebase: useFormRebase(binding) };
      return (
        <form>
          <input aria-label="Amount" {...form.register('amount')} />
          {late && <input aria-label="Reference" {...form.register('reference')} />}
        </form>
      );
    }
    const view = render(<LateForm />);
    fireEvent.input(screen.getByLabelText('Amount'), { target: { value: '120' } });
    act(() => probe.rebase.rebase({ ...SAVED, amount: '150', supplier: 'Acme Corp Ltd', ...(lateDefault ? { reference: '' } : {}) }));
    expect(probe.rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(probe.rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
    return { probe: () => probe, showLate, unmount: view.unmount };
  }

  it('the baseline keeps its identity: the open conflict and the applied changes stay', () => {
    for (const lateDefault of [true, false]) {
      const late = setupLate(lateDefault);
      const { baseline } = late.probe().binding;
      act(() => late.showLate());
      expect(screen.getByLabelText('Reference')).toBeTruthy();
      expect(late.probe().binding.baseline).toBe(baseline);
      expect(late.probe().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
      expect(late.probe().rebase.applied.map((entry) => entry.path)).toEqual(['supplier']);
      late.unmount();
    }
  });

  it('declared in defaultValues: no entry; without a default: the field enters values only and is listed as added', () => {
    const declared = setupLate(true);
    act(() => declared.showLate());
    expect(declared.probe().entries.map((entry) => entry.path)).toEqual(['amount']);
    declared.unmount();

    const undeclared = setupLate(false);
    act(() => undeclared.showLate());
    expect(undeclared.probe().binding.values.reference).toBe('');
    expect(Object.hasOwn(undeclared.probe().binding.baseline, 'reference')).toBe(false);
    expect(undeclared.probe().entries.map((entry) => [entry.kind, entry.path])).toEqual([
      ['changed', 'amount'],
      ['added', 'reference'],
    ]);
    undeclared.unmount();
  });
});

describe('a save that settles while the user edited a row and the server reordered the rows (QA #507 round 2, point 2)', () => {
  function setupSavingOrder(arrayIdKeys: Record<string, string> | undefined) {
    let probe!: { form: UseFormReturn<Order>; binding: RebaseFormBinding<Order>; entries: ChangeEntry[] };
    function OrderForm() {
      const form = useForm<Order>({ defaultValues: ORDER });
      const lines = useFieldArray({ control: form.control, name: 'lineItems' });
      const binding = useReactHookFormBinding(form, arrayIdKeys ? { arrayIdKeys } : {});
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline, arrayIdKeys: { lineItems: 'id' } });
      probe = { form, binding, entries };
      return (
        <form>
          {lines.fields.map((field, index) => (
            <input key={field.id} aria-label={`Description ${index + 1}`} {...form.register(`lineItems.${index}.description`)} />
          ))}
        </form>
      );
    }
    const view = render(<OrderForm />);
    return { probe: () => probe, unmount: view.unmount };
  }

  /** Saves through handleSubmit; during the save the user edits row 2 (L2); the server returns the rows reordered. */
  async function saveWhileEditingRow2(order: ReturnType<typeof setupSavingOrder>) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let done!: Promise<void>;
    await act(async () => {
      done = order.probe().form.handleSubmit(async (sent) => {
        await gate;
        const [l1, l2, l3] = sent.lineItems;
        order.probe().binding.reset({ ...sent, lineItems: [{ ...l3!, description: 'ROUTER' }, l1!, l2!] });
      })();
    });
    fireEvent.input(screen.getByLabelText('Description 2'), { target: { value: 'Switch 24 ports' } });
    await act(async () => {
      release();
      await done;
    });
  }

  it('with arrayIdKeys: the edit stays on its row (L2), the rows take the server order and normalization', async () => {
    const order = setupSavingOrder({ lineItems: 'id' });
    await saveWhileEditingRow2(order);
    const { binding, entries } = order.probe();
    expect(binding.values.lineItems.map((line) => [line.id, line.description])).toEqual([
      ['L3', 'ROUTER'],
      ['L1', 'Cable'],
      ['L2', 'Switch 24 ports'],
    ]);
    expect(binding.baseline.lineItems.map((line) => line.id)).toEqual(['L3', 'L1', 'L2']);
    expect(summary(entries)).toEqual([['changed', 'lineItems.2.description']]);
    expect((screen.getByLabelText('Description 1') as HTMLInputElement).value).toBe('ROUTER');
    expect((screen.getByLabelText('Description 3') as HTMLInputElement).value).toBe('Switch 24 ports');
    order.unmount();
  });

  it('without arrayIdKeys: the edited array is kept whole (no edit lands on another row)', async () => {
    const order = setupSavingOrder(undefined);
    await saveWhileEditingRow2(order);
    const { binding } = order.probe();
    expect(binding.values.lineItems.map((line) => [line.id, line.description])).toEqual([
      ['L1', 'Cable'],
      ['L2', 'Switch 24 ports'],
      ['L3', 'Router'],
    ]);
    expect(binding.baseline.lineItems.map((line) => line.id)).toEqual(['L3', 'L1', 'L2']);
    order.unmount();
  });
});

describe('a rebase written with a reset (a top-level key to remove) on a shouldUnregister form (code review round 1, point 3)', () => {
  it("the user's edit stays in React Hook Form and in the DOM: the mounted fields are kept (keepFieldsRef)", () => {
    const harness = setupInvoiceForm({ useFormProps: { defaultValues: SAVED, shouldUnregister: true } });
    harness.type('Amount', '120');
    // The server drops `notes`: only a reset removes a top-level key.
    const incoming = { supplier: 'Acme Corp Ltd', amount: SAVED.amount } as Invoice;
    act(() => harness.current().rebase.rebase(incoming));
    const { binding, form } = harness.current();
    expect(binding.baseline).toBe(incoming);
    expect(binding.values.amount).toBe('120');
    expect(binding.values.supplier).toBe('Acme Corp Ltd');
    expect(form.getValues().amount).toBe('120');
    expect(harness.input('Amount').value).toBe('120');
    expect(harness.input('Supplier').value).toBe('Acme Corp Ltd');
    harness.unmount();
  });
});

describe('documented limits (QA #507, points 3 and 4)', () => {
  type WithRef = Invoice & { reference?: string };

  function RefField({ control }: { control: Control<WithRef> }) {
    const { field } = useController({ control, name: 'reference', defaultValue: 'R-1' });
    return <input aria-label="Reference" {...field} value={field.value ?? ''} />;
  }

  function setupWithController(defaultValues: WithRef) {
    let probe!: { form: UseFormReturn<WithRef>; entries: ChangeEntry[] };
    function Form() {
      const form = useForm<WithRef>({ defaultValues });
      const binding = useReactHookFormBinding(form);
      const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
      probe = { form, entries };
      return (
        <form>
          <input aria-label="Amount" {...form.register('amount')} />
          <RefField control={form.control} />
        </form>
      );
    }
    const view = render(<Form />);
    return { probe: () => probe, unmount: view.unmount };
  }

  it('a Controller with its own defaultValue, absent from useForm defaultValues: listed as added (README); declared there: no entry', () => {
    const own = setupWithController(SAVED);
    // React Hook Form writes the default into its defaults in place: clean for `isDirty`, not for the summary.
    expect(own.probe().form.formState.isDirty).toBe(false);
    expect(own.probe().entries.map((entry) => [entry.kind, entry.path])).toEqual([['added', 'reference']]);
    own.unmount();

    // The documented fix: the default in `useForm({ defaultValues })`.
    const declared = setupWithController({ ...SAVED, reference: 'R-1' });
    expect(declared.probe().entries).toEqual([]);
    expect((screen.getByLabelText('Reference') as HTMLInputElement).value).toBe('R-1');
    declared.unmount();
  });

  it('resetField(anotherField, { defaultValue }) is a rehydration: it closes the open conflicts (README)', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    act(() => harness.current().rebase.rebase({ ...SAVED, amount: '150' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    act(() => harness.current().form.resetField('notes', { defaultValue: 'x' }));
    expect(harness.current().rebase.conflicts).toEqual([]);
    // The user's value is still there, as a plain edit against the new baseline.
    expect(harness.current().binding.values.amount).toBe('120');
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['amount']);
    harness.unmount();
  });
});
