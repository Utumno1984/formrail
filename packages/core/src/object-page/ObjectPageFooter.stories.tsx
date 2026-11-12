import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { z } from 'zod';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { ValidationProvider } from '../field/ValidationContext';
import { Input } from '../input/Input';
import { storyControl, withoutControls } from '../internal/story-docs';
import { MessageStrip } from '../message-strip/MessageStrip';
import { getErrorSummary } from './error-summary';
import { ObjectPage } from './ObjectPage';
import { ObjectPageFooter } from './ObjectPageFooter';
import { ObjectPageHeader } from './ObjectPageHeader';
import { ObjectPageSection } from './ObjectPageSection';
import { useFocusFirstInvalidField } from './use-focus-first-invalid-field';
import { useObjectPageForm } from './use-object-page-form';

interface PlaygroundArgs {
  visible: boolean;
  message: string;
  messageTone: 'error' | 'success' | 'info';
  label: string;
  onSave: () => void;
  onCancel: () => void;
}

const LONG_MESSAGE =
  'Save failed: the server rejected the change because the invoice was updated by another user in the meantime. Reload the page and try again.';

const meta: Meta<PlaygroundArgs> = {
  title: 'Floorplans/Object Page/Footer',
  component: ObjectPageFooter,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    visible: { control: 'boolean' },
    message: { control: 'text' },
    messageTone: { control: 'radio', options: ['error', 'success', 'info'] },
    label: { control: 'text' },
    // Set by the demo (the Save / Cancel buttons, the tone's default text).
    ...withoutControls('children', 'toneLabel'),
    onSave: storyControl({ control: false, description: 'The "Save" button the demo puts in the footer (`children`).' }),
    onCancel: storyControl({ control: false, description: 'The "Cancel" button the demo puts in the footer (`children`).' }),
  },
  args: {
    visible: true,
    message: LONG_MESSAGE,
    messageTone: 'error',
    label: 'Save actions',
    onSave: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

// Inline styles: the stories are not scanned by Tailwind, so a class only used here would not exist.
const FRAME: CSSProperties = { height: '100dvh', boxSizing: 'border-box', background: 'var(--color-rop-surface, #fff)' };
// A toolbar row above the page, then the page filling the rest of the frame.
const TOOLBAR_FRAME: CSSProperties = { ...FRAME, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' };
const TOOLBAR: CSSProperties = { display: 'flex', justifyContent: 'flex-end', padding: 8 };
const BLOCK_BG = 'var(--color-rop-blue-50, #eef5fc)';

function Filler({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ height, background: BLOCK_BG, borderRadius: 8, padding: 12, boxSizing: 'border-box' }}>{children}</div>;
}

function LongContent() {
  return (
    <>
      <ObjectPageSection id="general" title="General data">
        <Filler height={520}>Content of General data</Filler>
      </ObjectPageSection>
      <ObjectPageSection id="amounts" title="Amounts">
        <Filler height={520}>Content of Amounts</Filler>
      </ObjectPageSection>
      <ObjectPageSection id="notes-section" title="Notes">
        <Filler height={200}>Content of Notes</Filler>
        <div style={{ marginTop: 12 }}>
          <Field label="Internal notes" help="Visible to the team only.">
            <Input />
          </Field>
        </div>
      </ObjectPageSection>
    </>
  );
}

const scrollerOf = (root: HTMLElement) => root.querySelector('[data-object-page-scroller]') as HTMLElement;

/**
 * The footer is a presentational bar: here it is driven by the `visible` control, and by two buttons
 * that behave like a real save (Save and Cancel changes both hide it, as a clean form would).
 * "Edit" (in a toolbar above the page, so reachable at any scroll position) shows it again,
 * standing in for the first edit of a field.
 */
export const Playground: Story = {
  render: function Render(args) {
    const { message, messageTone, label, onSave, onCancel } = args;
    // Local state, set again whenever the `visible` control changes (updating the args from here would
    // replace the `fn()` spies, which the Actions panel and the play function watch).
    const [visible, setVisible] = useState(args.visible);
    const [seen, setSeen] = useState(args.visible);
    if (seen !== args.visible) {
      setSeen(args.visible);
      setVisible(args.visible);
    }
    return (
      <div style={TOOLBAR_FRAME}>
        <div style={TOOLBAR}>
          <Button variant="secondary" onClick={() => setVisible(true)}>
            Edit
          </Button>
        </div>
        <ObjectPage>
          <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
          <ObjectPageFooter visible={visible} message={message} messageTone={messageTone} label={label}>
            <Button
              variant="primary"
              onClick={() => {
                onSave();
                setVisible(false);
              }}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onCancel();
                setVisible(false);
              }}
            >
              Cancel changes
            </Button>
          </ObjectPageFooter>
          <LongContent />
        </ObjectPage>
      </div>
    );
  },
  args: { visible: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const scroller = scrollerOf(canvasElement);
    scroller.scrollTop = 300;
    const before = { top: scroller.scrollTop, height: scroller.clientHeight };

    await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));
    const region = await canvas.findByRole('region', { name: args.label });
    await expect(region).toBeVisible();
    await expect(scroller.scrollTop).toBe(before.top);
    await expect(scroller.clientHeight).toBe(before.height);

    // Save: the demo hides the footer as a successful save would, with the focus still on the button.
    await userEvent.click(within(region).getByRole('button', { name: 'Save' }));
    await expect(args.onSave).toHaveBeenCalled();
    await waitFor(() => expect(canvas.queryByRole('region', { name: args.label })).not.toBeInTheDocument());
    await expect(canvas.getByRole('heading', { level: 1, name: 'Invoice 2026/0142' })).toHaveFocus();
    await expect(scroller.scrollTop).toBe(before.top);
    await expect(scroller.clientHeight).toBe(before.height);
  },
};

