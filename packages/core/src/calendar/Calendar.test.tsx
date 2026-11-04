import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Field } from '../field/Field';
import { Calendar, type CalendarProps } from './Calendar';
import { dayOfWeek } from './date-math';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const BASE = { locale: 'en-US', today: '2026-03-10' } as const;
const grid = () => screen.getByRole('grid');
const day = (name: string) => screen.getByRole('gridcell', { name });
const tabStops = () => Array.from(grid().querySelectorAll('[tabindex="0"]'));
const tabStopIso = () => {
  const stops = tabStops();
  expect(stops).toHaveLength(1);
  return stops[0]?.getAttribute('data-iso');
};
const heading = () => screen.getByText(/^[A-Z][a-z]+ \d{4}$/);
const press = (key: string, init: Partial<KeyboardEventInit> = {}) => {
  fireEvent.keyDown(document.activeElement as Element, { key, ...init });
};

describe('Calendar: structure', () => {
  it('heading is a polite live region naming the grid; month buttons; weekday headers; full-date cell names', () => {
    render(<Calendar {...BASE} aria-label="Due date" defaultValue="2026-03-17" />);
    expect(screen.getByRole('group', { name: 'Due date' })).toBeInTheDocument();
    expect(heading()).toHaveTextContent('March 2026');
    expect(heading()).toHaveAttribute('aria-live', 'polite');
    expect(grid()).toHaveAccessibleName('March 2026');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.getAttribute('aria-label'))).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    expect(headers.map((h) => h.textContent)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const cell = day('Tuesday, March 3, 2026');
    expect(cell).toHaveAttribute('data-iso', '2026-03-03');
    expect(cell).toHaveTextContent('3');
    expect(day('Tuesday, March 17, 2026')).toHaveAttribute('aria-selected', 'true');
    expect(cell).toHaveAttribute('aria-selected', 'false');
    expect(day('Tuesday, March 10, 2026')).toHaveAttribute('aria-current', 'date');
    expect(cell).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('gridcell', { name: /March \d+, 2026/ })).toHaveLength(31);
  });

  it('always 6 body rows: February 2026 (4 weeks with Sunday first) and August 2026 (6 weeks)', () => {
    const { rerender } = render(<Calendar {...BASE} month="2026-02" />);
    expect(within(grid()).getAllByRole('row')).toHaveLength(7); // header + 6
    rerender(<Calendar {...BASE} month="2026-08" />);
    expect(within(grid()).getAllByRole('row')).toHaveLength(7);
  });

  it('labels are merged key by key with the English defaults', () => {
    render(<Calendar {...BASE} labels={{ previousMonth: 'Mese precedente', nextMonth: undefined }} />);
    expect(screen.getByRole('button', { name: 'Mese precedente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('it-IT: Monday first and Italian names; weekStartsOn wins over the locale', () => {
    const { rerender } = render(<Calendar locale="it-IT" today="2026-03-10" />);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('aria-label', 'lunedì');
    expect(screen.getByText('marzo 2026')).toBeInTheDocument();
    expect(day('martedì 3 marzo 2026')).toBeInTheDocument();
    rerender(<Calendar locale="it-IT" today="2026-03-10" weekStartsOn={3} />);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('aria-label', 'mercoledì');
  });

  it('every day sits under the header of its weekday', () => {
    for (const start of [0, 1, 6] as const) {
      cleanup();
      render(<Calendar {...BASE} weekStartsOn={start} month="2026-05" />);
      for (const row of within(grid()).getAllByRole('row').slice(1)) {
        row.querySelectorAll('td').forEach((td, c) => {
          const iso = td.getAttribute('data-iso');
          if (iso) expect(dayOfWeek(iso)).toBe((start + c) % 7);
        });
      }
    }
  });
});

describe('Calendar: tab stop (roving tabindex)', () => {
  it('selected, else today, else the first selectable day', () => {
    const { rerender } = render(<Calendar {...BASE} value="2026-03-17" />);
    expect(tabStopIso()).toBe('2026-03-17');
    rerender(<Calendar {...BASE} value={null} />);
    expect(tabStopIso()).toBe('2026-03-10');
    rerender(<Calendar {...BASE} value={null} month="2026-04" />);
    expect(tabStopIso()).toBe('2026-04-01');
    rerender(<Calendar {...BASE} value={null} month="2026-04" isDateDisabled={(d) => d < '2026-04-06'} />);
    expect(tabStopIso()).toBe('2026-04-06');
  });

  it('Tab reaches the grid once (after the two month buttons) and leaves it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Calendar {...BASE} />
        <button type="button">after</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveFocus();
    await user.tab();
    expect(day('Tuesday, March 10, 2026')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });
});

describe('Calendar: keyboard', () => {
  function setup(props: Partial<CalendarProps> = {}) {
    const onValueChange = vi.fn();
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} onValueChange={onValueChange} onMonthChange={onMonthChange} {...props} />);
    act(() => (grid().querySelector('[tabindex="0"]') as HTMLElement).focus());
    return { onValueChange, onMonthChange };
  }
  const focusedIso = () => document.activeElement?.getAttribute('data-iso');

  it('arrows ±1 day / ±7 days, crossing months', () => {
    const { onMonthChange } = setup({ defaultValue: '2026-03-01' });
    expect(focusedIso()).toBe('2026-03-01');
    press('ArrowRight');
    expect(focusedIso()).toBe('2026-03-02');
    press('ArrowDown');
    expect(focusedIso()).toBe('2026-03-09');
    press('ArrowUp');
    press('ArrowUp');
    expect(focusedIso()).toBe('2026-02-23');
    expect(heading()).toHaveTextContent('February 2026');
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-02');
    press('ArrowLeft');
    expect(focusedIso()).toBe('2026-02-22');
    expect(tabStops()).toHaveLength(1);
  });

  it('Home/End go to the start/end of the week of weekStartsOn', () => {
    setup({ defaultValue: '2026-03-04', weekStartsOn: 1 });
    press('Home');
    expect(focusedIso()).toBe('2026-03-02');
    press('End');
    expect(focusedIso()).toBe('2026-03-08');
  });

  it('PageDown from January 31 lands on February 28 (not March); Shift+PageUp/Down move a year', () => {
    const { onMonthChange } = setup({ defaultValue: '2026-01-31' });
    press('PageDown');
    expect(focusedIso()).toBe('2026-02-28');
    expect(heading()).toHaveTextContent('February 2026');
    press('PageUp');
    expect(focusedIso()).toBe('2026-01-28');
    press('PageDown', { shiftKey: true });
    expect(focusedIso()).toBe('2027-01-28');
    expect(heading()).toHaveTextContent('January 2027');
    press('PageUp', { shiftKey: true });
    expect(focusedIso()).toBe('2026-01-28');
    expect(onMonthChange.mock.calls.map((c) => c[0])).toEqual(['2026-02', '2026-01', '2027-01', '2026-01']);
  });

  it('a leap day + 1 year lands on February 28', () => {
    setup({ defaultValue: '2024-02-29', today: '2024-02-01' });
    press('PageDown', { shiftKey: true });
    expect(focusedIso()).toBe('2025-02-28');
  });

  it('Enter and Space select; selecting the selected date again reports nothing', () => {
    const { onValueChange } = setup();
    press('ArrowRight');
    press('Enter');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-11');
    expect(day('Wednesday, March 11, 2026')).toHaveAttribute('aria-selected', 'true');
    press('ArrowRight');
    press(' ');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-12');
    press('Enter');
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  it('modifier keys and unrelated keys do nothing', () => {
    const { onMonthChange } = setup();
    press('ArrowRight', { ctrlKey: true });
    press('PageDown', { altKey: true });
    press('a');
    expect(focusedIso()).toBe('2026-03-10');
    expect(onMonthChange).not.toHaveBeenCalled();
  });

  it('cannot leave 0001-01-01 / 9999-12-31', () => {
    setup({ defaultValue: '0001-01-01', today: '0001-01-01' });
    press('ArrowLeft');
    press('PageUp');
    expect(focusedIso()).toBe('0001-01-01');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    cleanup();
    setup({ defaultValue: '9999-12-31', today: '9999-12-31' });
    press('ArrowRight');
    press('PageDown', { shiftKey: true });
    expect(focusedIso()).toBe('9999-12-31');
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });
});

describe('Calendar: mouse', () => {
  it('a click selects; the month buttons change month and report it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    await user.click(day('Friday, March 20, 2026'));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('2026-03-20');
    expect(day('Friday, March 20, 2026')).toHaveAttribute('aria-selected', 'true');
    expect(day('Friday, March 20, 2026')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(heading()).toHaveTextContent('April 2026');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(heading()).toHaveTextContent('February 2026');
    expect(onMonthChange.mock.calls.map((c) => c[0])).toEqual(['2026-04', '2026-03', '2026-02']);
    // Clicking an empty cell (outside the month) does nothing.
    const empty = grid().querySelector('td:not([data-iso])') as HTMLElement;
    await user.click(empty);
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });
});

describe('Calendar: controlled, no echo (rule of absent values)', () => {
  const absent: [string, Partial<CalendarProps>][] = [
    ['missing', {}],
    ['undefined', { value: undefined }],
    ['null', { value: null }],
  ];

  for (const [name, props] of absent) {
    it(`value ${name}: nothing selected, zero callbacks at mount and after changes`, () => {
      const onValueChange = vi.fn();
      const onMonthChange = vi.fn();
      const { rerender } = render(<Calendar {...BASE} {...props} onValueChange={onValueChange} onMonthChange={onMonthChange} />);
      expect(grid().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
      for (const next of absent) {
        rerender(<Calendar {...BASE} {...next[1]} onValueChange={onValueChange} onMonthChange={onMonthChange} />);
        expect(grid().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
      }
      expect(onValueChange).not.toHaveBeenCalled();
      expect(onMonthChange).not.toHaveBeenCalled();
    });
  }

  it("value '' (invalid): nothing selected, console.error, no callbacks, at mount and after", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    const { rerender } = render(<Calendar {...BASE} value="" onValueChange={onValueChange} />);
    expect(grid().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('`value` "" is not a valid ISO date'));
    rerender(<Calendar {...BASE} value="2026-03-05" onValueChange={onValueChange} />);
    rerender(<Calendar {...BASE} value="" onValueChange={onValueChange} />);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it.each(['2026-02-30', '03/03/2026', '2026-3-3', 'tomorrow'])('invalid value %j: no selection, console.error, no crash', (bad) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValueChange = vi.fn();
    render(<Calendar {...BASE} value={bad} onValueChange={onValueChange} />);
    expect(grid().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    expect(heading()).toHaveTextContent('March 2026');
    expect(error).toHaveBeenCalledWith(expect.stringContaining(`\`value\` ${JSON.stringify(bad)}`));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('a controlled value is not changed by a click until the parent applies it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar {...BASE} value="2026-03-05" onValueChange={onValueChange} />);
    await user.click(day('Friday, March 20, 2026'));
    expect(onValueChange).toHaveBeenCalledWith('2026-03-20');
    expect(day('Thursday, March 5, 2026')).toHaveAttribute('aria-selected', 'true');
    expect(day('Friday, March 20, 2026')).toHaveAttribute('aria-selected', 'false');
  });

  it('async hydration: a value arriving later in another month moves the month, no callback', () => {
    const onValueChange = vi.fn();
    const onMonthChange = vi.fn();
    const { rerender } = render(<Calendar {...BASE} value={null} onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    expect(heading()).toHaveTextContent('March 2026');
    rerender(<Calendar {...BASE} value="2026-07-14" onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    expect(heading()).toHaveTextContent('July 2026');
    expect(day('Tuesday, July 14, 2026')).toHaveAttribute('aria-selected', 'true');
    expect(tabStopIso()).toBe('2026-07-14');
    rerender(<Calendar {...BASE} value="2026-07-20" onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    expect(heading()).toHaveTextContent('July 2026');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onMonthChange).not.toHaveBeenCalled();
  });

  it('a controlled month is not moved by an external value', () => {
    const { rerender } = render(<Calendar {...BASE} month="2026-03" value={null} />);
    rerender(<Calendar {...BASE} month="2026-03" value="2026-07-14" />);
    expect(heading()).toHaveTextContent('March 2026');
  });

  it('controlled month: navigation only reports, the parent decides', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} month="2026-03" onMonthChange={onMonthChange} />);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledExactlyOnceWith('2026-04');
    expect(heading()).toHaveTextContent('March 2026');
  });

  it('changing the locale after mount re-formats without any callback', () => {
    const onValueChange = vi.fn();
    const onMonthChange = vi.fn();
    const { rerender } = render(<Calendar {...BASE} value="2026-03-17" onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    rerender(<Calendar {...BASE} locale="de-DE" value="2026-03-17" onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    expect(screen.getByText('März 2026')).toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onMonthChange).not.toHaveBeenCalled();
  });

  it('defaultMonth, else the month of the value, else today moved inside min/max', () => {
    const cases: [Partial<CalendarProps>, string][] = [
      [{ defaultMonth: '2026-11' }, 'November 2026'],
      [{ defaultValue: '2026-06-01' }, 'June 2026'],
      [{ min: '2026-05-10' }, 'May 2026'],
      [{ max: '2025-12-24' }, 'December 2025'],
    ];
    for (const [props, expected] of cases) {
      cleanup();
      render(<Calendar {...BASE} {...props} />);
      expect(heading()).toHaveTextContent(expected);
    }
  });

  it('value and defaultValue together: value wins, console.error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Calendar {...BASE} value="2026-03-05" defaultValue="2026-03-06" />);
    expect(day('Thursday, March 5, 2026')).toHaveAttribute('aria-selected', 'true');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('both `value` and `defaultValue`'));
  });
});

describe('Calendar: limits', () => {
  it('dates outside min/max or disabled are reachable, not selectable; aria-disabled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Calendar
        {...BASE}
        min="2026-03-05"
        max="2026-03-20"
        isDateDisabled={(d) => d === '2026-03-12'}
        onValueChange={onValueChange}
      />,
    );
    for (const name of ['Wednesday, March 4, 2026', 'Saturday, March 21, 2026', 'Thursday, March 12, 2026']) {
      expect(day(name)).toHaveAttribute('aria-disabled', 'true');
      await user.click(day(name));
      expect(day(name)).toHaveFocus();
    }
    expect(day('Tuesday, March 10, 2026')).not.toHaveAttribute('aria-disabled');
    // Keyboard: arrows reach the disabled 12th, Enter does nothing.
    act(() => day('Wednesday, March 11, 2026').focus());
    press('ArrowRight');
    expect(day('Thursday, March 12, 2026')).toHaveFocus();
    press('Enter');
    press(' ');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(grid().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
  });

  it('month buttons and PageUp/PageDown cannot reach a month entirely outside min/max', () => {
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} min="2026-03-05" max="2026-04-02" onMonthChange={onMonthChange} />);
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    act(() => day('Tuesday, March 10, 2026').focus());
    press('PageUp');
    expect(day('Tuesday, March 10, 2026')).toHaveFocus();
    press('PageDown');
    expect(heading()).toHaveTextContent('April 2026');
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-04-10');
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    press('PageDown');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-04-24');
    expect(onMonthChange).toHaveBeenCalledExactlyOnceWith('2026-04');
  });

  it('the month button disabled by its own click passes the focus to the other one', async () => {
    const user = userEvent.setup();
    render(<Calendar {...BASE} max="2026-04-30" />);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus();
  });

  it('min > max: nothing selectable, console.error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar {...BASE} min="2026-03-20" max="2026-03-05" onValueChange={onValueChange} />);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('`min` (2026-03-20) is after `max` (2026-03-05)'));
    expect(grid().querySelectorAll('[data-iso]:not([aria-disabled="true"])')).toHaveLength(0);
    await user.click(day('Tuesday, March 10, 2026'));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(tabStopIso()).toBe('2026-03-10');
  });

  it('today outside min/max: marked but not selectable', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar {...BASE} min="2026-03-15" onValueChange={onValueChange} />);
    const today = day('Tuesday, March 10, 2026');
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveAttribute('aria-disabled', 'true');
    await user.click(today);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('invalid min/max/today/month are ignored with a console.error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Calendar locale="en-US" today="2026-13-01" min="x" max="2026-02-30" month="2026-3" />);
    for (const name of ['today', 'min', 'max']) {
      expect(error).toHaveBeenCalledWith(expect.stringContaining(`\`${name}\``));
    }
    expect(error).toHaveBeenCalledWith(expect.stringContaining('`month` "2026-3" is not a valid ISO month'));
    expect(grid().querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });
});

