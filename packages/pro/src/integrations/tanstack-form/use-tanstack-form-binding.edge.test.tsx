// `useTanStackFormBinding` (ticket #508), finer points: the type of `Values` inferred from `useForm({ defaultValues })`
// with no explicit generic, the input the user edits never written with the server value, a write of the app made
// after the binding's in the same run, the save of an app that does not go through `handleSubmit`.
import { act, renderHook } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useFormRebase, type RebaseFormBinding } from '../../engine';
import { SAVED, setupInvoiceForm, type Invoice } from '../../../test/tanstack-harness';
import { useTanStackFormBinding, type UseTanStackFormBindingOptions } from './use-tanstack-form-binding';

type LineItem = { sku: string; qty: number };
type Order = { reference: string; supplier: { name: string; city: string }; lines: LineItem[]; paid: boolean };
const ORDER: Order = { reference: 'PO-41', supplier: { name: 'Lumen Parts', city: 'Turin' }, lines: [{ sku: 'Bolt', qty: 10 }], paid: false };

describe('types', () => {
  it('Values is inferred from useForm({ defaultValues }), with no explicit generic', () => {
    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: ORDER, onSubmit: async () => undefined });
      const binding = useTanStackFormBinding(form);
      return { binding, rebase: useFormRebase(binding) };
    });
    expectTypeOf(result.current.binding).toEqualTypeOf<RebaseFormBinding<Order>>();
    expectTypeOf(result.current.binding.values.lines).toEqualTypeOf<LineItem[]>();
    expectTypeOf(result.current.rebase.rebase).parameter(0).toEqualTypeOf<Order>();
    expectTypeOf(useTanStackFormBinding<Order>).parameter(1).toEqualTypeOf<UseTanStackFormBindingOptions | undefined>();
    // A form with validators (more generics bound) is accepted too.
    renderHook(() => {
      const form = useForm({ defaultValues: ORDER, validators: { onChange: ({ value }) => (value.reference === '' ? 'Required' : undefined) } });
      expectTypeOf(useTanStackFormBinding(form)).toEqualTypeOf<RebaseFormBinding<Order>>();
    });
    expect(result.current.binding.values).toBe(result.current.binding.baseline);
  });
});

describe('the input the user edits', () => {
  it('is never written with the server value, not even for a moment, and keeps its caret', () => {
    const harness = setupInvoiceForm();
    harness.type('Amount', '120');
    harness.type('Notes', 'mine');
    const input = harness.input('Amount');
    const written: string[] = [];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => setter.get!.call(input) as string,
      set: (value: string) => {
        written.push(value);
        setter.set!.call(input, value);
      },
    });
    input.focus();
    input.setSelectionRange(1, 1);
    act(() => harness.current().rebase.rebase({ ...SAVED, supplier: 'Lumen Parts Group', amount: '150', notes: '' }));
    expect(harness.current().rebase.conflicts.map((conflict) => conflict.path)).toEqual(['amount']);
    expect(written.filter((value) => value !== '120')).toEqual([]);
    expect(input.value).toBe('120');
    expect(input.selectionStart).toBe(1);
    expect(harness.input('Supplier').value).toBe('Lumen Parts Group');
    harness.unmount();
  });
});

describe('writes of the app around the binding', () => {
  it("a write of the app right after binding.setValues in the same run wins on its field; the binding's other fields stay", () => {
    const harness = setupInvoiceForm();
    act(() => {
      harness.current().binding.setValues({ supplier: 'Lumen Parts Group', notes: 'by the binding' });
      harness.current().form.setFieldValue('notes', 'by the app');
    });
    expect(harness.current().form.state.values).toEqual({ ...SAVED, supplier: 'Lumen Parts Group', notes: 'by the app' });
    expect(harness.current().binding.values).toEqual(harness.current().form.state.values);
    harness.unmount();
  });

  it('a save of the app (isSaving / saveError options) ended by binding.reset(saved): edits made meanwhile stay', () => {
    const harness = setupInvoiceForm({ binding: { isSaving: false, saveError: null } });
    harness.type('Amount', '120');
    harness.rerender({ binding: { isSaving: true, saveError: null } });
    harness.type('Notes', 'typed during the save');
    act(() => harness.current().binding.reset({ ...SAVED, amount: '120.00' }));
    harness.rerender({ binding: { isSaving: false, saveError: null } });
    expect(harness.current().binding.baseline).toEqual({ ...SAVED, amount: '120.00' });
    // The server's normalization of the field sent, the edit typed during the save kept.
    expect(harness.current().binding.values).toEqual({ ...SAVED, amount: '120.00', notes: 'typed during the save' });
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['notes']);
    harness.unmount();
  });

  it("TanStack Form's form.reset() after binding.reset(saved): back to useForm's defaultValues, not a discard (documented)", () => {
    const harness = setupInvoiceForm();
    const saved: Invoice = { ...SAVED, amount: '120' };
    act(() => harness.current().binding.reset(saved));
    act(() => harness.current().form.reset());
    expect(harness.current().form.state.values).toEqual(SAVED);
    expect(harness.current().binding.baseline).toBe(saved);
    expect(harness.current().entries.map((entry) => entry.path)).toEqual(['amount']);
    // binding.reset() is the discard against the saved record.
    act(() => harness.current().binding.reset());
    expect(harness.current().binding.values).toBe(saved);
    expect(harness.current().form.state.values).toEqual(saved);
    expect(harness.current().entries).toEqual([]);
    harness.unmount();
  });
});
