import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@formrail/core';

export function EditSupplierDialog() {
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      {/* Closed until the trigger opens it. Focus is trapped inside; Escape closes it and returns the focus to the trigger. */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="primary">Edit supplier</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <DialogTitle>Edit supplier</DialogTitle>
              <DialogDescription>Update the supplier details and save.</DialogDescription>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <p style={{ margin: 0 }}>Rossi Supplies Ltd, net 30 payment terms.</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="primary" onClick={() => setSaved(true)}>
                Save
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <span role="status">{saved ? 'Saved' : ''}</span>
    </div>
  );
}
