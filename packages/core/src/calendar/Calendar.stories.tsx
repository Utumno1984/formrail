import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { Calendar } from './Calendar';
import { dayOfWeek, type IsoDate, type IsoMonth, type Weekday } from './date-math';

// Every story passes a fixed `today` and month: the baselines never change with the real date.
const TODAY = '2026-03-10';
const LOCALES = ['en-US', 'it-IT', 'de-DE', 'ar-EG'] as const;
const WEEK_STARTS = ['auto', '0', '1', '2', '3', '4', '5', '6'] as const;
const isWeekend = (date: IsoDate) => dayOfWeek(date) === 0 || dayOfWeek(date) === 6;

interface DemoArgs {
  locale: (typeof LOCALES)[number];
  weekStartsOn: (typeof WEEK_STARTS)[number];
  defaultMonth: IsoMonth;
  today: IsoDate;
  min: IsoDate;
  max: IsoDate;
  disableWeekends: boolean;
  disabled: boolean;
  readOnly: boolean;
  onValueChange: (value: IsoDate) => void;
  onMonthChange: (month: IsoMonth) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Calendar',
  parameters: { layout: 'padded' },
  argTypes: {
    locale: { control: 'select', options: LOCALES },
    // 'auto' = derived from the locale (Intl week info, else the CLDR region table, else Monday).
    weekStartsOn: {
      control: 'select',
      options: WEEK_STARTS,
      labels: { auto: 'auto (from locale)', 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' },
    },
    defaultMonth: { control: 'text', description: 'Initial month, YYYY-MM (applied on remount).' },
    today: { control: 'text', description: 'The date marked as today, YYYY-MM-DD.' },
    min: { control: 'text', description: 'First selectable date, YYYY-MM-DD (empty = none).' },
    max: { control: 'text', description: 'Last selectable date, YYYY-MM-DD (empty = none).' },
    disableWeekends: { control: 'boolean', description: 'Demo of `isDateDisabled`: Saturdays and Sundays.' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    onValueChange: { control: false },
    onMonthChange: { control: false },
  },
  args: {
    locale: 'en-US',
    weekStartsOn: 'auto',
    defaultMonth: '2026-03',
    today: TODAY,
    min: '',
    max: '2026-04-20',
    disableWeekends: false,
    disabled: false,
    readOnly: false,
    onValueChange: fn(),
    onMonthChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const toProps = (args: DemoArgs) => ({
  locale: args.locale,
  weekStartsOn: args.weekStartsOn === 'auto' ? undefined : (Number(args.weekStartsOn) as Weekday),
  today: args.today,
  min: args.min || undefined,
  max: args.max || undefined,
  isDateDisabled: args.disableWeekends ? isWeekend : undefined,
  disabled: args.disabled,
  readOnly: args.readOnly,
  onMonthChange: args.onMonthChange,
});

/** Controlled selection in local state, echoed below the calendar. */
function PlaygroundDemo(args: DemoArgs) {
  const [value, setValue] = useState<IsoDate | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <Field label="Delivery date" help="Deliveries are scheduled up to April 20.">
        <Calendar
          key={args.defaultMonth}
          {...toProps(args)}
          defaultMonth={args.defaultMonth}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            args.onValueChange(next);
          }}
        />
      </Field>
      <output data-testid="value">{value ?? 'none'}</output>
    </div>
  );
}

/**
 * Controls: locale, first day of the week, limits, `today`, `disabled`/`readOnly`; `onValueChange`
 * and `onMonthChange` are in Actions. The play function Tabs into the grid (landing on today), goes
 * to the next month with PageDown, down a week with ArrowDown, selects with Enter and checks the
 * ISO string; then moves past `max` and checks that Enter and a click change nothing.
 */
export const Playground: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.locale !== 'en-US' || args.max !== '2026-04-20' || args.disabled || args.readOnly || args.today !== TODAY) return;
    const canvas = within(canvasElement);
    await userEvent.tab(); // previous month
    await userEvent.tab(); // next month
    await userEvent.tab(); // the grid
    await expect(canvas.getByRole('gridcell', { name: 'Tuesday, March 10, 2026' })).toHaveFocus();
    await userEvent.keyboard('{PageDown}');
    await expect(canvas.getByText('April 2026')).toBeInTheDocument();
    await expect(canvas.getByRole('gridcell', { name: 'Friday, April 10, 2026' })).toHaveFocus();
    await expect(args.onMonthChange).toHaveBeenLastCalledWith('2026-04');
    await userEvent.keyboard('{ArrowDown}');
    const picked = canvas.getByRole('gridcell', { name: 'Friday, April 17, 2026' });
    await expect(picked).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(picked).toHaveAttribute('aria-selected', 'true');
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('2026-04-17');
    await expect(canvas.getByTestId('value')).toHaveTextContent('2026-04-17');

    // Past `max`: reachable with the keyboard, not selectable (Enter, Space and a click are no-ops).
    await userEvent.keyboard('{ArrowDown}');
    const beyond = canvas.getByRole('gridcell', { name: 'Friday, April 24, 2026' });
    await expect(beyond).toHaveFocus();
    await expect(beyond).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await userEvent.click(canvas.getByRole('gridcell', { name: 'Saturday, April 25, 2026' }));
    await expect(beyond).toHaveAttribute('aria-selected', 'false');
    await expect(picked).toHaveAttribute('aria-selected', 'true');
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole('button', { name: 'Next month' })).toBeDisabled();
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  args: { max: '' },
  render: (args) => <PlaygroundDemo {...args} />,
};

