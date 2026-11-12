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
  useFocusFirstInvalidField,
  useObjectPageForm,
  type StandardSchemaIssue,
  type StandardSchemaLike,
} from '@formrail/core';

interface Order {
  supplier: string;
  amount: string;
}

// `schema` takes any Standard Schema: with Zod (3.24+ / 4), Valibot or ArkType, pass the schema itself, e.g.
// `z.object({ supplier: z.string().trim().min(1, 'Supplier is required'), amount: z.coerce.number().positive() })`.
// Written by hand here so the example needs no schema library: a validator that returns issues with a path.
const orderSchema: StandardSchemaLike = {
  '~standard': {
    validate: (value) => {
      const order = value as Order;
      const issues: StandardSchemaIssue[] = [];
      if (order.supplier.trim() === '') issues.push({ message: 'Supplier is required', path: ['supplier'] });
      if (!(Number(order.amount) > 0)) issues.push({ message: 'Amount must be a positive number', path: ['amount'] });
      return issues.length > 0 ? { issues } : { value };
    },
  },
};

export function NewOrder() {
  const form = useObjectPageForm<Order>({ baseline: { supplier: '', amount: '' }, schema: orderSchema });
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
