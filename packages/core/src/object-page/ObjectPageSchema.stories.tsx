import { useRef, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { storyControls } from '../internal/story-docs';
import { MessageStrip } from '../message-strip/MessageStrip';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import type { StandardSchemaLike } from './standard-schema';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

// Zod is a devDependency used only by tests and stories: the core itself imports no schema library.
// Any Standard Schema (Zod >= 3.24 / 4, Valibot, ArkType, a hand-written object) works the same way.

type Order = { supplier: string; amount: string; address: { city: string } };

const EMPTY: Order = { supplier: '', amount: '', address: { city: '' } };
const FILLED: Order = { supplier: 'ACME Ltd', amount: '1200', address: { city: 'Rome' } };

const fieldRules = z.object({
  supplier: z.string().trim().min(1, 'Supplier is required'),
  // The input holds a string: the schema coerces it to check it, the handler still gets the string.
  amount: z.coerce.number().positive('Amount must be a positive number'),
  address: z.object({ city: z.string().trim().min(1, 'City is required') }),
});

// A rule on the whole object (empty path): it ends up in `formErrors`, not on a field.
const withRootRule = fieldRules.refine((v) => !(v.address.city === 'Rome' && v.amount > 1000), {
  message: 'Orders shipped to Rome above 1000 need a manager approval.',
});

// Not supported in v1: the save fails at once with an explicit save error.
const asyncSchema: StandardSchemaLike = {
  '~standard': { validate: async (value: unknown) => ({ value }) },
};

// URL-safe keys (Storybook `args=` syntax), readable labels in the Controls panel.
const SCHEMAS = {
  fields: fieldRules,
  'fields-and-root-rule': withRootRule,
  async: asyncSchema,
} satisfies Record<string, StandardSchemaLike>;
const SCHEMA_LABELS: Record<keyof typeof SCHEMAS, string> = {
  fields: 'Field rules',
  'fields-and-root-rule': 'Field rules + whole-object rule',
  async: 'Async (unsupported in v1)',
};
type SchemaName = keyof typeof SCHEMAS;

const INITIAL = { empty: EMPTY, filled: FILLED } as const;

interface SchemaFormArgs {
  /** Which schema the form validates with. */
  schema: SchemaName;
  /** Values the form starts from (read once, at mount). */
  initial: keyof typeof INITIAL;
  /** Called with the raw values when the save goes through. */
  onSave: (values: Order) => void;
}

const FRAME: CSSProperties = { height: '100dvh', boxSizing: 'border-box', background: 'var(--color-rop-surface, #fff)' };
const STACK: CSSProperties = { display: 'grid', gap: 16, maxWidth: 480 };

const errorText = (error: unknown) => (error === null ? undefined : error instanceof Error ? error.message : String(error));

function SchemaForm({ schema, initial, onSave }: SchemaFormArgs) {
  const form = useObjectPageForm<Order>({ baseline: INITIAL[initial], schema: SCHEMAS[schema] });
  const frameRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors: form.fieldErrors });
  const [saved, setSaved] = useState(0);

  const submit = async () => {
    const ok = await form.save(async (values) => {
      onSave(values);
    });
    if (ok) setSaved((n) => n + 1);
  };

  return (
    <div ref={frameRef} style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Purchase order 2026/0142" subtitle={form.values.supplier || 'New supplier'} />
        <ObjectPageFooter visible message={errorText(form.saveError)} messageTone="error" label="Save actions">
          <Button variant="primary" onClick={submit} aria-disabled={form.isSaving || undefined}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => form.reset()}>
            Discard changes
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="general" title="General">
          <div style={STACK}>
            {form.formErrors.length > 0 && (
              <MessageStrip tone="error" title="The order cannot be saved:" data-testid="form-errors">
                {form.formErrors.join(' ')}
              </MessageStrip>
            )}
            <p role="status" data-testid="saved">
              {saved > 0 ? `Saved ${saved} time(s).` : ''}
            </p>
            <Field label="Supplier" name="supplier" required error={form.fieldErrors['supplier']}>
              <Input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
            </Field>
            <Field label="Amount" name="amount" required error={form.fieldErrors['amount']}>
              <Input inputMode="decimal" value={form.values.amount} onChange={(e) => form.setValue('amount', e.target.value)} />
            </Field>
          </div>
        </ObjectPageSection>
        <ObjectPageSection id="address" title="Address">
          <div style={STACK}>
            <Field label="City" name="address.city" required error={form.fieldErrors['address.city']}>
              <Input value={form.values.address.city} onChange={(e) => form.setValue('address', { city: e.target.value })} />
            </Field>
          </div>
        </ObjectPageSection>
      </ObjectPage>
    </div>
  );
}

