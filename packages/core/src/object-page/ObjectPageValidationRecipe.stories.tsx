import { useRef, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { Button } from '../button/Button';
import { storyControls } from '../internal/story-docs';
import { Combobox } from '../combobox/Combobox';
import { Field, type FieldStateProps } from '../field/Field';
import { ValidationProvider } from '../field/ValidationContext';
import { Input } from '../input/Input';
import { Select } from '../select/Select';
import { getErrorSummary } from './error-summary';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import { useDirtyGuard } from './use-dirty-guard';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

/*
 * THE RECIPE: an Object Page form with uniform validation, end to end.
 *
 *   useObjectPageForm({ baseline, schema })       values, baseline, isDirty, save(), fieldErrors
 *   <ValidationProvider fieldErrors={...}>        each <Field name="..."> reads its own error by path
 *   useFocusFirstInvalidField({ ... })            a failed Save moves the focus to the first invalid field
 *   <ObjectPageFooter message={...}>              the polite summary: the COUNT of invalid fields
 *   useDirtyGuard({ when: form.isDirty })         unsaved-changes guard on exit actions and on beforeunload
 *
 * How the pieces relate
 *
 * - Validation happens only on Save (`form.save` runs the schema synchronously before the handler).
 *   There is no per-keystroke validation; an edit only CLEARS the errors of the path it touched
 *   (and of its descendants: editing `address` clears `address.city`).
 * - `useDirtyGuard` is NOT coupled to validity: `form.isDirty` compares the values with the real
 *   baseline, a failed Save changes neither the values nor the baseline, so a failed validation
 *   never turns the form dirty or clean, never adds or removes the `beforeunload` listener and never
 *   opens the guard's dialog. A guarded exit after a failed Save still asks for confirmation (the
 *   form is still dirty). Pass `when: form.isDirty` and nothing else.
 *
 * Announcements (the rule of the error levels, see `useObjectPageForm`)
 *
 * - Field error: not live. `aria-invalid` + `aria-describedby` on the control; after a failed Save the
 *   focus moves to the first invalid field and the screen reader reads its message there.
 * - Summary and save error: the footer's `role="status"` (polite), one line. The summary is
 *   `getErrorSummary(...)`: the count only, never the field messages. A save error (network/server)
 *   takes its place (`saveErrorText || getErrorSummary(...)`: `||`, not `??`).
 * - Root errors (`formErrors`, an issue with no path) have no Field: render them yourself, e.g. a
 *   `MessageStrip` `tone="error"` (`role="alert"`). A blocking page error is a `MessageStrip` too.
 *
 * Messages are yours (no translation in the library)
 *
 * The library never translates a message. The texts come from your schema: Zod's own messages are
 * English by default ("Too small: expected string to have >=1 characters"), so write the text on
 * each rule, `z.string().min(1, 'Supplier is required.')`, or give the schema your own error map
 * (`z.config({ customError })` / `z.setErrorMap` depending on the Zod version, or the equivalent of
 * Valibot/ArkType). The footer summary text is the `message` option of `getErrorSummary` (its default
 * is English), and the guard dialog texts are `useDirtyGuard`'s `labels`.
 *
 * Declared limits
 *
 * - Validation only at Save: no live validation while typing, and no "touched" state.
 * - The schema must be synchronous (an async `refine` makes Save fail with a `saveError` and a
 *   development `console.error`).
 * - Cross-field errors are not cleaned per field: "the passwords do not match" keyed on one field
 *   stays when the OTHER field is edited, until the next Save (only keys are compared, not rules).
 * - Server-side errors are not mapped to fields (`saveError` is one message for the whole form):
 *   mapping them is a future ticket.
 * - A `forced`/`locked`/`disabled` field is validated like any other: its message is visible on the
 *   Field and counted in the summary. The focus goes to the first invalid field that can take it
 *   (`forced`/`locked` are focusable, `disabled` is not); if none can, nothing is focused (one
 *   `console.error` in development).
 */

interface SupplierValues {
  supplier: string;
  country: string;
  category: string;
  address: { city: string };
}

type Blockable = 'supplier' | 'country' | 'category' | 'city';
type BlockedField = Blockable | 'none' | 'all';
type BlockedState = 'forced' | 'locked' | 'disabled';

interface RecipeArgs {
  record: 'empty' | 'valid';
  rules: 'required' | 'optional';
  footer: 'when-dirty' | 'always';
  blockedField: BlockedField;
  blockedState: BlockedState;
  onSaved: (values: SupplierValues) => void;
  onLeave: () => void;
}

const COUNTRIES = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany' },
];
const CATEGORIES = [
  { value: 'hardware', label: 'Hardware' },
  { value: 'software', label: 'Software' },
  { value: 'services', label: 'Services' },
];

