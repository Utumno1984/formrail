import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button/Button';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { Switch } from './Switch';

const STATES: FieldState[] = ['default', 'disabled', 'forced', 'locked'];

interface DemoArgs {
  checked: boolean;
  fieldState: FieldState;
  invalid: boolean;
  required: boolean;
  fieldLabel: string;
  inlineLabel: string;
  onCheckedChange: (checked: boolean) => void;
}

const meta: Meta<DemoArgs> = {
  title: 'Forms/Switch',
  parameters: { layout: 'padded' },
  argTypes: {
    checked: { control: 'boolean' },
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
    fieldLabel: 'Notifications',
    inlineLabel: 'Email notifications',
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
  initial: boolean;
  inlineLabel?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  // The Controls panel drives the switch; an external change is a plain render (no onCheckedChange).
  useEffect(() => setValue(initial), [initial]);
  return (
    <Switch
      checked={value}
      onCheckedChange={(next) => {
        setValue(next);
        onCheckedChange(next);
      }}
    >
      {inlineLabel}
    </Switch>
  );
}

const control = (canvasElement: HTMLElement) => within(canvasElement).getByRole('switch');
/** Horizontal centre of an element. */
const centreX = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.left + r.width / 2;
};

/** The Playground body: the Field state starts from the Controls, and a button can switch it to `forced`. */
function PlaygroundDemo({ fieldState, invalid, required, fieldLabel, inlineLabel, checked, onCheckedChange }: DemoArgs) {
  const [state, setState] = useState<FieldState>(fieldState);
  useEffect(() => setState(fieldState), [fieldState]);
  return (
    <div style={column}>
      <Field
        label={fieldLabel}
        help="Applied immediately."
        error={invalid ? 'The setting could not be saved.' : undefined}
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
 * Actions. The play function turns the switch on with Space and checks the thumb moved to the end of
 * the track, then forces the value with the button and checks that a click on the Field's label and
 * Space change nothing and report nothing.
 */
export const Playground: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
  play: async ({ args, canvasElement }) => {
    if (args.fieldState !== 'default' || args.checked !== false) return;
    const canvas = within(canvasElement);
    const el = control(canvasElement);
    const thumb = el.nextElementSibling!;
    const offX = centreX(thumb) - centreX(el);
    await expect(offX).toBeLessThan(0);

    await userEvent.tab();
    await expect(el).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(el).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
    await expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    // The thumb slides under motion-safe: wait for the final position, on the other side of the centre.
    await waitFor(() => expect(centreX(thumb) - centreX(el)).toBeGreaterThan(0));

    await userEvent.click(canvas.getByRole('button', { name: 'Force this value' }));
    await waitFor(() => expect(el).toHaveAttribute('aria-readonly', 'true'));
    await userEvent.click(canvas.getByText(args.fieldLabel));
    el.focus();
    await userEvent.keyboard(' ');
    await expect(el).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
  },
};

/** The Playground without a play function: for manual testing and for the e2e that drive the real keyboard and mouse. */
export const Manual: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
};

/**
 * An UNCONTROLLED Switch in a Field whose state is switched by buttons; a counter shows how many
 * times `onCheckedChange` was called. For the e2e: a blocked gesture must change and report nothing,
 * and the first real click after unlocking (or after a form reset) must report again.
 */
