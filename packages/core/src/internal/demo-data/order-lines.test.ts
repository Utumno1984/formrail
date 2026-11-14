// @vitest-environment node
import { discountMinor, lineTotalMinor } from './order-lines';

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
