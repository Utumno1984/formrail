import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToMonth,
  clampMonth,
  dayInMonth,
  dayOfWeek,
  daysInMonth,
  endOfWeek,
  formatIsoDate,
  fromDayNumber,
  getFocusableDate,
  getKeyboardTarget,
  getMonthGrid,
  isDateSelectable,
  isGridNavigationKey,
  isLeapYear,
  isMonthNavigable,
  lastDayOfMonth,
  limitsConflict,
  localToday,
  parseIsoDate,
  parseIsoMonth,
  startOfWeek,
  toDayNumber,
  type Weekday,
} from './date-math';

describe('parseIsoDate', () => {
  it.each([
    ['2026-03-03', { year: 2026, month: 3, day: 3 }],
    ['0001-01-01', { year: 1, month: 1, day: 1 }],
    ['9999-12-31', { year: 9999, month: 12, day: 31 }],
    ['2024-02-29', { year: 2024, month: 2, day: 29 }],
    ['2000-02-29', { year: 2000, month: 2, day: 29 }],
  ])('%s is valid', (input, expected) => {
    expect(parseIsoDate(input)).toEqual(expected);
  });

  it.each([
    '2026-02-30',
    '2026-02-29',
    '2100-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '0000-01-01',
    '',
    '2026-3-3',
    '20260303',
    '2026-03-03T00:00',
    ' 2026-03-03',
    '10000-01-01',
    '03/03/2026',
  ])('%j is invalid', (input) => {
    expect(parseIsoDate(input)).toBeNull();
  });

  it.each([null, undefined, 20260303, new Date(2026, 2, 3), {}])('a non-string (%s) is invalid', (input) => {
    expect(parseIsoDate(input)).toBeNull();
  });
});

describe('parseIsoMonth', () => {
  it('accepts YYYY-MM, 0001-01..9999-12', () => {
    expect(parseIsoMonth('2026-03')).toEqual({ year: 2026, month: 3 });
    expect(parseIsoMonth('0001-01')).toEqual({ year: 1, month: 1 });
    expect(parseIsoMonth('9999-12')).toEqual({ year: 9999, month: 12 });
  });
  it.each(['2026-13', '2026-00', '0000-05', '2026-3', '2026-03-01', '', 'March'])('%j is invalid', (input) => {
    expect(parseIsoMonth(input)).toBeNull();
  });
});

