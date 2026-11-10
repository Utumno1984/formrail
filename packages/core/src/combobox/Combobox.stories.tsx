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
import { defaultComboboxFilter } from './filter';
import { useCombobox } from './use-combobox';

const SIZES: ComboboxSize[] = ['sm', 'md'];
const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

const CITIES: ComboboxOption[] = [
  { value: 'mi', label: 'Milano' },
  { value: 'mo', label: 'Modena' },
  { value: 'mn', label: 'Mantova', disabled: true },
  { value: 'mc', label: 'Macerata' },
  { value: 'sp', label: 'São Paulo' },
  { value: 'to', label: 'Torino' },
  { value: 'rm', label: 'Roma' },
];

const MANY: ComboboxOption[] = Array.from({ length: 200 }, (_, i) => ({
  value: `c${i + 1}`,
  label: `Customer ${String(i + 1).padStart(3, '0')}`,
}));

const LONG: ComboboxOption[] = [
  {
    value: 'a',
    label: 'Temporary association of enterprises between maintenance and logistics service providers of the North-East',
  },
  { value: 'b', label: 'Short' },
  {
    value: 'c',
    label: 'Permanent consortium for the infrastructure and general construction of the metropolitan area',
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
  // The stories drive the component through a demo wrapper (`Meta<...Args>`): `never` keeps the docs
  // props table of the real component without forcing the wrapper's args to match its props.
  component: Combobox as never,
  // Overlays opened at mount, autofocus and history changes would take over the Docs page if the stories
  // were rendered inline: each story gets its own iframe there.
  parameters: { layout: 'padded', docs: { story: { inline: false, height: '360px' } } },
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
    placeholder: 'Search for a city',
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
    stateReason: state === 'default' ? undefined : 'Set by the master agreement.',
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

const input = (canvasElement: HTMLElement, name = 'City') => within(canvasElement).getByRole('combobox', { name });
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
      <Field label="City" help="Supplier registered office" {...stateProps(state)}>
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
    // Scoped to the list: the live region next to the input carries the same text.
    await expect(await within(await listbox()).findByText(args.emptyLabel)).toBeInTheDocument();
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
      <Field label="City" help="Supplier registered office">
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

/**
 * Controls: `emptyLabel` (the list message and the screen reader announcement), `size`,
 * `placeholder`, `clearOnEmpty`. The play function checks that the visually hidden status region
 * is there, empty, before typing; types a text with no results and checks the same node now
 * carries `emptyLabel` while the message is a disabled option the arrows never reach; then types
 * a matching text and checks the region is empty again.
 */
export const NoResults: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="City">
        <Controlled {...args} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const status = within(canvasElement).getByRole('status');
    await expect(status).toHaveTextContent(/^$/u);
    // Results first: the region stays empty.
    await userEvent.type(input(canvasElement), 'tor');
    await expect(await within(await listbox()).findByRole('option', { name: 'Torino' })).toBeInTheDocument();
    await expect(status).toHaveTextContent(/^$/u);
    await userEvent.clear(input(canvasElement));
    await userEvent.type(input(canvasElement), 'zzz');
    const list = await listbox();
    // The message is the listbox's only option, disabled: the arrows never make it active.
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(1));
    const empty = within(list).getByRole('option');
    await expect(empty).toHaveTextContent(args.emptyLabel);
    await expect(empty).toHaveAttribute('aria-disabled', 'true');
    // Announced through the region mounted from the start, not by the option (the focus is on the input).
    await waitFor(() => expect(status).toHaveTextContent(args.emptyLabel));
    await expect(within(canvasElement).getByRole('status')).toBe(status);
    await userEvent.keyboard('{ArrowDown}');
    await expect(input(canvasElement)).not.toHaveAttribute('aria-activedescendant');
  },
};

/** A Combobox in an invalid Field: the input is `aria-invalid` and the message is linked to it. Click the input to open the list. */
export const WithError: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="City" error="Select a city" required>
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

/** A disabled Field: the input is not focusable and clicking it does not open the list; the reason is read by assistive technology. */
export const Disabled: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="City" state="disabled" stateReason="Not editable while in draft">
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
      <Field label="City" state="forced" stateReason="Set by the master agreement.">
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
    await expect(control).toHaveAccessibleDescription('Set by the master agreement.');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** A value the catalogue no longer has: the input shows the declared label (or the raw value), and nothing is reported. */
