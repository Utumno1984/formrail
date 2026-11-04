import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Switch } from './Switch';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

describe('Switch: Field wiring', () => {
  it('has role switch and takes id, name, description, invalid, required and data-rop-name from the Field', () => {
    render(
      <Field label="Alerts" name="alerts" help="Applied at once" error="Failed" required>
        <Switch>Email notifications</Switch>
      </Field>,
    );
    const control = screen.getByRole('switch', { name: 'Alerts Email notifications' });
    expect(control).toHaveAttribute('name', 'alerts');
    expect(control).toHaveAttribute('data-rop-name', 'alerts');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAttribute('aria-required', 'true');
    expect(control).toHaveAccessibleDescription('Failed Applied at once');
    expect(control.id).not.toBe('');
  });

  it('merges its own aria-describedby after the Field ones', () => {
    render(
      <>
        <p id="own">Own</p>
        <Field label="Alerts" help="Help">
          <Switch aria-describedby="own">x</Switch>
        </Field>
      </>,
    );
    expect(screen.getByRole('switch')).toHaveAccessibleDescription('Help Own');
  });

  it('outside a Field the inline label names it; a Field label alone names it without inline label', () => {
    const { unmount } = render(<Switch>Newsletter</Switch>);
    expect(screen.getByRole('switch', { name: 'Newsletter' })).toBeInTheDocument();
    unmount();
    render(
      <Field label="Active">
        <Switch />
      </Field>,
    );
    expect(screen.getByRole('switch', { name: 'Active' })).toBeInTheDocument();
  });

  it('exposes the checked state to assistive technology', async () => {
    const user = userEvent.setup();
    render(<Switch>x</Switch>);
    const control = screen.getByRole('switch');
    expect(control).toHaveAttribute('type', 'checkbox');
    expect(control).not.toBeChecked();
    await user.click(control);
    expect(control).toBeChecked();
  });
});

