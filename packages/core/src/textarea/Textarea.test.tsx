import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Textarea } from './Textarea';

function describedIds(el: HTMLElement): string[] {
  return (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
}

afterEach(() => vi.restoreAllMocks());

describe('Textarea outside a Field', () => {
  it('is a native styled textarea: rows 3 by default, forwarded ref, merged className, no leaked props', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="Notes" autoResize maxRows={5} className="py-4 resize-none" />);
    const el = screen.getByRole('textbox', { name: 'Notes' });
    expect(el.tagName).toBe('TEXTAREA');
    expect(ref.current).toBe(el);
    expect(el).toHaveAttribute('rows', '3');
    expect(el).toHaveClass('py-4');
    expect(el).not.toHaveClass('py-[7px]');
    expect(el).not.toHaveAttribute('role');
    expect(el).not.toHaveAttribute('aria-describedby');
    for (const leaked of ['autoresize', 'autoResize', 'maxrows', 'maxRows']) expect(el).not.toHaveAttribute(leaked);
  });

  it('the manual resize handle is vertical only, and off with autoResize', () => {
    const { rerender } = render(<Textarea aria-label="Notes" />);
    expect(screen.getByRole('textbox')).toHaveClass('resize-y');
    rerender(<Textarea aria-label="Notes" autoResize />);
    expect(screen.getByRole('textbox')).toHaveClass('resize-none');
    expect(screen.getByRole('textbox')).not.toHaveClass('resize-y');
  });

  it('a consumer ref callback and the internal measure ref both get the node', () => {
    const seen: Array<HTMLTextAreaElement | null> = [];
    render(<Textarea aria-label="Notes" autoResize ref={(n) => void seen.push(n)} />);
    expect(seen[0]).toBe(screen.getByRole('textbox'));
  });

  it('maxRows below rows warns in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Textarea aria-label="Notes" autoResize rows={4} maxRows={2} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('maxRows'));
  });

  it('the maxRows warning is emitted once per instance, not on every render (a controlled control re-renders per keystroke)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui = (value: string) => <Textarea aria-label="Notes" autoResize rows={4} maxRows={2} value={value} onChange={() => {}} />;
    const { rerender } = render(ui('a'));
    rerender(ui('ab'));
    rerender(ui('abc'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[react-object-page\] Textarea: maxRows/));
  });

  it('maxRows equal to rows, or maxRows without autoResize, does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <>
        <Textarea aria-label="Equal" autoResize rows={3} maxRows={3} />
        <Textarea aria-label="Manual" rows={4} maxRows={2} />
      </>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('disabled: not typeable', async () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Notes" disabled onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'abc');
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('maxLength does not produce an echo', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Textarea aria-label="Notes" maxLength={3} value="ab" onChange={onChange} />);
    rerender(<Textarea aria-label="Notes" maxLength={3} value="abc" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Textarea inside a Field (same matrix as Input)', () => {
  it('takes id, name, data-rop-name, aria-required and the merged aria-describedby; the label is its name', () => {
    render(
      <>
        <span id="extra">Extra</span>
        <Field label="Reason" name="reason" required help="Help">
          <Textarea aria-describedby="extra" />
        </Field>
      </>,
    );
    const el = screen.getByRole('textbox', { name: /Reason/ });
    expect(screen.getByLabelText(/Reason/)).toBe(el);
    expect(el).toHaveAttribute('name', 'reason');
    expect(el).toHaveAttribute('data-rop-name', 'reason');
    expect(el).toHaveAttribute('aria-required', 'true');
    const ids = describedIds(el);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe('extra');
    expect(el).toHaveAccessibleDescription('Help Extra');
  });

  it('error: aria-invalid; the Field wins over id and aria-invalid passed to the Textarea', () => {
    render(
      <Field label="Reason" id="from-field" error="Required.">
        <Textarea id="own" aria-invalid={false} />
      </Field>,
    );
    const el = screen.getByRole('textbox', { name: 'Reason' });
    expect(el.id).toBe('from-field');
    expect(el).toHaveAttribute('aria-invalid', 'true');
  });

  it('disabled Field: disabled control', () => {
    render(
      <Field label="Reason" state="disabled">
        <Textarea />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Reason' })).toBeDisabled();
  });

  it.each(['forced', 'locked'] as const)('%s: focusable, readOnly, reason described, typing/paste/cut/delete change nothing', async (state) => {
    const onChange = vi.fn();
    render(
      <Field label="Reason" state={state} stateReason="Set by contract.">
        <Textarea defaultValue="fixed text" onChange={onChange} />
      </Field>,
    );
    const el = screen.getByRole('textbox', { name: 'Reason' });
    expect(el).toHaveAttribute('readonly');
    expect(el).toHaveAttribute('aria-readonly', 'true');
    expect(el).toHaveAccessibleDescription('Set by contract.');
    const user = userEvent.setup();
    await user.tab();
    expect(el).toHaveFocus();
    await user.keyboard('abc');
    await user.keyboard('{Control>}a{/Control}{Backspace}{Delete}');
    await user.paste('pasted');
    await user.cut();
    expect(el).toHaveValue('fixed text');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a Field that becomes locked while the textarea has focus: the focus stays, further typing has no effect', async () => {
    const user = userEvent.setup();
    const ui = (locked: boolean) =>
      locked ? (
        <Field label="Reason" state="locked" stateReason="Locked.">
          <Textarea defaultValue="abc" />
        </Field>
      ) : (
        <Field label="Reason">
          <Textarea defaultValue="abc" />
        </Field>
      );
    const { rerender } = render(ui(false));
    const el = screen.getByRole('textbox', { name: 'Reason' });
    await user.click(el);
    await user.keyboard('d');
    expect(el).toHaveValue('abcd');
    rerender(ui(true));
    expect(el).toHaveFocus();
    await user.keyboard('e');
    expect(el).toHaveValue('abcd');
  });
});

describe('Textarea: no echo (§1.13.1)', () => {
  const ABSENT = {
    undefined: { value: undefined },
    empty: { value: '' },
    missing: {},
  } as const;

  it.each(Object.keys(ABSENT) as Array<keyof typeof ABSENT>)('absent value "%s": no callback at mount or when it changes later', (kind) => {
    const onChange = vi.fn();
    const props = ABSENT[kind];
    const { rerender } = render(<Textarea aria-label="Notes" onChange={onChange} {...props} />);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<Textarea aria-label="Notes" onChange={onChange} {...props} value={kind === 'missing' ? undefined : 'from outside'} />);
    rerender(<Textarea aria-label="Notes" onChange={onChange} {...props} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a value changed from outside updates the text without onChange', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Textarea aria-label="Notes" value="one" onChange={onChange} />);
    rerender(<Textarea aria-label="Notes" value={'two\nlines'} onChange={onChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('two\nlines');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('null from untyped code shows as empty, no callback and no React warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    const { rerender } = render(<Textarea aria-label="Notes" value={null as unknown as string} onChange={onChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    rerender(<Textarea aria-label="Notes" value="x" onChange={onChange} />);
    rerender(<Textarea aria-label="Notes" value={null as unknown as string} onChange={onChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('the user emptying the control emits an empty string', async () => {
    const onChange = vi.fn((e: { target: { value: string } }) => e.target.value);
    render(<Textarea aria-label="Notes" defaultValue="abc" onChange={onChange} />);
    const el = screen.getByRole('textbox');
    await userEvent.clear(el);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.results[0]!.value).toBe('');
  });

  it('a native form reset restores defaultValue without onChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <form>
        <Textarea aria-label="Notes" defaultValue="initial" onChange={onChange} />
      </form>,
    );
    const el = screen.getByRole('textbox');
    fireEvent.change(el, { target: { value: 'edited' } });
    onChange.mockClear();
    (container.firstElementChild as HTMLFormElement).reset();
    expect(el).toHaveValue('initial');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Textarea autoResize (the arithmetic is in auto-height.test.ts; real geometry in e2e)', () => {
  function mockLayout(scrollHeight: number) {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '20px',
      fontSize: '14px',
      paddingTop: '7px',
      paddingBottom: '7px',
      borderTopWidth: '1px',
      borderBottomWidth: '1px',
      boxSizing: 'content-box',
    } as CSSStyleDeclaration);
  }

  it('sets the measured height on mount and re-measures when value changes from outside', () => {
    mockLayout(5 * 20 + 14);
    const { rerender } = render(<Textarea aria-label="Notes" autoResize value={'1\n2\n3\n4\n5'} onChange={() => {}} />);
    const el = screen.getByRole('textbox');
    expect(el.style.height).toBe('100px');
    expect(el.style.overflowY).toBe('hidden');
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2 * 20 + 14);
    rerender(<Textarea aria-label="Notes" autoResize value="1" onChange={() => {}} />);
    expect(el.style.height).toBe('60px'); // never below rows (3)
  });

  it('with maxRows the height stops and the control scrolls inside', () => {
    mockLayout(9 * 20 + 14);
    render(<Textarea aria-label="Notes" autoResize maxRows={4} defaultValue="long" />);
    const el = screen.getByRole('textbox');
    expect(el.style.height).toBe('80px');
    expect(el.style.overflowY).toBe('auto');
  });

  it('without autoResize no inline height is written; switching it off removes the measured one', () => {
    mockLayout(9 * 20 + 14);
    const { rerender } = render(<Textarea aria-label="Notes" defaultValue="long" />);
    expect(screen.getByRole('textbox').style.height).toBe('');
    rerender(<Textarea aria-label="Notes" autoResize defaultValue="long" />);
    expect(screen.getByRole('textbox').style.height).not.toBe('');
    rerender(<Textarea aria-label="Notes" defaultValue="long" />);
    expect(screen.getByRole('textbox').style.height).toBe('');
  });

  it('switching autoResize off while clamped at maxRows also drops the inline overflow (a fixed-rows control scrolls again)', () => {
    mockLayout(9 * 20 + 14);
    const { rerender } = render(<Textarea aria-label="Notes" autoResize maxRows={4} defaultValue="long" />);
    const el = screen.getByRole('textbox');
    expect(el.style.overflowY).toBe('auto');
    rerender(<Textarea aria-label="Notes" maxRows={4} defaultValue="long" />);
    expect(el.style.overflowY).toBe('');
    expect(el.style.height).toBe('');
  });

  it('switching autoResize off under the limit drops the inline overflow: hidden too', () => {
    mockLayout(2 * 20 + 14);
    const { rerender } = render(<Textarea aria-label="Notes" autoResize defaultValue="short" />);
    const el = screen.getByRole('textbox');
    expect(el.style.overflowY).toBe('hidden');
    rerender(<Textarea aria-label="Notes" defaultValue="short" />);
    expect(el.style.overflowY).toBe('');
  });

  it('rows changed from outside on the mounted control moves the minimum height (same node, no remount)', () => {
    mockLayout(1 * 20 + 14);
    const { rerender } = render(<Textarea aria-label="Notes" autoResize rows={2} defaultValue="one line" />);
    const el = screen.getByRole('textbox');
    expect(el.style.height).toBe('40px');
    rerender(<Textarea aria-label="Notes" autoResize rows={5} defaultValue="one line" />);
    expect(screen.getByRole('textbox')).toBe(el);
    expect(el.style.height).toBe('100px');
  });

  it('maxRows changed from outside on the mounted control moves the limit and the inner scroll', () => {
    mockLayout(9 * 20 + 14);
    const { rerender } = render(<Textarea aria-label="Notes" autoResize maxRows={4} defaultValue="long" />);
    const el = screen.getByRole('textbox');
    expect(el.style.height).toBe('80px');
    expect(el.style.overflowY).toBe('auto');
    rerender(<Textarea aria-label="Notes" autoResize maxRows={10} defaultValue="long" />);
    expect(el.style.height).toBe('180px');
    expect(el.style.overflowY).toBe('hidden');
  });

  it('does not measure a hidden control (no client rects): the height is left alone', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([] as unknown as DOMRectList);
    render(<Textarea aria-label="Notes" autoResize defaultValue="x" />);
    expect(screen.getByRole('textbox').style.height).toBe('');
  });

  it('typing re-measures (uncontrolled)', async () => {
    mockLayout(3 * 20 + 14);
    render(<Textarea aria-label="Notes" autoResize />);
    const el = screen.getByRole('textbox');
    expect(el.style.height).toBe('60px');
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(4 * 20 + 14);
    await userEvent.type(el, 'a');
    expect(el.style.height).toBe('80px');
  });
});
