import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';
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
  // No `component`: the stories pass URL args (e2e) that the docgen-inferred argTypes would reject; the
  // real props table comes from `subcomponents` (docgen only, no inferred argTypes).
  subcomponents: { RadioGroup },
  parameters: { layout: 'padded', docs: { description: { component: "RadioGroup: native `<input type=\"radio\">` items (`RadioGroupItem`) with roving focus, arrow-key selection, and `forced` / `locked` / `disabled` states through a surrounding `Field`." } } },
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

// These stories render fixed content: besides the `onValueChange` spy (Actions panel), no meta arg reaches the DOM.
const NO_CONTROLS = { controls: { disable: true } };

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

interface UncontrolledDemoProps extends DemoArgs {
  /** Called by the Lock / Unlock buttons: the story adapter mirrors it into the `fieldState` arg. */
  onFieldStateChange: (state: FieldState) => void;
}

/**
 * An UNCONTROLLED group (`defaultValue`) in a Field whose state the Lock / Unlock buttons switch after
 * mount, without remounting the group: the value the user picked survives a Lock. The Field state is
 * local, seeded from the `fieldState` arg and re-synced when the arg changes (Controls panel).
 */
function UncontrolledBlockedDemo({
  fieldState,
  invalid,
  required,
  orientation,
  value,
  onValueChange,
  onFieldStateChange,
}: UncontrolledDemoProps) {
  const [state, setState] = useState<FieldState>(fieldState);
  useEffect(() => setState(fieldState), [fieldState]);
  const [calls, setCalls] = useState<string[]>([]);
  const change = (next: FieldState) => {
    setState(next);
    onFieldStateChange(next);
  };
  return (
    <form style={column}>
      <Field
        label="Plan"
        error={invalid ? 'Pick a plan to continue.' : undefined}
        required={required}
        {...stateProps(state)}
      >
        {/* A new `value` arg is a new initial value: remount, `defaultValue` is read only at mount. */}
        <RadioGroup
          key={value}
          defaultValue={value === '' ? undefined : value}
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
        <Button type="button" variant="secondary" disabled={state === 'locked'} onClick={() => change('locked')}>
          Lock
        </Button>
        <Button type="button" variant="secondary" disabled={state === 'default'} onClick={() => change('default')}>
          Unlock
        </Button>
        <Button type="reset" variant="secondary">
          Reset
        </Button>
      </div>
      <p style={{ margin: 0 }}>
        Field state: <strong data-testid="field-state">{state}</strong>
      </p>
      <p style={{ margin: 0 }}>
        onValueChange calls: <output data-testid="calls">{JSON.stringify(calls)}</output>
      </p>
    </form>
  );
}

const uncontrolledBlocked: Story = {
  args: { fieldState: 'locked', value: 'team' },
  argTypes: {
    value: { description: 'Initial value (`defaultValue`): changing it remounts the group.' },
    fieldState: { description: 'Initial Field state; Lock / Unlock change it after mount (and update this control).' },
    disabledItem: { table: { disable: true } },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs<DemoArgs>();
    return <UncontrolledBlockedDemo {...args} onFieldStateChange={(fieldState) => updateArgs({ fieldState })} />;
  },
};

/**
 * An UNCONTROLLED group in a Field that starts locked (`fieldState: default` starts it editable);
 * Lock / Unlock switch the Field state after mount without remounting the group, Reset is a form
 * reset. The output lists every `onValueChange` call (also in Actions): a blocked gesture must change
 * and report nothing, a real click after unlocking or after a reset must report. Driven by the e2e, so
 * it has no play function: see `UncontrolledBlockedWalkthrough`.
 */
export const UncontrolledBlocked: Story = { ...uncontrolledBlocked };

/**
 * `UncontrolledBlocked` scripted: while locked clicks on a radio, an inline label and the Field label,
 * and the arrow keys, change and report nothing; Unlock, a click selects Business and reports it; Lock
 * keeps it (no remount) and blocks the arrows again; Unlock, a click reports Enterprise; Reset restores
 * Team and reports nothing. A separate story because the e2e open `UncontrolledBlocked` with its
 * default args.
 */
export const UncontrolledBlockedWalkthrough: Story = {
  ...uncontrolledBlocked,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'locked' || args.value !== 'team' || args.invalid || args.required) return;
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup');
    const radio = (name: string) => canvas.getByRole('radio', { name });
    const calls = canvas.getByTestId('calls');
    const lock = canvas.getByRole('button', { name: 'Lock' });
    const unlock = canvas.getByRole('button', { name: 'Unlock' });
    await expect(group).toHaveAttribute('aria-readonly', 'true');
    await expect(group).toHaveAccessibleDescription('Decided by the framework agreement.');
    await expect(lock).toBeDisabled();
    await expect(radio('Team')).toBeChecked();
    await expect(calls).toHaveTextContent('[]');

    await userEvent.click(radio('Business'));
    await userEvent.click(canvas.getByText('Enterprise'));
    await userEvent.click(canvas.getByText('Plan'));
    radio('Team').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowUp}');
    await expect(radio('Team')).toBeChecked();
    await expect(calls).toHaveTextContent('[]');
    // Nothing reached Actions either. Checked here, before the first Lock / Unlock: those update the args,
    // and an args update clears the spies' call history, so later calls are counted by the output above.
    await expect(args.onValueChange).not.toHaveBeenCalled();

    await userEvent.click(unlock);
    await waitFor(() => expect(group).not.toHaveAttribute('aria-readonly'));
    await expect(canvas.getByTestId('field-state')).toHaveTextContent('default');
    await expect(unlock).toBeDisabled();
    await userEvent.click(radio('Business'));
    await expect(radio('Business')).toBeChecked();
    await expect(calls).toHaveTextContent('["business"]');

    await userEvent.click(lock);
    await waitFor(() => expect(group).toHaveAttribute('aria-readonly', 'true'));
    // Same node, same value: locking after mount does not remount the uncontrolled group.
    await expect(canvas.getByRole('radiogroup')).toBe(group);
    await expect(radio('Business')).toBeChecked();
    radio('Business').focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(radio('Business')).toBeChecked();

    await userEvent.click(unlock);
    await userEvent.click(radio('Enterprise'));
    await expect(calls).toHaveTextContent('["business","enterprise"]');
    await userEvent.click(canvas.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(radio('Team')).toBeChecked());
    await expect(calls).toHaveTextContent('["business","enterprise"]');
  },
};

/** Orientation × Field state, with help and an error, for the visual regression. */
export const StateMatrix: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: ({ onValueChange }) => (
    // No reserved error line (`reserveMessageSpace={false}`): the reserved line reads as the gap to the
    // next Field, and an "invalid" entry fills it with its error, so the gap after it would be narrower.
    <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {(['vertical', 'horizontal'] as const).flatMap((orientation) =>
        [...STATES, 'invalid' as const].map((state) => {
          const props = state === 'invalid' ? ({ error: 'This plan is not available.' } as const) : stateProps(state);
          return (
            <Field key={`${orientation}-${state}`} label={`${orientation} / ${state}`} help="Help text." reserveMessageSpace={false} {...props}>
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
  parameters: NO_CONTROLS,
  render: ({ onValueChange }) => (
    <Field label="Billing" help="Choose how you want to be billed.">
      <Controlled initial="b" orientation="horizontal" options={LONG} onValueChange={onValueChange} />
    </Field>
  ),
};

/** Uncontrolled inside a native form: `name`/`value` are submitted, and Reset restores `defaultValue` without reporting. */
export const InForm: Story = {
  parameters: NO_CONTROLS,
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
  parameters: NO_CONTROLS,
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