/** Mounted with nothing selected, then a date in July arrives from a "fetch": the month follows, nothing is reported. */
export const AsyncHydration: Story = {
  render: (args) => {
    function Demo() {
      const [value, setValue] = useState<IsoDate | null>(null);
      useEffect(() => {
        const timer = setTimeout(() => setValue('2026-07-14'), 50);
        return () => clearTimeout(timer);
      }, []);
      return (
        <Field label="Delivery date">
          <Calendar locale="en-US" today={TODAY} value={value} onValueChange={args.onValueChange} onMonthChange={args.onMonthChange} />
        </Field>
      );
    }
    return <Demo />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('gridcell', { name: 'Tuesday, July 14, 2026' })).toHaveAttribute('aria-selected', 'true'));
    await expect(canvas.getByText('July 2026')).toBeInTheDocument();
    await expect(args.onValueChange).not.toHaveBeenCalled();
    await expect(args.onMonthChange).not.toHaveBeenCalled();
  },
};

/** A controlled month changed by buttons outside the calendar: while the grid has the focus, it stays on the same day. */
export const ControlledMonth: Story = {
  render: (args) => {
    function Demo() {
      const [month, setMonth] = useState<IsoMonth>('2026-01');
      const [value, setValue] = useState<IsoDate | null>('2026-01-31');
      return (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
          <Calendar
            aria-label="Start date"
            locale="en-US"
            today={TODAY}
            month={month}
            value={value}
            onMonthChange={(next) => {
              setMonth(next);
              args.onMonthChange(next);
            }}
            onValueChange={(next) => {
              setValue(next);
              args.onValueChange(next);
            }}
          />
          <output data-testid="month">{month}</output>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Mouse-down is cancelled so a click keeps the focus where it is (an "external" change). */}
            {(['2026-02', '2026-04', '2026-07'] as const).map((m) => (
              <Button key={m} variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => setMonth(m)}>
                Show {m}
              </Button>
            ))}
          </div>
        </div>
      );
    }
    return <Demo />;
  },
};

/** Field states: the calendar follows `disabled` (out of the tab order) and `forced`/`locked` (navigable, read-only). */
export const InField: Story = {
  render: (args) => {
    function Demo() {
      const [state, setState] = useState<FieldState>('default');
      const props = (state === 'default' ? { state } : { state, stateReason: 'Set by the framework agreement.' }) as FieldStateProps;
      return (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
          <Field label="Contract start" name="contractStart" help="The first day of service." {...props}>
            <Calendar locale="en-US" today={TODAY} defaultValue="2026-03-16" onValueChange={args.onValueChange} />
          </Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['default', 'disabled', 'forced', 'locked'] as const).map((s) => (
              <Button key={s} variant="secondary" onClick={() => setState(s)}>
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

const tile = { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', alignItems: 'start' } as const;

/** Selection + today, limits, disabled dates, `readOnly`, `disabled`, invalid Field (en-US), for the visual regression. */
export const States: Story = {
  tags: ['visual'],
  render: ({ onValueChange }) => (
    <div style={tile}>
      <Field label="Selected and today">
        <Calendar locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Today selected">
        <Calendar locale="en-US" today={TODAY} defaultValue={TODAY} onValueChange={onValueChange} />
      </Field>
      <Field label="Between March 5 and March 20">
        <Calendar locale="en-US" today={TODAY} min="2026-03-05" max="2026-03-20" onValueChange={onValueChange} />
      </Field>
      <Field label="No weekends" help="Saturdays and Sundays are closed.">
        <Calendar locale="en-US" today={TODAY} defaultValue="2026-03-12" isDateDisabled={isWeekend} onValueChange={onValueChange} />
      </Field>
      <Field label="Locked" state="locked" stateReason="Set by the contract.">
        <Calendar locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Disabled" state="disabled">
        <Calendar locale="en-US" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
      </Field>
      <Field label="Invalid" error="Pick a business day.">
        <Calendar locale="en-US" today={TODAY} onValueChange={onValueChange} />
      </Field>
    </div>
  ),
};

/** First day of the week from the locale: `it-IT` starts on Monday, `en-US` on Sunday (and German names). */
export const Locales: Story = {
  tags: ['visual'],
  render: ({ onValueChange }) => (
    <div style={tile}>
      {(['it-IT', 'en-US', 'de-DE'] as const).map((locale) => (
        <Field key={locale} label={locale}>
          <Calendar locale={locale} today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} />
        </Field>
      ))}
    </div>
  ),
};

/**
 * February 2026 (4 weeks with Sunday first) next to August 2026 (6 weeks): same height. For the e2e
 * and the visual regression.
 */
export const StableFootprint: Story = {
  tags: ['visual'],
  render: ({ onValueChange }) => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'start' }}>
      <Calendar data-testid="february" aria-label="February" locale="en-US" today={TODAY} defaultMonth="2026-02" onValueChange={onValueChange} />
      <Calendar data-testid="august" aria-label="August" locale="en-US" today={TODAY} defaultMonth="2026-08" onValueChange={onValueChange} />
    </div>
  ),
};

/**
 * `ar-EG` inside `dir="rtl"`: Arabic names and digits, Saturday first, and the left/right arrow keys
 * (and the month arrows) mirrored. Layout best effort (spec §1.13.4); the ticket asks for a baseline.
 */
export const RightToLeft: Story = {
  tags: ['visual'],
  render: ({ onValueChange, onMonthChange }) => (
    <div dir="rtl">
      <Calendar aria-label="التاريخ" locale="ar-EG" today={TODAY} defaultValue="2026-03-17" onValueChange={onValueChange} onMonthChange={onMonthChange} />
    </div>
  ),
};
