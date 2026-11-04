import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCalendarFormatters, getWeekStartsOn, resolveLocale, toUtcDate, weekStartForRegion } from './locale';

type Proto = { getWeekInfo?: unknown; weekInfo?: unknown };
const proto = Intl.Locale.prototype as unknown as Proto;

/** Removes the engine's week info for the duration of a test (engines without it). */
function withoutWeekInfo() {
  const saved = {
    getWeekInfo: Object.getOwnPropertyDescriptor(proto, 'getWeekInfo'),
    weekInfo: Object.getOwnPropertyDescriptor(proto, 'weekInfo'),
  };
  Object.defineProperty(proto, 'getWeekInfo', { value: undefined, configurable: true, writable: true });
  Object.defineProperty(proto, 'weekInfo', { get: () => undefined, configurable: true });
  return () => {
    for (const key of ['getWeekInfo', 'weekInfo'] as const) {
      const d = saved[key];
      if (d) Object.defineProperty(proto, key, d);
      else delete proto[key];
    }
  };
}

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.restoreAllMocks();
});

describe('resolveLocale', () => {
  it('keeps a valid tag, undefined stays undefined (runtime default)', () => {
    expect(resolveLocale('it-IT')).toBe('it-IT');
    expect(resolveLocale(undefined)).toBeUndefined();
  });
  it('an invalid tag degrades to the runtime default, no exception', () => {
    expect(resolveLocale('en_US')).toBeUndefined();
    expect(resolveLocale('')).toBeUndefined();
    expect(resolveLocale('!!')).toBeUndefined();
    expect(() => createCalendarFormatters(resolveLocale('!!'))).not.toThrow();
  });
});

describe('getWeekStartsOn', () => {
  it('with the engine week info: it-IT Monday, en-US Sunday, ar-EG Saturday', () => {
    // Node/V8 has getWeekInfo; the table below gives the same answers when it does not.
    expect(getWeekStartsOn('it-IT')).toBe(1);
    expect(getWeekStartsOn('en-US')).toBe(0);
    expect(getWeekStartsOn('ar-EG')).toBe(6);
  });

  it('uses getWeekInfo() first when present (firstDay 1..7, 7 = Sunday)', () => {
    restore = withoutWeekInfo();
    Object.defineProperty(proto, 'getWeekInfo', { value: () => ({ firstDay: 3 }), configurable: true, writable: true });
    expect(getWeekStartsOn('en-US')).toBe(3);
    Object.defineProperty(proto, 'getWeekInfo', { value: () => ({ firstDay: 7 }), configurable: true, writable: true });
    expect(getWeekStartsOn('it-IT')).toBe(0);
  });

  it('then the older weekInfo accessor', () => {
    restore = withoutWeekInfo();
    Object.defineProperty(proto, 'weekInfo', { get: () => ({ firstDay: 5 }), configurable: true });
    expect(getWeekStartsOn('it-IT')).toBe(5);
  });

  it('a broken week info falls through to the region table', () => {
    restore = withoutWeekInfo();
    Object.defineProperty(proto, 'getWeekInfo', {
      value: () => {
        throw new Error('boom');
      },
      configurable: true,
      writable: true,
    });
    expect(getWeekStartsOn('en-US')).toBe(0);
    Object.defineProperty(proto, 'getWeekInfo', { value: () => ({ firstDay: 0 }), configurable: true, writable: true });
    expect(getWeekStartsOn('ar-EG')).toBe(6);
  });

  it('without week info: CLDR region table on the maximized locale, then Monday', () => {
    restore = withoutWeekInfo();
    expect(getWeekStartsOn('it-IT')).toBe(1);
    expect(getWeekStartsOn('en-US')).toBe(0);
    expect(getWeekStartsOn('ar-EG')).toBe(6);
    expect(getWeekStartsOn('ja-JP')).toBe(0);
    expect(getWeekStartsOn('pt-BR')).toBe(0);
    expect(getWeekStartsOn('en-CA')).toBe(0);
    expect(getWeekStartsOn('en-GB')).toBe(1);
    expect(getWeekStartsOn('de-DE')).toBe(1);
    expect(getWeekStartsOn('dv-MV')).toBe(5);
    // No region: maximize() supplies the likely one.
    expect(getWeekStartsOn('ja')).toBe(0);
    expect(getWeekStartsOn('en')).toBe(0);
    expect(getWeekStartsOn('it')).toBe(1);
    // Invalid: runtime default locale, never an exception.
    expect(() => getWeekStartsOn('!!')).not.toThrow();
  });

  it('weekStartForRegion', () => {
    expect(weekStartForRegion('US')).toBe(0);
    expect(weekStartForRegion('EG')).toBe(6);
    expect(weekStartForRegion('MV')).toBe(5);
    expect(weekStartForRegion('IT')).toBe(1);
    expect(weekStartForRegion(undefined)).toBe(1);
    expect(weekStartForRegion('419')).toBe(1);
    // Whole codes only: "GA" is not found across "AG AS".
    expect(weekStartForRegion('GA')).toBe(1);
    expect(weekStartForRegion('S ')).toBe(1);
  });
});

