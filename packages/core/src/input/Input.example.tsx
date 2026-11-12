import { useState } from 'react';
import { Field, Input } from '@formrail/core';

export function CompanyNameInput() {
  const [name, setName] = useState('Acme Ltd');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Company name" help="As it appears on the invoice." required>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <output>{name.length} characters</output>
    </div>
  );
}