const EMPTY: SupplierValues = { supplier: '', country: '', category: '', address: { city: '' } };
const VALID: SupplierValues = { supplier: 'ACME Ltd', country: 'it', category: 'hardware', address: { city: 'Leeds' } };

// Any Standard Schema works (Zod here: a devDependency of this repo, the core imports no schema
// library). The text is written on each rule: the library does not translate it.
const REQUIRED_SCHEMA = z.object({
  supplier: z.string().trim().min(1, 'Supplier is required.'),
  country: z.string().min(1, 'Choose a country.'),
  category: z.string().min(1, 'Choose a category.'),
  address: z.object({ city: z.string().trim().min(1, 'City is required.') }),
});
const OPTIONAL_SCHEMA = z.object({
  supplier: z.string(),
  country: z.string(),
  category: z.string(),
  address: z.object({ city: z.string() }),
});

const summaryText = (count: number) => (count === 1 ? '1 invalid field' : `${count} invalid fields`);
const errorText = (error: unknown) => (error === null ? undefined : error instanceof Error ? error.message : String(error));

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const FRAME: CSSProperties = {
  height: '100dvh',
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  background: 'var(--color-rop-surface, #fff)',
};
const TOOLBAR: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: 8 };
const STACK: CSSProperties = { display: 'grid', gap: 16, maxWidth: 420 };
const ATTACHMENTS: CSSProperties = {
  height: 480,
  boxSizing: 'border-box',
  borderRadius: 8,
  padding: 12,
  background: 'var(--color-rop-blue-50, #eef5fc)',
};

function stateOf(args: RecipeArgs, name: Blockable): FieldStateProps {
  if (args.blockedField !== name && args.blockedField !== 'all') return {};
  if (args.blockedState === 'disabled') return { state: 'disabled', stateReason: 'Not editable in this status.' };
  return {
    state: args.blockedState,
    stateReason: args.blockedState === 'forced' ? 'Set by a business rule.' : 'You do not have permission to edit this field.',
  };
}

