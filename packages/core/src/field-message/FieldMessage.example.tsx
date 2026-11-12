import { useState } from 'react';
import { FieldMessage, Input } from '@formrail/core';

export function PasswordHint() {
  const [value, setValue] = useState('');
  const tooShort = value.length > 0 && value.length < 8;
  return (
    <div style={{ maxWidth: 320, display: 'grid', gap: 4 }}>
      <label htmlFor="password">Password</label>
      {/* The message is the input's accessible description (`aria-describedby`); it is not a live region. */}
      <Input
        id="password"
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby="password-message"
        aria-invalid={tooShort || undefined}
      />
      <FieldMessage id="password-message" tone={tooShort ? 'error' : 'help'}>
        {tooShort ? 'The password is too short.' : 'At least 8 characters.'}
      </FieldMessage>
    </div>
  );
}
