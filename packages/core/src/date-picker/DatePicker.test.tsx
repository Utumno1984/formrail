import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayOfWeek, type IsoDate } from '../calendar/date-math';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../dialog/Dialog';
import { Field, type FieldStateProps } from '../field/Field';
import type { FieldState } from '../field/FieldContext';
import { DatePicker, type DatePickerProps } from './DatePicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BASE = { locale: 'en-US', today: '2026-03-10' } as const;
const input = (name = 'Due date') => screen.getByRole('textbox', { name });
const button = (name: RegExp | string = /^Choose date/) => screen.getByRole('button', { name });
const popover = () => screen.queryByRole('dialog', { name: 'Choose date' });
const day = (name: string) => screen.getByRole('gridcell', { name });

function InField({ children, ...state }: { children: ReactNode } & FieldStateProps & { error?: string; required?: boolean }) {
  return (
    <Field label="Due date" name="dueDate" {...state}>
      {children}
    </Field>
  );
}

function Controlled(props: Partial<DatePickerProps> & { initial?: IsoDate | null }) {
  const { initial = null, onValueChange, ...rest } = props;
  const [value, setValue] = useState<IsoDate | null>(initial);
  return (
    <>
      <InField>
        <DatePicker
          {...BASE}
          {...rest}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onValueChange?.(next);
          }}
        />
      </InField>
      <output data-testid="value">{value ?? 'none'}</output>
    </>
  );
}

