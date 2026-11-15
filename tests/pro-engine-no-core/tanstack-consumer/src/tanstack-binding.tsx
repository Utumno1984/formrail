// Ticket #508: the code of the ticket's goal, in a project with react, react-dom, @tanstack/react-form and
// @formrail/pro, without @formrail/core and without react-hook-form. Typechecked by `no-core.test.ts` with
// `skipLibCheck: false`, in the project installed from the packed tarballs (no explicit generic anywhere).
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase, type UseFormRebaseReturn } from '@formrail/pro/engine';
import { useTanStackFormBinding, type UseTanStackFormBindingOptions } from '@formrail/pro/tanstack-form';

export interface Invoice {
  supplier: string;
  amount: number;
  notes: string;
}

const save = (values: Invoice): Promise<Invoice> => Promise.resolve(values);

export function InvoiceEditor({ saved, saving }: { saved: Invoice; saving?: UseTanStackFormBindingOptions }) {
  const form = useForm({ defaultValues: saved, onSubmit: async ({ value }) => binding.reset(await save(value)) });
  // `Values` is inferred from `useForm({ defaultValues })`: no explicit generic.
  const binding = useTanStackFormBinding(form, saving);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, keepMine, acceptTheirs, isPending }: UseFormRebaseReturn<Invoice> = useFormRebase(binding);
  const amount: number = binding.values.amount;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="notes">{(field) => <input value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />}</form.Field>
      <p>{isEmpty ? 'No changes' : `${entries.length} changes, amount ${amount}`}</p>
      {conflicts.map((conflict) => (
        <p key={conflict.path}>
          <button type="button" onClick={() => keepMine(conflict.path)}>{`Keep my value for ${conflict.label}`}</button>
          <button type="button" onClick={() => acceptTheirs(conflict.path)}>{`Accept server value for ${conflict.label}`}</button>
        </p>
      ))}
      <button type="button" onClick={() => rebase({ ...binding.baseline, supplier: 'Server' })}>
        {isPending ? 'Queued' : 'Update'}
      </button>
    </form>
  );
}
