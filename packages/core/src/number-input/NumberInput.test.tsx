import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field, type FieldStateProps } from '../field/Field';
import { NumberInput, type NumberInputProps } from './NumberInput';

afterEach(cleanup);

const spin = (name = 'Quantity') => screen.getByRole('spinbutton', { name });

function Controlled(props: Omit<NumberInputProps, 'value'> & { initial?: number | undefined }) {
  const { initial, onValueChange, ...rest } = props;
  const [value, setValue] = useState<number | undefined>(initial);
  return (
    <NumberInput
      aria-label="Quantity"
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe('NumberInput: Field wiring', () => {
  it('takes id, merged aria-describedby, aria-invalid, aria-required and data-rop-name from the Field; named by its label', () => {
    render(
      <>
        <span id="own-help">Own</span>
        <Field label="Quantity" name="qty" error="Too many." help="Units." required id="f">
          <NumberInput aria-describedby="own-help" />
        </Field>
      </>,
    );
    const input = spin();
    expect(input.id).toBe('f');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('data-rop-name', 'qty');
    expect(input).toHaveAccessibleDescription('Too many. Units. Own');
    expect(input).not.toHaveAttribute('name');
  });

  it.each(['forced', 'locked'] as const)('%s: readOnly, aria-readonly, reason described', (state) => {
    render(
      <Field label="Quantity" state={state} stateReason="Set by contract.">
        <NumberInput defaultValue={3} />
      </Field>,
    );
    const input = spin();
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-readonly', 'true');
    expect(input).toHaveAccessibleDescription('Set by contract.');
    expect(input).toBeEnabled();
  });

  it('disabled: native disabled input and steppers', () => {
    render(
      <Field label="Quantity" state="disabled">
        <NumberInput defaultValue={3} />
      </Field>,
    );
    expect(spin()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  });
});

describe('NumberInput: spinbutton ARIA', () => {
  it('aria-valuenow / valuemin / valuemax / valuetext in the locale format', () => {
    render(<NumberInput aria-label="Quantity" locale="it-IT" defaultValue={12.5} min={0} max={100} />);
    const input = spin();
    expect(input).toHaveAttribute('aria-valuenow', '12.5');
    expect(input).toHaveAttribute('aria-valuemin', '0');
    expect(input).toHaveAttribute('aria-valuemax', '100');
    expect(input).toHaveAttribute('aria-valuetext', '12,5');
    expect(input).toHaveValue('12,5');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('empty: no aria-valuenow / valuetext; no limits: no valuemin / valuemax', () => {
    render(<NumberInput aria-label="Quantity" />);
    const input = spin();
    for (const attr of ['aria-valuenow', 'aria-valuetext', 'aria-valuemin', 'aria-valuemax']) expect(input).not.toHaveAttribute(attr);
    expect(input).toHaveValue('');
  });

  it('inputMode: numeric for an integer step with min >= 0, decimal otherwise', () => {
    const { rerender } = render(<NumberInput aria-label="Quantity" min={0} />);
    expect(spin()).toHaveAttribute('inputmode', 'numeric');
    rerender(<NumberInput aria-label="Quantity" min={0} step={0.5} />);
    expect(spin()).toHaveAttribute('inputmode', 'decimal');
    rerender(<NumberInput aria-label="Quantity" />);
    expect(spin()).toHaveAttribute('inputmode', 'decimal');
    rerender(<NumberInput aria-label="Quantity" min={-5} />);
    expect(spin()).toHaveAttribute('inputmode', 'decimal');
  });
});

describe('NumberInput: typing commits on blur and Enter', () => {
  it.each([
    ['it-IT', '12,5'],
    ['it-IT', '12.5'],
    ['en-US', '12.5'],
  ])('%s: "%s" → 12.5 once, on blur, none per keystroke', async (locale, typed) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" locale={locale} onValueChange={onValueChange} />);
    await user.type(spin(), typed);
    expect(onValueChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(12.5);
    expect(spin()).toHaveValue(locale === 'it-IT' ? '12,5' : '12.5');
  });

  it('Enter commits too', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" onValueChange={onValueChange} />);
    await user.type(spin(), '7{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(7);
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('non-numeric text restores the last valid value with no callback', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={4} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.type(spin(), '4x');
    expect(spin()).toHaveValue('4x');
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(spin()).toHaveValue('4');
  });

  it.each(['-', '1.234,56', '+3', '1e3'])('"%s" is not valid (it-IT): restored, no callback', async (typed) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" locale="it-IT" defaultValue={2} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.type(spin(), typed);
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(spin()).toHaveValue('2');
  });

  it('a negative number without min is accepted', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" onValueChange={onValueChange} />);
    await user.type(spin(), '-3{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(-3);
  });

  it('emptying the text and leaving gives exactly onValueChange(undefined)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={5} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.tab();
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(spin()).toHaveValue('');
    expect(spin()).not.toHaveAttribute('aria-valuenow');
  });

  it('retyping the same value calls nothing', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={5} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.type(spin(), '5');
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a typed value is not rounded to the step', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" locale="it-IT" step={0.5} onValueChange={onValueChange} />);
    await user.type(spin(), '12,37');
    await user.tab();
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(12.37);
  });
});

describe('NumberInput: limits', () => {
  it('typed 150 with max 100 → 100; typed -5 with min 0 → 0', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled min={0} max={100} initial={50} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.type(spin(), '150');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith(100);
    expect(spin()).toHaveValue('100');
    await user.clear(spin());
    await user.type(spin(), '-5');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith(0);
    expect(spin()).toHaveValue('0');
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  it('an external value outside the limits is shown as it is, with no echo', () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" min={0} max={100} value={150} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('150');
    expect(spin()).toHaveAttribute('aria-valuenow', '150');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  });

  it('min > max: warns in dev, min wins, no exception', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" min={10} max={5} onValueChange={onValueChange} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('min (10) is greater than max (5)'));
    await user.type(spin(), '7{Enter}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(10);
    warn.mockRestore();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('step %d: warns in dev, 1 is used', async (step) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" step={step} defaultValue={2} onValueChange={onValueChange} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not a finite number > 0'));
    await user.click(spin());
    await user.keyboard('{ArrowUp}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(3);
    warn.mockRestore();
  });
});

describe('NumberInput: keyboard', () => {
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => {
      spin().dispatchEvent(event);
    });
    return event;
  };

  it('ArrowUp/Down ± step, PageUp/Down ± 10 steps, Home/End → min/max; one call each, default prevented', () => {
    const onValueChange = vi.fn();
    render(<Controlled min={0} max={100} step={2} initial={50} onValueChange={onValueChange} />);
    const cases: [string, number][] = [
      ['ArrowUp', 52],
      ['ArrowDown', 50],
      ['PageUp', 70],
      ['PageDown', 50],
      ['Home', 0],
      ['End', 100],
    ];
    for (const [key, expected] of cases) {
      onValueChange.mockClear();
      const event = press(key);
      expect(event.defaultPrevented, key).toBe(true);
      expect(onValueChange, key).toHaveBeenCalledExactlyOnceWith(expected);
    }
  });

  it('the limits hold: ArrowUp at max and PageDown near min', () => {
    const onValueChange = vi.fn();
    render(<Controlled min={0} max={10} initial={10} onValueChange={onValueChange} />);
    press('ArrowUp');
    expect(onValueChange).not.toHaveBeenCalled();
    press('PageDown');
    expect(onValueChange).toHaveBeenLastCalledWith(0);
  });

  it('Home/End without min/max do nothing and keep the caret default', () => {
    const onValueChange = vi.fn();
    render(<Controlled initial={5} onValueChange={onValueChange} />);
    expect(press('Home').defaultPrevented).toBe(false);
    expect(press('End').defaultPrevented).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('from empty: ArrowUp/ArrowDown set min when defined, else 0', () => {
    const onValueChange = vi.fn();
    const { unmount } = render(<NumberInput aria-label="Quantity" min={3} onValueChange={onValueChange} />);
    press('ArrowUp');
    expect(onValueChange).toHaveBeenLastCalledWith(3);
    unmount();
    render(<NumberInput aria-label="Quantity" onValueChange={onValueChange} />);
    press('ArrowDown');
    expect(onValueChange).toHaveBeenLastCalledWith(0);
  });

  it('precision: step 0.1 from 0.2 → 0.3; step 0.01 from 19.99 → 20', () => {
    const onValueChange = vi.fn();
    const { unmount } = render(<NumberInput aria-label="Quantity" step={0.1} defaultValue={0.2} onValueChange={onValueChange} />);
    press('ArrowUp');
    expect(onValueChange).toHaveBeenLastCalledWith(0.3);
    expect(spin()).toHaveValue('0.3');
    unmount();
    render(<NumberInput aria-label="Quantity" step={0.01} defaultValue={19.99} onValueChange={onValueChange} />);
    press('ArrowUp');
    expect(onValueChange).toHaveBeenLastCalledWith(20);
  });

  it('a step from a pending draft starts from the typed value and commits once', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" locale="it-IT" defaultValue={1} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.type(spin(), '7,5');
    await user.keyboard('{ArrowUp}');
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(8.5);
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('IME: Enter and the arrows during a composition neither commit nor step', () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={1} onValueChange={onValueChange} />);
    const input = spin();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp', isComposing: true });
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(5);
  });

  it('a consumer onKeyDown that prevents default stops the built-in handling', () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={1} onValueChange={onValueChange} onKeyDown={(e) => e.preventDefault()} />);
    fireEvent.keyDown(spin(), { key: 'ArrowUp' });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('NumberInput: steppers', () => {
  it('click ± step, the focus stays on the input; named Increase / Decrease, out of the tab order', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled initial={5} step={0.5} onValueChange={onValueChange} />);
    const inc = screen.getByRole('button', { name: 'Increase' });
    const dec = screen.getByRole('button', { name: 'Decrease' });
    expect(inc).toHaveAttribute('tabindex', '-1');
    expect(dec).toHaveAttribute('type', 'button');
    await user.click(spin());
    await user.click(inc);
    expect(onValueChange).toHaveBeenLastCalledWith(5.5);
    expect(spin()).toHaveFocus();
    await user.click(dec);
    await user.click(dec);
    expect(onValueChange).toHaveBeenLastCalledWith(4.5);
    expect(spin()).toHaveFocus();
    expect(onValueChange).toHaveBeenCalledTimes(3);
  });

  it('disabled at the limit, and a click there does nothing', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled initial={1} min={0} max={1} onValueChange={onValueChange} />);
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(0);
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled();
  });

  it('labels rename the buttons', () => {
    render(<NumberInput aria-label="Quantity" labels={{ increment: 'Aumenta' }} />);
    expect(screen.getByRole('button', { name: 'Aumenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeInTheDocument();
  });

  it('a stepper click while typing starts from the draft', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={1} onValueChange={onValueChange} />);
    await user.clear(spin());
    await user.type(spin(), '9');
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(10);
    expect(spin()).toHaveValue('10');
  });
});

describe('NumberInput: forced / locked block every channel', () => {
  it.each(['forced', 'locked'] as const)('%s: typing, paste, keys and steppers change nothing', async (state) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Field label="Quantity" state={state} stateReason="Set by contract.">
        <NumberInput defaultValue={5} min={0} max={10} onValueChange={onValueChange} />
      </Field>,
    );
    const input = spin();
    await user.click(input);
    expect(input).toHaveFocus();
    await user.type(input, '9');
    await user.paste('7');
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Enter']) await user.keyboard(`{${key}}`);
    // A synthetic change (what a script or an extension could fire) is ignored too.
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    const inc = screen.getByRole('button', { name: 'Increase' });
    const dec = screen.getByRole('button', { name: 'Decrease' });
    expect(inc).toBeDisabled();
    expect(dec).toBeDisabled();
    fireEvent.click(inc);
    fireEvent.click(dec);
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('5');
  });

  it('readOnly outside a Field blocks the keys and the steppers too', () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" readOnly defaultValue={5} onValueChange={onValueChange} />);
    fireEvent.keyDown(spin(), { key: 'ArrowUp' });
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a Field that becomes locked during a draft drops the draft on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Harness({ locked }: { locked: boolean }) {
      return (
        <Field label="Quantity" {...((locked ? { state: 'locked', stateReason: 'Locked.' } : {}) as FieldStateProps)}>
          <NumberInput defaultValue={1} onValueChange={onValueChange} />
        </Field>
      );
    }
    const { rerender } = render(<Harness locked={false} />);
    await user.clear(spin());
    await user.type(spin(), '42');
    rerender(<Harness locked />);
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(spin()).toHaveValue('1');
  });
});