/** The Playground without a `play` function: what `e2e/object-page-footer.spec.ts` drives with real input. */
export const Manual: Story = {
  render: Playground.render,
  args: { visible: false },
};

/** Footer hidden: its room stays, an empty band at the bottom. */
export const Hidden: Story = {
  tags: ['visual'],
  args: { visible: false },
  render: (args) => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
        <ObjectPageFooter visible={args.visible} label={args.label}>
          <Button variant="primary">Save</Button>
          <Button variant="secondary">Cancel changes</Button>
        </ObjectPageFooter>
        <LongContent />
      </ObjectPage>
    </div>
  ),
};

/** Footer visible with its actions and no message. */
export const WithActions: Story = {
  tags: ['visual'],
  args: { visible: true },
  render: (args) => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
        <ObjectPageFooter visible={args.visible} label={args.label}>
          <Button variant="primary">Save</Button>
          <Button variant="secondary">Cancel changes</Button>
        </ObjectPageFooter>
        <LongContent />
      </ObjectPage>
    </div>
  ),
};

/** A long save error: one line, truncated, the footer keeps its height. */
export const LongError: Story = {
  tags: ['visual'],
  args: { visible: true },
  render: (args) => (
    <div style={FRAME}>
      <ObjectPage>
        <ObjectPageHeader title="Invoice 2026/0142" subtitle="ACME srl" />
        <ObjectPageFooter visible={args.visible} message={args.message} messageTone="error" label={args.label}>
          <Button variant="primary">Save</Button>
          <Button variant="secondary">Cancel changes</Button>
        </ObjectPageFooter>
        <LongContent />
      </ObjectPage>
    </div>
  ),
};

// --- Validation summary: the supplier demo -----------------------------------------------------

const SUPPLIER_FIELDS = [
  { key: 'supplier', label: 'Supplier', section: 'general' },
  { key: 'vat', label: 'VAT number', section: 'general' },
  { key: 'email', label: 'Email', section: 'general' },
  { key: 'city', label: 'City', section: 'address' },
  { key: 'postalCode', label: 'Postal code', section: 'address' },
] as const;
type SupplierKey = (typeof SUPPLIER_FIELDS)[number]['key'];
type SupplierValues = Record<SupplierKey | 'note', string>;

const EMPTY_SUPPLIER: SupplierValues = { supplier: '', vat: '', email: '', city: '', postalCode: '', note: '' };
const FILLED_SUPPLIER: SupplierValues = {
  supplier: 'ACME Ltd',
  vat: 'GB123456789',
  email: 'billing@acme.example',
  city: 'Leeds',
  postalCode: 'LS1 4AP',
  note: '',
};
const SUPPLIER_BASELINES = { filled: FILLED_SUPPLIER, empty: EMPTY_SUPPLIER } as const;

