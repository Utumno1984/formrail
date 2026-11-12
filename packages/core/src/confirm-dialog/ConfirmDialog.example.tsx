import { useState } from 'react';
import { Button, ConfirmDialog } from '@formrail/core';

export function DeleteInvoice() {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={deleted}>
        Delete invoice…
      </Button>
      <span role="status">{deleted ? 'Invoice deleted' : ''}</span>
      {/* Closed until the button opens it. The action runs only on confirm; Cancel and Escape just close. */}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title="Delete invoice 2026/0142?"
        description="The invoice and its 3 attachments are deleted for good. This cannot be undone."
        confirmLabel="Delete invoice"
        onConfirm={() => setDeleted(true)}
      />
    </div>
  );
}
