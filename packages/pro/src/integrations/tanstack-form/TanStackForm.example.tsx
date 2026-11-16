import { useEffect, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useChangeSummary, useFormRebase } from '@formrail/pro/engine';
import { useTanStackFormBinding } from '@formrail/pro/tanstack-form';

interface Invoice {
  supplier: string;
  amount: string;
  notes: string;
}

const loaded: Invoice = { supplier: 'Lumen Parts', amount: '1200', notes: '' };

const fields: { name: keyof Invoice; label: string }[] = [
  { name: 'supplier', label: 'Supplier' },
  { name: 'amount', label: 'Amount' },
  { name: 'notes', label: 'Notes' },
];

// Your API. Here: the server stores what it receives, half a second later.
const saveInvoice = (values: Invoice) => new Promise<Invoice>((resolve) => setTimeout(() => resolve(values), 500));

export function InvoiceWithTanStackForm() {
  // The record as the server has it, passed as the `defaultValues` of `useForm` (for an async load: the loaded record;
  // TanStack Form takes new `defaultValues` while the form is not touched).
  const [saved, setSaved] = useState(loaded);
  const form = useForm({
    defaultValues: saved,
    // Save: the stored record becomes the baseline inside `onSubmit`, so an update queued meanwhile merges against it.
    onSubmit: async ({ value }) => binding.reset(await saveInvoice(value)),
  });
  // The TanStack Form form as the engines expect it: snapshots of the values and of the saved baseline.
  const binding = useTanStackFormBinding(form);
  // `saved` follows the baseline: after a save (`binding.reset(stored)`) and after a rebase, also one queued until a
  // save ends. So TanStack Form's own `isDefaultValue` and `form.reset()` agree with the summary.
  useEffect(() => setSaved(binding.baseline), [binding.baseline]);
  const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
  const { rebase, conflicts, keepMine, acceptTheirs, isPending } = useFormRebase(binding);

  // A newer version of the record, saved meanwhile by someone else (a poll, a push message, a 409 response).
  const receiveServerVersion = () => rebase({ ...binding.baseline, supplier: 'Lumen Parts Group', amount: '1350' });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      style={{ display: 'grid', gap: 12, maxWidth: 480 }}
    >
      {fields.map(({ name, label }) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label style={{ display: 'grid', gap: 4 }}>
              {label}
              <input name={name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
            </label>
          )}
        </form.Field>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" disabled={isEmpty || binding.isSaving}>
          {binding.isSaving ? 'Saving…' : 'Save'}
        </button>
        {/* The discard against the saved baseline (TanStack Form's own `form.reset()` goes back to `defaultValues`). */}
        <button type="button" onClick={() => binding.reset()}>
          Discard
        </button>
        <button type="button" onClick={receiveServerVersion}>
          Receive the server version
        </button>
      </div>
      {/* The save bar and the dirty guard follow the summary, not `form.state.isDirty` (it stays true once changed). */}
      <p role="status">{[isEmpty ? 'All saved' : 'Unsaved changes', isPending ? 'server update queued' : ''].filter(Boolean).join(', ')}</p>
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
        <div key={conflict.path} role="group" aria-label={`Conflict on ${conflict.label}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span>{`${conflict.label}: yours ${String(conflict.mine)}, server ${String(conflict.theirs)}`}</span>
          <button type="button" onClick={() => acceptTheirs(conflict.path)}>{`Accept server value for ${conflict.label}`}</button>
          <button type="button" onClick={() => keepMine(conflict.path)}>{`Keep my value for ${conflict.label}`}</button>
        </div>
      ))}
    </form>
  );
}
