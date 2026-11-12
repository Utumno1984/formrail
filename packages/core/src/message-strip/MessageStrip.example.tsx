import { useEffect, useRef, useState } from 'react';
import { Button, MessageStrip } from '@formrail/core';

export function DismissibleNotice() {
  const [open, setOpen] = useState(true);
  const show = useRef<HTMLButtonElement>(null);
  const dismissed = useRef(false);
  // The strip never hides itself: you unmount it, and you decide where the focus goes next.
  useEffect(() => {
    if (!open && dismissed.current) show.current?.focus();
  }, [open]);
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
      {open ? (
        <MessageStrip
          tone="warning"
          title="Session expiring"
          onDismiss={() => {
            dismissed.current = true;
            setOpen(false);
          }}
        >
          Save your work within five minutes.
        </MessageStrip>
      ) : null}
      <div>
        <Button ref={show} variant="secondary" disabled={open} onClick={() => setOpen(true)}>
          Show the notice again
        </Button>
      </div>
    </div>
  );
}
