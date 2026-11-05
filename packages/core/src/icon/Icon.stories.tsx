import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { internalIcons, type InternalIconName } from '../internal/icons';
import { Text } from '../typography/Text';
import { Icon } from './Icon';

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const NAMES = Object.keys(internalIcons) as InternalIconName[];

// An SVG the consumer might bring: arbitrary, with its own (large) width/height.
const foreignSvg = (
  <svg width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="8">
    <rect x="10" y="10" width="80" height="80" rx="12" />
    <path d="M30 50l14 14 26-30" />
  </svg>
);

const meta = {
  title: 'Foundations/Icon',
  component: Icon,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'radio', options: SIZES },
    label: { control: 'text', description: 'Empty = decorative (aria-hidden); filled = role="img" with this name' },
    children: { control: false },
  },
  args: { size: 'md', label: 'Errore', children: internalIcons.error, onClick: fn() },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: size and label. The play function checks what the Controls change: the rendered SVG
 * measures the `lg` token (24px) whatever the SVG's own size, and with a label it is exposed as an
 * image with that name (and the click reaches the Actions panel).
 */
export const Playground: Story = {
  args: { size: 'lg', label: 'Errore', children: foreignSvg },
  play: async ({ args, canvasElement }) => {
    const icon = within(canvasElement).getByRole('img', { name: 'Errore' });
    const box = icon.getBoundingClientRect();
    await expect([box.width, box.height]).toEqual([24, 24]);
    await userEvent.click(icon);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** No label: the icon is decorative and absent from the accessibility tree. */
export const Decorative: Story = {
  args: { label: '', children: internalIcons.check },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('img')).toBeNull();
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  },
};

const cell = { display: 'grid', justifyItems: 'center', gap: 6 } as const;

/** The whole scale, the internal icons in every state colour, and an arbitrary 100x100 SVG. */
export const Overview: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 560, color: 'var(--color-rop-text)' }}>
      <section aria-label="Scale">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          {SIZES.map((size) => (
            <div key={size} style={cell}>
              <Icon size={size} data-testid={`icon-${size}`}>
                {internalIcons.info}
              </Icon>
              <Text variant="caption" as="span">
                {size}
              </Text>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Internal icons">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {NAMES.map((name) => (
            <div key={name} style={cell}>
              <Icon size="lg" data-testid={`internal-${name}`}>
                {internalIcons[name]}
              </Icon>
              <Text variant="caption" as="span" mono>
                {name}
              </Text>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Colour from the text">
        <div data-testid="colour-box" style={{ color: 'var(--color-rop-error)', display: 'flex', gap: 12 }}>
          <Icon size="lg" label="Errore" data-testid="icon-coloured">
            {internalIcons.error}
          </Icon>
          <Text as="span">Inherits currentColor</Text>
        </div>
      </section>

      <section aria-label="Arbitrary SVG">
        <div style={cell}>
          <Icon size="xl" data-testid="icon-arbitrary">
            {foreignSvg}
          </Icon>
          <Text variant="caption" as="span">
            100x100 SVG forced to xl
          </Text>
        </div>
      </section>
    </div>
  ),
};
