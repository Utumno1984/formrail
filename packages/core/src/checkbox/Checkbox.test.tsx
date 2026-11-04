import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Checkbox, type CheckedState } from './Checkbox';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Checkbox: Field wiring', () => {
  it('takes id, name, description, invalid, required and data-rop-name from the Field; name = Field label + inline label', () => {
    render(
      <Field label="Terms" name="terms" help="Read them" error="Required" required>
        <Checkbox>I accept</Checkbox>
      </Field>,
    );
    const box = screen.getByRole('checkbox', { name: 'Terms I accept' });
    expect(box).toHaveAttribute('name', 'terms');
    expect(box).toHaveAttribute('data-rop-name', 'terms');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAttribute('aria-required', 'true');
    expect(box).toHaveAccessibleDescription('Required Read them');
    expect(box.id).not.toBe('');
  });

  it('merges its own aria-describedby after the Field ones', () => {
    render(
      <>
        <p id="own">Own</p>
        <Field label="Terms" help="Help">
          <Checkbox aria-describedby="own">x</Checkbox>
        </Field>
      </>,
    );
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('Help Own');
  });

  it('outside a Field the inline label names it', () => {
    render(<Checkbox>Newsletter</Checkbox>);
    expect(screen.getByRole('checkbox', { name: 'Newsletter' })).toBeInTheDocument();
  });

  it('a Field label alone names it when there is no inline label', () => {
    render(
      <Field label="Active">
        <Checkbox />
      </Field>,
    );
    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeInTheDocument();
  });
});

