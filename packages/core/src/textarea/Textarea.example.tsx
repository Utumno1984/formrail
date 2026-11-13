import { useState } from 'react';
import { Field, Textarea } from '@formrail/core';

export function RejectionReasonTextarea() {
  const [reason, setReason] = useState('Amount does not match the purchase order.');

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Field label="Rejection reason" help="Shown to the supplier." required>
        <Textarea value={reason} onChange={(event) => setReason(event.target.value)} autoResize rows={2} maxRows={6} />
      </Field>
      <p style={{ margin: 0 }}>{reason.length} characters</p>
    </div>
  );
}
