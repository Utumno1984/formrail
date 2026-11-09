import { useState, type ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { Textarea } from './Textarea';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

interface DemoArgs {
  fieldState: FieldState;
  invalid: boolean;
  required: boolean;
  autoResize: boolean;
  rows: number;
  maxRows: number;
  placeholder: string;
  onChange: (value: string) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Textarea',
  // The demo's `onChange` receives the value (it feeds Actions); the component's receives the event.
  component: Textarea as unknown as ComponentType<DemoArgs>,
  parameters: { layout: 'padded' },
  argTypes: {
    // forced = value decided by a business rule; locked = not editable. Neither accepts typing, paste or cut.
    fieldState: { control: 'radio', options: STATES },
    invalid: { control: 'boolean' },
    required: { control: 'boolean' },
    autoResize: { control: 'boolean', description: 'The height follows the content, between `rows` and `maxRows`.' },
    rows: { control: { type: 'number', min: 1, max: 12 }, description: 'Minimum number of visible rows.' },
    maxRows: { control: { type: 'number', min: 1, max: 20 }, description: 'With `autoResize`: the content scrolls inside past this many rows.' },
    placeholder: { control: 'text' },
    onChange: { control: false },
  },
  args: {
    fieldState: 'default',
    invalid: false,
    required: false,
    autoResize: true,
    rows: 2,
    maxRows: 4,
    placeholder: 'Explain why the invoice is rejected',
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 360 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Decided by the framework agreement.' }) as FieldStateProps;

const control = (canvasElement: HTMLElement) => within(canvasElement).getByRole('textbox', { name: /Rejection reason/ });
const heightOf = (el: Element) => el.getBoundingClientRect().height;

function Demo({ fieldState, invalid, required, autoResize, rows, maxRows, placeholder, onChange, defaultValue }: DemoArgs & { defaultValue?: string }) {
  // `rows`/`maxRows`/`defaultValue` are read at mount by the story's own interactions: remount on a new arg.
  return (
    <div style={column}>
      <Field
        label="Rejection reason"
        help="Shown to the supplier."
        error={invalid ? 'A reason is required.' : undefined}
        required={required}
        {...stateProps(fieldState)}
      >
        <Textarea
          key={`${rows}-${maxRows}-${autoResize}`}
          autoResize={autoResize}
          rows={rows}
          maxRows={maxRows}
          placeholder={placeholder}
          defaultValue={defaultValue}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </Field>
    </div>
  );
}

/**
 * Controls: Field state, `invalid`, `required`, `autoResize`, `rows`, `maxRows`, `placeholder`;
 * `onChange` is in Actions. The play function types three lines with `autoResize` and `maxRows` 4 and
 * checks that the control grows, then types three more and checks that it stops at four rows and
 * scrolls inside.
 */
export const Playground: Story = {
  render: (args) => <Demo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'default' || !args.autoResize || args.maxRows !== 4 || args.rows !== 2) return;
    const el = control(canvasElement);
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const initial = heightOf(el);

    await userEvent.click(el);
    await userEvent.keyboard('First line{Enter}Second line{Enter}Third line');
    await waitFor(() => expect(heightOf(el)).toBeGreaterThan(initial));
    await expect(el.scrollHeight).toBeLessThanOrEqual(el.clientHeight);
    const grown = heightOf(el);

    await userEvent.keyboard('{Enter}Fourth{Enter}Fifth{Enter}Sixth');
    // Four rows is the limit: the height stops growing (by one row at most while settling) and the text scrolls inside.
    await waitFor(() => expect(el.scrollHeight).toBeGreaterThan(el.clientHeight));
    await expect(heightOf(el)).toBeLessThanOrEqual(grown + lineHeight + 0.5);
    await expect(getComputedStyle(el).overflowY).toBe('auto');
    await expect(args.onChange).toHaveBeenLastCalledWith('First line\nSecond line\nThird line\nFourth\nFifth\nSixth');
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: (args) => <Demo {...args} />,
};

/** The same control with an initial text, for the e2e of the first paint, form reset and the container width. */
export const WithInitialText: Story = {
  args: { rows: 2, maxRows: 5 },
  render: (args) => (
    <form style={column}>
      <Demo {...args} defaultValue={'Line one\nLine two\nLine three\nLine four'} />
      <button type="reset">Reset</button>
    </form>
  ),
};

/**
 * A `forced` value: typing, paste and Backspace change nothing and report nothing, the reason is read
 * by assistive technology. The play function tries to type and checks the value.
 */
export const Forced: Story = {
  args: { fieldState: 'forced', autoResize: false, rows: 3 },
  render: (args) => (
    <div style={column}>
      <Field label="Rejection reason" {...stateProps(args.fieldState)}>
        <Textarea defaultValue="Rejected by the framework agreement." rows={args.rows} onChange={(e) => args.onChange(e.currentTarget.value)} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const el = control(canvasElement);
    await userEvent.tab();
    await expect(el).toHaveFocus();
    await userEvent.keyboard('typed text{Backspace}{Backspace}');
    await userEvent.paste('pasted');
    await expect(el).toHaveValue('Rejected by the framework agreement.');
    await expect(el).toHaveAccessibleDescription('Decided by the framework agreement.');
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

/** Empty with the placeholder, with a text, and `autoResize` at its row limit: the pictures of the visual regression. */
export const Looks: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={column}>
      <Field label="Empty with placeholder">
        <Textarea placeholder="Explain why the invoice is rejected" />
      </Field>
      <Field label="With text">
        <Textarea defaultValue={'Wrong VAT number.\nPlease reissue the invoice.'} />
      </Field>
      <Field label="Auto-resize at the limit" help="Four rows, then it scrolls inside.">
        <Textarea autoResize maxRows={4} defaultValue={Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`).join('\n')} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const limit = within(canvasElement).getByRole('textbox', { name: 'Auto-resize at the limit' });
    await waitFor(() => expect(limit.scrollHeight).toBeGreaterThan(limit.clientHeight));
    await expect(within(canvasElement).getByRole('textbox', { name: 'Empty with placeholder' })).toHaveValue('');
  },
};

// Test fixtures: no Docs entry, hidden from the public sidebar (#296), nothing to control.
const FIXTURE: Pick<Story, 'tags' | 'parameters'> = { tags: ['!autodocs', 'internal'], parameters: { controls: { disable: true } } };

/** Fixture for the e2e of the virtual keyboard: an `autoResize` control low in a tall page (`--rop-keyboard-inset` pads the page). */
export const KeyboardSafe: Story = {
  ...FIXTURE,
  render: () => (
    <div style={{ ...column, padding: 16, boxSizing: 'border-box', paddingBottom: 'calc(var(--rop-keyboard-inset, 0px) + 16px)' }}>
      <div style={{ height: '110vh' }}>Scroll down to the field.</div>
      <Field label="Rejection reason">
        <Textarea autoResize rows={2} maxRows={8} />
      </Field>
    </div>
  ),
};

function HiddenAtMountDemo() {
  const [shown, setShown] = useState(false);
  return (
    <div style={column}>
      <button type="button" onClick={() => setShown(true)}>
        Show
      </button>
      <div style={{ display: shown ? 'block' : 'none' }}>
        <Field label="Rejection reason">
          <Textarea autoResize maxRows={6} defaultValue={'1\n2\n3\n4\n5'} />
        </Field>
      </div>
    </div>
  );
}

/** Fixture: an `autoResize` control that starts inside a `display: none` container (a closed tab), with an initial text. */
export const HiddenAtMount: Story = { ...FIXTURE, render: () => <HiddenAtMountDemo /> };

function ExternalValueDemo() {
  const [value, setValue] = useState('');
  const [calls, setCalls] = useState(0);
  return (
    <div style={column}>
      <button type="button" onClick={() => setValue('1\n2\n3\n4\n5')}>
        Load text
      </button>
      <Field label="Rejection reason">
        <Textarea
          autoResize
          maxRows={6}
          value={value}
          onChange={(event) => {
            setCalls((n) => n + 1);
            setValue(event.currentTarget.value);
          }}
        />
      </Field>
      <output data-testid="calls">{calls}</output>
    </div>
  );
}

/** Fixture: a controlled `autoResize` control whose value is set from outside after mount (asynchronous hydration). */
export const ExternalValue: Story = { ...FIXTURE, render: () => <ExternalValueDemo /> };

function RowsFromOutsideDemo() {
  const [limits, setLimits] = useState({ rows: 2, maxRows: 4 });
  return (
    <div style={column}>
      <button type="button" onClick={() => setLimits({ rows: 2, maxRows: 8 })}>
        Eight rows maximum
      </button>
      <button type="button" onClick={() => setLimits({ rows: 7, maxRows: 8 })}>
        Seven rows minimum
      </button>
      <Field label="Rejection reason">
        {/* No `key`: the same mounted control receives the new limits. */}
        <Textarea autoResize rows={limits.rows} maxRows={limits.maxRows} defaultValue={'1\n2\n3\n4\n5\n6'} />
      </Field>
    </div>
  );
}

/** Fixture: `rows` and `maxRows` changed from outside on a mounted `autoResize` control (no remount). */
export const RowsFromOutside: Story = { ...FIXTURE, render: () => <RowsFromOutsideDemo /> };

/** Fixture: one very long token (a pasted URL) in a narrow Field. */
export const LongToken: Story = {
  ...FIXTURE,
  render: () => (
    <div style={{ ...column, maxWidth: 240 }}>
      <Field label="Rejection reason">
        <Textarea autoResize defaultValue={`https://example.com/${'very-long-path-segment/'.repeat(8)}`} />
      </Field>
    </div>
  ),
};
