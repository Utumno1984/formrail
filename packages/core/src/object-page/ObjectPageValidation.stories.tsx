import { useRef, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Combobox } from '../combobox/Combobox';
import { Field } from '../field/Field';
import { ValidationProvider } from '../field/ValidationContext';
import { Input } from '../input/Input';
import { Select } from '../select/Select';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

type Supplier = { supplier: string; country: string; city: string };

interface ValidationArgs {
  withProvider: boolean;
  countryError: string;
  onSave: (values: Supplier) => void;
}

const COUNTRIES = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany' },
];
const CITIES = [
  { value: 'rome', label: 'Rome' },
  { value: 'paris', label: 'Paris' },
  { value: 'berlin', label: 'Berlin' },
];

const EMPTY: Supplier = { supplier: '', country: '', city: '' };

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const FRAME: CSSProperties = { height: '100dvh', boxSizing: 'border-box', background: 'var(--color-rop-surface, #fff)' };
const GRID: CSSProperties = { display: 'grid', gap: 16, maxWidth: 420 };

const meta: Meta<ValidationArgs> = {
  title: 'Floorplans/Object Page/Validation',
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: "Validation on an Object Page: `useObjectPageForm` collects the errors, a `ValidationProvider` hands each one to the `Field` with the matching `name`, and the footer's error summary moves the focus to the first invalid field on save. Press Save with nothing filled in to see it." } },
  },
  argTypes: {
    withProvider: {
      control: 'boolean',
      description:
        'Wire the errors through a `ValidationProvider` (each Field reads its own by `name`). Off: every Field gets `error={form.fieldErrors[name]}` by hand; the result is the same.',
    },
    countryError: {
      control: 'text',
      description: 'An explicit `error` on Country. With content it wins over the provider; empty, the provider error is used.',
    },
    onSave: { control: false },
  },
  args: { withProvider: true, countryError: '', onSave: fn() },
};

export default meta;
type Story = StoryObj<ValidationArgs>;

/**
 * A new supplier: every field is required. `useObjectPageForm({ validate })` produces `fieldErrors`
 * keyed by the Field `name`; a `ValidationProvider` hands them to the Fields (the key is written
 * once), and `useFocusFirstInvalidField` moves the focus to the first invalid one after Save.
 */
function ValidationDemo({ withProvider, countryError, onSave }: ValidationArgs) {
  const form = useObjectPageForm<Supplier>({
    baseline: EMPTY,
    validate: (v) => ({
      supplier: v.supplier.trim() === '' ? 'Supplier is required' : undefined,
      country: v.country === '' ? 'Country is required' : undefined,
      city: v.city === '' ? 'City is required' : undefined,
    }),
  });
  const frameRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors: form.fieldErrors });
  // Without the provider the same errors are passed by hand, key repeated for each Field.
  const manual = (name: keyof Supplier) => (withProvider ? undefined : form.fieldErrors[name]);

  const fields = (
    <div style={GRID}>
      <Field label="Supplier" name="supplier" required error={manual('supplier')}>
        <Input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
      </Field>
      <Field label="Country" name="country" required error={countryError || manual('country')}>
        <Select
          options={COUNTRIES}
          placeholder="Choose a country"
          value={form.values.country || undefined}
          onValueChange={(v) => form.setValue('country', v)}
        />
      </Field>
      <Field label="City" name="city" required error={manual('city')}>
        <Combobox options={CITIES} value={form.values.city || undefined} onValueChange={(v) => form.setValue('city', v ?? '')} />
      </Field>
    </div>
  );

  return (
    <div ref={frameRef} style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="New supplier" />
        <ObjectPageFooter visible label="Save actions">
          <Button variant="primary" onClick={() => void form.save((values) => onSave(values))}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => form.reset()}>
            Discard changes
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="general" title="General data">
          {withProvider ? <ValidationProvider fieldErrors={form.fieldErrors}>{fields}</ValidationProvider> : fields}
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}

const render = (args: ValidationArgs) => <ValidationDemo {...args} />;

/**
 * Save with nothing filled in: every Field shows its own message and `aria-invalid`, the focus goes to
 * the first one. Filling in the supplier and saving again moves the focus to the next invalid one.
 */
export const WithValidation: Story = {
  name: 'Object Page with validation',
  render,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const supplier = canvas.getByRole('textbox', { name: 'Supplier' });
    const country = canvas.getByRole('combobox', { name: 'Country' });
    const city = canvas.getByRole('combobox', { name: 'City' });
    for (const control of [supplier, country, city]) await expect(control).not.toHaveAttribute('aria-invalid');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(supplier).toHaveFocus());
    await expect(supplier).toHaveAttribute('aria-invalid', 'true');
    await expect(supplier).toHaveAccessibleDescription('Supplier is required');
    await expect(country).toHaveAttribute('aria-invalid', 'true');
    await expect(country).toHaveAccessibleDescription('Country is required');
    await expect(city).toHaveAttribute('aria-invalid', 'true');
    await expect(city).toHaveAccessibleDescription('City is required');
    await expect(args.onSave).not.toHaveBeenCalled();

    await userEvent.type(supplier, 'ACME srl');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(country).toHaveFocus());
    await expect(supplier).not.toHaveAttribute('aria-invalid');
    await expect(canvas.queryByText('Supplier is required')).not.toBeInTheDocument();
    await expect(country).toHaveAttribute('aria-invalid', 'true');
    await expect(city).toHaveAttribute('aria-invalid', 'true');
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** An explicit `error` with content on Country wins over the one from the provider, before and after Save. */
export const ExplicitErrorWins: Story = {
  render,
  args: { countryError: 'We do not ship to this country yet' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const country = canvas.getByRole('combobox', { name: 'Country' });
    await expect(country).toHaveAttribute('aria-invalid', 'true');
    await expect(country).toHaveAccessibleDescription('We do not ship to this country yet');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const supplier = canvas.getByRole('textbox', { name: 'Supplier' });
    await waitFor(() => expect(supplier).toHaveFocus());
    await expect(supplier).toHaveAccessibleDescription('Supplier is required');
    await expect(country).toHaveAccessibleDescription('We do not ship to this country yet');
    await expect(canvas.queryByText('Country is required')).not.toBeInTheDocument();
    await expect(canvas.getByRole('combobox', { name: 'City' })).toHaveAccessibleDescription('City is required');
  },
};

/** Same form without the provider (each Field gets `error=` by hand): Save gives the same messages and focus. */
export const WithoutProvider: Story = {
  render,
  args: { withProvider: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const supplier = canvas.getByRole('textbox', { name: 'Supplier' });
    await waitFor(() => expect(supplier).toHaveFocus());
    await expect(supplier).toHaveAccessibleDescription('Supplier is required');
    await expect(canvas.getByRole('combobox', { name: 'Country' })).toHaveAccessibleDescription('Country is required');
    await expect(canvas.getByRole('combobox', { name: 'City' })).toHaveAccessibleDescription('City is required');
  },
};

/** No `play`: what `e2e/validation-provider.spec.ts` drives with real input. */
export const Manual: Story = { render };
