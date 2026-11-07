import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { DescriptionList, DescriptionListItem } from '../description-list/DescriptionList';
import { internalIcons } from '../internal/icons';
import { Text } from '../typography/Text';
import { StatusBadge, type StatusBadgeProps, type StatusBadgeTone } from './StatusBadge';

const TONES: StatusBadgeTone[] = ['neutral', 'info', 'success', 'warning', 'error'];
const ICON_NAMES = ['none', 'info', 'success', 'warning', 'error'] as const;
const ICONS = {
  none: undefined,
  info: internalIcons.info,
  success: internalIcons.success,
  warning: internalIcons.warning,
  error: internalIcons.error,
};
const LONG = 'Archived, awaiting approval from the department manager';

interface DemoArgs extends StatusBadgeProps {
  /** Width of the demo container, px (story-only control). */
  width: number;
}

const meta = {
  title: 'Primitives/StatusBadge',
  component: StatusBadge,
  parameters: { layout: 'padded' },
  argTypes: {
    tone: { control: 'radio', options: TONES },
    children: { control: 'text' },
    icon: { control: 'select', options: ICON_NAMES, mapping: ICONS },
    width: { control: { type: 'range', min: 80, max: 400, step: 10 }, description: 'Demo container width (px)' },
    className: { control: false },
  },
  args: { tone: 'neutral', children: 'Archived', icon: undefined, width: 300 },
  render: ({ width, ...args }) => (
    <div data-testid="container" style={{ width }}>
      <StatusBadge {...args} data-testid="badge" />
    </div>
  ),
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: tone, text, icon, container width. The play function checks that the badge is static
 * (no live role, no `aria-live`) and decorative-icon-only: the text is its whole accessible content.
 */
export const Playground: Story = {
  args: { tone: 'warning', icon: internalIcons.warning },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(canvas.queryByRole('alert')).toBeNull();
    const badge = canvas.getByTestId('badge');
    await expect(badge).not.toHaveAttribute('aria-live');
    await expect(badge).not.toHaveAttribute('role');
    await expect(badge.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    await expect(badge).toHaveTextContent('Archived');
  },
};

/**
 * A long text rendered by the component (through `children`), then the container is narrowed to
 * 100px: the badge stays inside it, is clipped (ellipsis) on one line and its text content is still
 * the whole text. The width Control keeps working on top of it.
 */
export const NarrowLongText: Story = {
  args: { tone: 'info', icon: internalIcons.info, children: LONG, width: 300 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByTestId('badge');
    const label = badge.lastElementChild as HTMLElement;
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(canvas.queryByRole('alert')).toBeNull();
    const container = canvas.getByTestId('container');
    container.style.width = '100px';
    await expect(badge.getBoundingClientRect().width).toBeLessThanOrEqual(100);
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
    await expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
    await expect(getComputedStyle(label).whiteSpace).toBe('nowrap');
    await expect(badge).toHaveTextContent(LONG);
  },
};

const stack = { display: 'grid', gap: 12, maxWidth: 520, color: 'var(--color-rop-text)' } as const;
const row = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } as const;

/**
 * Visual matrix: five tones with and without icon, a badge inside a line of body text, a truncated
 * badge in a 120px container, and as the value of a DescriptionList (inline and stacked).
 */
export const Overview: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 24, color: 'var(--color-rop-text)' }}>
      <section aria-label="Tones" style={stack}>
        <div style={row} data-testid="tones">
          {TONES.map((tone) => (
            <StatusBadge key={tone} tone={tone} data-testid={`tone-${tone}`}>
              {tone}
            </StatusBadge>
          ))}
        </div>
        <div style={row} data-testid="tones-icon">
          {TONES.map((tone) => (
            <StatusBadge
              key={tone}
              tone={tone}
              icon={tone === 'neutral' ? internalIcons.info : internalIcons[tone]}
              data-testid={`tone-icon-${tone}`}
            >
              {tone}
            </StatusBadge>
          ))}
        </div>
      </section>

      <section aria-label="In a text line" style={stack}>
        <Text data-testid="line-with-badge">
          Record status: <StatusBadge tone="warning" data-testid="line-badge">Archived</StatusBadge> by Mario Rossi.
        </Text>
        <Text data-testid="line-plain">Record status: Archived by Mario Rossi.</Text>
      </section>

      <section aria-label="Truncated" style={{ width: 120 }} data-testid="narrow">
        <StatusBadge tone="info" icon={internalIcons.info} data-testid="narrow-badge">
          {LONG}
        </StatusBadge>
      </section>

      <section aria-label="In a description list" style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
        {(['inline', 'stacked'] as const).map((layout) => (
          <DescriptionList key={layout} layout={layout} data-testid={`dl-${layout}`}>
            <DescriptionListItem label="Customer">Acme S.r.l.</DescriptionListItem>
            <DescriptionListItem label="Status">
              <StatusBadge tone="success" data-testid={`dl-badge-${layout}`}>
                Active
              </StatusBadge>
            </DescriptionListItem>
          </DescriptionList>
        ))}
      </section>
    </div>
  ),
};
