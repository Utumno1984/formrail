import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog/Dialog';
import { Field, type FieldStateProps } from '../field/Field';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '../sheet/Sheet';
import type { FieldState } from '../field/FieldContext';
import { repositionAfterMotion } from '../internal/settle-motion';
import { Select, type SelectOption, type SelectSize } from './Select';

const SIZES: SelectSize[] = ['sm', 'md'];
const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

const COUNTRIES: SelectOption[] = [
  { value: 'it', label: 'Italia' },
  { value: 'fr', label: 'Francia' },
  { value: 'de', label: 'Germania', disabled: true },
  { value: 'es', label: 'Spagna' },
  { value: 'pt', label: 'Portogallo' },
  { value: 'at', label: 'Austria' },
];

const MANY: SelectOption[] = Array.from({ length: 200 }, (_, i) => ({
  value: `c${i + 1}`,
  label: `Cliente ${String(i + 1).padStart(3, '0')}`,
}));

const LONG: SelectOption[] = [
  { value: 'a', label: 'Associazione temporanea di imprese tra fornitori di servizi di manutenzione e di logistica del Nord-Est' },
  { value: 'b', label: 'Breve' },
  { value: 'c', label: 'Consorzio stabile per le infrastrutture e le costruzioni generali dell’area metropolitana' },
];

interface DemoArgs {
  size: SelectSize;
  placeholder: string;
  state: FieldState;
  onValueChange: (value: string) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Select',
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'radio', options: SIZES },
    placeholder: { control: 'text' },
    // forced = value decided by a business rule; locked = not editable. Neither ever opens the list.
    state: { control: 'radio', options: STATES },
    onValueChange: { control: false },
  },
  args: { size: 'md', placeholder: 'Seleziona', state: 'default', onValueChange: fn() },
};

export default meta;
type Story = StoryObj<DemoArgs>;

// Only Playground/Manual map `state` onto the Field; elsewhere `Controlled` drops it, so the control would be inert.
const NO_STATE = { controls: { exclude: ['state'] } };

const column = { display: 'grid', gap: 16, maxWidth: 320 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Deciso dal contratto quadro.' }) as FieldStateProps;

/** A controlled Select that reports every user pick to `onValueChange` (the Actions panel). */
function Controlled({
  options = COUNTRIES,
  initial,
  size,
  placeholder,
  unknownValueLabel,
  onValueChange,
}: {
  options?: SelectOption[];
  initial?: string;
  unknownValueLabel?: string;
} & Pick<DemoArgs, 'size' | 'placeholder' | 'onValueChange'>) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <Select
      options={options}
      value={value}
      size={size}
      placeholder={placeholder}
      unknownValueLabel={unknownValueLabel}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

const trigger = (canvasElement: HTMLElement, name = 'Paese') => within(canvasElement).getByRole('combobox', { name });
const listbox = () => within(document.body).findByRole('listbox');

/**
 * Controls: `size`, `placeholder` and the Field `state`; `onValueChange` is in
 * Actions. The play function picks an option with the mouse and another with the keyboard (arrows
 * skip the disabled one), then checks the trigger shows it and the Actions got exactly those picks.
 */
export const Playground: Story = {
  render: ({ state, ...args }) => (
    <div style={column}>
      <Field label="Paese" help="Sede legale del fornitore" {...stateProps(state)}>
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(document.body);
    if (args.state !== 'default') return;
    await userEvent.click(trigger(canvasElement));
    await listbox();
    await userEvent.click(body.getByRole('option', { name: 'Francia' }));
    await expect(trigger(canvasElement)).toHaveTextContent('Francia');
    await expect(args.onValueChange).toHaveBeenLastCalledWith('fr');
    trigger(canvasElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await listbox();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    // Germania is disabled: the arrow went on to Spagna.
    await waitFor(() => expect(trigger(canvasElement)).toHaveTextContent('Spagna'));
    await expect(args.onValueChange).toHaveBeenCalledTimes(2);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('es');
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: Playground.render,
};

/** Page-level shot with the list open and the second option selected (check and highlight visible). */
export const Base: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Paese" help="Sede legale del fornitore">
        <Controlled {...args} initial="fr" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));
    const list = await listbox();
    await expect(within(list).getByRole('option', { name: 'Francia' })).toHaveAttribute('aria-selected', 'true');
  },
};

export const WithError: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Paese" error="Seleziona un paese" required>
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(trigger(canvasElement)).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(trigger(canvasElement));
    await listbox();
  },
};

