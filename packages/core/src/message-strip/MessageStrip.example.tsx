import { useEffect, useRef, useState } from 'react';
import { Button, MessageStrip } from '@formrail/core';

export function DismissibleNotice() {
  const [open, setOpen] = useState(true);
  const strip = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const show = useRef<HTMLButtonElement>(null);
  const dismissed = useRef(false);
  const reopened = useRef(false); // set on the first reopening and kept: every later reopening moves the focus too
  // The strip never hides itself: you unmount it, and you decide where the focus goes next. Closed: to the
  // button that brings it back. Reopened: to a plain wrapper around the strip, not to the strip, which is the live region
  // (one announcement). The wrapper draws the focus ring of the controls (2px primary). That button is disabled
  // while the strip is open.
  useEffect(() => {
    if (!open && dismissed.current) show.current?.focus();
    if (open && reopened.current) strip.current?.focus();
  }, [open]);
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
      {open ? (
        <div
          ref={strip}
          tabIndex={-1}
          onFocus={(e) => setFocused(e.target === e.currentTarget)}
          onBlur={(e) => e.target === e.currentTarget && setFocused(false)}
          style={{ outline: focused ? '2px solid var(--color-rop-primary)' : 'none', outlineOffset: 2 }}
        >
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
        </div>
      ) : null}
      <div>
        <Button
          ref={show}
          variant="secondary"
          disabled={open}
          onClick={() => {
            reopened.current = true;
            setOpen(true);
          }}
        >
          Show the notice again
        </Button>
      </div>
    </div>
  );
}
