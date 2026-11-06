import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { Checkbox, type CheckedState } from './Checkbox';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];
const CHECKED_OPTIONS: CheckedState[] = [true, false, 'indeterminate'];

interface DemoArgs {
  checked: CheckedState;
  fieldState: FieldState;
  invalid: boolean;
  required: boolean;
  fieldLabel: string;
  inlineLabel: string;
  onCheckedChange: (checked: boolean) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Checkbox',
  // No `component`: the stories pass URL args (e2e) that the docgen-inferred argTypes would reject; the
  // real props table comes from `subcomponents` (docgen only, no inferred argTypes).
  subcomponents: { Checkbox },
  parameters: { layout: 'padded', docs: { description: { component: "Checkbox: a styled native `<input type=\"checkbox\">` with an optional inline label, a mixed (`indeterminate`) state, and `forced` / `locked` / `disabled` states through a surrounding `Field`." } } },
  argTypes: {
    checked: { control: 'radio', options: CHECKED_OPTIONS },
    // forced = value decided by a business rule; locked = not editable. Neither changes on click or Space.
    fieldState: { control: 'radio', options: STATES },
    invalid: { control: 'boolean' },
    required: { control: 'boolean' },
    fieldLabel: { control: 'text' },
    inlineLabel: { control: 'text' },
    onCheckedChange: { control: false },
  },
  args: {
    checked: false,
    fieldState: 'default',
    invalid: false,
    required: false,
    fieldLabel: 'Terms',
    inlineLabel: 'I accept the terms and conditions',
    onCheckedChange: fn(),
  },
};

export default meta;
type Story = StoryObj<DemoArgs>;

// These stories render fixed content: besides the `onCheckedChange` spy (Actions panel), no meta arg reaches the DOM.
const NO_CONTROLS = { controls: { disable: true } };

const column = { display: 'grid', gap: 16, maxWidth: 320 } as const;
const stateProps = (state: FieldState) =>
  ({ state, stateReason: state === 'default' ? undefined : 'Decided by the framework agreement.' }) as FieldStateProps;

/** Local state seeded from `initial`; reports every user toggle to `onCheckedChange` (the Actions panel). */
function Controlled({
  initial,
  inlineLabel,
  onCheckedChange,
}: {
  initial: CheckedState;
  inlineLabel?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const [value, setValue] = useState<CheckedState>(initial);
  // The Controls panel drives the box; an external change is a plain render (no onCheckedChange).
  useEffect(() => setValue(initial), [initial]);
  return (
    <Checkbox
      checked={value}
      onCheckedChange={(next) => {
        setValue(next);
        onCheckedChange(next);
      }}
    >
      {inlineLabel}
    </Checkbox>
  );
}

const box = (canvasElement: HTMLElement) => within(canvasElement).getByRole('checkbox');

/** The Playground body: the Field state starts from the Controls, and a button can switch it to `forced`. */
function PlaygroundDemo({ fieldState, invalid, required, fieldLabel, inlineLabel, checked, onCheckedChange }: DemoArgs) {
  const [state, setState] = useState<FieldState>(fieldState);
  useEffect(() => setState(fieldState), [fieldState]);
  return (
    <div style={column}>
      <Field
        label={fieldLabel}
        help="You can change this later."
        error={invalid ? 'You must accept to continue.' : undefined}
        required={required}
        {...stateProps(state)}
      >
        <Controlled initial={checked} inlineLabel={inlineLabel} onCheckedChange={onCheckedChange} />
      </Field>
      <Button variant="secondary" onClick={() => setState('forced')}>
        Force this value
      </Button>
    </div>
  );
}

/**
 * Controls: `checked`, the Field state, `invalid`, `required` and the labels; `onCheckedChange` is in
 * Actions. The play function ticks the box by clicking its inline label, then forces the value with
 * the button and checks that a click on the Field's label and Space change nothing and report nothing.
 */
export const Playground: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'default' || args.checked !== false) return;
    const canvas = within(canvasElement);
    const control = box(canvasElement);
    await userEvent.click(canvas.getByText(args.inlineLabel));
    await expect(control).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(canvas.getByRole('button', { name: 'Force this value' }));
    await waitFor(() => expect(control).toHaveAttribute('aria-readonly', 'true'));
    await userEvent.click(canvas.getByText(args.fieldLabel));
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
};

interface UncontrolledDemoProps extends DemoArgs {
  /** Called by the Lock / Unlock buttons: the story adapter mirrors it into the `fieldState` arg. */
  onFieldStateChange: (state: FieldState) => void;
}

/**
 * An UNCONTROLLED Checkbox (`defaultChecked`) in a Field whose state the Lock / Unlock buttons switch
 * after mount, without remounting the box: the value the user gave survives a Lock. The Field state is
 * local, seeded from the `fieldState` arg and re-synced when the arg changes (Controls panel).
 */
