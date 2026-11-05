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
import type { FieldState } from '../field/FieldContext';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '../sheet/Sheet';
import { repositionAfterMotion } from '../internal/settle-motion';
import { Combobox, type ComboboxOption, type ComboboxSize } from './Combobox';

const SIZES: ComboboxSize[] = ['sm', 'md'];
const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

const CITIES: ComboboxOption[] = [
  { value: 'mi', label: 'Milano' },
  { value: 'mo', label: 'Modena' },
  { value: 'mn', label: 'Mantova', disabled: true },
  { value: 'mc', label: 'Macerata' },
  { value: 'cdc', label: 'Città di Castello' },
  { value: 'to', label: 'Torino' },
  { value: 'rm', label: 'Roma' },
];

const MANY: ComboboxOption[] = Array.from({ length: 200 }, (_, i) => ({
  value: `c${i + 1}`,
  label: `Cliente ${String(i + 1).padStart(3, '0')}`,
}));

const LONG: ComboboxOption[] = [
  {
    value: 'a',
    label: 'Associazione temporanea di imprese tra fornitori di servizi di manutenzione e di logistica del Nord-Est',
  },
  { value: 'b', label: 'Breve' },
  {
    value: 'c',
    label: 'Consorzio stabile per le infrastrutture e le costruzioni generali dell’area metropolitana',
  },
];

interface DemoArgs {
  size: ComboboxSize;
  placeholder: string;
  emptyLabel: string;
  clearOnEmpty: boolean;
  state: FieldState;
  onValueChange: (value: string | undefined) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Combobox',
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'radio', options: SIZES },
    placeholder: { control: 'text' },
    emptyLabel: { control: 'text' },
    clearOnEmpty: { control: 'boolean' },
    // forced = value decided by a business rule; locked = not editable. Neither ever opens the list.
    state: { control: 'radio', options: STATES },
    onValueChange: { control: false },
  },
  args: {
    size: 'md',
    placeholder: 'Cerca un comune',
    emptyLabel: 'No results',
    clearOnEmpty: false,
    state: 'default',
    onValueChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

// Only Playground/Manual map `state` onto the Field; elsewhere `Controlled` drops it, so the control would be inert.
const NO_STATE = { controls: { exclude: ['state'] } };

const column = { display: 'grid', gap: 16, maxWidth: 320 } as const;
const stateProps = (state: FieldState) =>
  ({
    state,
    stateReason: state === 'default' ? undefined : 'Deciso dal contratto quadro.',
  }) as FieldStateProps;

/** A controlled Combobox that reports every user pick to `onValueChange` (the Actions panel). */
function Controlled({
  options = CITIES,
  initial,
  unknownValueLabel,
  size,
  placeholder,
  emptyLabel,
  clearOnEmpty,
  onValueChange,
}: {
  options?: ComboboxOption[];
  initial?: string;
  unknownValueLabel?: string;
} & Pick<DemoArgs, 'size' | 'placeholder' | 'emptyLabel' | 'clearOnEmpty' | 'onValueChange'>) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <Combobox
      options={options}
      value={value}
      size={size}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      clearOnEmpty={clearOnEmpty}
      unknownValueLabel={unknownValueLabel}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

const input = (canvasElement: HTMLElement, name = 'Comune') => within(canvasElement).getByRole('combobox', { name });
const listbox = () => within(document.body).findByRole('listbox');

/**
 * Controls: `size`, `placeholder`, `emptyLabel`, `clearOnEmpty` and the Field `state`;
 * `onValueChange` is in Actions. The play function types "mil", moves down past the disabled
 * option and picks with Enter, checks the input and that Actions got exactly that value, then
 * types a text with no results, leaves with Tab and checks the revert with no new call.
 */
export const Playground: Story = {
  render: ({ state, ...args }) => (
    <div style={column}>
      <Field label="Comune" help="Sede legale del fornitore" {...stateProps(state)}>
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    if (args.state !== 'default') return;
    const control = input(canvasElement);
    await userEvent.type(control, 'm');
    await listbox();
    // "m" matches Milano, Modena, Mantova (disabled), Macerata and Roma: Milano is active, the
    // first arrow goes to Modena, the second skips Mantova and lands on Macerata.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await waitFor(() => expect(control).toHaveValue('Macerata'));
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('mc');
    await userEvent.clear(control);
    await userEvent.type(control, 'xyz');
    await expect(await within(document.body).findByText(args.emptyLabel)).toBeInTheDocument();
    await userEvent.tab();
    await waitFor(() => expect(control).toHaveValue('Macerata'));
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: Playground.render,
};

/** Page-level shot with the list open and a selection (check and highlight visible). */
export const Base: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune" help="Sede legale del fornitore">
        <Controlled {...args} initial="mo" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(input(canvasElement));
    const list = await listbox();
    await expect(within(list).getByRole('option', { name: 'Modena' })).toHaveAttribute('aria-selected', 'true');
  },
};

