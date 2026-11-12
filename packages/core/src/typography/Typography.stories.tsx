import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Icon } from '../icon/Icon';
import { Input } from '../input/Input';
import { exampleStory } from '../internal/example-story';
import { internalIcons } from '../internal/icons';
import { Text } from './Text';
import { Title } from './Title';

// The page documents Text (component) AND Title (subcomponent); each story types its own args.
const meta = {
  title: 'Foundations/Typography',
  component: Text,
  subcomponents: { Title },
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
type TextStory = StoryObj<typeof Text>;
type TitleStory = StoryObj<typeof Title>;

export const Example: Story = { tags: ['example', '!visual'], ...exampleStory('Typography.example.tsx') };

/**
 * Controls drive every prop of `Text`. The play function proves that the HTML props reach the
 * element (click -> Actions panel) and that `mono` is independent of the variant: a caption in
 * monospace keeps the caption size and switches only the family.
 */
export const TextPlayground: TextStory = {
  tags: ['playground'],
  argTypes: {
    variant: { control: 'radio', options: ['body', 'caption', 'label'] },
    as: { control: 'select', options: ['p', 'span', 'div', 'label'] },
    mono: { control: 'boolean' },
    children: { control: 'text', description: 'The text.' },
    onClick: { description: 'Any HTML attribute of the element is passed through (here `onClick`, logged in Actions).' },
  },
  args: { variant: 'caption', as: 'p', mono: true, children: 'INV-2026-00042', onClick: fn() },
  render: (args) => <Text {...args} />,
  play: async ({ args, canvasElement }) => {
    const text = within(canvasElement).getByText('INV-2026-00042');
    await userEvent.click(text);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    const cs = getComputedStyle(text);
    await expect(cs.fontFamily).toContain('monospace');
    await expect(cs.fontSize).toBe('12px');
  },
};

/** Controls for `Title`: `level` (semantics) and `size` (scale) are independent. */
export const TitlePlayground: TitleStory = {
  argTypes: {
    level: { control: 'select', options: [1, 2, 3, 4, 5, 6] },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
    children: { control: 'text', description: 'The heading text.' },
    onClick: { description: 'Any HTML attribute of the heading is passed through (here `onClick`, logged in Actions).' },
  },
  args: { level: 1, size: 'sm', children: 'Invoice approvals', onClick: fn() },
  render: (args) => <Title {...args} />,
  play: async ({ args, canvasElement }) => {
    const title = within(canvasElement).getByRole('heading', { level: 1, name: 'Invoice approvals' });
    await userEvent.click(title);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    // h1 with the small scale: the level does not decide the size.
    await expect(getComputedStyle(title).fontSize).toBe('16px');
  },
};

const row = { display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'baseline', gap: 12, margin: '0 0 8px' } as const;

/** Every typographic variant, the heading scale, and identifiers in monospace (visual baseline). */
export const Overview: Story = {
  tags: ['visual'],
  render: () => (
    <div style={{ maxWidth: 640, color: 'var(--color-rop-text)' }}>
      <section aria-labelledby="ty-text" style={{ marginBottom: 24 }}>
        <Title level={2} size="sm" id="ty-text" style={{ marginBottom: 12 }}>
          Text
        </Title>
        {(['body', 'caption', 'label'] as const).map((variant) => (
          <div key={variant} style={row}>
            <Text variant="caption" as="span" style={{ color: 'var(--color-rop-text-muted)' }}>
              {variant}
            </Text>
            <Text variant={variant} data-testid={`text-${variant}`}>
              The quick brown fox jumps over the lazy dog
            </Text>
          </div>
        ))}
      </section>

      <section aria-labelledby="ty-mono" style={{ marginBottom: 24 }}>
        <Title level={2} size="sm" id="ty-mono" style={{ marginBottom: 12 }}>
          Monospace identifiers
        </Title>
        {(['body', 'caption', 'label'] as const).map((variant) => (
          <div key={variant} style={row}>
            <Text variant="caption" as="span" style={{ color: 'var(--color-rop-text-muted)' }}>
              {variant}
            </Text>
            <Text variant={variant} mono data-testid={`mono-${variant}`}>
              INV-2026-00042 / 0O1lI
            </Text>
          </div>
        ))}
      </section>

      <section aria-labelledby="ty-title" style={{ marginBottom: 24 }}>
        <Title level={2} size="sm" id="ty-title" style={{ marginBottom: 12 }}>
          Title
        </Title>
        {(['lg', 'md', 'sm'] as const).map((size) => (
          <Title key={size} level={3} size={size} data-testid={`title-${size}`} style={{ marginBottom: 8 }}>
            Title {size}
          </Title>
        ))}
        <Title level={1} size="sm" data-testid="title-h1-sm">
          h1 with the small scale
        </Title>
      </section>

      <section aria-labelledby="ty-inline">
        <Title level={2} size="sm" id="ty-inline" style={{ marginBottom: 12 }}>
          Icon inside a caption line
        </Title>
        <Text variant="caption" data-testid="caption-plain">
          Caption line without icon
        </Text>
        <Text variant="caption" data-testid="caption-with-icon">
          <Icon size="sm">{internalIcons.info}</Icon> Caption line with an inline icon
        </Text>
        <Text variant="caption">Next line</Text>
      </section>
    </div>
  ),
};

/** `as="label"` + `htmlFor` reach the DOM: clicking the label focuses its field. */
export const AsLabel: TextStory = {
  args: { as: 'label', variant: 'label', htmlFor: 'ty-field', children: 'Supplier code' },
  render: (args) => (
    <div style={{ display: 'grid', gap: 4, maxWidth: 240 }}>
      <Text {...args} />
      <Input id="ty-field" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Supplier code'));
    await expect(canvas.getByRole('textbox', { name: 'Supplier code' })).toHaveFocus();
  },
};
