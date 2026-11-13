import { useEffect, useRef, useState } from 'react';
import { Button, MessageStrip } from '@formrail/core';

export function DismissibleNotice() {
  const [open, setOpen] = useState(true);
  const strip = useRef<HTMLDivElement>(null);
  const show = useRef<HTMLButtonElement>(null);
  const dismissed = useRef(false);
  const reopened = useRef(false);
  // The strip never hides itself: you unmount it, and you decide where the focus goes next. Closed: to the
  // button that brings it back. Reopened: to the strip itself (that button is disabled while it is open).
  useEffect(() => {
    if (!open && dismissed.current) show.current?.focus();
    if (open && reopened.current) strip.current?.focus();
  }, [open]);
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
      {open ? (
        <MessageStrip
          ref={strip}
          tabIndex={-1}
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
        <Button ref={show} variant="secondary" disabled={open} onClick={() => {
            reopened.current = true;
            setOpen(true);
          }}>
          Show the notice again
        </Button>
      </div>
    </div>
  );
}
