import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import type { IsoDate } from '../calendar/date-math';
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
import { DatePicker, type DatePickerInvalidReason, type DatePickerSize } from './DatePicker';

// Every story passes a fixed `today` and locale: the baselines never change with the real date.
const TODAY = '2026-03-10';
const LOCALES = ['en-US', 'it-IT', 'de-DE', 'ja-JP'] as const;
const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];
const SIZES: DatePickerSize[] = ['sm', 'md'];

interface DemoArgs {
  locale: (typeof LOCALES)[number];
  fieldState: FieldState;
  size: DatePickerSize;
  today: IsoDate;
  min: IsoDate;
  max: IsoDate;
  onValueChange: (value: IsoDate | null) => void;
  onInvalidInput: (text: string, reason: DatePickerInvalidReason) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/DatePicker',
  // Overlays opened at mount, autofocus and history changes would take over the Docs page if the stories
  // were rendered inline: each story gets its own iframe there.
  // No `component`: the stories pass URL args (e2e) that the docgen-inferred argTypes would reject; the
  // real props table comes from `subcomponents` (docgen only, no inferred argTypes).
  subcomponents: { DatePicker },
  parameters: { layout: 'padded', docs: { story: { inline: false, height: '360px' }, description: { component: "DatePicker: a text input in the locale's numeric format plus a Calendar popover. Typing and picking give the same ISO date through `onValueChange`; text that is not a valid date is reported through `onInvalidInput`." } } },
  argTypes: {
    locale: { control: 'select', options: LOCALES, description: 'Order and separator of the typed text, calendar names.' },
    // forced = value decided by a business rule; locked = not editable. Neither ever opens the calendar.
    fieldState: { control: 'radio', options: STATES, description: 'The state of the enclosing Field.' },
    size: { control: 'radio', options: SIZES },
    today: { control: 'text', description: 'The date marked as today, YYYY-MM-DD.' },
    min: { control: 'text', description: 'First selectable date, YYYY-MM-DD (empty = none).' },
    max: { control: 'text', description: 'Last selectable date, YYYY-MM-DD (empty = none).' },
    onValueChange: { control: false },
    onInvalidInput: { control: false },
  },
  args: {
    locale: 'en-US',
    fieldState: 'default',
    size: 'md',
    today: TODAY,
    min: '',
    max: '2026-12-31',
    onValueChange: fn(),
    onInvalidInput: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

// These stories fix every DatePicker prop themselves: besides the two spies (Actions panel), no meta arg reaches the DOM.
const NO_CONTROLS = { controls: { disable: true } };

const stateProps = (state: FieldState) =>
  (state === 'default' ? { state } : { state, stateReason: 'Set by the framework agreement.' }) as FieldStateProps;

/** Controlled value in local state, echoed below the field. */
function PlaygroundDemo(args: DemoArgs) {
  const [value, setValue] = useState<IsoDate | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
      <Field label="Due date" name="dueDate" help="The day the invoice must be paid." {...stateProps(args.fieldState)}>
        <DatePicker
          locale={args.locale}
          size={args.size}
          today={args.today}
          min={args.min || undefined}
          max={args.max || undefined}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            args.onValueChange(next);
          }}
          onInvalidInput={args.onInvalidInput}
        />
      </Field>
      <output data-testid="value">{value ?? 'none'}</output>
    </div>
  );
}

/**
 * Controls: locale, Field state, size, `today`, limits; `onValueChange` and `onInvalidInput` are in
 * Actions. The play function types a date and presses Enter, opens the calendar with the button,
 * moves to the 20th with the arrows and picks it with Enter (text, value and focus back on the
 * button), then types an impossible date and checks `onInvalidInput` and the `null` value.
 */