export const UnknownValue: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="City">
        <Controlled {...args} initial="zz" unknownValueLabel="(no longer available)" />
      </Field>
      <Field label="City (no label)">
        <Controlled {...args} initial="yy" />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    await expect(input(canvasElement)).toHaveValue('(no longer available)');
    await expect(input(canvasElement, 'City (no label)')).toHaveValue('yy');
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** 200 options: the list scrolls inside a declared maximum height and the arrows keep the active option in view. */
export const LongList: Story = {
  tags: ['visual'],
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="Customer">
        <Controlled {...args} options={MANY} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(input(canvasElement, 'Customer'));
    await listbox();
  },
};

/** Very long labels: the input stays inside the Field's width; the list wraps them. */
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
    const control = input(canvasElement, 'Company name');
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
          <Button onClick={() => setData({ options: CITIES, value: 'to' })}>Load data</Button>
          <Field label="City">
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
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Load data' }));
    await waitFor(() => expect(input(canvasElement)).toHaveValue('Torino'));
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** Two Comboboxes on the page: distinct ids, and opening the second closes the first. */
export const Two: Story = {
  parameters: NO_STATE,
  render: (args) => (
    <div style={column}>
      <Field label="City of birth">
        <Controlled {...args} />
      </Field>
      <Field label="City of residence">
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
        <Field label="City">
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
        <Field label="City">
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
        <Button variant="primary">Open</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Edit supplier</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <Field label="City">
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
    const dialog = await body.findByRole('dialog', {
      name: 'Edit supplier',
    });
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'City' }), 'm');
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
        <h1 style={{ margin: 0, fontSize: 20 }}>Suppliers</h1>
      </main>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit supplier</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Field label="City">
            <Controlled {...args} />
          </Field>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
  play: async () => {
    const body = within(document.body);
    const sheet = await body.findByRole('dialog', {
      name: 'Edit supplier',
    });
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'City' }), 'o');
    const list = await listbox();
    for (const option of within(list).getAllByRole('option')) {
      const box = option.getBoundingClientRect();
      await expect(option.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))).toBe(
        true,
      );
    }
    await userEvent.click(within(list).getByRole('option', { name: 'Torino' }));
    await expect(body.getByRole('dialog', { name: 'Edit supplier' })).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole('combobox', { name: 'City' })).toHaveValue('Torino'));
  },
};

function HeadlessDemo({ onValueChange }: { onValueChange: (value: string | undefined) => void }) {
  const [selected, setSelected] = useState<ComboboxOption | null>(null);
  const combobox = useCombobox<ComboboxOption>({
    items: CITIES,
    itemToString: (city) => city.label,
    itemToKey: (city) => city.value,
    isItemDisabled: (city) => !!city.disabled,
    selectedItem: selected,
    // The default filter (case- and diacritics-insensitive substring), capped to three results.
    filter: (items, inputValue) => defaultComboboxFilter(items, inputValue, (city) => city.label).slice(0, 3),
    onSelectedItemChange: (city) => {
      setSelected(city);
      onValueChange(city?.value);
    },
  });
  return (
    <div style={{ ...column, fontFamily: 'var(--font-rop-sans, sans-serif)' }}>
      <label>
        City{' '}
        <input {...combobox.getInputProps()} style={{ border: '1px solid var(--color-rop-border)', padding: '4px 8px' }} />
      </label>
      <ul {...combobox.getListboxProps({ 'aria-label': 'Cities' })} hidden={!combobox.isOpen} style={{ margin: 0, paddingLeft: 16 }}>
        {combobox.filteredItems.map((city, index) => (
          <li
            key={city.value}
            {...combobox.getOptionProps(city, index)}
            style={{ fontWeight: index === combobox.activeIndex ? 700 : 400 }}
          >
            {city.label}
          </li>
        ))}
        {combobox.filteredItems.length === 0 && (
          <li role="option" aria-disabled="true" aria-selected="false">
            No results
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Headless hook: `useCombobox` gives the input, listbox and option props (ARIA combobox with listbox,
 * focus stays on the input) and no markup or style; `defaultComboboxFilter(items, inputValue,
 * itemToString)` is the filter `Combobox` uses and can be wrapped in a custom `filter`. Here the
 * filter caps the results to three. The play function types "m" and checks that only three of the
 * four matching cities are listed, then narrows to "mod" and picks it with the keyboard.
 */
export const HeadlessHook: Story = {
  name: 'Headless hook: useCombobox',
  parameters: { controls: { include: ['onValueChange'] } },
  render: ({ onValueChange }) => <HeadlessDemo onValueChange={onValueChange} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByRole('combobox', { name: 'City' });
    await userEvent.click(field);
    await userEvent.keyboard('m');
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(3));
    await userEvent.keyboard('od');
    await waitFor(() => expect(canvas.getAllByRole('option')).toHaveLength(1));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(field).toHaveValue('Modena'));
    await expect(args.onValueChange).toHaveBeenLastCalledWith('mo');
  },
};
