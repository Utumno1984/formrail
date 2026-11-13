import { useRef, useState } from 'react';
import { Button, ConfirmDialog } from '@formrail/core';

export function DeleteInvoice() {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const outcomeRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={deleted}>
        Delete invoice…
      </Button>
      {/* The focus goes to a plain wrapper, the live region inside it speaks: one announcement, not two.
          The wrapper has no focus style of its own, so it draws the focus ring of the controls (2px primary). */}
      <span
        ref={outcomeRef}
        tabIndex={-1}
        onFocus={(e) => setFocused(e.target === e.currentTarget)}
        onBlur={(e) => e.target === e.currentTarget && setFocused(false)}
        style={{ outline: focused ? '2px solid var(--color-rop-primary)' : 'none', outlineOffset: 2 }}
      >
        <span role="status">{deleted ? 'Invoice deleted' : ''}</span>
      </span>
      {/* Closed until the button opens it. The action runs only on confirm; Cancel and Escape just close.
          The trigger is disabled once the invoice is gone, so it cannot take the focus back: `returnFocusRef`
          points to the outcome message instead (a wrapper around the live region), and the focus is never lost. */}
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