export const Disabled: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Paese" state="disabled" stateReason="Non modificabile in bozza">
        <Controlled {...args} initial="it" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
    await expect(trigger(canvasElement)).toBeDisabled();
  },
};

/** Focusable, shows the value, and nothing opens it: not Enter, Space, the arrows, a letter or a click. */
export const Forced: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Paese" state="forced" stateReason="Deciso dal contratto quadro.">
        <Controlled {...args} initial="it" />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const control = trigger(canvasElement);
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard('{Enter}{ }{ArrowDown}{ArrowUp}fr');
    await userEvent.click(control);
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
    await expect(control).toHaveTextContent('Italia');
    await expect(control).toHaveAccessibleDescription('Deciso dal contratto quadro.');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** Same stacking as in a Dialog: the options are above the sheet and a pick leaves it open. */
export const InsideSheet: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <Sheet defaultOpen>
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Fornitori</h1>
      </main>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Modifica fornitore</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Field label="Paese">
            <Controlled {...args} />
          </Field>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
  play: async () => {
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', { name: 'Modifica fornitore' });
    await userEvent.click(within(sheet).getByRole('combobox', { name: 'Paese' }));
    const list = await listbox();
    for (const option of within(list).getAllByRole('option')) {
      const box = option.getBoundingClientRect();
      await expect(option.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))).toBe(true);
    }
    await userEvent.click(within(list).getByRole('option', { name: 'Spagna' }));
    await expect(body.getByRole('dialog', { name: 'Modifica fornitore' })).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole('combobox', { name: 'Paese' })).toHaveTextContent('Spagna'));
  },
};

/** A value the catalogue no longer has: the trigger shows the declared label (or the raw value), and nothing is reported. */
export const UnknownValue: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Paese">
        <Controlled {...args} initial="zz" unknownValueLabel="(non più disponibile)" />
      </Field>
      <Field label="Paese (senza etichetta)">
        <Controlled {...args} initial="yy" />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    await expect(trigger(canvasElement)).toHaveTextContent('(non più disponibile)');
    await expect(trigger(canvasElement, 'Paese (senza etichetta)')).toHaveTextContent('yy');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** 200 options: the list scrolls inside a declared maximum height and opens on the selected one. */
export const LongList: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Cliente">
        <Controlled {...args} options={MANY} initial="c150" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement, 'Cliente'));
    const list = await listbox();
    const selected = within(list).getByRole('option', { name: 'Cliente 150' });
    await waitFor(() => {
      const box = selected.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    });
  },
};

/** Very long labels: the trigger truncates inside the Field's width; the list wraps them. */
export const LongLabels: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Ragione sociale">
        <Controlled {...args} options={LONG} initial="a" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const control = trigger(canvasElement, 'Ragione sociale');
    await expect(control.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    await userEvent.click(control);
    await listbox();
  },
};

/**
 * "Carica dati": the parent sets the options and the value after the mount. The selection shows up
 * and `onValueChange` is never called (the Actions panel stays empty).
 */
export const AsyncLoad: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: ({ size, placeholder, onValueChange }) => {
    function Host() {
      const [data, setData] = useState<{ options: SelectOption[]; value?: string }>({ options: [] });
      return (
        <div style={column}>
          <Button onClick={() => setData({ options: COUNTRIES, value: 'es' })}>Carica dati</Button>
          <Field label="Paese">
            <Select
              options={data.options}
              value={data.value}
              size={size}
              placeholder={placeholder}
              onValueChange={(next) => {
                setData((d) => ({ ...d, value: next }));
                onValueChange(next);
              }}
            />
          </Field>
        </div>
      );
    }
    return <Host />;
  },
  play: async ({ args, canvasElement }) => {
    await expect(trigger(canvasElement)).toHaveTextContent('Seleziona');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Carica dati' }));
    await waitFor(() => expect(trigger(canvasElement)).toHaveTextContent('Spagna'));
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.click(trigger(canvasElement));
    const list = await listbox();
    await expect(within(list).getByRole('option', { name: 'Spagna' })).toHaveAttribute('aria-selected', 'true');
  },
};

/** The popover is above the dialog: the options take the click and the dialog stays open. */
export const InsideDialog: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="primary">Apri</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Modifica fornitore</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <Field label="Paese">
            <Controlled {...args} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Annulla</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Modifica fornitore' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Paese' }));
    const list = await listbox();
    for (const option of within(list).getAllByRole('option')) {
      const box = option.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      await expect(option.contains(hit)).toBe(true);
    }
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await repositionAfterMotion();
  },
};
