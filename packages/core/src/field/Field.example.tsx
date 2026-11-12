import { useState } from 'react';
import { Field, Input } from '@formrail/core';

export function SupplierFields() {
  const [vat, setVat] = useState('123');
  const error = /^\d{11}$/.test(vat) ? undefined : 'The VAT number must have 11 digits.';

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <Field label="VAT number" help="Eleven digits, no spaces." required error={error}>
        <Input value={vat} onChange={(event) => setVat(event.target.value)} />
      </Field>
      <Field label="Price list" state="locked" stateReason="Set by the customer agreement.">
        <Input defaultValue="Price list A" />
      </Field>
    </div>
  );
}