function Recipe(args: RecipeArgs) {
  const { record, rules, footer, onSaved, onLeave } = args;
  const [left, setLeft] = useState(false);
  const form = useObjectPageForm<SupplierValues>({
    baseline: record === 'valid' ? VALID : EMPTY,
    schema: rules === 'required' ? REQUIRED_SCHEMA : OPTIONAL_SCHEMA,
  });
  const { guard, dialog } = useDirtyGuard({
    when: form.isDirty,
    labels: {
      title: 'Unsaved changes',
      description: 'You have unsaved changes: if you leave now they will be lost.',
      stay: 'Keep editing',
      leave: 'Leave without saving',
    },
  });
  const frameRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors: form.fieldErrors });

  // The rule of the levels: the save error, when there is one, wins over the summary (`||`, not `??`).
  const message =
    errorText(form.saveError) || getErrorSummary(form.fieldErrors, { formErrors: form.formErrors, message: summaryText });

  const { values, setValue } = form;
  const content = left ? (
    <p style={{ padding: 16 }}>Back on the list.</p>
  ) : (
    <ValidationProvider fieldErrors={form.fieldErrors}>
      <ObjectPage>
        <ObjectPageHeader title="Supplier" subtitle={values.supplier || 'New supplier'} />
        <ObjectPageFooter
          visible={footer === 'always' || form.isDirty}
          label="Save actions"
          toneLabel="Error"
          message={message}
          messageTone="error"
        >
          <Button
            variant="primary"
            onClick={() => void form.save(async (v) => onSaved(v))}
            aria-disabled={form.isSaving || undefined}
          >
            Save
          </Button>
          <Button variant="secondary" onClick={() => form.reset()}>
            Discard changes
          </Button>
        </ObjectPageFooter>
        <ObjectPageSection id="general" title="General data">
          <div style={STACK}>
            <Field label="Supplier" name="supplier" required {...stateOf(args, 'supplier')}>
              <Input value={values.supplier} onChange={(e) => setValue('supplier', e.target.value)} />
            </Field>
            <Field label="Country" name="country" required {...stateOf(args, 'country')}>
              <Select
                options={COUNTRIES}
                placeholder="Choose a country"
                value={values.country || undefined}
                onValueChange={(v) => setValue('country', v)}
              />
            </Field>
            <Field label="Category" name="category" required {...stateOf(args, 'category')}>
              <Combobox
                options={CATEGORIES}
                placeholder="Search a category"
                value={values.category || undefined}
                onValueChange={(v) => setValue('category', v ?? '')}
              />
            </Field>
          </div>
        </ObjectPageSection>
        <ObjectPageSection id="attachments" title="Attachments">
          <div style={ATTACHMENTS}>Not part of the form: room between the sections, so the focus has to scroll.</div>
        </ObjectPageSection>
        <ObjectPageSection id="address" title="Address">
          <div style={STACK}>
            {/* A nested value: the error path is `address.city`; writing `address` clears it. */}
            <Field label="City" name="address.city" required {...stateOf(args, 'city')}>
              <Input value={values.address.city} onChange={(e) => setValue('address', { ...values.address, city: e.target.value })} />
            </Field>
          </div>
        </ObjectPageSection>
      </ObjectPage>
    </ValidationProvider>
  );

  return (
    <div ref={frameRef} style={FRAME}>
      <div style={TOOLBAR}>
        <Button
          variant="secondary"
          onClick={() =>
            guard(() => {
              onLeave();
              setLeft(true);
            })
          }
        >
          Back to list
        </Button>
        <span data-testid="dirty-state">Unsaved changes: {form.isDirty ? 'yes' : 'no'}</span>
      </div>
      {content}
      {dialog}
    </div>
  );
}

const meta: Meta<RecipeArgs> = {
  title: 'Floorplans/Object Page with Validation',
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: "A copy-paste recipe that combines the Object Page pieces: form state with a baseline, per-field validation, the error summary, focus on the first invalid field and the dirty-guard. Switch the record between empty and valid and press Save." } },
  },
  // A recipe assembled from several components: every control is a knob of the demo.
  argTypes: storyControls({
    record: {
      control: 'radio',
      options: ['empty', 'valid'],
      description: 'The loaded record: `empty` (a new supplier, fails the schema) or `valid` (passes it). Remounts the form.',
    },
    rules: {
      control: 'radio',
      options: ['required', 'optional'],
      description: 'The schema: every field required, or nothing required (Save always succeeds).',
    },
    footer: {
      control: 'radio',
      options: ['when-dirty', 'always'],
      description: 'Footer shown only while the form is dirty (a real save bar), or always (to Save an untouched form).',
    },
    blockedField: {
      control: 'select',
      options: ['none', 'supplier', 'country', 'category', 'city', 'all'],
      description: 'Which Field is `forced`/`locked`/`disabled`. A blocked field is validated like the others.',
    },
    blockedState: {
      control: 'radio',
      options: ['forced', 'locked', 'disabled'],
      description: '`forced` and `locked` keep the focus (read-only); `disabled` is out of the tab order.',
    },
    onSaved: { control: false, description: 'Called with the values when the Save reaches the handler (the schema passed).' },
    onLeave: { control: false, description: 'The guarded exit action: called at once if clean, after confirmation if dirty.' },
  }),
  args: {
    record: 'empty',
    rules: 'required',
    footer: 'when-dirty',
    blockedField: 'none',
    blockedState: 'forced',
    onSaved: fn(),
    onLeave: fn(),
  },
  render: (args) => <Recipe key={args.record} {...args} />,
};

