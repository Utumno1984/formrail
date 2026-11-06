// Internal fixture for `useObjectPageForm`: bare `<input>`s, no style. Not exported from the
// package and never to be re-exported from it.
import { useMemo, useRef, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Combobox } from '../combobox/Combobox';
import { Field } from '../field/Field';
import { ValidationProvider } from '../field/ValidationContext';
import { Input } from '../input/Input';
import { Select } from '../select/Select';
import { useFocusFirstInvalidField } from '../object-page/use-focus-first-invalid-field';
import { useObjectPageForm } from '../object-page/use-object-page-form';
import type { FieldErrors } from '../object-page/field-errors';

type Invoice = { supplier: string; amount: string };

const EMPTY: Invoice = { supplier: '', amount: '' };
const LOADED: Invoice = { supplier: 'ACME srl', amount: '120.00' };

function FormDemo() {
  const form = useObjectPageForm<Invoice>({ baseline: EMPTY });
  const { reset } = form;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => reset(LOADED), 500);
  };

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'grid', gap: 8, justifyItems: 'start' }}>
      <label>
        Supplier <input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
      </label>
      <label>
        Amount <input value={form.values.amount} onChange={(e) => form.setValue('amount', e.target.value)} />
      </label>
      <p data-testid="dirty">dirty: {form.isDirty ? 'sì' : 'no'}</p>
      <p data-testid="saving">{form.isSaving ? 'saving…' : ''}</p>
      <p role="alert" data-testid="error">
        {form.saveError !== null ? `Errore: ${String((form.saveError as Error).message)}` : ''}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={load}>
          Carica dati
        </button>
        <button type="button" onClick={() => form.reset()}>
          Annulla
        </button>
        <button type="button" onClick={() => void form.save(async () => undefined)}>
          Salva (ok)
        </button>
        <button
          type="button"
          onClick={() =>
            void form.save(async () => {
              throw new Error('server non raggiungibile');
            })
          }
        >
          Salva (errore)
        </button>
      </div>
    </div>
  );
}

type Scenario = 'all-empty' | 'valid-above-invalid' | 'mixed-controls' | 'translated-messages';
type Long = { a: string; b: string; c: string; d: string };

const OPTIONS = [
  { value: 'it', label: 'Italia' },
  { value: 'fr', label: 'Francia' },
];

const SPACER = { height: '110vh', background: 'repeating-linear-gradient(#f4f4f4 0 40px, #fff 40px 80px)' } as const;

/**
 * A form longer than the viewport with a fake validation (every field is required). `valid-above-
 * invalid` starts with the first field filled in: the focus must stop on the first *invalid* one.
 * The error keys are returned in reverse order on purpose: only the DOM order decides.
 */
function FocusDemo({ scenario, onSave }: { scenario: Scenario; onSave: (v: Long) => void }) {
  const form = useObjectPageForm<Long>({
    baseline: { a: scenario === 'valid-above-invalid' ? 'filled' : '', b: '', c: '', d: '' },
    validate: (v) => {
      const errors: Partial<Record<keyof Long, string>> = {};
      for (const k of ['d', 'c', 'b', 'a'] as const) if (v[k] === '') errors[k] = `${k.toUpperCase()} is required`;
      return errors;
    },
  });
  const containerRef = useRef<HTMLFormElement>(null);
  // `translated-messages`: the errors shown (and handed to the focus hook) are a `useMemo` copy of
  // `fieldErrors` with rewritten messages, so the focus hook is driven by `validationAttempt`.
  const translated = scenario === 'translated-messages';
  const shownErrors = useMemo<FieldErrors>(() => {
    if (!translated) return form.fieldErrors;
    const out: Record<string, string | undefined> = {};
    for (const [path, message] of Object.entries(form.fieldErrors)) out[path] = message && `Please fill in ${path.toUpperCase()}`;
    return out;
  }, [translated, form.fieldErrors]);
  useFocusFirstInvalidField({
    containerRef,
    fieldErrors: shownErrors,
    trigger: translated ? form.validationAttempt : undefined,
  });
  // `mixed-controls`: B is a Select and C a Combobox, the rest are Inputs. All wired by `Field name`.
  const control = (k: keyof Long) => {
    if (scenario === 'mixed-controls' && k === 'b') {
      return <Select options={OPTIONS} value={form.values.b || undefined} onValueChange={(v) => form.setValue('b', v)} />;
    }
    if (scenario === 'mixed-controls' && k === 'c') {
      return <Combobox options={OPTIONS} value={form.values.c || undefined} onValueChange={(v) => form.setValue('c', v ?? '')} />;
    }
    return <Input value={form.values[k]} onChange={(e) => form.setValue(k, e.target.value)} />;
  };
  // The error of each Field comes from the ValidationProvider, by its `name` (the translated copy in
  // `translated-messages`).
  const field = (k: keyof Long) => (
    <Field label={`Field ${k.toUpperCase()}`} name={k}>
      {control(k)}
    </Field>
  );
  return (
    <form
      ref={containerRef}
      noValidate
      style={{ fontFamily: 'sans-serif', display: 'grid', gap: 16, justifyItems: 'start' }}
      onSubmit={(e) => {
        e.preventDefault();
        void form.save(async (v) => onSave(v));
      }}
    >
      <ValidationProvider fieldErrors={shownErrors}>
        {field('a')}
        <div style={SPACER} />
        {field('b')}
        <div style={SPACER} />
        {field('c')}
        <div style={SPACER} />
        {field('d')}
      </ValidationProvider>
      <button type="submit">Save</button>
      {/* Writes every field back with the value it already has: no real change, so no clearing. */}
      <button type="button" onClick={() => form.setValues({ ...form.values })}>
        Re-apply current values
      </button>
      <p data-testid="field-error-count">field errors: {Object.keys(form.fieldErrors).length}</p>
    </form>
  );
}

