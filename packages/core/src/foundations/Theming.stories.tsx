import { useEffect, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { StatusBadge } from '../status-badge/StatusBadge';

// Showcase only: there is no theming API. Re-theming is plain CSS: redeclare the custom properties
// from styles/tokens.css on any element (here a wrapper <div>, in an app usually :root or a class)
// and everything inside follows. The switcher below just changes the inline `style` of the wrapper.

type PresetId = 'default' | 'violet' | 'forest' | 'custom';

interface Preset {
  label: string;
  /** Custom properties redeclared on the wrapper. Empty = the stylesheet defaults. */
  vars: Record<string, string>;
}

const PRESETS: Record<Exclude<PresetId, 'custom'>, Preset> = {
  default: { label: 'Default', vars: {} },
  violet: {
    label: 'Violet',
    vars: {
      '--color-rop-primary': '#6b3fa0',
      '--color-rop-info': '#6b3fa0',
      '--color-rop-text': '#2a1b3d',
      '--radius-rop-md': '1rem',
      '--radius-rop-sm': '0.75rem',
    },
  },
  forest: {
    label: 'Forest',
    vars: {
      '--color-rop-primary': '#1f6b3a',
      '--color-rop-info': '#1f6b3a',
      '--color-rop-border': '#6f8f7a',
      '--radius-rop-md': '0.125rem',
      '--radius-rop-sm': '0',
    },
  },
};

/** Black or white, whichever reads better on the given #rrggbb colour (WCAG relative luminance). */
function contrastOn(hex: string): string {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return lum > 0.179 ? '#000000' : '#ffffff';
}

const HEX = /^#[0-9a-f]{6}$/i;

function varsFor(preset: PresetId, custom: string): Record<string, string> {
  if (preset !== 'custom') return PRESETS[preset].vars;
  const hex = HEX.test(custom) ? custom : '#0a6ed1';
  return { '--color-rop-primary': hex, '--color-rop-info': hex, '--color-rop-primary-contrast': contrastOn(hex) };
}

interface ThemingDemoProps {
  preset: PresetId;
  customColor: string;
}

const row: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };

function ThemingDemo({ preset: initialPreset, customColor: initialColor }: ThemingDemoProps) {
  const [preset, setPreset] = useState<PresetId>(initialPreset);
  const [custom, setCustom] = useState(initialColor);
  // Keep the Controls panel in charge when the user changes an arg.
  useEffect(() => setPreset(initialPreset), [initialPreset]);
  useEffect(() => setCustom(initialColor), [initialColor]);

  const vars = varsFor(preset, custom);
  const css = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');

  return (
    <div style={{ maxWidth: 560, display: 'grid', gap: 24, fontFamily: 'var(--font-rop-sans)' }}>
      <fieldset style={{ ...row, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 8, fontWeight: 600 }}>Theme</legend>
        {(['default', 'violet', 'forest', 'custom'] as const).map((id) => (
          <label key={id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="radio" name="theme-preset" value={id} checked={preset === id} onChange={() => setPreset(id)} />
            {id === 'custom' ? 'Custom colour' : PRESETS[id].label}
          </label>
        ))}
        {preset === 'custom' ? (
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Primary
            <input type="color" value={HEX.test(custom) ? custom : '#0a6ed1'} onChange={(e) => setCustom(e.target.value)} />
          </label>
        ) : null}
      </fieldset>

      <div
        data-testid="themed-area"
        style={{
          ...(vars as CSSProperties),
          display: 'grid',
          gap: 16,
          padding: 16,
          border: '1px solid var(--color-rop-border-subtle)',
          borderRadius: 'var(--radius-rop-md)',
          background: 'var(--color-rop-surface)',
          color: 'var(--color-rop-text)',
        }}
      >
        <Field label="Supplier" help="Radius, border and primary colour follow the theme.">
          <Input defaultValue="Northwind Components" />
        </Field>
        <div style={row}>
          <Button variant="primary">Approve</Button>
          <Button variant="secondary">Cancel</Button>
          <StatusBadge tone="info" data-testid="themed-badge">Pending</StatusBadge>
          <StatusBadge tone="success">Approved</StatusBadge>
        </div>
      </div>

      <div>
        <small>CSS applied to the wrapper (no JavaScript theme provider):</small>
        <pre data-testid="theme-css" style={{ margin: '4px 0 0', fontFamily: 'var(--font-rop-mono)', fontSize: 'var(--text-rop-caption)' }}>
          {css ? `.my-theme {\n${css}\n}` : '/* stylesheet defaults: nothing redeclared */'}
        </pre>
      </div>
    </div>
  );
}

const meta = {
  title: 'Foundations/Theming',
  parameters: { layout: 'padded' },
  argTypes: {
    preset: { control: 'radio', options: ['default', 'violet', 'forest', 'custom'], description: 'Initial theme preset' },
    customColor: { control: 'color', description: 'Primary colour used by the "custom" preset' },
  },
  args: { preset: 'default', customColor: '#b4236b' },
  render: (args) => <ThemingDemo {...args} />,
} satisfies Meta<ThemingDemoProps>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Re-theme live: pick a preset or a custom primary colour and the Field, Buttons and StatusBadges
 * below change at once. Only CSS custom properties are redeclared (see `Foundations/Tokens` for the
 * full list); the components are the same.
 */
export const Switcher: Story = {
  tags: ['visual'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approve = canvas.getByRole('button', { name: 'Approve' });
    const before = getComputedStyle(approve).backgroundColor;
    await userEvent.click(canvas.getByRole('radio', { name: 'Violet' }));
    await expect(getComputedStyle(approve).backgroundColor).not.toBe(before);
    await expect(canvas.getByTestId('theme-css')).toHaveTextContent('--color-rop-primary: #6b3fa0');
    await userEvent.click(canvas.getByRole('radio', { name: 'Default' }));
    await expect(getComputedStyle(approve).backgroundColor).toBe(before);
  },
};
