import { useEffect, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage } from '../breadcrumb/Breadcrumb';
import { Button } from '../button/Button';
import { Checkbox } from '../checkbox/Checkbox';
import { Field } from '../field/Field';
import { Input } from '../input/Input';
import { StatusBadge } from '../status-badge/StatusBadge';
import tokensCss from '../styles/tokens.css?raw';
import { Switch } from '../switch/Switch';
import { parseDerivedTokens } from '../utils/token-scale';

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

// The Violet preset plus the other base colours the derived states are computed from.
const SCOPED_VARS: Record<string, string> = {
  ...PRESETS.violet.vars,
  '--color-rop-error': '#b3125e',
  '--color-rop-surface-subtle': '#efe6f7',
  '--color-rop-text-muted': '#5d4a73',
};

const DERIVED_TOKENS = [...parseDerivedTokens(tokensCss).keys()];

interface ScopedDemoProps {
  onApprove: () => void;
  onDelete: () => void;
  onCheckedChange: (checked: boolean) => void;
}

const themedPanel: CSSProperties = {
  display: 'grid',
  gap: 16,
  padding: 16,
  border: '1px solid var(--color-rop-border-subtle)',
  borderRadius: 'var(--radius-rop-md)',
  background: 'var(--color-rop-surface)',
  color: 'var(--color-rop-text)',
};

function ScopedDerivedDemo({ onApprove, onDelete, onCheckedChange }: ScopedDemoProps) {
  return (
    <div style={{ maxWidth: 560, display: 'grid', gap: 24, fontFamily: 'var(--font-rop-sans)' }}>
      <div data-testid="scoped-theme" style={{ ...(SCOPED_VARS as CSSProperties), ...themedPanel }}>
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbLink href="#invoices">Invoices</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>INV-2026-00042</BreadcrumbPage>
          </BreadcrumbItem>
        </Breadcrumb>
        <div style={row}>
          <Button variant="primary" onClick={onApprove}>
            Approve
          </Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
        <div style={row}>
          <Checkbox defaultChecked onCheckedChange={onCheckedChange}>
            Paid
          </Checkbox>
          <Checkbox>Disputed</Checkbox>
          <Switch defaultChecked>Reminders</Switch>
        </div>
        <Field label="Supplier" state="locked" stateReason="Locked once the invoice is approved.">
          <Input defaultValue="Northwind Components" />
        </Field>
        <Field label="Payment terms" state="forced" stateReason="Decided by the framework agreement.">
          <Checkbox defaultChecked>Net 30</Checkbox>
        </Field>
        <div data-testid="nested-theme" style={{ ...(PRESETS.forest.vars as CSSProperties), ...themedPanel }}>
          <small>A theme inside a theme: the closest scope wins.</small>
          <Button variant="primary">Approve nested</Button>
        </div>
      </div>
      <div style={{ ...themedPanel, justifyItems: 'start' }}>
        <small>Outside the wrapper: the default theme.</small>
        <Button variant="primary">Approve outside</Button>
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

/**
 * Only the base colours are redeclared on the wrapper (the Violet preset, plus error and the neutral
 * surfaces), and every state derived from them follows on the elements inside: hover, pressed and
 * read-only shades are computed where they are used, not on `:root`. A wrapper inside the wrapper
 * takes the closest theme; the Button outside keeps the default one.
 *
 * The `play` function proves what a script can prove: the derived tokens stay unset, the resting and
 * selected states use the scoped colours, the callbacks fire. A script cannot trigger the CSS `:hover`
 * or `:active`, and the hover style needs a real precise pointer: the hover and pressed colours are
 * proved with a real mouse in `e2e/theming-scoped.spec.ts`.
 */
export const ScopedDerivedStates: StoryObj<ScopedDemoProps> = {
  tags: ['visual'],
  parameters: { controls: { exclude: ['preset', 'customColor'] } },
  args: { onApprove: fn(), onDelete: fn(), onCheckedChange: fn() },
  render: (args) => <ScopedDerivedDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const area = getComputedStyle(canvas.getByTestId('scoped-theme'));
    await expect(DERIVED_TOKENS.length).toBeGreaterThan(0);
    for (const token of DERIVED_TOKENS) await expect(area.getPropertyValue(token)).toBe('');
    await expect(area.getPropertyValue('--color-rop-primary')).toBe('#6b3fa0');

    const violet = 'rgb(107, 63, 160)';
    const approve = canvas.getByRole('button', { name: 'Approve' });
    const paid = canvas.getByRole('checkbox', { name: 'Paid' });
    await expect(getComputedStyle(approve).backgroundColor).toBe(violet);
    await expect(getComputedStyle(paid).backgroundColor).toBe(violet);
    await expect(getComputedStyle(canvas.getByRole('switch', { name: 'Reminders' })).backgroundColor).toBe(violet);
    await expect(getComputedStyle(canvas.getByRole('button', { name: 'Approve nested' })).backgroundColor).toBe('rgb(31, 107, 58)');
    await expect(getComputedStyle(canvas.getByRole('button', { name: 'Approve outside' })).backgroundColor).toBe('rgb(10, 110, 209)');
    await expect(getComputedStyle(canvas.getByRole('textbox', { name: /Supplier/ })).backgroundColor).toBe('rgb(239, 230, 247)');

    await userEvent.click(approve);
    await expect(args.onApprove).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Delete' }));
    await expect(args.onDelete).toHaveBeenCalledTimes(1);

    // Toggled off and back on: the selected fill comes back with the scoped colour.
    await userEvent.click(paid);
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(paid);
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(getComputedStyle(paid).backgroundColor).toBe(violet));
    paid.blur();
  },
};
