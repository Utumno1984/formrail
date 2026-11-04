import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { useFocusFirstInvalidField } from '../object-page/use-focus-first-invalid-field';
import { RadioGroup, RadioGroupItem } from './RadioGroup';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const Items = ({ disabledItem }: { disabledItem?: string }) => (
  <>
    <RadioGroupItem value="a" disabled={disabledItem === 'a'}>
      Alpha
    </RadioGroupItem>
    <RadioGroupItem value="b" disabled={disabledItem === 'b'}>
      Beta
    </RadioGroupItem>
    <RadioGroupItem value="c" disabled={disabledItem === 'c'}>
      Gamma
    </RadioGroupItem>
  </>
);

describe('RadioGroup: structure and Field wiring', () => {
  it('is a radiogroup named by the Field label, with native radios sharing the Field name', () => {
    render(
      <Field label="Plan" name="plan" help="Pick one" error="Required" required>
        <RadioGroup defaultValue="a">
          <Items />
        </RadioGroup>
      </Field>,
    );
    const group = screen.getByRole('radiogroup', { name: 'Plan' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(group).toHaveAttribute('aria-orientation', 'vertical');
    expect(group).toHaveAccessibleDescription('Required Pick one');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute('type', 'radio');
      expect(radio).toHaveAttribute('name', 'plan');
    }
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
  });

  it('the Field id is on the radiogroup and on no input', () => {
    const { container } = render(
      <Field label="Plan">
        <RadioGroup>
          <Items />
        </RadioGroup>
      </Field>,
    );
    const group = screen.getByRole('radiogroup');
    expect(group.id).not.toBe('');
    expect(container.querySelector('label[for]:not([for=""])')).not.toBeNull();
    expect(container.querySelector(`input#${CSS.escape(group.id)}`)).toBeNull();
    for (const input of container.querySelectorAll('input')) expect(input.id).not.toBe(group.id);
    expect(container.querySelector(`[for="${group.id}"]`)).not.toBeNull();
  });

  it('generates distinct names for two groups without name', () => {
    render(
      <>
        <RadioGroup aria-label="One">
          <RadioGroupItem value="x">X1</RadioGroupItem>
        </RadioGroup>
        <RadioGroup aria-label="Two">
          <RadioGroupItem value="x">X2</RadioGroupItem>
        </RadioGroup>
      </>,
    );
    const [a, b] = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(a!.name).not.toBe('');
    expect(a!.name).not.toBe(b!.name);
  });

  it('prop name wins over the Field name; aria-label names it outside a Field', () => {
    render(
      <RadioGroup aria-label="Colour" name="colour">
        <Items />
      </RadioGroup>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('name', 'colour');
  });

  it('logs in development when the group has no accessible name', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RadioGroup>
        <Items />
      </RadioGroup>,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no accessible name'));
  });

  it('does not log when named', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RadioGroup aria-label="x">
        <Items />
      </RadioGroup>,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('horizontal orientation is exposed as aria-orientation only (no leak of non-DOM props)', () => {
    render(
      <RadioGroup aria-label="x" orientation="horizontal" onValueChange={() => {}} className="custom p-0">
        <Items />
      </RadioGroup>,
    );
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-orientation', 'horizontal');
    expect(group).not.toHaveAttribute('orientation');
    expect(group).not.toHaveAttribute('onvaluechange');
    expect(group).not.toHaveAttribute('value');
    expect(group).toHaveClass('custom');
    expect(group).toHaveClass('flex-row');
  });

  it('forwards refs and merges className on items', () => {
    const groupRef = createRef<HTMLDivElement>();
    const itemRef = createRef<HTMLInputElement>();
    render(
      <RadioGroup ref={groupRef} aria-label="x">
        <RadioGroupItem ref={itemRef} value="a" className="rounded-none">
          A
        </RadioGroupItem>
      </RadioGroup>,
    );
    expect(groupRef.current).toBe(screen.getByRole('radiogroup'));
    expect(itemRef.current).toBe(screen.getByRole('radio'));
    expect(itemRef.current).toHaveClass('rounded-none');
    expect(itemRef.current).not.toHaveClass('rounded-full');
  });

  it('an item outside a group renders nothing and logs', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<RadioGroupItem value="a">A</RadioGroupItem>);
    expect(container).toBeEmptyDOMElement();
    expect(error).toHaveBeenCalled();
  });
});