describe('leap years and month lengths', () => {
  it('Gregorian rule: every 4 years, not every 100, again every 400', () => {
    expect([2024, 2000, 1600, 4].map(isLeapYear)).toEqual([true, true, true, true]);
    expect([2026, 2100, 1900, 1, 9999].map(isLeapYear)).toEqual([false, false, false, false, false]);
  });
  it('month lengths', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe('day numbers', () => {
  it('1970-01-01 is day 0, neighbours ±1', () => {
    expect(toDayNumber({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(toDayNumber({ year: 1969, month: 12, day: 31 })).toBe(-1);
    expect(toDayNumber({ year: 1970, month: 1, day: 2 })).toBe(1);
  });

  it('agrees with Date.UTC on a wide sample (UTC only, no local time)', () => {
    for (const [y, m, d] of [
      [2026, 3, 29],
      [2026, 10, 25],
      [2000, 2, 29],
      [1900, 3, 1],
      [2400, 12, 31],
      [1600, 1, 1],
    ] as const) {
      expect(toDayNumber({ year: y, month: m, day: d })).toBe(Date.UTC(y, m - 1, d) / 86_400_000);
    }
  });

  it('round-trips every day from 0001-01-01 to 9999-12-31 with consecutive numbers', () => {
    let n = toDayNumber({ year: 1, month: 1, day: 1 });
    const last = toDayNumber({ year: 9999, month: 12, day: 31 });
    let previous = formatIsoDate(fromDayNumber(n));
    expect(previous).toBe('0001-01-01');
    const problems: string[] = [];
    for (n = n + 1; n <= last && problems.length < 5; n++) {
      const date = fromDayNumber(n);
      const iso = formatIsoDate(date);
      if (!(iso > previous) || parseIsoDate(iso) === null || toDayNumber(date) !== n) problems.push(`${n}: ${iso}`);
      previous = iso;
    }
    expect(problems).toEqual([]);
    expect(previous).toBe('9999-12-31');
  });
});

describe('dayOfWeek', () => {
  it.each([
    ['1970-01-01', 4],
    ['2026-03-03', 2],
    ['2026-02-01', 0],
    ['2026-08-01', 6],
    ['2000-02-29', 2],
    ['0001-01-01', 1],
    ['9999-12-31', 5],
  ] as const)('%s is weekday %i', (date, weekday) => {
    expect(dayOfWeek(date)).toBe(weekday);
  });
  it('throws on an invalid date (internal misuse)', () => {
    expect(() => dayOfWeek('2026-02-30')).toThrow(RangeError);
  });
});

describe('addDays / addMonths', () => {
  it('crosses months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-03', 7)).toBe('2026-03-10');
    expect(addDays('2026-03-03', -7)).toBe('2026-02-24');
  });
  it('returns null outside 0001-01-01..9999-12-31, or for an invalid date', () => {
    expect(addDays('0001-01-01', -1)).toBeNull();
    expect(addDays('9999-12-31', 1)).toBeNull();
    expect(addDays('0001-01-01', 0)).toBe('0001-01-01');
    expect(addDays('nope', 1)).toBeNull();
  });
  it('clamps to the last valid day of the target month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-05-31', 1)).toBe('2026-06-30');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', -12)).toBe('2023-02-28');
    expect(addMonths('2024-02-29', 48)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
  it('addMonths returns null outside the supported years', () => {
    expect(addMonths('0001-01-15', -1)).toBeNull();
    expect(addMonths('9999-12-15', 1)).toBeNull();
    expect(addMonths('9999-01-15', 11)).toBe('9999-12-15');
    expect(addMonths('bad', 1)).toBeNull();
  });
  it('addMonthsToMonth', () => {
    expect(addMonthsToMonth('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToMonth('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToMonth('0001-01', -1)).toBeNull();
    expect(addMonthsToMonth('9999-12', 1)).toBeNull();
    expect(addMonthsToMonth('bad', 1)).toBeNull();
  });
});

describe('month helpers', () => {
  it('lastDayOfMonth and dayInMonth clamp to the month length', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2100-02')).toBe('2100-02-28');
    expect(dayInMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dayInMonth('2026-04', 31)).toBe('2026-04-30');
    expect(dayInMonth('2026-03', 0)).toBe('2026-03-01');
    expect(dayInMonth('2026-03', 15)).toBe('2026-03-15');
  });
  it('start/end of week per weekStartsOn, across months', () => {
    // 2026-03-03 is a Tuesday.
    expect(startOfWeek('2026-03-03', 1)).toBe('2026-03-02');
    expect(endOfWeek('2026-03-03', 1)).toBe('2026-03-08');
    expect(startOfWeek('2026-03-03', 0)).toBe('2026-03-01');
    expect(endOfWeek('2026-03-03', 0)).toBe('2026-03-07');
    expect(startOfWeek('2026-03-03', 6)).toBe('2026-02-28');
    expect(endOfWeek('2026-03-03', 6)).toBe('2026-03-06');
    expect(startOfWeek('2026-03-02', 1)).toBe('2026-03-02');
    expect(endOfWeek('2026-03-08', 1)).toBe('2026-03-08');
    expect(startOfWeek('0001-01-01', 0)).toBeNull();
  });
});

describe('getMonthGrid', () => {
  const flat = (month: string, start: Weekday) => getMonthGrid(month, start).flat();

  it('always 6 rows of 7, every day of the month exactly once and in order', () => {
    for (let year = 2023; year <= 2028; year++) {
      for (let month = 1; month <= 12; month++) {
        for (const start of [0, 1, 6] as Weekday[]) {
          const m = `${year}-${String(month).padStart(2, '0')}`;
          const grid = getMonthGrid(m, start);
          expect(grid).toHaveLength(6);
          for (const row of grid) expect(row).toHaveLength(7);
          const days = grid.flat().filter((d): d is string => d !== null);
          expect(days).toHaveLength(daysInMonth(year, month));
          expect(days).toEqual([...days].sort());
          expect(new Set(days).size).toBe(days.length);
          expect(days[0]).toBe(`${m}-01`);
          // Each day sits in the column of its weekday.
          grid.forEach((row) =>
            row.forEach((d, c) => {
              if (d) expect(dayOfWeek(d)).toBe((start + c) % 7);
            }),
          );
        }
      }
    }
  });

  it('February 2026 with Sunday first is exactly 4 full rows + 2 empty', () => {
    const grid = getMonthGrid('2026-02', 0);
    expect(grid[0]?.[0]).toBe('2026-02-01');
    expect(grid[3]?.[6]).toBe('2026-02-28');
    expect(grid[4]?.every((d) => d === null)).toBe(true);
    expect(grid[5]?.every((d) => d === null)).toBe(true);
  });

  it('a 6-week month fills the 6th row (August 2026, Monday first)', () => {
    const grid = getMonthGrid('2026-08', 1);
    expect(grid[0]?.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(grid[0]?.[5]).toBe('2026-08-01');
    expect(grid[5]?.[0]).toBe('2026-08-31');
  });

  it('works at the ends of the supported range', () => {
    expect(flat('0001-01', 0).filter(Boolean)).toHaveLength(31);
    expect(flat('9999-12', 0).filter(Boolean).at(-1)).toBe('9999-12-31');
  });
});

describe('limits', () => {
  const weekend = (d: string) => [0, 6].includes(dayOfWeek(d));

  it('isDateSelectable: inclusive min/max, isDateDisabled, min > max = nothing', () => {
    const limits = { min: '2026-03-05', max: '2026-03-20', isDateDisabled: weekend };
    expect(isDateSelectable('2026-03-05', limits)).toBe(true);
    expect(isDateSelectable('2026-03-20', limits)).toBe(true);
    expect(isDateSelectable('2026-03-04', limits)).toBe(false);
    expect(isDateSelectable('2026-03-21', limits)).toBe(false);
    expect(isDateSelectable('2026-03-07', limits)).toBe(false); // Saturday
    expect(isDateSelectable('2026-03-09', limits)).toBe(true);
    expect(isDateSelectable('2026-03-10', {})).toBe(true);
    const conflict = { min: '2026-03-20', max: '2026-03-05' };
    expect(limitsConflict(conflict)).toBe(true);
    expect(limitsConflict({ min: '2026-03-05', max: '2026-03-05' })).toBe(false);
    expect(isDateSelectable('2026-03-10', conflict)).toBe(false);
    expect(isDateSelectable('2026-03-20', conflict)).toBe(false);
  });

  it('isMonthNavigable: at least one day within min/max', () => {
    const limits = { min: '2026-03-31', max: '2026-05-01' };
    expect(isMonthNavigable('2026-02', limits)).toBe(false);
    expect(isMonthNavigable('2026-03', limits)).toBe(true);
    expect(isMonthNavigable('2026-04', limits)).toBe(true);
    expect(isMonthNavigable('2026-05', limits)).toBe(true);
    expect(isMonthNavigable('2026-06', limits)).toBe(false);
    expect(isMonthNavigable('2026-06', {})).toBe(true);
    expect(isMonthNavigable('2026-06', { min: '2026-09-01', max: '2026-01-01' })).toBe(true);
    expect(isMonthNavigable('bad', {})).toBe(false);
  });

  it('clampMonth', () => {
    expect(clampMonth('2026-01', { min: '2026-03-15' })).toBe('2026-03');
    expect(clampMonth('2026-12', { max: '2026-03-15' })).toBe('2026-03');
    expect(clampMonth('2026-05', { min: '2026-03-15', max: '2026-08-01' })).toBe('2026-05');
    expect(clampMonth('2026-01', { min: '2026-09-01', max: '2026-03-01' })).toBe('2026-01');
  });
});

describe('getFocusableDate', () => {
  it('selected, else today, else first selectable, else first day', () => {
    expect(getFocusableDate('2026-03', { selected: '2026-03-17', today: '2026-03-10', limits: {} })).toBe('2026-03-17');
    expect(getFocusableDate('2026-03', { selected: '2026-04-17', today: '2026-03-10', limits: {} })).toBe('2026-03-10');
    expect(getFocusableDate('2026-03', { selected: null, today: '2026-04-10', limits: {} })).toBe('2026-03-01');
    expect(getFocusableDate('2026-03', { today: '2026-04-10', limits: { min: '2026-03-12' } })).toBe('2026-03-12');
    expect(
      getFocusableDate('2026-03', { limits: { isDateDisabled: (d) => d < '2026-03-04' } }),
    ).toBe('2026-03-04');
    // Nothing selectable: still a tab stop.
    expect(getFocusableDate('2026-03', { limits: { isDateDisabled: () => true } })).toBe('2026-03-01');
    // A selected or today outside limits is still the tab stop (focus is not selection).
    expect(getFocusableDate('2026-03', { today: '2026-03-10', limits: { min: '2026-03-20' } })).toBe('2026-03-10');
  });
});

describe('getKeyboardTarget', () => {
  const opts = { weekStartsOn: 1 as Weekday };
  it('arrows, Home/End, PageUp/PageDown, Shift = year', () => {
    expect(getKeyboardTarget('2026-03-03', 'ArrowLeft', opts)).toBe('2026-03-02');
    expect(getKeyboardTarget('2026-03-03', 'ArrowRight', opts)).toBe('2026-03-04');
    expect(getKeyboardTarget('2026-03-03', 'ArrowUp', opts)).toBe('2026-02-24');
    expect(getKeyboardTarget('2026-03-03', 'ArrowDown', opts)).toBe('2026-03-10');
    expect(getKeyboardTarget('2026-03-03', 'Home', opts)).toBe('2026-03-02');
    expect(getKeyboardTarget('2026-03-03', 'End', opts)).toBe('2026-03-08');
    expect(getKeyboardTarget('2026-03-03', 'Home', { weekStartsOn: 0 })).toBe('2026-03-01');
    expect(getKeyboardTarget('2026-03-03', 'End', { weekStartsOn: 0 })).toBe('2026-03-07');
    expect(getKeyboardTarget('2026-01-31', 'PageDown', opts)).toBe('2026-02-28');
    expect(getKeyboardTarget('2026-03-31', 'PageUp', opts)).toBe('2026-02-28');
    expect(getKeyboardTarget('2024-02-29', 'PageDown', { ...opts, shift: true })).toBe('2025-02-28');
    expect(getKeyboardTarget('2024-02-29', 'PageUp', { ...opts, shift: true })).toBe('2023-02-28');
    expect(getKeyboardTarget('2026-03-03', 'PageUp', { ...opts, shift: true })).toBe('2025-03-03');
  });
  it('RTL swaps left and right only', () => {
    const rtl = { ...opts, rtl: true };
    expect(getKeyboardTarget('2026-03-03', 'ArrowLeft', rtl)).toBe('2026-03-04');
    expect(getKeyboardTarget('2026-03-03', 'ArrowRight', rtl)).toBe('2026-03-02');
    expect(getKeyboardTarget('2026-03-03', 'ArrowDown', rtl)).toBe('2026-03-10');
    expect(getKeyboardTarget('2026-03-03', 'Home', rtl)).toBe('2026-03-02');
  });
  it('null past the supported range', () => {
    expect(getKeyboardTarget('0001-01-01', 'ArrowLeft', opts)).toBeNull();
    expect(getKeyboardTarget('9999-12-31', 'ArrowRight', opts)).toBeNull();
    expect(getKeyboardTarget('9999-12-31', 'PageDown', opts)).toBeNull();
    expect(getKeyboardTarget('9999-03-01', 'PageDown', { ...opts, shift: true })).toBeNull();
  });
  it('isGridNavigationKey', () => {
    expect(['ArrowLeft', 'Home', 'PageDown'].every(isGridNavigationKey)).toBe(true);
    expect(['Enter', ' ', 'Tab', 'a'].some(isGridNavigationKey)).toBe(false);
  });
});

describe('localToday', () => {
  it('reads the local wall-clock date', () => {
    expect(localToday(new Date(2026, 2, 3, 23, 59))).toBe('2026-03-03');
    expect(localToday(new Date(2026, 2, 4, 0, 0))).toBe('2026-03-04');
  });
});
