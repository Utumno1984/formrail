import { useState } from 'react';
import { Button, ToastProvider, useToast } from '@formrail/core';

function SaveButton() {
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button
        variant="primary"
        onClick={() => {
          setSaved(true);
          toast.show({
            tone: 'success',
            description: 'Supplier note saved',
            action: { label: 'Undo', onClick: () => setSaved(false) },
          });
        }}
      >
        Save
      </Button>
      <span data-testid="note-state">{saved ? 'Note saved' : 'Note not saved'}</span>
    </div>
  );
}

export function SaveWithToast() {
  // One provider near the root of the app; `useToast()` works anywhere below it. The toast is announced
  // without taking the focus away, and closes by itself (or with its close button, or Escape).
  return (
    <ToastProvider>
      <div style={{ padding: 24 }}>
        <SaveButton />
      </div>
    </ToastProvider>
  );
}
