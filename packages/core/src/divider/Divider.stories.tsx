import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Divider, type DividerSpacing } from './Divider';

const SPACINGS: DividerSpacing[] = ['none', 'sm', 'md', 'lg'];

const meta = {
  title: 'Primitives/Divider',
  component: Divider,
  parameters: { layout: 'padded' },
  argTypes: {
    orientation: { control: 'radio', options: ['horizontal', 'vertical'] },
    spacing: { control: 'radio', options: SPACINGS },
    decorative: { control: 'boolean' },
    className: { control: false },
  },
  args: { orientation: 'horizontal', spacing: 'md', decorative: false },
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

const text = { color: 'var(--color-rop-text)', fontFamily: 'var(--font-rop-sans)' } as const;

/**
 * Controls: orientation, spacing, decorative. The play function checks the separator exposed to
 * assistive technology (role, and orientation when vertical) and, with `decorative`, its absence.
 */
export const Playground: Story = {
  render: (args) => (
    <div
      style={{ ...text, display: 'flex', flexDirection: args.orientation === 'vertical' ? 'row' : 'column', height: args.orientation === 'vertical' ? 80 : undefined, maxWidth: 420 }}
    >
      <p style={{ margin: 0 }}>First block</p>
      <Divider {...args} data-testid="divider" />
      <p style={{ margin: 0 }}>Second block</p>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    if (args.decorative) {
      await expect(canvas.queryByRole('separator')).toBeNull();
      await expect(canvas.getByTestId('divider')).toHaveAttribute('aria-hidden', 'true');
      return;
    }
    const sep = canvas.getByRole('separator');
    if (args.orientation === 'vertical') await expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    else await expect(sep.tagName).toBe('HR');
    const rect = sep.getBoundingClientRect();
    await expect(args.orientation === 'vertical' ? rect.width : rect.height).toBe(1);
  },
};

interface ToolbarArgs {
  decorative: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
}

/**
 * A toolbar of three buttons separated by vertical dividers. The play function tabs through the
 * buttons (the dividers are skipped), checks the separators are vertical and as tall as the
 * toolbar, activates the buttons, and with `decorative` that no separator is exposed.
 */
export const Toolbar: StoryObj<ToolbarArgs> = {
  args: { decorative: false, onCut: fn(), onCopy: fn(), onPaste: fn() },
  argTypes: {
    decorative: { control: 'boolean' },
    onCut: { control: false },
    onCopy: { control: false },
    onPaste: { control: false },
  },
  render: ({ decorative, onCut, onCopy, onPaste }) => (
    <div role="toolbar" aria-label="Clipboard" data-testid="toolbar" style={{ display: 'flex', alignItems: 'center', gap: 0, width: 'fit-content', padding: 8, border: '1px solid var(--color-rop-border)' }}>
      <Button variant="ghost" onClick={onCut}>Cut</Button>
      <Divider orientation="vertical" spacing="sm" decorative={decorative} data-testid="sep" />
      <Button variant="ghost" onClick={onCopy}>Copy</Button>
      <Divider orientation="vertical" spacing="sm" decorative={decorative} data-testid="sep" />
      <Button variant="ghost" onClick={onPaste}>Paste</Button>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const cut = canvas.getByRole('button', { name: 'Cut' });
    const copy = canvas.getByRole('button', { name: 'Copy' });
    const paste = canvas.getByRole('button', { name: 'Paste' });
    await userEvent.tab();
    await expect(cut).toHaveFocus();
    await userEvent.tab();
    await expect(copy).toHaveFocus();
    await userEvent.tab();
    await expect(paste).toHaveFocus();
    const seps = canvas.getAllByTestId('sep');
    await expect(seps).toHaveLength(2);
    // The toolbar has 8px of padding: each divider is as tall as the buttons row (content box).
    const inner = canvas.getByTestId('toolbar');
    const rowHeight = cut.getBoundingClientRect().height;
    await expect(inner.getBoundingClientRect().height).toBeGreaterThanOrEqual(rowHeight);
    for (const sep of seps) await expect(Math.abs(sep.getBoundingClientRect().height - rowHeight)).toBeLessThanOrEqual(1);
    if (args.decorative) {
      await expect(canvas.queryAllByRole('separator')).toHaveLength(0);
    } else {
      for (const sep of canvas.getAllByRole('separator')) await expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    }
    await userEvent.click(cut);
    await userEvent.click(copy);
    await userEvent.click(paste);
    await expect(args.onCut).toHaveBeenCalledTimes(1);
    await expect(args.onCopy).toHaveBeenCalledTimes(1);
    await expect(args.onPaste).toHaveBeenCalledTimes(1);
  },
};

/** Visual: the four spacings of a horizontal divider. */
export const Spacings: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...text, maxWidth: 420 }}>
      {SPACINGS.map((spacing) => (
        <div key={spacing} data-testid={`spacing-${spacing}`}>
          <span>{`spacing="${spacing}"`}</span>
          <Divider spacing={spacing} />
        </div>
      ))}
      <span>End</span>
    </div>
  ),
};

/** Visual: vertical dividers in a toolbar. */
export const VerticalInToolbar: StoryObj<ToolbarArgs> = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div role="toolbar" aria-label="Formatting" data-testid="toolbar" style={{ display: 'flex', alignItems: 'center', width: 'fit-content', padding: 8, border: '1px solid var(--color-rop-border)' }}>
      <Button variant="ghost">Bold</Button>
      <Button variant="ghost">Italic</Button>
      <Divider orientation="vertical" />
      <Button variant="ghost">Left</Button>
      <Button variant="ghost">Right</Button>
      <Divider orientation="vertical" spacing="lg" />
      <Button variant="ghost">Clear</Button>
    </div>
  ),
};

/** Visual: decorative dividers (hidden from assistive technology), horizontal and vertical. */
export const Decorative: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...text, maxWidth: 420 }}>
      <span>Above</span>
      <Divider decorative data-testid="decorative-h" />
      <div style={{ display: 'flex', height: 40 }}>
        <span>Left</span>
        <Divider orientation="vertical" decorative data-testid="decorative-v" />
        <span>Right</span>
      </div>
    </div>
  ),
};

/** Edge cases (not visual): vertical outside a flex container, horizontal in a flex row. */
export const EdgeCases: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ ...text, maxWidth: 420 }}>
      <div data-testid="block">
        <Divider orientation="vertical" data-testid="vertical-block" />
      </div>
      <div data-testid="row" style={{ display: 'flex', width: 300 }}>
        <Divider data-testid="horizontal-row" />
      </div>
    </div>
  ),
};