export const NoResults: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune">
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.type(input(canvasElement), 'zzz');
    const list = await listbox();
    await expect(within(list).getByText('No results')).toBeInTheDocument();
    await expect(within(list).queryAllByRole('option')).toHaveLength(0);
  },
};

export const WithError: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune" error="Seleziona un comune" required>
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(input(canvasElement)).toHaveAttribute('aria-invalid', 'true');
    await userEvent.click(input(canvasElement));
    await listbox();
  },
};

export const Disabled: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune" state="disabled" stateReason="Non modificabile in bozza">
        <Controlled {...args} initial="mi" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(input(canvasElement));
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
    await expect(input(canvasElement)).toBeDisabled();
  },
};

/** Focusable, shows the value, and nothing opens it: not typing, the arrows, Enter or a click. */
export const Forced: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune" state="forced" stateReason="Deciso dal contratto quadro.">
        <Controlled {...args} initial="mi" />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const control = input(canvasElement);
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowUp}to');
    await userEvent.click(control);
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
    await expect(control).toHaveValue('Milano');
    await expect(control).toHaveAccessibleDescription('Deciso dal contratto quadro.');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** A value the catalogue no longer has: the input shows the declared label (or the raw value), and nothing is reported. */
export const UnknownValue: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune">
        <Controlled {...args} initial="zz" unknownValueLabel="(non più disponibile)" />
      </Field>
      <Field label="Comune (senza etichetta)">
        <Controlled {...args} initial="yy" />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    await expect(input(canvasElement)).toHaveValue('(non più disponibile)');
    await expect(input(canvasElement, 'Comune (senza etichetta)')).toHaveValue('yy');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** 200 options: the list scrolls inside a declared maximum height and the arrows keep the active option in view. */
export const LongList: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Cliente">
        <Controlled {...args} options={MANY} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(input(canvasElement, 'Cliente'));
    await listbox();
  },
};

/** Very long labels: the input stays inside the Field's width; the list wraps them. */
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
    const control = input(canvasElement, 'Ragione sociale');
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
  // This render builds a bare Combobox from `size` and `placeholder` only.
  parameters: { controls: { exclude: ['state', 'emptyLabel', 'clearOnEmpty'] } },
  render: ({ size, placeholder, onValueChange }) => {
    function Host() {
      const [data, setData] = useState<{
        options: ComboboxOption[];
        value?: string;
      }>({ options: [] });
      return (
        <div style={column}>
          <Button onClick={() => setData({ options: CITIES, value: 'to' })}>Carica dati</Button>
          <Field label="Comune">
            <Combobox
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
    await expect(input(canvasElement)).toHaveValue('');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Carica dati' }));
    await waitFor(() => expect(input(canvasElement)).toHaveValue('Torino'));
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** Two Comboboxes on the page: distinct ids, and opening the second closes the first. */
export const Two: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Comune di nascita">
        <Controlled {...args} />
      </Field>
      <Field label="Comune di residenza">
        <Controlled {...args} />
      </Field>
    </div>
  ),
};

/** Close to the bottom edge of the viewport: the list opens upward (or shrinks) and stays on screen. */
export const NearBottom: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div>
      <div style={{ height: '70vh' }} />
      <div style={column}>
        <Field label="Comune">
          <Controlled {...args} />
        </Field>
      </div>
    </div>
  ),
};

/** The same field low in a tall page, for the virtual keyboard e2e (`visualViewport` simulated). */
export const KeyboardSafe: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div>
      <div style={{ height: '40vh' }} />
      <div style={column} data-testid="kb-field">
        <Field label="Comune">
          <Controlled {...args} options={MANY} />
        </Field>
      </div>
      <div style={{ height: '80vh' }} />
    </div>
  ),
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
          <Field label="Comune">
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
    const dialog = await body.findByRole('dialog', {
      name: 'Modifica fornitore',
    });
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Comune' }), 'm');
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
          <Field label="Comune">
            <Controlled {...args} />
          </Field>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
  play: async () => {
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', {
      name: 'Modifica fornitore',
    });
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Comune' }), 'o');
    const list = await listbox();
    for (const option of within(list).getAllByRole('option')) {
      const box = option.getBoundingClientRect();
      await expect(option.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))).toBe(
        true,
      );
    }
    await userEvent.click(within(list).getByRole('option', { name: 'Torino' }));
    await expect(body.getByRole('dialog', { name: 'Modifica fornitore' })).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole('combobox', { name: 'Comune' })).toHaveValue('Torino'));
  },
};