describe('Checkbox: interaction', () => {
  it('click on the box, on the inline label and on the Field label toggles it and reports the new state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Field label="Terms">
        <Checkbox onCheckedChange={onCheckedChange}>I accept</Checkbox>
      </Field>,
    );
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).toBeChecked();
    await user.click(screen.getByText('I accept'));
    expect(box).not.toBeChecked();
    await user.click(screen.getByText('Terms'));
    expect(box).toBeChecked();
    expect(onCheckedChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('Space toggles it', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange}>x</Checkbox>);
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('disabled: out of the tab order, nothing changes on any click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Field label="Terms" state="disabled">
        <Checkbox onCheckedChange={onCheckedChange}>I accept</Checkbox>
      </Field>,
    );
    const box = screen.getByRole('checkbox');
    expect(box).toBeDisabled();
    await user.tab();
    expect(box).not.toHaveFocus();
    await user.click(box);
    await user.click(screen.getByText('I accept'));
    await user.click(screen.getByText('Terms'));
    expect(box).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it.each(['forced', 'locked'] as const)(
    '%s: focusable, aria-readonly and described by the reason',
    async (state) => {
      const user = userEvent.setup();
      render(
        <Field label="Terms" state={state} stateReason="Decided by contract">
          <Checkbox defaultChecked>I accept</Checkbox>
        </Field>,
      );
      const box = screen.getByRole('checkbox');
      await user.tab();
      expect(box).toHaveFocus();
      expect(box).toHaveAttribute('aria-readonly', 'true');
      expect(box).toHaveAccessibleDescription(/Decided by contract/);
    },
  );

  // Uncontrolled only: jsdom inverts the DOM of a cancelled controlled click on alternate clicks
  // (jsdom artefact); the controlled parity is covered by the Chromium e2e.
  describe.each(['forced', 'locked'] as const)('%s: every single gesture is blocked', (state) => {
    const gestures: Array<[string, (user: ReturnType<typeof userEvent.setup>, box: HTMLElement) => Promise<void>]> = [
      ['click on the box', async (user, box) => user.click(box)],
      ['click on the inline label', async (user) => user.click(screen.getByText('I accept'))],
      ['click on the Field label', async (user) => user.click(screen.getByText('Terms'))],
      [
        'Space',
        async (user, box) => {
          box.focus();
          await user.keyboard(' ');
        },
      ],
    ];
    for (const initial of [true, false]) {
      for (const [name, gesture] of gestures) {
        it(`${name}, starting ${initial ? 'checked' : 'unchecked'}`, async () => {
          const user = userEvent.setup();
          const onCheckedChange = vi.fn();
          render(
            <Field label="Terms" state={state} stateReason="Decided by contract">
              <Checkbox defaultChecked={initial} onCheckedChange={onCheckedChange}>
                I accept
              </Checkbox>
            </Field>,
          );
          const box = screen.getByRole('checkbox') as HTMLInputElement;
          await gesture(user, box);
          expect(box.checked).toBe(initial);
          expect(onCheckedChange).not.toHaveBeenCalled();
        });
      }
    }
  });

  it('uncontrolled: after a blocked click the Field goes back to default and the next click reports true', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host({ locked }: { locked: boolean }) {
      const props = locked ? ({ state: 'locked', stateReason: 'Closed' } as const) : ({ state: 'default' } as const);
      return (
        <Field label="Terms" {...props}>
          <Checkbox onCheckedChange={onCheckedChange}>x</Checkbox>
        </Field>
      );
    }
    const { rerender } = render(<Host locked />);
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).not.toBeChecked();
    // let the realignment timer run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    rerender(<Host locked={false} />);
    await user.click(box);
    expect(box).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('uncontrolled: a click cancelled by an ancestor onClick, then a free click, reports true', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host({ cancel }: { cancel: boolean }) {
      return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div onClick={(e) => cancel && e.preventDefault()}>
          <Checkbox aria-label="Terms" onCheckedChange={onCheckedChange} />
        </div>
      );
    }
    const { rerender } = render(<Host cancel />);
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    rerender(<Host cancel={false} />);
    await user.click(box);
    expect(box).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('a consumer onClick that calls preventDefault cancels the toggle and onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Checkbox onClick={(e) => e.preventDefault()} onCheckedChange={onCheckedChange}>
        x
      </Checkbox>,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('forced and unchecked stays unchecked', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Field label="Terms" state="forced" stateReason="Rule">
        <Checkbox checked={false} onCheckedChange={onCheckedChange} />
      </Field>,
    );
    const box = screen.getByRole('checkbox');
    await user.click(box);
    box.focus();
    await user.keyboard(' ');
    expect(box).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('a Field that goes from default to locked keeps the focus and stops changing the state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host({ locked }: { locked: boolean }) {
      const props = locked ? ({ state: 'locked', stateReason: 'Closed' } as const) : ({ state: 'default' } as const);
      return (
        <Field label="Terms" {...props}>
          <Checkbox onCheckedChange={onCheckedChange}>x</Checkbox>
        </Field>
      );
    }
    const { rerender } = render(<Host locked={false} />);
    const box = screen.getByRole('checkbox');
    await user.tab();
    await user.keyboard(' ');
    expect(box).toBeChecked();
    rerender(<Host locked />);
    expect(box).toHaveFocus();
    await user.keyboard(' ');
    await user.click(box);
    expect(box).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it('controlled without onCheckedChange: a click changes nothing and React does not warn', async () => {
    const user = userEvent.setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Checkbox checked={false}>x</Checkbox>);
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(error).not.toHaveBeenCalled();
  });

  it('calls the consumer onClick too', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Checkbox onClick={onClick}>x</Checkbox>);
    await user.click(screen.getByRole('checkbox'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Checkbox: no echo', () => {
  it('a checked value that changes from outside (async hydration) updates the UI without onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(<Checkbox checked={false} onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    rerender(<Checkbox checked onCheckedChange={onCheckedChange} />);
    expect(box).toBeChecked();
    rerender(<Checkbox checked="indeterminate" onCheckedChange={onCheckedChange} />);
    expect(box).toBePartiallyChecked();
    rerender(<Checkbox checked={false} onCheckedChange={onCheckedChange} />);
    expect(box).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('a form reset restores defaultChecked without calling onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <form data-testid="form">
        <Checkbox name="terms" defaultChecked onCheckedChange={onCheckedChange}>
          x
        </Checkbox>
      </form>,
    );
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).not.toBeChecked();
    onCheckedChange.mockClear();
    act(() => (screen.getByTestId('form') as HTMLFormElement).reset());
    expect(box).toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('after a form reset the next click still reports the new state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <form data-testid="form">
        <Checkbox onCheckedChange={onCheckedChange}>x</Checkbox>
      </form>,
    );
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(box).toBeChecked();
    act(() => (screen.getByTestId('form') as HTMLFormElement).reset());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(box).not.toBeChecked();
    onCheckedChange.mockClear();
    await user.click(box);
    expect(box).toBeChecked();
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('Checkbox: indeterminate', () => {
  it('clears the DOM property when it goes from "indeterminate" to uncontrolled', () => {
    const { rerender } = render(<Checkbox checked="indeterminate" />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    rerender(<Checkbox />);
    expect(box.indeterminate).toBe(false);
  });

  it('sets the DOM property (exposed as mixed), a click goes to true and reports true', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    function Host() {
      const [value, setValue] = useState<CheckedState>('indeterminate');
      return (
        <Checkbox
          checked={value}
          onCheckedChange={(next) => {
            onCheckedChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Host />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box).toBePartiallyChecked();
    expect(box).not.toHaveAttribute('checked', 'indeterminate');
    await user.click(box);
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(box.indeterminate).toBe(false);
    expect(box).toBeChecked();
  });

  it('re-applies the property when the consumer keeps "indeterminate" after a click', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked="indeterminate" onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    await user.click(box);
    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(box.indeterminate).toBe(true);
    expect(box).toBePartiallyChecked();
  });

  it('a blocked click leaves the indeterminate state', async () => {
    const user = userEvent.setup();
    render(
      <Field label="All" state="locked" stateReason="Closed">
        <Checkbox checked="indeterminate" />
      </Field>,
    );
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    await user.click(box);
    expect(box.indeterminate).toBe(true);
  });
});

describe('Checkbox: props hygiene', () => {
  it('does not leak onCheckedChange or the indeterminate value as DOM attributes', () => {
    const { container } = render(<Checkbox checked="indeterminate" onCheckedChange={() => undefined} />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain('oncheckedchange');
    expect(html).not.toContain('indeterminate"');
    const box = container.querySelector('input')!;
    expect(Array.from(box.attributes).map((a) => a.name)).not.toContain('checked-state');
    expect(box.getAttribute('checked')).toBeNull();
  });

  it('className wins over the base classes (real merge)', () => {
    render(<Checkbox className="rounded-full border-rop-error" />);
    const cls = screen.getByRole('checkbox').className;
    expect(cls).toContain('rounded-full');
    expect(cls).not.toContain('rounded-rop-sm');
    expect(cls.split(/\s+/)).toContain('border-rop-error');
    expect(cls.split(/\s+/)).not.toContain('border-rop-text-muted');
  });

  it('forwards the ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('checkbox'));
  });

  it('checked with defaultChecked: checked wins and it logs an error in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Checkbox checked={false} defaultChecked />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain('defaultChecked');
  });

  it('uses the motion tokens under motion-safe for the transition', () => {
    render(<Checkbox />);
    const cls = screen.getByRole('checkbox').className;
    expect(cls).toContain('motion-safe:duration-[var(--motion-rop-feedback-duration)]');
    expect(cls).toContain('motion-safe:ease-[var(--motion-rop-feedback-easing)]');
  });

  it('a form submits name/value only when checked', () => {
    const { container } = render(
      <form>
        <Checkbox name="a" value="yes" defaultChecked />
        <Checkbox name="b" value="yes" />
      </form>,
    );
    const data = new FormData(container.querySelector('form')!);
    expect(data.get('a')).toBe('yes');
    expect(data.has('b')).toBe(false);
  });
});