function UncontrolledBlockedDemo({
  checked,
  fieldState,
  invalid,
  required,
  fieldLabel,
  inlineLabel,
  onCheckedChange,
  onFieldStateChange,
}: UncontrolledDemoProps) {
  const [state, setState] = useState<FieldState>(fieldState);
  useEffect(() => setState(fieldState), [fieldState]);
  const [calls, setCalls] = useState<boolean[]>([]);
  const change = (next: FieldState) => {
    setState(next);
    onFieldStateChange(next);
  };
  const indeterminate = checked === 'indeterminate';
  return (
    <form style={column}>
      <Field
        label={fieldLabel}
        error={invalid ? 'You must accept to continue.' : undefined}
        required={required}
        {...stateProps(state)}
      >
        {/* A new `checked` arg is a new initial value: remount, `defaultChecked` is read only at mount. */}
        <Checkbox
          key={String(checked)}
          defaultChecked={checked === true}
          onCheckedChange={(next) => {
            setCalls((cur) => [...cur, next]);
            onCheckedChange(next);
          }}
        >
          {inlineLabel}
        </Checkbox>
      </Field>
      {indeterminate && (
        <p role="note" style={{ margin: 0 }}>
          Indeterminate needs a controlled Checkbox (see Playground): showing unchecked.
        </p>
      )}
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
        onCheckedChange calls: <output data-testid="calls">{JSON.stringify(calls)}</output>
      </p>
    </form>
  );
}

const uncontrolledBlocked: Story = {
  args: { fieldState: 'locked' },
  argTypes: {
    checked: {
      description: 'Initial value (`defaultChecked`): changing it remounts the box.',
      // A union is dropped from the URL args (`checked:indeterminate`) unless its type is declared.
      type: { name: 'other', value: 'CheckedState' },
    },
    fieldState: { description: 'Initial Field state; Lock / Unlock change it after mount (and update this control).' },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs<DemoArgs>();
    return <UncontrolledBlockedDemo {...args} onFieldStateChange={(fieldState) => updateArgs({ fieldState })} />;
  },
};

/**
 * An UNCONTROLLED Checkbox in a Field that starts locked (`fieldState: default` starts it editable);
 * Lock / Unlock switch the Field state after mount without remounting the box, Reset is a form reset.
 * The output lists every `onCheckedChange` call (also in Actions): a blocked gesture must change and
 * report nothing, a real click after unlocking or after a reset must report. Driven by the e2e, so it
 * has no play function: see `UncontrolledBlockedWalkthrough`.
 */
export const UncontrolledBlocked: Story = { ...uncontrolledBlocked };

/**
 * `UncontrolledBlocked` scripted: while locked a click on either label and Space change and report
 * nothing; Unlock, a click ticks the box and reports `true`; Lock keeps the value (no remount) and
 * blocks Space again; Unlock, two clicks report `false`, `true`; Reset restores the initial value and
 * reports nothing. A separate story because the e2e open `UncontrolledBlocked` with its default args.
 */
export const UncontrolledBlockedWalkthrough: Story = {
  ...uncontrolledBlocked,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'locked' || args.checked !== false || args.invalid || args.required) return;
    const canvas = within(canvasElement);
    const control = box(canvasElement);
    const calls = canvas.getByTestId('calls');
    const lock = canvas.getByRole('button', { name: 'Lock' });
    const unlock = canvas.getByRole('button', { name: 'Unlock' });
    await expect(control).toHaveAttribute('aria-readonly', 'true');
    await expect(control).toHaveAccessibleDescription('Decided by the framework agreement.');
    await expect(lock).toBeDisabled();
    await expect(calls).toHaveTextContent('[]');

    await userEvent.click(canvas.getByText(args.fieldLabel));
    await userEvent.click(canvas.getByText(args.inlineLabel));
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).not.toBeChecked();
    await expect(calls).toHaveTextContent('[]');
    // Nothing reached Actions either. Checked here, before the first Lock / Unlock: those update the args,
    // and an args update clears the spies' call history, so later calls are counted by the output above.
    await expect(args.onCheckedChange).not.toHaveBeenCalled();

    await userEvent.click(unlock);
    await waitFor(() => expect(control).not.toHaveAttribute('aria-readonly'));
    await expect(canvas.getByTestId('field-state')).toHaveTextContent('default');
    await expect(unlock).toBeDisabled();
    await userEvent.click(control);
    await expect(control).toBeChecked();
    await expect(calls).toHaveTextContent('[true]');

    await userEvent.click(lock);
    await waitFor(() => expect(control).toHaveAttribute('aria-readonly', 'true'));
    // Same node, same value: locking after mount does not remount the uncontrolled box.
    await expect(box(canvasElement)).toBe(control);
    await expect(control).toBeChecked();
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toBeChecked();

    await userEvent.click(unlock);
    await userEvent.click(control);
    await userEvent.click(control);
    await expect(calls).toHaveTextContent('[true,false,true]');
    await userEvent.click(canvas.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(control).not.toBeChecked());
    await expect(calls).toHaveTextContent('[true,false,true]');
  },
};

const MATRIX_CHECKED: { name: string; value: CheckedState }[] = [
  { name: 'Unchecked', value: false },
  { name: 'Checked', value: true },
  { name: 'Indeterminate', value: 'indeterminate' },
];

