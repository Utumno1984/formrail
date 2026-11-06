import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { internalIcons } from '../internal/icons';
import { Text } from '../typography/Text';
import { Button, type ButtonIconSize, type ButtonTextSize, type ButtonVariant } from './Button';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const TEXT_SIZES: ButtonTextSize[] = ['sm', 'md', 'lg', 'inline'];
const ICON_SIZES: ButtonIconSize[] = ['icon-xs', 'icon-sm', 'icon-md'];

const meta = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'padded' },
  argTypes: {
    variant: { control: 'radio', options: VARIANTS },
    // `ButtonProps` is an intersection with a union (the icon sizes require an accessible name), which the
    // docgen cannot describe member by member: size, disabled and onClick are documented here.
    size: {
      control: 'select',
      options: [...TEXT_SIZES, ...ICON_SIZES],
      description:
        'Height scale (`sm` 32px, `md` 36px, `lg` 44px), `inline` (one text line, for use inside a paragraph) or a square icon-only size (`icon-xs` 24px, `icon-sm` 32px, `icon-md` 36px), which requires `aria-label` or `aria-labelledby`.',
      table: { type: { summary: "'sm' | 'md' | 'lg' | 'inline' | 'icon-xs' | 'icon-sm' | 'icon-md'" }, defaultValue: { summary: "'md'" } },
    },
    disabled: {
      control: 'boolean',
      description: 'Native `disabled`: not focusable, no click. With `asChild` it becomes `aria-disabled` and a blocked click.',
      table: { defaultValue: { summary: 'false' } },
    },
    onClick: { description: 'Click handler. Not called while the button is disabled.' },
    // Needs a single element child: not a Control (a text child would throw). See the AsLink story.
    asChild: { control: false },
    leadingIcon: { control: false },
    trailingIcon: { control: false },
    children: { control: 'text' },
  },
  args: { variant: 'secondary', size: 'md', disabled: false, children: 'Salva', onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Controls: variant, size, disabled, label. The play function drives what the Controls toggle: a
 * click reaches the Actions panel while enabled, and a disabled button receives neither focus from
 * Tab nor clicks.
 */
export const Playground: Story = {
  args: { variant: 'primary', children: 'Salva' },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Salva' });
    await expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    await expect(button).toHaveFocus();
  },
};

/** Disabled: native `disabled`, skipped by Tab, a click does not invoke `onClick`. */
export const Disabled: Story = {
  args: { disabled: true, children: 'Non disponibile' },
  render: (args) => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button {...args} />
      <Button variant="primary">Dopo</Button>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Non disponibile' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Non disponibile' }));
    await expect(args.onClick).not.toHaveBeenCalled();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Dopo' })).toHaveFocus();
  },
};

