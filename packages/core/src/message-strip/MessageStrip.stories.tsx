import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { MessageStrip, type MessageStripTone } from './MessageStrip';

const TONES: MessageStripTone[] = ['info', 'success', 'warning', 'error'];

const meta = {
  title: 'Primitives/MessageStrip',
  component: MessageStrip,
  parameters: { layout: 'padded' },
  argTypes: {
    tone: { control: 'radio', options: TONES },
    title: { control: 'text' },
    children: { control: 'text', description: 'The message, after the title.' },
    live: { control: 'boolean' },
    toneLabel: { control: 'text' },
    dismissLabel: { control: 'text' },
    onDismiss: { control: false },
  },
  args: { tone: 'info', live: true, children: 'The draft was saved automatically.' },
} satisfies Meta<typeof MessageStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: tone, title, content, live, labels. The play function checks what the tone Control
 * changes: the live role (`alert` for error, `status` otherwise) and the hidden tone name.
 */
export const Playground: Story = {
  args: {
    tone: 'error',
    title: 'Save failed',
    children: 'Check your connection and try again.',
    onDismiss: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const strip = canvas.getByRole('alert');
    await expect(strip).toHaveTextContent('Error: Save failed');
    await expect(strip).toHaveTextContent('Check your connection and try again.');
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss message: Save failed' }));
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
  },
};

/** Each key press on the close button calls `onDismiss` exactly once; the strip stays mounted. */
export const DismissCount: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    return <DismissCounter />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const count = canvas.getByTestId('dismiss-count');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await expect(count).toHaveTextContent('1');
    await userEvent.keyboard(' ');
    await expect(count).toHaveTextContent('2');
    await expect(canvas.getByRole('status')).toBeInTheDocument();
  },
};

function DismissCounter() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ maxWidth: 480 }}>
      <MessageStrip title="Dismiss count" onDismiss={() => setCount((c) => c + 1)} />
      <p>
        onDismiss called: <span data-testid="dismiss-count">{count}</span>
      </p>
    </div>
  );
}

function DismissibleDemo({ onDismiss, ...args }: ComponentProps<typeof MessageStrip>) {
  const [open, setOpen] = useState(true);
  return open ? (
    <MessageStrip
      {...args}
      onDismiss={() => {
        onDismiss?.();
        setOpen(false);
      }}
    />
  ) : (
    <p>Message dismissed.</p>
  );
}

/**
 * With `onDismiss` the strip shows a close button named after the title. The strip never hides
 * itself: here local state unmounts it, which is the consumer's job (and so is moving the focus).
 */
export const Dismissible: Story = {
  args: { tone: 'warning', title: 'Session expiring', children: 'Save your work within five minutes.', onDismiss: fn() },
  argTypes: { onDismiss: { control: false } },
  render: (args) => <DismissibleDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const close = canvas.getByRole('button', { name: 'Dismiss message: Session expiring' });
    await userEvent.tab();
    await expect(close).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
    await expect(canvas.getByText('Message dismissed.')).toBeInTheDocument();
  },
};

/** Two strips on one page: the close buttons are told apart by the title in their name. */
export const DistinctCloseNames: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
      <MessageStrip tone="error" title="Save failed" onDismiss={fn()}>
        Try again later.
      </MessageStrip>
      <MessageStrip tone="success" title="Profile updated" onDismiss={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const names = canvas.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    await expect(names).toEqual([
      'Dismiss message: Save failed',
      'Dismiss message: Profile updated',
    ]);
    await expect(canvas.getByRole('alert')).toBeInTheDocument();
    await expect(canvas.getByRole('status')).toBeInTheDocument();
  },
};

const stack = { display: 'grid', gap: 8, maxWidth: 520 } as const;

/**
 * Visual matrix: every tone with and without title and close button, title only, a stack of
 * strips (constant vertical gap), and a 280px strip with an unbreakable word.
 */
export const Overview: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 24, color: 'var(--color-rop-text)' }}>
      <section aria-label="Tones" style={stack} data-testid="tones">
        {TONES.map((tone) => (
          <MessageStrip key={tone} tone={tone} live={false} data-testid={`tone-${tone}`}>
            Message of type {tone}.
          </MessageStrip>
        ))}
      </section>

      <section aria-label="Titles and close" style={stack}>
        {TONES.map((tone) => (
          <MessageStrip
            key={tone}
            tone={tone}
            live={false}
            title={`Title ${tone}`}
            onDismiss={fn()}
            data-testid={`full-${tone}`}
          >
            Content with title and close button.
          </MessageStrip>
        ))}
        <MessageStrip tone="info" live={false} title="Title only" data-testid="title-only" />
        <MessageStrip tone="warning" live={false} title="Title only, with close button" onDismiss={fn()} />
      </section>

      <section aria-label="Stacked" style={{ maxWidth: 520 }}>
        <div style={{ display: 'grid', gap: 8 }} data-testid="stack">
          <MessageStrip tone="info" live={false}>
            First
          </MessageStrip>
          <MessageStrip tone="info" live={false}>
            Second
          </MessageStrip>
          <MessageStrip tone="info" live={false}>
            Third
          </MessageStrip>
        </div>
      </section>

      <section aria-label="Long text" data-testid="narrow" style={{ width: 280 }}>
        <MessageStrip tone="error" live={false} title="Very long word" onDismiss={fn()}>
          Supercalifragilisticexpialidociouswithanextrabittotestthelinebreakbehaviour and then some normal text that
          continues over several lines.
        </MessageStrip>
      </section>
    </div>
  ),
};
