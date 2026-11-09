import { useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { NumberInput, type NumberInputSize } from './NumberInput';
import { clamp, stepFrom } from './number-parse';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];
const SIZES: NumberInputSize[] = ['sm', 'md'];
const LOCALES = ['en-US', 'it-IT', 'de-DE'];

interface DemoArgs {
  fieldState: FieldState;
  min: number;
  max: number;
  step: number;
  locale: string;
  size: NumberInputSize;
  invalid: boolean;
  required: boolean;
  onValueChange: (value: number | undefined) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/NumberInput',
  // The stories drive the component through a demo wrapper (`Meta<DemoArgs>`): `never` keeps the docs
  // props table of the real component.
  component: NumberInput as never,
  parameters: { layout: 'padded' },
  argTypes: {
    // forced = value decided by a business rule; locked = not editable. No channel changes the value.
    fieldState: { control: 'radio', options: STATES, description: 'The `state` of the enclosing Field.' },
    min: { control: 'number', description: 'Lower limit (typed values and steps are clamped to it).' },
    max: { control: 'number', description: 'Upper limit.' },
    step: { control: 'number', description: 'Amount of an arrow key / stepper press (PageUp/PageDown: × 10).' },
    locale: { control: 'select', options: LOCALES, description: 'Decimal separator of the text (`.` is always accepted too).' },
    size: { control: 'radio', options: SIZES },
    invalid: { control: 'boolean', description: 'Give the Field an error.' },
    required: { control: 'boolean', description: 'Mark the Field required.' },
    onValueChange: { control: false, description: 'One call per committed gesture (Actions panel).' },
  },
  args: {
    fieldState: 'default',
    min: 0,
    max: 100,
    step: 1,
    locale: 'en-US',
    size: 'md',
    invalid: false,
    required: false,
    onValueChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const column: CSSProperties = { display: 'grid', gap: 16, maxWidth: 320 };
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Set by the framework agreement.' }) as FieldStateProps;

function Controlled({
  initial,
  onValueChange,
  ...rest
}: { initial?: number } & Omit<DemoArgs, 'fieldState' | 'invalid' | 'required'>) {
  const [value, setValue] = useState<number | undefined>(initial);
  return (
    <NumberInput
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

/**
 * "Quantity". Controls: the Field `fieldState`, `invalid` and `required`, `min`/`max`/`step`,
 * `locale` and `size`; `onValueChange` is in Actions. The play function presses ArrowUp three
 * times, clicks Increase (one call each, focus kept on the input), then types `150` and leaves the
 * field: the value is clamped to `max` and reported once.
 */
export const Quantity: Story = {
  render: ({ fieldState, invalid, required, ...args }) => (
    <div style={column}>
      <Field
        label="Quantity"
        help="Units on the invoice line."
        required={required}
        error={invalid ? 'Exceeds the ordered quantity.' : undefined}
        {...stateProps(fieldState)}
      >
        <Controlled {...args} initial={1} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole('spinbutton', { name: /Quantity/ });
    const { min, max, step } = args;
    // The script needs four steps of room above 1 (the defaults have it); other Controls values are
    // left to manual play.
    if (args.fieldState !== 'default' || min > 1 || stepFrom(1, step, 1, 4, undefined, undefined) > max) return;
    await userEvent.click(input);
    let expected = 1;
    for (let i = 0; i < 3; i++) {
      await userEvent.keyboard('{ArrowUp}');
      expected = stepFrom(expected, step, 1, 1, min, max);
      await expect(args.onValueChange).toHaveBeenLastCalledWith(expected);
    }
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Increase' }));
    expected = stepFrom(expected, step, 1, 1, min, max);
    await expect(args.onValueChange).toHaveBeenLastCalledWith(expected);
    await expect(input).toHaveFocus();
    await expect(args.onValueChange).toHaveBeenCalledTimes(4);
    await userEvent.clear(input);
    await userEvent.type(input, '150');
    // Typing is a draft: nothing is reported per keystroke.
    await expect(args.onValueChange).toHaveBeenCalledTimes(4);
    await userEvent.tab();
    const clamped = clamp(150, min, max);
    await expect(args.onValueChange).toHaveBeenLastCalledWith(clamped);
    await expect(args.onValueChange).toHaveBeenCalledTimes(5);
    await expect(input).toHaveAttribute('aria-valuenow', String(clamped));
  },
};

/**
 * "Unit price" in `it-IT` with `step={0.01}`: the text uses the comma, the value is a number. The
 * play function types `12,37` and leaves the field: `onValueChange(12.37)`, not rounded to the step.
 */
export const UnitPrice: Story = {
  args: { locale: 'it-IT', step: 0.01, min: 0, max: 100000 },
  render: ({ fieldState, invalid, required, ...args }) => (
    <div style={column}>
      <Field
        label="Unit price"
        help="EUR, without VAT."
        name="unitPrice"
        required={required}
        error={invalid ? 'Price differs from the order.' : undefined}
        {...stateProps(fieldState)}
      >
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole('spinbutton', { name: /Unit price/ });
    if (args.fieldState !== 'default' || args.locale !== 'it-IT') return;
    await userEvent.click(input);
    await userEvent.type(input, '12,37');
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.tab();
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenCalledWith(12.37);
    await expect(input).toHaveValue('12,37');
    await expect(input).toHaveAttribute('aria-valuenow', '12.37');
  },
};

/**
 * Inside a native `<form>`: the Field's `name` goes to a hidden input holding the canonical value
 * (`12.5`, whatever the locale), so `FormData` never receives `12,5`. Reset restores the
 * `defaultValue` without calling `onValueChange`. The play function types `12,5`, submits, checks
 * the submitted value, then resets.
 */
export const NativeForm: Story = {
  args: { locale: 'it-IT', step: 0.5 },
  parameters: { controls: { include: ['locale', 'step', 'onValueChange'] } },
  render: function Render({ locale, step, onValueChange }) {
    const [submitted, setSubmitted] = useState<string | null>(null);
    return (
      <form
        style={column}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(String(new FormData(event.currentTarget).get('quantity')));
        }}
      >
        <Field label="Quantity" name="quantity">
          <NumberInput defaultValue={2} min={0} step={step} locale={locale} onValueChange={onValueChange} />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" variant="primary">
            Submit
          </Button>
          <Button type="reset">Reset</Button>
        </div>
        <output aria-label="Submitted value">{submitted ?? 'Nothing submitted'}</output>
      </form>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('spinbutton', { name: 'Quantity' });
    if (args.locale !== 'it-IT') return;
    await userEvent.clear(input);
    await userEvent.type(input, '12,5');
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenCalledWith(12.5);
    await expect(canvas.getByRole('status', { name: 'Submitted value' })).toHaveTextContent('12.5');
    await userEvent.click(canvas.getByRole('button', { name: 'Reset' }));
    // The browser resets the controls after the `reset` event: the field follows on the next task.
    await waitFor(() => expect(input).toHaveValue('2'));
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
  },
};

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
  boxSizing: 'border-box',
};
const CELL: CSSProperties = { minWidth: 0 };

const LOOKS = [
  { id: 'empty', label: 'Empty', props: {} },
  { id: 'value', label: 'With value', props: { defaultValue: 42 } },
  { id: 'at-max', label: 'At max', props: { defaultValue: 100 } },
  { id: 'at-min', label: 'At min', props: { defaultValue: 0 } },
] as const;

/**
 * The visual matrix: empty, with a value, at max / at min (one stepper disabled), every Field state
 * with and without an error, in `sm` and `md`. Photographed on mobile, tablet and desktop. The play
 * function only checks the stepper states; it changes nothing.
 */
export const States: Story = {
  tags: ['visual'],
  parameters: { controls: { include: ['locale'] } },
  render: ({ locale, onValueChange }) => (
    <div style={{ display: 'grid', gap: 24 }}>
      {SIZES.map((size) => (
        <div key={size} style={GRID}>
          {LOOKS.map((look) => (
            <div key={look.id} style={CELL} data-testid={`look-${size}-${look.id}`}>
              <Field label={`${look.label} (${size})`}>
                <NumberInput {...look.props} size={size} min={0} max={100} locale={locale} onValueChange={onValueChange} />
              </Field>
            </div>
          ))}
          {STATES.flatMap((state) =>
            [false, true].map((invalid) => (
              <div key={`${state}-${invalid}`} style={CELL} data-testid={`state-${size}-${state}${invalid ? '-invalid' : ''}`}>
                <Field
                  label={`${state}${invalid ? ' + invalid' : ''} (${size})`}
                  error={invalid ? 'Out of range.' : undefined}
                  {...stateProps(state)}
                >
                  <NumberInput defaultValue={12.5} size={size} min={0} max={100} step={0.5} locale={locale} onValueChange={onValueChange} />
                </Field>
              </div>
            )),
          )}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const size of SIZES) {
      const atMax = within(canvas.getByTestId(`look-${size}-at-max`));
      await expect(atMax.getByRole('button', { name: 'Increase' })).toBeDisabled();
      await expect(atMax.getByRole('button', { name: 'Decrease' })).toBeEnabled();
      const atMin = within(canvas.getByTestId(`look-${size}-at-min`));
      await expect(atMin.getByRole('button', { name: 'Decrease' })).toBeDisabled();
      for (const state of ['forced', 'locked', 'disabled'] as const) {
        const cell = within(canvas.getByTestId(`state-${size}-${state}`));
        await expect(cell.getByRole('button', { name: 'Increase' })).toBeDisabled();
      }
    }
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};
