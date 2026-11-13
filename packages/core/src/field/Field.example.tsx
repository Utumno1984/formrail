import { useState } from 'react';
import { Field, Input } from '@formrail/core';

export function SupplierFields() {
  const [vat, setVat] = useState('12345678901');
  // The error is shown only once the user has left the field: never on a pristine value.
  const [touched, setTouched] = useState(false);
  const error = touched && !/^\d{11}$/.test(vat) ? 'The VAT number must have 11 digits.' : undefined;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <Field label="VAT number" help="Eleven digits, no spaces." required error={error}>
        <Input value={vat} onChange={(event) => setVat(event.target.value)} onBlur={() => setTouched(true)} />
      </Field>
      <Field label="Price list" state="locked" stateReason="Set by the customer agreement.">
        <Input defaultValue="Price list A" />
      </Field>
    </div>
  );
}
