// A React Hook Form invoice form wired to `useReactHookFormBinding`, `useChangeSummary` and `useFormRebase`, with a
// render recorder (ticket #507): every COMMITTED render (useLayoutEffect) is recorded with the binding, the summary,
// the form state and the DOM value of each input, so a test can check what the user could ever have seen.
import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useForm, type RegisterOptions, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type ChangeEntry, type RebaseFormBinding, type UseFormRebaseOptions, type UseFormRebaseReturn } from '../src/engine';
import { useReactHookFormBinding, type UseReactHookFormBindingOptions } from '../src/react-hook-form';

export type Invoice = { supplier: string; amount: string; notes: string };

export const SAVED: Invoice = { supplier: 'Acme Corp', amount: '100', notes: '' };
/** The empty form shown while the record loads: one default per field, as React Hook Form asks. */
export const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };

export const FIELDS: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

export interface Probe {
  form: UseFormReturn<Invoice>;
  binding: RebaseFormBinding<Invoice>;
  entries: ChangeEntry[];
  rebase: UseFormRebaseReturn<Invoice>;
}

export interface Commit {
  binding: RebaseFormBinding<Invoice>;
  values: Invoice;
  baseline: Invoice;
  entries: string[];
  isDirty: boolean;
  dirtyFields: Record<string, unknown>;
  touchedFields: Record<string, unknown>;
  submitCount: number;
  dom: Record<keyof Invoice, string | undefined>;
}

export interface HarnessOptions {
  useFormProps?: UseFormProps<Invoice>;
  binding?: UseReactHookFormBindingOptions;
  rebase?: UseFormRebaseOptions<Invoice>;
  strict?: boolean;
  /** Validation rules of the inputs, passed to `register` at every render (as React Hook Form expects). */
  rules?: Partial<Record<keyof Invoice, RegisterOptions<Invoice>>>;
  /** Extra content rendered inside the form, with access to it (a `Controller`, a late field). */
  extra?: (form: UseFormReturn<Invoice>) => ReactNode;
}

const domValue = (name: string): string | undefined => (document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;

export function setupInvoiceForm(options: HarnessOptions = {}) {
  const commits: Commit[] = [];
  let probe!: Probe;

  function InvoiceForm(props: HarnessOptions) {
    const form = useForm<Invoice>(props.useFormProps ?? { defaultValues: SAVED });
    const binding = useReactHookFormBinding(form, props.binding);
    const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
    const rebase = useFormRebase(binding, props.rebase);
    probe = { form, binding, entries, rebase };
    const { isDirty, dirtyFields, touchedFields, submitCount } = form.formState;
    useLayoutEffect(() => {
      commits.push({
        binding,
        values: binding.values,
        baseline: binding.baseline,
        entries: entries.map((entry) => entry.path),
        isDirty,
        dirtyFields: structuredClone(dirtyFields) as Record<string, unknown>,
        touchedFields: structuredClone(touchedFields) as Record<string, unknown>,
        submitCount,
        dom: { supplier: domValue('supplier'), amount: domValue('amount'), notes: domValue('notes') },
      });
    });
    return (
      <form>
        {FIELDS.map(({ name, label }) => (
          <label key={name}>
            {label}
            <input {...form.register(name, props.rules?.[name])} />
          </label>
        ))}
        {props.extra?.(form)}
      </form>
    );
  }

  const element = (props: HarnessOptions) => (props.strict ? <StrictMode><InvoiceForm {...props} /></StrictMode> : <InvoiceForm {...props} />);
  const view = render(element(options));
  return {
    commits,
    current: () => probe,
    last: () => commits[commits.length - 1]!,
    rerender: (next: HarnessOptions = options) => view.rerender(element(next)),
    unmount: () => view.unmount(),
    input: (label: string) => screen.getByLabelText(label) as HTMLInputElement,
    /** A user edit: an input event on the field, as typing does. */
    type: (label: string, value: string) => {
      fireEvent.input(screen.getByLabelText(label), { target: { value } });
    },
    blur: (label: string) => {
      fireEvent.focus(screen.getByLabelText(label));
      fireEvent.blur(screen.getByLabelText(label));
    },
    act,
  };
}