type Order = { supplier: string; address: { city: string }; lines: { qty: string }[] };

/**
 * Nested Object Page form: errors keyed by dot-notation path (`address.city`, `lines.0.qty`).
 * `validate` returns them in reverse order on purpose: only the DOM order decides the focus.
 */
function NestedDemo({ onSave }: { onSave: (v: Order) => void }) {
  const form = useObjectPageForm<Order>({
    baseline: { supplier: 'ACME srl', address: { city: '' }, lines: [{ qty: '' }, { qty: '' }] },
    validate: (v) => {
      const errors: Record<string, string | undefined> = {};
      v.lines.forEach((line, i) => {
        errors[`lines.${i}.qty`] = line.qty === '' ? 'Quantity is required' : undefined;
      });
      errors['address.city'] = v.address.city === '' ? 'City is required' : undefined;
      return errors;
    },
  });
  const containerRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalidField({ containerRef, fieldErrors: form.fieldErrors });
  const setQty = (i: number, qty: string) =>
    form.setValue(
      'lines',
      form.values.lines.map((line, j) => (j === i ? { qty } : line)),
    );
  return (
    <form
      ref={containerRef}
      noValidate
      style={{ fontFamily: 'sans-serif', display: 'grid', gap: 16, justifyItems: 'start' }}
      onSubmit={(e) => {
        e.preventDefault();
        void form.save(async (v) => onSave(v));
      }}
    >
      <ValidationProvider fieldErrors={form.fieldErrors}>
        <Field label="Supplier" name="supplier">
          <Input value={form.values.supplier} onChange={(e) => form.setValue('supplier', e.target.value)} />
        </Field>
        <Field label="City" name="address.city">
          <Input value={form.values.address.city} onChange={(e) => form.setValue('address', { city: e.target.value })} />
        </Field>
        {form.values.lines.map((line, i) => (
          <Field key={i} label={`Quantity ${i + 1}`} name={`lines.${i}.qty`}>
            <Input value={line.qty} onChange={(e) => setQty(i, e.target.value)} />
          </Field>
        ))}
      </ValidationProvider>
      <button type="submit">Save</button>
    </form>
  );
}

const meta = {
  title: 'Internal/UseObjectPageFormFixture',
  // Test fixture / state matrix, not a documented component: no Docs page.
  tags: ['!autodocs'],
  component: FormDemo,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FormDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const focusMeta = {
  component: FocusDemo,
  render: (args: ComponentProps<typeof FocusDemo>) => <FocusDemo {...args} />,
  argTypes: {
    scenario: {
      control: 'radio',
      options: ['all-empty', 'valid-above-invalid', 'mixed-controls', 'translated-messages'] satisfies Scenario[],
    },
    onSave: { action: 'save' },
  },
  args: { scenario: 'all-empty', onSave: fn() },
} satisfies Meta<typeof FocusDemo>;
type FocusStory = StoryObj<typeof focusMeta>;

const inViewport = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
};

/** No `play`: the e2e drives Save itself. */
export const LongFormAllEmpty: FocusStory = { ...focusMeta };
/** No `play`: field A is already valid. */
export const LongFormValidAbove: FocusStory = { ...focusMeta, args: { ...focusMeta.args, scenario: 'valid-above-invalid' } };

/**
 * No `play`: the messages are a translated `useMemo` copy of `fieldErrors`, so the focus hook gets
 * `trigger: form.validationAttempt`; the e2e drives Save and the typing itself.
 */
export const LongFormTranslatedMessages: FocusStory = { ...focusMeta, args: { ...focusMeta.args, scenario: 'translated-messages' } };

/** No `play`: B (Select) and C (Combobox) sit among Inputs, all invalid; the e2e drives Save itself. */
export const LongFormMixedControls: FocusStory = { ...focusMeta, args: { ...focusMeta.args, scenario: 'mixed-controls' } };

