import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { RadioGroup, RadioGroupItem, type RadioGroupOrientation } from './RadioGroup';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];
const OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'team', label: 'Team' },
  { value: 'business', label: 'Business' },
  { value: 'enterprise', label: 'Enterprise' },
];

interface DemoArgs {
  orientation: RadioGroupOrientation;
  fieldState: FieldState;
  disabledItem: string;
  invalid: boolean;
  required: boolean;
  value: string;
  onValueChange: (value: string) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/RadioGroup',
  parameters: { layout: 'padded' },
  argTypes: {
    orientation: { control: 'radio', options: ['vertical', 'horizontal'] satisfies RadioGroupOrientation[] },
    // forced = value decided by a business rule; locked = not editable. Neither changes on click or arrows.
    fieldState: { control: 'radio', options: STATES },
    disabledItem: { control: 'select', options: ['none', ...OPTIONS.map((o) => o.value)] },
    invalid: { control: 'boolean' },
    required: { control: 'boolean' },
    value: { control: 'select', options: ['', ...OPTIONS.map((o) => o.value)] },
    onValueChange: { control: false },
  },
  args: {
    orientation: 'vertical',
    fieldState: 'default',
    disabledItem: 'none',
    invalid: false,
    required: false,
    value: 'free',
    onValueChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

const column = { display: 'grid', gap: 16, maxWidth: 360 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Decided by the framework agreement.' }) as FieldStateProps;

interface GroupProps {
  initial: string;
  orientation: RadioGroupOrientation;
  disabledItem?: string;
  onValueChange: (value: string) => void;
  options?: typeof OPTIONS;
}

/** Local state seeded from `initial`; reports every user selection to `onValueChange` (the Actions panel). */
function Controlled({ initial, orientation, disabledItem, onValueChange, options = OPTIONS }: GroupProps) {
  const [value, setValue] = useState(initial);
  // The Controls panel drives the group; an external change is a plain render (no onValueChange).
  useEffect(() => setValue(initial), [initial]);
  return (
    <RadioGroup
      value={value === '' ? null : value}
      orientation={orientation}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    >
      {options.map((o) => (
        <RadioGroupItem key={o.value} value={o.value} disabled={o.value === disabledItem}>
          {o.label}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}

/** The Playground body: the Field state starts from the Controls, and a button can switch it to `locked`. */
function PlaygroundDemo({ fieldState, invalid, required, orientation, disabledItem, value, onValueChange }: DemoArgs) {
  const [state, setState] = useState<FieldState>(fieldState);
  useEffect(() => setState(fieldState), [fieldState]);
  return (
    <div style={column}>
      <Field
        label="Plan"
        name="plan"
        help="You can change it later."
        error={invalid ? 'Pick a plan to continue.' : undefined}
        required={required}
        {...stateProps(state)}
      >
        <Controlled initial={value} orientation={orientation} disabledItem={disabledItem} onValueChange={onValueChange} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" onClick={() => setState('locked')}>
          Lock this value
        </Button>
        <Button variant="secondary" onClick={() => setState('default')}>
          Make editable
        </Button>
      </div>
    </div>
  );
}

/**
 * Controls: orientation, Field state, disabled item, `invalid`, `required` and the initial value;
 * `onValueChange` is in Actions. The play function Tabs into the group, selects the third option
 * with the arrow keys (skipping the disabled second one), then locks the Field and checks that
 * arrows and clicks change nothing and report nothing.
 */
export const Playground: Story = {
  args: { disabledItem: 'team', value: 'free' },
  render: (args) => <PlaygroundDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'default' || args.disabledItem !== 'team' || args.value !== 'free') return;
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole('radio', { name: 'Free' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    const business = canvas.getByRole('radio', { name: 'Business' });
    await expect(business).toHaveFocus();
    await expect(business).toBeChecked();
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('business');

    await userEvent.click(canvas.getByRole('button', { name: 'Lock this value' }));
    await waitFor(() => expect(canvas.getByRole('radiogroup')).toHaveAttribute('aria-readonly', 'true'));
    business.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowUp}');
    await userEvent.click(canvas.getByRole('radio', { name: 'Free' }));
    await userEvent.click(canvas.getByText('Plan'));
    await expect(business).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Free' })).not.toBeChecked();
    await expect(args.onValueChange).toHaveBeenCalledTimes(1);
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  args: { disabledItem: 'team' },
  render: (args) => <PlaygroundDemo {...args} />,
};

/**
 * An UNCONTROLLED group in a Field whose state is switched by buttons; a counter shows how many times
 * `onValueChange` was called. For the e2e: a blocked gesture must change and report nothing, and the
 * first real click after unlocking (or after a form reset) must report again.
 */
export const UncontrolledBlocked: Story = {
  render: ({ fieldState, orientation, onValueChange }) => {
    function Demo() {
      const [state, setState] = useState<FieldState>(fieldState === 'default' ? 'locked' : fieldState);
      const [calls, setCalls] = useState<string[]>([]);
      return (
        <form style={column}>
          <Field label="Plan" {...stateProps(state)}>
            <RadioGroup
              defaultValue="team"
              orientation={orientation}
              onValueChange={(next) => {
                setCalls((cur) => [...cur, next]);
                onValueChange(next);
              }}
            >
              {OPTIONS.map((o) => (
                <RadioGroupItem key={o.value} value={o.value}>
                  {o.label}
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => setState('default')}>
              Unlock
            </Button>
            <Button type="reset" variant="secondary">
              Reset
            </Button>
          </div>
          <output data-testid="calls">{JSON.stringify(calls)}</output>
        </form>
      );
    }
    return <Demo />;
  },
};

/** Orientation × Field state, with help and an error, for the visual regression. */
export const StateMatrix: Story = {
  tags: ['visual'],
  render: ({ onValueChange }) => (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {(['vertical', 'horizontal'] as const).flatMap((orientation) =>
        [...STATES, 'invalid' as const].map((state) => {
          const props = state === 'invalid' ? ({ error: 'This plan is not available.' } as const) : stateProps(state);
          return (
            <Field key={`${orientation}-${state}`} label={`${orientation} / ${state}`} help="Help text." {...props}>
              <Controlled
                initial="team"
                orientation={orientation}
                disabledItem={state === 'default' ? 'enterprise' : undefined}
                onValueChange={onValueChange}
              />
            </Field>
          );
        }),
      )}
    </div>
  ),
};

const LONG = [
  { value: 'a', label: 'Monthly billing, cancel at any time' },
  { value: 'b', label: 'Yearly billing with two months free' },
  { value: 'c', label: 'Three-year commitment with a dedicated account manager' },
  { value: 'd', label: 'Pay as you go, invoiced at the end of the quarter' },
  { value: 'e', label: 'Custom contract negotiated with our sales team' },
];

/** Five long options, horizontal: they wrap, with no horizontal overflow on a 375px screen. */
export const LongHorizontal: Story = {
  tags: ['visual'],
  render: ({ onValueChange }) => (
    <Field label="Billing" help="Choose how you want to be billed.">
      <Controlled initial="b" orientation="horizontal" options={LONG} onValueChange={onValueChange} />
    </Field>
  ),
};

/** Uncontrolled inside a native form: `name`/`value` are submitted, and Reset restores `defaultValue` without reporting. */
export const InForm: Story = {
  render: ({ onValueChange }) => (
    <form
      style={column}
      onSubmit={(event) => {
        event.preventDefault();
        event.currentTarget.dataset.submitted = JSON.stringify(Array.from(new FormData(event.currentTarget).entries()));
      }}
    >
      <Field label="Plan" name="plan">
        <RadioGroup defaultValue="team" onValueChange={onValueChange}>
          {OPTIONS.map((o) => (
            <RadioGroupItem key={o.value} value={o.value}>
              {o.label}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit">Submit</Button>
        <Button type="reset" variant="secondary">
          Reset
        </Button>
      </div>
    </form>
  ),
};

/** Mounted with nothing selected, then `team` arrives from a "fetch": the selection updates and nothing is reported. */
export const AsyncHydration: Story = {
  render: ({ onValueChange }) => {
    function Demo() {
      const [value, setValue] = useState<string | null>(null);
      useEffect(() => {
        const timer = setTimeout(() => setValue('team'), 50);
        return () => clearTimeout(timer);
      }, []);
      return (
        <Field label="Plan">
          <RadioGroup value={value} onValueChange={onValueChange}>
            {OPTIONS.map((o) => (
              <RadioGroupItem key={o.value} value={o.value}>
                {o.label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </Field>
      );
    }
    return <Demo />;
  },
  play: async ({ args, canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('radio', { name: 'Team' })).toBeChecked());
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};