describe('Switch: interaction', () => {
  it('click on the track, the inline label and the Field label toggles it and reports once each', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Field label="Alerts">
        <Switch onCheckedChange={onCheckedChange}>Email</Switch>
      </Field>,
    );
    const control = screen.getByRole('switch');
    await user.click(control);
    expect(control).toBeChecked();
    await user.click(screen.getByText('Email'));
    expect(control).not.toBeChecked();
    await user.click(screen.getByText('Alerts'));
    expect(control).toBeChecked();
    expect(onCheckedChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('Space toggles it once; Enter does not', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange}>x</Switch>);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
    await user.keyboard(' ');
    expect(screen.getByRole('switch')).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('disabled: out of the tab order, nothing changes on any click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Field label="Alerts" state="disabled">
        <Switch onCheckedChange={onCheckedChange}>Email</Switch>
      </Field>,
    );
    const control = screen.getByRole('switch');
    expect(control).toBeDisabled();
    await user.tab();
    expect(control).not.toHaveFocus();
    await user.click(control);
    await user.click(screen.getByText('Email'));
    await user.click(screen.getByText('Alerts'));
    expect(control).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it.each(['forced', 'locked'] as const)('%s: focusable, aria-readonly and described by the reason', async (state) => {
    const user = userEvent.setup();
    render(
      <Field label="Alerts" state={state} stateReason="Decided by contract">
        <Switch defaultChecked>Email</Switch>
      </Field>,
    );
    const control = screen.getByRole('switch');
    await user.tab();
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute('aria-readonly', 'true');
    expect(control).toHaveAccessibleDescription(/Decided by contract/);
  });

  // Uncontrolled only: jsdom inverts the DOM of a cancelled controlled click on alternate clicks
  // (jsdom artefact); the controlled parity is covered by the Chromium e2e.
  describe.each(['forced', 'locked'] as const)('%s: every single gesture is blocked', (state) => {
    const gestures: Array<[string, (user: ReturnType<typeof userEvent.setup>, el: HTMLElement) => Promise<void>]> = [
      ['click on the track', async (user, el) => user.click(el)],
      ['click on the inline label', async (user) => user.click(screen.getByText('Email'))],
      ['click on the Field label', async (user) => user.click(screen.getByText('Alerts'))],
      [
        'Space',
        async (user, el) => {
          el.focus();
          await user.keyboard(' ');
        },
      ],
    ];
    for (const initial of [true, false]) {
      for (const [name, gesture] of gestures) {
        it(`${name}, starting ${initial ? 'on' : 'off'}`, async () => {
          const user = userEvent.setup();
          const onCheckedChange = vi.fn();
          render(
            <Field label="Alerts" state={state} stateReason="Decided by contract">
              <Switch defaultChecked={initial} onCheckedChange={onCheckedChange}>
                Email
              </Switch>
            </Field>,
          );
          const control = screen.getByRole('switch') as HTMLInputElement;
          await gesture(user, control);
          await gesture(user, control);
          expect(control.checked).toBe(initial);
          expect(onCheckedChange).not.toHaveBeenCalled();
        });
      }
    }
  });

  it('uncontrolled: after blocked clicks and unlocking, the next click reports', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host({ locked }: { locked: boolean }) {
      const props = locked ? ({ state: 'locked', stateReason: 'Closed' } as const) : ({ state: 'default' } as const);
      return (
        <Field label="Alerts" {...props}>
          <Switch onCheckedChange={onCheckedChange}>x</Switch>
        </Field>
      );
    }
    const { rerender } = render(<Host locked />);
    const control = screen.getByRole('switch');
    await user.click(control);
    expect(control).not.toBeChecked();
    await settle();
    rerender(<Host locked={false} />);
    await user.click(control);
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('uncontrolled: a click cancelled by an ancestor onClick, then a free click, reports true', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host({ cancel }: { cancel: boolean }) {
      return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div onClick={(e) => cancel && e.preventDefault()}>
          <Switch aria-label="Alerts" onCheckedChange={onCheckedChange} />
        </div>
      );
    }
    const { rerender } = render(<Host cancel />);
    const control = screen.getByRole('switch');
    await user.click(control);
    expect(control).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
    await settle();
    rerender(<Host cancel={false} />);
    await user.click(control);
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('a consumer onClick that calls preventDefault cancels the toggle and onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch onClick={(e) => e.preventDefault()} onCheckedChange={onCheckedChange}>
        x
      </Switch>,
    );
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('a Field that goes from default to locked keeps the focus and stops changing the state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host({ locked }: { locked: boolean }) {
      const props = locked ? ({ state: 'locked', stateReason: 'Closed' } as const) : ({ state: 'default' } as const);
      return (
        <Field label="Alerts" {...props}>
          <Switch onCheckedChange={onCheckedChange}>x</Switch>
        </Field>
      );
    }
    const { rerender } = render(<Host locked={false} />);
    const control = screen.getByRole('switch');
    await user.tab();
    await user.keyboard(' ');
    expect(control).toBeChecked();
    rerender(<Host locked />);
    expect(control).toHaveFocus();
    await user.keyboard(' ');
    await user.click(control);
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it('controlled without onCheckedChange: a click changes nothing and React does not warn', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Switch checked={false}>x</Switch>);
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(error).not.toHaveBeenCalled();
  });

  it('calls the consumer onClick too', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Switch onClick={onClick}>x</Switch>);
    await user.click(screen.getByRole('switch'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Switch: no echo', () => {
  it('a checked value that changes from outside updates the UI without onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole('switch');
    rerender(<Switch checked onCheckedChange={onCheckedChange} />);
    expect(control).toBeChecked();
    rerender(<Switch checked={false} onCheckedChange={onCheckedChange} />);
    expect(control).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('async save that fails: on, then reverted from outside, reports only the user click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host() {
      const [value, setValue] = useState(false);
      return (
        <>
          <Switch
            checked={value}
            onCheckedChange={(next) => {
              onCheckedChange(next);
              setValue(next);
            }}
          >
            Save
          </Switch>
          <button type="button" onClick={() => setValue(false)}>
            Fail
          </button>
        </>
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Fail' }));
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('a form reset restores defaultChecked without calling onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <form data-testid="form">
        <Switch name="a" defaultChecked onCheckedChange={onCheckedChange}>
          x
        </Switch>
      </form>,
    );
    const control = screen.getByRole('switch');
    await user.click(control);
    expect(control).not.toBeChecked();
    onCheckedChange.mockClear();
    act(() => (screen.getByTestId('form') as HTMLFormElement).reset());
    expect(control).toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('after a form reset (without onCheckedChange) the next click still toggles; with it, it reports', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <form data-testid="form">
        <Switch onCheckedChange={onCheckedChange}>x</Switch>
        <Switch aria-label="plain" />
      </form>,
    );
    const [control, plain] = screen.getAllByRole('switch');
    await user.click(control!);
    await user.click(plain!);
    act(() => (screen.getByTestId('form') as HTMLFormElement).reset());
    await settle();
    expect(control).not.toBeChecked();
    expect(plain).not.toBeChecked();
    onCheckedChange.mockClear();
    await user.click(control!);
    await user.click(plain!);
    expect(control).toBeChecked();
    expect(plain).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('Switch: props hygiene', () => {
  it('does not leak onCheckedChange as a DOM attribute', () => {
    const { container } = render(<Switch checked onCheckedChange={() => undefined} />);
    expect(container.innerHTML.toLowerCase()).not.toContain('oncheckedchange');
    const names = Array.from(container.querySelector('input')!.attributes).map((a) => a.name);
    expect(names).not.toContain('oncheckedchange');
    expect(names).not.toContain('onCheckedChange');
  });

  it('className wins over the base classes (real merge)', () => {
    render(<Switch className="rounded-sm border-rop-error" />);
    const cls = screen.getByRole('switch').className.split(/\s+/);
    expect(cls).toContain('rounded-sm');
    expect(cls).not.toContain('rounded-full');
    expect(cls).toContain('border-rop-error');
    expect(cls).not.toContain('border-rop-text-muted');
  });

  it('forwards the ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Switch ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('switch'));
  });

  it('checked with defaultChecked: checked wins and it logs an error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Switch checked={false} defaultChecked />);
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('defaultChecked');
  });

  it('slides the thumb only under motion-safe, with the motion tokens, and mirrors it in RTL', () => {
    const { container } = render(<Switch />);
    const track = screen.getByRole('switch').className;
    expect(track).toContain('motion-safe:duration-[var(--motion-rop-feedback-duration)]');
    expect(track).toContain('motion-safe:ease-[var(--motion-rop-feedback-easing)]');
    const thumb = container.querySelector('span[aria-hidden="true"]')!.className;
    expect(thumb).toContain('motion-safe:[transition-property:inset-inline-start,background-color]');
    expect(thumb).toContain('motion-safe:duration-[var(--motion-rop-feedback-duration)]');
    expect(thumb).not.toMatch(/(^|\s)(transition|duration-\d+)/);
    // Logical offsets (start-*) mirror in RTL without a `[dir=rtl]` selector (the stylesheet bans global selectors).
    expect(thumb).toContain('start-1');
    expect(thumb).toContain('peer-checked:start-5');
  });

  it('a form submits name/value only when on', () => {
    const { container } = render(
      <form>
        <Switch name="a" value="yes" defaultChecked />
        <Switch name="b" value="yes" />
      </form>,
    );
    const data = new FormData(container.querySelector('form')!);
    expect(data.get('a')).toBe('yes');
    expect(data.has('b')).toBe(false);
  });
});