describe('Calendar: visible month outside min/max (never stuck)', () => {
  const limits = { min: '2026-01-01', max: '2026-03-31' } as const;

  it('value before the range: Next and PageDown move towards it, Previous/PageUp stay blocked', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} value="2024-05-10" {...limits} onMonthChange={onMonthChange} />);
    expect(heading()).toHaveTextContent('May 2024');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(heading()).toHaveTextContent('June 2024');
    act(() => day('Monday, June 10, 2024').focus());
    press('PageUp');
    expect(heading()).toHaveTextContent('June 2024');
    press('PageDown', { shiftKey: true });
    expect(heading()).toHaveTextContent('June 2025');
    // A year more would overshoot max (June 2026): refused.
    press('PageDown', { shiftKey: true });
    expect(heading()).toHaveTextContent('June 2025');
    for (let i = 0; i < 7; i++) press('PageDown');
    expect(heading()).toHaveTextContent('January 2026');
    expect(onMonthChange.mock.calls.map((c) => c[0])).toEqual([
      '2024-06',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
    // Inside the range now: the usual rule (no going back out).
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it('defaultMonth after the range: Previous moves back to it, Next stays blocked', async () => {
    const user = userEvent.setup();
    render(<Calendar {...BASE} defaultMonth="2026-06" {...limits} />);
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(heading()).toHaveTextContent('March 2026');
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('defaultMonth 2025-06 (before): arrows crossing the month boundary towards the range work', () => {
    render(<Calendar {...BASE} defaultMonth="2025-06" {...limits} />);
    act(() => day('Monday, June 30, 2025').focus());
    press('ArrowRight');
    expect(heading()).toHaveTextContent('July 2025');
    expect(document.activeElement).toHaveAttribute('data-iso', '2025-07-01');
    press('ArrowLeft');
    expect(heading()).toHaveTextContent('July 2025');
    expect(document.activeElement).toHaveAttribute('data-iso', '2025-07-01');
  });

  it('an async value out of range: the same', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Calendar {...BASE} value={null} {...limits} />);
    rerender(<Calendar {...BASE} value="2024-05-10" {...limits} />);
    expect(heading()).toHaveTextContent('May 2024');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(heading()).toHaveTextContent('June 2024');
  });
});

describe('Calendar: the tab stop follows an external value', () => {
  it('after the user moved the focus, a new value from outside becomes the tab stop', () => {
    const { rerender } = render(<Calendar {...BASE} value="2026-03-05" />);
    act(() => day('Thursday, March 5, 2026').focus());
    press('ArrowRight');
    press('ArrowRight');
    act(() => (document.activeElement as HTMLElement).blur());
    expect(tabStopIso()).toBe('2026-03-07');
    rerender(<Calendar {...BASE} value="2026-03-20" />);
    expect(tabStopIso()).toBe('2026-03-20');
    rerender(<Calendar {...BASE} value="2026-08-14" />);
    expect(heading()).toHaveTextContent('August 2026');
    expect(tabStopIso()).toBe('2026-08-14');
  });

  it('with the focus in the grid, the focus moves to the new value', () => {
    const { rerender } = render(<Calendar {...BASE} value="2026-03-05" />);
    act(() => day('Thursday, March 5, 2026').focus());
    press('ArrowDown');
    rerender(<Calendar {...BASE} value="2026-03-25" />);
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-03-25');
  });
});

describe('Calendar: becoming disabled with the focus inside', () => {
  it.each(['a day', 'a month button'])('focus on %s moves to the container, which is out of the tab order', (where) => {
    const { rerender, container } = render(<Calendar {...BASE} aria-label="Due" />);
    const target = where === 'a day' ? day('Tuesday, March 10, 2026') : screen.getByRole('button', { name: 'Next month' });
    act(() => target.focus());
    rerender(<Calendar {...BASE} aria-label="Due" disabled />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveFocus();
    expect(root).toHaveAttribute('tabindex', '-1');
    rerender(<Calendar {...BASE} aria-label="Due" />);
    expect(root).not.toHaveAttribute('tabindex');
  });

  it('focus elsewhere is not touched', () => {
    const { rerender } = render(
      <>
        <button type="button">outside</button>
        <Calendar {...BASE} aria-label="Due" />
      </>,
    );
    act(() => screen.getByRole('button', { name: 'outside' }).focus());
    rerender(
      <>
        <button type="button">outside</button>
        <Calendar {...BASE} aria-label="Due" disabled />
      </>,
    );
    expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus();
  });
});

describe('Calendar: direction', () => {
  it('reads the computed direction once per locale, and at each navigation key', () => {
    const spy = vi.spyOn(window, 'getComputedStyle');
    const { rerender } = render(<Calendar {...BASE} />);
    const afterMount = spy.mock.calls.length;
    rerender(<Calendar {...BASE} value="2026-03-05" />);
    rerender(<Calendar {...BASE} value="2026-03-06" />);
    expect(spy.mock.calls.length).toBe(afterMount);
    rerender(<Calendar {...BASE} locale="de-DE" value="2026-03-06" />);
    expect(spy.mock.calls.length).toBe(afterMount + 1);
  });

  it('RTL picked up at key time: ArrowLeft moves forward', () => {
    // Inline on the root: jsdom does not inherit `direction` from an ancestor.
    const { rerender } = render(<Calendar {...BASE} value="2026-03-05" />);
    rerender(<Calendar {...BASE} value="2026-03-05" style={{ direction: 'rtl' }} />);
    act(() => day('Thursday, March 5, 2026').focus());
    press('ArrowLeft');
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-03-06');
  });
});

describe('Calendar: disabled and readOnly', () => {
  it('disabled: no tab stop, buttons disabled, clicks and keys do nothing', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} disabled value="2026-03-05" onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    expect(grid()).toHaveAttribute('aria-disabled', 'true');
    expect(grid().querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await user.click(day('Friday, March 20, 2026'));
    fireEvent.keyDown(day('Thursday, March 5, 2026'), { key: 'Enter' });
    fireEvent.keyDown(day('Thursday, March 5, 2026'), { key: 'PageDown' });
    await user.tab();
    expect(document.body).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onMonthChange).not.toHaveBeenCalled();
  });

  it('readOnly: navigable (tab stop, arrows, months) but nothing is selected', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onMonthChange = vi.fn();
    render(<Calendar {...BASE} readOnly value="2026-03-05" onValueChange={onValueChange} onMonthChange={onMonthChange} />);
    expect(grid()).toHaveAttribute('aria-readonly', 'true');
    expect(tabStopIso()).toBe('2026-03-05');
    act(() => day('Thursday, March 5, 2026').focus());
    press('ArrowRight');
    press('Enter');
    press(' ');
    await user.click(day('Friday, March 20, 2026'));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(day('Thursday, March 5, 2026')).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledWith('2026-04');
  });
});