interface SupplierArgs {
  /** How many fields (in page order: Supplier, VAT number, Email, City, Postal code) are required. */
  requiredFields: number;
  /** Summary text for one invalid field. Leave both texts empty for the library default (English). */
  summaryOne: string;
  /** Summary text for several, `{count}` replaced by the number. */
  summaryOther: string;
  /** Called with the values when the save reaches the server and succeeds. */
  onSaved: (values: SupplierValues) => void;
}

type SupplierStory = StoryObj<PlaygroundArgs & SupplierArgs>;

const SERVER_ERROR = 'The server rejected the save.';
const ROOT_ERROR = 'Enter a VAT number or an email.';

/** `getErrorSummary`'s `message` option from the two text controls; `undefined` = library default. */
const summaryText = (one: string, other: string) =>
  one === '' && other === '' ? undefined : (count: number) => (count === 1 ? one : other).replace('{count}', String(count));

const errorText = (error: unknown) => (error === null ? undefined : error instanceof Error ? error.message : String(error));

const STACK: CSSProperties = { display: 'grid', gap: 16, maxWidth: 480 };

function SupplierForm({
  requiredFields,
  summaryOne,
  summaryOther,
  onSaved,
  baseline,
  footer,
  serverRule = false,
  rootRule = false,
}: SupplierArgs & {
  baseline: keyof typeof SUPPLIER_BASELINES;
  /** `dirty`: shown while the form is dirty (a real save-bar). `always`: also before any edit, to Save an empty form. */
  footer: 'dirty' | 'always';
  /** A toolbar switch that tightens the rules without editing the form (as a rule changed on the server would). */
  serverRule?: boolean;
  /** A root rule (`refine` without `path`): VAT number or email. Its message goes to `formErrors`, not to a field. */
  rootRule?: boolean;
}) {
  const [noteRequired, setNoteRequired] = useState(false);
  // Any Standard Schema works (Zod here: a devDependency, the core imports no schema library).
  // Rebuilt when the controls change; the form always reads the latest one.
  const schema = useMemo(() => {
    const shape: Record<string, z.ZodType> = {};
    for (const field of SUPPLIER_FIELDS.slice(0, requiredFields)) {
      shape[field.key] = z.string().trim().min(1, `${field.label} is required.`);
    }
    if (noteRequired) shape['note'] = z.string().trim().min(1, 'Note is required.');
    if (!rootRule) return z.object(shape);
    // `z.object` drops unknown keys before `refine` runs: declare the two the rule reads.
    return z
      .object({ vat: z.string(), email: z.string(), ...shape })
      .refine((v) => v.vat.trim() !== '' || v.email.trim() !== '', ROOT_ERROR);
  }, [requiredFields, noteRequired, rootRule]);
  const form = useObjectPageForm<SupplierValues>({ baseline: SUPPLIER_BASELINES[baseline], schema });
  const frameRef = useRef<HTMLDivElement>(null);
  useFocusFirstInvalidField({ containerRef: frameRef, fieldErrors: form.fieldErrors });

  // The rule of the levels: the save error, when there is one, wins over the validation summary;
  // the field messages stay on the fields (never in the footer).
  // `||`, not `??`: a save error with an empty text (`new Error()`) must not hide the summary.
  const message =
    errorText(form.saveError) ||
    getErrorSummary(form.fieldErrors, { formErrors: form.formErrors, message: summaryText(summaryOne, summaryOther) });

  const section = (name: 'general' | 'address') =>
    SUPPLIER_FIELDS.map((f, index) =>
      f.section === name ? (
        <Field key={f.key} label={f.label} name={f.key} required={index < requiredFields}>
          <Input value={form.values[f.key]} onChange={(e) => form.setValue(f.key, e.target.value)} />
        </Field>
      ) : null,
    );

  return (
    <div ref={frameRef} style={serverRule ? TOOLBAR_FRAME : FRAME}>
      {serverRule ? (
        <div style={TOOLBAR}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={noteRequired} onChange={(e) => setNoteRequired(e.target.checked)} />
            Require a note (rule changed on the server)
          </label>
        </div>
      ) : null}
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <ObjectPage>
          <ObjectPageHeader title="Supplier" subtitle={form.values.supplier || 'New supplier'} />
          <ObjectPageFooter
            visible={footer === 'always' || form.isDirty}
            label="Save actions"
            toneLabel="Error"
            message={message}
            messageTone="error"
          >
            <Button
              variant="primary"
              onClick={() =>
                void form.save(async (values) => {
                  if (values.supplier === 'fail') throw new Error(SERVER_ERROR);
                  // A rejection with no text: the footer then falls back to the summary.
                  if (values.supplier === 'fail-silent') throw new Error();
                  onSaved(values);
                })
              }
              aria-disabled={form.isSaving || undefined}
            >
              Save
            </Button>
            <Button variant="secondary" onClick={() => form.reset()}>
              Discard changes
            </Button>
          </ObjectPageFooter>
          {/* Root errors belong to no Field: the form shows them itself, at the top, in an alert
              strip mounted already filled (so it is announced). The footer only counts them. */}
          {form.formErrors.length > 0 ? <MessageStrip tone="error">{form.formErrors.join(' ')}</MessageStrip> : null}
          <ObjectPageSection id="general" title="General data">
            <div style={STACK}>{section('general')}</div>
          </ObjectPageSection>
          <ObjectPageSection id="address" title="Address">
            <div style={STACK}>{section('address')}</div>
          </ObjectPageSection>
          <ObjectPageSection id="notes" title="Notes">
            <div style={STACK}>
              <Field label="Note" name="note" required={noteRequired}>
                <Input value={form.values.note} onChange={(e) => form.setValue('note', e.target.value)} />
              </Field>
            </div>
          </ObjectPageSection>
        </ObjectPage>
      </ValidationProvider>
    </div>
  );
}

