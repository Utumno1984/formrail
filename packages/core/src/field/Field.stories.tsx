import { useState, type ButtonHTMLAttributes, type ChangeEvent } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Input } from '../input/Input';
import { storyControl, withoutControls } from '../internal/story-docs';
import { Field, type FieldStateProps } from './Field';
import type { FieldControlProps, FieldState } from './FieldContext';
import { useFieldControl } from './useFieldControl';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

interface PlaygroundArgs {
  label: string;
  name: string;
  help: string;
  error: string;
  required: boolean;
  hideLabel: boolean;
  reserveMessageSpace: boolean;
  state: FieldState;
  stateReason: string;
  placeholder: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Forms/Field',
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: Field as never,
  parameters: { layout: 'padded' },
  argTypes: {
    label: { control: 'text' },
    name: { control: 'text' },
    help: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    hideLabel: { control: 'boolean' },
    reserveMessageSpace: { control: 'boolean' },
    // `state` / `stateReason`: a union (`FieldStateProps`) read by react-docgen-typescript, TSDoc included.
    state: { control: 'radio', options: STATES },
    stateReason: { control: 'text' },
    // Set by the demo (the Input child, a generated id).
    ...withoutControls('children', 'id'),
    placeholder: storyControl({ control: 'text', description: '`placeholder` of the demo\'s `Input` (the Field\'s child).' }),
    onChange: storyControl({ control: false, description: '`onChange` of the demo\'s `Input` (the Field\'s child).' }),
  },
  args: {
    label: 'Company name',
    name: 'companyName',
    help: '',
    error: '',
    required: false,
    hideLabel: false,
    reserveMessageSpace: true,
    state: 'default',
    stateReason: '',
    placeholder: 'e.g. Acme Corp',
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 360 } as const;

/** `forced`/`locked` need a reason in the type; the Controls hand over plain strings. */
const stateProps = (state: FieldState, stateReason: string) => ({ state, stateReason }) as FieldStateProps;

/**
 * Controls: label, help, error, required, state and its reason. The play function types in the
 * input, then checks what the Controls wire up: the accessible name, the typed value reaching
 * `onChange` (Actions panel) and the description built from help.
 */
export const Playground: Story = {
  args: { help: 'How it appears on the invoice.' },
  render: ({ label, name, help, error, required, hideLabel, reserveMessageSpace, state, stateReason, placeholder, onChange }) => (
    <div style={column}>
      <Field
        label={label}
        name={name}
        help={help}
        error={error}
        required={required}
        hideLabel={hideLabel}
        reserveMessageSpace={reserveMessageSpace}
        {...stateProps(state, stateReason)}
      >
        <Input placeholder={placeholder} onChange={onChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Company name' });
    await userEvent.type(input, 'Acme');
    await expect(input).toHaveValue('Acme');
    await expect(args.onChange).toHaveBeenCalledTimes(4);
    await expect(input).toHaveAccessibleDescription('How it appears on the invoice.');
    // The `name` control reaches the control as `data-rop-name` (and the native `name`).
    await expect(input).toHaveAttribute('data-rop-name', args.name);
    await expect(input).toHaveAttribute('name', args.name);
  },
};

/**
 * A forced field: focusable, never editable. The play function tabs onto it, types, presses
 * Backspace and checks that the value is the same and `onChange` never ran. The reason is part of
 * the accessible description.
 */
export const Forced: Story = {
  args: { state: 'forced', stateReason: 'Value set by the customer price list.' },
  parameters: { controls: { include: ['label', 'state', 'stateReason'] } },
  render:({ label, state, stateReason, onChange }) => (
    <div style={column}>
      <Field label={label} {...stateProps(state, stateReason)}>
        <Input value="Price list A" onChange={onChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    const input = canvas.getByRole('textbox', { name: 'Company name' });
    await expect(input).toHaveFocus();
    await userEvent.keyboard('abc{Backspace}');
    await expect(input).toHaveValue('Price list A');
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(input).toHaveAccessibleDescription('Value set by the customer price list.');
  },
};

/** A forced `type="number"`: arrow keys and the mouse wheel must not step the value. */
export const ForcedNumber: Story = {
  args: { label: 'Quantity', state: 'forced', stateReason: 'Fixed by the master agreement.' },
  parameters: { controls: { include: ['label', 'state', 'stateReason'] } },
  render:({ label, state, stateReason, onChange }) => (
    <div style={column}>
      <Field label={label} {...stateProps(state, stateReason)}>
        <Input type="number" value={5} onChange={onChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole('spinbutton', { name: 'Quantity' });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}');
    await expect(input).toHaveValue(5);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

function LoadData({ onChange }: { onChange: PlaygroundArgs['onChange'] }) {
  const [value, setValue] = useState('');
  return (
    <div style={column}>
      <Field label="Company name">
        <Input
          value={value}
          onChange={(event) => {
            onChange(event);
            setValue(event.target.value);
          }}
        />
      </Field>
      <Button onClick={() => setValue('Acme S.p.A.')}>Load data</Button>
    </div>
  );
}

/**
 * Hydration: "Load data" sets `value` from outside after mount. The input shows it and the
 * Actions panel stays empty (no `onChange`); typing afterwards is a real change and does log.
 */
export const ExternalValue: Story = {
  parameters: { controls: { disable: true } },
  render: ({ onChange }) => <LoadData onChange={onChange} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Load data' }));
    const input = canvas.getByRole('textbox', { name: 'Company name' });
    await expect(input).toHaveValue('Acme S.p.A.');
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.type(input, '!');
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

/**
 * Fixture, not a public component: a switch built on a plain `<button>`. It gets the Field props by
 * spread and reads the non-enumerable `interactionBlocked` to refuse Space / Enter / click.
 */
function FixtureToggle({ control, ...rest }: { control: FieldControlProps } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [on, setOn] = useState(false);
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={on}
      data-testid="fixture-toggle"
      onClick={() => {
        if (!control.interactionBlocked) setOn((v) => !v);
      }}
      style={{ width: 'fit-content', padding: '4px 12px', border: '1px solid var(--color-rop-border)' }}
    >
      {on ? 'Yes' : 'No'}
    </button>
  );
}

function HookToggle() {
  const control = useFieldControl();
  return <FixtureToggle control={control} {...control} />;
}

/**
 * Render-prop: `<Field>{(control) => ...}</Field>` hands a `FieldControlProps` object to a control that
 * is not an `Input`; spread it on the element. Locked: Space, Enter and click leave it off; the
 * reason is its accessible description. `control.interactionBlocked` and `control.state` are
 * readable but do not travel through `{...control}`.
 */
export const RenderPropLocked: Story = {
  name: 'Render-prop: FieldControlProps',
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={column}>
      <Field label="Active" state="locked" stateReason="Managed by the administrator">
        {(control) => <FixtureToggle control={control} {...control} />}
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Active' });
    await userEvent.click(toggle);
    toggle.focus();
    await userEvent.keyboard(' {Enter}');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAccessibleDescription('Managed by the administrator');
  },
};

/**
 * Hook: `useFieldControl()` returns the same `FieldControlProps` from any component rendered inside
 * a `Field`, so a custom control does not need the render-prop. Here the Field is not blocked.
 */
export const HookToggleEnabled: Story = {
  name: 'Hook: useFieldControl',
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={column}>
      <Field label="Notifiche">
        <HookToggle />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole('switch', { name: 'Notifiche' });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  },
};

/**
 * Keyboard-safe fixture (spec §1.10): the field is the last thing in a long page. When the virtual
 * keyboard covers the bottom of the screen, Field scrolls itself above it. The wrapper pads with
 * `--rop-keyboard-inset`, which Field publishes on `<html>` while it has focus, so the page can
 * scroll far enough. Exercised by `e2e/field.spec.ts` with a simulated visualViewport.
 */
export const KeyboardSafe: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...column, paddingBottom: 'var(--rop-keyboard-inset, 0px)' }} data-testid="kb-page">
      <div style={{ height: '120dvh' }}>Long content before the field.</div>
      <Field label="Billing address" data-testid="kb-field">
        <Input />
      </Field>
      <div style={{ height: '100dvh' }} />
    </div>
  ),
};

