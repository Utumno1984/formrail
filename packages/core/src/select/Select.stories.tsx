import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { exampleStory } from '../internal/example-story';
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
import { storyControl, withoutControls } from '../internal/story-docs';
import { Select, type SelectOption, type SelectSize } from './Select';

const SIZES: SelectSize[] = ['sm', 'md'];
const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

const COUNTRIES: SelectOption[] = [
  { value: 'it', label: 'Italy' },
  { value: 'fr', label: 'France' },
  { value: 'de', label: 'Germany', disabled: true },
  { value: 'es', label: 'Spain' },
  { value: 'pt', label: 'Portugal' },
  { value: 'at', label: 'Austria' },
];

const MANY: SelectOption[] = Array.from({ length: 200 }, (_, i) => ({
  value: `c${i + 1}`,
  label: `Customer ${String(i + 1).padStart(3, '0')}`,
}));

const LONG: SelectOption[] = [
  { value: 'a', label: 'Temporary association of enterprises between maintenance and logistics service providers of the North-East' },
  { value: 'b', label: 'Short' },
  { value: 'c', label: 'Permanent consortium for the infrastructure and general construction of the metropolitan area' },
];

interface DemoArgs {
  size: SelectSize;
  placeholder: string;
  state: FieldState;
  /** Only the `Empty` story declares it as a control: elsewhere there are options. */
  emptyLabel?: string;
  onValueChange: (value: string) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Select',
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: Select as never,
  // Overlays opened at mount, autofocus and history changes would take over the Docs page if the stories
  // were rendered inline: each story gets its own iframe there.
  parameters: { layout: 'padded', docs: { story: { inline: false, height: '360px' } } },
  argTypes: {
    size: { control: 'radio', options: SIZES },
    placeholder: { control: 'text' },
    onValueChange: { control: false },
    // Set by the demo (the option lists, a local controlled value); `Empty` gives `emptyLabel` a control.
    ...withoutControls('options', 'value', 'defaultValue', 'unknownValueLabel', 'emptyLabel'),
    // forced = value decided by a business rule; locked = not editable. Neither ever opens the list.
    state: storyControl({
      control: 'radio',
      options: STATES,
      description: '`state` of the surrounding `Field` (`forced`: value decided by a rule, `locked`: not editable; neither opens the list).',
    }),
  },
  args: { size: 'md', placeholder: 'Select', state: 'default', onValueChange: fn() },
};

export default meta;
type Story = StoryObj<DemoArgs>;

// Only Playground/Manual map `state` onto the Field; elsewhere `Controlled` drops it, so the control would be inert.
const NO_STATE = { controls: { exclude: ['state'] } };

const column = { display: 'grid', gap: 16, maxWidth: 320 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Set by the master agreement.' }) as FieldStateProps;

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

const trigger = (canvasElement: HTMLElement, name = 'Country') => within(canvasElement).getByRole('combobox', { name });
const listbox = () => within(document.body).findByRole('listbox');

/** Copy-paste example: a country Select with a disabled option. */
export const Example: Story = {
  tags: ['example', '!visual'],
  ...exampleStory('Select.example.tsx'),
};

/**
 * Controls: `size`, `placeholder` and the Field `state`; `onValueChange` is in
 * Actions. The play function picks an option with the mouse and another with the keyboard (arrows
 * skip the disabled one), then checks the trigger shows it and the Actions got exactly those picks.
 */
export const Playground: Story = {
  tags: ['playground'],
  render: ({ state, ...args }) => (
    <div style={column}>
      <Field label="Country" help="Supplier registered office" {...stateProps(state)}>
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(document.body);
    if (args.state !== 'default') return;
    await userEvent.click(trigger(canvasElement));
    await listbox();
    await userEvent.click(body.getByRole('option', { name: 'France' }));
    await expect(trigger(canvasElement)).toHaveTextContent('France');
    await expect(args.onValueChange).toHaveBeenLastCalledWith('fr');
    trigger(canvasElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    await listbox();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    // Germany is disabled: the arrow went on to Spain.
    await waitFor(() => expect(trigger(canvasElement)).toHaveTextContent('Spain'));
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
      <Field label="Country" help="Supplier registered office">
        <Controlled {...args} initial="fr" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement));
    const list = await listbox();
    await expect(within(list).getByRole('option', { name: 'France' })).toHaveAttribute('aria-selected', 'true');
  },
};

/** A Select in an invalid Field: the trigger is `aria-invalid` and the message is linked to it. Click the trigger to open the list. */
export const WithError: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Country" error="Select a country" required>
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

