import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentType, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';
import { Switch } from '../switch/Switch';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Control = ComponentType<{ checked?: boolean; onCheckedChange?: (next: boolean) => void; children?: ReactNode }>;

// #292: a controlled Checkbox/Switch inside a form. The browser resets only the DOM; React state is
// the source of truth, so after a reset the DOM must show `checked` again (same as RadioGroup),
// report nothing, and the next click must still report.
describe.each<[string, Control, string]>([
  ['Checkbox', Checkbox as Control, 'checkbox'],
  ['Switch', Switch as Control, 'switch'],
])('%s: form reset while controlled (#292)', (_name, Component, role) => {
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  const reset = () => act(() => (screen.getByTestId('form') as HTMLFormElement).reset());

  it('parent denies the click, then sets checked=true from outside: reset puts the DOM back to checked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const ui = (checked: boolean) => (
      <form data-testid="form">
        <Component checked={checked} onCheckedChange={onCheckedChange}>
          x
        </Component>
      </form>
    );
    const { rerender } = render(ui(false));
    const control = screen.getByRole(role);
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(control).not.toBeChecked();
    rerender(ui(true));
    expect(control).toBeChecked();
    reset();
    await settle();
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('parent with useState: click, reset keeps the state and the DOM aligned, the next click reports', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Demo() {
      const [checked, setChecked] = useState(false);
      return (
        <form data-testid="form">
          <Component
            checked={checked}
            onCheckedChange={(next) => {
              onCheckedChange(next);
              setChecked(next);
            }}
          >
            x
          </Component>
        </form>
      );
    }
    render(<Demo />);
    const control = screen.getByRole(role);
    await user.click(control);
    expect(control).toBeChecked();
    onCheckedChange.mockClear();
    reset();
    await settle();
    expect(control).toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
    await user.click(control);
    expect(control).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
