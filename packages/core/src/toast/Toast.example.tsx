import { Button, ToastProvider, useToast } from '@formrail/core';

function SaveButton() {
  const toast = useToast();
  return (
    <Button
      variant="primary"
      onClick={() =>
        toast.show({
          tone: 'success',
          description: 'Supplier note saved',
          action: { label: 'Undo', onClick: () => undefined },
        })
      }
    >
      Save
    </Button>
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
