import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Text } from '../typography/Text';
import { Title } from '../typography/Title';
import { CLASS_NAME_ARG, storyControl } from '../internal/story-docs';
import { Skeleton, type SkeletonProps, type SkeletonTextVariant } from './Skeleton';

interface DemoArgs extends SkeletonProps {
  onLoad: () => void;
  /** Story-only: start with the content already loaded. */
  loaded?: boolean;
}

const cardStyle = {
  display: 'grid',
  gap: 12,
  width: 360,
  maxWidth: '100%',
  // No Tailwind preflight in this package: boxes are `content-box`, so without this the padding and
  // border add 34px on top of `max-width: 100%`. `min-width: 0` lets the grid item shrink below its
  // content (a `minmax(0, 1fr)` track alone does not).
  boxSizing: 'border-box',
  minWidth: 0,
  padding: 16,
  border: '1px solid var(--color-rop-border)',
  borderRadius: 8,
  color: 'var(--color-rop-text)',
} as const;

/**
 * The container carries the loading state (`aria-busy`); the skeletons are decorative and hidden
 * from assistive technology.
 */
function CardDemo({ onLoad, loaded: initiallyLoaded = false, variant, textVariant, lines, width, height }: DemoArgs) {
  const [loaded, setLoaded] = useState(initiallyLoaded);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <section data-testid="card" aria-busy={!loaded} aria-label="Invoice summary" style={cardStyle}>
        {loaded ? (
          <>
            <Title level={3}>Invoice 2024-0042</Title>
            <Text>Paid on 12 March by Acme Corp. Net amount EUR 1,250.00.</Text>
            <Text variant="caption">Last updated 2 minutes ago</Text>
          </>
        ) : (
          <>
            <Skeleton textVariant="title-sm" width="60%" />
            <Skeleton variant={variant} textVariant={textVariant} lines={lines} width={width} height={height} />
            <Skeleton textVariant="caption" width="40%" />
          </>
        )}
      </section>
      <div>
        <Button
          variant="secondary"
          disabled={loaded}
          onClick={() => {
            setLoaded(true);
            onLoad();
          }}
        >
          Load
        </Button>
      </div>
    </div>
  );
}

const TEXT_VARIANTS: SkeletonTextVariant[] = ['body', 'caption', 'label', 'title-sm', 'title-md', 'title-lg'];

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
  argTypes: {
    variant: { control: 'radio', options: ['text', 'rect', 'circle'] },
    textVariant: { control: 'select', options: TEXT_VARIANTS },
    lines: { control: { type: 'range', min: 0, max: 6, step: 1 } },
    width: { control: 'number' },
    height: { control: 'number' },
    className: CLASS_NAME_ARG,
    onLoad: storyControl({ control: false, description: 'Called once when the simulated load of the demo card ends (the skeleton gives way to the content).' }),
  },
  args: { variant: 'text', textVariant: 'body', lines: 3, onLoad: fn() },
  render: (args) => <CardDemo {...(args as DemoArgs)} />,
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A Skeleton is decorative: it is `aria-hidden` and never announces anything. Loading is
 * communicated on the container with `aria-busy="true"` (or with a Spinner / visible text). The play
 * function clicks "Load": the skeletons are replaced by the real content, the container goes from
 * `aria-busy="true"` to `"false"` and its height does not change.
 */
export const Playground: Story = {
  args: { textVariant: 'body', lines: 2 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId('card');
    await expect(card).toHaveAttribute('aria-busy', 'true');
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton-shape]').length).toBeGreaterThan(0);
    for (const s of canvasElement.querySelectorAll('[data-rop-skeleton-shape]')) {
      await expect(s).toHaveAttribute('aria-hidden', 'true');
    }
    const before = card.getBoundingClientRect().height;
    await userEvent.click(canvas.getByRole('button', { name: 'Load' }));
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await expect(canvasElement.querySelectorAll('[data-rop-skeleton-shape]')).toHaveLength(0);
    await expect(canvas.getByText('Invoice 2024-0042')).toBeVisible();
    await expect(args.onLoad).toHaveBeenCalledTimes(1);
    await expect(Math.abs(card.getBoundingClientRect().height - before)).toBeLessThanOrEqual(0.5);
  },
};

// `minmax(0, 1fr)` columns: an implicit `auto` grid track would size to the fixed-width children
// and overflow a narrow viewport instead of honouring `max-width: 100%`.
const sheet = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 24,
  maxWidth: 480,
  boxSizing: 'border-box',
  minWidth: 0,
  color: 'var(--color-rop-text)',
} as const;
const pair = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 16,
  alignItems: 'start',
  minWidth: 0,
} as const;

/**
 * Visual: for every `textVariant`, 1 and 3 lines, each next to the real text of the same step
 * (the heights match).
 */
export const TextVariants: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={sheet}>
      {TEXT_VARIANTS.map((v) => {
        const Real = ({ children }: { children: string }) =>
          v.startsWith('title-') ? (
            <Title level={3} size={v.slice(6) as 'sm' | 'md' | 'lg'}>
              {children}
            </Title>
          ) : (
            <Text variant={v as 'body' | 'caption' | 'label'}>{children}</Text>
          );
        return (
          <div key={v} style={pair} data-testid={`row-${v}`}>
            <div style={{ display: 'grid', gap: 8 }}>
              <Skeleton textVariant={v} />
              <Skeleton textVariant={v} lines={3} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Real>{v}</Real>
              <Real>{`${v} second line`}</Real>
            </div>
          </div>
        );
      })}
    </div>
  ),
};

/** Visual: rectangle and circle (number and CSS-string sizes). */
export const Shapes: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={sheet}>
      <Skeleton variant="rect" height={96} />
      <Skeleton variant="rect" width="50%" height="2rem" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Skeleton variant="circle" width={24} />
        <Skeleton variant="circle" width={40} />
        <Skeleton variant="circle" height="4rem" />
      </div>
    </div>
  ),
};

/** Visual: the demo card before loading. */
export const DemoNotLoaded: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => <CardDemo onLoad={() => {}} lines={2} />,
};

/** Visual: the demo card after loading (same height as before). */
export const DemoLoaded: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => <CardDemo onLoad={() => {}} lines={2} loaded />,
};
