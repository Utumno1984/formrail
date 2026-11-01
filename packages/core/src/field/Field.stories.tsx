import { useState, type ButtonHTMLAttributes, type ChangeEvent } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Input } from '../input/Input';
import { Field, type FieldStateProps } from './Field';
import type { FieldControlProps, FieldState } from './FieldContext';
import { useFieldControl } from './useFieldControl';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

interface PlaygroundArgs {
  label: string;
  name: string;
  help: string;
  error: string;
  required: boolean;
  hideLabel: boolean;
  state: FieldState;
  stateReason: string;
  placeholder: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

const meta: Meta<PlaygroundArgs> = {
  title: 'Forms/Field',
  parameters: { layout: 'padded' },
  argTypes: {
    label: { control: 'text' },
    name: { control: 'text', description: 'Nome logico: data-rop-name sul controllo (e name nativo su Input/Combobox)' },
    help: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    hideLabel: { control: 'boolean', description: 'Etichetta nascosta alla vista, ma nome accessibile del campo' },
    // forced = value decided by a business rule; locked = not editable (permissions / record status).
    // Same interaction: focusable, read-only, reason read by the screen reader.
    state: { control: 'radio', options: STATES },
    stateReason: { control: 'text' },
    placeholder: { control: 'text' },
    onChange: { control: false },
  },
  args: {
    label: 'Ragione sociale',
    name: 'ragioneSociale',
    help: '',
    error: '',
    required: false,
    hideLabel: false,
    state: 'default',
    stateReason: '',
    placeholder: 'Es. Rossi S.r.l.',
    onChange: fn(),
  },
};

export default meta;
type Story = StoryObj<PlaygroundArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 360 } as const;

/** `forced`/`locked` need a reason in the type; the Controls hand over plain strings. */
const stateProps = (state: FieldState, stateReason: string) => ({ state, stateReason }) as FieldStateProps;

/**
 * Controls: label, help, error, required, state and its reason. The play function types in the
 * input, then checks what the Controls wire up: the accessible name, the typed value reaching
 * `onChange` (Actions panel) and the description built from help.
 */