describe('RadioGroup: interaction and keyboard', () => {
  it('click on a radio and on an inline label selects and reports once each', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="x" onValueChange={onValueChange}>
        <Items />
      </RadioGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    await user.click(screen.getByText('Gamma'));
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Alpha' })).not.toBeChecked();
    expect(onValueChange.mock.calls).toEqual([['a'], ['c']]);
  });

  it('Tab enters on the selected radio, arrows move and select skipping disabled items, Tab leaves', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <>
        <button>before</button>
        <RadioGroup aria-label="x" defaultValue="a" onValueChange={onValueChange}>
          <Items disabledItem="b" />
        </RadioGroup>
        <button>after</button>
      </>,
    );
    await user.tab();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
    expect(onValueChange).toHaveBeenLastCalledWith('c');
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('with no selection Tab enters on the first enabled radio; a value that matches nothing selects nothing', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup aria-label="x" value="nope">
        <Items disabledItem="a" />
      </RadioGroup>,
    );
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus();
  });

  it('a selected item that becomes disabled stays selected and visible', () => {
    const { rerender } = render(
      <RadioGroup aria-label="x" defaultValue="b">
        <Items />
      </RadioGroup>,
    );
    rerender(
      <RadioGroup aria-label="x" defaultValue="b">
        <Items disabledItem="b" />
      </RadioGroup>,
    );
    const beta = screen.getByRole('radio', { name: 'Beta' });
    expect(beta).toBeChecked();
    expect(beta).toBeDisabled();
  });
});

describe('RadioGroup: no echo', () => {
  it('changing value from outside (async hydration included) selects without calling onValueChange', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <RadioGroup aria-label="x" value={null} onValueChange={onValueChange}>
        <Items />
      </RadioGroup>,
    );
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    rerender(
      <RadioGroup aria-label="x" value="b" onValueChange={onValueChange}>
        <Items />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    rerender(
      <RadioGroup aria-label="x" value="c" onValueChange={onValueChange}>
        <Items />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Gamma' })).toBeChecked();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a controlled group keeps its value until the parent updates it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup aria-label="x" value="a" onValueChange={onValueChange}>
        <Items />
      </RadioGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).not.toBeChecked();
  });

  it('a form reset returns to defaultValue without onValueChange, and the next click still reports', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <form>
        <RadioGroup aria-label="x" defaultValue="a" onValueChange={onValueChange}>
          <Items />
        </RadioGroup>
        <button type="reset">Reset</button>
      </form>,
    );
    await user.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith('b');
  });
});

describe('RadioGroup: disabled', () => {
  for (const kind of ['group', 'field'] as const) {
    it(`${kind} disabled: out of the tab order, no click changes anything`, async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const group = (
        <RadioGroup
          aria-label="x"
          defaultValue="a"
          disabled={kind === 'group'}
          onValueChange={onValueChange}
        >
          <Items />
        </RadioGroup>
      );
      render(
        <>
          <button>before</button>
          {kind === 'field' ? (
            <Field label="Plan" state="disabled" stateReason="Not available">
              {group}
            </Field>
          ) : (
            group
          )}
          <button>after</button>
        </>,
      );
      for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
      await user.tab();
      await user.tab();
      expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
      await user.click(screen.getByText('Beta'));
      await user.click(screen.getAllByRole('radio')[1]!);
      if (kind === 'field') await user.click(screen.getByText('Plan'));
      expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
      expect(onValueChange).not.toHaveBeenCalled();
    });
  }
});