/**
 * `useObjectPageForm({ schema })` with a Zod schema (any Standard Schema works). On Save the schema
 * issues become `fieldErrors` keyed by dot-notation path (`address.city`), shown on each Field, and
 * the focus goes to the first invalid field in visual order. A schema failure is not a save error:
 * the footer stays clean. Issues on the whole object (`refine` on the root) become `formErrors`,
 * shown here in a MessageStrip. The handler receives the **raw** values (here `amount` is still a
 * string, though the schema coerces it to check it). Remount the story after changing `initial`
 * (the baseline is read once, at mount).
 */
const meta = {
  title: 'Floorplans/Object Page/Schema validation',
  // The page documents a hook option, `useObjectPageForm({ schema })`, not a component: `SchemaForm` is the
  // story's own demo (it renders the stories; the docgen does not read story files), so there is no props
  // table, and the controls are the hook's options, under "Story controls".
  component: SchemaForm,
  parameters: { layout: 'fullscreen' },
  argTypes: storyControls({
    schema: {
      control: { type: 'select', labels: SCHEMA_LABELS },
      options: Object.keys(SCHEMAS),
      description: 'Standard Schema passed to `useObjectPageForm({ schema })`.',
    },
    initial: { control: 'radio', options: Object.keys(INITIAL), description: '`useObjectPageForm({ baseline })`: the initial values (read once, at mount).' },
    onSave: { control: false, description: 'The handler passed to `form.save(handler)`: receives the raw values.' },
  }),
  args: { schema: 'fields', initial: 'empty', onSave: fn() },
} satisfies Meta<typeof SchemaForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Object Page with schema: Save with nothing filled in, then fill everything and save again. */
export const WithSchema: Story = {
  name: 'Object Page with schema',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const footer = canvas.getByRole('region', { name: 'Save actions' });
    await userEvent.click(within(footer).getByRole('button', { name: 'Save' }));

    // Messages on the right fields, nested path included; focus on the first in visual order.
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Supplier' })).toHaveFocus());
    await expect(canvas.getByText('Supplier is required')).toBeVisible();
    await expect(canvas.getByText('Amount must be a positive number')).toBeInTheDocument();
    await expect(canvas.getByText('City is required')).toBeInTheDocument();
    await expect(canvas.getByRole('textbox', { name: 'City' })).toHaveAttribute('aria-invalid', 'true');
    // Not a save error: nothing in the footer, no JSON anywhere.
    await expect(footer).not.toHaveTextContent(/required|positive|\{/);
    await expect(canvas.queryByTestId('form-errors')).not.toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();

    await userEvent.type(canvas.getByRole('textbox', { name: 'Supplier' }), 'ACME Ltd');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '120');
    await userEvent.type(canvas.getByRole('textbox', { name: 'City' }), 'Milan');
    await userEvent.click(within(footer).getByRole('button', { name: 'Save' }));

    // Raw values: `amount` is the typed string, not the number the schema coerced it to.
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({ supplier: 'ACME Ltd', amount: '120', address: { city: 'Milan' } }),
    );
    await expect(await canvas.findByText('Saved 1 time(s).')).toBeInTheDocument();
    await expect(canvas.queryByText('City is required')).not.toBeInTheDocument();
  },
};

/** No `play`: the e2e drives Save itself. */
export const WithSchemaNoPlay: Story = { name: 'Object Page with schema (no play)', tags: ['internal'] };

/** A rule on the whole object fails: its message goes to `formErrors` (the strip), no field is marked invalid. */
export const WholeObjectRule: Story = {
  args: { schema: 'fields-and-root-rule', initial: 'filled' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const footer = canvas.getByRole('region', { name: 'Save actions' });
    await userEvent.click(within(footer).getByRole('button', { name: 'Save' }));
    const strip = await canvas.findByTestId('form-errors');
    await expect(strip).toHaveTextContent('Orders shipped to Rome above 1000 need a manager approval.');
    await expect(canvas.getByRole('textbox', { name: 'City' })).not.toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Amount' })).not.toHaveAttribute('aria-invalid', 'true');
    await expect(args.onSave).not.toHaveBeenCalled();

    // Lowering the amount satisfies the rule: editing clears the strip, the save goes through.
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Amount' }));
    await expect(canvas.queryByTestId('form-errors')).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Amount' }), '900');
    await userEvent.click(within(footer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSave).toHaveBeenCalledWith({ ...FILLED, amount: '900' }));
  },
};

/** An asynchronous schema is not supported in v1: the save fails at once with an explicit save error in the footer. */
export const AsyncSchemaUnsupported: Story = {
  args: { schema: 'async', initial: 'filled' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const footer = canvas.getByRole('region', { name: 'Save actions' });
    await userEvent.click(within(footer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(footer).toHaveTextContent('asynchronous schema not supported'));
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
