import { describe, expect, it } from 'vitest';
import { CONTENTS_MAX, formatChangeValue, formatChangeValueAt } from './format-change-value';

const NOON = new Date('2026-03-05T12:00:00Z');
const base = { locale: 'en-US', timeZone: 'UTC' };

describe('formatChangeValue', () => {
  it('renders booleans as Yes / No, never true / false, with overridable labels', () => {
    expect(formatChangeValue(true)).toBe('Yes');
    expect(formatChangeValue(false)).toBe('No');
    expect(formatChangeValue(true, { labels: { yes: 'Si' } })).toBe('Si');
    expect(formatChangeValue(false, { labels: { no: 'Nope' } })).toBe('Nope');
  });

  it('renders dates with dateStyle medium in the given locale and time zone', () => {
    expect(formatChangeValue(NOON, base)).toBe('Mar 5, 2026');
    expect(formatChangeValue(NOON, { locale: 'de-DE', timeZone: 'UTC' })).toBe('05.03.2026');
    expect(formatChangeValue(NOON, { locale: 'en-GB', timeZone: 'UTC' })).toBe('5 Mar 2026');
  });

  it('respects the time zone near midnight', () => {
    const late = new Date('2026-03-05T23:30:00Z');
    expect(formatChangeValue(late, base)).toBe('Mar 5, 2026');
    expect(formatChangeValue(late, { locale: 'en-US', timeZone: 'Europe/Rome' })).toBe('Mar 6, 2026');
    expect(formatChangeValue(late, { locale: 'en-US', timeZone: 'America/New_York' })).toBe('Mar 5, 2026');
  });

  it('renders an invalid date as Invalid date and never as Date.prototype.toString()', () => {
    const text = formatChangeValue(new Date('nope'), base);
    expect(text).toBe('Invalid date');
    expect(formatChangeValue(NOON, base)).not.toMatch(/GMT|\w{3} \w{3} \d{2} \d{4}/);
    expect(formatChangeValue(new Date('nope'), { labels: { invalidDate: 'Bad date' } })).toBe('Bad date');
  });

  it('renders numbers with Intl.NumberFormat and survives NaN / Infinity', () => {
    expect(formatChangeValue(1234.5, base)).toBe('1,234.5');
    expect(formatChangeValue(1234.5, { locale: 'de-DE' })).toBe('1.234,5');
    expect(formatChangeValue(NaN, base)).toBe('NaN');
    expect(formatChangeValue(Infinity, base)).toBe('∞');
    expect(formatChangeValue(-Infinity, base)).toBe('-∞');
    expect(formatChangeValue(10n, base)).toBe('10');
    expect(formatChangeValue(0, base)).toBe('0');
  });

  it('keeps strings as they are and tells apart empty, no value, false and zero', () => {
    expect(formatChangeValue('a\n  b')).toBe('a\n  b');
    const four = [formatChangeValue(''), formatChangeValue(null), formatChangeValue(false), formatChangeValue(0)];
    expect(four).toEqual(['Empty', 'No value', 'No', '0']);
    expect(new Set(four).size).toBe(4);
    expect(formatChangeValue(undefined)).toBe('No value');
    expect(formatChangeValue('', { labels: { empty: 'Blank' } })).toBe('Blank');
    expect(formatChangeValue(null, { labels: { noValue: 'None' } })).toBe('None');
  });

  it('summarizes arrays', () => {
    expect(formatChangeValue([])).toBe('No items');
    expect(formatChangeValue([1])).toBe('1 item');
    expect(formatChangeValue([1, 2, 3])).toBe('3 items');
    expect(formatChangeValue([1, 2], { labels: { items: (n) => `${n} righe` } })).toBe('2 righe');
  });

  it('renders a plain object as a compact Label: value list with inferred labels', () => {
    const row = { id: 3, description: 'Cable', unitPrice: 5, paid: false, due: NOON, note: null, taxes: [1, 2], meta: { a: 1 } };
    expect(formatChangeValue(row, base)).toBe(
      'Id: 3, Description: Cable, Unit Price: 5, Paid: No, Due: Mar 5, 2026, Taxes: 2 items, Meta: …',
    );
    expect(formatChangeValue({}, base)).toBe('Empty');
    expect(formatChangeValue({ a: undefined }, base)).toBe('Empty');
    expect(formatChangeValue(Object.create(null) as object, base)).toBe('Empty');
  });

  it('does not loop on a circular object', () => {
    const a: Record<string, unknown> = { name: 'loop' };
    a.self = a;
    expect(formatChangeValue(a)).toBe('Name: loop, Self: …');
  });

  it('uses a fixed fallback for Map, Set, instances, functions and symbols, never [object ...]', () => {
    class Thing {
      x = 1;
    }
    for (const v of [new Map(), new Set(), new Thing(), () => 1, Symbol('s'), /x/]) {
      const text = formatChangeValue(v);
      expect(text).toBe('Unsupported value');
      expect(text).not.toContain('[object');
    }
  });

  it('does not throw on a throwing getter', () => {
    const o = {
      get boom(): number {
        throw new Error('x');
      },
    };
    expect(formatChangeValue(o)).toBe('Unsupported value');
  });

  it('falls back to the runtime defaults for an invalid locale or time zone', () => {
    expect(() => formatChangeValue(NOON, { locale: 'xx-invalid' })).not.toThrow();
    expect(() => formatChangeValue(NOON, { locale: 'not a locale!!' })).not.toThrow();
    expect(() => formatChangeValue(NOON, { timeZone: 'Mars/Olympus' })).not.toThrow();
    expect(() => formatChangeValue(12.5, { locale: 'not a locale!!' })).not.toThrow();
    expect(formatChangeValue(NOON, { locale: 'en-US', timeZone: 'Mars/Olympus' })).toMatch(/2026/);
    expect(formatChangeValue(NOON, { locale: 'zz-@@', timeZone: 'UTC' })).toMatch(/2026/);
  });

  describe('precise', () => {
    it('shows the time of day, String(number), quoted strings', () => {
      expect(formatChangeValue(NOON, { ...base, precise: true })).toBe('Mar 5, 2026, 12:00:00 PM');
      expect(formatChangeValue(10.0001, { ...base, precise: true })).toBe('10.0001');
      expect(formatChangeValue(10, { ...base, precise: true })).toBe('10');
      expect(formatChangeValue('abc ', { precise: true })).toBe('"abc "');
      expect(formatChangeValue('5', { precise: true })).toBe('"5"');
      expect(formatChangeValue('', { precise: true })).toBe('""');
    });

    it('gives null and undefined their own texts, also through labels; the compact text stays', () => {
      expect(formatChangeValue(null, { precise: true })).toBe('Null');
      expect(formatChangeValue(undefined, { precise: true })).toBe('Undefined');
      expect(formatChangeValueAt(null, base, 2)).toBe('Null');
      expect(formatChangeValueAt(undefined, base, 2)).toBe('Undefined');
      expect(formatChangeValueAt(undefined, base, 3)).toBe('Undefined');
      const labels = { noValue: 'None', nullValue: 'Nil', undefinedValue: 'Unset' };
      expect(formatChangeValue(null, { labels, precise: true })).toBe('Nil');
      expect(formatChangeValue(undefined, { labels, precise: true })).toBe('Unset');
      expect(formatChangeValueAt(null, { labels }, 0)).toBe('None');
      expect(formatChangeValueAt(undefined, { labels }, 0)).toBe('None');
    });

    it('level 2 renders dates as ISO 8601', () => {
      expect(formatChangeValueAt(new Date('2026-03-05T12:00:00.250Z'), base, 2)).toBe('2026-03-05T12:00:00.250Z');
      expect(formatChangeValueAt(new Date('nope'), base, 2)).toBe('Invalid date');
    });

    it('tells a bigint from a number of the same value (10n against 10)', () => {
      expect(formatChangeValue(10n, { ...base, precise: true })).toBe('10n');
      expect(formatChangeValue(10, { ...base, precise: true })).toBe('10');
      expect(formatChangeValueAt(10n, base, 2)).not.toBe(formatChangeValueAt(10, base, 2));
      expect(formatChangeValue(10n, base)).toBe('10'); // the default rendering stays plain
    });
  });

  describe('level 3 (contents)', () => {
    it('writes out arrays, nested objects, Map and Set with precise leaves', () => {
      expect(formatChangeValueAt(['a', 'b'], base, 3)).toBe('["a", "b"]');
      expect(formatChangeValueAt({ a: { x: 1 } }, base, 3)).toBe('{a: {x: 1}}');
      expect(formatChangeValueAt(new Map([['k', 1]]), base, 3)).toBe('Map {"k" => 1}');
      expect(formatChangeValueAt(new Set([1, 2n]), base, 3)).toBe('Set {1, 2n}');
      expect(formatChangeValueAt([NOON, null, true], base, 3)).toBe('[2026-03-05T12:00:00.000Z, Null, Yes]');
    });

    it('stops at cycles and deep nesting, truncates long contents', () => {
      const loop: unknown[] = [1];
      loop.push(loop);
      expect(formatChangeValueAt(loop, base, 3)).toBe('[1, …]');
      expect(formatChangeValueAt([[[[['deep']]]]], base, 3)).toBe('[[[[…]]]]');
      const long = formatChangeValueAt(Array.from({ length: 100 }, (_, i) => i), base, 3);
      expect(long).toHaveLength(CONTENTS_MAX);
      expect(long.endsWith('…')).toBe(true);
    });

    it('keeps the fallback text for class instances', () => {
      class Money {
        constructor(public cents: number) {}
      }
      expect(formatChangeValueAt(new Money(1), base, 3)).toBe('Unsupported value');
      expect(formatChangeValueAt([new Money(1)], base, 3)).toBe('[Unsupported value]');
    });
  });

  describe('never throws', () => {
    const revoked = () => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      return proxy;
    };
    const throwingProto = () =>
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('trap');
          },
        },
      );

    it.each([0, 1, 2, 3] as const)('on a revoked Proxy and a throwing getPrototypeOf trap (level %s)', (level) => {
      expect(formatChangeValueAt(revoked(), base, level)).toBe('Unsupported value');
      expect(formatChangeValueAt(throwingProto(), base, level)).toBe('Unsupported value');
      expect(formatChangeValueAt({ a: revoked() }, base, level)).toEqual(expect.any(String));
    });

    it('on a revoked Proxy through the public formatChangeValue', () => {
      expect(() => formatChangeValue(revoked())).not.toThrow();
      expect(() => formatChangeValue(throwingProto(), { precise: true })).not.toThrow();
    });
  });
});