export default meta;
type Story = StoryObj<RecipeArgs>;

const footerStatus = (canvasElement: HTMLElement) =>
  within(within(canvasElement).getByRole('region', { name: 'Save actions' })).getByRole('status');

/**
 * The whole flow with real input: an edit makes the form dirty (the footer appears), Save with the
 * rest empty fails (messages on the fields, "3 invalid fields" in the footer, the focus on the first
 * invalid field, the form still dirty, the guard still asking), each field is corrected (the count
 * goes down field by field), and the last Save succeeds (the form is clean, the footer goes away).
 * Controls: the record, the rules, the footer, and which field is blocked (and how).
 */
export const ValidationFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const dirty = () => canvas.getByTestId('dirty-state');
    await expect(canvas.queryByRole('region', { name: 'Save actions' })).not.toBeInTheDocument();
    await expect(dirty()).toHaveTextContent('Unsaved changes: no');

    // 1. Modify: the nested field. The form is dirty, the footer appears.
    await userEvent.type(canvas.getByRole('textbox', { name: /City/ }), 'Leeds');
    await expect(dirty()).toHaveTextContent('Unsaved changes: yes');
    const region = await canvas.findByRole('region', { name: 'Save actions' });

    // 2. Save with the rest empty: messages on the fields, the count in the footer, the focus on the first.
    await userEvent.click(within(region).getByRole('button', { name: 'Save' }));
    const supplier = canvas.getByRole('textbox', { name: /Supplier/ });
    await expect(await canvas.findByText('Supplier is required.')).toBeInTheDocument();
    await expect(canvas.getByText('Choose a country.')).toBeInTheDocument();
    await expect(canvas.getByText('Choose a category.')).toBeInTheDocument();
    await waitFor(() => expect(supplier).toHaveFocus());
    await expect(supplier).toHaveAccessibleDescription('Supplier is required.');
    await expect(footerStatus(canvasElement)).toHaveTextContent('Error: 3 invalid fields');
    await expect(within(region).queryByText(/required/)).not.toBeInTheDocument();
    await expect(args.onSaved).not.toHaveBeenCalled();
    // The failed validation did not touch the dirty state, and the guard still asks.
    await expect(dirty()).toHaveTextContent('Unsaved changes: yes');
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await body.findByRole('dialog', { name: 'Unsaved changes' });
    await userEvent.click(body.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(args.onLeave).not.toHaveBeenCalled();

    // 3. Correct field by field: the count goes down, the error of each corrected path goes away.
    await userEvent.type(supplier, 'ACME Ltd');
    await expect(footerStatus(canvasElement)).toHaveTextContent('Error: 2 invalid fields');
    await expect(canvas.queryByText('Supplier is required.')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('combobox', { name: /Country/ }));
    await userEvent.click(await body.findByRole('option', { name: 'Italy' }));
    await expect(footerStatus(canvasElement)).toHaveTextContent('Error: 1 invalid field');
    await userEvent.click(canvas.getByRole('combobox', { name: /Category/ }));
    await userEvent.click(await body.findByRole('option', { name: 'Hardware' }));
    await expect(footerStatus(canvasElement)).toBeEmptyDOMElement();
    await expect(canvas.queryByText(/is required|Choose a/)).not.toBeInTheDocument();

    // 4. Save: the values reach the handler, the baseline moves, the form is clean, the footer hides.
    await userEvent.click(within(region).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledWith({ ...VALID, address: { city: 'Leeds' } }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).not.toBeInTheDocument());
    await expect(dirty()).toHaveTextContent('Unsaved changes: no');
    // Clean: leaving is immediate.
    await userEvent.click(canvas.getByRole('button', { name: 'Back to list' }));
    await expect(args.onLeave).toHaveBeenCalledTimes(1);
  },
};

/** `ValidationFlow` without a `play` function: what `e2e/object-page-validation-recipe.spec.ts` drives with real input. */
export const Manual: Story = {};