/** A disabled Field: the trigger is not focusable and clicking it does not open the list; the reason is read by assistive technology. */
export const Disabled: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Country" state="disabled" stateReason="Not editable while in draft">
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
      <Field label="Country" state="forced" stateReason="Set by the master agreement.">
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
    await expect(control).toHaveTextContent('Italy');
    await expect(control).toHaveAccessibleDescription('Set by the master agreement.');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** Same stacking as in a Dialog: the options are above the sheet and a pick leaves it open. */
export const InsideSheet: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <Sheet defaultOpen>
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Suppliers</h1>
      </main>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit supplier</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Field label="Country">
            <Controlled {...args} />
          </Field>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
  play: async () => {
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', { name: 'Edit supplier' });
    await userEvent.click(within(sheet).getByRole('combobox', { name: 'Country' }));
    const list = await listbox();
    for (const option of within(list).getAllByRole('option')) {
      const box = option.getBoundingClientRect();
      await expect(option.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))).toBe(true);
    }
    await userEvent.click(within(list).getByRole('option', { name: 'Spain' }));
    await expect(body.getByRole('dialog', { name: 'Edit supplier' })).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole('combobox', { name: 'Country' })).toHaveTextContent('Spain'));
  },
};

/** A value the catalogue no longer has: the trigger shows the declared label (or the raw value), and nothing is reported. */
export const UnknownValue: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Country">
        <Controlled {...args} initial="zz" unknownValueLabel="(no longer available)" />
      </Field>
      <Field label="Country (no label)">
        <Controlled {...args} initial="yy" />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    await expect(trigger(canvasElement)).toHaveTextContent('(no longer available)');
    await expect(trigger(canvasElement, 'Country (no label)')).toHaveTextContent('yy');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** 200 options: the list scrolls inside a declared maximum height and opens on the selected one. */
export const LongList: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Customer">
        <Controlled {...args} options={MANY} initial="c150" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(trigger(canvasElement, 'Customer'));
    const list = await listbox();
    const selected = within(list).getByRole('option', { name: 'Customer 150' });
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
      <Field label="Company name">
        <Controlled {...args} options={LONG} initial="a" />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const control = trigger(canvasElement, 'Company name');
    await expect(control.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    await userEvent.click(control);
    await listbox();
  },
};

/**
 * "Load data": the parent sets the options and the value after the mount. The selection shows up
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
          <Button onClick={() => setData({ options: COUNTRIES, value: 'es' })}>Load data</Button>
          <Field label="Country">
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
    await expect(trigger(canvasElement)).toHaveTextContent('Select');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Load data' }));
    await waitFor(() => expect(trigger(canvasElement)).toHaveTextContent('Spain'));
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.click(trigger(canvasElement));
    const list = await listbox();
    await expect(within(list).getByRole('option', { name: 'Spain' })).toHaveAttribute('aria-selected', 'true');
  },
};

/**
 * No options: the open list shows `emptyLabel` as its only option, disabled. Control: `emptyLabel`.
 * The play function opens the list, presses the arrows and Enter and clicks the message: nothing is
 * picked, the trigger keeps the placeholder and Actions stays empty.
 */
export const Empty: Story = {
  parameters: { controls: { exclude: ['state'] } },
  argTypes: { emptyLabel: { control: 'text' } },
  args: { placeholder: 'Select a country', emptyLabel: 'No countries available' },
  render: ({ size, placeholder, emptyLabel, onValueChange }) => (
    <div style={column}>
      <Field label="Country">
        <Select options={[]} size={size} placeholder={placeholder} emptyLabel={emptyLabel} onValueChange={onValueChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(trigger(canvasElement, 'Country'));
    const list = await listbox();
    const [empty, ...others] = within(list).getAllByRole('option');
    await expect(others).toHaveLength(0);
    await expect(empty).toHaveTextContent(args.emptyLabel!);
    await expect(empty).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await userEvent.click(empty!);
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await expect(within(document.body).getByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('listbox')).toBeNull());
    await expect(trigger(canvasElement, 'Country')).toHaveTextContent(args.placeholder);
    await expect(trigger(canvasElement, 'Country')).toHaveFocus();
  },
};

/** The popover is above the dialog: the options take the click and the dialog stays open. */
export const InsideDialog: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="primary">Open</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Edit supplier</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <Field label="Country">
            <Controlled {...args} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Edit supplier' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Country' }));
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