describe('DatePicker: inside a Field', () => {
  it('the input takes id, label, describedby, invalid, required, name and data-rop-name; the button is named and a dialog trigger', () => {
    render(
      <Field label="Due date" name="dueDate" help="When the invoice is due." error="Required." required>
        <DatePicker {...BASE} aria-describedby="own" />
      </Field>,
    );
    const box = input();
    expect(box).toHaveAttribute('type', 'text');
    expect(box).toHaveAttribute('name', 'dueDate');
    expect(box).toHaveAttribute('data-rop-name', 'dueDate');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAttribute('aria-required', 'true');
    expect(box.getAttribute('aria-describedby')?.split(' ').at(-1)).toBe('own');
    expect(box).toHaveAccessibleDescription(/Required\..*When the invoice is due\./);
    expect(box).toHaveAttribute('placeholder', 'MM/DD/YYYY');
    expect(box).toHaveAttribute('autocomplete', 'off');
    const trigger = button();
    // Named by its text, then the Field's label: two pickers on a page have distinct names.
    expect(trigger).toHaveAccessibleName('Choose date Due date');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('with a value the button name carries the date in the locale; the label click focuses only the input', async () => {
    const user = userEvent.setup();
    render(
      <InField>
        <DatePicker {...BASE} defaultValue="2026-03-03" />
      </InField>,
    );
    expect(button()).toHaveAccessibleName('Choose date, selected March 3, 2026 Due date');
    await user.click(screen.getByText('Due date'));
    expect(input()).toHaveFocus();
    expect(popover()).toBeNull();
  });

  it('two DatePickers: distinct ids and button names', () => {
    render(
      <>
        <Field label="Start">
          <DatePicker {...BASE} />
        </Field>
        <Field label="End">
          <DatePicker {...BASE} />
        </Field>
      </>,
    );
    const [a, b] = screen.getAllByRole('textbox');
    expect(a?.id).not.toBe(b?.id);
    const names = screen.getAllByRole('button').map((el) => el.id);
    expect(new Set(names).size).toBe(2);
    expect(screen.getByRole('button', { name: 'Choose date Start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose date End' })).toBeInTheDocument();
  });

  it('labels: texts replaced key by key; outside a Field the button is named by its text only', () => {
    render(
      <DatePicker
        {...BASE}
        aria-label="Data"
        defaultValue="2026-03-03"
        locale="it-IT"
        labels={{ chooseDateSelected: (d) => `Scegli data, selezionata ${d}` }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Scegli data, selezionata 3 marzo 2026' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Data' })).toHaveValue('03/03/2026');
    expect(screen.getByRole('textbox', { name: 'Data' })).toHaveAttribute('placeholder', 'DD/MM/YYYY');
  });
});

describe('DatePicker: typing', () => {
  it('a valid text on Enter: onValueChange(iso) once, text reformatted', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.type(input(), '3/5/2026{Enter}');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('2026-03-05');
    expect(input()).toHaveValue('03/05/2026');
    expect(screen.getByTestId('value')).toHaveTextContent('2026-03-05');
    // Enter again, blur: nothing new.
    await user.keyboard('{Enter}');
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('a valid text on blur; the same date typed differently only reformats (no call)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="2026-03-05" />);
    await user.clear(input());
    await user.type(input(), '3/5/2026');
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('03/05/2026');
  });

  it('it-IT reads DD/MM/YYYY', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} locale="it-IT" />);
    await user.type(input(), '15/03/2026{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('2026-03-15');
    expect(input()).toHaveValue('15/03/2026');
  });

  it('a pasted ISO date is accepted', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.click(input());
    await user.paste('2026-03-15');
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('2026-03-15');
    expect(input()).toHaveValue('03/15/2026');
  });

  it('emptying the text: onValueChange(null)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="2026-03-05" />);
    await user.clear(input());
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(input()).toHaveValue('');
  });

  it('an unparsable text: onValueChange(null) then onInvalidInput, the text stays to be corrected', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled onValueChange={onValueChange} onInvalidInput={onInvalidInput} initial="2026-03-05" />);
    await user.clear(input());
    await user.type(input(), '13/45/2026{Enter}');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(onInvalidInput).toHaveBeenCalledTimes(1);
    expect(onInvalidInput).toHaveBeenCalledWith('13/45/2026', 'unparsable');
    expect(onValueChange.mock.invocationCallOrder[0]).toBeLessThan(onInvalidInput.mock.invocationCallOrder[0] as number);
    expect(screen.getByTestId('value')).toHaveTextContent('none');
    // The parent applied `null`: the text the user sees is not wiped.
    expect(input()).toHaveValue('13/45/2026');
    // Already null: a second invalid commit only reports the text.
    await user.type(input(), '0{Enter}');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onInvalidInput).toHaveBeenLastCalledWith('13/45/20260', 'unparsable');
    // Corrected: accepted.
    await user.clear(input());
    await user.type(input(), '12/24/2026');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('2026-12-24');
  });

  it.each([
    ['02/28/2026', 'out-of-range', { min: '2026-03-01' }],
    ['04/01/2026', 'out-of-range', { max: '2026-03-31' }],
    ['03/15/2026', 'out-of-range', { min: '2026-04-01', max: '2026-03-01' }],
    ['03/14/2026', 'disabled-date', { isDateDisabled: (d: IsoDate) => dayOfWeek(d) === 6 }],
  ] as const)('%s → %s', async (typed, reason, limits) => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled {...limits} onValueChange={onValueChange} onInvalidInput={onInvalidInput} initial="2026-03-10" />);
    await user.clear(input());
    await user.type(input(), `${typed}{Enter}`);
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(onInvalidInput).toHaveBeenCalledWith(typed, reason);
    expect(input()).toHaveValue(typed);
  });

  it('a blur without edits never calls anything (also with an invalid external value)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled onValueChange={onValueChange} onInvalidInput={onInvalidInput} />);
    await user.click(input());
    await user.tab();
    await user.click(input());
    await user.keyboard('{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInvalidInput).not.toHaveBeenCalled();
  });

  it('uncontrolled: defaultValue shown, typed value kept', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker {...BASE} aria-label="Due date" defaultValue="2026-03-03" onValueChange={onValueChange} />);
    expect(input()).toHaveValue('03/03/2026');
    await user.clear(input());
    await user.type(input(), '04/04/2026{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('2026-04-04');
    expect(input()).toHaveValue('04/04/2026');
    expect(button()).toHaveAccessibleName('Choose date, selected April 4, 2026');
  });

  it('a controlled parent that refuses the change: the text goes back to its value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker {...BASE} aria-label="Due date" value="2026-03-03" onValueChange={onValueChange} />);
    await user.clear(input());
    await user.type(input(), '04/04/2026{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('2026-04-04');
    expect(input()).toHaveValue('03/03/2026');
  });

  it('IME: compositionStart → change → compositionEnd → keydown Enter 229 commits nothing; a later real Enter commits once', () => {
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled onValueChange={onValueChange} onInvalidInput={onInvalidInput} />);
    const box = input();
    fireEvent.compositionStart(box);
    fireEvent.change(box, { target: { value: '03/05/2026' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.compositionEnd(box);
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInvalidInput).not.toHaveBeenCalled();
    expect(box).toHaveValue('03/05/2026');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('2026-03-05');
    expect(onInvalidInput).not.toHaveBeenCalled();
  });

  it("the consumer's onBlur runs after the commit: it already sees the committed value", async () => {
    const user = userEvent.setup();
    let latest: IsoDate | null | 'unset' = 'unset';
    const seenInBlur: (IsoDate | null | 'unset')[] = [];
    render(
      <Controlled
        onValueChange={(next) => {
          latest = next;
        }}
        onBlur={() => seenInBlur.push(latest)}
      />,
    );
    await user.type(input(), '03/05/2026');
    await user.tab();
    expect(seenInBlur).toEqual(['2026-03-05']);
  });

  it('min and max are inclusive for typed text; one day outside is refused', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled min="2026-03-05" max="2026-03-20" onValueChange={onValueChange} onInvalidInput={onInvalidInput} />);
    for (const [typed, expected] of [
      ['03/05/2026', '2026-03-05'],
      ['03/20/2026', '2026-03-20'],
    ] as const) {
      await user.clear(input());
      await user.type(input(), `${typed}{Enter}`);
      expect(onValueChange).toHaveBeenLastCalledWith(expected);
    }
    expect(onInvalidInput).not.toHaveBeenCalled();
    for (const typed of ['03/04/2026', '03/21/2026']) {
      await user.clear(input());
      await user.type(input(), `${typed}{Enter}`);
      expect(onInvalidInput).toHaveBeenLastCalledWith(typed, 'out-of-range');
      expect(input()).toHaveValue(typed);
    }
    expect(onInvalidInput).toHaveBeenCalledTimes(2);
  });

  it('after an invalid commit, focus in and out without edits reports nothing more', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled onValueChange={onValueChange} onInvalidInput={onInvalidInput} initial="2026-03-05" />);
    await user.clear(input());
    await user.type(input(), 'abc');
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onInvalidInput).toHaveBeenCalledTimes(1);
    await user.click(input());
    await user.tab();
    await user.click(input());
    await user.keyboard('{Enter}');
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onInvalidInput).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue('abc');
  });

  it('a text of spaces only is empty: onValueChange(null), text emptied', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    render(<Controlled onValueChange={onValueChange} onInvalidInput={onInvalidInput} initial="2026-03-05" />);
    await user.clear(input());
    await user.type(input(), '   ');
    await user.tab();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(onInvalidInput).not.toHaveBeenCalled();
    expect(input()).toHaveValue('');
  });

  it('a three-digit day is refused', async () => {
    const user = userEvent.setup();
    const onInvalidInput = vi.fn();
    render(<Controlled onInvalidInput={onInvalidInput} />);
    await user.type(input(), '03/015/2026{Enter}');
    expect(onInvalidInput).toHaveBeenCalledWith('03/015/2026', 'unparsable');
  });

  it('Enter during an IME composition does not commit', () => {
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    fireEvent.change(input(), { target: { value: '03/05/2026' } });
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('2026-03-05');
  });
});