describe('Calendar: inside a Field', () => {
  it('group named and described by the Field; data-rop-name on the tab-stop day', () => {
    render(
      <Field label="Due date" name="dueDate" help="Business days only." error="Pick a date.">
        <Calendar {...BASE} />
      </Field>,
    );
    const group = screen.getByRole('group', { name: 'Due date' });
    expect(group).toHaveAccessibleDescription('Pick a date. Business days only.');
    expect(group.id).not.toBe('');
    expect(group).toHaveAttribute('data-invalid', 'true');
    expect(group).not.toHaveAttribute('aria-invalid');
    expect(group).not.toHaveAttribute('aria-required');
    const named = document.querySelectorAll('[data-rop-name="dueDate"]');
    expect(named).toHaveLength(1);
    expect(named[0]).toHaveAttribute('tabindex', '0');
  });

  it.each(['forced', 'locked'] as const)('%s: read-only grid, nothing selectable, still focusable', async (state) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Field label="Due date" state={state} stateReason="Set by the contract.">
        <Calendar {...BASE} defaultValue="2026-03-05" onValueChange={onValueChange} />
      </Field>,
    );
    expect(grid()).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('group', { name: 'Due date' })).toHaveAccessibleDescription(/Set by the contract/);
    await user.click(day('Friday, March 20, 2026'));
    press('Enter');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(tabStops()).toHaveLength(1);
  });

  it('a disabled Field disables the calendar', () => {
    render(
      <Field label="Due date" state="disabled">
        <Calendar {...BASE} />
      </Field>,
    );
    expect(grid()).toHaveAttribute('aria-disabled', 'true');
    expect(grid().querySelectorAll('[tabindex]')).toHaveLength(0);
  });
});