export const Playground: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.locale !== 'en-US' || args.fieldState !== 'default' || args.today !== TODAY || args.min || args.max !== '2026-12-31') return;
    const canvas = within(canvasElement);
    const body = within(document.body);
    const input = canvas.getByRole('textbox', { name: 'Due date' });
    await expect(input).toHaveAttribute('placeholder', 'MM/DD/YYYY');
    await userEvent.type(input, '03/15/2026{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('2026-03-15');
    await expect(canvas.getByTestId('value')).toHaveTextContent('2026-03-15');

    const button = canvas.getByRole('button', { name: /^Choose date, selected March 15, 2026/ });
    await userEvent.click(button);
    const dialog = await body.findByRole('dialog', { name: 'Choose date' });
    await expect(within(dialog).getByRole('gridcell', { name: 'Sunday, March 15, 2026' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    await expect(within(dialog).getByRole('gridcell', { name: 'Friday, March 20, 2026' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(body.queryByRole('dialog', { name: 'Choose date' })).toBeNull());
    await expect(input).toHaveValue('03/20/2026');
    await expect(args.onValueChange).toHaveBeenCalledTimes(2);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('2026-03-20');
    await expect(canvas.getByTestId('value')).toHaveTextContent('2026-03-20');
    await waitFor(() => expect(canvas.getByRole('button', { name: /^Choose date, selected March 20, 2026/ })).toHaveFocus());

    // An impossible date: the value becomes null (the form never keeps a date the user does not
    // see), the reason is reported, the text stays to be corrected.
    await userEvent.clear(input);
    await userEvent.type(input, '13/45/2026{Enter}');
    await expect(args.onInvalidInput).toHaveBeenCalledTimes(1);
    await expect(args.onInvalidInput).toHaveBeenLastCalledWith('13/45/2026', 'unparsable');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(null);
    await expect(input).toHaveValue('13/45/2026');
    await expect(canvas.getByTestId('value')).toHaveTextContent('none');
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
};

/** Mounted empty, then a date arrives from a "fetch": the text and the button follow, nothing is reported. */
export const AsyncHydration: Story = {
  parameters: NO_CONTROLS,
  render: (args) => {
    function Demo() {
      const [value, setValue] = useState<IsoDate | null>(null);
      useEffect(() => {
        const timer = setTimeout(() => setValue('2026-07-14'), 50);
        return () => clearTimeout(timer);
      }, []);
      return (
        <div style={{ maxWidth: 320 }}>
          <Field label="Delivery date">
            <DatePicker
              locale="en-US"
              today={TODAY}
              value={value}
              onValueChange={(next) => {
                setValue(next);
                args.onValueChange(next);
              }}
              onInvalidInput={args.onInvalidInput}
            />
          </Field>
        </div>
      );
    }
    return <Demo />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Delivery date' })).toHaveValue('07/14/2026'));
    await expect(canvas.getByRole('button', { name: /^Choose date, selected July 14, 2026/ })).toBeInTheDocument();
    // Focus in and out without editing: still nothing.
    await userEvent.click(canvas.getByRole('textbox', { name: 'Delivery date' }));
    await userEvent.tab();
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await expect(args.onInvalidInput).not.toHaveBeenCalled();
  },
};

/** Field states switched at run time (also while the calendar is open): disabled, forced, locked. */
export const FieldStates: Story = {
  parameters: NO_CONTROLS,
  render: (args) => {
    function Demo() {
      const [state, setState] = useState<FieldState>('default');
      return (
        <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
          <Field label="Contract start" name="contractStart" {...stateProps(state)}>
            <DatePicker locale="en-US" today={TODAY} defaultValue="2026-03-16" onValueChange={args.onValueChange} />
          </Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATES.map((s) => (
              // Mouse-down is cancelled so the click does not take the focus (nor close the calendar).
              <Button key={s} variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => setState(s)}>
                Make {s}
              </Button>
            ))}
          </div>
        </div>
      );
    }
    return <Demo />;
  },
};

function DialogDemo({ args, defaultOpen }: { args: DemoArgs; defaultOpen: boolean }) {
  const [value, setValue] = useState<IsoDate | null>('2026-03-05');
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <Button variant="primary">Edit invoice</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Edit invoice</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <Field label="Due date">
            <DatePicker
              locale="en-US"
              today={TODAY}
              value={value}
              onValueChange={(next) => {
                setValue(next);
                args.onValueChange(next);
              }}
              onInvalidInput={args.onInvalidInput}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The calendar is above the dialog. The play function opens it, checks that a day takes the hit,
 * presses Escape (only the calendar closes, the focus is back on the button, the dialog stays open),
 * then opens it again for the picture.
 */
export const InsideDialog: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: (args) => <DialogDemo args={args} defaultOpen />,
  play: async ({ args }) => {
    const body = within(document.body);
    const modal = await body.findByRole('dialog', { name: 'Edit invoice' });
    const button = within(modal).getByRole('button', { name: /^Choose date/ });
    await userEvent.click(button);
    const popover = await body.findByRole('dialog', { name: 'Choose date' });
    const cell = within(popover).getByRole('gridcell', { name: 'Thursday, March 5, 2026' });
    await expect(cell).toHaveFocus();
    await repositionAfterMotion();
    const box = cell.getBoundingClientRect();
    await expect(cell.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog', { name: 'Choose date' })).toBeNull());
    await expect(body.getByRole('dialog', { name: 'Edit invoice' })).toBeInTheDocument();
    await waitFor(() => expect(button).toHaveFocus());
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await userEvent.click(button);
    await body.findByRole('dialog', { name: 'Choose date' });
    await repositionAfterMotion();
  },
};

/** Same stacking inside a Sheet. For the e2e. */
export const InsideSheet: Story = {
  parameters: NO_CONTROLS,
  render: (args) => (
    <Sheet defaultOpen>
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Invoices</h1>
      </main>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit invoice</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Field label="Due date">
            <DatePicker locale="en-US" today={TODAY} defaultValue="2026-03-05" onValueChange={args.onValueChange} />
          </Field>
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};

/** The field low on a tall page, for the virtual keyboard e2e (spec §1.10). */
export const KeyboardSafe: Story = {
  parameters: NO_CONTROLS,
  render: (args) => (
    // Same layout as Forms/Field KeyboardSafe: enough content above for the field to be scrolled to
    // the bottom edge of the screen (where the keyboard will cover it), and the inset reserved below.
    <div style={{ paddingBottom: 'var(--rop-keyboard-inset, 0px)' }}>
      <div style={{ height: '120dvh' }}>Long content before the field.</div>
      <div style={{ maxWidth: 320 }} data-testid="kb-field">
        <Field label="Due date">
          <DatePicker locale="en-US" today={TODAY} onValueChange={args.onValueChange} />
        </Field>
      </div>
      <div style={{ height: '80vh' }} />
    </div>
  ),
};

const column = { display: 'grid', gap: 8, maxWidth: 340 } as const;

/** Closed, empty and with a value, both sizes, every Field state with its reason, an error. For the visual regression. */
export const States: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: ({ onValueChange }) => (
    <div style={column}>
      <Field label="Empty">
        <DatePicker locale="en-US" today={TODAY} onValueChange={onValueChange} />
      </Field>
      <Field label="With a value">
        <DatePicker locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Small">
        <DatePicker locale="en-US" today={TODAY} size="sm" defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Disabled" state="disabled">
        <DatePicker locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Forced" state="forced" stateReason="Set by the payment terms.">
        <DatePicker locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Locked" state="locked" stateReason="The invoice is already approved.">
        <DatePicker locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Invalid" error="Enter a date as MM/DD/YYYY." required>
        <DatePicker locale="en-US" today={TODAY} onValueChange={onValueChange} />
      </Field>
    </div>
  ),
};

/** Placeholder and text in the locale's order and separator. For the visual regression. */
export const Locales: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: ({ onValueChange }) => (
    <div style={column}>
      {(['it-IT', 'de-DE', 'ja-JP', 'en-US'] as const).map((locale) => (
        <div key={locale} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label={`${locale}, empty`}>
            <DatePicker locale={locale} today={TODAY} onValueChange={onValueChange} />
          </Field>
          <Field label={`${locale}, with a value`}>
            <DatePicker locale={locale} today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
          </Field>
        </div>
      ))}
    </div>
  ),
};

/** The calendar open under the field (`it-IT`, Monday first). For the visual regression on every viewport. */
export const Open: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: ({ onValueChange }) => (
    <div style={{ maxWidth: 320 }}>
      <Field label="Due date (it-IT)">
        <DatePicker locale="it-IT" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Choose date/ }));
    const popover = await within(document.body).findByRole('dialog', { name: 'Choose date' });
    await expect(within(popover).getByRole('gridcell', { name: 'martedì 17 marzo 2026' })).toHaveFocus();
    await repositionAfterMotion();
  },
};