// The Playground controls do nothing in these stories: hidden from the Controls panel.
const HIDDEN = { table: { disable: true } } as const;
const SUPPLIER_ARG_TYPES: SupplierStory['argTypes'] = {
  visible: HIDDEN,
  message: HIDDEN,
  messageTone: HIDDEN,
  label: HIDDEN,
  onSave: HIDDEN,
  onCancel: HIDDEN,
  requiredFields: {
    control: { type: 'range', min: 1, max: 5, step: 1 },
    description: 'How many fields are required, in page order (Supplier, VAT number, Email, City, Postal code)',
  },
  summaryOne: {
    control: 'text',
    description: '`getErrorSummary` text for 1 invalid field. Both texts empty: the library default (English)',
  },
  summaryOther: { control: 'text', description: '`getErrorSummary` text for several; `{count}` is replaced by the number' },
  onSaved: { control: false, description: 'Called with the values when the save succeeds' },
};
const SUPPLIER_ARGS: Partial<SupplierArgs> = {
  requiredFields: 1,
  summaryOne: '1 invalid field',
  summaryOther: '{count} invalid fields',
  onSaved: fn(),
};

const footerStatus = (canvasElement: HTMLElement) => {
  const region = within(canvasElement).getByRole('region', { name: 'Save actions' });
  return within(region).getByRole('status');
};
const footerHeight = (canvasElement: HTMLElement) =>
  (canvasElement.querySelector('[data-object-page-footer]') as HTMLElement).getBoundingClientRect().height;

/**
 * The supplier demo, wired end to end: `useObjectPageForm({ schema })` validates on Save, a
 * `ValidationProvider` hands `fieldErrors` to each Field (the key is written once, as the Field's
 * `name`), `useFocusFirstInvalidField` moves the focus to the first invalid field, and the footer's
 * `message` is `getErrorSummary(...)`: the **count** of invalid fields ("1 invalid field"), never their
 * messages. The footer shows while the form is dirty; a save error ("fail" in Supplier stands in for a
 * server rejection) takes the place of the summary. The announcement rule: field = not live, read when
 * the focus arrives; summary and save error = the footer's polite `status`; a blocking page error =
 * `MessageStrip` (`alert`).
 */