export const UncontrolledBlocked: Story = {
  render: ({ checked, fieldState, onCheckedChange }) => {
    function Demo() {
      const [state, setState] = useState<FieldState>(fieldState === 'default' ? 'locked' : fieldState);
      const [calls, setCalls] = useState<boolean[]>([]);
      return (
        <form style={column}>
          <Field label="Notifications" {...stateProps(state)}>
            <Switch
              defaultChecked={checked}
              onCheckedChange={(next) => {
                setCalls((cur) => [...cur, next]);
                onCheckedChange(next);
              }}
            >
              Email notifications
            </Switch>
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

/** State matrix: off / on against default, disabled, forced, locked and invalid. */
export const StateMatrix: Story = {
  tags: ['visual'],
  render: ({ onCheckedChange }) => (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {[
        { name: 'Off', value: false },
        { name: 'On', value: true },
      ].flatMap(({ name, value }) =>
        [...STATES, 'invalid' as const].map((state) => {
          const props = state === 'invalid' ? ({ error: 'Could not be saved.' } as const) : stateProps(state);
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

/** Inside a Field with help and error, a long inline label that wraps with the switch on top, and a switch without label. */
export const FieldMessages: Story = {
  tags: ['visual'],
  render: ({ onCheckedChange }) => (
    <div style={column}>
      <Field label="Notifications" help="Applied immediately." required>
        <Controlled initial={true} inlineLabel="Email me" onCheckedChange={onCheckedChange} />
      </Field>
      <Field label="Notifications" error="The setting could not be saved." required>
        <Controlled initial={false} inlineLabel="Email me" onCheckedChange={onCheckedChange} />
      </Field>
      <Field label="Digest" help="Sent every Monday.">
        <Controlled
          initial={false}
          inlineLabel="Send me a weekly digest with every invoice, credit note and receipt that changed status during the previous week, grouped by supplier"
          onCheckedChange={onCheckedChange}
        />
      </Field>
      <Field label="Active">
        <Controlled initial={true} onCheckedChange={onCheckedChange} />
      </Field>
    </div>
  ),
};

/** Right-to-left: the thumb starts at the right edge and moves to the left when on. */
export const Rtl: Story = {
  tags: ['visual'],
  render: ({ onCheckedChange }) => (
    <div dir="rtl" style={column}>
      <Field label="Notifications">
        <Controlled initial={false} inlineLabel="Email notifications" onCheckedChange={onCheckedChange} />
      </Field>
      <Field label="Alerts">
        <Controlled initial={true} inlineLabel="Push alerts" onCheckedChange={onCheckedChange} />
      </Field>
    </div>
  ),
};

/** Uncontrolled inside a native form: `name`/`value` are submitted only when on, and Reset restores `defaultChecked` without reporting. */
export const InForm: Story = {
  render: ({ onCheckedChange }) => (
    <form
      style={column}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        event.currentTarget.dataset.submitted = JSON.stringify(Array.from(data.keys()));
      }}
    >
      <Switch name="news" value="yes" defaultChecked onCheckedChange={onCheckedChange}>
        Newsletter
      </Switch>
      <Switch name="alerts" value="yes" onCheckedChange={onCheckedChange}>
        Alerts
      </Switch>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit">Submit</Button>
        <Button type="reset" variant="secondary">
          Reset
        </Button>
      </div>
    </form>
  ),
};

/** A switch with an asynchronous save: on, then the "server" rejects and the value goes back to off from outside, without echo. */
export const AsyncSave: Story = {
  render: ({ onCheckedChange }) => {
    function Demo() {
      const [value, setValue] = useState(false);
      const [status, setStatus] = useState('idle');
      return (
        <Field label="Notifications" error={status === 'error' ? 'Saving failed, the setting was reverted.' : undefined}>
          <Switch
            checked={value}
            onCheckedChange={(next) => {
              onCheckedChange(next);
              setValue(next);
              setStatus('saving');
              setTimeout(() => {
                setValue(false);
                setStatus('error');
              }, 50);
            }}
          >
            Email notifications
          </Switch>
        </Field>
      );
    }
    return <Demo />;
  },
  play: async ({ args, canvasElement }) => {
    const el = control(canvasElement);
    await userEvent.click(el);
    await waitFor(() => expect(el).not.toBeChecked());
    await waitFor(() => expect(within(canvasElement).getByText(/Saving failed/)).toBeVisible());
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
  },
};

/** Mounted off, then `true` arrives from a "fetch": the switch updates and nothing is reported. */
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
          <Switch checked={value} onCheckedChange={onCheckedChange}>
            Email me about new invoices
          </Switch>
        </Field>
      );
    }
    return <Demo />;
  },
  play: async ({ args, canvasElement }) => {
    await waitFor(() => expect(control(canvasElement)).toBeChecked());
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};