export const Playground: Story = {
  args: { help: 'Come appare in fattura.' },
  render: ({ label, name, help, error, required, hideLabel, state, stateReason, placeholder, onChange }) => (
    <div style={column}>
      <Field label={label} name={name} help={help} error={error} required={required} hideLabel={hideLabel} {...stateProps(state, stateReason)}>
        <Input placeholder={placeholder} onChange={onChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Ragione sociale' });
    await userEvent.type(input, 'Acme');
    await expect(input).toHaveValue('Acme');
    await expect(args.onChange).toHaveBeenCalledTimes(4);
    await expect(input).toHaveAccessibleDescription('Come appare in fattura.');
    // The `name` control reaches the control as `data-rop-name` (and the native `name`).
    await expect(input).toHaveAttribute('data-rop-name', args.name);
    await expect(input).toHaveAttribute('name', args.name);
  },
};

/**
 * A forced field: focusable, never editable. The play function tabs onto it, types, presses
 * Backspace and checks that the value is the same and `onChange` never ran. The reason is part of
 * the accessible description.
 */
export const Forced: Story = {
  args: { state: 'forced', stateReason: 'Valore imposto dal listino del cliente.' },
  render: ({ label, state, stateReason, onChange }) => (
    <div style={column}>
      <Field label={label} {...stateProps(state, stateReason)}>
        <Input value="Listino A" onChange={onChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    const input = canvas.getByRole('textbox', { name: 'Ragione sociale' });
    await expect(input).toHaveFocus();
    await userEvent.keyboard('abc{Backspace}');
    await expect(input).toHaveValue('Listino A');
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(input).toHaveAccessibleDescription('Valore imposto dal listino del cliente.');
  },
};

/** A forced `type="number"`: arrow keys and the mouse wheel must not step the value. */
export const ForcedNumber: Story = {
  args: { label: 'Quantità', state: 'forced', stateReason: 'Fissata dal contratto quadro.' },
  render: ({ label, state, stateReason, onChange }) => (
    <div style={column}>
      <Field label={label} {...stateProps(state, stateReason)}>
        <Input type="number" value={5} onChange={onChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole('spinbutton', { name: 'Quantità' });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}');
    await expect(input).toHaveValue(5);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

function LoadData({ onChange }: { onChange: PlaygroundArgs['onChange'] }) {
  const [value, setValue] = useState('');
  return (
    <div style={column}>
      <Field label="Ragione sociale">
        <Input
          value={value}
          onChange={(event) => {
            onChange(event);
            setValue(event.target.value);
          }}
        />
      </Field>
      <Button onClick={() => setValue('Acme S.p.A.')}>Carica dati</Button>
    </div>
  );
}

/**
 * Hydration: "Carica dati" sets `value` from outside after mount. The input shows it and the
 * Actions panel stays empty (no `onChange`); typing afterwards is a real change and does log.
 */
export const ExternalValue: Story = {
  render: ({ onChange }) => <LoadData onChange={onChange} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Carica dati' }));
    const input = canvas.getByRole('textbox', { name: 'Ragione sociale' });
    await expect(input).toHaveValue('Acme S.p.A.');
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.type(input, '!');
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

/**
 * Fixture, not a public component: a switch built on a plain `<button>`. It gets the Field props by
 * spread and reads the non-enumerable `interactionBlocked` to refuse Space / Enter / click.
 */
function FixtureToggle({ control, ...rest }: { control: FieldControlProps } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [on, setOn] = useState(false);
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={on}
      data-testid="fixture-toggle"
      onClick={() => {
        if (!control.interactionBlocked) setOn((v) => !v);
      }}
      style={{ width: 'fit-content', padding: '4px 12px', border: '1px solid var(--color-rop-border)' }}
    >
      {on ? 'Sì' : 'No'}
    </button>
  );
}

function HookToggle() {
  const control = useFieldControl();
  return <FixtureToggle control={control} {...control} />;
}

/**
 * Render-prop to wire a control that is not an `Input`. Locked: Space, Enter and click leave it
 * off; the reason is its accessible description. `control.interactionBlocked` and `control.state`
 * are readable but do not travel through `{...control}`.
 */
export const RenderPropLocked: Story = {
  render: () => (
    <div style={column}>
      <Field label="Attivo" state="locked" stateReason="Gestito dall'amministratore">
        {(control) => <FixtureToggle control={control} {...control} />}
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Attivo' });
    await userEvent.click(toggle);
    toggle.focus();
    await userEvent.keyboard(' {Enter}');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAccessibleDescription("Gestito dall'amministratore");
  },
};

/** The same wiring through `useFieldControl()` called in a child of the Field; here it is not blocked. */
export const HookToggleEnabled: Story = {
  render: () => (
    <div style={column}>
      <Field label="Notifiche">
        <HookToggle />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const toggle = within(canvasElement).getByRole('switch', { name: 'Notifiche' });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  },
};

/**
 * Keyboard-safe fixture (spec §1.10): the field is the last thing in a long page. When the virtual
 * keyboard covers the bottom of the screen, Field scrolls itself above it. The wrapper pads with
 * `--rop-keyboard-inset`, which Field publishes on <html> while it has focus, so the page can
 * scroll far enough. Exercised by `e2e/field.spec.ts` with a simulated visualViewport.
 */
export const KeyboardSafe: Story = {
  render: () => (
    <div style={{ ...column, paddingBottom: 'var(--rop-keyboard-inset, 0px)' }} data-testid="kb-page">
      <div style={{ height: '120dvh' }}>Contenuto lungo prima del campo.</div>
      <Field label="Indirizzo di fatturazione" data-testid="kb-field">
        <Input />
      </Field>
      <div style={{ height: '100dvh' }} />
    </div>
  ),
};

/**
 * Visual matrix: plain, help, error, required, disabled, forced, locked, a custom control through
 * the render-prop, and a 240px column with a long label and a long reason.
 */
export const Overview: Story = {
  tags: ['visual'],
  render: () => (
    <div style={{ ...column, color: 'var(--color-rop-text)' }}>
      <Field label="Semplice" data-testid="f-plain">
        <Input placeholder="Testo" />
      </Field>
      <Field label="Con aiuto" help="Visibile in fattura." data-testid="f-help">
        <Input defaultValue="Acme" />
      </Field>
      <Field label="Con errore" error="Campo obbligatorio." help="Aiuto" data-testid="f-error">
        <Input />
      </Field>
      <Field label="Obbligatorio" required data-testid="f-required">
        <Input />
      </Field>
      <Field label="Disabilitato" state="disabled" data-testid="f-disabled">
        <Input defaultValue="Non modificabile" />
      </Field>
      <Field label="Forzato" state="forced" stateReason="Imposto dal listino." data-testid="f-forced">
        <Input defaultValue="Listino A" />
      </Field>
      <Field label="Bloccato" state="locked" stateReason="Documento già inviato." data-testid="f-locked">
        <Input defaultValue="FT-2026/041" />
      </Field>
      <Field label="Attivo" state="locked" stateReason="Gestito dall'amministratore" data-testid="f-toggle">
        {(control) => <FixtureToggle control={control} {...control} />}
      </Field>
      <div style={{ width: 240 }} data-testid="f-narrow">
        <Field
          label="Denominazione completa del soggetto giuridico destinatario della fattura"
          state="locked"
          stateReason="Il campo è bloccato perché la fattura è stata trasmessa al Sistema di Interscambio: SupercalifragilistichespiralidosoNonModificabile."
        >
          <Input defaultValue="Rossi" />
        </Field>
      </div>
    </div>
  ),
};
