// Ticket #507: the code of the ticket's goal, in a project with react, react-dom, react-hook-form and @formrail/pro,
// without @formrail/core and without @tanstack/react-form. Typechecked by `no-core.test.ts` with `skipLibCheck: false`
// (in the linked sandbox and in the project installed from the packed tarballs).
import { useForm } from 'react-hook-form';
import { useChangeSummary, useFormRebase, type UseFormRebaseReturn } from '@formrail/pro/engine';
import { useReactHookFormBinding, type UseReactHookFormBindingOptions } from '@formrail/pro/react-hook-form';

export interface Invoice {
  supplier: string;
  amount: number;
  notes: string;
}

export function InvoiceEditor({ saved, saving }: { saved: Invoice; saving?: UseReactHookFormBindingOptions }) {
  const form = useForm<Invoice>({ defaultValues: saved });
  // `Values` is inferred from `useForm<Invoice>()`: no explicit generic.
  const binding = useReactHookFormBinding(form, saving);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, keepMine, acceptTheirs, isPending }: UseFormRebaseReturn<Invoice> = useFormRebase(binding);
  const amount: number = binding.values.amount;
  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        binding.reset(values);
      })}
    >
      <input {...form.register('notes')} />
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