describe('DatePicker: no echo (rule of absent values)', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('mounted with %s, then a date from a "fetch": text and calendar follow, no callback', async (_, initial) => {
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    const { rerender } = render(
      <DatePicker {...BASE} aria-label="Due date" value={initial} onValueChange={onValueChange} onInvalidInput={onInvalidInput} />,
    );
    expect(input()).toHaveValue('');
    rerender(<DatePicker {...BASE} aria-label="Due date" value="2026-07-14" onValueChange={onValueChange} onInvalidInput={onInvalidInput} />);
    expect(input()).toHaveValue('07/14/2026');
    expect(button()).toHaveAccessibleName('Choose date, selected July 14, 2026');
    const user = userEvent.setup();
    await user.click(button());
    expect(day('Tuesday, July 14, 2026')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    rerender(<DatePicker {...BASE} aria-label="Due date" value={null} onValueChange={onValueChange} onInvalidInput={onInvalidInput} />);
    expect(input()).toHaveValue('');
    rerender(<DatePicker {...BASE} aria-label="Due date" value={undefined} onValueChange={onValueChange} onInvalidInput={onInvalidInput} />);
    expect(input()).toHaveValue('');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInvalidInput).not.toHaveBeenCalled();
  });

  it.each([
    ["''", ''],
    ['spaces only', '   '],
  ])('value %s: shown empty at mount and after mount, no callback (dev error, as Calendar)', (_, absent) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    const props = { ...BASE, 'aria-label': 'Due date', onValueChange, onInvalidInput };
    const { rerender } = render(<DatePicker {...props} value={absent} />);
    expect(input()).toHaveValue('');
    rerender(<DatePicker {...props} value="2026-03-05" />);
    expect(input()).toHaveValue('03/05/2026');
    rerender(<DatePicker {...props} value={absent} />);
    expect(input()).toHaveValue('');
    fireEvent.blur(input());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInvalidInput).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('is not a valid ISO date'));
  });

  it('value prop missing at mount, then set after mount: text follows, no callback', () => {
    const onValueChange = vi.fn();
    const onInvalidInput = vi.fn();
    const props = { ...BASE, 'aria-label': 'Due date', onValueChange, onInvalidInput };
    const { rerender } = render(<DatePicker {...props} />);
    expect(input()).toHaveValue('');
    rerender(<DatePicker {...props} value="2026-07-14" />);
    expect(input()).toHaveValue('07/14/2026');
    expect(button()).toHaveAccessibleName('Choose date, selected July 14, 2026');
    fireEvent.blur(input());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInvalidInput).not.toHaveBeenCalled();
  });

  it('an invalid external value is shown empty, with a console.error, and no callback', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    render(<DatePicker {...BASE} aria-label="Due date" value="2026-02-30" onValueChange={onValueChange} />);
    expect(input()).toHaveValue('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"2026-02-30" is not a valid ISO date'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('an external value while the user is typing rewrites the text (documented default), no callback', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<DatePicker {...BASE} aria-label="Due date" value={null} onValueChange={onValueChange} />);
    await user.type(input(), '03/1');
    rerender(<DatePicker {...BASE} aria-label="Due date" value="2026-08-01" onValueChange={onValueChange} />);
    expect(input()).toHaveValue('08/01/2026');
    expect(input()).toHaveFocus();
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a locale changed after mount reformats placeholder and text, no callback', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<DatePicker {...BASE} aria-label="Due date" value="2026-03-15" onValueChange={onValueChange} />);
    expect(input()).toHaveValue('03/15/2026');
    rerender(<DatePicker {...BASE} locale="de-DE" aria-label="Due date" value="2026-03-15" onValueChange={onValueChange} />);
    expect(input()).toHaveValue('15.03.2026');
    expect(input()).toHaveAttribute('placeholder', 'DD.MM.YYYY');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('opening and closing the popover never calls onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="2026-03-05" />);
    await user.click(button());
    await user.keyboard('{Escape}');
    await user.click(button());
    await user.click(button());
    await user.click(input());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await user.keyboard('{Escape}');
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('DatePicker: popover', () => {
  it('the button opens a named dialog with the focus on the selected date; a pick calls once, closes, updates the text, focus back on the button', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="2026-03-05" />);
    await user.click(button());
    const dialog = popover();
    expect(dialog).not.toBeNull();
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(day('Thursday, March 5, 2026')).toHaveFocus();
    // Not wired to the Field: the input keeps the only copy of the Field id.
    expect(document.querySelectorAll(`[id="${input().id}"]`)).toHaveLength(1);
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('2026-03-06');
    expect(popover()).toBeNull();
    expect(input()).toHaveValue('03/06/2026');
    await waitFor(() => expect(button()).toHaveFocus());
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('with no value the focus goes to today, else to the first selectable day', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Controlled />);
    await user.click(button());
    expect(day('Tuesday, March 10, 2026')).toHaveFocus();
    unmount();
    render(<Controlled min="2026-05-04" />);
    await user.click(button());
    expect(day('Monday, May 4, 2026')).toHaveFocus();
  });

  it('a click on a day picks it; picking the selected date again closes without a call', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="2026-03-05" />);
    await user.click(button());
    await user.click(day('Friday, March 20, 2026'));
    expect(onValueChange).toHaveBeenCalledWith('2026-03-20');
    expect(popover()).toBeNull();
    await user.click(button());
    await user.click(day('Friday, March 20, 2026'));
    expect(popover()).toBeNull();
    await user.click(button());
    await user.keyboard('{Enter}');
    expect(popover()).toBeNull();
    await user.click(button());
    expect(day('Friday, March 20, 2026')).toHaveFocus();
    await user.keyboard(' ');
    expect(popover()).toBeNull();
    // Space on another day than the selected one picks it (and closes).
    await user.click(button());
    await user.keyboard('{ArrowLeft} ');
    expect(popover()).toBeNull();
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-19');
  });

  it('Escape closes without changing the value and returns the focus to the button', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} initial="2026-03-05" />);
    await user.click(button());
    await user.keyboard('{ArrowRight}{Escape}');
    expect(popover()).toBeNull();
    await waitFor(() => expect(button()).toHaveFocus());
    expect(input()).toHaveValue('03/05/2026');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a click outside closes; a second click on the button closes too', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Controlled />
        <p>Outside</p>
      </>,
    );
    await user.click(button());
    expect(popover()).not.toBeNull();
    await user.click(screen.getByText('Outside'));
    expect(popover()).toBeNull();
    await user.click(button());
    expect(popover()).not.toBeNull();
    await user.click(button());
    expect(popover()).toBeNull();
  });

  it('a click outside on another field leaves the focus there', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Controlled />
        <input aria-label="Other" />
      </>,
    );
    await user.click(button());
    await user.click(screen.getByRole('textbox', { name: 'Other' }));
    expect(popover()).toBeNull();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole('textbox', { name: 'Other' })).toHaveFocus();
  });

  it('Alt+ArrowDown in the input commits the text and opens on it; the focus returns to the input', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.type(input(), '04/02/2026');
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onValueChange).toHaveBeenCalledWith('2026-04-02');
    expect(popover()).not.toBeNull();
    expect(day('Thursday, April 2, 2026')).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(input()).toHaveFocus());
  });

  it('min/max/isDateDisabled/weekStartsOn/locale reach the calendar', async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        locale="it-IT"
        weekStartsOn={0}
        min="2026-03-05"
        max="2026-03-20"
        isDateDisabled={(d) => d === '2026-03-12'}
        labels={{ nextMonth: 'Mese successivo', chooseDate: 'Scegli data' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Scegli data/ }));
    const dialog = screen.getByRole('dialog', { name: 'Scegli data' });
    expect(within(dialog).getByText('marzo 2026')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('columnheader')[0]).toHaveAttribute('aria-label', 'domenica');
    expect(within(dialog).getByRole('gridcell', { name: 'mercoledì 4 marzo 2026' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('gridcell', { name: 'giovedì 12 marzo 2026' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('gridcell', { name: 'sabato 21 marzo 2026' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('button', { name: 'Mese successivo' })).toBeDisabled();
  });

  it('the popover content is on the popover level (no literal z-index)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(button());
    const dialog = popover() as HTMLElement;
    expect(dialog).toHaveClass('z-rop-popover');
    expect(dialog.getAttribute('style') ?? '').not.toMatch(/z-index/);
  });

  it('inside a Dialog: Escape closes only the popover, the focus goes back to the button; then the Dialog', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Edit invoice</DialogTitle>
          <Controlled onValueChange={onValueChange} />
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(button());
    expect(popover()).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(popover()).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Edit invoice' })).toBeInTheDocument();
    await waitFor(() => expect(button()).toHaveFocus());
    await user.click(button());
    await user.click(day('Friday, March 20, 2026'));
    expect(onValueChange).toHaveBeenCalledWith('2026-03-20');
    expect(screen.getByRole('dialog', { name: 'Edit invoice' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit invoice' })).toBeNull());
  });
});

describe('DatePicker: Field states', () => {
  it('disabled: input and button out of the tab order, never opens', async () => {
    const user = userEvent.setup();
    render(
      <InField state="disabled">
        <DatePicker {...BASE} defaultValue="2026-03-05" />
      </InField>,
    );
    expect(input()).toBeDisabled();
    expect(button()).toBeDisabled();
    await user.tab();
    expect(document.body).toHaveFocus();
    await user.click(button());
    expect(popover()).toBeNull();
  });

  it.each(['forced', 'locked'] as const)(
    '%s: readOnly focusable input, focusable button that never opens (click, Enter, Space, Alt+ArrowDown), reason described, no callback',
    async (state) => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const onInvalidInput = vi.fn();
      render(
        <InField state={state} stateReason="Set by the contract.">
          <DatePicker {...BASE} defaultValue="2026-03-05" onValueChange={onValueChange} onInvalidInput={onInvalidInput} />
        </InField>,
      );
      const box = input();
      expect(box).toHaveAttribute('readonly');
      expect(box).toHaveAccessibleDescription('Set by the contract.');
      await user.tab();
      expect(box).toHaveFocus();
      await user.keyboard('12/12/2026{Enter}{Alt>}{ArrowDown}{/Alt}');
      expect(box).toHaveValue('03/05/2026');
      expect(popover()).toBeNull();
      await user.tab();
      expect(button()).toHaveFocus();
      expect(button()).toHaveAccessibleDescription('Set by the contract.');
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      await user.click(button());
      expect(popover()).toBeNull();
      expect(button()).toHaveAttribute('aria-expanded', 'false');
      await user.click(screen.getByText('Due date'));
      expect(box).toHaveFocus();
      expect(onValueChange).not.toHaveBeenCalled();
      expect(onInvalidInput).not.toHaveBeenCalled();
    },
  );

  it('own readOnly: same as locked (never opens)', async () => {
    const user = userEvent.setup();
    render(<DatePicker {...BASE} aria-label="Due date" readOnly defaultValue="2026-03-05" />);
    await user.click(button());
    expect(popover()).toBeNull();
  });

  it('the popover open when the Field becomes locked: it closes and the focus goes back to the button', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [state, setState] = useState<FieldState>('default');
      const props = (state === 'default' ? { state } : { state, stateReason: 'Locked now.' }) as FieldStateProps;
      return (
        <>
          <InField {...props}>
            <DatePicker {...BASE} />
          </InField>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setState('locked')}>
            Lock
          </button>
        </>
      );
    }
    render(<Demo />);
    await user.click(button());
    expect(popover()).not.toBeNull();
    // An external change while the popover is open (a timer, a server push): fired without moving the focus.
    act(() => {
      screen.getByRole('button', { name: 'Lock' }).click();
    });
    expect(popover()).toBeNull();
    await waitFor(() => expect(button()).toHaveFocus());
  });

  it('typing then becoming locked: the uncommitted text is dropped, nothing is reported', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    function Demo({ state }: { state: FieldState }) {
      const props = (state === 'default' ? { state } : { state, stateReason: 'Locked now.' }) as FieldStateProps;
      return (
        <InField {...props}>
          <DatePicker {...BASE} defaultValue="2026-03-05" onValueChange={onValueChange} />
        </InField>
      );
    }
    const { rerender } = render(<Demo state="default" />);
    await user.clear(input());
    await user.type(input(), '04/0');
    rerender(<Demo state="locked" />);
    expect(input()).toHaveValue('03/05/2026');
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('DatePicker: DOM contract', () => {
  it('no non-DOM prop leaks; className merged with cn on the input; ref is the input; size', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <DatePicker
        ref={ref}
        {...BASE}
        aria-label="Due date"
        data-testid="dp"
        className="py-4"
        size="sm"
        min="2026-01-01"
        max="2026-12-31"
        weekStartsOn={1}
        isDateDisabled={() => false}
        onInvalidInput={() => {}}
        onValueChange={() => {}}
        labels={{ chooseDate: 'Pick' }}
        defaultValue="2026-03-05"
      />,
    );
    const box = screen.getByTestId('dp');
    expect(ref.current).toBe(box);
    expect(box).toHaveClass('py-4');
    expect(box).not.toHaveClass('py-[5px]');
    const html = document.body.innerHTML;
    for (const attr of box.getAttributeNames()) {
      expect(['oninvalidinput', 'onvaluechange', 'locale', 'labels', 'today', 'min', 'max', 'weekstartson', 'isdatedisabled', 'size', 'defaultvalue']).not.toContain(attr);
    }
    expect(html).not.toMatch(/\[object Object\]|oninvalidinput|weekstartson|isdatedisabled/i);
    // `sm`: the button is the 32px icon size, as the input.
    expect(screen.getByRole('button')).toHaveClass('size-8');
  });

  it('md by default: 36px icon button', () => {
    render(<DatePicker {...BASE} aria-label="Due date" />);
    expect(screen.getByRole('button')).toHaveClass('size-9');
    expect(input()).toHaveClass('py-[7px]');
  });
});

describe('DatePicker: SSR', () => {
  it('renderToString + hydrateRoot with explicit locale: no hydration error', async () => {
    const element = (
      <Field label="Scadenza">
        <DatePicker locale="it-IT" today="2026-03-10" defaultValue="2026-03-17" />
      </Field>
    );
    const html = renderToString(element);
    expect(html).toContain('17/03/2026');
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { hydrateRoot } = await import('react-dom/client');
    let root: ReturnType<typeof hydrateRoot> | undefined;
    act(() => {
      root = hydrateRoot(host, element, { onRecoverableError: (e) => console.error(e) });
    });
    expect(error).not.toHaveBeenCalled();
    expect(host.querySelector('input')).toHaveValue('17/03/2026');
    act(() => root?.unmount());
    host.remove();
  });
});
