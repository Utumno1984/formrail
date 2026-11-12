import { useState } from 'react';
import { Checkbox, Field } from '@formrail/core';

export function TermsCheckbox() {
  const [accepted, setAccepted] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Terms" help="You can change this later.">
        <Checkbox checked={accepted} onCheckedChange={(next) => setAccepted(next === true)}>
          I accept the terms of service
        </Checkbox>
      </Field>
      <output>{accepted ? 'Accepted' : 'Not accepted yet'}</output>
    </div>
  );
}