const SHORT_ERROR = 'Enter a valid VAT number.';
const LONG_ERROR = 'Enter a valid VAT number: eleven digits, no country prefix, no spaces, and it must match the registered company name.';

/**
 * The error line is always reserved, with or without a help text: a one-line error appearing under
 * the first field does not move the second one (a longer error wraps and pushes it down by the
 * extra height only). Controls: `help`, and `reserveMessageSpace` (turn it off to see the jump).
 * The play function shows and clears the error and checks the next field against the control.
 */
export const ErrorReservesSpace: Story = {
  tags: ['visual'],
  args: { help: 'Eleven digits, as printed on the invoice.' },
  parameters: { controls: { include: ['help', 'reserveMessageSpace'] } },
  render: function Render({ help, reserveMessageSpace }) {
    const [error, setError] = useState('');
    return (
      <div style={{ ...column, color: 'var(--color-rop-text)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setError(SHORT_ERROR)}>Show error</Button>
          <Button onClick={() => setError(LONG_ERROR)}>Show long error</Button>
          <Button onClick={() => setError('')}>Clear</Button>
        </div>
        <Field label="VAT number" error={error} help={help} reserveMessageSpace={reserveMessageSpace} data-testid="er-first">
          <Input defaultValue="12345" />
        </Field>
        <Field label="Company name" data-testid="er-second">
          <Input defaultValue="Acme" />
        </Field>
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const second = canvas.getByTestId('er-second');
    const before = second.getBoundingClientRect().top;
    await userEvent.click(canvas.getByRole('button', { name: 'Show error' }));
    await expect(canvas.getByRole('textbox', { name: 'VAT number' })).toHaveAccessibleDescription(expect.stringContaining(SHORT_ERROR));
    const moved = second.getBoundingClientRect().top - before;
    // Reserved: nothing moves. With the control off, the error takes its own room.
    if (args.reserveMessageSpace) await expect(moved).toBe(0);
    else await expect(moved).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }));
    await expect(canvas.queryByText(SHORT_ERROR)).toBeNull();
    await expect(second.getBoundingClientRect().top).toBe(before);
  },
};