/** State matrix: unchecked / checked / indeterminate against default, disabled, forced, locked and invalid. */
export const StateMatrix: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: ({ onCheckedChange }) => (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {MATRIX_CHECKED.flatMap(({ name, value }) =>
        [...STATES, 'invalid' as const].map((state) => {
          const props =
            state === 'invalid'
              ? ({ error: 'Required.' } as const)
              : stateProps(state);
          return (
            <Field key={`${name}-${state}`} label={`${name} / ${state}`} help="Help text." {...props}>
              <Controlled initial={value} inlineLabel="Inline label" onCheckedChange={onCheckedChange} />
            </Field>
          );
        }),
      )}
    </div>
  ),
};

/** Inside a Field with help and error, a long inline label that wraps with the box on top, and a box without label. */
export const FieldMessages: Story = {
  tags: ['visual'],
  parameters: NO_CONTROLS,
  render: ({ onCheckedChange }) => (
    <div style={column}>
      <Field label="Terms" help="You can change this later." required>
        <Controlled initial={true} inlineLabel="I accept" onCheckedChange={onCheckedChange} />
      </Field>
      <Field label="Terms" error="You must accept to continue." required>
        <Controlled initial={false} inlineLabel="I accept" onCheckedChange={onCheckedChange} />
      </Field>
      <Field label="Privacy" help="Read the policy first.">
        <Controlled
          initial={false}
          inlineLabel="I have read and I accept the privacy policy, the data processing agreement and every annex referenced by the framework contract signed by both parties"
          onCheckedChange={onCheckedChange}
        />
      </Field>
      <Field label="Active">
        <Controlled initial={true} onCheckedChange={onCheckedChange} />
      </Field>
    </div>
  ),
};

const ITEMS = ['Invoices', 'Credit notes', 'Receipts'];

/** "Select all": the parent is indeterminate when only some children are ticked. */
export const SelectAll: Story = {
  parameters: NO_CONTROLS,
  render: ({ onCheckedChange }) => {
    function SelectAllDemo() {
      const [selected, setSelected] = useState<string[]>([]);
      const all: CheckedState = selected.length === ITEMS.length ? true : selected.length === 0 ? false : 'indeterminate';
      return (
        <div style={{ display: 'grid', gap: 4 }}>
          <Checkbox
            checked={all}
            onCheckedChange={(next) => {
              setSelected(next ? ITEMS : []);
              onCheckedChange(next);
            }}
          >
            Select all
          </Checkbox>
          <div style={{ display: 'grid', gap: 4, paddingInlineStart: 24 }}>
            {ITEMS.map((item) => (
              <Checkbox
                key={item}
                checked={selected.includes(item)}
                onCheckedChange={(next) => setSelected((cur) => (next ? [...cur, item] : cur.filter((i) => i !== item)))}
              >
                {item}
              </Checkbox>
            ))}
          </div>
        </div>
      );
    }
    return <SelectAllDemo />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const parent = canvas.getByRole('checkbox', { name: 'Select all' });
    await expect(parent).not.toBePartiallyChecked();
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Credit notes' }));
    await expect(parent).toBePartiallyChecked();
    await userEvent.click(parent);
    await expect(parent).toBeChecked();
    await expect(canvas.getByRole('checkbox', { name: 'Invoices' })).toBeChecked();
    await userEvent.click(parent);
    await expect(parent).not.toBeChecked();
  },
};

/** Uncontrolled inside a native form: `name`/`value` are submitted only when ticked, and Reset restores `defaultChecked` without reporting. */
export const InForm: Story = {
  parameters: NO_CONTROLS,
  render: ({ onCheckedChange }) => (
    <form
      style={column}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        event.currentTarget.dataset.submitted = JSON.stringify(Array.from(data.keys()));
      }}
    >
      <Checkbox name="news" value="yes" defaultChecked onCheckedChange={onCheckedChange}>
        Newsletter
      </Checkbox>
      <Checkbox name="terms" value="yes" onCheckedChange={onCheckedChange}>
        Terms
      </Checkbox>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit">Submit</Button>
        <Button type="reset" variant="secondary">
          Reset
        </Button>
      </div>
    </form>
  ),
};

/** Mounted unchecked, then `true` arrives from a "fetch": the box updates and nothing is reported. */
export const AsyncHydration: Story = {
  parameters: NO_CONTROLS,
  render: ({ onCheckedChange }) => {
    function Demo() {
      const [value, setValue] = useState(false);
      useEffect(() => {
        const timer = setTimeout(() => setValue(true), 50);
        return () => clearTimeout(timer);
      }, []);
      return (
        <Field label="Notifications">
          <Checkbox checked={value} onCheckedChange={onCheckedChange}>
            Email me about new invoices
          </Checkbox>
        </Field>
      );
    }
    return <Demo />;
  },
  play: async ({ args, canvasElement }) => {
    await waitFor(() => expect(box(canvasElement)).toBeChecked());
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};