describe('createCalendarFormatters', () => {
  it('en-US texts', () => {
    const f = createCalendarFormatters('en-US');
    expect(f.month('2026-03')).toBe('March 2026');
    expect(f.fullDate('2026-03-03')).toBe('Tuesday, March 3, 2026');
    expect(f.weekdayShort(0)).toBe('Sun');
    expect(f.weekdayLong(1)).toBe('Monday');
    expect(f.day('2026-03-03')).toBe('3');
  });
  it('it-IT texts', () => {
    const f = createCalendarFormatters('it-IT');
    expect(f.month('2026-03')).toBe('marzo 2026');
    expect(f.weekdayLong(1)).toBe('lunedì');
    expect(f.fullDate('2026-03-03')).toBe('martedì 3 marzo 2026');
  });
  it('column headers fall back to narrow names when a short name is longer than 4 characters (ar-EG)', () => {
    const ar = createCalendarFormatters('ar-EG');
    const short = new Intl.DateTimeFormat('ar-EG', { weekday: 'short', timeZone: 'UTC' }).format(toUtcDate('2023-01-04'));
    const narrow = new Intl.DateTimeFormat('ar-EG', { weekday: 'narrow', timeZone: 'UTC' }).format(toUtcDate('2023-01-04'));
    expect(Array.from(short).length).toBeGreaterThan(4);
    expect(ar.weekdayShort(3)).toBe(narrow);
    // The accessible (long) name is unaffected.
    expect(ar.weekdayLong(3)).toBe(new Intl.DateTimeFormat('ar-EG', { weekday: 'long', timeZone: 'UTC' }).format(toUtcDate('2023-01-04')));
    // Locales whose short names fit keep them, for all 7 days.
    const de = createCalendarFormatters('de-DE');
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => de.weekdayShort(n as 0))).toEqual(['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']);
  });

  it('far years format as themselves (no 1900+ mapping of years 0-99), with 4 digits below 1000', () => {
    const f = createCalendarFormatters('en-US');
    expect(f.fullDate('0001-01-01')).toBe('Monday, January 1, 0001');
    expect(f.fullDate('0099-12-31')).toMatch(/^\w+, December 31, 0099$/);
    expect(f.fullDate('0999-06-15')).toMatch(/June 15, 0999$/);
    expect(f.month('0001-01')).toBe('January 0001');
    expect(f.fullDate('1000-01-01')).toMatch(/January 1, 1000$/);
    expect(f.fullDate('9999-12-31')).toBe('Friday, December 31, 9999');
    // Non-ASCII digits are left to the locale.
    expect(createCalendarFormatters('ar-EG').month('0001-01')).not.toMatch(/[0-9]/);
    expect(toUtcDate('0050-06-15').getUTCFullYear()).toBe(50);
  });
  it('toUtcDate rejects an invalid date', () => {
    expect(() => toUtcDate('2026-02-30')).toThrow(RangeError);
  });
});
