import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { Input, type InputSize } from './Input';

const SIZES: InputSize[] = ['sm', 'md'];
const TYPES = ['text', 'email', 'password', 'tel', 'url'] as const;

interface DemoArgs {
  size: InputSize;
  type: (typeof TYPES)[number];
  placeholder: string;
  disabled: boolean;
  readOnly: boolean;
  onChange: (value: string) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Input',
  // The demo's `onChange` receives the value (it feeds Actions); the component's receives the event.
  component: Input as never,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: [
          'A styled native `<input>`. Outside a `Field` it behaves as the element it renders; inside one it takes `id`, `aria-describedby`, `aria-invalid`, `aria-required`, `disabled` and `readOnly` from the `Field`. `forced` and `locked` fields set native `readOnly`, so typing, paste, Backspace and the arrow keys change nothing.',
          '',
          'Copy-paste example:',
          '',
          '```tsx',
          "import '@formrail/core/styles.css';",
          "import { Field, Input } from '@formrail/core';",
          '',
          'export function SupplierName() {',
          '  return (',
          '    <Field label="Company name" help="As it appears on the invoice.">',
          '      <Input defaultValue="Acme Ltd" onChange={(event) => console.log(event.currentTarget.value)} />',
          '    </Field>',
          '  );',
          '}',
          '```',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    size: { control: 'radio', options: SIZES },
    type: { control: 'select', options: TYPES, description: 'Native input type.' },
    placeholder: { control: 'text', description: 'Native `placeholder`.' },
    disabled: { control: 'boolean', description: 'Native `disabled`. Inside a `Field`, prefer the `Field` `state`.' },
    readOnly: { control: 'boolean', description: 'Native `readOnly`: focusable, not editable.' },
    onChange: { control: false, description: 'Native `onChange`.' },
  },
  args: {
    size: 'md',
    type: 'text',
    placeholder: 'Acme Ltd',
    disabled: false,
    readOnly: false,
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 360 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Decided by the framework agreement.' }) as FieldStateProps;

/**
 * Controls: `size`, `type`, `placeholder`, `disabled`, `readOnly`; `onChange` is in Actions. The play
 * function types a name, then empties the input and checks that the last value reported is `''`.
 */
export const Playground: Story = {
  render: ({ onChange, ...props }) => (
    <div style={column}>
      <Field label="Company name">
        <Input {...props} onChange={(event) => onChange(event.currentTarget.value)} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    if (args.disabled || args.readOnly || args.type !== 'text') return;
    const input = within(canvasElement).getByRole('textbox', { name: 'Company name' });
    await userEvent.type(input, 'Acme');
    await expect(input).toHaveValue('Acme');
    await expect(args.onChange).toHaveBeenLastCalledWith('Acme');
    await userEvent.clear(input);
    await expect(input).toHaveValue('');
    await expect(args.onChange).toHaveBeenLastCalledWith('');
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: Playground.render,
};

/**
 * Inside a `Field`: the label names the input, the help and the error are part of its accessible
 * description, and `required` marks it. The play function checks the name and the description.
 */
export const InsideField: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={column}>
      <Field label="Company name" help="As it appears on the invoice." required>
        <Input defaultValue="Acme Ltd" />
      </Field>
      <Field label="VAT number" error="The VAT number must have 11 digits.">
        <Input defaultValue="123" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole('textbox', { name: /Company name/ });
    await expect(name).toHaveAccessibleDescription('As it appears on the invoice.');
    await expect(name).toBeRequired();
    const vat = canvas.getByRole('textbox', { name: 'VAT number' });
    await expect(vat).toBeInvalid();
    await expect(vat).toHaveAccessibleDescription('The VAT number must have 11 digits.');
  },
};

/**
 * `forced` (the value is decided by a business rule) and `locked` (not editable): both stay
 * focusable and read-only, and the reason is read by assistive technology. The play function tries
 * to type into both and checks that the values do not change and `onChange` never runs.
 */
export const ForcedAndLocked: Story = {
  args: { onChange: fn() },
  parameters: { controls: { include: ['onChange'] } },
  render: ({ onChange }) => (
    <div style={column}>
      <Field label="Discount" {...stateProps('forced')}>
        <Input defaultValue="10%" onChange={(event) => onChange(event.currentTarget.value)} />
      </Field>
      <Field label="Customer code" {...stateProps('locked')}>
        <Input defaultValue="C-0042" onChange={(event) => onChange(event.currentTarget.value)} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    for (const [label, value] of [
      ['Discount', '10%'],
      ['Customer code', 'C-0042'],
    ] as const) {
      const input = canvas.getByRole('textbox', { name: label });
      await userEvent.click(input);
      await expect(input).toHaveFocus();
      await userEvent.keyboard('typed{Backspace}{Backspace}');
      await userEvent.paste('pasted');
      await expect(input).toHaveValue(value);
      await expect(input).toHaveAccessibleDescription('Decided by the framework agreement.');
    }
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

function ControlledDemo({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('Acme Ltd');
  return (
    <div style={column}>
      <Field label="Controlled">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            onChange(event.currentTarget.value);
          }}
        />
      </Field>
      <button type="button" onClick={() => setValue('Loaded from outside')}>
        Set from outside
      </button>
      <Field label="Uncontrolled">
        <Input defaultValue="Acme Ltd" onChange={(event) => onChange(event.currentTarget.value)} />
      </Field>
      <output data-testid="mirror">{value}</output>
    </div>
  );
}

/**
 * Controlled (`value` + `onChange`) and uncontrolled (`defaultValue`). Changing `value` from outside
 * never calls `onChange`: only the user does. The play function sets the value from outside, checks
 * that nothing was reported, then types and checks that the report arrives.
 */
export const ControlledVsUncontrolled: Story = {
  parameters: { controls: { include: ['onChange'] } },
  render: ({ onChange }) => <ControlledDemo onChange={onChange} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const controlled = canvas.getByRole('textbox', { name: 'Controlled' });
    await userEvent.click(canvas.getByRole('button', { name: 'Set from outside' }));
    await expect(controlled).toHaveValue('Loaded from outside');
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.type(controlled, '!');
    await expect(args.onChange).toHaveBeenLastCalledWith('Loaded from outside!');
    await expect(canvas.getByTestId('mirror')).toHaveTextContent('Loaded from outside!');
  },
};

/** Both sizes, empty with a placeholder, filled, invalid, disabled, forced and locked: the pictures of the visual regression. */
export const Looks: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={column}>
      <Field label="Size md (default)">
        <Input placeholder="Acme Ltd" />
      </Field>
      <Field label="Size sm">
        <Input size="sm" placeholder="Acme Ltd" />
      </Field>
      <Field label="Filled" help="Help text.">
        <Input defaultValue="Acme Ltd" />
      </Field>
      <Field label="Invalid" error="This field is required.">
        <Input defaultValue="" />
      </Field>
      <Field label="Disabled" state="disabled">
        <Input defaultValue="Acme Ltd" />
      </Field>
      <Field label="Forced" {...stateProps('forced')}>
        <Input defaultValue="10%" />
      </Field>
      <Field label="Locked" {...stateProps('locked')}>
        <Input defaultValue="C-0042" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Invalid' })).toBeInvalid();
    await expect(canvas.getByRole('textbox', { name: 'Disabled' })).toBeDisabled();
    await expect(canvas.getByRole('textbox', { name: 'Locked' })).toHaveAttribute('readonly');
  },
};
