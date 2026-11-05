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
    children: { control: 'text' },
    live: { control: 'boolean' },
    toneLabel: { control: 'text' },
    dismissLabel: { control: 'text' },
    onDismiss: { control: false },
  },
  args: { tone: 'info', live: true, children: 'La bozza è stata salvata automaticamente.' },
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
    title: 'Salvataggio non riuscito',
    children: 'Controlla la connessione e riprova.',
    onDismiss: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const strip = canvas.getByRole('alert');
    await expect(strip).toHaveTextContent('Error: Salvataggio non riuscito');
    await expect(strip).toHaveTextContent('Controlla la connessione e riprova.');
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss message: Salvataggio non riuscito' }));
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
      <MessageStrip title="Conteggio chiusure" onDismiss={() => setCount((c) => c + 1)} />
      <p>
        onDismiss chiamato: <span data-testid="dismiss-count">{count}</span>
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
    <p>Messaggio chiuso.</p>
  );
}

/**
 * With `onDismiss` the strip shows a close button named after the title. The strip never hides
 * itself: here local state unmounts it, which is the consumer's job (and so is moving the focus).
 */
export const Dismissible: Story = {
  args: { tone: 'warning', title: 'Sessione in scadenza', children: 'Salva il lavoro entro cinque minuti.', onDismiss: fn() },
  argTypes: { onDismiss: { control: false } },
  render: (args) => <DismissibleDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const close = canvas.getByRole('button', { name: 'Dismiss message: Sessione in scadenza' });
    await userEvent.tab();
    await expect(close).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
    await expect(canvas.getByText('Messaggio chiuso.')).toBeInTheDocument();
  },
};

/** Two strips on one page: the close buttons are told apart by the title in their name. */
export const DistinctCloseNames: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
      <MessageStrip tone="error" title="Salvataggio non riuscito" onDismiss={fn()}>
        Riprova più tardi.
      </MessageStrip>
      <MessageStrip tone="success" title="Profilo aggiornato" onDismiss={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const names = canvas.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    await expect(names).toEqual([
      'Dismiss message: Salvataggio non riuscito',
      'Dismiss message: Profilo aggiornato',
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
            Messaggio di tipo {tone}.
          </MessageStrip>
        ))}
      </section>

      <section aria-label="Titles and close" style={stack}>
        {TONES.map((tone) => (
          <MessageStrip
            key={tone}
            tone={tone}
            live={false}
            title={`Titolo ${tone}`}
            onDismiss={fn()}
            data-testid={`full-${tone}`}
          >
            Contenuto con titolo e chiusura.
          </MessageStrip>
        ))}
        <MessageStrip tone="info" live={false} title="Solo titolo" data-testid="title-only" />
        <MessageStrip tone="warning" live={false} title="Solo titolo, con chiusura" onDismiss={fn()} />
      </section>

      <section aria-label="Stacked" style={{ maxWidth: 520 }}>
        <div style={{ display: 'grid', gap: 8 }} data-testid="stack">
          <MessageStrip tone="info" live={false}>
            Primo
          </MessageStrip>
          <MessageStrip tone="info" live={false}>
            Secondo
          </MessageStrip>
          <MessageStrip tone="info" live={false}>
            Terzo
          </MessageStrip>
        </div>
      </section>

      <section aria-label="Long text" data-testid="narrow" style={{ width: 280 }}>
        <MessageStrip tone="error" live={false} title="Parola lunghissima" onDismiss={fn()}>
          Supercalifragilistichespiralidosoeancheunpocodipiùperverificareilcapoefinedellariga e poi un testo normale che
          prosegue su più righe.
        </MessageStrip>
      </section>
    </div>
  ),
};