describe('Calendar: focus while the month changes from outside', () => {
  function Demo() {
    const [month, setMonth] = useState('2026-01');
    return (
      <>
        <Calendar {...BASE} month={month} onMonthChange={setMonth} />
        <output data-testid="month">{month}</output>
        <button type="button" onClick={() => setMonth('2026-02')}>
          external
        </button>
      </>
    );
  }

  it('focus stays in the grid, on the same day of the new month or its last day', () => {
    render(<Demo />);
    act(() => day('Saturday, January 31, 2026').focus());
    // External change while the focus is in the grid (no click: that would move the focus).
    act(() => (screen.getByRole('button', { name: 'external' }) as HTMLButtonElement).click());
    expect(heading()).toHaveTextContent('February 2026');
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-02-28');
    expect(tabStopIso()).toBe('2026-02-28');
  });

  it('keyboard navigation in a controlled month follows the parent', () => {
    render(<Demo />);
    act(() => day('Saturday, January 31, 2026').focus());
    press('ArrowRight');
    expect(screen.getByTestId('month')).toHaveTextContent('2026-02');
    expect(document.activeElement).toHaveAttribute('data-iso', '2026-02-01');
  });
});

describe('Calendar: DOM contract', () => {
  it('no non-DOM prop leaks to the DOM; className merged with cn; ref forwarded; rest props kept', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <Calendar
        ref={ref}
        {...BASE}
        value="2026-03-05"
        defaultMonth="2026-03"
        min="2026-01-01"
        max="2026-12-31"
        isDateDisabled={() => false}
        weekStartsOn={1}
        readOnly={false}
        disabled={false}
        labels={{ previousMonth: 'Prev' }}
        onValueChange={() => {}}
        onMonthChange={() => {}}
        className="p-6 custom"
        data-testid="cal"
        aria-label="Due"
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(ref.current).toBe(root);
    expect(root).toHaveAttribute('data-testid', 'cal');
    expect(root.className).toContain('custom');
    expect(root.className).toContain('p-6');
    expect(root.className).not.toMatch(/(^|\s)p-3(\s|$)/);
    const attributes = Array.from(container.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes).map((a) => a.name));
    for (const leaked of [
      'value',
      'defaultvalue',
      'month',
      'defaultmonth',
      'min',
      'max',
      'isdatedisabled',
      'today',
      'locale',
      'weekstartson',
      'readonly',
      'disabled',
      'labels',
      'onvaluechange',
      'onmonthchange',
    ]) {
      expect(attributes).not.toContain(leaked);
    }
  });
});

