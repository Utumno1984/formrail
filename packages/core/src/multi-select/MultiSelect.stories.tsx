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
import { repositionAfterMotion } from '../internal/settle-motion';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '../sheet/Sheet';
import { MultiSelect, type MultiSelectOption, type MultiSelectSize } from './MultiSelect';

const SIZES: MultiSelectSize[] = ['sm', 'md'];
const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

const COST_CENTERS: MultiSelectOption[] = [
  { value: 'adm', label: 'Administration' },
  { value: 'fin', label: 'Finance' },
  { value: 'hr', label: 'Human resources' },
  { value: 'it', label: 'IT services' },
  { value: 'log', label: 'Logistics', disabled: true },
  { value: 'mkt', label: 'Marketing' },
  { value: 'ops', label: 'Operations' },
  { value: 'rnd', label: 'Research and development' },
  { value: 'sal', label: 'Sales' },
];

const LONG_LABEL: MultiSelectOption = {
  value: 'long',
  label: 'Shared services of the North-East regional maintenance and logistics consortium',
};

const MANY: MultiSelectOption[] = Array.from({ length: 30 }, (_, i) => ({
  value: `cc${i + 1}`,
  label: `CC-${String(i + 1).padStart(3, '0')}`,
}));

interface DemoArgs {
  fieldState: FieldState;
  size: MultiSelectSize;
  invalid: boolean;
  required: boolean;
  placeholder: string;
  options: MultiSelectOption[];
  onValueChange: (values: string[]) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/MultiSelect',
  component: MultiSelect as never,
  parameters: { layout: 'padded', docs: { story: { inline: false, height: '380px' } } },
  argTypes: {
    // forced = decided by a business rule; locked = not editable. Neither opens nor changes the value.
    fieldState: { control: 'radio', options: STATES },
    size: { control: 'radio', options: SIZES },
    invalid: { control: 'boolean', description: 'Gives the Field an error message.' },
    required: { control: 'boolean' },
    placeholder: { control: 'text' },
    options: { control: 'object', description: 'Cost centers fixture.' },
    onValueChange: { control: false },
  },
  args: {
    fieldState: 'default',
    size: 'md',
    invalid: false,
    required: false,
    placeholder: 'Search cost centers',
    options: COST_CENTERS,
    onValueChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 360 } as const;

function fieldProps({ fieldState, invalid, required }: Pick<DemoArgs, 'fieldState' | 'invalid' | 'required'>) {
  return {
    state: fieldState,
    stateReason: fieldState === 'default' || fieldState === 'disabled' ? undefined : 'Set by the budget owner.',
    error: invalid ? 'Pick at least one cost center.' : undefined,
    required,
  } as FieldStateProps & { error?: string; required: boolean };
}

/** A controlled MultiSelect that reports every user change to `onValueChange` (the Actions panel). */
function Controlled({
  initial = [],
  options,
  size,
  placeholder,
  onValueChange,
}: { initial?: string[] } & Pick<DemoArgs, 'options' | 'size' | 'placeholder' | 'onValueChange'>) {
  const [value, setValue] = useState<readonly string[]>(initial);
  return (
    <MultiSelect
      options={options}
      value={value}
      size={size}
      placeholder={placeholder}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

function Demo({ initial, ...args }: DemoArgs & { initial?: string[] }) {
  return (
    <div style={column}>
      <Field label="Cost centers" help="Where the invoice is charged" {...fieldProps(args)}>
        <Controlled {...args} initial={initial} />
      </Field>
    </div>
  );
}

const input = (canvasElement: HTMLElement, name = 'Cost centers') => within(canvasElement).getByRole('combobox', { name });
const listbox = () => within(document.body).findByRole('listbox');
const chipLabels = (canvasElement: HTMLElement) =>
  Array.from(canvasElement.querySelectorAll('[data-rop-multi-select] > span')).map((chip) => chip.textContent);

/**
 * "Cost centers". Controls: the Field state, `size`, `invalid`, `required`, `placeholder`, the
 * `options` fixture; `onValueChange` is in Actions. The play function opens the list, picks three
 * options (two clicks and Enter) checking the list stays open, types a filter that hides a picked
 * value and checks its chip stays, then empties the text and removes the last chip with Backspace.
 */
export const Playground: Story = {
  render: (args) => <Demo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'default' || args.options !== COST_CENTERS) return;
    const control = input(canvasElement);
    await userEvent.click(control);
    const list = await listbox();
    await userEvent.click(within(list).getByRole('option', { name: 'Finance' }));
    await expect(list).toBeVisible();
    await userEvent.click(within(list).getByRole('option', { name: 'Marketing' }));
    await userEvent.type(control, 'sal');
    await userEvent.keyboard('{Enter}');
    await expect(await listbox()).toBeVisible();
    await expect(control).toHaveValue('');
    await expect(args.onValueChange).toHaveBeenCalledTimes(3);
    await expect(args.onValueChange).toHaveBeenLastCalledWith(['fin', 'mkt', 'sal']);
    await expect(chipLabels(canvasElement)).toEqual(['Finance', 'Marketing', 'Sales']);
    // A filter that hides Finance: its chip stays.
    await userEvent.type(control, 'mar');
    await waitFor(() => expect(within(document.body).getAllByRole('option')).toHaveLength(1));
    await expect(chipLabels(canvasElement)).toContain('Finance');
    await userEvent.clear(control);
    await userEvent.keyboard('{Backspace}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(['fin', 'mkt']);
    await expect(chipLabels(canvasElement)).toEqual(['Finance', 'Marketing']);
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: (args) => <Demo {...args} />,
};

/** Empty, with the placeholder: as tall as a Combobox of the same size. */
export const Empty: Story = {
  tags: ['visual'],
  render: (args) => <Demo {...args} />,
};

/** Chips on one row, and enough chips to wrap on several rows (the field grows, nothing overflows). */
export const Chips: Story = {
  tags: ['visual'],
  render: (args) => (
    <div style={column}>
      <Field label="One row">
        <Controlled {...args} initial={['fin', 'mkt']} />
      </Field>
      <Field label="Several rows">
        <Controlled {...args} initial={['adm', 'fin', 'hr', 'it', 'mkt', 'ops', 'rnd', 'sal']} />
      </Field>
    </div>
  ),
};

/** A chip with a very long label is truncated with a real max width; hovering it shows the full label. */
export const TruncatedChip: Story = {
  tags: ['visual'],
  render: (args) => (
    <div style={column}>
      <Field label="Cost centers">
        <Controlled {...args} options={[LONG_LABEL, ...COST_CENTERS]} initial={['long', 'sal']} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-rop-multi-select]')!;
    const chip = box.querySelector<HTMLElement>(':scope > span')!;
    await expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(box.getBoundingClientRect().right);
    const text = chip.firstElementChild as HTMLElement;
    await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth);
  },
};

/** The list open with two selected options (check and highlight visible). */
export const Open: Story = {
  tags: ['visual'],
  render: (args) => <Demo {...args} initial={['fin', 'sal']} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(input(canvasElement));
    const list = await listbox();
    await expect(within(list).getByRole('option', { name: 'Finance' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await repositionAfterMotion();
  },
};

/** Every Field state, valid and invalid, with chips, at both sizes. */
export const States: Story = {
  tags: ['visual'],
  parameters: { controls: { include: [] } },
  render: (args) => (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {SIZES.flatMap((size) =>
        STATES.flatMap((fieldState) =>
          [false, true].map((invalid) => (
            <Field
              key={`${size}-${fieldState}-${invalid}`}
              label={`${size} / ${fieldState}${invalid ? ' / invalid' : ''}`}
              {...fieldProps({ fieldState, invalid, required: false })}
            >
              <Controlled {...args} size={size} initial={['fin', 'sal']} />
            </Field>
          )),
        ),
      )}
      {SIZES.map((size) => (
        <Field key={size} label={`${size} / empty`}>
          <Controlled {...args} size={size} />
        </Field>
      ))}
    </div>
  ),
};

/**
 * `locked`: the chips are readable, the reason is read with the field, and no gesture opens the
 * list or changes the value (typing, arrows, Enter, Backspace, clicks on the input and on a chip).
 */
export const Locked: Story = {
  tags: ['visual'],
  args: { fieldState: 'locked' },
  render: (args) => <Demo {...args} initial={['fin', 'mkt']} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'locked') return;
    const control = input(canvasElement);
    await userEvent.tab();
    await expect(control).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}ab{Backspace}{Backspace}');
    await userEvent.click(control);
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-rop-multi-select] > span')!);
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
    await expect(chipLabels(canvasElement)).toEqual(['Finance', 'Marketing']);
    await expect(control).toHaveAccessibleDescription(/^Set by the budget owner\./u);
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** 30 values: the field grows row by row; the page stays the only scroller. */
export const ManyValues: Story = {
  render: (args) => (
    <div style={column}>
      <Field label="Cost centers">
        <Controlled {...args} options={MANY} initial={MANY.map((o) => o.value)} />
      </Field>
    </div>
  ),
};

/**
 * "Load data": the parent sets the options and the value after the mount. The raw chips become
 * labels and `onValueChange` is never called (the Actions panel stays empty).
 */
export const AsyncLoad: Story = {
  parameters: { controls: { include: ['size', 'placeholder'] } },
  render: ({ size, placeholder, onValueChange }) => {
    function Host() {
      const [data, setData] = useState<{ options: MultiSelectOption[]; value: readonly string[] }>({
        options: [],
        value: ['mkt', 'sal'],
      });
      return (
        <div style={column}>
          <Button onClick={() => setData((d) => ({ ...d, options: COST_CENTERS }))}>Load data</Button>
          <Field label="Cost centers">
            <MultiSelect
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
    await expect(chipLabels(canvasElement)).toEqual(['mkt', 'sal']);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Load data' }));
    await waitFor(() => expect(chipLabels(canvasElement)).toEqual(['Marketing', 'Sales']));
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

/** In a native form: the values are posted as repeated `name` entries; Reset goes back to the default. */
export const NativeForm: Story = {
  parameters: { controls: { include: ['size'] } },
  render: ({ size, onValueChange }) => {
    function Host() {
      const [posted, setPosted] = useState('');
      return (
        <form
          style={column}
          onSubmit={(event) => {
            event.preventDefault();
            setPosted(new FormData(event.currentTarget).getAll('centers').join(', '));
          }}
        >
          <Field label="Cost centers" name="centers">
            <MultiSelect options={COST_CENTERS} defaultValue={['fin']} size={size} onValueChange={onValueChange} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="primary">
              Submit
            </Button>
            <Button type="reset">Reset</Button>
          </div>
          <output data-testid="posted">{posted}</output>
        </form>
      );
    }
    return <Host />;
  },
};

/** The same field low in a tall page, for the virtual keyboard e2e (`visualViewport` simulated). */
export const KeyboardSafe: Story = {
  render: (args) => (
    <div>
      <div style={{ height: '40vh' }} />
      <div style={column}>
        <Field label="Cost centers">
          <Controlled {...args} options={MANY} />
        </Field>
      </div>
      <div style={{ height: '80vh' }} />
    </div>
  ),
};

/** The list is above the dialog and takes the clicks; the first Escape closes only the list. */
export const InsideDialog: Story = {
  tags: ['visual'],
  render: (args) => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="primary">Open</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Split invoice</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <Field label="Cost centers">
            <Controlled {...args} initial={['fin']} />
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
    const dialog = await within(document.body).findByRole('dialog', { name: 'Split invoice' });
    const control = within(dialog).getByRole('combobox', { name: 'Cost centers' });
    await userEvent.click(control);
    const list = await listbox();
    for (const option of within(list).getAllByRole('option')) {
      const box = option.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      await expect(option.contains(hit)).toBe(true);
    }
    await userEvent.click(within(list).getByRole('option', { name: 'Sales' }));
    await expect(args.onValueChange).toHaveBeenLastCalledWith(['fin', 'sal']);
    await expect(within(document.body).getByRole('dialog', { name: 'Split invoice' })).toBeInTheDocument();
    await repositionAfterMotion();
  },
};

/** Same stacking in a Sheet. */
export const InsideSheet: Story = {
  render: (args) => (
    <Sheet defaultOpen>
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Invoices</h1>
      </main>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Split invoice</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Field label="Cost centers">
            <Controlled {...args} />
          </Field>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};
