import { describe, expect, it } from 'vitest';
import { parseDisabledDates } from './disabled-dates';

const LIST = ['2026-05-01', '2026-06-15', '2026-06-18|2026-07-01'];

describe('parseDisabledDates', () => {
  const isDisabled = parseDisabledDates(LIST);

  it('disables a listed single date and only that one', () => {
    expect(isDisabled('2026-05-01')).toBe(true);
    expect(isDisabled('2026-06-15')).toBe(true);
    expect(isDisabled('2026-05-02')).toBe(false);
    expect(isDisabled('2026-06-14')).toBe(false);
    expect(isDisabled('2026-06-16')).toBe(false);
  });

  it('disables dates inside a range, including across a month boundary', () => {
    expect(isDisabled('2026-06-20')).toBe(true);
    expect(isDisabled('2026-06-30')).toBe(true);
  });

  it('includes both ends of a range and excludes the day before and after', () => {
    expect(isDisabled('2026-06-18')).toBe(true);
    expect(isDisabled('2026-07-01')).toBe(true);
    expect(isDisabled('2026-06-17')).toBe(false);
    expect(isDisabled('2026-07-02')).toBe(false);
  });

  it('supports a one-day range', () => {
    const one = parseDisabledDates(['2026-06-10|2026-06-10']);
    expect(one('2026-06-10')).toBe(true);
    expect(one('2026-06-09')).toBe(false);
    expect(one('2026-06-11')).toBe(false);
  });

  it('disables nothing for an empty list', () => {
    expect(parseDisabledDates([])('2026-06-15')).toBe(false);
  });

  it('throws on malformed entries and reversed ranges', () => {
    expect(() => parseDisabledDates(['2026-6-1'])).toThrow(/invalid entry/);
    expect(() => parseDisabledDates(['2026-02-30'])).toThrow(/invalid entry/);
    expect(() => parseDisabledDates(['2026-06-01|'])).toThrow(/invalid entry/);
    expect(() => parseDisabledDates(['2026-06-01|2026-06-02|2026-06-03'])).toThrow(/invalid entry/);
    expect(() => parseDisabledDates(['2026-06-10|2026-06-01'])).toThrow(/reversed range/);
  });
});