describe('Calendar: SSR', () => {
  it('renderToString + hydrateRoot with explicit locale and today: no hydration error', async () => {
    const element = <Calendar locale="it-IT" today="2026-03-10" defaultValue="2026-03-17" aria-label="Data" />;
    const html = renderToString(element);
    expect(html).toContain('marzo 2026');
    expect(html).toContain('aria-selected="true"');
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
    expect(host.querySelector('[aria-selected="true"]')).toHaveAttribute('data-iso', '2026-03-17');
    act(() => root?.unmount());
    host.remove();
  });
});

describe('Calendar: time zones (no day shift)', () => {
  const ZONES = ['America/Sao_Paulo', 'Europe/Rome', 'Pacific/Kiritimati', 'America/Los_Angeles'];
  const MONTHS = ['2026-03', '2026-10', '2026-11', '2024-02', '2025-10'];
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  for (const zone of ZONES) {
    it(`${zone}: every day of DST months selects exactly its own ISO string, none duplicated or missing`, () => {
      process.env.TZ = zone;
      for (const month of MONTHS) {
        const onValueChange = vi.fn();
        const { unmount } = render(<Calendar {...BASE} month={month} onValueChange={onValueChange} />);
        const cells = Array.from(grid().querySelectorAll<HTMLElement>('[data-iso]'));
        const isos = cells.map((c) => c.getAttribute('data-iso'));
        const [y, m] = month.split('-').map(Number) as [number, number];
        const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
        expect(isos).toEqual(Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`));
        cells.forEach((cell, i) => {
          expect(cell.textContent).toBe(String(i + 1));
          expect(cell.getAttribute('aria-label')).toContain(` ${i + 1}, ${y}`);
          fireEvent.click(cell);
          expect(onValueChange).toHaveBeenLastCalledWith(isos[i]);
        });
        unmount();
      }
    });

    it(`${zone}: the default today is the local wall-clock date`, () => {
      process.env.TZ = zone;
      vi.useFakeTimers({ toFake: ['Date'] });
      // 2026-03-08 10:30 UTC, the morning of the US DST change: March 8 everywhere but Kiritimati (UTC+14, March 9).
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 8, 10, 30)));
      const expected = { 'America/Sao_Paulo': '2026-03-08', 'Europe/Rome': '2026-03-08', 'Pacific/Kiritimati': '2026-03-09', 'America/Los_Angeles': '2026-03-08' }[zone];
      render(<Calendar locale="en-US" />);
      expect(grid().querySelector('[aria-current="date"]')).toHaveAttribute('data-iso', expected);
    });
  }

  it('America/Los_Angeles just before midnight UTC: today is still the local date', () => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 9, 3, 0))); // 2026-03-08 20:00 PDT
    render(<Calendar locale="en-US" />);
    expect(grid().querySelector('[aria-current="date"]')).toHaveAttribute('data-iso', '2026-03-08');
  });
});
