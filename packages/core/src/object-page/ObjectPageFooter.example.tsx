import { Button, Field, Input, ObjectPage, ObjectPageFooter, ObjectPageHeader, ObjectPageSection, useObjectPageForm } from '@formrail/core';

interface Invoice {
  customer: string;
  reference: string;
}

const saved: Invoice = { customer: 'Rossi Construction', reference: 'PO-2026-118' };

export function EditInvoice() {
  // The baseline is the record as saved: `isDirty` compares the values against it, never against defaults.
  const form = useObjectPageForm({ baseline: saved });

  return (
    <div style={{ height: 420 }}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice INV-0142" />
        {/* The save bar shows while there are unsaved changes; its space is reserved, so nothing jumps. */}
        <ObjectPageFooter visible={form.isDirty} label="Save actions">
          <Button variant="primary" onClick={() => void form.save(async (values) => values)}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => form.reset()}>
            Discard changes
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="general" title="General">
          <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
            <Field label="Customer" name="customer">
              <Input value={form.values.customer} onChange={(event) => form.setValue('customer', event.target.value)} />
            </Field>
            <Field label="Reference" name="reference">
              <Input value={form.values.reference} onChange={(event) => form.setValue('reference', event.target.value)} />
            </Field>
          </div>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}
