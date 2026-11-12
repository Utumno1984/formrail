import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { CLASS_NAME_ARG, storyControl } from '../internal/story-docs';
import { Spinner, type SpinnerProps } from './Spinner';

interface DemoArgs extends SpinnerProps {
  /** Story-only: called when the simulated refresh finishes. */
  onLoaded: () => void;
}

/** A panel that loads data on "Refresh": the spinner shows while loading, then the data. */
function RefreshPanel({ onLoaded, ...spinner }: DemoArgs) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const refresh = () => {
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      setData(['Invoice 1001', 'Invoice 1002']);
      setLoading(false);
      onLoaded();
    }, 300);
  };
  return (
    <div style={{ display: 'grid', gap: 12, width: 320, maxWidth: '100%', color: 'var(--color-rop-text)' }}>
      <div>
        <Button variant="secondary" onClick={refresh}>
          Refresh
        </Button>
      </div>
      <div
        data-testid="panel"
        aria-busy={loading}
        style={{ minHeight: 56, border: '1px solid var(--color-rop-border-subtle)', borderRadius: 8, padding: 12 }}
      >
        {loading ? <Spinner {...spinner} /> : null}
        {!loading && data ? (
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {data.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {!loading && !data ? 'No data yet' : null}
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/Spinner',
  component: Spinner,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'radio', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    decorative: { control: 'boolean' },
    label: { control: 'text' },
    className: CLASS_NAME_ARG,
    onLoaded: storyControl({ control: false, description: 'Called once when the simulated load of the demo\'s "Refresh" ends.' }),
  },
  args: { size: 'md', decorative: false, label: 'Loading', onLoaded: fn() },
  render: (args) => <RefreshPanel {...args} />,
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: size, decorative, label. The play function clicks "Refresh": the spinner appears, its
 * status region says "Loading", and when the simulated load ends (`onLoaded` called once) the
 * spinner is gone and the panel shows the data.
 */
export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('status')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }));
    const status = await canvas.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Loading'));
    await waitFor(() => expect(args.onLoaded).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
    await expect(canvas.getByText('Invoice 1001')).toBeVisible();
  },
};

const row = { display: 'flex', alignItems: 'center', gap: 16, color: 'var(--color-rop-text)' } as const;

/** Visual: every size (decorative: the demo needs no regions). */
export const Sizes: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={row}>
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s) => (
        <Spinner key={s} size={s} decorative data-testid={`spinner-${s}`} />
      ))}
    </div>
  ),
};

/** Visual + e2e: inline with body text, the box does not shift the line. */
export const InlineWithText: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <p data-testid="line" className="m-0 font-rop-sans text-rop-body text-rop-text">
      Loading invoices <Spinner size="sm" decorative data-testid="inline-spinner" /> please wait
    </p>
  ),
};

/** Visual: white spinner on a primary background (inherits `currentColor`). */
export const OnPrimary: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div
      className="font-rop-sans text-rop-body"
      style={{
        ...row,
        padding: 16,
        background: 'var(--color-rop-primary)',
        color: 'var(--color-rop-primary-contrast)',
        width: 'fit-content',
      }}
    >
      <Spinner size="md" decorative data-testid="on-primary" />
      Saving
    </div>
  ),
};