describe('NumberInput: no echo and absent values (§1.13.1)', () => {
  const ABSENT: [string, Partial<NumberInputProps>][] = [
    ['undefined', { value: undefined }],
    ['null', { value: null as unknown as undefined }],
    ['NaN', { value: Number.NaN }],
    ['missing', {}],
  ];

  it.each(ABSENT)('%s at mount and after a change: no callback, empty', (_, absent) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const { rerender } = render(<NumberInput aria-label="Quantity" {...absent} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('');
    rerender(<NumberInput aria-label="Quantity" value={7} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('7');
    rerender(<NumberInput aria-label="Quantity" {...absent} onValueChange={onValueChange} />);
    if ('value' in absent) expect(spin()).toHaveValue('');
    expect(onValueChange).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('%d is shown empty with a dev warning', (bad) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<NumberInput aria-label="Quantity" value={bad} onValueChange={() => {}} />);
    expect(spin()).toHaveValue('');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not a finite number: shown as empty'));
    warn.mockRestore();
  });

  it('floating-point noise from outside is shown as Intl formats it and not echoed', () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" locale="it-IT" value={0.1 + 0.2} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('0,30000000000000004');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('an external change while typing keeps the draft; without a draft the text follows at once', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<NumberInput aria-label="Quantity" value={1} onValueChange={onValueChange} />);
    rerender(<NumberInput aria-label="Quantity" value={2} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('2');
    await user.clear(spin());
    await user.type(spin(), '33');
    rerender(<NumberInput aria-label="Quantity" value={4} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('33');
    await user.tab();
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(33);
  });

  it('a locale change reformats the text with no callback', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<NumberInput aria-label="Quantity" locale="en-US" value={1.5} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('1.5');
    rerender(<NumberInput aria-label="Quantity" locale="de-DE" value={1.5} onValueChange={onValueChange} />);
    expect(spin()).toHaveValue('1,5');
    expect(spin()).toHaveAttribute('aria-valuetext', '1,5');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('an invalid locale falls back to the runtime default without throwing', () => {
    render(<NumberInput aria-label="Quantity" locale="en_US!!" defaultValue={2} />);
    expect(spin()).toHaveValue(new Intl.NumberFormat().format(2));
  });
});

describe('NumberInput: native form', () => {
  it('a name puts a hidden input with the canonical value; FormData gets "12.5" in it-IT', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <Field label="Quantity" name="qty">
          <NumberInput locale="it-IT" />
        </Field>
      </form>,
    );
    const form = container.querySelector('form')!;
    expect(new FormData(form).get('qty')).toBe('');
    await user.type(spin(), '12,5');
    await user.tab();
    expect(new FormData(form).get('qty')).toBe('12.5');
    expect([...new FormData(form).keys()]).toEqual(['qty']);
  });

  it('no name, no hidden input', () => {
    const { container } = render(<NumberInput aria-label="Quantity" defaultValue={1} />);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
  });

  it('own name wins over the Field one; disabled excludes it from FormData', () => {
    const { container, rerender } = render(
      <form>
        <Field label="Quantity" name="field-name">
          <NumberInput name="own" defaultValue={3} />
        </Field>
      </form>,
    );
    expect(new FormData(container.querySelector('form')!).get('own')).toBe('3');
    rerender(
      <form>
        <Field label="Quantity" name="field-name" state="disabled">
          <NumberInput name="own" defaultValue={3} />
        </Field>
      </form>,
    );
    expect(new FormData(container.querySelector('form')!).get('own')).toBeNull();
  });

  it('form.reset() restores defaultValue (text and hidden value) without onValueChange', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onValueChange = vi.fn();
    const { container } = render(
      <form>
        <Field label="Quantity" name="qty">
          <NumberInput defaultValue={4} onValueChange={onValueChange} />
        </Field>
      </form>,
    );
    const form = container.querySelector('form')!;
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(spin()).toHaveValue('5');
    onValueChange.mockClear();
    act(() => {
      form.reset();
      vi.runAllTimers();
    });
    expect(spin()).toHaveValue('4');
    expect(new FormData(form).get('qty')).toBe('4');
    expect(onValueChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('NumberInput: the wheel, refs, classes and leaks', () => {
  it('the wheel never changes the value (focused or not)', () => {
    const onValueChange = vi.fn();
    render(<NumberInput aria-label="Quantity" defaultValue={5} onValueChange={onValueChange} />);
    fireEvent.wheel(spin(), { deltaY: -100 });
    spin().focus();
    fireEvent.wheel(spin(), { deltaY: 100 });
    expect(spin()).toHaveValue('5');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('ref is the visible input; className wins through cn', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<NumberInput ref={ref} aria-label="Quantity" className="py-4" size="sm" />);
    expect(ref.current).toBe(spin());
    expect(spin()).toHaveClass('py-4');
    expect(spin()).not.toHaveClass('py-[5px]');
  });

  it('no leak of non-DOM props; min/max/step are not attributes of the text input', () => {
    const { container } = render(
      <NumberInput
        aria-label="Quantity"
        name="qty"
        min={0}
        max={10}
        step={2}
        locale="it-IT"
        labels={{ increment: 'Up' }}
        onValueChange={() => {}}
        defaultValue={4}
      />,
    );
    const attributes = Array.from(container.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes, (a) => a.name.toLowerCase()));
    for (const leaked of ['onvaluechange', 'locale', 'labels', 'min', 'max', 'step', 'defaultvalue']) {
      expect(attributes, leaked).not.toContain(leaked);
    }
    expect(spin()).not.toHaveAttribute('name');
  });
});
