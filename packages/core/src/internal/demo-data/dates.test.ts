// @vitest-environment node
import { addDays, daysAgo, daysBetween, DEMO_TODAY, isoToDayNumber, parseIsoDate } from './dates';

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000;

describe('demo dates', () => {
  it('DEMO_TODAY is a fixed, existing ISO date', () => {
    expect(DEMO_TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => parseIsoDate(DEMO_TODAY)).not.toThrow();
    expect(daysAgo(0)).toBe(DEMO_TODAY);
    expect(daysAgo(1)).toBe(addDays(DEMO_TODAY, -1));
    expect(daysAgo(-1)).toBe(addDays(DEMO_TODAY, 1));
  });

  it('crosses the EU daylight-saving changes of 2026 one calendar day at a time', () => {
    // Clocks go forward on 2026-03-29 and back on 2026-10-25: a 23 h or 25 h day must stay one day.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-03-30', -1)).toBe('2026-03-29');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
  });

  it('handles leap years (2024, 2028, 2000) and common ones (2026, 2100)', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('agrees with UTC calendar arithmetic over 30 years around DEMO_TODAY', () => {
    for (let offset = -6000; offset <= 5000; offset += 7) {
      const iso = addDays(DEMO_TODAY, offset);
      expect(isoToDayNumber(iso)).toBe(utc(iso));
      expect(new Date(utc(iso) * 86_400_000).toISOString().slice(0, 10)).toBe(iso);
    }
  });

  it('rejects malformed or non-existent dates', () => {
    for (const bad of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-3-29', '29/03/2026', '', '2026-03-29T00:00:00Z']) {
      expect(() => parseIsoDate(bad)).toThrow(RangeError);
    }
    // The 31st of every 30-day month (a dropped month in the table would let "Nov 31" through).
    for (const bad of ['2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31']) {
      expect(() => parseIsoDate(bad)).toThrow(RangeError);
    }
    expect(() => addDays(DEMO_TODAY, 1.5)).toThrow(RangeError);
    expect(() => daysAgo(Number.NaN)).toThrow(RangeError);
  });
});
