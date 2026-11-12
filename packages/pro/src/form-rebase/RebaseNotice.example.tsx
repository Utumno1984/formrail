import { Button, Field, Input, useObjectPageForm } from '@formrail/core';
import { RebaseNotice, useFormRebase } from '@formrail/pro';

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

export function InvoiceUpdatedNotice() {
  const form = useObjectPageForm({ baseline: saved });
  const { rebase, applied, conflicts, acceptTheirs, keepMine, acceptAllTheirs, isPending } = useFormRebase(form);

  // A newer version saved meanwhile by someone else (a poll, a push message, the 409 of a save): merge it.
  const receiveServerVersion = () => rebase({ ...form.baseline, supplier: 'Rossi Construction Ltd', amount: '1350' });

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
      {/* Always mounted, also with nothing to say: its live region must exist before the first update. */}
      <RebaseNotice
        applied={applied}
        conflicts={conflicts}
        pending={isPending}
        onAcceptTheirs={acceptTheirs}
        onKeepMine={keepMine}
        onAcceptAllTheirs={acceptAllTheirs}
        labels={{ title: 'This invoice was updated while you were editing.' }}
      />
      {fields.map(({ name, label }) => (
        <Field
          key={name}
          label={label}
          name={name}
          // The field in conflict says so, linked with aria-describedby; its name does not change.
          help={conflicts.some((conflict) => conflict.path === name) ? 'Changed on the server too.' : undefined}
        >
          <Input value={form.values[name]} onChange={(event) => form.setValue(name, event.target.value)} />
        </Field>
      ))}
      <div>
        <Button variant="secondary" onClick={receiveServerVersion}>
          Receive the server version
        </Button>
      </div>
    </div>
  );
}
