import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Input } from '../input/Input';
import { FieldMessage } from './FieldMessage';

const meta = {
  title: 'Primitives/FieldMessage',
  component: FieldMessage,
  parameters: { layout: 'padded' },
  argTypes: {
    tone: { control: 'radio', options: ['help', 'error'] },
    id: { control: 'text' },
    children: { control: 'text' },
  },
  args: { id: 'field-message', tone: 'help', children: 'At least 8 characters.' },
} satisfies Meta<typeof FieldMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: tone, id, text. The play function wires the message to a control the way the Field
 * ticket will: the message is the control's accessible description, and it is not a live region.
 * The real `Input` primitive (not a bare `<input>`): this story predates it (ticket #8, before #9).
 */
export const Playground: Story = {
  render: (args) => (
    <div style={{ maxWidth: 320, display: 'grid', gap: 4 }}>
      <label htmlFor="fm-playground-password">Password</label>
      <Input
        id="fm-playground-password"
        aria-describedby={args.children ? args.id : undefined}
        aria-invalid={args.tone === 'error' || undefined}
      />
      <FieldMessage {...args} />
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Password' })).toHaveAccessibleDescription(String(args.children));
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};

/** Help and error side by side: same type size, spacing and height; only colour (and the error icon) differ. */
export const SideBySide: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ width: 240, display: 'grid', gap: 4 }} data-testid="help-col">
        <Input aria-label="First name" aria-describedby="sb-help" />
        <FieldMessage id="sb-help" tone="help" data-testid="help">
          How it appears on the invoice.
        </FieldMessage>
      </div>
      <div style={{ width: 240, display: 'grid', gap: 4 }} data-testid="error-col">
        <Input aria-label="Last name" aria-describedby="sb-error" aria-invalid />
        <FieldMessage id="sb-error" tone="error" data-testid="error">
          This field is required.
        </FieldMessage>
      </div>
      <div style={{ width: 160 }}>
        <FieldMessage id="sb-long" tone="error" data-testid="long">
          Supercalifragilisticexpialidocious does not wrap on its own
        </FieldMessage>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'First name' })).toHaveAccessibleDescription('How it appears on the invoice.');
    await expect(canvas.getByRole('textbox', { name: 'Last name' })).toHaveAccessibleDescription('This field is required.');
  },
};
