import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { ProgressBar, type ProgressBarProps } from './ProgressBar';

interface DemoArgs extends ProgressBarProps {
  /** Story-only: renders the indeterminate state regardless of `value`. */
  indeterminate: boolean;
  onComplete: () => void;
}

/** Simulated upload: +20 every 40 ms; `onComplete` fires once at 100. */
function UploadDemo({ indeterminate, onComplete, value, ...rest }: DemoArgs) {
  const [progress, setProgress] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const start = () => {
    clearInterval(timer.current);
    setProgress(0);
    let current = 0;
    timer.current = setInterval(() => {
      current = Math.min(100, current + 20);
      setProgress(current);
      if (current === 100) {
        clearInterval(timer.current);
        onComplete();
      }
    }, 40);
  };
  const shown = progress ?? (indeterminate ? null : value);
  return (
    <div style={{ display: 'grid', gap: 12, width: 360, maxWidth: '100%', color: 'var(--color-rop-text)' }}>
      <ProgressBar {...rest} value={shown} data-testid="bar" />
      <div>
        <Button variant="secondary" onClick={start}>
          Start upload
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'padded' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 }, description: 'Current value (min..max)' },
    indeterminate: { control: 'boolean', description: 'Story-only: render the indeterminate state' },
    tone: { control: 'radio', options: ['primary', 'success', 'error'] },
    label: { control: 'text' },
    min: { control: false },
    max: { control: false },
    getValueLabel: { control: false },
    className: { control: false },
    onComplete: { control: false },
  },
  args: {
    value: 45,
    indeterminate: false,
    tone: 'primary',
    label: 'Uploading invoices',
    onComplete: fn(),
  },
  render: (args) => <UploadDemo {...args} />,
} satisfies Meta<DemoArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: value, indeterminate, tone, label. The play function checks the initial value, starts
 * a simulated upload with a click on "Start upload", waits for 100% and checks the final
 * `aria-valuenow` / `aria-valuetext`, that `onComplete` ran once, and that the bar is not (and
 * does not contain) a live region.
 */
export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = canvas.getByRole('progressbar', { name: 'Uploading invoices' });
    await expect(bar).toHaveAttribute('aria-valuenow', '45');
    await expect(bar).toHaveAttribute('aria-valuetext', '45%');
    await userEvent.click(canvas.getByRole('button', { name: 'Start upload' }));
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '100'));
    await expect(bar).toHaveAttribute('aria-valuetext', '100%');
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0);
  },
};

const grid = { display: 'grid', gap: 16, maxWidth: 360, color: 'var(--color-rop-text)' } as const;

/** Visual: 0%, 45% and 100%. */
export const Values: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={grid}>
      <ProgressBar value={0} aria-label="Empty" data-testid="bar-0" />
      <ProgressBar value={45} aria-label="Partial" data-testid="bar-45" />
      <ProgressBar value={100} aria-label="Complete" data-testid="bar-100" />
    </div>
  ),
};

/** Visual: indeterminate (animations are switched off by the visual gate). */
export const Indeterminate: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={grid}>
      <ProgressBar aria-label="Preparing import" data-testid="bar" />
    </div>
  ),
};

/** Visual: the three tones, determinate. */
export const Tones: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={grid}>
      <ProgressBar value={60} tone="primary" aria-label="Primary" />
      <ProgressBar value={60} tone="success" aria-label="Success" />
      <ProgressBar value={60} tone="error" aria-label="Error" />
    </div>
  ),
};

/** Custom range and text: 3 of 7 files, with a visible label. */
export const CustomRange: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={grid}>
      <ProgressBar
        value={3}
        min={0}
        max={7}
        label="Importing files"
        getValueLabel={(value, max) => `${value} of ${max} files`}
        data-testid="bar"
      />
    </div>
  ),
};
