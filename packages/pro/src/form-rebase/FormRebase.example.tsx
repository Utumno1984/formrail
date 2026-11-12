import { useId, useRef } from 'react';
import { Button, Field, Input, Text, Title, useObjectPageForm } from '@formrail/core';
import { ChangeSummary, useFormRebase } from '@formrail/pro';

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

export function InvoiceRebase() {
  const form = useObjectPageForm({ baseline: saved });
  const { rebase, conflicts, applied, acceptTheirs, keepMine } = useFormRebase(form);
  const inputs = useRef<Partial<Record<keyof Invoice, HTMLInputElement | null>>>({});
  const conflictsHeading = useId();

  // A newer version of the record, saved meanwhile by someone else. In your app it comes from a poll, a push
  // message or the 409 response of a save: pass it to `rebase` and the user's draft is merged into it.
  const receiveServerVersion = () => rebase({ ...form.baseline, supplier: 'Rossi Construction Ltd', amount: '1350' });

  // Resolving a conflict removes its buttons: the focus goes to the field it decided.
  const resolve = (path: string, choice: (path: string) => void) => {
    choice(path);
    inputs.current[path as keyof Invoice]?.focus();
  };

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
      {fields.map(({ name, label }) => (
        <Field key={name} label={label} name={name}>
          <Input
            ref={(element) => {
              inputs.current[name] = element;
            }}
            value={form.values[name]}
            onChange={(event) => form.setValue(name, event.target.value)}
          />
        </Field>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="secondary" onClick={receiveServerVersion}>
          Receive the server version
        </Button>
        <Button variant="secondary" onClick={() => form.reset()}>
          Discard
        </Button>
      </div>
      {/* The fields you did not touch take the server value: listed here. */}
      <ChangeSummary entries={applied} label="Applied server changes" emptyLabel="No server changes applied" />
      {/* The fields both of you changed keep your value until you decide. */}
      <section aria-labelledby={conflictsHeading}>
        <Title id={conflictsHeading} level={3} size="sm">
          Conflicts ({conflicts.length})
        </Title>
        <ul style={{ display: 'grid', gap: 8, paddingLeft: 16 }}>
          {conflicts.map((conflict) => (
            <li key={conflict.path} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Text as="span">{`${conflict.label}: yours ${String(conflict.mine)}, server ${String(conflict.theirs)}`}</Text>
              <Button size="sm" variant="secondary" onClick={() => resolve(conflict.path, acceptTheirs)}>
                {`Use the server value for ${conflict.label}`}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => resolve(conflict.path, keepMine)}>
                {`Keep my value for ${conflict.label}`}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
