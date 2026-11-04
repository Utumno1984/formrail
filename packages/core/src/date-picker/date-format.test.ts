import { describe, expect, it } from 'vitest';
import { formatDateText, getDateTextFormat, parseDateText, type DateTextFormat } from './date-format';

const US = getDateTextFormat('en-US');
const IT = getDateTextFormat('it-IT');
const DE = getDateTextFormat('de-DE');
const JA = getDateTextFormat('ja-JP');

const date = (text: string, format: DateTextFormat) => parseDateText(text, format);

describe('getDateTextFormat', () => {
  it.each([
    ['en-US', ['month', 'day', 'year'], '/', 'MM/DD/YYYY'],
    ['it-IT', ['day', 'month', 'year'], '/', 'DD/MM/YYYY'],
    ['en-GB', ['day', 'month', 'year'], '/', 'DD/MM/YYYY'],
    ['de-DE', ['day', 'month', 'year'], '.', 'DD.MM.YYYY'],
    ['nl-NL', ['day', 'month', 'year'], '-', 'DD-MM-YYYY'],
    ['ja-JP', ['year', 'month', 'day'], '/', 'YYYY/MM/DD'],
    ['sv-SE', ['year', 'month', 'day'], '-', 'YYYY-MM-DD'],
  ] as const)('%s → %s', (locale, order, separator, pattern) => {
    const format = getDateTextFormat(locale);
    expect(format.order).toEqual(order);
    expect(format.separator).toBe(separator);
    expect(format.pattern).toBe(pattern);
  });

  it('a locale with another numbering system still gives a usable order and an ASCII-only separator', () => {
    for (const locale of ['ar-EG', 'he-IL', 'fa-IR', 'ko-KR', 'zh-CN', 'hu-HU']) {
      const format = getDateTextFormat(locale);
      expect([...format.order].sort()).toEqual(['day', 'month', 'year']);
      expect(format.separator).toMatch(/^[\s./\-,]+$/);
      // What it writes, it reads back.
      expect(parseDateText(formatDateText('2026-03-05', format), format)).toEqual({ kind: 'date', date: '2026-03-05' });
    }
  });

  it('the runtime default (undefined) and an invalid tag never throw', () => {
    expect(getDateTextFormat(undefined).order).toHaveLength(3);
  });
});

describe('formatDateText', () => {
  it('pads day and month, keeps a 4-digit year, follows the locale order', () => {
    expect(formatDateText('2026-03-05', US)).toBe('03/05/2026');
    expect(formatDateText('2026-03-05', IT)).toBe('05/03/2026');
    expect(formatDateText('2026-03-05', DE)).toBe('05.03.2026');
    expect(formatDateText('2026-03-05', JA)).toBe('2026/03/05');
    expect(formatDateText('0042-12-31', US)).toBe('12/31/0042');
  });
});

describe('parseDateText', () => {
  it('blank is empty', () => {
    expect(date('', US)).toEqual({ kind: 'empty' });
    expect(date('   ', IT)).toEqual({ kind: 'empty' });
  });

  it('reads the fields in the locale order', () => {
    expect(date('03/15/2026', US)).toEqual({ kind: 'date', date: '2026-03-15' });
    expect(date('15/03/2026', IT)).toEqual({ kind: 'date', date: '2026-03-15' });
    expect(date('15.03.2026', DE)).toEqual({ kind: 'date', date: '2026-03-15' });
    expect(date('2026/03/15', JA)).toEqual({ kind: 'date', date: '2026-03-15' });
    // The same text means different dates in different locales.
    expect(date('03/04/2026', US)).toEqual({ kind: 'date', date: '2026-03-04' });
    expect(date('03/04/2026', IT)).toEqual({ kind: 'date', date: '2026-04-03' });
  });

  it('accepts one-digit day/month, any punctuation separator, surrounding spaces', () => {
    expect(date('3/5/2026', US)).toEqual({ kind: 'date', date: '2026-03-05' });
    expect(date(' 5.3.2026 ', IT)).toEqual({ kind: 'date', date: '2026-03-05' });
    expect(date('5-3-2026', IT)).toEqual({ kind: 'date', date: '2026-03-05' });
    expect(date('5 3 2026', IT)).toEqual({ kind: 'date', date: '2026-03-05' });
    expect(date('15.03.2026.', DE)).toEqual({ kind: 'date', date: '2026-03-15' });
  });

  it('a pasted ISO date is accepted in every locale', () => {
    for (const format of [US, IT, DE, JA]) expect(date('2026-03-15', format)).toEqual({ kind: 'date', date: '2026-03-15' });
    expect(date('2026-02-30', IT)).toEqual({ kind: 'invalid' });
  });

  it.each([
    ['13/45/2026', 'month 13'],
    ['02/30/2026', 'a day that does not exist'],
    ['02/29/2100', 'not a leap year'],
    ['00/10/2026', 'month 0'],
    ['03/00/2026', 'day 0'],
    ['03/15/26', 'two-digit year'],
    ['03/15/02026', 'five-digit year'],
    ['03/15/0000', 'year 0'],
    ['003/15/2026', 'three-digit month'],
    ['03/015/2026', 'three-digit day'],
    ['March 15, 2026', 'month name'],
    ['03/15', 'two fields'],
    ['03/15/2026/1', 'four fields'],
    ['03152026', 'no separator'],
    ['abc', 'letters'],
    ['٠٣/١٥/٢٠٢٦', 'non-ASCII digits'],
  ])('%s is invalid (%s)', (text) => {
    expect(date(text, US)).toEqual({ kind: 'invalid' });
  });

  it('February 29 of a leap year is valid', () => {
    expect(date('02/29/2028', US)).toEqual({ kind: 'date', date: '2028-02-29' });
    expect(date('29/02/2000', IT)).toEqual({ kind: 'date', date: '2000-02-29' });
  });
});