/**
 * Visual matrix: plain, help, error, required, disabled, forced, locked, a custom control through
 * the render-prop, and a 240px column with a long label and a long reason.
 */
export const Overview: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...column, color: 'var(--color-rop-text)' }}>
      <Field label="Plain" data-testid="f-plain">
        <Input placeholder="Text" />
      </Field>
      <Field label="With help" help="Visible on the invoice." data-testid="f-help">
        <Input defaultValue="Acme" />
      </Field>
      <Field label="With error" error="Required field." help="Help" data-testid="f-error">
        <Input />
      </Field>
      <Field label="Required" required data-testid="f-required">
        <Input />
      </Field>
      <Field label="Disabled" state="disabled" data-testid="f-disabled">
        <Input defaultValue="Not editable" />
      </Field>
      <Field label="Forced" state="forced" stateReason="Set by the price list." data-testid="f-forced">
        <Input defaultValue="Price list A" />
      </Field>
      <Field label="Locked" state="locked" stateReason="Document already sent." data-testid="f-locked">
        <Input defaultValue="FT-2026/041" />
      </Field>
      <Field label="Active" state="locked" stateReason="Managed by the administrator" data-testid="f-toggle">
        {(control) => <FixtureToggle control={control} {...control} />}
      </Field>
      <div style={{ width: 240 }} data-testid="f-narrow">
        <Field
          label="Full name of the legal entity receiving the invoice"
          state="locked"
          stateReason="The field is locked because the invoice was submitted to the tax authority: SupercalifragilisticexpialidociousNotEditable."
        >
          <Input defaultValue="Rossi" />
        </Field>
      </div>
    </div>
  ),
};
