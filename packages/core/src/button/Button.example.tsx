import { useState } from 'react';
import { Button } from '@formrail/core';

export function SaveToolbar() {
  const [status, setStatus] = useState('Not saved yet');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="primary" onClick={() => setStatus('Saved')}>
        Save
      </Button>
      <Button variant="secondary" onClick={() => setStatus('Not saved yet')}>
        Discard
      </Button>
      {/* An icon-only button must have an accessible name: `aria-label` (TypeScript requires it). */}
      <Button variant="ghost" size="icon-md" aria-label="Clear status" onClick={() => setStatus('')}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      </Button>
      <span role="status">{status}</span>
    </div>
  );
}
