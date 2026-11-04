import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { addons } from 'storybook/preview-api';
import { UPDATE_STORY_ARGS } from 'storybook/internal/core-events';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
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
  parameters: { layout: 'padded' },
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

/**
 * Controls: `checked`, the Field state, `invalid`, `required` and the labels; `onCheckedChange` is in
 * Actions. The play function ticks the box by clicking its inline label, then switches the Field to
 * `forced` and checks that a click on the Field's label and Space change nothing and report nothing.
 */
export const Playground: Story = {
  render: ({ fieldState, invalid, required, fieldLabel, inlineLabel, checked, onCheckedChange }) => (
    <div style={column}>
      <Field
        label={fieldLabel}
        help="You can change this later."
        error={invalid ? 'You must accept to continue.' : undefined}
        required={required}
        {...stateProps(fieldState)}
      >
        <Controlled initial={checked} inlineLabel={inlineLabel} onCheckedChange={onCheckedChange} />
      </Field>
    </div>
  ),
  play: async ({ args, canvasElement, id }) => {
    if (args.fieldState !== 'default' || args.checked !== false) return;
    const control = box(canvasElement);
    await userEvent.click(within(canvasElement).getByText(args.inlineLabel));
    await expect(control).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);

    addons.getChannel().emit(UPDATE_STORY_ARGS, { storyId: id, updatedArgs: { fieldState: 'forced' } });
    await waitFor(() => expect(control).toHaveAttribute('aria-readonly', 'true'));
    await userEvent.click(within(canvasElement).getByText(args.fieldLabel));
    control.focus();
    await userEvent.keyboard(' ');
    await expect(control).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: Playground.render,
};

const MATRIX_CHECKED: { name: string; value: CheckedState }[] = [
  { name: 'Unchecked', value: false },
  { name: 'Checked', value: true },
  { name: 'Indeterminate', value: 'indeterminate' },
];

/** State matrix: unchecked / checked / indeterminate against default, disabled, forced, locked and invalid. */
export const StateMatrix: Story = {
  tags: ['visual'],
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

/** Mounted unchecked, then `true` arrives from a "fetch": the box updates and nothing is reported. */
export const AsyncHydration: Story = {
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