/** Save with nothing filled in: focus and scroll go to the first field in visual order (A), though the errors are keyed D, C, B, A. */
export const FocusFirstInvalidAllEmpty: FocusStory = {
  ...focusMeta,
  tags: ['visual', 'visual-viewport-only'],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByLabelText('Field A')).toHaveFocus());
    await expect(inViewport(canvas.getByLabelText('Field A'))).toBe(true);
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(canvas.getByTestId('field-error-count')).toHaveTextContent('field errors: 4');
  },
};

/** A is valid: the focus skips it, lands on B (not C or D) and scrolls B into view. */
export const FocusFirstInvalidSkipsValid: FocusStory = {
  ...focusMeta,
  args: { ...focusMeta.args, scenario: 'valid-above-invalid' },
  tags: ['visual', 'visual-viewport-only'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByLabelText('Field B')).toHaveFocus());
    await waitFor(() => expect(inViewport(canvas.getByLabelText('Field B'))).toBe(true));
    await expect(canvas.getByLabelText('Field A')).not.toHaveFocus();
  },
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Typing after a failure clears only the error of the field being edited: the other fields keep
 * `aria-invalid` and their message, and the focus stays where the user types (a clearing never
 * re-focuses). A new Save with the remaining errors, even identical ones, moves the focus again.
 * (Until #102 this story was "Typing after a failure clears every field error at once".)
 */
export const FocusFirstInvalidTypingClearsOnlyThatField: FocusStory = {
  ...focusMeta,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const field = (k: string) => canvas.getByLabelText(`Field ${k}`);
    const [a, b, c, d] = [field('A'), field('B'), field('C'), field('D')];
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(a).toHaveFocus());
    await expect(canvas.getByTestId('field-error-count')).toHaveTextContent('field errors: 4');

    // Typing in A clears A only; B, C and D stay invalid with their message.
    await userEvent.keyboard('x');
    await expect(canvas.getByTestId('field-error-count')).toHaveTextContent('field errors: 3');
    await expect(a).not.toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.queryByText('A is required')).toBeNull();
    for (const el of [b, c, d]) await expect(el).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText('B is required')).toBeInTheDocument();

    // Typing in C (not the first invalid one): the focus stays in C, it does not jump to B.
    await userEvent.click(c);
    await userEvent.keyboard('y');
    await nextFrame();
    await expect(c).toHaveFocus();
    await expect(canvas.getByTestId('field-error-count')).toHaveTextContent('field errors: 2');
    await expect(b).toHaveAttribute('aria-invalid', 'true');

    // Save again: the first field still invalid (B) takes the focus, and again with identical errors.
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(b).toHaveFocus());
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(b).toHaveFocus());
    await expect(canvas.getByTestId('field-error-count')).toHaveTextContent('field errors: 2');
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

const nestedMeta = {
  component: NestedDemo,
  render: (args: ComponentProps<typeof NestedDemo>) => <NestedDemo {...args} />,
  argTypes: { onSave: { action: 'save' } },
  args: { onSave: fn() },
} satisfies Meta<typeof NestedDemo>;
type NestedStory = StoryObj<typeof nestedMeta>;

/** Nested Object Page: Save with empty nested fields focuses them in visual order, one message each; the handler runs only once all are valid. */
export const ObjectPageNested: NestedStory = {
  ...nestedMeta,
  name: 'Nested Object Page',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByLabelText('City')).toHaveFocus());
    await expect(canvas.getByText('City is required')).toBeVisible();
    await expect(canvas.getAllByText('Quantity is required')).toHaveLength(2);
    await expect(canvas.getByLabelText('Quantity 1')).toHaveAttribute('data-rop-name', 'lines.0.qty');
    await expect(canvas.getByLabelText('Quantity 1')).toHaveAttribute('aria-invalid', 'true');
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.type(canvas.getByLabelText('City'), 'Roma');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByLabelText('Quantity 1')).toHaveFocus());
    await userEvent.type(canvas.getByLabelText('Quantity 1'), '1');
    await userEvent.type(canvas.getByLabelText('Quantity 2'), '2');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(args.onSave).toHaveBeenCalledTimes(1));
  },
};

/** No `play`: the e2e drives Save itself (the `play` of `ObjectPageNested` would race with it). */
export const ObjectPageNestedNoPlay: NestedStory = { ...nestedMeta, name: 'Nested Object Page (no play)' };

/** A is filled in, so the focus lands on B, a Select: its trigger is found by `data-rop-name`, not by a native `name`. */
export const FocusFirstInvalidSelect: FocusStory = {
  ...focusMeta,
  args: { ...focusMeta.args, scenario: 'mixed-controls' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Field A'), 'filled');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    const trigger = canvas.getByRole('combobox', { name: 'Field B' });
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveAttribute('data-rop-name', 'b');
    await expect(trigger).not.toHaveAttribute('name');
    await expect(trigger).toHaveAttribute('aria-invalid', 'true');
  },
};