export const FormFlow: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: SUPPLIER_ARGS,
  render: (args) => <SupplierForm {...args} baseline="filled" footer="dirty" />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const supplier = canvas.getByRole('textbox', { name: 'Supplier' });
    await expect(canvas.queryByRole('region', { name: 'Save actions' })).not.toBeInTheDocument();
    await userEvent.clear(supplier);
    await userEvent.click(await canvas.findByRole('button', { name: 'Save' }));
    // The validation error is on the field, not in the footer; the focus went back to the field.
    await expect(await canvas.findByText('Supplier is required.')).toBeInTheDocument();
    await expect(supplier).toHaveFocus();
    await expect(within(canvas.getByRole('region', { name: 'Save actions' })).queryByText(/required/)).not.toBeInTheDocument();
    // What the footer says instead: the count, in its polite status region.
    await expect(footerStatus(canvasElement)).toHaveTextContent('Error: 1 invalid field');

    // Fixing the field removes the summary; a server rejection then fills the same region.
    await userEvent.type(supplier, 'fail');
    await expect(footerStatus(canvasElement)).toBeEmptyDOMElement();
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(footerStatus(canvasElement)).toHaveTextContent(`Error: ${SERVER_ERROR}`));
    await expect(args.onSaved).not.toHaveBeenCalled();

    // A valid supplier: the save goes through, the form is clean and the footer hides.
    await userEvent.clear(supplier);
    await userEvent.type(supplier, 'Northwind Ltd');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledWith({ ...FILLED_SUPPLIER, supplier: 'Northwind Ltd' }));
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Save actions' })).not.toBeInTheDocument());
  },
};

/**
 * The validation summary with several required fields (the `requiredFields` control) and your own
 * text (`summaryOne`/`summaryOther`; the library does not translate: leave both empty to see its
 * English default). Save the empty form: the footer announces "3 invalid fields" and the focus goes
 * to the first; each correction lowers the count (errors are cleared per field); with everything
 * fixed the message goes away. The footer keeps its height throughout.
 */
export const ErrorSummary: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: { ...SUPPLIER_ARGS, requiredFields: 3 },
  render: (args) => <SupplierForm {...args} baseline="empty" footer="always" />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const status = footerStatus(canvasElement);
    const height = footerHeight(canvasElement);
    await expect(status).toBeEmptyDOMElement();

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(status).toHaveTextContent('Error: 3 invalid fields');
    const supplier = canvas.getByRole('textbox', { name: 'Supplier' });
    await waitFor(() => expect(supplier).toHaveFocus());
    await expect(footerHeight(canvasElement)).toBe(height);

    // Typing fixes one field at a time: the count goes down and the focus stays where the user types.
    await userEvent.type(supplier, 'ACME Ltd');
    await expect(status).toHaveTextContent('Error: 2 invalid fields');
    await expect(supplier).toHaveFocus();
    await expect(canvas.getByRole('textbox', { name: 'VAT number' })).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(canvas.getByRole('textbox', { name: 'VAT number' }), 'GB123456789');
    await expect(status).toHaveTextContent('Error: 1 invalid field');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), 'billing@acme.example');
    await expect(status).toBeEmptyDOMElement();
    await expect(footerHeight(canvasElement)).toBe(height);

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(args.onSaved).toHaveBeenCalledWith({
        ...EMPTY_SUPPLIER,
        supplier: 'ACME Ltd',
        vat: 'GB123456789',
        email: 'billing@acme.example',
      }),
    );
    await expect(status).toBeEmptyDOMElement();
  },
};

/**
 * Visual baseline of the failed-save state (#120): the empty supplier form after "Save", with the
 * field errors, the invalid markers and the footer's "Error: 3 invalid fields" summary all visible.
 */
export const FailedSaveState: SupplierStory = {
  tags: ['visual'],
  argTypes: SUPPLIER_ARG_TYPES,
  args: { ...SUPPLIER_ARGS, requiredFields: 3 },
  render: (args) => <SupplierForm {...args} baseline="empty" footer="always" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(await canvas.findByText('Supplier is required.')).toBeInTheDocument();
    await expect(footerStatus(canvasElement)).toHaveTextContent('Error: 3 invalid fields');
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Supplier' })).toHaveFocus());
  },
};

