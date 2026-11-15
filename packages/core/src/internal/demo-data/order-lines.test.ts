// @vitest-environment node
import { dayOfYear, discountMinor, documentNumber, lineTotalMinor } from './order-lines';

describe('discountMinor (half-up, in minor units)', () => {
  it.each([
    // [gross, percent, expected discount]
    [100, 10, 10],
    [10, 5, 1], // 0.5 rounds up to 1
    [30, 5, 2], // 1.5 rounds up to 2
    [50, 5, 3], // 2.5 rounds up to 3 (half-even would give 2)
    [90, 5, 5], // 4.5 rounds up to 5 (half-even would give 4)
    [9, 5, 0], // 0.45 rounds down
    [11, 5, 1], // 0.55 rounds up
    [3, 10, 0], // 0.3
    [7, 10, 1], // 0.7
    [1, 50, 1], // 0.5
    [12345, 0, 0],
    [0, 30, 0],
    [200, 100, 200],
  ])('discount on %i at %i%% is %i', (gross, percent, expected) => {
    expect(discountMinor(gross, percent)).toBe(expected);
  });

  it('is exact for amounts beyond 2^31 (a large yen order)', () => {
    expect(discountMinor(8_000_000 * 100, 30)).toBe(240_000_000);
  });
});

describe('lineTotalMinor', () => {
  it('multiplies, then subtracts the half-up discount', () => {
    expect(lineTotalMinor(3, 1000, 0)).toBe(3000);
    expect(lineTotalMinor(3, 1000, 10)).toBe(2700);
    expect(lineTotalMinor(1, 10, 5)).toBe(9);
    expect(lineTotalMinor(1, 50, 5)).toBe(47);
  });

  it('never reaches zero for the smallest price and the largest discount', () => {
    expect(lineTotalMinor(1, 5, 30)).toBeGreaterThan(0);
  });
});

describe('dayOfYear / documentNumber', () => {
  it.each([
    ['2026-01-01', 1],
    ['2026-02-28', 59],
    ['2026-03-01', 60],
    ['2028-02-29', 60],
    ['2028-03-01', 61],
    ['2026-12-31', 365],
    ['2028-12-31', 366],
    ['2100-03-01', 60], // 2100 is not a leap year
    ['2400-03-01', 61], // 2400 is
  ])('day of the year of %s is %i', (iso, expected) => {
    expect(dayOfYear(iso)).toBe(expected);
  });

  it('numbers are prefix-year-day(3 digits)row(6 digits), and sort as text by date then row', () => {
    expect(documentNumber('INV', '2026-01-05', 0)).toBe('INV-2026-005000001');
    expect(documentNumber('SO', '2026-10-15', 99_999)).toBe('SO-2026-288100000');
    expect(documentNumber('PO', '2028-12-31', 12)).toBe('PO-2028-366000013');
    const numbers = [
      documentNumber('SO', '2026-03-01', 7),
      documentNumber('SO', '2026-03-01', 2),
      documentNumber('SO', '2026-02-28', 50_000),
      documentNumber('SO', '2025-12-31', 90_000),
    ];
    expect([...numbers].sort()).toEqual([numbers[3], numbers[2], numbers[1], numbers[0]]);
  });
});
