// A TanStack Form invoice form wired to `useTanStackFormBinding`, `useChangeSummary` and `useFormRebase`, with a
// render recorder (ticket #508): every COMMITTED render (useLayoutEffect) is recorded with the binding, the summary,
// TanStack Form's own state and field meta, and the DOM value of each input, so a test can check what the user could
// ever have seen. Demo data of another domain than the legacy fixtures (#515): supplier "Lumen Parts".
import { StrictMode, useLayoutEffect, useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase, type ChangeEntry, type RebaseFormBinding, type UseFormRebaseOptions, type UseFormRebaseReturn } from '../src/engine';
import { useTanStackFormBinding, type TanStackFormOf, type UseTanStackFormBindingOptions } from '../src/tanstack-form';

export type Invoice = { supplier: string; amount: string; notes: string };

export const SAVED: Invoice = { supplier: 'Lumen Parts', amount: '100', notes: '' };
/** The empty form shown while the record loads: one default per field. */
export const EMPTY: Invoice = { supplier: '', amount: '', notes: '' };

export const FIELDS: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

export interface Probe {
  form: TanStackFormOf<Invoice>;
  binding: RebaseFormBinding<Invoice>;
  entries: ChangeEntry[];
  rebase: UseFormRebaseReturn<Invoice>;
}

export interface FieldMetaRecord {
  isTouched: boolean;
  isBlurred: boolean;
  isDirty: boolean;
  isDefaultValue: boolean;
  errors: unknown[];
}

export interface Commit {
  binding: RebaseFormBinding<Invoice>;
  values: Invoice;
  baseline: Invoice;
  entries: string[];
  isDirty: boolean;
  isSubmitting: boolean;
  formValues: Invoice;
  meta: Partial<Record<keyof Invoice, FieldMetaRecord>>;
  dom: Record<keyof Invoice, string | undefined>;
}

export interface HarnessOptions {
  /** The `defaultValues` of `useForm`, read at every render (inline: a new object each time). */
  defaults?: () => Invoice;
  /** The `onSubmit` of `useForm`, with the binding of the render. */
  onSubmit?: (value: Invoice, binding: RebaseFormBinding<Invoice>) => unknown;
  binding?: UseTanStackFormBindingOptions;
  rebase?: UseFormRebaseOptions<Invoice>;
  strict?: boolean;
  /** Called by the `listeners.onChange` of each field. */
  onFieldChange?: (name: keyof Invoice, value: string) => void;
  /** The `onChange` validator of each field (called with its value; its return value is the error). */
  validate?: (name: keyof Invoice, value: string) => string | undefined;
  /** Extra content rendered inside the form, with access to it. */
  extra?: (form: TanStackFormOf<Invoice>) => ReactNode;
}

const domValue = (name: string): string | undefined => (document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;

const metaOf = (form: TanStackFormOf<Invoice>): Commit['meta'] => {
  const out: Commit['meta'] = {};
  for (const { name } of FIELDS) {
    const meta = form.state.fieldMeta[name];
    if (meta) out[name] = { isTouched: meta.isTouched, isBlurred: meta.isBlurred, isDirty: meta.isDirty, isDefaultValue: meta.isDefaultValue, errors: [...meta.errors] };
  }
  return out;
};

export function setupInvoiceForm(options: HarnessOptions = {}) {
  const commits: Commit[] = [];
  let probe!: Probe;
  let bumpParent!: () => void;

  function InvoiceForm(props: HarnessOptions) {
    const [, setTick] = useState(0);
    bumpParent = () => setTick((tick) => tick + 1);
    // The binding of this render, for the `onSubmit` of this render (`useForm` takes the options of every render).
    const latest: { binding: RebaseFormBinding<Invoice> | null } = { binding: null };
    const form = useForm({
      defaultValues: (props.defaults ?? (() => SAVED))(),
      onSubmit: async ({ value }) => {
        await props.onSubmit?.(value, latest.binding!);
      },
    });
    const binding = useTanStackFormBinding(form, props.binding);
    latest.binding = binding;
    const { entries } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
    const rebase = useFormRebase(binding, props.rebase);
    probe = { form, binding, entries, rebase };
    useLayoutEffect(() => {
      commits.push({
        binding,
        values: binding.values,
        baseline: binding.baseline,
        entries: entries.map((entry) => entry.path),
        isDirty: form.state.isDirty,
        isSubmitting: form.state.isSubmitting,
        formValues: form.state.values,
        meta: metaOf(form),
        dom: { supplier: domValue('supplier'), amount: domValue('amount'), notes: domValue('notes') },
      });
    });
    return (
      <form>
        {FIELDS.map(({ name, label }) => (
          <form.Field
            key={name}
            name={name}
            listeners={{ onChange: ({ value }) => props.onFieldChange?.(name, value) }}
            validators={{ onChange: ({ value }) => props.validate?.(name, value) }}
          >
            {(field) => (
              <label>
                {label}
                <input name={name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
              </label>
            )}
          </form.Field>
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
    /** A render of the form's component caused by its own state (a parent's state, as far as the form is concerned). */
    bump: () => act(() => bumpParent()),
    unmount: () => view.unmount(),
    input: (label: string) => screen.getByLabelText(label) as HTMLInputElement,
    /** A user edit: a change event on the field, as typing does. */
    type: (label: string, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    },
    blur: (label: string) => {
      fireEvent.focus(screen.getByLabelText(label));
      fireEvent.blur(screen.getByLabelText(label));
    },
    act,
  };
}
