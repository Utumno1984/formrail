import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from '../checkbox/Checkbox';
import { Field } from '../field/Field';
import { RadioGroup, RadioGroupItem } from '../radio-group/RadioGroup';
import { Switch } from '../switch/Switch';

afterEach(cleanup);

/**
 * Counts every assignment to `el.checked` from now on. It wraps the property React's value tracker
 * installs on the node (falling back to the prototype's), so both React's commit and a realign are seen.
 */
function countCheckedWrites(el: HTMLInputElement) {
  const base =
    Object.getOwnPropertyDescriptor(el, 'checked') ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!;
  const writes = { count: 0 };
  Object.defineProperty(el, 'checked', {
    configurable: true,
    enumerable: base.enumerable,
    get() {
      return base.get!.call(this);
    },
    set(value: boolean) {
      writes.count += 1;
      base.set!.call(this, value);
    },
  });
  return writes;
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
const reset = () => act(() => (screen.getByTestId('form') as HTMLFormElement).reset());

// A controlled reset is fixed by React's commit alone (it writes the controlled `checked` through the
// real setter, fixing the DOM and the value tracker): no extra realign write on top of it.
describe('useFormResetSync: a controlled reset writes `checked` at most once per input', () => {
  it.each([
    ['Checkbox', Checkbox, 'checkbox'],
    ['Switch', Switch, 'switch'],
  ] as const)('%s', async (_name, Component, role) => {
    // `checked` moved from outside after mount: the reset target (`defaultChecked`) lags behind it.
    const ui = (checked: boolean) => (
      <form data-testid="form">
        <Component checked={checked}>x</Component>
      </form>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    const control = screen.getByRole(role) as HTMLInputElement;
    const writes = countCheckedWrites(control);
    reset();
    await settle();
    expect(control).toBeChecked();
    expect(writes.count).toBeLessThanOrEqual(1);
  });

  it('RadioGroup', async () => {
    const ui = (value: string) => (
      <form data-testid="form">
        <RadioGroup aria-label="x" value={value}>
          <RadioGroupItem value="a">Alpha</RadioGroupItem>
          <RadioGroupItem value="b">Beta</RadioGroupItem>
        </RadioGroup>
      </form>
    );
    const { rerender } = render(ui('b'));
    rerender(ui('a'));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const writes = radios.map(countCheckedWrites);
    reset();
    await settle();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).not.toBeChecked();
    for (const w of writes) expect(w.count).toBeLessThanOrEqual(1);
  });
});

// `useFocusFirstInvalidField` focuses the radio carrying `data-rop-name`: after an uncontrolled reset
// it must follow the restored selection, not stay on the radio picked before the reset.
describe('useFormResetSync: an uncontrolled RadioGroup reset moves `data-rop-name` to the reset selection', () => {
  it('RadioGroup in a named Field', async () => {
    const user = userEvent.setup();
    render(
      <form data-testid="form">
        <Field label="Plan" name="plan">
          <RadioGroup defaultValue="b">
            <RadioGroupItem value="a">Alpha</RadioGroupItem>
            <RadioGroupItem value="b">Beta</RadioGroupItem>
          </RadioGroup>
        </Field>
      </form>,
    );
    const alpha = screen.getByRole('radio', { name: 'Alpha' });
    const beta = screen.getByRole('radio', { name: 'Beta' });
    await user.click(alpha);
    await settle();
    expect(alpha).toHaveAttribute('data-rop-name', 'plan');
    reset();
    await settle();
    expect(beta).toBeChecked();
    expect(beta).toHaveAttribute('data-rop-name', 'plan');
    expect(alpha).not.toHaveAttribute('data-rop-name');
  });
});

// The `form` attribute associates an input with a `<form>` that does not contain it: the reset
// listener must bind to that form (`input.form`), not to the closest ancestor `<form>`.
describe("useFormResetSync: a controlled control associated via `form=\"id\"` follows that form's reset", () => {
  it.each([
    ['Checkbox', Checkbox, 'checkbox'],
    ['Switch', Switch, 'switch'],
  ] as const)('%s', async (_name, Component, role) => {
    const ui = (checked: boolean) => (
      <>
        <form id="external" data-testid="form" />
        <Component form="external" checked={checked}>
          x
        </Component>
      </>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    const control = screen.getByRole(role) as HTMLInputElement;
    expect(control.form).toBe(screen.getByTestId('form'));
    reset();
    await settle();
    expect(control).toBeChecked();
  });
});