describe.each(['forced', 'locked'] as const)('RadioGroup: %s', (state) => {
  const setup = (controlled: boolean) => {
    const onValueChange = vi.fn();
    const props = controlled ? { value: 'b' } : { defaultValue: 'b' };
    render(
      <Field label="Plan" state={state} stateReason="Decided by the agreement">
        <RadioGroup {...props} onValueChange={onValueChange}>
          <Items />
        </RadioGroup>
      </Field>,
    );
    return onValueChange;
  };

  for (const controlled of [true, false]) {
    const mode = controlled ? 'controlled' : 'uncontrolled';

    it(`${mode}: Tab lands on the selected radio, described by the reason, aria-readonly on the group`, async () => {
      const user = userEvent.setup();
      setup(controlled);
      await user.tab();
      expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus();
      const group = screen.getByRole('radiogroup');
      expect(group).toHaveAttribute('aria-readonly', 'true');
      expect(group).toHaveAccessibleDescription('Decided by the agreement');
      for (const radio of screen.getAllByRole('radio')) expect(radio).not.toHaveAttribute('readonly');
    });

    it(`${mode}: arrows, Space, clicks on radio, inline label and Field label change nothing and report nothing`, async () => {
      const user = userEvent.setup();
      const onValueChange = setup(controlled);
      const beta = screen.getByRole('radio', { name: 'Beta' });
      await user.tab();
      for (const key of ['{ArrowDown}', '{ArrowUp}', '{ArrowLeft}', '{ArrowRight}', ' ']) {
        await user.keyboard(key);
        expect(beta).toBeChecked();
        expect(beta).toHaveFocus();
      }
      await user.click(screen.getByRole('radio', { name: 'Alpha' }));
      await user.click(screen.getByText('Gamma'));
      await user.click(screen.getByText('Plan'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      expect(beta).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Alpha' })).not.toBeChecked();
      expect(screen.getByRole('radio', { name: 'Gamma' })).not.toBeChecked();
      expect(onValueChange).not.toHaveBeenCalled();
    });
  }

  it('unlocking afterwards: the first real click reports again', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Demo() {
      const [locked, setLocked] = useState(true);
      return (
        <>
          <button onClick={() => setLocked(false)}>Unlock</button>
          <Field label="Plan" {...(locked ? ({ state, stateReason: 'why' } as const) : { state: 'default' as const })}>
            <RadioGroup defaultValue="b" onValueChange={onValueChange}>
              <Items />
            </RadioGroup>
          </Field>
        </>
      );
    }
    render(<Demo />);
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(onValueChange.mock.calls).toEqual([['a']]);
  });
});

describe('RadioGroup: Field label click', () => {
  it('a click on the Field label never changes the value in the default state either', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Field label="Plan">
        <RadioGroup defaultValue="b" onValueChange={onValueChange}>
          <Items />
        </RadioGroup>
      </Field>,
    );
    await user.click(screen.getByText('Plan'));
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('RadioGroup: controlled gesture paths', () => {
  it('a form reset on a controlled group puts the DOM back to `value`, reports nothing, and the next click still reports', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(
      <form>
        <RadioGroup aria-label="x" value="b" onValueChange={onValueChange}>
          <Items />
        </RadioGroup>
        <button type="reset">Reset</button>
      </form>,
    );
    await user.click(screen.getByRole('radio', { name: 'Gamma' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    // The value moves from outside (hydration): the browser's reset target (the `checked` attribute) may lag behind.
    rerender(
      <form>
        <RadioGroup aria-label="x" value="a" onValueChange={onValueChange}>
          <Items />
        </RadioGroup>
        <button type="reset">Reset</button>
      </form>,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Beta' })).not.toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('radio', { name: 'Gamma' }));
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith('c');
  });

  it('controlled: blocked clicks, then unlocking, then a real click reports', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Demo() {
      const [locked, setLocked] = useState(true);
      const [value, setValue] = useState('b');
      return (
        <>
          <button onClick={() => setLocked(false)}>Unlock</button>
          <Field label="Plan" {...(locked ? ({ state: 'locked', stateReason: 'why' } as const) : { state: 'default' as const })}>
            <RadioGroup
              value={value}
              onValueChange={(next) => {
                setValue(next);
                onValueChange(next);
              }}
            >
              <Items />
            </RadioGroup>
          </Field>
        </>
      );
    }
    render(<Demo />);
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await user.click(screen.getByRole('radio', { name: 'Alpha' }));
    expect(screen.getByRole('radio', { name: 'Alpha' })).toBeChecked();
    expect(onValueChange.mock.calls).toEqual([['a']]);
  });
});

describe('RadioGroup: useFocusFirstInvalidField', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  function Form({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useFocusFirstInvalidField({ containerRef: ref, fieldErrors: { plan: 'required' } });
    return <div ref={ref}>{children}</div>;
  }

  it('focuses the selected radio, not the first one', () => {
    render(
      <Form>
        <Field label="Plan" name="plan" error="required">
          <RadioGroup defaultValue="b">
            <Items />
          </RadioGroup>
        </Field>
      </Form>,
    );
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked();
  });

  it('with nothing selected focuses the first enabled radio even if the first item is disabled', () => {
    render(
      <Form>
        <Field label="Plan" name="plan" error="required">
          <RadioGroup>
            <Items disabledItem="a" />
          </RadioGroup>
        </Field>
      </Form>,
    );
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveFocus();
  });

  it('is found through the Field name even when the group has its own native name', () => {
    render(
      <Form>
        <Field label="Plan" name="plan" error="required">
          <RadioGroup name="plan_native">
            <Items />
          </RadioGroup>
        </Field>
      </Form>,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveFocus();
  });

  it('the attribute follows an external selection change', () => {
    const { rerender } = render(
      <Field label="Plan" name="plan">
        <RadioGroup value="a">
          <Items />
        </RadioGroup>
      </Field>,
    );
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('data-rop-name', 'plan');
    rerender(
      <Field label="Plan" name="plan">
        <RadioGroup value="c">
          <Items />
        </RadioGroup>
      </Field>,
    );
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('data-rop-name', 'plan');
    expect(screen.getByRole('radio', { name: 'Alpha' })).not.toHaveAttribute('data-rop-name');
  });
});

describe('RadioGroupItem: accessible name', () => {
  it('logs in development when an item has no children, aria-label or aria-labelledby', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RadioGroup aria-label="x">
        <RadioGroupItem value="a" />
      </RadioGroup>,
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining('RadioGroupItem value="a"'));
  });

  it('does not log with aria-label', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RadioGroup aria-label="x">
        <RadioGroupItem value="a" aria-label="Alpha" />
      </RadioGroup>,
    );
    expect(error).not.toHaveBeenCalled();
  });
});

describe('RadioGroup: RTL', () => {
  it('uses the native arrow direction: dir is forwarded to the group', () => {
    render(
      <RadioGroup aria-label="x" dir="rtl" orientation="horizontal">
        <Items />
      </RadioGroup>,
    );
    expect(screen.getByRole('radiogroup')).toHaveAttribute('dir', 'rtl');
  });

  it('a blocked group also swallows the horizontal arrows', () => {
    render(
      <Field label="Plan" state="locked" stateReason="why">
        <RadioGroup defaultValue="b" dir="rtl">
          <Items />
        </RadioGroup>
      </Field>,
    );
    const beta = screen.getByRole('radio', { name: 'Beta' });
    expect(fireEvent.keyDown(beta, { key: 'ArrowLeft' })).toBe(false);
    expect(fireEvent.keyDown(beta, { key: 'ArrowRight' })).toBe(false);
    expect(fireEvent.keyDown(beta, { key: 'Tab' })).toBe(true);
  });
});