/** `ErrorSummary` without a `play` function: what `e2e/object-page-error-summary.spec.ts` drives with real input. */
export const ErrorSummaryManual: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: { ...SUPPLIER_ARGS, requiredFields: 3 },
  render: (args) => <SupplierForm {...args} baseline="empty" footer="always" />,
};

/**
 * Save error and validation summary at once: one message, the save error. A failed validation does
 * not clear an earlier save error (only an edit, a reset or a successful save does), so the two can
 * coexist: here the server rejects the save ("fail" in Supplier), then the rules tighten without any
 * edit (the toolbar switch makes the note required) and Save fails validation. The footer keeps the
 * save error; the note shows its own message and gets the focus. The first edit clears the save
 * error, and the next failed Save shows the count.
 */
export const SaveErrorOverSummary: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: SUPPLIER_ARGS,
  render: (args) => <SupplierForm {...args} baseline="filled" footer="always" serverRule />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const status = footerStatus(canvasElement);
    const supplier = canvas.getByRole('textbox', { name: 'Supplier' });
    await userEvent.clear(supplier);
    await userEvent.type(supplier, 'fail');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(status).toHaveTextContent(`Error: ${SERVER_ERROR}`));

    await userEvent.click(canvas.getByRole('checkbox', { name: /Require a note/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const note = canvas.getByRole('textbox', { name: 'Note' });
    await expect(await canvas.findByText('Note is required.')).toBeInTheDocument();
    await waitFor(() => expect(note).toHaveFocus());
    // Both exist: the footer says the save error only, never "1 invalid field" next to it.
    await expect(status).toHaveTextContent(`Error: ${SERVER_ERROR}`);
    await expect(status).not.toHaveTextContent(/invalid/);

    // The first edit clears the save error (and the note's own error): nothing left to say.
    await userEvent.type(note, 'x');
    await expect(status).toBeEmptyDOMElement();
    // Without a save error, a failed validation shows the count.
    await userEvent.clear(note);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(status).toHaveTextContent('Error: 1 invalid field');
    await expect(args.onSaved).not.toHaveBeenCalled();
  },
};

/** `SaveErrorOverSummary` without a `play` function, for the e2e. */
export const SaveErrorOverSummaryManual: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: SUPPLIER_ARGS,
  render: (args) => <SupplierForm {...args} baseline="filled" footer="always" serverRule />,
};

// A root error is not a field: the summary text speaks of errors, not of fields.
const ROOT_RULE_ARGS: Partial<SupplierArgs> = { ...SUPPLIER_ARGS, summaryOne: '1 error', summaryOther: '{count} errors' };

/**
 * A root rule: the schema's `refine` without `path` ("Enter a VAT number or an email.") puts its
 * message in `formErrors`, which no Field shows. The form renders it itself, at the top, in a
 * `MessageStrip` `tone="error"` (`role="alert"`, mounted already filled so it is announced), and the
 * footer's summary counts it ("1 error": with root rules pass a `message` that does not say
 * "fields"). Clear both VAT number and Email and Save; the first edit clears the root error.
 */
export const RootError: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: ROOT_RULE_ARGS,
  render: (args) => <SupplierForm {...args} baseline="filled" footer="always" rootRule />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const status = footerStatus(canvasElement);
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'VAT number' }));
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Email' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    // The root message is in the alert strip at the top of the form, not on a field nor in the footer.
    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent(ROOT_ERROR);
    await expect(status).toHaveTextContent('Error: 1 error');
    await expect(status).not.toHaveTextContent(ROOT_ERROR);
    for (const textbox of canvas.getAllByRole('textbox')) await expect(textbox).not.toHaveAttribute('aria-invalid');
    await expect(args.onSaved).not.toHaveBeenCalled();

    // An edit leaves no field error, so the root error goes too: strip unmounted, summary empty.
    await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), 'billing@acme.example');
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(status).toBeEmptyDOMElement();
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledWith({ ...FILLED_SUPPLIER, vat: '', email: 'billing@acme.example' }));
  },
};

/** `RootError` without a `play` function, for the e2e. */
export const RootErrorManual: SupplierStory = {
  argTypes: SUPPLIER_ARG_TYPES,
  args: ROOT_RULE_ARGS,
  render: (args) => <SupplierForm {...args} baseline="filled" footer="always" rootRule />,
};
