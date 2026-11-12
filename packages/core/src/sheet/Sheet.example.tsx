import { useState } from 'react';
import {
  Button,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@formrail/core';

export function SupplierDetailSheet() {
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      {/* Closed until the trigger opens it. Focus is trapped inside; Escape closes it and returns the focus to the trigger. */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="primary">Supplier detail</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <SheetTitle>Supplier detail</SheetTitle>
              <SheetDescription>View and edit the supplier details.</SheetDescription>
            </div>
            <SheetClose />
          </SheetHeader>
          <SheetBody>
            <p style={{ margin: 0 }}>Rossi Supplies Ltd, net 30 payment terms.</p>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SheetClose>
            <SheetClose asChild>
              <Button variant="primary" onClick={() => setSaved(true)}>
                Save
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <span role="status">{saved ? 'Saved' : ''}</span>
    </div>
  );
}
