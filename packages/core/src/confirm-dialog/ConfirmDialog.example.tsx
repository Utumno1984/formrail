import { useRef, useState } from 'react';
import { Button, ConfirmDialog } from '@formrail/core';

export function DeleteInvoice() {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const outcomeRef = useRef<HTMLSpanElement>(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={deleted}>
        Delete invoice…
      </Button>
      <span role="status" ref={outcomeRef} tabIndex={-1}>{deleted ? 'Invoice deleted' : ''}</span>
      {/* Closed until the button opens it. The action runs only on confirm; Cancel and Escape just close.
          The trigger is disabled once the invoice is gone, so it cannot take the focus back: `returnFocusRef`
          points to the outcome message instead, and the focus is never lost. */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title="Delete invoice 2026/0142?"
        description="The invoice and its 3 attachments are deleted for good. This cannot be undone."
        confirmLabel="Delete invoice"
        onConfirm={() => setDeleted(true)}
        returnFocusRef={outcomeRef}
      />
    </div>
  );
}
