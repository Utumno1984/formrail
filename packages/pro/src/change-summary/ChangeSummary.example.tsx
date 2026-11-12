import { Button, Field, Input, useObjectPageForm } from '@formrail/core';
import { ChangeSummary, useChangeSummary } from '@formrail/pro';

interface Invoice {
  supplier: string;
  amount: string;
  notes: string | null;
}

// The record as your API returned it: no notes yet (`null`).
const saved: Invoice = { supplier: 'Rossi Construction', amount: '1200', notes: null };

export function InvoiceChanges() {
  const form = useObjectPageForm({ baseline: saved });
  // Compare against the form's real baseline, never a static default: after a save it is the saved record.
  const { entries } = useChangeSummary({ values: form.values, baseline: form.baseline });

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 480 }}>
      <Field label="Supplier" name="supplier">
        <Input value={form.values.supplier} onChange={(event) => form.setValue('supplier', event.target.value)} />
      </Field>
      <Field label="Amount" name="amount">
        <Input inputMode="decimal" value={form.values.amount} onChange={(event) => form.setValue('amount', event.target.value)} />
      </Field>
      <Field label="Notes" name="notes">
        {/* An empty box writes `null` back, as saved: `''` and `null` are different values, and a cleared box
            would otherwise stay listed as a change. */}
        <Input value={form.values.notes ?? ''} onChange={(event) => form.setValue('notes', event.target.value || null)} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Your API call goes inside `save`: what it returns becomes the new baseline, and the summary empties. */}
        <Button variant="primary" onClick={() => void form.save(async (values) => values)}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => form.reset()}>
          Discard
        </Button>
      </div>
      <ChangeSummary entries={entries} label="Unsaved changes" emptyLabel="No unsaved changes" />
    </div>
  );
}