/** Icon-only: the accessible name is mandatory (type error otherwise, `console.error` in dev). */
export const IconOnly: Story = {
  args: { size: 'icon-md', 'aria-label': 'Chiudi', variant: 'ghost', children: internalIcons.close },
  argTypes: { children: { control: false }, size: { control: 'radio', options: ICON_SIZES } },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Chiudi' });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

/** `asChild`: the `<a>` is rendered with the Button classes; no nested `<button>`. */
export const AsLink: Story = {
  args: { variant: 'primary', asChild: true },
  // The render supplies the `<a>` child, so the `children` text control would not reach the DOM.
  parameters: { controls: { exclude: ['children'] } },
  render: (args) => (
    <Button {...args}>
      <a href="#destinazione" onClick={(e) => e.preventDefault()}>
        Vai al dettaglio
      </a>
    </Button>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: 'Vai al dettaglio' });
    await expect(canvas.queryByRole('button')).toBeNull();
    await userEvent.click(link);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

const row = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', alignContent: 'flex-start', gap: 12 } as const;

/**
 * Visual matrix: variants x text sizes (plus icons), the icon-only sizes, disabled and focus
 * states, `inline` inside a paragraph, a narrow container with a long label, and the accessible
 * name pitfall (two icon buttons whose names must differ).
 */
export const Overview: Story = {
  tags: ['visual'],
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 640, color: 'var(--color-rop-text)' }}>
      <section aria-label="Variants and sizes" style={{ display: 'grid', gap: 12 }}>
        {VARIANTS.map((variant) => (
          <div key={variant} style={{ display: 'grid', gap: 8 }}>
            <div style={row}>
              {(['sm', 'md', 'lg'] as const).map((size) => (
                <Button key={size} variant={variant} size={size} data-testid={`matrix-${variant}-${size}`}>
                  {variant} {size}
                </Button>
              ))}
              <Button variant={variant} leadingIcon={internalIcons.check} data-testid={`matrix-${variant}-lead`}>
                Con icona
              </Button>
              <Button variant={variant} trailingIcon={internalIcons['chevron-down']} data-testid={`matrix-${variant}-trail`}>
                Menu
              </Button>
            </div>
            {/* Own row: wrapping the icon-only sizes into the text-button row above produced orphan
                lines with one or two stray icons once the container ran out of width (#35). */}
            <div style={row}>
              {ICON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size} aria-label={`Chiudi ${variant} ${size}`}>
                  {internalIcons.close}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Disabled and focus" style={row}>
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant} disabled>
            {variant} disabled
          </Button>
        ))}
        <Button asChild disabled variant="primary">
          <a href="#x">Link disabled</a>
        </Button>
      </section>

      <section aria-label="Focus" style={{ ...row, overflow: 'hidden', width: 220, padding: 8, border: '1px dashed var(--color-rop-border)' }}>
        <Button data-testid="focus-target" variant="primary">
          Focus da tastiera
        </Button>
        {/* Static picture of the keyboard focus indicator (same declaration as :focus-visible). */}
        <Button variant="ghost" style={{ outline: '2px solid var(--color-rop-primary)', outlineOffset: 2 }}>
          Focus (baseline)
        </Button>
      </section>

      <section aria-label="Inline in text">
        <Text data-testid="inline-with">
          Il documento{' '}
          <Button size="inline" variant="ghost" data-testid="inline-button">
            richiede una modifica
          </Button>{' '}
          prima della conferma.
        </Text>
        <Text data-testid="inline-without">Il documento richiede una modifica prima della conferma.</Text>
      </section>

      <section aria-label="Consumer override" style={row}>
        {/* styles.css only contains the utilities the library uses. In a real app the host's own
            Tailwind build generates `h-12`; here that is simulated, in the same layer. */}
        <style>{'@layer rop.utilities { .h-12 { height: 3rem; } .h-8 { height: 2rem; } }'}</style>
        <Button className="h-8" data-testid="override-lower">
          Altezza h-8
        </Button>
        <Button className="h-12" data-testid="override-height">
          Altezza h-12
        </Button>
        <Button data-testid="no-override">Altezza md</Button>
      </section>

      <section aria-label="Long label" style={{ width: 160 }}>
        <Button size="sm" data-testid="long-label">
          Un'etichetta molto lunga che deve andare a capo senza sbordare dal bottone
        </Button>
      </section>

      <section aria-label="Accessible names" style={row}>
        <Button size="icon-sm" aria-label="Annulla selezione righe">
          {internalIcons.close}
        </Button>
        <Button size="icon-sm" aria-label="Annulla selezione filtri">
          {internalIcons.close}
        </Button>
        <Text variant="caption" as="span">
          Same icon, same effect on screen, different targets: the names must differ.
        </Text>
      </section>
    </div>
  ),
};

/**
 * `inline` in a container narrower than its label: the label never wraps (it stays one line tall)
 * and spills out of the button horizontally instead. Documented trade-off, covered by an e2e; not photographed.
 */
export const InlineNarrow: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div data-testid="narrow" style={{ width: 120, border: '1px dashed var(--color-rop-border)' }}>
      <Text>
        Vedi{' '}
        <Button size="inline" variant="ghost" data-testid="narrow-inline">
          {"un'etichetta inline molto lunga"}
        </Button>
      </Text>
    </div>
  ),
};

/**
 * Fixture for the `text-decoration` e2e (#115): inline with and without icons, every other size,
 * icon-only buttons and `asChild` links. Not photographed.
 */
export const TextDecoration: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div style={{ display: 'grid', gap: 12, color: 'var(--color-rop-text)' }}>
      <div style={row}>
        {(['sm', 'md', 'lg', 'inline'] as const).map((size) => (
          <Button key={size} size={size} variant="ghost" data-testid={`deco-${size}`}>
            {size} label
          </Button>
        ))}
      </div>
      <div style={row}>
        <Button size="inline" variant="ghost" leadingIcon={internalIcons.check} data-testid="deco-inline-lead">
          Inline lead
        </Button>
        <Button
          size="inline"
          variant="ghost"
          trailingIcon={internalIcons['chevron-down']}
          data-testid="deco-inline-trail"
        >
          Inline trail
        </Button>
      </div>
      <div style={row}>
        {ICON_SIZES.map((size) => (
          <Button key={size} size={size} variant="ghost" aria-label={`Close ${size}`} data-testid={`deco-${size}`}>
            {internalIcons.close}
          </Button>
        ))}
      </div>
      <div style={row}>
        <Button asChild size="inline" variant="ghost">
          <a href="#target" data-testid="deco-aschild-inline">
            Inline link
          </a>
        </Button>
        <Button asChild size="md" variant="ghost">
          <a href="#target" data-testid="deco-aschild-md">
            Medium link
          </a>
        </Button>
      </div>
    </div>
  ),
};
