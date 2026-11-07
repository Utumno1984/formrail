import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Combobox } from '../combobox/Combobox';
import { Input } from '../input/Input';
import { Select } from '../select/Select';
import { Field } from './Field';

interface MatrixArgs {
  size: 'sm' | 'md';
  message: string;
}

const OPTIONS = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
];

const meta: Meta<MatrixArgs> = {
  title: 'Internal/InvalidStates',
  // Test fixture / state matrix, not a documented component: no Docs page; `internal`: hidden from the public sidebar (#296).
  tags: ['!autodocs', 'internal'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    size: { control: 'radio', options: ['sm', 'md'], description: 'Height scale of the three controls' },
    message: { control: 'text', description: 'The Field `error` of the "with message" column' },
  },
  args: { size: 'md', message: 'This value is not valid.' },
};

export default meta;
type Story = StoryObj<MatrixArgs>;

// Inline styles: the stories are not scanned by Tailwind. One column on a phone, three from a tablet:
// the cells wrap instead of overflowing.
const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
  padding: 16,
  boxSizing: 'border-box',
};
const CELL: CSSProperties = { minWidth: 0 };

type Kind = 'input' | 'select' | 'combobox';
type Variant = 'valid' | 'invalid' | 'invalid-message';

const LABELS: Record<Kind, string> = { input: 'Supplier', select: 'Country', combobox: 'Category' };
const VARIANT_TEXT: Record<Variant, string> = {
  valid: 'valid',
  invalid: 'invalid, no message',
  'invalid-message': 'invalid, with message',
};

function Control({ kind, size, invalid }: { kind: Kind; size: 'sm' | 'md'; invalid: boolean }) {
  // "Invalid without a message": the control carries `aria-invalid` on its own (outside the Field's
  // error), which is what the shared border style reacts to.
  const own = invalid ? ({ 'aria-invalid': true } as const) : {};
  if (kind === 'input') return <Input size={size} defaultValue="ACME Ltd" {...own} />;
  if (kind === 'select') return <Select size={size} options={OPTIONS} defaultValue="it" {...own} />;
  return <Combobox size={size} options={OPTIONS} defaultValue="fr" {...own} />;
}

function Cell({ kind, variant, size, message }: { kind: Kind; variant: Variant; size: 'sm' | 'md'; message: string }) {
  return (
    <div style={CELL} data-testid={`cell-${kind}-${variant}`}>
      <Field label={`${LABELS[kind]} (${VARIANT_TEXT[variant]})`} error={variant === 'invalid-message' ? message : undefined}>
        <Control kind={kind} size={size} invalid={variant === 'invalid'} />
      </Field>
    </div>
  );
}

/**
 * The invalid state of the three form controls side by side: for `Input`, `Select` and `Combobox`,
 * valid / invalid without a message / invalid with the Field's message. The border and the height of
 * the invalid controls are the same on the three, and the message only adds its own room under the
 * control. Photographed on mobile, tablet and desktop; `e2e/invalid-states.spec.ts` asserts the
 * geometry.
 */
export const Matrix: Story = {
  tags: ['visual'],
  render: ({ size, message }) => (
    <div style={GRID}>
      {(['input', 'select', 'combobox'] as const).flatMap((kind) =>
        (['valid', 'invalid', 'invalid-message'] as const).map((variant) => (
          <Cell key={`${kind}-${variant}`} kind={kind} variant={variant} size={size} message={message} />
        )),
      )}
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const control = (kind: Kind, variant: Variant) => {
      const cell = within(canvas.getByTestId(`cell-${kind}-${variant}`));
      return kind === 'input' ? cell.getByRole('textbox') : cell.getByRole('combobox');
    };
    for (const kind of ['input', 'select', 'combobox'] as const) {
      await expect(control(kind, 'valid')).not.toHaveAttribute('aria-invalid');
      await expect(control(kind, 'invalid')).toHaveAttribute('aria-invalid', 'true');
      await expect(control(kind, 'invalid')).not.toHaveAccessibleDescription();
      await expect(control(kind, 'invalid-message')).toHaveAttribute('aria-invalid', 'true');
      await expect(control(kind, 'invalid-message')).toHaveAccessibleDescription(args.message);
    }
  },
};
