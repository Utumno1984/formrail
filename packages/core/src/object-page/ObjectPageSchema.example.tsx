import { useRef } from 'react';
import { z } from 'zod';
import {
  Button,
  Field,
  Input,
  ObjectPage,
  ObjectPageFooter,
  ObjectPageHeader,
  ObjectPageSection,
  ValidationProvider,
  useFocusFirstInvalidField,
  useObjectPageForm,
} from '@formrail/core';

// Any Standard Schema works (Zod 3.24+ / 4, Valibot, ArkType): the library itself imports none.
const orderSchema = z.object({
  supplier: z.string().trim().min(1, 'Supplier is required'),
  // The input holds a string: the schema coerces it to check it, the save handler still gets the string.
  amount: z.coerce.number().positive('Amount must be a positive number'),
});

export function NewOrder() {
  const form = useObjectPageForm({ baseline: { supplier: '', amount: '' }, schema: orderSchema });
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef, fieldErrors: form.fieldErrors });

  return (
    <div ref={containerRef} style={{ height: 420 }}>
      <ObjectPage>
        <ObjectPageHeader title="New order" />
        <ObjectPageFooter visible label="Save actions">
          <Button variant="primary" onClick={() => void form.save(async (values) => values)}>
            Save
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="order" title="Order">
          {/* The schema's issues land in `fieldErrors`, keyed by path: each Field reads its own by `name`. */}
          <ValidationProvider fieldErrors={form.fieldErrors}>
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Supplier" name="supplier" required>
                <Input value={form.values.supplier} onChange={(event) => form.setValue('supplier', event.target.value)} />
              </Field>
              <Field label="Amount" name="amount" required>
                <Input inputMode="decimal" value={form.values.amount} onChange={(event) => form.setValue('amount', event.target.value)} />
              </Field>
            </div>
          </ValidationProvider>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}
