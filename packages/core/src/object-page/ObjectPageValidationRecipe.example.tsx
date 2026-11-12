import { useRef } from 'react';
import {
  Button,
  Field,
  Input,
  ObjectPage,
  ObjectPageFooter,
  ObjectPageHeader,
  ObjectPageSection,
  ValidationProvider,
  getErrorSummary,
  useDirtyGuard,
  useFocusFirstInvalidField,
  useObjectPageForm,
} from '@formrail/core';

interface Invoice {
  customer: string;
  reference: string;
}

// The record as the server returned it: the baseline of the form.
const saved: Invoice = { customer: 'Rossi Construction', reference: '' };

async function saveInvoice(values: Invoice): Promise<Invoice> {
  // Your API call. What it returns becomes the new baseline.
  return values;
}

export function InvoiceEditor() {
  const form = useObjectPageForm<Invoice>({
    baseline: saved,
    validate: (values) => ({
      customer: values.customer.trim() === '' ? 'Customer is required' : undefined,
      reference: values.reference.trim() === '' ? 'Reference is required' : undefined,
    }),
  });
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef, fieldErrors: form.fieldErrors });
  const { guard, dialog } = useDirtyGuard({ when: form.isDirty });
  const summary = getErrorSummary(form.fieldErrors, { formErrors: form.formErrors });

  return (
    <div ref={containerRef} style={{ height: 460 }}>
      <ObjectPage>
        <ObjectPageHeader
          title="Invoice INV-0142"
          actions={
            <Button variant="secondary" onClick={() => guard(() => form.reset())}>
              Back to list
            </Button>
          }
        />
        {/* Shown while dirty or invalid; the summary ("2 fields need attention") sits in the bar itself. */}
        <ObjectPageFooter visible={form.isDirty || summary !== undefined} label="Save actions" message={summary} messageTone="error">
          <Button variant="primary" onClick={() => void form.save(saveInvoice)}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => form.reset()}>
            Discard changes
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="general" title="General">
          <ValidationProvider fieldErrors={form.fieldErrors}>
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Customer" name="customer" required>
                <Input value={form.values.customer} onChange={(event) => form.setValue('customer', event.target.value)} />
              </Field>
              <Field label="Reference" name="reference" required>
                <Input value={form.values.reference} onChange={(event) => form.setValue('reference', event.target.value)} />
              </Field>
            </div>
          </ValidationProvider>
        </ObjectPageSection>
      </ObjectPage>
      {dialog}
    </div>
  );
}
