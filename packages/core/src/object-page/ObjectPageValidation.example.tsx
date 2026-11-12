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
} from '@formrail/core';

interface Supplier {
  name: string;
  city: string;
}

export function NewSupplier() {
  const form = useObjectPageForm<Supplier>({
    baseline: { name: '', city: '' },
    // Keyed by the `name` of each Field. `save` runs it and does not call the handler while it finds errors.
    validate: (values) => ({
      name: values.name.trim() === '' ? 'Name is required' : undefined,
      city: values.city.trim() === '' ? 'City is required' : undefined,
    }),
  });
  // After a failed save, the focus goes to the first invalid field inside this container.
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef, fieldErrors: form.fieldErrors });

  return (
    <div ref={containerRef} style={{ height: 420 }}>
      <ObjectPage>
        <ObjectPageHeader title="New supplier" />
        <ObjectPageFooter visible label="Save actions">
          <Button variant="primary" onClick={() => void form.save(async (values) => values)}>
            Save
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="general" title="General">
          {/* Each Field reads its own error from the provider by `name`. */}
          <ValidationProvider fieldErrors={form.fieldErrors}>
            <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
              <Field label="Name" name="name" required>
                <Input value={form.values.name} onChange={(event) => form.setValue('name', event.target.value)} />
              </Field>
              <Field label="City" name="city" required>
                <Input value={form.values.city} onChange={(event) => form.setValue('city', event.target.value)} />
              </Field>
            </div>
          </ValidationProvider>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}
