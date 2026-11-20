import { useForm } from 'react-hook-form';
import { useChangeSummary, useFormRebase } from '@formrail/pro/engine';
import { useReactHookFormBinding } from '@formrail/pro/react-hook-form';

interface Invoice {
  supplier: string;
  amount: string;
  notes: string;
}

const saved: Invoice = { supplier: 'Rossi Construction', amount: '1200', notes: '' };

const fields: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

// Your API. Here: the server stores what it receives, half a second later.
const saveInvoice = (values: Invoice) =>
  new Promise<Invoice>((resolve) => setTimeout(() => resolve(values), 500));

export function InvoiceWithReactHookForm() {
  const form = useForm<Invoice>({ defaultValues: saved });
  // The React Hook Form form as the engines expect it: snapshots of the values and of the saved baseline.
  const binding = useReactHookFormBinding(form);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, keepMine, acceptTheirs, isPending } = useFormRebase(binding);

  // Save: the stored record becomes the baseline, inside the handler, so an update queued meanwhile
  // merges against it.
  const save = form.handleSubmit(async (values) => binding.reset(await saveInvoice(values)));

  // A newer version of the record, saved meanwhile by someone else (a poll, a push message, a 409 response).
  const receiveServerVersion = () =>
    rebase({ ...binding.baseline, supplier: 'Rossi Construction Ltd', amount: '1350' });

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      {fields.map(({ name, label }) => (
        <label key={name} style={{ display: 'grid', gap: 4 }}>
          {label}
          <input {...form.register(name)} />
        </label>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" disabled={isEmpty || form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => form.reset()}>
          Discard
        </button>
        <button type="button" onClick={receiveServerVersion}>
          Receive the server version
        </button>
      </div>
      {/* The save bar and the dirty guard follow the summary, not `formState.isDirty`. */}
      <p role="status">
        {[isEmpty ? 'All saved' : 'Unsaved changes', isPending ? 'server update queued' : '']
          .filter(Boolean)
          .join(', ')}
      </p>
      {isEmpty ? (
        <p>No changes</p>
      ) : (
        <ul aria-label="Changes">
          {entries.map((entry) => (
            <li key={entry.path}>{`${entry.label}: ${String(entry.before)} → ${String(entry.after)}`}</li>
          ))}
        </ul>
      )}
      {conflicts.map((conflict) => (
        <div
          key={conflict.path}
          role="group"
          aria-label={`Conflict on ${conflict.label}`}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          <span>
            {`${conflict.label}: yours ${String(conflict.mine)}, server ${String(conflict.theirs)}`}
          </span>
          <button type="button" onClick={() => acceptTheirs(conflict.path)}>
            {`Accept server value for ${conflict.label}`}
          </button>
          <button type="button" onClick={() => keepMine(conflict.path)}>
            {`Keep my value for ${conflict.label}`}
          </button>
        </div>
      ))}
    </form>
  );
}
