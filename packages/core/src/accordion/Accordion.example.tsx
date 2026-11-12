import { useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Input } from '@formrail/core';

export function InvoiceAccordion() {
  // Controlled, one section open at a time; the open one can be closed again (`collapsible`).
  // Enter or Space on a trigger toggles its section, the arrow keys move between the triggers.
  const [open, setOpen] = useState('details');
  return (
    <div style={{ maxWidth: 520 }}>
      <Accordion type="single" collapsible value={open} onValueChange={setOpen}>
        <AccordionItem value="details">
          <AccordionTrigger>Invoice details</AccordionTrigger>
          <AccordionContent>
            <Input aria-label="Invoice details note" placeholder="Note" />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="shipping">
          <AccordionTrigger>Shipping</AccordionTrigger>
          <AccordionContent>
            <Input aria-label="Shipping note" placeholder="Note" />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="billing">
          <AccordionTrigger>Billing</AccordionTrigger>
          <AccordionContent>
            <Input aria-label="Billing note" placeholder="Note" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
